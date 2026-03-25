use anyhow::Result;
use apiforge_core::collection::CollectionManager;
use apiforge_core::openapi_parser::OpenApiParser;
use crossterm::style::Stylize;

pub async fn execute(source: String, name: Option<String>) -> Result<()> {
    let parser = if source.starts_with("http://") || source.starts_with("https://") {
        println!("Fetching spec from {}...", source);
        OpenApiParser::from_url(&source).await?
    } else {
        println!("Reading spec from {}...", source);
        let content = std::fs::read_to_string(&source)
            .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", source, e))?;
        OpenApiParser::parse(&content)?
    };

    let info = parser.get_info();
    let endpoints = parser.get_endpoints();
    let tags = parser.get_tags();
    let servers = parser.get_servers();

    // Convert to collection and save locally
    let collection = parser.to_collection(name.as_deref());
    let manager = CollectionManager::new()?;
    manager.save(&collection)?;

    println!();
    println!("{}", format!("Imported: {}", collection.name).green().bold());
    println!("  Version: {}", info.version);
    println!("  Endpoints: {}", endpoints.len().to_string().cyan());
    println!("  Tags: {}", tags.join(", "));
    println!("  Collection ID: {}", collection.id.clone().dark_grey());

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

    println!();
    println!("{}", "Done!".green());
    Ok(())
}
