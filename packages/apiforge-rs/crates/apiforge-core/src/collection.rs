use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::environment::get_data_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub items: Vec<CollectionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionItem {
    #[serde(rename = "type")]
    pub item_type: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request: Option<CollectionRequest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<CollectionItem>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionRequest {
    pub method: String,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
}

pub struct CollectionManager {
    data_dir: PathBuf,
}

impl CollectionManager {
    pub fn new() -> Result<Self> {
        let data_dir = get_data_dir()?.join("data").join("collections");
        std::fs::create_dir_all(&data_dir)?;
        Ok(Self { data_dir })
    }

    pub fn list(&self) -> Result<Vec<Collection>> {
        let mut collections = Vec::new();
        if self.data_dir.exists() {
            for entry in std::fs::read_dir(&self.data_dir)? {
                let entry = entry?;
                if entry.path().extension().map_or(false, |e| e == "json") {
                    let content = std::fs::read_to_string(entry.path())?;
                    if let Ok(col) = serde_json::from_str::<Collection>(&content) {
                        collections.push(col);
                    }
                }
            }
        }
        Ok(collections)
    }

    pub fn get_by_name(&self, name: &str) -> Result<Option<Collection>> {
        let collections = self.list()?;
        Ok(collections.into_iter().find(|c| c.name == name))
    }

    pub fn save(&self, collection: &Collection) -> Result<()> {
        let path = self.data_dir.join(format!("{}.json", collection.id));
        let content = serde_json::to_string_pretty(collection)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<bool> {
        let path = self.data_dir.join(format!("{}.json", id));
        if path.exists() {
            std::fs::remove_file(&path)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
