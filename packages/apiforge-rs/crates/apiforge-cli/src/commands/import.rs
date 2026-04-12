use anyhow::Result;
use apiforge_core::collection::CollectionManager;
use apiforge_core::openapi_parser::OpenApiParser;
use apiforge_core::postman_parser;
use crossterm::style::Stylize;

pub async fn execute(source: String, name: Option<String>) -> Result<()> {
    let content = if source.starts_with("http://") || source.starts_with("https://") {
        println!("Fetching spec from {}...", source);
        let client = reqwest::Client::new();
        client.get(&source).send().await?.text().await?
    } else {
        println!("Reading spec from {}...", source);
        std::fs::read_to_string(&source)
            .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", source, e))?
    };

    // Detect format: Postman or OpenAPI
    let parsed: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| anyhow::anyhow!("Failed to parse JSON: {}", e))?;

    let (collection, spec_content, is_postman) = if postman_parser::is_postman_collection(&parsed) {
        println!("{}", "Detected Postman collection format.".cyan());
        let parser = postman_parser::PostmanParser::parse(&content)?;
        let collection = parser.to_collection(name.as_deref());
        (collection, content.clone(), true)
    } else {
        let parser = OpenApiParser::parse(&content)?;
        let info = parser.get_info();
        let endpoints = parser.get_endpoints();
        let tags = parser.get_tags();
        let servers = parser.get_servers();

        let collection = parser.to_collection(name.as_deref());

        println!();
        println!("  Version: {}", info.version);
        println!("  Endpoints: {}", endpoints.len().to_string().cyan());
        println!("  Tags: {}", tags.join(", "));

        // Auto-create environments from servers
        if !servers.is_empty() {
            let env_manager = apiforge_core::environment::EnvironmentManager::new()?;
            let mut created = 0;
            for (i, srv) in servers.iter().enumerate() {
                let env_name = srv.description.clone()
                    .unwrap_or_else(|| format!("server-{}", i + 1));
                let mut variables = std::collections::HashMap::new();
                variables.insert("baseUrl".to_string(), srv.url.clone());
                let env = apiforge_core::environment::Environment {
                    name: env_name.clone(),
                    base_url: srv.url.clone(),
                    variables,
                };
                env_manager.create(&env)?;
                println!("  Created env: {} (baseUrl: {})", env_name, srv.url);
                created += 1;
            }
            if created > 0 {
                println!();
                println!(
                    "{}",
                    format!("Created {} environment(s) from spec servers.", created).green()
                );
            }
        }

        (collection, content.clone(), false)
    };

    // Save locally
    let manager = CollectionManager::new()?;
    manager.save(&collection)?;

    println!();
    println!("{}", format!("Imported: {}", collection.name).green().bold());
    if is_postman {
        println!("  Items: {}", collection.items.len().to_string().cyan());
    }
    println!("  Collection ID: {}", collection.id.clone().dark_grey());

    // Sync to server if logged in
    if let Some(token) = apiforge_core::auth::resolve_token() {
        if let Ok(server_url) = apiforge_core::auth::resolve_server_url() {
            println!();
            println!("Syncing to server...");
            match sync_to_server(&server_url, &token, &collection.name, &spec_content).await {
                Ok(()) => println!("{}", "  Synced to server.".green()),
                Err(e) => eprintln!("{}", format!("  Warning: failed to sync to server: {}", e).yellow()),
            }
        }
    }

    println!();
    println!("{}", "Done!".green());
    Ok(())
}

async fn sync_to_server(server_url: &str, token: &str, name: &str, spec: &str) -> Result<()> {
    let url = format!("{}/api/collections", server_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", token))
        .json(&serde_json::json!({
            "name": name,
            "spec": spec,
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        let text = resp.text().await?;
        anyhow::bail!("{}", text);
    }
    Ok(())
}
