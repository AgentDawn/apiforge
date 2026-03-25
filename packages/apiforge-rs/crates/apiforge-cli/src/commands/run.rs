use anyhow::Result;
use apiforge_core::{
    http_client::{self, ApiRequest},
    environment::{self, EnvironmentManager},
    history::{self, HistoryStore},
    output,
    curl_parser,
};
use crossterm::style::Stylize;
use std::collections::HashMap;

use crate::HistoryAction;

const HTTP_METHODS: &[&str] = &["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

pub async fn execute(
    method_or_path: String,
    url: Option<String>,
    headers: Vec<String>,
    query: Vec<String>,
    body: Option<String>,
    env_name: Option<String>,
    vars: Vec<String>,
    as_curl: bool,
    verbose: bool,
) -> Result<()> {
    let is_http = HTTP_METHODS.contains(&method_or_path.to_uppercase().as_str());

    if !is_http {
        eprintln!("{}", "Collection-based run not yet implemented in Rust CLI.".yellow());
        return Ok(());
    }

    let method = method_or_path.to_uppercase();
    let raw_url = url.unwrap_or_default();

    // Resolve environment variables
    let mut all_vars = HashMap::new();
    if let Some(env_name) = &env_name {
        let manager = EnvironmentManager::new()?;
        if let Some(env) = manager.get(env_name)? {
            all_vars.extend(env.variables);
            if !env.base_url.is_empty() {
                all_vars.insert("base_url".to_string(), env.base_url);
            }
        }
    }
    for v in &vars {
        if let Some((k, val)) = v.split_once('=') {
            all_vars.insert(k.to_string(), val.to_string());
        }
    }

    let resolved_url = environment::resolve_variables(&raw_url, &all_vars);

    // Build URL with query params
    let mut final_url = resolved_url;
    if !query.is_empty() {
        let mut parsed = url::Url::parse(&final_url)?;
        for q in &query {
            if let Some((k, v)) = q.split_once('=') {
                parsed.query_pairs_mut().append_pair(k, v);
            }
        }
        final_url = parsed.to_string();
    }

    // Parse headers
    let mut header_map = HashMap::new();
    for h in &headers {
        if let Some((k, v)) = h.split_once(':') {
            header_map.insert(k.trim().to_string(), environment::resolve_variables(v.trim(), &all_vars));
        }
    }

    // Resolve body
    let resolved_body = body.map(|b| environment::resolve_variables(&b, &all_vars));

    let request = ApiRequest {
        method: method.clone(),
        url: final_url.clone(),
        headers: header_map,
        body: resolved_body,
        body_type: "raw".to_string(),
    };

    // Export as cURL
    if as_curl {
        println!("{}", curl_parser::to_curl(&request));
        return Ok(());
    }

    // Print request info
    if verbose {
        print!("  ");
        output::print_method(&method);
        println!(" {}", final_url);
        for (k, v) in &request.headers {
            println!("  > {}: {}", k.clone().dark_grey(), v);
        }
        if let Some(body) = &request.body {
            println!("  > Body: {} bytes", body.len());
        }
        println!();
    }

    // Execute
    let response = http_client::send_request(&request).await?;

    // Print response
    print!("  ");
    output::print_status(response.status, &response.status_text);
    print!("  ");
    output::print_timing(response.timing_ms);
    print!("  ");
    output::print_size(response.size_bytes);
    println!();

    if verbose {
        println!();
        for (k, v) in &response.headers {
            println!("  < {}: {}", k.clone().dark_grey(), v);
        }
    }

    println!();
    println!("{}", output::pretty_json(&response.body));

    // Save to history
    let store = HistoryStore::new()?;
    let entry = history::create_entry(
        &method, &final_url, response.status, response.timing_ms,
        request.body.as_deref(), Some(&response.body),
    );
    store.save(&entry)?;

    Ok(())
}

pub fn handle_history(action: HistoryAction) -> Result<()> {
    let store = HistoryStore::new()?;
    match action {
        HistoryAction::List { limit } => {
            let entries = store.list(limit)?;
            if entries.is_empty() {
                println!("{}", "  No request history.".dark_grey());
            } else {
                println!("{}", format!("  Last {} request(s):", entries.len()).bold());
                println!();
                for e in &entries {
                    print!("  ");
                    output::print_status(e.status, "");
                    print!(" ");
                    output::print_method(&e.method);
                    print!(" {} ", e.url);
                    output::print_timing(e.timing_ms);
                    println!("  {}", e.timestamp.clone().dark_grey());
                }
            }
        }
        HistoryAction::Clear => {
            let count = store.clear()?;
            println!("{}", format!("  Cleared {} history entries.", count).green());
        }
    }
    Ok(())
}
