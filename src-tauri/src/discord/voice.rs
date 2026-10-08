use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message as WsMessage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceGatewayPayload {
    pub op: u8,
    #[serde(default)]
    pub d: serde_json::Value,
}

pub struct VoiceGatewayClient {
    cmd_tx: mpsc::Sender<VoiceGatewayCommand>,
    is_running: Arc<AtomicBool>,
}

pub enum VoiceGatewayCommand {
    SetSpeaking { speaking: bool, delay: u32 },
    Disconnect,
}

impl VoiceGatewayClient {
    pub fn start(
        endpoint: String,
        token: String,
        server_id: String,
        user_id: String,
        session_id: String,
        app_handle: AppHandle,
    ) -> Self {
        let (cmd_tx, cmd_rx) = mpsc::channel(32);
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = is_running.clone();

        tokio::spawn(async move {
            if let Err(e) = run_voice_loop(
                endpoint,
                token,
                server_id,
                user_id,
                session_id,
                app_handle,
                cmd_rx,
                is_running_clone,
            )
            .await
            {
                error!("Voice gateway loop ended: {:?}", e);
            }
        });

        Self { cmd_tx, is_running }
    }

    pub async fn stop(&self) {
        self.is_running.store(false, Ordering::Relaxed);
        let _ = self.cmd_tx.send(VoiceGatewayCommand::Disconnect).await;
    }
}

async fn run_voice_loop(
    endpoint: String,
    token: String,
    server_id: String,
    user_id: String,
    session_id: String,
    app_handle: AppHandle,
    mut cmd_rx: mpsc::Receiver<VoiceGatewayCommand>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    // Discord voice endpoint might contain port, e.g. "eu-central.discord.media:443"
    let clean_endpoint = endpoint.trim_end_matches(":443");
    let ws_url = format!("wss://{}/?v=8", clean_endpoint);
    info!("Connecting to Discord Voice Gateway at {}", ws_url);

    let (ws_stream, _) = connect_async(&ws_url).await?;
    let (ws_write, mut ws_read) = ws_stream.split();
    let ws_write = Arc::new(Mutex::new(ws_write));

    let (send_tx, mut send_rx) = mpsc::channel::<WsMessage>(32);

    // Sender task
    let ws_write_sender = ws_write.clone();
    let is_running_sender = is_running.clone();
    tokio::spawn(async move {
        while let Some(msg) = send_rx.recv().await {
            if !is_running_sender.load(Ordering::Relaxed) {
                break;
            }
            let mut write = ws_write_sender.lock().await;
            if let Err(e) = write.send(msg).await {
                error!("Voice gateway write error: {}", e);
                break;
            }
        }
    });

    let ssrc = Arc::new(Mutex::new(0u32));

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(VoiceGatewayCommand::Disconnect) => {
                        info!("Voice gateway disconnecting.");
                        is_running.store(false, Ordering::Relaxed);
                        break;
                    }
                    Some(VoiceGatewayCommand::SetSpeaking { speaking, delay }) => {
                        let cur_ssrc = *ssrc.lock().await;
                        let payload = json!({
                            "op": 5,
                            "d": {
                                "speaking": if speaking { 1 } else { 0 },
                                "delay": delay,
                                "ssrc": cur_ssrc
                            }
                        });
                        let _ = send_tx.send(WsMessage::Text(payload.to_string())).await;
                    }
                    None => break,
                }
            }
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(WsMessage::Text(text))) => {
                        if let Ok(payload) = serde_json::from_str::<VoiceGatewayPayload>(&text) {
                            match payload.op {
                                8 => {
                                    // HELLO
                                    if let Some(interval_ms) = payload.d.get("heartbeat_interval").and_then(|v| v.as_u64()) {
                                        info!("Voice Gateway HELLO: heartbeat interval = {}ms", interval_ms);
                                        let hb_tx = send_tx.clone();
                                        let hb_running = is_running.clone();

                                        tokio::spawn(async move {
                                            let mut interval = tokio::time::interval(Duration::from_millis(interval_ms));
                                            while hb_running.load(Ordering::Relaxed) {
                                                interval.tick().await;
                                                let hb = json!({
                                                    "op": 3,
                                                    "d": chrono::Utc::now().timestamp_millis()
                                                });
                                                if hb_tx.send(WsMessage::Text(hb.to_string())).await.is_err() {
                                                    break;
                                                }
                                            }
                                        });
                                    }

                                    // Send IDENTIFY (Op 0)
                                    let identify = json!({
                                        "op": 0,
                                        "d": {
                                            "server_id": server_id,
                                            "user_id": user_id,
                                            "session_id": session_id,
                                            "token": token,
                                            "video": true,
                                            "streams": []
                                        }
                                    });
                                    let _ = send_tx.send(WsMessage::Text(identify.to_string())).await;
                                }
                                2 => {
                                    // READY
                                    let ssrc_val = payload.d.get("ssrc").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                                    {
                                        let mut s_lock = ssrc.lock().await;
                                        *s_lock = ssrc_val;
                                    }
                                    let discord_ip = payload.d.get("ip").and_then(|v| v.as_str()).unwrap_or("127.0.0.1");
                                    let discord_port = payload.d.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;

                                    info!("Voice Gateway READY: server at {}:{}, ssrc: {}", discord_ip, discord_port, ssrc_val);

                                    let mut client_ip = discord_ip.to_string();
                                    let mut client_port = discord_port;

                                    // UDP IP Discovery
                                    match tokio::net::UdpSocket::bind("0.0.0.0:0").await {
                                        Ok(udp_sock) => {
                                            let udp_arc = Arc::new(udp_sock);
                                            let target_addr = format!("{}:{}", discord_ip, discord_port);
                                            if let Err(e) = udp_arc.connect(&target_addr).await {
                                                warn!("Failed to connect UDP socket to {}: {}", target_addr, e);
                                            } else {
                                                // Send 74-byte discovery packet
                                                let mut packet = [0u8; 74];
                                                packet[0] = 0x00;
                                                packet[1] = 0x01; // Request
                                                packet[2] = 0x00;
                                                packet[3] = 0x46; // Length 70
                                                packet[4..8].copy_from_slice(&ssrc_val.to_be_bytes());

                                                if let Ok(_) = udp_arc.send(&packet).await {
                                                    let mut resp = [0u8; 128];
                                                    let timeout_res = tokio::time::timeout(Duration::from_millis(2500), udp_arc.recv(&mut resp)).await;
                                                    if let Ok(Ok(n)) = timeout_res {
                                                        if n >= 74 && resp[0] == 0x00 && resp[1] == 0x02 {
                                                            let ip_bytes = &resp[8..72];
                                                            let null_end = ip_bytes.iter().position(|&b| b == 0).unwrap_or(ip_bytes.len());
                                                            if let Ok(discovered_ip) = std::str::from_utf8(&ip_bytes[..null_end]) {
                                                                client_ip = discovered_ip.trim().to_string();
                                                            }
                                                            client_port = u16::from_be_bytes([resp[72], resp[73]]);
                                                            info!("Voice UDP discovery resolved external address: {}:{}", client_ip, client_port);
                                                        }
                                                    }
                                                }

                                                // Periodic UDP keepalive
                                                let keepalive_sock = udp_arc.clone();
                                                let keepalive_running = is_running.clone();
                                                tokio::spawn(async move {
                                                    let mut interval = tokio::time::interval(Duration::from_secs(5));
                                                    while keepalive_running.load(Ordering::Relaxed) {
                                                        interval.tick().await;
                                                        let keepalive_packet = [0x13, 0x37];
                                                        if keepalive_sock.send(&keepalive_packet).await.is_err() {
                                                            break;
                                                        }
                                                    }
                                                });

                                                // UDP receiver loop for incoming RTP packets
                                                let recv_sock = udp_arc.clone();
                                                let recv_running = is_running.clone();
                                                tokio::spawn(async move {
                                                    let mut buf = [0u8; 2048];
                                                    while recv_running.load(Ordering::Relaxed) {
                                                        match recv_sock.recv(&mut buf).await {
                                                            Ok(n) => {
                                                                if n >= 12 && ((buf[0] >> 6) & 0x03) == 2 {
                                                                    // Valid RTP audio packet received
                                                                }
                                                            }
                                                            Err(_) => break,
                                                        }
                                                    }
                                                });
                                            }
                                        }
                                        Err(e) => {
                                            error!("Failed to bind voice UDP socket: {}", e);
                                        }
                                    }

                                    // Select protocol (Op 1)
                                    let select_proto = json!({
                                        "op": 1,
                                        "d": {
                                            "protocol": "udp",
                                            "data": {
                                                "address": client_ip,
                                                "port": client_port,
                                                "mode": "aead_xchacha20_poly1305_rtpsize"
                                            },
                                            "address": client_ip,
                                            "port": client_port,
                                            "mode": "aead_xchacha20_poly1305_rtpsize"
                                        }
                                    });
                                    let _ = send_tx.send(WsMessage::Text(select_proto.to_string())).await;
                                }
                                4 => {
                                    // SESSION_DESCRIPTION
                                    info!("Voice Gateway session description established!");
                                    let _ = app_handle.emit("discord-voice-connected", &payload.d);

                                    // Send Speaking (Op 5)
                                    let cur_ssrc = *ssrc.lock().await;
                                    let speaking_msg = json!({
                                        "op": 5,
                                        "d": {
                                            "speaking": 0,
                                            "delay": 0,
                                            "ssrc": cur_ssrc
                                        }
                                    });
                                    let _ = send_tx.send(WsMessage::Text(speaking_msg.to_string())).await;
                                }
                                5 => {
                                    // SPEAKING
                                    let _ = app_handle.emit("discord-voice-speaking", &payload.d);
                                }
                                11 => {
                                    // CLIENT_CONNECT
                                    let _ = app_handle.emit("discord-voice-client-connect", &payload.d);
                                }
                                13 => {
                                    // CLIENT_DISCONNECT
                                    let _ = app_handle.emit("discord-voice-client-disconnect", &payload.d);
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(WsMessage::Close(reason))) => {
                        info!("Voice gateway closed connection: {:?}", reason);
                        break;
                    }
                    Some(Err(e)) => {
                        error!("Voice gateway websocket error: {}", e);
                        break;
                    }
                    None => break,
                    _ => {}
                }
            }
        }
    }

    is_running.store(false, Ordering::Relaxed);
    let _ = app_handle.emit("discord-voice-disconnected", ());
    Ok(())
}
