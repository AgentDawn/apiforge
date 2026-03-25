use anyhow::{Result, bail};
use crossterm::style::Stylize;
use apiforge_core::history::HistoryStore;
use apiforge_core::report;

pub fn execute(format: String, output: Option<String>, limit: usize) -> Result<()> {
    let store = HistoryStore::new()?;
    let entries = store.list(limit)?;

    if entries.is_empty() {
        println!("{}", "  No request history to report.".dark_grey());
        return Ok(());
    }

    let content = match format.as_str() {
        "markdown" | "md" => report::generate_markdown(&entries),
        "json" => report::generate_json(&entries),
        "html" => report::generate_html(&entries),
        _ => bail!("Unknown format '{}'. Supported: markdown, json, html", format),
    };

    match output {
        Some(path) => {
            std::fs::write(&path, &content)?;
            println!("{}", format!("  Report written to {} ({} entries)", path, entries.len()).green());
        }
        None => {
            println!("{}", content);
        }
    }

    Ok(())
}
