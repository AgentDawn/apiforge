use anyhow::{Result, Context};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub name: String,
    pub base_url: String,
    pub variables: HashMap<String, String>,
}

pub struct EnvironmentManager {
    data_dir: PathBuf,
}

impl EnvironmentManager {
    pub fn new() -> Result<Self> {
        let data_dir = get_data_dir()?.join("environments");
        std::fs::create_dir_all(&data_dir)?;
        Ok(Self { data_dir })
    }

    pub fn list(&self) -> Result<Vec<Environment>> {
        let mut envs = Vec::new();
        if self.data_dir.exists() {
            for entry in std::fs::read_dir(&self.data_dir)? {
                let entry = entry?;
                if entry.path().extension().map_or(false, |e| e == "json") {
                    let content = std::fs::read_to_string(entry.path())?;
                    let env: Environment = serde_json::from_str(&content)?;
                    envs.push(env);
                }
            }
        }
        Ok(envs)
    }

    pub fn get(&self, name: &str) -> Result<Option<Environment>> {
        let path = self.data_dir.join(format!("{}.json", name));
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let env: Environment = serde_json::from_str(&content)?;
            Ok(Some(env))
        } else {
            Ok(None)
        }
    }

    pub fn create(&self, env: &Environment) -> Result<()> {
        let path = self.data_dir.join(format!("{}.json", env.name));
        let content = serde_json::to_string_pretty(env)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    pub fn set_variable(&self, name: &str, key: &str, value: &str) -> Result<()> {
        let mut env = self.get(name)?
            .context(format!("Environment '{}' not found", name))?;
        env.variables.insert(key.to_string(), value.to_string());
        self.create(&env)?;
        Ok(())
    }

    pub fn delete(&self, name: &str) -> Result<bool> {
        let path = self.data_dir.join(format!("{}.json", name));
        if path.exists() {
            std::fs::remove_file(&path)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

/// Resolve {{variable}} placeholders in a string
pub fn resolve_variables(input: &str, variables: &HashMap<String, String>) -> String {
    let re = regex::Regex::new(r"\{\{(\w+)\}\}").unwrap();
    re.replace_all(input, |caps: &regex::Captures| {
        let key = &caps[1];
        variables.get(key).cloned().unwrap_or_else(|| format!("{{{{{}}}}}", key))
    }).to_string()
}

pub fn get_data_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("APIFORGE_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    let home = dirs::home_dir().context("Could not find home directory")?;
    Ok(home.join(".apiforge"))
}
