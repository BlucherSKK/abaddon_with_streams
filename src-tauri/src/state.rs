use crate::discord::{DiscordRestClient, GatewayClient, GatewayCommand, User};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex, RwLock};

pub struct AppState {
    pub rest: Arc<DiscordRestClient>,
    pub gateway: Arc<Mutex<Option<(GatewayClient, mpsc::Sender<GatewayCommand>)>>>,
    pub current_user: Arc<RwLock<Option<User>>>,
    pub active_stream_key: Arc<RwLock<Option<String>>>,
    pub active_voice_channel: Arc<RwLock<Option<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            rest: Arc::new(DiscordRestClient::new()),
            gateway: Arc::new(Mutex::new(None)),
            current_user: Arc::new(RwLock::new(None)),
            active_stream_key: Arc::new(RwLock::new(None)),
            active_voice_channel: Arc::new(RwLock::new(None)),
        }
    }
}
