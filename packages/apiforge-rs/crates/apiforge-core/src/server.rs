use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::auth::{AuthConfig, ConnectorConfig};
use crate::environment::get_data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerResponse {
    pub status: u16,
    pub ok: bool,
    pub body: serde_json::Value,
}

/// Get the server URL from env, saved auth, or default
pub fn get_server_url() -> String {
    if let Ok(url) = std::env::var("APIFORGE_SERVER") {
        if !url.is_empty() {
            return url;
        }
    }
    if let Ok(data_dir) = get_data_dir() {
        let auth_path = data_dir.join("auth.json");
        if auth_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&auth_path) {
                if let Ok(config) = serde_json::from_str::<AuthConfig>(&content) {
                    if let Some(url) = config.server_url {
                        return url;
                    }
                }
            }
        }
    }
    "http://localhost:8090".to_string()
}

/// Load auth config from disk
pub fn load_auth() -> Option<AuthConfig> {
    let data_dir = get_data_dir().ok()?;
    let auth_path = data_dir.join("auth.json");
    if !auth_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&auth_path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Save auth config to disk
pub fn save_auth(config: &AuthConfig) -> Result<()> {
    let data_dir = get_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let auth_path = data_dir.join("auth.json");
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&auth_path, content)?;
    Ok(())
}

/// Clear auth credentials
pub fn clear_auth() -> Result<()> {
    let data_dir = get_data_dir()?;
    let auth_path = data_dir.join("auth.json");
    if auth_path.exists() {
        std::fs::remove_file(&auth_path)?;
    }
    Ok(())
}

/// Load connector config
pub fn load_connector_config() -> Option<ConnectorConfig> {
    let data_dir = get_data_dir().ok()?;
    let path = data_dir.join("connector.json");
    if !path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Save connector config
pub fn save_connector_config(config: &ConnectorConfig) -> Result<()> {
    let data_dir = get_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let path = data_dir.join("connector.json");
    let content = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, content)?;
    Ok(())
}

/// Load connector token data
pub fn load_connector_token() -> Option<serde_json::Value> {
    let data_dir = get_data_dir().ok()?;
    let path = data_dir.join("connector-token.json");
    if !path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Save connector token data
pub fn save_connector_token(data: &serde_json::Value) -> Result<()> {
    let data_dir = get_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let path = data_dir.join("connector-token.json");
    let content = serde_json::to_string_pretty(data)?;
    std::fs::write(&path, content)?;
    Ok(())
}

/// Clear connector token
pub fn clear_connector_token() -> Result<bool> {
    let data_dir = get_data_dir()?;
    let path = data_dir.join("connector-token.json");
    if path.exists() {
        std::fs::remove_file(&path)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Make an authenticated fetch to the APIForge server
pub async fn server_fetch(
    path: &str,
    method: &str,
    body: Option<serde_json::Value>,
) -> Result<ServerResponse> {
    let server = get_server_url();
    let url = format!("{}{}", server.trim_end_matches('/'), path);
    let token = crate::auth::resolve_token();

    let client = reqwest::Client::new();
    let mut builder = client.request(method.parse()?, &url);
    builder = builder.header("Content-Type", "application/json");

    if let Some(token) = &token {
        builder = builder.header("Authorization", format!("Bearer {}", token));
    }

    if let Some(body) = body {
        builder = builder.json(&body);
    }

    let resp = builder.send().await
        .context(format!("Failed to connect to {}", url))?;

    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    let text = resp.text().await?;
    let body: serde_json::Value = serde_json::from_str(&text)
        .unwrap_or_else(|_| serde_json::Value::String(text));

    Ok(ServerResponse { status, ok, body })
}

/// Login to the server
pub async fn login(server: &str, username: &str, password: &str) -> Result<AuthConfig> {
    let url = format!("{}/auth/login", server.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "username": username, "password": password }))
        .send()
        .await
        .context("Failed to connect to server")?;

    if !resp.status().is_success() {
        let text = resp.text().await?;
        anyhow::bail!("Login failed: {}", text);
    }

    let data: serde_json::Value = resp.json().await?;
    let token = data.get("token").and_then(|t| t.as_str())
        .context("No token in response")?;
    let user_name = data.get("user")
        .and_then(|u| u.get("username"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string());

    Ok(AuthConfig {
        token: Some(token.to_string()),
        server_url: Some(server.to_string()),
        username: user_name,
    })
}

/// Register a new account
pub async fn register(server: &str, username: &str, password: &str) -> Result<AuthConfig> {
    let url = format!("{}/auth/register", server.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "username": username, "password": password }))
        .send()
        .await
        .context("Failed to connect to server")?;

    if !resp.status().is_success() {
        let text = resp.text().await?;
        anyhow::bail!("Registration failed: {}", text);
    }

    let data: serde_json::Value = resp.json().await?;
    let token = data.get("token").and_then(|t| t.as_str())
        .context("No token in response")?;
    let user_name = data.get("user")
        .and_then(|u| u.get("username"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string());

    Ok(AuthConfig {
        token: Some(token.to_string()),
        server_url: Some(server.to_string()),
        username: user_name,
    })
}

/// Search users via connector
pub async fn connector_search(search_url: &str, query: &str) -> Result<Vec<serde_json::Value>> {
    let client = reqwest::Client::new();
    let resp = client
        .post(search_url)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .context("Failed to connect to connector")?;

    if !resp.status().is_success() {
        let text = resp.text().await?;
        anyhow::bail!("Search failed: {}", text);
    }

    let data: serde_json::Value = resp.json().await?;
    let users = if let Some(arr) = data.as_array() {
        arr.clone()
    } else if let Some(arr) = data.get("users").and_then(|u| u.as_array()) {
        arr.clone()
    } else if let Some(arr) = data.get("results").and_then(|r| r.as_array()) {
        arr.clone()
    } else {
        Vec::new()
    };

    Ok(users)
}

/// Get token for a user via connector
pub async fn connector_get_token(token_url: &str, user_id: &str) -> Result<String> {
    let url = token_url.replace("{id}", user_id);
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .send()
        .await
        .context("Failed to connect to connector")?;

    if !resp.status().is_success() {
        let text = resp.text().await?;
        anyhow::bail!("Failed to get token: {}", text);
    }

    let data: serde_json::Value = resp.json().await?;
    let token = data.get("token")
        .or_else(|| data.get("access_token"))
        .and_then(|t| t.as_str())
        .context("No token in response")?;

    Ok(token.to_string())
}
