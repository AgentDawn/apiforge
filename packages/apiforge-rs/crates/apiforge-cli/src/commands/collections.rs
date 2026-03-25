use anyhow::Result;
use apiforge_core::server;
use crossterm::style::Stylize;

use crate::CollectionsAction;

pub async fn execute(action: CollectionsAction) -> Result<()> {
    // All collection commands require auth
    let token = apiforge_core::auth::resolve_token();
    if token.is_none() {
        anyhow::bail!("Not logged in. Run `apiforge auth login` first.");
    }

    match action {
        CollectionsAction::List => {
            let resp = server::server_fetch("/api/collections", "GET", None).await?;
            if !resp.ok {
                let err = resp.body.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                anyhow::bail!("Failed to list collections: {}", err);
            }

            let collections = resp.body.as_array();
            match collections {
                Some(arr) if !arr.is_empty() => {
                    println!("{}", format!("Found {} collection(s):", arr.len()).bold());
                    println!();
                    for col in arr {
                        let id = col.get("id").and_then(|i| i.as_str()).unwrap_or("-");
                        let name = col.get("name").and_then(|n| n.as_str()).unwrap_or("Untitled");
                        let updated = col.get("updated_at").and_then(|u| u.as_str()).unwrap_or("-");
                        println!("  {}  {}  (updated: {})", id.dark_grey(), name.bold(), updated);
                    }
                }
                _ => {
                    println!("{}", "No collections found.".dark_grey());
                }
            }
        }
        CollectionsAction::Show { id } => {
            let resp = server::server_fetch(&format!("/api/collections/{}", id), "GET", None).await?;
            if !resp.ok {
                let err = resp.body.get("error").and_then(|e| e.as_str()).unwrap_or("Not found");
                anyhow::bail!("Failed to get collection: {}", err);
            }

            let name = resp.body.get("name").and_then(|n| n.as_str()).unwrap_or("Untitled");
            let col_id = resp.body.get("id").and_then(|i| i.as_str()).unwrap_or("-");
            let created = resp.body.get("created_at").and_then(|c| c.as_str()).unwrap_or("-");
            let updated = resp.body.get("updated_at").and_then(|u| u.as_str()).unwrap_or("-");

            println!("{}", format!("Collection: {}", name).bold());
            println!("ID: {}", col_id);
            println!("Created: {}", created);
            println!("Updated: {}", updated);

            // Try to parse spec and show endpoints
            if let Some(spec_str) = resp.body.get("spec").and_then(|s| s.as_str()) {
                if let Ok(spec) = serde_json::from_str::<serde_json::Value>(spec_str) {
                    if let Some(paths) = spec.get("paths").and_then(|p| p.as_object()) {
                        println!();
                        println!("Endpoints: {}", paths.len().to_string().cyan());
                        for (path, methods) in paths {
                            if let Some(methods) = methods.as_object() {
                                for (method, _) in methods {
                                    if method == "parameters" {
                                        continue;
                                    }
                                    println!("  {} {}", method.to_uppercase().bold(), path);
                                }
                            }
                        }
                    }
                }
            }
        }
        CollectionsAction::Push { file, name } => {
            let abs_path = std::fs::canonicalize(&file)
                .map_err(|e| anyhow::anyhow!("Failed to resolve path {}: {}", file, e))?;
            let spec_content = std::fs::read_to_string(&abs_path)
                .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", file, e))?;

            // Validate JSON
            let _: serde_json::Value = serde_json::from_str(&spec_content)
                .map_err(|e| anyhow::anyhow!("Invalid JSON: {}", e))?;

            let collection_name = name.unwrap_or_else(|| {
                // Try to extract title from spec
                if let Ok(spec) = serde_json::from_str::<serde_json::Value>(&spec_content) {
                    if let Some(title) = spec.get("info").and_then(|i| i.get("title")).and_then(|t| t.as_str()) {
                        return title.to_string();
                    }
                }
                abs_path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Untitled")
                    .to_string()
            });

            println!("Uploading \"{}\" to server...", collection_name);

            let resp = server::server_fetch(
                "/api/collections",
                "POST",
                Some(serde_json::json!({
                    "name": collection_name,
                    "spec": spec_content,
                })),
            ).await?;

            if !resp.ok {
                let err = resp.body.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                anyhow::bail!("Failed to save collection: {}", err);
            }

            let id = resp.body.get("id").and_then(|i| i.as_str()).unwrap_or("-");
            let saved_name = resp.body.get("name").and_then(|n| n.as_str()).unwrap_or(&collection_name);
            println!("{}", format!("Collection saved: {} (ID: {})", saved_name, id).green());
        }
        CollectionsAction::Pull { id, output } => {
            let resp = server::server_fetch(&format!("/api/collections/{}", id), "GET", None).await?;
            if !resp.ok {
                let err = resp.body.get("error").and_then(|e| e.as_str()).unwrap_or("Not found");
                anyhow::bail!("Failed to get collection: {}", err);
            }

            let name = resp.body.get("name").and_then(|n| n.as_str()).unwrap_or("collection");
            let output_path = output.unwrap_or_else(|| {
                let safe_name: String = name.chars()
                    .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
                    .collect();
                format!("{}.json", safe_name)
            });

            let spec_str = resp.body.get("spec").and_then(|s| s.as_str()).unwrap_or("{}");
            let content = match serde_json::from_str::<serde_json::Value>(spec_str) {
                Ok(spec) => serde_json::to_string_pretty(&spec)?,
                Err(_) => spec_str.to_string(),
            };

            std::fs::write(&output_path, &content)?;
            println!("{}", format!("Collection \"{}\" saved to {}", name, output_path).green());
        }
        CollectionsAction::Delete { id } => {
            let resp = server::server_fetch(
                &format!("/api/collections/{}", id),
                "DELETE",
                None,
            ).await?;

            if !resp.ok {
                let err = resp.body.get("error").and_then(|e| e.as_str()).unwrap_or("Not found");
                anyhow::bail!("Failed to delete: {}", err);
            }

            println!("{}", format!("Collection {} deleted.", id).green());
        }
    }
    Ok(())
}
