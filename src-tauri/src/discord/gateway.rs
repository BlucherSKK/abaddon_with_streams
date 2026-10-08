use crate::discord::models::{Channel, VoiceState};
use crate::discord::voice::VoiceGatewayClient;
use crate::state::AppState;
use anyhow::{anyhow, Result};
use futures_util::{SinkExt, StreamExt};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message as WsMessage;

const GATEWAY_URL: &str = "wss://gateway.discord.gg/?v=9&encoding=json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayPayload {
    pub op: u8,
    #[serde(default)]
    pub d: serde_json::Value,
    #[serde(default)]
    pub s: Option<u64>,
    #[serde(default)]
    pub t: Option<String>,
}

#[derive(Debug)]
pub enum GatewayCommand {
    UpdateVoiceState {
        guild_id: Option<String>,
        channel_id: Option<String>,
        self_mute: bool,
        self_deaf: bool,
    },
    StartStream {
        guild_id: Option<String>,
        channel_id: String,
    },
    StopStream {
        stream_key: String,
    },
    WatchStream {
        stream_key: String,
    },
    SetStreamPaused {
        stream_key: String,
        paused: bool,
    },
    SetPresence {
        status: String,
    },
    Disconnect,
}

pub struct GatewayClient {
    cmd_tx: mpsc::Sender<GatewayCommand>,
    is_running: Arc<AtomicBool>,
}

impl GatewayClient {
    pub fn start(token: String, app_handle: AppHandle) -> (Self, mpsc::Sender<GatewayCommand>) {
        let (cmd_tx, cmd_rx) = mpsc::channel(64);
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = is_running.clone();
        let cmd_tx_clone = cmd_tx.clone();

        tokio::spawn(async move {
            if let Err(e) = run_gateway_loop(token, app_handle, cmd_rx, is_running_clone).await {
                error!("Gateway loop ended with error: {:?}", e);
            }
        });

        (
            Self {
                cmd_tx: cmd_tx.clone(),
                is_running,
            },
            cmd_tx_clone,
        )
    }

    pub async fn send_command(&self, cmd: GatewayCommand) -> Result<()> {
        self.cmd_tx
            .send(cmd)
            .await
            .map_err(|e| anyhow!("Failed to send gateway command: {}", e))
    }

    pub fn is_connected(&self) -> bool {
        self.is_running.load(Ordering::Relaxed)
    }
}

async fn run_gateway_loop(
    token: String,
    app_handle: AppHandle,
    mut cmd_rx: mpsc::Receiver<GatewayCommand>,
    is_running: Arc<AtomicBool>,
) -> Result<()> {
    info!("Connecting to Discord Gateway at {}", GATEWAY_URL);

    let (ws_stream, _) = connect_async(GATEWAY_URL).await?;
    let (ws_write, mut ws_read) = ws_stream.split();

    let seq_num = Arc::new(RwLock::new(None::<u64>));
    let (send_tx, mut send_rx) = mpsc::channel::<WsMessage>(64);

    let ws_write = Arc::new(Mutex::new(ws_write));

    // Spawn sender task
    let ws_write_sender = ws_write.clone();
    let is_running_sender = is_running.clone();
    tokio::spawn(async move {
        while let Some(msg) = send_rx.recv().await {
            if !is_running_sender.load(Ordering::Relaxed) {
                break;
            }
            let mut write = ws_write_sender.lock().await;
            if let Err(e) = write.send(msg).await {
                error!("Failed to write to websocket: {}", e);
                break;
            }
        }
    });

    let heartbeat_active = Arc::new(AtomicBool::new(false));

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(GatewayCommand::Disconnect) => {
                        info!("Gateway disconnect requested.");
                        is_running.store(false, Ordering::Relaxed);
                        break;
                    }
                    Some(GatewayCommand::UpdateVoiceState { guild_id, channel_id, self_mute, self_deaf }) => {
                        let payload = json!({
                            "op": 4,
                            "d": {
                                "guild_id": guild_id,
                                "channel_id": channel_id,
                                "self_mute": self_mute,
                                "self_deaf": self_deaf
                            }
                        });
                        let _ = send_tx.send(WsMessage::Text(payload.to_string())).await;
                    }
                    Some(GatewayCommand::StartStream { guild_id, channel_id }) => {
                        let payload = json!({
                            "op": 18,
                            "d": {
                                "type": if guild_id.is_some() { "guild" } else { "call" },
                                "guild_id": guild_id,
                                "channel_id": channel_id,
                                "preferred_region": null
                            }
                        });
                        let _ = send_tx.send(WsMessage::Text(payload.to_string())).await;
                    }
                    Some(GatewayCommand::StopStream { stream_key }) => {
                        let payload = json!({
                            "op": 20,
                            "d": {
                                "stream_key": stream_key
                            }
                        });
                        let _ = send_tx.send(WsMessage::Text(payload.to_string())).await;
                    }
                    Some(GatewayCommand::WatchStream { stream_key }) => {
                        let payload = json!({
                            "op": 19,
                            "d": {
                                "stream_key": stream_key
                            }
                        });
                        let _ = send_tx.send(WsMessage::Text(payload.to_string())).await;
                    }
                    Some(GatewayCommand::SetStreamPaused { stream_key, paused }) => {
                        let payload = json!({
                            "op": 22,
                            "d": {
                                "stream_key": stream_key,
                                "paused": paused
                            }
                        });
                        let _ = send_tx.send(WsMessage::Text(payload.to_string())).await;
                    }
                    Some(GatewayCommand::SetPresence { status }) => {
                        let payload = json!({
                            "op": 3,
                            "d": {
                                "since": 0,
                                "activities": [],
                                "status": status,
                                "afk": false
                            }
                        });
                        let _ = send_tx.send(WsMessage::Text(payload.to_string())).await;
                    }
                    None => {
                        info!("Command receiver dropped, exiting gateway loop");
                        break;
                    }
                }
            }
            msg = ws_read.next() => {
                match msg {
                    Some(Ok(WsMessage::Text(text))) => {
                        if let Ok(payload) = serde_json::from_str::<GatewayPayload>(&text) {
                            if let Some(s) = payload.s {
                                let mut seq = seq_num.write().await;
                                *seq = Some(s);
                            }

                            match payload.op {
                                10 => {
                                    // HELLO: Start heartbeating and send IDENTIFY
                                    if let Some(interval_ms) = payload.d.get("heartbeat_interval").and_then(|v| v.as_u64()) {
                                        info!("Gateway HELLO: heartbeat interval = {}ms", interval_ms);
                                        let hb_tx = send_tx.clone();
                                        let seq_clone = seq_num.clone();
                                        let hb_running = is_running.clone();

                                        heartbeat_active.store(true, Ordering::Relaxed);
                                        tokio::spawn(async move {
                                            let mut interval = tokio::time::interval(Duration::from_millis(interval_ms));
                                            while hb_running.load(Ordering::Relaxed) {
                                                interval.tick().await;
                                                let last_s = *seq_clone.read().await;
                                                let hb = json!({
                                                    "op": 1,
                                                    "d": last_s
                                                });
                                                if hb_tx.send(WsMessage::Text(hb.to_string())).await.is_err() {
                                                    break;
                                                }
                                            }
                                        });
                                    }

                                    // Send IDENTIFY
                                    let os_name = if cfg!(target_os = "macos") { "Mac OS X" } else { "Linux" };
                                    let identify = json!({
                                        "op": 2,
                                        "d": {
                                            "token": token,
                                            "capabilities": 8189,
                                            "properties": {
                                                "os": os_name,
                                                "browser": "Discord Client",
                                                "release_channel": "stable",
                                                "client_version": "1.0.9000",
                                                "os_version": "x86_64",
                                                "system_locale": "en-US"
                                            },
                                            "presence": {
                                                "status": "online",
                                                "since": 0,
                                                "activities": [],
                                                "afk": false
                                            },
                                            "compress": false,
                                            "client_state": {
                                                "guild_versions": {}
                                            }
                                        }
                                    });

                                    let _ = send_tx.send(WsMessage::Text(identify.to_string())).await;
                                }
                                11 => {
                                    // Heartbeat ACK
                                }
                                0 => {
                                    // DISPATCH EVENT
                                    if let Some(event_name) = &payload.t {
                                        handle_dispatch_event(&app_handle, event_name, &payload.d);
                                    }
                                }
                                1 => {
                                    // Heartbeat requested by gateway
                                    let last_s = *seq_num.read().await;
                                    let hb = json!({ "op": 1, "d": last_s });
                                    let _ = send_tx.send(WsMessage::Text(hb.to_string())).await;
                                }
                                7 => {
                                    warn!("Gateway requested reconnect (op 7)");
                                    break;
                                }
                                9 => {
                                    warn!("Gateway invalid session (op 9)");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(WsMessage::Close(reason))) => {
                        info!("Gateway closed connection: {:?}", reason);
                        break;
                    }
                    Some(Err(e)) => {
                        error!("Gateway WebSocket error: {}", e);
                        break;
                    }
                    None => {
                        info!("Gateway stream finished");
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    is_running.store(false, Ordering::Relaxed);
    let _ = app_handle.emit("gateway-disconnected", ());
    Ok(())
}

fn handle_dispatch_event(app: &AppHandle, event_name: &str, data: &serde_json::Value) {
    match event_name {
        "READY" => {
            info!("Received READY from Discord Gateway!");
            if let Some(private_channels) = data.get("private_channels") {
                if let Ok(dms) = serde_json::from_value::<Vec<Channel>>(private_channels.clone()) {
                    let app_clone = app.clone();
                    tokio::spawn(async move {
                        let state = app_clone.state::<AppState>();
                        state.store_dm_channels(dms).await;
                    });
                }
            }
            let _ = app.emit("discord-ready", data);
        }
        "MESSAGE_CREATE" => {
            let _ = app.emit("discord-message-create", data);
        }
        "MESSAGE_UPDATE" => {
            let _ = app.emit("discord-message-update", data);
        }
        "MESSAGE_DELETE" => {
            let _ = app.emit("discord-message-delete", data);
        }
        "CHANNEL_CREATE" => {
            let _ = app.emit("discord-channel-create", data);
        }
        "CHANNEL_UPDATE" => {
            let _ = app.emit("discord-channel-update", data);
        }
        "CHANNEL_DELETE" => {
            let _ = app.emit("discord-channel-delete", data);
        }
        "GUILD_CREATE" => {
            if let Some(guild_id) = data.get("id").and_then(|v| v.as_str()) {
                let gid = guild_id.to_string();
                let app_clone = app.clone();
                let data_clone = data.clone();
                tokio::spawn(async move {
                    let state = app_clone.state::<AppState>();
                    if let Some(channels_json) = data_clone.get("channels") {
                        if let Ok(channels) = serde_json::from_value::<Vec<Channel>>(channels_json.clone()) {
                            state.store_guild_channels(gid.clone(), channels).await;
                        }
                    }
                    if let Some(vstates_json) = data_clone.get("voice_states") {
                        if let Ok(vstates) = serde_json::from_value::<Vec<VoiceState>>(vstates_json.clone()) {
                            state.store_guild_voice_states(gid.clone(), vstates).await;
                        }
                    }
                });
            }
            let _ = app.emit("discord-guild-create", data);
        }
        "GUILD_DELETE" => {
            let _ = app.emit("discord-guild-delete", data);
        }
        "VOICE_STATE_UPDATE" => {
            if let Ok(vstate) = serde_json::from_value::<VoiceState>(data.clone()) {
                let app_clone = app.clone();
                let state_clone = vstate.clone();
                tokio::spawn(async move {
                    let state = app_clone.state::<AppState>();
                    let my_id = {
                        let user_lock = state.current_user.read().await;
                        user_lock.as_ref().map(|u| u.id.clone())
                    };

                    if let Some(ref uid) = my_id {
                        if state_clone.user_id == *uid {
                            if state_clone.channel_id.is_none() {
                                // Left voice channel
                                let mut vg_lock = state.voice_gateway.lock().await;
                                if let Some(vg) = vg_lock.take() {
                                    vg.stop().await;
                                }
                                *state.voice_session_id.write().await = None;
                                *state.voice_server_endpoint.write().await = None;
                                *state.voice_server_token.write().await = None;
                            } else if let Some(ref sess_id) = state_clone.session_id {
                                *state.voice_session_id.write().await = Some(sess_id.clone());
                                if let Some(ref gid) = state_clone.guild_id {
                                    maybe_start_voice_gateway(&app_clone, gid).await;
                                }
                            }
                        }
                    }
                    state.update_voice_state(state_clone).await;
                });
            }
            let _ = app.emit("discord-voice-state-update", data);
        }
        "VOICE_SERVER_UPDATE" => {
            let app_clone = app.clone();
            let data_clone = data.clone();
            tokio::spawn(async move {
                let state = app_clone.state::<AppState>();
                let endpoint = data_clone.get("endpoint").and_then(|v| v.as_str()).map(|s| s.to_string());
                let token = data_clone.get("token").and_then(|v| v.as_str()).map(|s| s.to_string());
                let guild_id = data_clone.get("guild_id").and_then(|v| v.as_str()).map(|s| s.to_string())
                    .or_else(|| data_clone.get("channel_id").and_then(|v| v.as_str()).map(|s| s.to_string()));

                if let (Some(ep), Some(tok), Some(gid)) = (endpoint, token, guild_id) {
                    *state.voice_server_endpoint.write().await = Some(ep);
                    *state.voice_server_token.write().await = Some(tok);
                    maybe_start_voice_gateway(&app_clone, &gid).await;
                }
            });
            let _ = app.emit("discord-voice-server-update", data);
        }
        "STREAM_CREATE" => {
            info!("STREAM_CREATE received: {:?}", data);
            let _ = app.emit("discord-stream-create", data);
        }
        "STREAM_SERVER_UPDATE" => {
            info!("STREAM_SERVER_UPDATE received: {:?}", data);
            let _ = app.emit("discord-stream-server-update", data);
        }
        "STREAM_DELETE" => {
            info!("STREAM_DELETE received: {:?}", data);
            let _ = app.emit("discord-stream-delete", data);
        }
        "STAGE_INSTANCE_CREATE" => {
            let _ = app.emit("discord-stage-instance-create", data);
        }
        "STAGE_INSTANCE_UPDATE" => {
            let _ = app.emit("discord-stage-instance-update", data);
        }
        "STAGE_INSTANCE_DELETE" => {
            let _ = app.emit("discord-stage-instance-delete", data);
        }
        _ => {}
    }
}

async fn maybe_start_voice_gateway(app: &AppHandle, guild_id: &str) {
    let state = app.state::<AppState>();
    let session_id = state.voice_session_id.read().await.clone();
    let endpoint = state.voice_server_endpoint.read().await.clone();
    let token = state.voice_server_token.read().await.clone();
    let user_id = state.current_user.read().await.as_ref().map(|u| u.id.clone());

    if let (Some(sess), Some(ep), Some(tok), Some(uid)) = (session_id, endpoint, token, user_id) {
        let mut vg_lock = state.voice_gateway.lock().await;
        if let Some(old) = vg_lock.take() {
            old.stop().await;
        }
        info!("Starting Voice Gateway client for guild {} at {}", guild_id, ep);
        let client = VoiceGatewayClient::start(ep, tok, guild_id.to_string(), uid, sess, app.clone());
        *vg_lock = Some(client);
    }
}
