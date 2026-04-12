use anyhow::Result;
use crossterm::style::Stylize;
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Symbols that must stay on @nestjs/swagger (runtime doc serving)
const SWAGGER_ONLY: &[&str] = &["SwaggerModule", "DocumentBuilder"];

/// Symbols supported by @apiforge/nestjs
const SUPPORTED: &[&str] = &[
    "ApiTags", "ApiBearerAuth", "ApiSecurity", "ApiOperation",
    "ApiOkResponse", "ApiCreatedResponse", "ApiResponse",
    "ApiNotFoundResponse", "ApiUnauthorizedResponse", "ApiBadRequestResponse",
    "ApiForbiddenResponse", "ApiNoContentResponse", "ApiConflictResponse",
    "ApiParam", "ApiQuery", "ApiBody", "ApiExcludeEndpoint",
    "ApiExtraModels", "ApiProduces", "ApiConsumes",
    "ApiProperty", "ApiPropertyOptional",
    "getSchemaPath", "PickType", "OmitType",
];

pub fn execute(src: String, dry_run: bool, verbose: bool, skip_package_json: bool) -> Result<()> {
    let src_dir = PathBuf::from(&src);
    if !src_dir.is_dir() {
        anyhow::bail!("Source directory not found: {}", src);
    }

    let supported: HashSet<&str> = SUPPORTED.iter().copied().collect();
    let swagger_only: HashSet<&str> = SWAGGER_ONLY.iter().copied().collect();

    if dry_run {
        println!("{}", "DRY RUN — no files will be modified\n".yellow());
    }

    println!("Scanning {} ...\n", src_dir.display().to_string().cyan());

    let ts_files = find_ts_files(&src_dir);
    let mut migrated_count = 0u32;
    let mut symbol_count = 0u32;
    let mut kept_count = 0u32;
    let total_files = ts_files.len();

    let import_re = Regex::new(
        r#"import\s*\{([^}]+)\}\s*from\s*['"]@nestjs/swagger['"]\s*;?"#
    )?;

    for file in &ts_files {
        let content = fs::read_to_string(file)?;
        if !content.contains("@nestjs/swagger") {
            continue;
        }

        let mut new_content = String::new();
        let mut last_end = 0;
        let mut file_changed = false;
        let mut file_moved = 0u32;
        let mut file_kept = 0u32;

        for cap in import_re.captures_iter(&content) {
            let full_match = cap.get(0).unwrap();
            let symbols_str = cap.get(1).unwrap().as_str();

            let symbols: Vec<&str> = symbols_str
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            let mut apiforge_syms: Vec<&str> = Vec::new();
            let mut swagger_syms: Vec<&str> = Vec::new();

            for sym in &symbols {
                // Handle "Type as Alias" syntax
                let base_name = sym.split_whitespace().next().unwrap_or(sym);
                if swagger_only.contains(base_name) {
                    swagger_syms.push(sym);
                } else if supported.contains(base_name) {
                    apiforge_syms.push(sym);
                } else {
                    // Unknown — keep on @nestjs/swagger
                    swagger_syms.push(sym);
                }
            }

            // Build replacement
            let mut replacement = String::new();

            if !apiforge_syms.is_empty() {
                file_moved += apiforge_syms.len() as u32;
                let joined = format_import_symbols(&apiforge_syms);
                replacement.push_str(&format!("import {{ {} }} from '@apiforge/nestjs';", joined));
            }

            if !swagger_syms.is_empty() {
                file_kept += swagger_syms.len() as u32;
                if !replacement.is_empty() {
                    replacement.push('\n');
                }
                let joined = format_import_symbols(&swagger_syms);
                replacement.push_str(&format!("import {{ {} }} from '@nestjs/swagger';", joined));
            }

            new_content.push_str(&content[last_end..full_match.start()]);
            new_content.push_str(&replacement);
            last_end = full_match.end();
            file_changed = true;
        }

        if !file_changed {
            continue;
        }

        new_content.push_str(&content[last_end..]);
        migrated_count += 1;
        symbol_count += file_moved;
        kept_count += file_kept;

        let rel = file.strip_prefix(&src_dir).unwrap_or(file);

        if verbose {
            let tag = if dry_run { "[would migrate]".yellow() } else { "[migrated]".green() };
            println!("  {} {}", tag, rel.display());
            if file_moved > 0 {
                println!("    → {} symbol(s) → @apiforge/nestjs", file_moved);
            }
            if file_kept > 0 {
                println!("    → {} symbol(s) kept on @nestjs/swagger", file_kept);
            }
        }

        if !dry_run {
            fs::write(file, new_content)?;
        }
    }

    // Update package.json
    let pkg_result = if skip_package_json {
        None
    } else {
        update_package_json(&src_dir, dry_run)
    };

    // Summary
    println!("\n{}", "--- Migration Summary ---".bold());
    println!("  Files scanned:    {}", total_files.to_string().cyan());
    println!("  Files migrated:   {}", migrated_count.to_string().green().bold());
    println!("  Symbols moved:    {} → @apiforge/nestjs", symbol_count.to_string().green());
    if kept_count > 0 {
        println!("  Symbols kept:     {} → @nestjs/swagger (SwaggerModule/DocumentBuilder)", kept_count.to_string().yellow());
    }
    if let Some((path, action)) = pkg_result {
        println!("  package.json:     {} ({})", action, path);
    }

    if dry_run {
        println!("\n{}", "Re-run without --dry-run to apply changes.".yellow());
    } else if migrated_count > 0 {
        println!("\n{}", "Migration complete. Run your build to verify.".green());
    } else {
        println!("\nNo @nestjs/swagger imports found.");
    }

    Ok(())
}

fn format_import_symbols(syms: &[&str]) -> String {
    if syms.len() <= 3 {
        syms.join(", ")
    } else {
        format!("\n  {},\n", syms.join(",\n  "))
    }
}

fn find_ts_files(dir: &Path) -> Vec<PathBuf> {
    let mut results = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else { return results };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name();
            let name = name.to_str().unwrap_or("");
            if name == "node_modules" || name == "dist" || name == ".git" || name == "target" {
                continue;
            }
            results.extend(find_ts_files(&path));
        } else if let Some(ext) = path.extension() {
            if ext == "ts" || ext == "js" {
                results.push(path);
            }
        }
    }
    results
}

fn update_package_json(src_dir: &Path, dry_run: bool) -> Option<(String, String)> {
    // Walk up to find package.json
    let mut dir = src_dir.to_path_buf();
    let mut pkg_path = None;
    for _ in 0..5 {
        let candidate = dir.join("package.json");
        if candidate.exists() {
            pkg_path = Some(candidate);
            break;
        }
        dir = dir.parent()?.to_path_buf();
    }

    let pkg_path = pkg_path?;
    let content = fs::read_to_string(&pkg_path).ok()?;

    if content.contains("@apiforge/nestjs") {
        return Some((pkg_path.display().to_string(), "already present".into()));
    }

    // Simple JSON insertion: add after "@nestjs/swagger" line or in dependencies
    let new_content = if content.contains("\"@nestjs/swagger\"") {
        content.replace(
            "\"@nestjs/swagger\"",
            "\"@apiforge/nestjs\": \"^0.1.0\",\n    \"@nestjs/swagger\"",
        )
    } else {
        // Add to dependencies block
        content.replace(
            "\"dependencies\": {",
            "\"dependencies\": {\n    \"@apiforge/nestjs\": \"^0.1.0\",",
        )
    };

    if !dry_run {
        fs::write(&pkg_path, &new_content).ok()?;
    }

    Some((pkg_path.display().to_string(), "added @apiforge/nestjs ^0.1.0".into()))
}
