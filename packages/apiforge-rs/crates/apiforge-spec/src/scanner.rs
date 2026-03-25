use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Walk a directory and find all .ts files, excluding test/spec/declaration files
/// and common non-source directories.
pub fn find_ts_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();

    for entry in WalkDir::new(dir)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            // Skip common non-source directories
            !matches!(
                name.as_ref(),
                "node_modules" | "dist" | ".git" | "test" | "tests" | "__tests__"
            )
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            if name.ends_with(".ts")
                && !name.ends_with(".spec.ts")
                && !name.ends_with(".test.ts")
                && !name.ends_with(".d.ts")
            {
                files.push(path.to_path_buf());
            }
        }
    }

    files
}
