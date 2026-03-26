use anyhow::Result;
use apiforge_core::server;
use apiforge_core::auth::ConnectorConfig;
use crossterm::style::Stylize;

use crate::AuthAction;

pub async fn execute(action: AuthAction) -> Result<()> {
    match action {
        AuthAction::Login {
            username,
            password,
            server: server_url,
        } => {
            let server_url = server_url.unwrap_or_else(server::get_server_url);
            println!("Logging in to {}...", server_url);

            let config = server::login(&server_url, &username, &password).await?;
            let name = config.username.clone().unwrap_or_else(|| "unknown".to_string());
            server::save_auth(&config)?;
            println!("{}", format!("Logged in as {}", name).green());
        }
        AuthAction::Register {
            username,
            password,
            server: server_url,
        } => {
            let server_url = server_url.unwrap_or_else(server::get_server_url);

            if password.len() < 6 {
                anyhow::bail!("Password must be at least 6 characters");
            }

            println!("Registering on {}...", server_url);

            let config = server::register(&server_url, &username, &password).await?;
            let name = config.username.clone().unwrap_or_else(|| "unknown".to_string());
            server::save_auth(&config)?;
            println!("{}", format!("Registered and logged in as {}", name).green());
        }
        AuthAction::Logout => {
            server::clear_auth()?;
            println!("Logged out. Auth credentials cleared.");
        }
        AuthAction::Server { url } => {
            if let Some(new_url) = url {
                let new_url = new_url.trim_end_matches('/').to_string();
                // Update server URL in auth.json
                let mut config = server::load_auth().unwrap_or(apiforge_core::auth::AuthConfig {
                    token: None,
                    server_url: None,
                    username: None,
                });
                config.server_url = Some(new_url.clone());
                config.token = None;
                config.username = None;
                server::save_auth(&config)?;
                println!("{}", format!("Server URL set to: {}", new_url).green());
                println!("Credentials cleared. Please login again: apiforge auth login -u <user> -p <pass>");
            } else {
                println!("Current server: {}", server::get_server_url());
            }
        }
        AuthAction::Status => {
            if let Ok(token) = std::env::var("APIFORGE_TOKEN") {
                if !token.is_empty() {
                    println!(
                        "Auth: APIFORGE_TOKEN environment variable ({}...)",
                        &token[..token.len().min(12)]
                    );
                    println!("Server: {}", server::get_server_url());
                    return Ok(());
                }
            }

            match server::load_auth() {
                Some(auth) if auth.token.is_some() => {
                    println!(
                        "Logged in as: {}",
                        auth.username.unwrap_or_else(|| "unknown".to_string())
                    );
                    println!(
                        "Server: {}",
                        auth.server_url.unwrap_or_else(|| "http://localhost:8090".to_string())
                    );
                }
                _ => {
                    println!("{}", "Not logged in.".dark_grey());
                }
            }
        }
        AuthAction::Whoami => {
            match server::load_connector_token() {
                Some(data) => {
                    let email = data
                        .get("user")
                        .and_then(|u| u.get("email"))
                        .and_then(|e| e.as_str())
                        .unwrap_or("unknown");
                    println!("Connector user: {}", email);
                    if let Some(name) = data.get("user").and_then(|u| u.get("name")).and_then(|n| n.as_str()) {
                        println!("  Name: {}", name);
                    }
                    if let Some(role) = data.get("user").and_then(|u| u.get("role")).and_then(|r| r.as_str()) {
                        println!("  Role: {}", role);
                    }
                }
                None => {
                    println!("{}", "No connector user. Use: apiforge auth switch <email>".dark_grey());
                }
            }
        }
        AuthAction::ConnectorConfig {
            search_url,
            token_url,
        } => {
            if search_url.is_none() && token_url.is_none() {
                // Show current config
                match server::load_connector_config() {
                    Some(config) => {
                        println!("Connector config:");
                        println!("  Search URL: {}", config.search_url);
                        println!("  Token URL:  {}", config.token_url);
                    }
                    None => {
                        println!("{}", "No connector configured.".dark_grey());
                        println!("Usage: apiforge auth connector-config --search-url <url> --token-url <url>");
                    }
                }
                return Ok(());
            }

            let search = search_url.ok_or_else(|| anyhow::anyhow!("--search-url is required"))?;
            let token = token_url.ok_or_else(|| anyhow::anyhow!("--token-url is required"))?;

            let config = ConnectorConfig {
                search_url: search.clone(),
                token_url: token.clone(),
            };
            server::save_connector_config(&config)?;
            println!("Connector configured:");
            println!("  Search URL: {}", search);
            println!("  Token URL:  {}", token);
        }
        AuthAction::Search { query } => {
            let config = server::load_connector_config()
                .ok_or_else(|| anyhow::anyhow!("Connector not configured. Run: apiforge auth connector-config --search-url <url> --token-url <url>"))?;

            let users = server::connector_search(&config.search_url, &query).await?;
            print_users_table(&users);
        }
        AuthAction::Switch { email } => {
            let config = server::load_connector_config()
                .ok_or_else(|| anyhow::anyhow!("Connector not configured. Run: apiforge auth connector-config --search-url <url> --token-url <url>"))?;

            let users = server::connector_search(&config.search_url, &email).await?;
            let user = users.iter().find(|u| {
                u.get("email").and_then(|e| e.as_str()) == Some(&email)
            });

            let user = match user {
                Some(u) => u,
                None => {
                    if !users.is_empty() {
                        eprintln!("User not found: {}. Did you mean one of these?", email);
                        print_users_table(&users);
                    } else {
                        eprintln!("User not found: {}", email);
                    }
                    anyhow::bail!("User not found");
                }
            };

            let user_id = user.get("id")
                .map(|id| {
                    if let Some(n) = id.as_u64() {
                        n.to_string()
                    } else if let Some(s) = id.as_str() {
                        s.to_string()
                    } else {
                        id.to_string()
                    }
                })
                .ok_or_else(|| anyhow::anyhow!("User has no id field"))?;

            let token = server::connector_get_token(&config.token_url, &user_id).await?;
            let token_data = serde_json::json!({
                "token": token,
                "user": {
                    "id": user.get("id"),
                    "email": user.get("email").and_then(|e| e.as_str()),
                    "name": user.get("name").and_then(|n| n.as_str()),
                    "role": user.get("role").and_then(|r| r.as_str()),
                }
            });
            server::save_connector_token(&token_data)?;
            println!("{}", format!("Authenticated as {} (token saved)", email).green());
        }
        AuthAction::ConnectorClear => {
            if server::clear_connector_token()? {
                println!("Connector token cleared.");
            } else {
                println!("{}", "No connector token to clear.".dark_grey());
            }
        }
    }
    Ok(())
}

fn print_users_table(users: &[serde_json::Value]) {
    if users.is_empty() {
        println!("{}", "No users found.".dark_grey());
        return;
    }

    let id_w = users.iter()
        .map(|u| u.get("id").map(|i| i.to_string().len()).unwrap_or(2))
        .max().unwrap_or(2).max(2);
    let email_w = users.iter()
        .map(|u| u.get("email").and_then(|e| e.as_str()).unwrap_or("").len())
        .max().unwrap_or(5).max(5);
    let name_w = users.iter()
        .map(|u| u.get("name").and_then(|n| n.as_str()).unwrap_or("").len())
        .max().unwrap_or(4).max(4);

    println!(
        "{:<id_w$}    {:<email_w$}    {:<name_w$}    ROLE",
        "ID", "EMAIL", "NAME",
        id_w = id_w, email_w = email_w, name_w = name_w
    );
    for u in users {
        let id = u.get("id").map(|i| i.to_string()).unwrap_or_default();
        let email = u.get("email").and_then(|e| e.as_str()).unwrap_or("");
        let name = u.get("name").and_then(|n| n.as_str()).unwrap_or("");
        let role = u.get("role").and_then(|r| r.as_str()).unwrap_or("");
        println!(
            "{:<id_w$}    {:<email_w$}    {:<name_w$}    {}",
            id, email, name, role,
            id_w = id_w, email_w = email_w, name_w = name_w
        );
    }
}
