use anyhow::Result;
use apiforge_core::environment::{Environment, EnvironmentManager};
use crossterm::style::Stylize;
use std::collections::HashMap;

use crate::EnvAction;

pub fn execute(action: EnvAction) -> Result<()> {
    let manager = EnvironmentManager::new()?;
    match action {
        EnvAction::List => {
            let envs = manager.list()?;
            if envs.is_empty() {
                println!("{}", "No environments found.".dark_grey());
                println!("Create one with: apiforge env create <name> --base-url <url>");
            } else {
                println!("{}", format!("  {} environment(s):", envs.len()).bold());
                println!();
                for env in &envs {
                    println!("  {} {}", "●".green(), env.name.clone().bold());
                    if !env.base_url.is_empty() {
                        println!("    Base URL: {}", env.base_url.clone().dark_grey());
                    }
                    println!("    Variables: {}", env.variables.len().to_string().cyan());
                }
            }
        }
        EnvAction::Show { name } => {
            match manager.get(&name)? {
                Some(env) => {
                    println!("{}", format!("  Environment: {}", env.name).bold());
                    println!("  Base URL: {}", if env.base_url.is_empty() { "(not set)".to_string() } else { env.base_url.clone() });
                    println!();
                    if env.variables.is_empty() {
                        println!("  {}", "No variables set.".dark_grey());
                    } else {
                        println!("  {}", "Variables:".bold());
                        for (key, value) in &env.variables {
                            println!("    {} = {}", key.clone().cyan(), value);
                        }
                    }
                }
                None => {
                    eprintln!("{}", format!("Environment '{}' not found.", name).red());
                }
            }
        }
        EnvAction::Create { name, base_url, vars } => {
            let mut variables = HashMap::new();
            for v in &vars {
                if let Some((k, val)) = v.split_once('=') {
                    variables.insert(k.to_string(), val.to_string());
                }
            }
            let env = Environment { name: name.clone(), base_url, variables };
            manager.create(&env)?;
            println!("{}", format!("  Environment '{}' created.", name).green());
        }
        EnvAction::Set { name, key, value } => {
            manager.set_variable(&name, &key, &value)?;
            println!("{}", format!("  Set {} = {} in '{}'", key, value, name).green());
        }
        EnvAction::Delete { name } => {
            if manager.delete(&name)? {
                println!("{}", format!("  Environment '{}' deleted.", name).green());
            } else {
                eprintln!("{}", format!("  Environment '{}' not found.", name).red());
            }
        }
    }
    Ok(())
}
