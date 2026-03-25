use anyhow::Result;
use serde::{Deserialize, Serialize};
use chrono::Utc;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: String,
    pub method: String,
    pub url: String,
    pub status: u16,
    pub timing_ms: u64,
    pub request_body: Option<String>,
    pub response_body: Option<String>,
}

pub struct HistoryStore {
    dir: PathBuf,
}

impl HistoryStore {
    pub fn new() -> Result<Self> {
        let dir = super::environment::get_data_dir()?.join("history");
        std::fs::create_dir_all(&dir)?;
        Ok(Self { dir })
    }

    pub fn save(&self, entry: &HistoryEntry) -> Result<()> {
        let path = self.dir.join(format!("{}.json", entry.id));
        let content = serde_json::to_string_pretty(entry)?;
        std::fs::write(path, content)?;
        Ok(())
    }

    pub fn list(&self, limit: usize) -> Result<Vec<HistoryEntry>> {
        let mut entries = Vec::new();
        if self.dir.exists() {
            let mut paths: Vec<_> = std::fs::read_dir(&self.dir)?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().map_or(false, |ext| ext == "json"))
                .collect();
            paths.sort_by(|a, b| b.path().cmp(&a.path()));
            for entry in paths.into_iter().take(limit) {
                let content = std::fs::read_to_string(entry.path())?;
                let hist: HistoryEntry = serde_json::from_str(&content)?;
                entries.push(hist);
            }
        }
        Ok(entries)
    }

    pub fn clear(&self) -> Result<usize> {
        let mut count = 0;
        if self.dir.exists() {
            for entry in std::fs::read_dir(&self.dir)? {
                let entry = entry?;
                if entry.path().extension().map_or(false, |ext| ext == "json") {
                    std::fs::remove_file(entry.path())?;
                    count += 1;
                }
            }
        }
        Ok(count)
    }
}

pub fn create_entry(method: &str, url: &str, status: u16, timing_ms: u64, req_body: Option<&str>, res_body: Option<&str>) -> HistoryEntry {
    HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        method: method.to_string(),
        url: url.to_string(),
        status,
        timing_ms,
        request_body: req_body.map(|s| s.to_string()),
        response_body: res_body.map(|s| s.to_string()),
    }
}
