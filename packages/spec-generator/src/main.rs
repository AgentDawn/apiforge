mod enricher;
mod models;
mod parser;
mod scanner;
mod spec_builder;

use clap::Parser;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

#[derive(Parser, Debug)]
#[command(name = "apiforge-spec-generator")]
#[command(about = "Generate OpenAPI 3.0 spec from NestJS TypeScript source")]
struct Args {
    /// Source directory containing NestJS TypeScript files
    #[arg(long)]
    src: String,

    /// Output file path
    #[arg(long, short, default_value = "openapi.json")]
    output: String,

    /// API title
    #[arg(long, short, default_value = "API")]
    title: String,

    /// API version
    #[arg(long, default_value = "1.0.0")]
    version: String,

    /// API description
    #[arg(long, short)]
    description: Option<String>,

    /// Server URLs
    #[arg(long)]
    server: Vec<String>,

    /// Verbose output
    #[arg(long, short)]
    verbose: bool,
}

fn main() {
    let args = Args::parse();
    let start = Instant::now();

    let src_dir = PathBuf::from(&args.src);
    if !src_dir.is_dir() {
        eprintln!("Error: Source directory not found: {}", args.src);
        std::process::exit(1);
    }

    eprintln!("Scanning: {}", src_dir.display());

    // Find all TypeScript files
    let ts_files = scanner::find_ts_files(&src_dir);
    eprintln!("Found {} TypeScript files", ts_files.len());

    // Build the spec
    let options = spec_builder::SpecOptions {
        title: args.title,
        version: args.version,
        description: args.description,
        servers: args.server,
    };

    let spec = spec_builder::build_spec(&ts_files, &options);

    // Stats
    let path_count = spec.paths.len();
    let op_count: usize = spec.paths.values().map(|p| p.len()).sum();
    let schema_count = spec
        .components
        .as_ref()
        .and_then(|c| c.schemas.as_ref())
        .map(|s| s.len())
        .unwrap_or(0);

    eprintln!();
    eprintln!("Generated OpenAPI 3.0 spec:");
    eprintln!("  Paths:      {}", path_count);
    eprintln!("  Operations: {}", op_count);
    eprintln!("  Schemas:    {}", schema_count);

    if args.verbose {
        eprintln!();
        eprintln!("Paths:");
        for (path, methods) in &spec.paths {
            for (method, op) in methods {
                let summary = op.summary.as_deref().unwrap_or("");
                eprintln!(
                    "  {:<7} {}  {}",
                    method.to_uppercase(),
                    path,
                    summary
                );
            }
        }
        if let Some(ref components) = spec.components {
            if let Some(ref schemas) = components.schemas {
                eprintln!();
                eprintln!("Schemas:");
                for (name, schema) in schemas {
                    let prop_count = match schema {
                        models::Schema::Object { properties, .. } => {
                            properties.as_ref().map(|p| p.len()).unwrap_or(0)
                        }
                        _ => 0,
                    };
                    eprintln!("  {} ({} properties)", name, prop_count);
                }
            }
        }
    }

    // Write output
    let output_path = PathBuf::from(&args.output);
    if let Some(parent) = output_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).unwrap_or_else(|e| {
                eprintln!("Error creating output directory: {}", e);
                std::process::exit(1);
            });
        }
    }

    let json = serde_json::to_string_pretty(&spec).unwrap_or_else(|e| {
        eprintln!("Error serializing spec: {}", e);
        std::process::exit(1);
    });

    fs::write(&output_path, format!("{}\n", json)).unwrap_or_else(|e| {
        eprintln!("Error writing output: {}", e);
        std::process::exit(1);
    });

    let elapsed = start.elapsed();
    eprintln!();
    eprintln!("Spec written to: {}", output_path.display());
    eprintln!("Time: {:.2}ms", elapsed.as_secs_f64() * 1000.0);
}
