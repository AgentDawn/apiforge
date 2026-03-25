use anyhow::{Result, bail};
use std::collections::HashMap;

use crate::http_client::ApiRequest;

/// Parse a cURL command string into an ApiRequest
pub fn parse_curl(input: &str) -> Result<ApiRequest> {
    let input = input.trim();
    let input = if input.starts_with("curl ") { &input[5..] } else { bail!("Not a valid cURL command") };

    let args = shell_words::split(input)?;

    let mut method = "GET".to_string();
    let mut url = String::new();
    let mut headers = HashMap::new();
    let mut body = None;
    let mut i = 0;

    while i < args.len() {
        match args[i].as_str() {
            "-X" | "--request" => {
                i += 1;
                if i < args.len() { method = args[i].to_uppercase(); }
            }
            "-H" | "--header" => {
                i += 1;
                if i < args.len() {
                    if let Some((key, value)) = args[i].split_once(':') {
                        headers.insert(key.trim().to_string(), value.trim().to_string());
                    }
                }
            }
            "-d" | "--data" | "--data-raw" => {
                i += 1;
                if i < args.len() {
                    body = Some(args[i].clone());
                    if method == "GET" { method = "POST".to_string(); }
                }
            }
            arg if !arg.starts_with('-') && url.is_empty() => {
                url = arg.to_string();
            }
            _ => {} // skip unknown flags
        }
        i += 1;
    }

    if url.is_empty() {
        bail!("No URL found in cURL command");
    }

    let body_type = if headers.values().any(|v| v.contains("application/json")) {
        "json".to_string()
    } else if headers.values().any(|v| v.contains("application/x-www-form-urlencoded")) {
        "form-urlencoded".to_string()
    } else {
        "raw".to_string()
    };

    Ok(ApiRequest {
        method,
        url,
        headers,
        body,
        body_type,
    })
}

/// Convert an ApiRequest into a cURL command string
pub fn to_curl(request: &ApiRequest) -> String {
    let mut parts = vec!["curl".to_string()];

    if request.method != "GET" {
        parts.push("-X".to_string());
        parts.push(request.method.clone());
    }

    for (key, value) in &request.headers {
        parts.push("-H".to_string());
        parts.push(format!("'{}: {}'", key, value));
    }

    if let Some(body) = &request.body {
        parts.push("-d".to_string());
        parts.push(format!("'{}'", body.replace('\'', "'\\''")));
    }

    parts.push(format!("'{}'", request.url));
    parts.join(" ")
}
