use anyhow::Result;
use apiforge_spec::{scanner, spec_builder};
use crossterm::style::Stylize;
use std::path::PathBuf;

pub fn execute(
    src: String,
    output: Option<String>,
    title: String,
    version: String,
    description: Option<String>,
    servers: Vec<String>,
    verbose: bool,
) -> Result<()> {
    let src_dir = PathBuf::from(&src);
    if !src_dir.is_dir() {
        anyhow::bail!("Source directory not found: {}", src);
    }

    // Scan for TypeScript files
    let ts_files = scanner::find_ts_files(&src_dir);
    if verbose {
        println!("  Found {} TypeScript files", ts_files.len().to_string().cyan());
    }

    // Build spec using the spec_builder
    let options = spec_builder::SpecOptions {
        title,
        version,
        description,
        servers,
    };

    let spec = spec_builder::build_spec(&ts_files, &options);

    let json = serde_json::to_string_pretty(&spec)?;

    if let Some(output_path) = output {
        std::fs::write(&output_path, &json)?;
        println!("{}", format!("  Spec written to {}", output_path).green());
    } else {
        println!("{}", json);
    }

    if verbose {
        let path_count = spec.paths.len();
        let schema_count = spec.components.as_ref()
            .and_then(|c| c.schemas.as_ref())
            .map_or(0, |s| s.len());
        println!();
        println!("  {} paths, {} schemas",
            path_count.to_string().green().bold(),
            schema_count.to_string().green().bold(),
        );
    }

    Ok(())
}
