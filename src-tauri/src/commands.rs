use crate::discord::{Channel, GatewayClient, GatewayCommand, Guild, Message, User, VoiceState};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn login(
    token: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<User, String> {
    let clean_token = token.trim().to_string();
    state.rest.set_token(clean_token.clone()).await;

    // Verify token with REST API
    let user = state
        .rest
        .get_me()
        .await
        .map_err(|e| format!("Authentication failed: {}", e))?;

    {
        let mut user_lock = state.current_user.write().await;
        *user_lock = Some(user.clone());
    }

    // Stop existing gateway if any
    {
        let mut gw_lock = state.gateway.lock().await;
        if let Some((_, tx)) = gw_lock.take() {
            let _ = tx.send(GatewayCommand::Disconnect).await;
        }

        // Start new gateway connection
        let (gw, tx) = GatewayClient::start(clean_token, app);
        *gw_lock = Some((gw, tx));
    }

    Ok(user)
}

#[tauri::command]
pub async fn logout(state: State<'_, AppState>) -> Result<(), String> {
    state.rest.clear_token().await;
    {
        let mut user_lock = state.current_user.write().await;
        *user_lock = None;
    }
    {
        let mut gw_lock = state.gateway.lock().await;
        if let Some((_, tx)) = gw_lock.take() {
            let _ = tx.send(GatewayCommand::Disconnect).await;
        }
    }
    {
        let mut chan_lock = state.active_voice_channel.write().await;
        *chan_lock = None;
    }
    {
        let mut stream_lock = state.active_stream_key.write().await;
        *stream_lock = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_me(state: State<'_, AppState>) -> Result<Option<User>, String> {
    let lock = state.current_user.read().await;
    Ok(lock.clone())
}

#[tauri::command]
pub async fn get_guilds(state: State<'_, AppState>) -> Result<Vec<Guild>, String> {
    state
        .rest
        .get_guilds()
        .await
        .map_err(|e| format!("Failed to fetch guilds: {}", e))
}

#[tauri::command]
pub async fn get_dms(state: State<'_, AppState>) -> Result<Vec<Channel>, String> {
    match state.rest.get_dm_channels().await {
        Ok(dms) => {
            state.store_dm_channels(dms.clone()).await;
            Ok(dms)
        }
        Err(_) => {
            let cached = state.get_cached_dm_channels().await;
            Ok(cached)
        }
    }
}

#[tauri::command]
pub async fn get_channels(guild_id: String, state: State<'_, AppState>) -> Result<Vec<Channel>, String> {
    if let Some(cached) = state.get_cached_guild_channels(&guild_id).await {
        if !cached.is_empty() {
            return Ok(cached);
        }
    }

    match state.rest.get_guild_channels(&guild_id).await {
        Ok(channels) => {
            state.store_guild_channels(guild_id, channels.clone()).await;
            Ok(channels)
        }
        Err(_) => {
            let cached = state.get_cached_guild_channels(&guild_id).await.unwrap_or_default();
            Ok(cached)
        }
    }
}

#[tauri::command]
pub async fn get_messages(
    channel_id: String,
    limit: Option<u32>,
    state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    let lim = limit.unwrap_or(50);
    state
        .rest
        .get_channel_messages(&channel_id, lim)
        .await
        .map_err(|e| format!("Failed to fetch messages: {}", e))
}

#[tauri::command]
pub async fn send_message(
    channel_id: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<Message, String> {
    state
        .rest
        .send_message(&channel_id, &content)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))
}

#[tauri::command]
pub async fn delete_message(
    channel_id: String,
    message_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .rest
        .delete_message(&channel_id, &message_id)
        .await
        .map_err(|e| format!("Failed to delete message: {}", e))
}

#[tauri::command]
pub async fn join_voice(
    guild_id: Option<String>,
    channel_id: String,
    mute: bool,
    deaf: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let gw_lock = state.gateway.lock().await;
    if let Some((_, ref tx)) = *gw_lock {
        tx.send(GatewayCommand::UpdateVoiceState {
            guild_id: guild_id.clone(),
            channel_id: Some(channel_id.clone()),
            self_mute: mute,
            self_deaf: deaf,
        })
        .await
        .map_err(|e| format!("Failed to send voice state update: {}", e))?;

        let mut chan_lock = state.active_voice_channel.write().await;
        *chan_lock = Some(channel_id);
        let mut guild_lock = state.active_voice_guild.write().await;
        *guild_lock = guild_id;
        Ok(())
    } else {
        Err("Gateway not connected".to_string())
    }
}

#[tauri::command]
pub async fn leave_voice(
    guild_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let gw_lock = state.gateway.lock().await;
    if let Some((_, ref tx)) = *gw_lock {
        tx.send(GatewayCommand::UpdateVoiceState {
            guild_id,
            channel_id: None,
            self_mute: false,
            self_deaf: false,
        })
        .await
        .map_err(|e| format!("Failed to leave voice: {}", e))?;

        let mut chan_lock = state.active_voice_channel.write().await;
        *chan_lock = None;
        let mut guild_lock = state.active_voice_guild.write().await;
        *guild_lock = None;
        let mut stream_lock = state.active_stream_key.write().await;
        *stream_lock = None;
        *state.voice_session_id.write().await = None;
        *state.voice_server_endpoint.write().await = None;
        *state.voice_server_token.write().await = None;
        let mut vg_lock = state.voice_gateway.lock().await;
        if let Some(vg) = vg_lock.take() {
            vg.stop().await;
        }
        Ok(())
    } else {
        Err("Gateway not connected".to_string())
    }
}

#[tauri::command]
pub async fn start_stream(
    guild_id: Option<String>,
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let gw_lock = state.gateway.lock().await;
    if let Some((_, ref tx)) = *gw_lock {
        tx.send(GatewayCommand::StartStream {
            guild_id: guild_id.clone(),
            channel_id: channel_id.clone(),
        })
        .await
        .map_err(|e| format!("Failed to start stream: {}", e))?;

        // Calculate stream key
        let user_id = state
            .current_user
            .read()
            .await
            .as_ref()
            .map(|u| u.id.clone())
            .unwrap_or_default();
        let key = if let Some(gid) = guild_id {
            format!("guild:{}:{}:{}", gid, channel_id, user_id)
        } else {
            format!("call:{}:{}", channel_id, user_id)
        };

        let mut stream_lock = state.active_stream_key.write().await;
        *stream_lock = Some(key);
        Ok(())
    } else {
        Err("Gateway not connected".to_string())
    }
}

#[tauri::command]
pub async fn stop_stream(state: State<'_, AppState>) -> Result<(), String> {
    let key = {
        let stream_lock = state.active_stream_key.read().await;
        stream_lock.clone()
    };

    if let Some(stream_key) = key {
        let gw_lock = state.gateway.lock().await;
        if let Some((_, ref tx)) = *gw_lock {
            let _ = tx
                .send(GatewayCommand::StopStream {
                    stream_key: stream_key.clone(),
                })
                .await;
        }
        let mut stream_lock = state.active_stream_key.write().await;
        *stream_lock = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn watch_stream(stream_key: String, state: State<'_, AppState>) -> Result<(), String> {
    let gw_lock = state.gateway.lock().await;
    if let Some((_, ref tx)) = *gw_lock {
        tx.send(GatewayCommand::WatchStream { stream_key })
            .await
            .map_err(|e| format!("Failed to watch stream: {}", e))?;
        Ok(())
    } else {
        Err("Gateway not connected".to_string())
    }
}

#[tauri::command]
pub async fn set_stream_paused(
    stream_key: String,
    paused: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let gw_lock = state.gateway.lock().await;
    if let Some((_, ref tx)) = *gw_lock {
        tx.send(GatewayCommand::SetStreamPaused { stream_key, paused })
            .await
            .map_err(|e| format!("Failed to set stream pause state: {}", e))?;
        Ok(())
    } else {
        Err("Gateway not connected".to_string())
    }
}

#[tauri::command]
pub async fn set_presence(status: String, state: State<'_, AppState>) -> Result<(), String> {
    let gw_lock = state.gateway.lock().await;
    if let Some((_, ref tx)) = *gw_lock {
        tx.send(GatewayCommand::SetPresence { status })
            .await
            .map_err(|e| format!("Failed to set presence: {}", e))?;
        Ok(())
    } else {
        Err("Gateway not connected".to_string())
    }
}

#[tauri::command]
pub async fn get_guild_voice_states(
    guild_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<VoiceState>, String> {
    Ok(state.get_guild_voice_states(&guild_id).await)
}

#[tauri::command]
pub async fn get_channel_voice_states(
    channel_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<VoiceState>, String> {
    Ok(state.get_channel_voice_states(&channel_id).await)
}

#[tauri::command]
pub async fn get_user(
    user_id: String,
    state: State<'_, AppState>,
) -> Result<User, String> {
    if let Some(cached) = state.get_cached_user(&user_id).await {
        return Ok(cached);
    }
    match state.rest.get_user(&user_id).await {
        Ok(user) => {
            state.store_user(user.clone()).await;
            Ok(user)
        }
        Err(e) => Err(format!("Failed to fetch user: {}", e)),
    }
}
