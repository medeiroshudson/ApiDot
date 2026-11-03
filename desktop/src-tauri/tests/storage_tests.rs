use apidot_desktop::storage::{
    fs_delete_storage, fs_list_storage, fs_load_storage, fs_save_storage, get_storage_root,
    sanitize_relative_path,
};
use std::path::PathBuf;

#[test]
fn test_storage_root_resolution() {
    let root = get_storage_root();
    assert!(root.to_string_lossy().contains(".apidot"));
    assert!(root.to_string_lossy().contains("storage"));
    assert!(root.exists(), "Storage root directory should be created if missing");
}

#[test]
fn test_storage_root_custom_env() {
    let temp_dir = std::env::temp_dir().join(format!("apidot_test_root_{}", uuid::Uuid::new_v4()));
    std::env::set_var("APIDOT_STORAGE_ROOT", &temp_dir);

    let resolved = get_storage_root();
    assert_eq!(resolved, temp_dir);
    assert!(temp_dir.exists(), "Custom storage root should be created");

    // Clean up
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::env::remove_var("APIDOT_STORAGE_ROOT");
}

#[test]
fn test_path_traversal_prevention_parent_dir() {
    let traversal_attempts = [
        "../secret.txt",
        "..\\secret.txt",
        "workspaces/../../etc/passwd",
        "workspaces/../ws-1.json",
        "foo/bar/../../../baz",
        "..",
        "/..",
    ];

    for attempt in &traversal_attempts {
        let result = sanitize_relative_path(attempt);
        assert!(
            result.is_err(),
            "Path traversal attempt '{}' should be rejected",
            attempt
        );
        let err = result.unwrap_err();
        assert!(
            err.contains("Path traversal detected") || err.contains("not allowed"),
            "Error for '{}' should explain rejection: {}",
            attempt,
            err
        );
    }
}

#[test]
fn test_path_traversal_prevention_empty_and_null() {
    assert!(sanitize_relative_path("").is_err());
    assert!(sanitize_relative_path("   ").is_err());
    assert!(sanitize_relative_path("workspaces/\0evil.json").is_err());
}

#[test]
fn test_sanitize_valid_relative_paths() {
    let root = get_storage_root();

    let valid_paths = [
        ("workspaces/ws-1.json", root.join("workspaces/ws-1.json")),
        ("/workspaces/ws-1.json", root.join("workspaces/ws-1.json")),
        ("collections/ws-1/col-1.json", root.join("collections/ws-1/col-1.json")),
        ("queue/pending_mutations.json", root.join("queue/pending_mutations.json")),
    ];

    for (input, expected) in &valid_paths {
        let result = sanitize_relative_path(input).expect("Should sanitize valid relative path");
        assert_eq!(result, *expected);
    }
}

#[tokio::test]
async fn test_save_load_delete_roundtrip() {
    let test_dir = std::env::temp_dir().join(format!("apidot_test_io_{}", uuid::Uuid::new_v4()));
    std::env::set_var("APIDOT_STORAGE_ROOT", &test_dir);

    let rel_path = "workspaces/ws-test-1.json".to_string();
    let content = "{\"id\":\"ws-test-1\",\"name\":\"Test WS\"}".to_string();

    // 1. Save
    let save_res = fs_save_storage(rel_path.clone(), content.clone()).await;
    assert!(save_res.is_ok(), "fs_save_storage should succeed");

    // 2. Load
    let load_res = fs_load_storage(rel_path.clone()).await;
    assert_eq!(load_res.unwrap(), content);

    // 3. List
    let list_res = fs_list_storage("workspaces".to_string()).await.unwrap();
    assert!(list_res.contains(&"ws-test-1.json".to_string()));

    // 4. Delete
    let delete_res = fs_delete_storage(rel_path.clone()).await;
    assert!(delete_res.is_ok(), "fs_delete_storage should succeed");

    // 5. Verify gone
    let load_after_delete = fs_load_storage(rel_path).await;
    assert!(load_after_delete.is_err(), "Loading deleted file should fail");

    // Clean up
    let _ = std::fs::remove_dir_all(&test_dir);
    std::env::remove_var("APIDOT_STORAGE_ROOT");
}

#[tokio::test]
async fn test_list_nonexistent_directory_returns_empty() {
    let test_dir = std::env::temp_dir().join(format!("apidot_test_list_{}", uuid::Uuid::new_v4()));
    std::env::set_var("APIDOT_STORAGE_ROOT", &test_dir);

    let list_res = fs_list_storage("nonexistent_folder".to_string()).await;
    assert!(list_res.is_ok());
    assert_eq!(list_res.unwrap(), Vec::<String>::new());

    let _ = std::fs::remove_dir_all(&test_dir);
    std::env::remove_var("APIDOT_STORAGE_ROOT");
}

#[tokio::test]
async fn test_delete_nonexistent_file_is_idempotent() {
    let test_dir = std::env::temp_dir().join(format!("apidot_test_del_{}", uuid::Uuid::new_v4()));
    std::env::set_var("APIDOT_STORAGE_ROOT", &test_dir);

    let delete_res = fs_delete_storage("workspaces/does_not_exist.json".to_string()).await;
    assert!(delete_res.is_ok(), "Deleting nonexistent file should be idempotent and succeed");

    let _ = std::fs::remove_dir_all(&test_dir);
    std::env::remove_var("APIDOT_STORAGE_ROOT");
}
