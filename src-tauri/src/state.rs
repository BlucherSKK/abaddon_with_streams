use crate::discord::{
    Channel, DiscordRestClient, GatewayClient, GatewayCommand, Guild, User, VoiceGatewayClient,
    VoiceState,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};

pub struct AppState {
    pub rest: Arc<DiscordRestClient>,
    pub gateway: Arc<Mutex<Option<(GatewayClient, mpsc::Sender<GatewayCommand>)>>>,
    pub current_user: Arc<RwLock<Option<User>>>,
    pub active_stream_key: Arc<RwLock<Option<String>>>,
    pub active_voice_channel: Arc<RwLock<Option<String>>>,
    pub active_voice_guild: Arc<RwLock<Option<String>>>,
    pub guild_channels: Arc<RwLock<HashMap<String, Vec<Channel>>>>,
    pub dm_channels: Arc<RwLock<Vec<Channel>>>,
    pub guilds: Arc<RwLock<HashMap<String, Guild>>>,
    pub voice_states: Arc<RwLock<HashMap<String, HashMap<String, VoiceState>>>>,
    pub cached_users: Arc<RwLock<HashMap<String, User>>>,
    pub voice_gateway: Arc<Mutex<Option<VoiceGatewayClient>>>,
    pub voice_session_id: Arc<RwLock<Option<String>>>,
    pub voice_server_endpoint: Arc<RwLock<Option<String>>>,
    pub voice_server_token: Arc<RwLock<Option<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            rest: Arc::new(DiscordRestClient::new()),
            gateway: Arc::new(Mutex::new(None)),
            current_user: Arc::new(RwLock::new(None)),
            active_stream_key: Arc::new(RwLock::new(None)),
            active_voice_channel: Arc::new(RwLock::new(None)),
            active_voice_guild: Arc::new(RwLock::new(None)),
            guild_channels: Arc::new(RwLock::new(HashMap::new())),
            dm_channels: Arc::new(RwLock::new(Vec::new())),
            guilds: Arc::new(RwLock::new(HashMap::new())),
            voice_states: Arc::new(RwLock::new(HashMap::new())),
            cached_users: Arc::new(RwLock::new(HashMap::new())),
            voice_gateway: Arc::new(Mutex::new(None)),
            voice_session_id: Arc::new(RwLock::new(None)),
            voice_server_endpoint: Arc::new(RwLock::new(None)),
            voice_server_token: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn store_guild_channels(&self, guild_id: String, channels: Vec<Channel>) {
        let mut lock = self.guild_channels.write().await;
        lock.insert(guild_id, channels);
    }

    pub async fn get_cached_guild_channels(&self, guild_id: &str) -> Option<Vec<Channel>> {
        let lock = self.guild_channels.read().await;
        lock.get(guild_id).cloned()
    }

    pub async fn store_dm_channels(&self, dms: Vec<Channel>) {
        let mut lock = self.dm_channels.write().await;
        *lock = dms;
    }

    pub async fn get_cached_dm_channels(&self) -> Vec<Channel> {
        let lock = self.dm_channels.read().await;
        lock.clone()
    }

    pub async fn store_guild_voice_states(&self, guild_id: String, states: Vec<VoiceState>) {
        let mut lock = self.voice_states.write().await;
        let map = lock.entry(guild_id.clone()).or_insert_with(HashMap::new);
        for mut s in states {
            if s.guild_id.is_none() {
                s.guild_id = Some(guild_id.clone());
            }
            map.insert(s.user_id.clone(), s);
        }
    }

    pub async fn update_voice_state(&self, mut state: VoiceState) {
        let mut lock = self.voice_states.write().await;
        if state.guild_id.is_none() {
            if let Some(ref cid) = state.channel_id {
                let channels_lock = self.guild_channels.read().await;
                for (gid, chans) in channels_lock.iter() {
                    if chans.iter().any(|c| &c.id == cid) {
                        state.guild_id = Some(gid.clone());
                        break;
                    }
                }
            }
        }
        if let Some(ref gid) = state.guild_id {
            let map = lock.entry(gid.clone()).or_insert_with(HashMap::new);
            if state.channel_id.is_none() {
                map.remove(&state.user_id);
            } else {
                map.insert(state.user_id.clone(), state);
            }
        } else if state.channel_id.is_none() {
            for map in lock.values_mut() {
                map.remove(&state.user_id);
            }
        }
    }

    pub async fn get_guild_voice_states(&self, guild_id: &str) -> Vec<VoiceState> {
        let lock = self.voice_states.read().await;
        let users_lock = self.cached_users.read().await;
        if let Some(map) = lock.get(guild_id) {
            map.values()
                .cloned()
                .map(|mut s| {
                    if s.member.is_none()
                        || s.member.as_ref().and_then(|m| m.get("user")).is_none()
                    {
                        if let Some(u) = users_lock.get(&s.user_id) {
                            let nick = u.global_name.clone().unwrap_or_else(|| u.username.clone());
                            s.member = Some(json!({
                                "user": u,
                                "nick": nick
                            }));
                        }
                    }
                    s
                })
                .collect()
        } else {
            Vec::new()
        }
    }

    pub async fn get_channel_voice_states(&self, channel_id: &str) -> Vec<VoiceState> {
        let lock = self.voice_states.read().await;
        let users_lock = self.cached_users.read().await;
        let mut res = Vec::new();
        for map in lock.values() {
            for s in map.values() {
                if s.channel_id.as_deref() == Some(channel_id) {
                    let mut s_clone = s.clone();
                    if s_clone.member.is_none()
                        || s_clone
                            .member
                            .as_ref()
                            .and_then(|m| m.get("user"))
                            .is_none()
                    {
                        if let Some(u) = users_lock.get(&s_clone.user_id) {
                            let nick = u.global_name.clone().unwrap_or_else(|| u.username.clone());
                            s_clone.member = Some(json!({
                                "user": u,
                                "nick": nick
                            }));
                        }
                    }
                    res.push(s_clone);
                }
            }
        }
        res
    }

    pub async fn store_user(&self, user: User) {
        let mut lock = self.cached_users.write().await;
        lock.insert(user.id.clone(), user);
    }

    pub async fn store_users(&self, users: Vec<User>) {
        let mut lock = self.cached_users.write().await;
        for u in users {
            lock.insert(u.id.clone(), u);
        }
    }

    pub async fn get_cached_user(&self, user_id: &str) -> Option<User> {
        let lock = self.cached_users.read().await;
        lock.get(user_id).cloned()
    }
}
