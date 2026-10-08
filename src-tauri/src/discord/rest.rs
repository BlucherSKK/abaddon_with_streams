use crate::discord::models::*;
use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, USER_AGENT};
use std::sync::Arc;
use tokio::sync::RwLock;

const BASE_URL: &str = "https://discord.com/api/v9";

#[derive(Clone)]
pub struct DiscordRestClient {
    client: reqwest::Client,
    token: Arc<RwLock<Option<String>>>,
}

impl DiscordRestClient {
    pub fn new() -> Self {
        let mut default_headers = HeaderMap::new();
        default_headers.insert(
            USER_AGENT,
            HeaderValue::from_static("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"),
        );

        let client = reqwest::Client::builder()
            .default_headers(default_headers)
            .build()
            .expect("Failed to build reqwest client");

        Self {
            client,
            token: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_token(&self, token: String) {
        let mut lock = self.token.write().await;
        *lock = Some(token);
    }

    pub async fn clear_token(&self) {
        let mut lock = self.token.write().await;
        *lock = None;
    }

    pub async fn get_token(&self) -> Option<String> {
        let lock = self.token.read().await;
        lock.clone()
    }

    async fn auth_header(&self) -> Result<String> {
        let lock = self.token.read().await;
        lock.clone().ok_or_else(|| anyhow!("Not authenticated. Token is missing."))
    }

    pub async fn get_me(&self) -> Result<User> {
        let token = self.auth_header().await?;
        let res = self
            .client
            .get(format!("{}/users/@me", BASE_URL))
            .header(AUTHORIZATION, &token)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to fetch user (status {}): {}", status, text));
        }

        let user: User = res.json().await?;
        Ok(user)
    }

    pub async fn get_guilds(&self) -> Result<Vec<Guild>> {
        let token = self.auth_header().await?;
        let res = self
            .client
            .get(format!("{}/users/@me/guilds", BASE_URL))
            .header(AUTHORIZATION, &token)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to fetch guilds (status {}): {}", status, text));
        }

        let guilds: Vec<Guild> = res.json().await?;
        Ok(guilds)
    }

    pub async fn get_guild_channels(&self, guild_id: &str) -> Result<Vec<Channel>> {
        let token = self.auth_header().await?;
        let res = self
            .client
            .get(format!("{}/guilds/{}/channels", BASE_URL, guild_id))
            .header(AUTHORIZATION, &token)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to fetch channels (status {}): {}", status, text));
        }

        let channels: Vec<Channel> = res.json().await?;
        Ok(channels)
    }

    pub async fn get_channel_messages(&self, channel_id: &str, limit: u32) -> Result<Vec<Message>> {
        let token = self.auth_header().await?;
        let res = self
            .client
            .get(format!("{}/channels/{}/messages?limit={}", BASE_URL, channel_id, limit))
            .header(AUTHORIZATION, &token)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to fetch messages (status {}): {}", status, text));
        }

        let messages: Vec<Message> = res.json().await?;
        Ok(messages)
    }

    pub async fn send_message(&self, channel_id: &str, content: &str) -> Result<Message> {
        let token = self.auth_header().await?;
        let payload = SendMessagePayload {
            content: content.to_string(),
        };

        let res = self
            .client
            .post(format!("{}/channels/{}/messages", BASE_URL, channel_id))
            .header(AUTHORIZATION, &token)
            .json(&payload)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to send message (status {}): {}", status, text));
        }

        let message: Message = res.json().await?;
        Ok(message)
    }

    pub async fn delete_message(&self, channel_id: &str, message_id: &str) -> Result<()> {
        let token = self.auth_header().await?;
        let res = self
            .client
            .delete(format!("{}/channels/{}/messages/{}", BASE_URL, channel_id, message_id))
            .header(AUTHORIZATION, &token)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(anyhow!("Failed to delete message (status {}): {}", status, text));
        }

        Ok(())
    }
}
