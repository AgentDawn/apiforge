use anyhow::{Context, Result};
use serde_json::Value;

use crate::collection::{Collection, CollectionItem, CollectionRequest};

pub struct OpenApiParser {
    spec: Value,
}

impl OpenApiParser {
    /// Parse from a JSON or YAML string
    pub fn parse(content: &str) -> Result<Self> {
        // Try JSON first
        let spec: Value = serde_json::from_str(content)
            .context("Failed to parse spec as JSON")?;
        Ok(Self { spec })
    }

    /// Fetch and parse from a URL
    pub async fn from_url(url: &str) -> Result<Self> {
        let client = reqwest::Client::new();
        let content = client.get(url).send().await?
            .text().await?;
        Self::parse(&content)
    }

    /// Get spec info
    pub fn get_info(&self) -> SpecInfo {
        let info = self.spec.get("info");
        SpecInfo {
            title: info.and_then(|i| i.get("title")).and_then(|t| t.as_str())
                .unwrap_or("Untitled API").to_string(),
            version: info.and_then(|i| i.get("version")).and_then(|v| v.as_str())
                .unwrap_or("1.0.0").to_string(),
            description: info.and_then(|i| i.get("description")).and_then(|d| d.as_str())
                .map(|s| s.to_string()),
        }
    }

    /// Get all endpoints
    pub fn get_endpoints(&self) -> Vec<Endpoint> {
        let mut endpoints = Vec::new();
        if let Some(paths) = self.spec.get("paths").and_then(|p| p.as_object()) {
            for (path, methods) in paths {
                if let Some(methods) = methods.as_object() {
                    for (method, operation) in methods {
                        if method == "parameters" {
                            continue;
                        }
                        let summary = operation.get("summary")
                            .and_then(|s| s.as_str())
                            .unwrap_or("")
                            .to_string();
                        let tag = operation.get("tags")
                            .and_then(|t| t.as_array())
                            .and_then(|arr| arr.first())
                            .and_then(|t| t.as_str())
                            .unwrap_or("default")
                            .to_string();
                        endpoints.push(Endpoint {
                            path: path.clone(),
                            method: method.to_uppercase(),
                            summary,
                            tag,
                        });
                    }
                }
            }
        }
        endpoints
    }

    /// Get all tags
    pub fn get_tags(&self) -> Vec<String> {
        let endpoints = self.get_endpoints();
        let mut tags: Vec<String> = endpoints.iter().map(|e| e.tag.clone()).collect();
        tags.sort();
        tags.dedup();
        tags
    }

    /// Get server URLs
    pub fn get_servers(&self) -> Vec<ServerInfo> {
        let mut servers = Vec::new();
        if let Some(arr) = self.spec.get("servers").and_then(|s| s.as_array()) {
            for s in arr {
                let url = s.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
                let description = s.get("description").and_then(|d| d.as_str())
                    .map(|s| s.to_string());
                servers.push(ServerInfo { url, description });
            }
        }
        servers
    }

    /// Convert to a Collection
    pub fn to_collection(&self, name: Option<&str>) -> Collection {
        let info = self.get_info();
        let endpoints = self.get_endpoints();
        let tags = self.get_tags();

        let collection_name = name.map(|s| s.to_string())
            .unwrap_or_else(|| info.title.clone());

        // Group endpoints by tag into folders
        let mut items: Vec<CollectionItem> = Vec::new();
        for tag in &tags {
            let tag_endpoints: Vec<&Endpoint> = endpoints.iter()
                .filter(|e| &e.tag == tag)
                .collect();
            if tag_endpoints.is_empty() {
                continue;
            }

            let folder_items: Vec<CollectionItem> = tag_endpoints.iter().map(|ep| {
                let req_name = if ep.summary.is_empty() {
                    format!("{} {}", ep.method, ep.path)
                } else {
                    ep.summary.clone()
                };
                CollectionItem {
                    item_type: "request".to_string(),
                    name: req_name.clone(),
                    request: Some(CollectionRequest {
                        method: ep.method.clone(),
                        name: req_name,
                        url: ep.path.clone(),
                        body: None,
                        headers: Vec::new(),
                    }),
                    items: None,
                }
            }).collect();

            items.push(CollectionItem {
                item_type: "folder".to_string(),
                name: tag.clone(),
                request: None,
                items: Some(folder_items),
            });
        }

        Collection {
            id: uuid::Uuid::new_v4().to_string(),
            name: collection_name,
            version: Some(info.version),
            description: info.description,
            items,
        }
    }

    /// Get the raw spec JSON
    pub fn spec(&self) -> &Value {
        &self.spec
    }

    /// Get spec as string
    pub fn to_json_string(&self) -> Result<String> {
        serde_json::to_string_pretty(&self.spec).context("Failed to serialize spec")
    }
}

#[derive(Debug, Clone)]
pub struct SpecInfo {
    pub title: String,
    pub version: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Endpoint {
    pub path: String,
    pub method: String,
    pub summary: String,
    pub tag: String,
}

#[derive(Debug, Clone)]
pub struct ServerInfo {
    pub url: String,
    pub description: Option<String>,
}
