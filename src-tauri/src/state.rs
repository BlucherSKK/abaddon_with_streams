use crate::discord::{Channel, DiscordRestClient, GatewayClient, GatewayCommand, Guild, User};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};

pub struct AppState {
    pub rest: Arc<DiscordRestClient>,
    pub gateway: Arc<Mutex<Option<(GatewayClient, mpsc::Sender<GatewayCommand>)>>>,
    pub current_user: Arc<RwLock<Option<User>>>,
    pub active_stream_key: Arc<RwLock<Option<String>>>,
    pub active_voice_channel: Arc<RwLock<Option<String>>>,
    pub guild_channels: Arc<RwLock<HashMap<String, Vec<Channel>>>>,
    pub dm_channels: Arc<RwLock<Vec<Channel>>>,
    pub guilds: Arc<RwLock<HashMap<String, Guild>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            rest: Arc::new(DiscordRestClient::new()),
            gateway: Arc::new(Mutex::new(None)),
            current_user: Arc::new(RwLock::new(None)),
            active_stream_key: Arc::new(RwLock::new(None)),
            active_voice_channel: Arc::new(RwLock::new(None)),
            guild_channels: Arc::new(RwLock::new(HashMap::new())),
            dm_channels: Arc::new(RwLock::new(Vec::new())),
            guilds: Arc::new(RwLock::new(HashMap::new())),
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
}
