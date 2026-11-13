use apidot_desktop::session::{clear_session, load_session, save_session, DesktopSession};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Serializes tests that mutate the process-wide `APIDOT_SESSION_PATH`.
static ENV_MUTEX: Mutex<()> = Mutex::new(());

/// Runs a test body against a scratch session file and restores the environment.
fn with_temp_session<R>(body: impl FnOnce(&Path) -> R) -> R {
    let _guard = ENV_MUTEX.lock().unwrap_or_else(|poisoned| poisoned.into_inner());

    let dir = std::env::temp_dir().join(format!("apidot_session_test_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).expect("create scratch session directory");
    let path: PathBuf = dir.join("session.json");

    std::env::set_var("APIDOT_SESSION_PATH", &path);
    let result = body(&path);
    std::env::remove_var("APIDOT_SESSION_PATH");

    let _ = std::fs::remove_dir_all(&dir);
    result
}

fn full_session() -> DesktopSession {
    DesktopSession {
        user_id: Some("user-1".to_string()),
        device_id: Some("device-1".to_string()),
        device_key: Some("key-1".to_string()),
        access_token: Some("token-1".to_string()),
        expires_at: Some("2026-12-09T00:00:00Z".to_string()),
    }
}

#[test]
fn save_then_load_round_trips() {
    with_temp_session(|_| {
        let session = full_session();
        save_session(session.clone()).expect("save_session should succeed");
        assert_eq!(load_session(), Some(session));
    });
}

#[test]
fn load_missing_file_is_none() {
    with_temp_session(|path| {
        assert!(!path.exists());
        assert_eq!(load_session(), None);
    });
}

#[test]
fn corrupt_json_loads_as_none() {
    with_temp_session(|path| {
        std::fs::create_dir_all(path.parent().expect("session path has a parent"))
            .expect("create parent directory");
        std::fs::write(path, "{ this is not valid json").expect("write corrupt session file");

        assert_eq!(load_session(), None);
    });
}

#[test]
fn clear_session_keeps_only_the_device_key() {
    with_temp_session(|_| {
        save_session(full_session()).expect("save_session should succeed");

        clear_session().expect("clear_session should succeed");

        let cleared = load_session().expect("session file should still exist");
        assert_eq!(cleared.user_id, None);
        assert_eq!(cleared.device_id, None);
        assert_eq!(cleared.access_token, None);
        assert_eq!(cleared.expires_at, None);
        assert_eq!(cleared.device_key.as_deref(), Some("key-1"));
    });
}

#[test]
fn load_session_ignores_an_unknown_server_url_field() {
    with_temp_session(|path| {
        std::fs::create_dir_all(path.parent().expect("session path has a parent"))
            .expect("create parent directory");
        std::fs::write(
            path,
            r#"{
                "user_id": "user-1",
                "device_id": "device-1",
                "device_key": "key-1",
                "access_token": "token-1",
                "expires_at": "2026-12-09T00:00:00Z",
                "server_url": "https://api.example.test"
            }"#,
        )
        .expect("write legacy session file");

        assert_eq!(load_session(), Some(full_session()));
    });
}

#[test]
fn clear_session_without_file_succeeds() {
    with_temp_session(|path| {
        assert!(!path.exists());
        assert!(clear_session().is_ok());
        // Clearing a missing session must not create one.
        assert!(!path.exists());
    });
}

#[test]
fn save_replaces_an_existing_session() {
    with_temp_session(|_| {
        save_session(full_session()).expect("initial save should succeed");

        let mut updated = full_session();
        updated.access_token = Some("token-2".to_string());
        save_session(updated.clone()).expect("second save should succeed");

        assert_eq!(load_session(), Some(updated));
    });
}

#[cfg(unix)]
#[test]
fn saved_file_and_directory_are_private() {
    use std::os::unix::fs::PermissionsExt;

    with_temp_session(|path| {
        save_session(full_session()).expect("save_session should succeed");

        let parent = path.parent().expect("session path has a parent");
        let dir_mode = std::fs::metadata(parent)
            .expect("read directory metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(dir_mode, 0o700, "session directory must be 0700");

        let file_mode = std::fs::metadata(path)
            .expect("read file metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(file_mode, 0o600, "session file must be 0600");
    });
}
