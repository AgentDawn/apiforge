use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub token: Option<String>,
    pub server_url: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorConfig {
    pub search_url: String,
    pub token_url: String,
}

/// Resolve the auth token with precedence: env var > connector > saved
pub fn resolve_token() -> Option<String> {
    // 1. Environment variable
    if let Ok(token) = std::env::var("APIFORGE_TOKEN") {
        if !token.is_empty() {
            return Some(token);
        }
    }

    let data_dir = super::environment::get_data_dir().ok()?;

    // 2. Connector token
    let connector_token_path = data_dir.join("connector-token.json");
    if connector_token_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&connector_token_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(token) = val.get("token").and_then(|t| t.as_str()) {
                    return Some(token.to_string());
                }
            }
        }
    }

    // 3. Saved auth
    let auth_path = data_dir.join("auth.json");
    if auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&auth_path) {
            if let Ok(config) = serde_json::from_str::<AuthConfig>(&content) {
                return config.token;
            }
        }
    }

    None
}

pub fn resolve_server_url() -> Option<String> {
    if let Ok(url) = std::env::var("APIFORGE_SERVER") {
        if !url.is_empty() {
            return Some(url);
        }
    }

    let data_dir = super::environment::get_data_dir().ok()?;
    let auth_path = data_dir.join("auth.json");
    if auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&auth_path) {
            if let Ok(config) = serde_json::from_str::<AuthConfig>(&content) {
                return config.server_url;
            }
        }
    }

    None
}

pub fn get_auth_headers(auth_type: &str, config: &serde_json::Value) -> Vec<(String, String)> {
    let mut headers = Vec::new();
    match auth_type {
        "bearer" => {
            if let Some(token) = config.get("token").and_then(|t| t.as_str()) {
                let prefix = config.get("prefix").and_then(|p| p.as_str()).unwrap_or("Bearer");
                headers.push(("Authorization".to_string(), format!("{} {}", prefix, token)));
            }
        }
        "basic" => {
            if let (Some(user), Some(pass)) = (
                config.get("username").and_then(|u| u.as_str()),
                config.get("password").and_then(|p| p.as_str()),
            ) {
                use base64::Engine;
                let encoded = base64::engine::general_purpose::STANDARD.encode(format!("{}:{}", user, pass));
                headers.push(("Authorization".to_string(), format!("Basic {}", encoded)));
            }
        }
        "apikey" => {
            if let (Some(name), Some(value)) = (
                config.get("name").and_then(|n| n.as_str()),
                config.get("value").and_then(|v| v.as_str()),
            ) {
                let location = config.get("location").and_then(|l| l.as_str()).unwrap_or("header");
                if location == "header" {
                    headers.push((name.to_string(), value.to_string()));
                }
            }
        }
        _ => {}
    }
    headers
}
