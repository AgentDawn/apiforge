use anyhow::Result;
use apiforge_core::collection::CollectionManager;
use crossterm::style::Stylize;

use crate::SpecAction;

pub fn execute(action: SpecAction) -> Result<()> {
    let manager = CollectionManager::new()?;

    match action {
        SpecAction::List => {
            let collections = manager.list()?;
            if collections.is_empty() {
                println!("{}", "No specs imported. Import one with: apiforge import <file|url>".dark_grey());
            } else {
                println!("{}", "Imported specs:".bold());
                for col in &collections {
                    let version = col.version.as_deref().unwrap_or("");
                    let desc = col.description.as_deref().unwrap_or("");
                    print!("  {} {}", "●".green(), col.name.clone().bold());
                    if !version.is_empty() {
                        print!(" (v{})", version);
                    }
                    println!();
                    if !desc.is_empty() {
                        println!("    {}", desc.dark_grey());
                    }
                }
            }
        }
        SpecAction::Show { name } => {
            let collection = manager.get_by_name(&name)?;
            match collection {
                Some(col) => {
                    let version = col.version.as_deref().unwrap_or("?");
                    println!("{}", format!("{} (v{})", col.name, version).bold());
                    if let Some(desc) = &col.description {
                        println!("  {}", desc);
                    }
                    println!();

                    for item in &col.items {
                        if item.item_type == "folder" {
                            println!("  {}", format!("[{}]", item.name).cyan());
                            if let Some(sub_items) = &item.items {
                                for req in sub_items {
                                    if req.item_type == "request" {
                                        if let Some(r) = &req.request {
                                            println!("    {} {}", format!("{:<7}", r.method).bold(), r.name);
                                        }
                                    }
                                }
                            }
                        } else if item.item_type == "request" {
                            if let Some(r) = &item.request {
                                println!("  {} {}", format!("{:<7}", r.method).bold(), r.name);
                            }
                        }
                    }
                }
                None => {
                    eprintln!("{}", format!("Not found: {}", name).red());
                }
            }
        }
    }
    Ok(())
}
