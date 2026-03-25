use anyhow::{Result, bail};
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
        GrpcAction::Call { service_method, proto, address, data } => {
            // Parse service.method
            let (service, method) = service_method.split_once('.')
                .or_else(|| service_method.split_once('/'))
                .ok_or_else(|| anyhow::anyhow!(
                    "Invalid service_method format. Use 'ServiceName.MethodName' or 'ServiceName/MethodName'"
                ))?;

            // Verify service/method exist in proto
            let services = apiforge_grpc::list_services(&proto)?;
            let svc = services.iter().find(|s| s.name == service);
            if let Some(svc) = svc {
                if !svc.methods.iter().any(|m| m == method) {
                    bail!("Method '{}' not found in service '{}'. Available: {}",
                        method, service, svc.methods.join(", "));
                }
            } else {
                let available: Vec<&str> = services.iter().map(|s| s.name.as_str()).collect();
                bail!("Service '{}' not found. Available: {}", service, available.join(", "));
            }

            println!("  {} {}.{} @ {}",
                "gRPC".dark_grey(),
                service.green(),
                method,
                address
            );

            let data_str = data.as_deref().unwrap_or("{}");
            match apiforge_grpc::call_grpc(&address, service, method, data_str).await {
                Ok(response) => {
                    println!("{}", response);
                    Ok(())
                }
                Err(e) => {
                    println!();
                    println!("{}", format!("  {}", e).yellow());
                    Ok(())
                }
            }
        }
    }
}
