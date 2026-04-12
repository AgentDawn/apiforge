use anyhow::Result;
use apiforge_core::server;
use crossterm::style::Stylize;

use crate::GrpcAction;

pub async fn execute(action: GrpcAction) -> Result<()> {
    match action {
        GrpcAction::ListServices { proto } => {
            let services = apiforge_grpc::list_services(&proto)?;
            if services.is_empty() {
                println!("{}", "  No services found in proto file.".dark_grey());
                return Ok(());
            }
            println!("{}", format!("  Found {} service(s):", services.len()).bold());
            println!();
            for svc in &services {
                println!("  {} {} ({} methods)",
                    "service".dark_grey(),
                    svc.name.clone().green(),
                    svc.method_count
                );
                for method in &svc.methods {
                    println!("    {} {}.{}", "rpc".dark_grey(), svc.name, method);
                }
            }
            Ok(())
        }
        GrpcAction::Call { service_method, proto, address, data, tls } => {
            // Parse service.method (accept both "." and "/")
            let (service, method) = service_method.split_once('.')
                .or_else(|| service_method.split_once('/'))
                .ok_or_else(|| anyhow::anyhow!(
                    "Invalid service_method format. Use 'ServiceName.MethodName' or 'ServiceName/MethodName'"
                ))?;

            // Read .proto file content
            let proto_content = std::fs::read_to_string(&proto)
                .map_err(|e| anyhow::anyhow!("Failed to read {}: {}", proto, e))?;

            // Validate JSON data
            let data_str = data.as_deref().unwrap_or("{}");
            let data_json: serde_json::Value = serde_json::from_str(data_str)
                .map_err(|e| anyhow::anyhow!("Invalid JSON data: {}", e))?;

            // Require auth - the server endpoint is protected
            if apiforge_core::auth::resolve_token().is_none() {
                anyhow::bail!(
                    "Not logged in. Run `apiforge auth login` first.\n\
                     Native gRPC calls are routed through the APIForge server for dynamic protobuf encoding."
                );
            }

            println!("  {} {}.{} @ {}",
                "gRPC".dark_grey(),
                service.green(),
                method,
                address
            );

            // Call the APIForge server's native gRPC endpoint
            let payload = serde_json::json!({
                "target": address,
                "service": service,
                "method": method,
                "body": data_json,
                "metadata": {},
                "tls": tls,
                "proto": proto_content,
            });

            let resp = server::server_fetch("/api/grpc/native", "POST", Some(payload)).await?;

            if !resp.ok {
                let err = resp.body.get("error")
                    .and_then(|e| e.as_str())
                    .unwrap_or("Unknown error");

                // Show available services/methods if provided
                if let Some(available) = resp.body.get("available").and_then(|a| a.as_array()) {
                    let list: Vec<String> = available.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                    anyhow::bail!("{}\nAvailable: {}", err, list.join(", "));
                }

                anyhow::bail!("{}", err);
            }

            // Print response
            if let Some(timing) = resp.body.get("timing_ms").and_then(|t| t.as_u64()) {
                println!("  {} {}ms", "timing".dark_grey(), timing);
            }
            println!();

            if let Some(response) = resp.body.get("response") {
                let pretty = serde_json::to_string_pretty(response)?;
                println!("{}", pretty);
            } else {
                println!("{}", serde_json::to_string_pretty(&resp.body)?);
            }

            Ok(())
        }
    }
}
