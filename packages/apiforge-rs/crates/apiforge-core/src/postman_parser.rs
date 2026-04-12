use anyhow::{Context, Result};
use serde_json::Value;

use crate::collection::{Collection, CollectionItem, CollectionRequest};

/// Detect whether JSON content is a Postman collection
pub fn is_postman_collection(content: &Value) -> bool {
    // Postman v2.1: info._postman_id or info.schema contains "getpostman.com"
    if let Some(info) = content.get("info") {
        if info.get("_postman_id").is_some() {
            return true;
        }
        if let Some(schema) = info.get("schema").and_then(|s| s.as_str()) {
            if schema.contains("getpostman.com") {
                return true;
            }
        }
    }
    false
}

pub struct PostmanParser {
    data: Value,
}

impl PostmanParser {
    pub fn parse(content: &str) -> Result<Self> {
        let data: Value = serde_json::from_str(content)
            .context("Failed to parse Postman collection as JSON")?;
        if !is_postman_collection(&data) {
            anyhow::bail!("Not a valid Postman collection (missing info._postman_id or schema)");
        }
        Ok(Self { data })
    }

    pub fn get_name(&self) -> String {
        self.data.get("info")
            .and_then(|i| i.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("Untitled Collection")
            .to_string()
    }

    pub fn get_description(&self) -> Option<String> {
        self.data.get("info")
            .and_then(|i| i.get("description"))
            .and_then(|d| d.as_str())
            .map(|s| s.to_string())
    }

    /// Convert Postman collection to internal Collection format
    pub fn to_collection(&self, name: Option<&str>) -> Collection {
        let collection_name = name.map(|s| s.to_string())
            .unwrap_or_else(|| self.get_name());

        let items = self.data.get("item")
            .and_then(|i| i.as_array())
            .map(|arr| self.parse_items(arr))
            .unwrap_or_default();

        Collection {
            id: uuid::Uuid::new_v4().to_string(),
            name: collection_name,
            version: None,
            description: self.get_description(),
            items,
        }
    }

    fn parse_items(&self, items: &[Value]) -> Vec<CollectionItem> {
        items.iter().filter_map(|item| self.parse_item(item)).collect()
    }

    fn parse_item(&self, item: &Value) -> Option<CollectionItem> {
        let name = item.get("name").and_then(|n| n.as_str())
            .unwrap_or("Unnamed").to_string();

        // If it has sub-items, it's a folder
        if let Some(sub_items) = item.get("item").and_then(|i| i.as_array()) {
            return Some(CollectionItem {
                item_type: "folder".to_string(),
                name,
                request: None,
                items: Some(self.parse_items(sub_items)),
            });
        }

        // Otherwise it's a request
        let request = item.get("request")?;
        let method = self.extract_method(request);
        let url = self.extract_url(request);
        let body = self.extract_body(request);
        let headers = self.extract_headers(request);

        Some(CollectionItem {
            item_type: "request".to_string(),
            name: name.clone(),
            request: Some(CollectionRequest {
                method,
                name,
                url,
                body,
                headers,
            }),
            items: None,
        })
    }

    fn extract_method(&self, request: &Value) -> String {
        // method can be a string or an object
        match request.get("method") {
            Some(Value::String(m)) => m.to_uppercase(),
            _ => "GET".to_string(),
        }
    }

    fn extract_url(&self, request: &Value) -> String {
        match request.get("url") {
            // Simple string URL
            Some(Value::String(s)) => s.clone(),
            // Object URL with raw field
            Some(obj) => {
                obj.get("raw").and_then(|r| r.as_str())
                    .unwrap_or("").to_string()
            }
            None => String::new(),
        }
    }

    fn extract_body(&self, request: &Value) -> Option<String> {
        let body = request.get("body")?;
        let mode = body.get("mode").and_then(|m| m.as_str())?;

        match mode {
            "raw" => body.get("raw").and_then(|r| r.as_str()).map(|s| s.to_string()),
            "urlencoded" => {
                let pairs = body.get("urlencoded").and_then(|u| u.as_array())?;
                let encoded: Vec<String> = pairs.iter().filter_map(|p| {
                    let key = p.get("key").and_then(|k| k.as_str())?;
                    let value = p.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    Some(format!("{}={}", key, value))
                }).collect();
                Some(encoded.join("&"))
            }
            "formdata" => {
                let pairs = body.get("formdata").and_then(|f| f.as_array())?;
                let encoded: Vec<String> = pairs.iter().filter_map(|p| {
                    let key = p.get("key").and_then(|k| k.as_str())?;
                    let value = p.get("value").and_then(|v| v.as_str()).unwrap_or("");
                    Some(format!("{}={}", key, value))
                }).collect();
                Some(encoded.join("&"))
            }
            _ => None,
        }
    }

    fn extract_headers(&self, request: &Value) -> Vec<(String, String)> {
        request.get("header")
            .and_then(|h| h.as_array())
            .map(|arr| {
                arr.iter().filter_map(|h| {
                    let key = h.get("key").and_then(|k| k.as_str())?.to_string();
                    let value = h.get("value").and_then(|v| v.as_str())
                        .unwrap_or("").to_string();
                    Some((key, value))
                }).collect()
            })
            .unwrap_or_default()
    }
}
