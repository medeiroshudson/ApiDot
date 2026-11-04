use std::path::{Component, Path, PathBuf};

/// Returns the local offline storage root directory (`~/.apidot/storage`).
///
/// Supports override via the `APIDOT_STORAGE_ROOT` environment variable for testing.
/// Recursively creates the directory if it does not yet exist.
pub fn get_storage_root() -> PathBuf {
    let root = if let Ok(custom_root) = std::env::var("APIDOT_STORAGE_ROOT") {
        if !custom_root.trim().is_empty() {
            PathBuf::from(custom_root)
        } else {
            default_storage_root()
        }
    } else {
        default_storage_root()
    };

    if !root.exists() {
        let _ = std::fs::create_dir_all(&root);
    }

    root
}

fn default_storage_root() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".apidot").join("storage")
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join(".apidot").join("storage")
    } else {
        PathBuf::from(".apidot").join("storage")
    }
}

/// Sanitizes and validates a relative path against path traversal attempts (e.g. `..`).
/// Ensures that the target file or directory remains strictly contained within the storage root directory.
pub fn sanitize_relative_path(rel_path: &str) -> Result<PathBuf, String> {
    if rel_path.contains('\0') {
        return Err("Invalid path containing null character".to_string());
    }

    // Normalize Windows-style backslash separators to Unix slashes before inspecting components
    let normalized = rel_path.replace('\\', "/");
    let trimmed = normalized.trim().trim_start_matches('/');
    if trimmed.is_empty() {
        return Err("Invalid empty path".to_string());
    }

    let path_obj = Path::new(trimmed);
    for component in path_obj.components() {
        match component {
            Component::ParentDir => {
                return Err("Path traversal detected: '..' not allowed".to_string());
            }
            Component::Prefix(_) => {
                return Err("Drive prefixes not allowed in relative path".to_string());
            }
            Component::RootDir => {
                return Err("Absolute root paths not allowed".to_string());
            }
            _ => {}
        }
    }

    let root = get_storage_root();
    let full_path = root.join(trimmed);

    // Defense-in-depth verification ensuring the path does not escape the base root
    if !full_path.starts_with(&root) {
        return Err("Resolved path escapes storage root directory".to_string());
    }

    // Prevents references like "." or "./" from resolving to the storage root itself
    if full_path == root {
        return Err("Path refers to storage root directory; target must be a child entry".to_string());
    }

    Ok(full_path)
}

/// Tauri IPC command to write file content under `~/.apidot/storage/<rel_path>`.
#[tauri::command]
pub async fn fs_save_storage(rel_path: String, content: String) -> Result<(), String> {
    let full_path = sanitize_relative_path(&rel_path)?;

    if let Some(parent) = full_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create parent directories for '{:?}': {}", parent, e))?;
    }

    tokio::fs::write(&full_path, content)
        .await
        .map_err(|e| format!("Failed to write storage file '{:?}': {}", full_path, e))?;

    Ok(())
}

/// Tauri IPC command to read file content under `~/.apidot/storage/<rel_path>`.
#[tauri::command]
pub async fn fs_load_storage(rel_path: String) -> Result<String, String> {
    let full_path = sanitize_relative_path(&rel_path)?;

    if !full_path.exists() {
        return Err(format!("Storage file not found: {}", rel_path));
    }

    tokio::fs::read_to_string(&full_path)
        .await
        .map_err(|e| format!("Failed to read storage file '{:?}': {}", full_path, e))
}

/// Tauri IPC command to list entries (files/directories) under `~/.apidot/storage/<rel_dir>`.
#[tauri::command]
pub async fn fs_list_storage(rel_dir: String) -> Result<Vec<String>, String> {
    let normalized = rel_dir.replace('\\', "/");
    let trimmed = normalized.trim().trim_matches('/');
    let dir_path = if trimmed.is_empty() || trimmed == "." {
        get_storage_root()
    } else {
        sanitize_relative_path(trimmed)?
    };

    if !dir_path.exists() {
        return Ok(Vec::new());
    }

    let mut reader = tokio::fs::read_dir(&dir_path)
        .await
        .map_err(|e| format!("Failed to read directory '{:?}': {}", dir_path, e))?;

    let mut entries = Vec::new();
    while let Ok(Some(entry)) = reader.next_entry().await {
        let file_name = entry.file_name().to_string_lossy().to_string();
        entries.push(file_name);
    }

    entries.sort();
    Ok(entries)
}

/// Tauri IPC command to delete a file or directory under `~/.apidot/storage/<rel_path>`.
#[tauri::command]
pub async fn fs_delete_storage(rel_path: String) -> Result<(), String> {
    let full_path = sanitize_relative_path(&rel_path)?;

    if !full_path.exists() {
        return Ok(()); // Idempotent operation
    }

    if full_path.is_dir() {
        tokio::fs::remove_dir_all(&full_path)
            .await
            .map_err(|e| format!("Failed to remove directory '{:?}': {}", full_path, e))?;
    } else {
        tokio::fs::remove_file(&full_path)
            .await
            .map_err(|e| format!("Failed to remove file '{:?}': {}", full_path, e))?;
    }

    Ok(())
}
