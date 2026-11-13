//! Desktop session storage.
//!
//! The desktop app keeps its device credential in `~/.apidot/session.json`,
//! separate from the agent's `config.json`. The file is private to the current
//! user (0600) and lives in a private directory (0700), mirroring the
//! permission handling in `storage.rs`.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Test-only override for the session file location.
const SESSION_PATH_ENV: &str = "APIDOT_SESSION_PATH";

/// The desktop session restored at boot: the signed-in user, the device row
/// this machine owns, the bearer token and its expiry.
///
/// `device_key` is a machine identifier rather than a secret, so it survives
/// `clear_session`; the token fields and the user/device identity do not.
#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
pub struct DesktopSession {
    pub user_id: Option<String>,
    pub device_id: Option<String>,
    pub device_key: Option<String>,
    pub access_token: Option<String>,
    pub expires_at: Option<String>,
}

/// Returns the session file path (`~/.apidot/session.json` by default).
///
/// `APIDOT_SESSION_PATH` is honoured only in debug builds, so tests never touch
/// the real user profile while a release build can never be redirected outside it.
fn session_file_path() -> PathBuf {
    if cfg!(debug_assertions) {
        if let Ok(custom_path) = std::env::var(SESSION_PATH_ENV) {
            if !custom_path.trim().is_empty() {
                return PathBuf::from(custom_path);
            }
        }
    }

    default_session_file_path()
}

fn default_session_file_path() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".apidot").join("session.json")
    } else if let Ok(userprofile) = std::env::var("USERPROFILE") {
        PathBuf::from(userprofile).join(".apidot").join("session.json")
    } else {
        PathBuf::from(".apidot").join("session.json")
    }
}

/// Restricts a directory to owner-only access (0700) on Unix platforms.
#[cfg(unix)]
fn set_directory_permissions(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
}

#[cfg(not(unix))]
fn set_directory_permissions(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

/// Restricts a file to owner read/write access (0600) on Unix platforms.
#[cfg(unix)]
fn set_file_permissions(path: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
}

#[cfg(not(unix))]
fn set_file_permissions(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

/// Creates or truncates a file with private permissions where the platform
/// allows it at creation time. The mode is re-applied afterwards anyway.
#[cfg(unix)]
fn create_private_file(path: &Path) -> std::io::Result<std::fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)
}

#[cfg(not(unix))]
fn create_private_file(path: &Path) -> std::io::Result<std::fs::File> {
    std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)
}

/// Builds the sibling temp path used for the atomic write.
fn temporary_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "session.json".to_string());
    path.with_file_name(format!(".{}.tmp.{}", file_name, std::process::id()))
}

/// Renames the temp file over the destination, tolerating platforms where
/// renaming onto an existing file fails.
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    match std::fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(_) if destination.exists() => {
            std::fs::remove_file(destination)?;
            std::fs::rename(source, destination)
        }
        Err(err) => Err(err),
    }
}

/// Writes a session atomically: temp file in the same directory, then rename.
fn write_session_file(session: &DesktopSession) -> Result<(), String> {
    let path = session_file_path();
    let parent = path
        .parent()
        .ok_or_else(|| format!("Session path has no parent directory: {:?}", path))?;

    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create session directory '{:?}': {}", parent, e))?;

    // Tighten an existing `~/.apidot` as well, not only a freshly created one.
    set_directory_permissions(parent).map_err(|e| {
        format!(
            "Failed to restrict permissions on session directory '{:?}': {}",
            parent, e
        )
    })?;

    let json = serde_json::to_vec_pretty(session)
        .map_err(|e| format!("Failed to serialize desktop session: {}", e))?;

    let tmp_path = temporary_path(&path);
    let write_result = (|| -> std::io::Result<()> {
        use std::io::Write;

        let mut file = create_private_file(&tmp_path)?;
        file.write_all(&json)?;
        file.sync_all()?;
        drop(file);

        set_file_permissions(&tmp_path)?;
        replace_file(&tmp_path, &path)
    })();

    if let Err(err) = write_result {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!(
            "Failed to write session file '{:?}': {}",
            path, err
        ));
    }

    Ok(())
}

/// Tauri IPC command to read `~/.apidot/session.json`.
///
/// A missing or corrupt file yields `None`; the app must still start.
///
/// Files written before `server_url` was dropped still load: serde ignores
/// unknown fields unless `deny_unknown_fields` is set, which it is not.
#[tauri::command]
pub fn load_session() -> Option<DesktopSession> {
    let path = session_file_path();
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Tauri IPC command to persist the desktop session atomically.
#[tauri::command]
pub fn save_session(session: DesktopSession) -> Result<(), String> {
    write_session_file(&session)
}

/// Tauri IPC command to end the local session while keeping the machine identity.
///
/// Clears the user, device, token and expiry fields; only `device_key` survives
/// so the next login reuses the same device.
#[tauri::command]
pub fn clear_session() -> Result<(), String> {
    let path = session_file_path();
    if !path.exists() {
        return Ok(());
    }

    match load_session() {
        Some(mut session) => {
            session.user_id = None;
            session.device_id = None;
            session.access_token = None;
            session.expires_at = None;
            write_session_file(&session)
        }
        // Unreadable file: nothing worth preserving, replace it with a clean one.
        None => write_session_file(&DesktopSession::default()),
    }
}
