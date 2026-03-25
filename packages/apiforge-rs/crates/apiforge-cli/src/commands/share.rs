use anyhow::Result;
use crossterm::style::Stylize;
use std::collections::HashMap;
use apiforge_core::http_client::ApiRequest;
use apiforge_core::share;

pub fn execute(
    method: String,
    url: String,
    headers: Vec<String>,
    body: Option<String>,
) -> Result<()> {
    let mut header_map = HashMap::new();
    for h in &headers {
        if let Some((k, v)) = h.split_once(':') {
            header_map.insert(k.trim().to_string(), v.trim().to_string());
        }
    }

    let request = ApiRequest {
        method: method.to_uppercase(),
        url,
        headers: header_map,
        body,
        body_type: "raw".to_string(),
    };

    let link = share::create_share_link(&request);

    println!("{}", "  Share link created:".bold());
    println!();
    println!("  {}", link.clone().cyan());
    println!();
    println!("  {} {} {}", "Request:".dark_grey(), request.method, request.url);

    Ok(())
}
