use anyhow::Result;
use apiforge_core::environment::EnvironmentManager;
use apiforge_core::server;
use apiforge_spec::{scanner, spec_builder};
use crossterm::style::Stylize;
use std::path::PathBuf;

pub async fn execute(
    source: String,
    environment: Option<String>,
    base_url: Option<String>,
    name: Option<String>,
    verbose: bool,
) -> Result<()> {
    // Check auth
    let token = apiforge_core::auth::resolve_token();
    if token.is_none() {
        anyhow::bail!("Not logged in. Run `apiforge auth login` or set APIFORGE_TOKEN.");
    }

    let source_dir = PathBuf::from(&source);
    if !source_dir.is_dir() {
        anyhow::bail!("Source directory not found: {}", source);
    }

    // Step 1: Resolve environment variables
    let mut env_vars = std::collections::HashMap::new();
    let mut resolved_base_url = base_url;

    if let Some(env_name) = &environment {
        let env_manager = EnvironmentManager::new()?;
        match env_manager.get(env_name)? {
            Some(env) => {
                env_vars = env.variables.clone();
                if resolved_base_url.is_none() {
                    if let Some(bu) = env_vars.get("baseUrl") {
                        resolved_base_url = Some(bu.clone());
                    } else if !env.base_url.is_empty() {
                        resolved_base_url = Some(env.base_url.clone());
                    }
                }
                println!(
                    "Environment \"{}\": {} variable(s)",
                    env_name,
                    env_vars.len().to_string().cyan()
                );
            }
            None => {
                println!("{}", format!("Environment \"{}\" not found locally.", env_name).yellow());
                if resolved_base_url.is_none() {
                    println!(
                        "Tip: Create it with: apiforge env create {} --set baseUrl=https://...",
                        env_name
                    );
                }
            }
        }
    }

    // Step 2: Generate spec
    println!("Scanning NestJS source: {}", source_dir.display());
    let ts_files = scanner::find_ts_files(&source_dir);
    println!("Found {} TypeScript files", ts_files.len().to_string().cyan());

    let options = spec_builder::SpecOptions {
        title: name.clone().unwrap_or_else(|| "API".to_string()),
        version: "1.0.0".to_string(),
        description: None,
        servers: Vec::new(),
    };
    let mut spec = spec_builder::build_spec(&ts_files, &options);

    let path_count = spec.paths.len();
    let op_count: usize = spec.paths.values().map(|methods| methods.len()).sum();
    println!(
        "Generated spec: {} paths, {} operations",
        path_count.to_string().green().bold(),
        op_count.to_string().green().bold()
    );

    // Step 3: Apply environment to spec
    if let Some(bu) = &resolved_base_url {
        spec.servers = Some(vec![apiforge_spec::models::Server {
            url: bu.clone(),
        }]);
        println!("Server URL: {}", bu);
    }

    // Step 4: Upload collection
    let collection_name = name.clone().unwrap_or_else(|| spec.info.title.clone());
    let display_name = match &environment {
        Some(env) => format!("{} ({})", collection_name, env),
        None => collection_name.clone(),
    };

    println!(
        "Uploading \"{}\" to {}...",
        display_name,
        server::get_server_url()
    );

    let spec_string = serde_json::to_string(&spec)?;
    let resp = server::server_fetch(
        "/api/collections",
        "POST",
        Some(serde_json::json!({
            "name": display_name,
            "spec": spec_string,
        })),
    )
    .await?;

    if !resp.ok {
        let err = resp.body.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
        anyhow::bail!("Upload failed: {}", err);
    }

    let id = resp.body.get("id").and_then(|i| i.as_str()).unwrap_or("-");
    println!(
        "{}",
        format!("Collection uploaded: {} (ID: {})", display_name, id).green()
    );

    // Step 5: Sync environment to server
    if let Some(env_name) = &environment {
        if !env_vars.is_empty() {
            let env_resp = server::server_fetch(
                "/api/environments",
                "POST",
                Some(serde_json::json!({
                    "name": env_name,
                    "variables": serde_json::to_string(&env_vars)?,
                })),
            )
            .await?;

            if env_resp.ok {
                println!("Environment \"{}\" synced to server", env_name);
            } else if verbose {
                let err = env_resp.body.get("error").and_then(|e| e.as_str()).unwrap_or("unknown");
                println!("Environment sync: {}", err);
            }
        }
    }

    println!();
    println!("{}", "Deploy complete.".green().bold());
    Ok(())
}
