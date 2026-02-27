use crate::errors::AppResult;
use serde::Serialize;
use std::path::Path;

/// 排序：目录在前，文件在后，各自按字母序
fn sort_entries_dirs_first(entries: &mut Vec<std::fs::DirEntry>) {
    entries.sort_by(|a, b| {
        let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
        b_dir.cmp(&a_dir).then_with(|| a.file_name().cmp(&b.file_name()))
    });
}

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".DS_Store",
];

#[derive(Debug, Serialize, Clone)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

/// Read immediate children of a single directory (one level only).
/// Used for lazy-loading: the frontend calls this when a directory is expanded.
#[tauri::command]
pub async fn read_directory_children(path: String) -> AppResult<Vec<DirEntry>> {
    let dir = Path::new(&path);
    let mut entries = Vec::new();

    let read_dir = std::fs::read_dir(dir)?;
    let mut sorted: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
    sort_entries_dirs_first(&mut sorted);

    for child in sorted {
        let name = child.file_name().to_string_lossy().to_string();
        if SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let is_dir = child.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(DirEntry {
            name,
            path: child.path().to_string_lossy().to_string(),
            is_dir,
            // Directories get an empty children array (signals "expandable, not yet loaded")
            // Files get null (not expandable)
            children: if is_dir { Some(Vec::new()) } else { None },
        });
    }

    Ok(entries)
}

/// Legacy: read full tree up to max_depth. Kept for backward compatibility but
/// now only used for the initial shallow load (depth=1).
#[tauri::command]
pub fn read_directory_tree(path: String, max_depth: Option<usize>) -> AppResult<Vec<DirEntry>> {
    let dir = Path::new(&path);
    let depth = max_depth.unwrap_or(1);
    let mut entries = Vec::new();

    let read_dir = std::fs::read_dir(dir)?;
    let mut sorted: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
    sort_entries_dirs_first(&mut sorted);

    for child in sorted {
        let name = child.file_name().to_string_lossy().to_string();
        if SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let is_dir = child.file_type().map(|t| t.is_dir()).unwrap_or(false);

        let children = if is_dir && depth > 1 {
            // Load one more level
            match read_children_recursive(child.path().as_path(), depth - 1) {
                Ok(kids) => Some(kids),
                Err(_) => Some(Vec::new()),
            }
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };

        entries.push(DirEntry {
            name,
            path: child.path().to_string_lossy().to_string(),
            is_dir,
            children,
        });
    }

    Ok(entries)
}

fn read_children_recursive(dir: &Path, remaining_depth: usize) -> AppResult<Vec<DirEntry>> {
    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(dir)?;
    let mut sorted: Vec<_> = read_dir.filter_map(|e| e.ok()).collect();
    sort_entries_dirs_first(&mut sorted);

    for child in sorted {
        let name = child.file_name().to_string_lossy().to_string();
        if SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let is_dir = child.file_type().map(|t| t.is_dir()).unwrap_or(false);

        let children = if is_dir && remaining_depth > 1 {
            match read_children_recursive(child.path().as_path(), remaining_depth - 1) {
                Ok(kids) => Some(kids),
                Err(_) => Some(Vec::new()),
            }
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };

        entries.push(DirEntry {
            name,
            path: child.path().to_string_lossy().to_string(),
            is_dir,
            children,
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn create_file_or_dir(path: String, is_dir: bool) -> AppResult<()> {
    if is_dir {
        std::fs::create_dir_all(&path)?;
    } else {
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, "")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_entry(old_path: String, new_path: String) -> AppResult<()> {
    std::fs::rename(&old_path, &new_path)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_entry(path: String) -> AppResult<()> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(&path)?;
    } else {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

#[derive(Debug, Serialize, Clone)]
pub struct FileSearchResult {
    pub path: String,
    pub line_number: usize,
    pub line_content: String,
}

#[tauri::command]
pub async fn search_in_files(
    project_path: String,
    query: String,
    max_results: Option<usize>,
) -> AppResult<Vec<FileSearchResult>> {
    let max = max_results.unwrap_or(200);
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    fn walk_dir(
        dir: &std::path::Path,
        query_lower: &str,
        results: &mut Vec<FileSearchResult>,
        max: usize,
        project_path: &str,
    ) {
        let read_dir = match std::fs::read_dir(dir) {
            Ok(rd) => rd,
            Err(_) => return,
        };
        for entry in read_dir.filter_map(|e| e.ok()) {
            if results.len() >= max {
                return;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if SKIP_DIRS.contains(&name.as_str()) {
                continue;
            }
            let path = entry.path();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                walk_dir(&path, query_lower, results, max, project_path);
            } else {
                // Skip binary/large files
                let metadata = match std::fs::metadata(&path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                if metadata.len() > 1_000_000 {
                    continue;
                }
                let content = match std::fs::read_to_string(&path) {
                    Ok(c) => c,
                    Err(_) => continue, // skip binary files
                };
                let mut file_matches = 0;
                for (i, line) in content.lines().enumerate() {
                    if results.len() >= max {
                        return;
                    }
                    if file_matches >= 10 {
                        break;
                    }
                    if line.to_lowercase().contains(query_lower) {
                        let rel_path = path
                            .to_string_lossy()
                            .strip_prefix(project_path)
                            .unwrap_or(&path.to_string_lossy())
                            .trim_start_matches('/')
                            .to_string();
                        results.push(FileSearchResult {
                            path: rel_path,
                            line_number: i + 1,
                            line_content: line.chars().take(200).collect(),
                        });
                        file_matches += 1;
                    }
                }
            }
        }
    }

    if query.is_empty() {
        return Ok(results);
    }

    walk_dir(
        std::path::Path::new(&project_path),
        &query_lower,
        &mut results,
        max,
        &project_path,
    );
    Ok(results)
}

#[tauri::command]
pub async fn show_in_folder(path: String) -> AppResult<()> {
    let p = std::path::Path::new(&path);
    // If path is a file, reveal it (select it) in the file manager.
    // If it's a directory, open the directory.
    #[cfg(target_os = "macos")]
    {
        if p.is_dir() {
            std::process::Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| crate::errors::AppError::General(e.to_string()))?;
        } else {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&path)
                .spawn()
                .map_err(|e| crate::errors::AppError::General(e.to_string()))?;
        }
    }
    #[cfg(target_os = "windows")]
    {
        if p.is_dir() {
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| crate::errors::AppError::General(e.to_string()))?;
        } else {
            std::process::Command::new("explorer")
                .arg("/select,")
                .arg(&path)
                .spawn()
                .map_err(|e| crate::errors::AppError::General(e.to_string()))?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on the parent directory for files, or the dir itself
        let target = if p.is_dir() {
            path.clone()
        } else {
            p.parent()
                .map(|pp| pp.to_string_lossy().to_string())
                .unwrap_or(path.clone())
        };
        std::process::Command::new("xdg-open")
            .arg(&target)
            .spawn()
            .map_err(|e| crate::errors::AppError::General(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> AppResult<()> {
    // 确保父目录存在
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, &content)?;
    Ok(())
}

/// 列出项目下所有文件的相对路径（用于快速打开）
#[tauri::command]
pub async fn list_all_files(project_path: String) -> AppResult<Vec<String>> {
    let root = std::path::Path::new(&project_path);
    let mut files = Vec::new();

    fn walk(dir: &std::path::Path, root: &std::path::Path, files: &mut Vec<String>) {
        let read_dir = match std::fs::read_dir(dir) {
            Ok(rd) => rd,
            Err(_) => return,
        };
        for entry in read_dir.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if SKIP_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_dir {
                walk(&path, root, files);
            } else {
                if let Ok(rel) = path.strip_prefix(root) {
                    files.push(rel.to_string_lossy().to_string());
                }
            }
        }
    }

    walk(root, root, &mut files);
    files.sort();
    Ok(files)
}

#[tauri::command]
pub fn read_file_content(path: String, max_size: Option<u64>) -> AppResult<String> {
    let max = max_size.unwrap_or(1_000_000); // 1MB default
    let metadata = std::fs::metadata(&path)?;
    if metadata.len() > max {
        return Err(crate::errors::AppError::General(format!(
            "File too large: {} bytes (max {})",
            metadata.len(),
            max
        )));
    }
    Ok(std::fs::read_to_string(&path)?)
}
