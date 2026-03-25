use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub body_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub timing_ms: u64,
    pub size_bytes: usize,
}

pub async fn send_request(request: &ApiRequest) -> Result<ApiResponse> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;

    let method: reqwest::Method = request.method.parse()?;
    let mut builder = client.request(method, &request.url);

    for (key, value) in &request.headers {
        builder = builder.header(key, value);
    }

    if let Some(body) = &request.body {
        builder = builder.body(body.clone());
    }

    let start = Instant::now();
    let response = builder.send().await?;
    let timing = start.elapsed();

    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();
    let headers: HashMap<String, String> = response.headers().iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body = response.text().await?;
    let size = body.len();

    Ok(ApiResponse {
        status,
        status_text,
        headers,
        body,
        timing_ms: timing.as_millis() as u64,
        size_bytes: size,
    })
}
