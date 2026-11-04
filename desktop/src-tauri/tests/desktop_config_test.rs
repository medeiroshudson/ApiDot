use serde_json::Value;
use std::fs;

#[test]
fn test_tauri_config_validation() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let config_path = format!("{}/tauri.conf.json", manifest_dir);
    let content = fs::read_to_string(&config_path).expect("tauri.conf.json should exist");
    let config: Value = serde_json::from_str(&content).expect("tauri.conf.json should be valid JSON");

    assert_eq!(config["$schema"], "https://schema.tauri.app/config/2");
    assert_eq!(config["productName"], "ApiDot");
    assert_eq!(config["version"], "0.5.1");
    assert_eq!(config["identifier"], "dev.hmedeiros.apidot");

    assert_eq!(config["build"]["devUrl"], "http://localhost:3000");
    assert_eq!(config["build"]["frontendDist"], "../../frontend/out");

    let windows = config["app"]["windows"]
        .as_array()
        .expect("app.windows should be an array");
    assert!(!windows.is_empty(), "app.windows should not be empty");
    assert_eq!(windows[0]["title"], "ApiDot");
    assert_eq!(windows[0]["width"], 1280);
    assert_eq!(windows[0]["height"], 800);
    assert_eq!(windows[0]["resizable"], true);

    let capabilities = config["app"]["security"]["capabilities"]
        .as_array()
        .expect("app.security.capabilities should be an array");
    assert!(
        capabilities.iter().any(|c| c == "default"),
        "capabilities should contain 'default'"
    );

    assert_eq!(config["bundle"]["active"], true);
    assert_eq!(config["bundle"]["targets"], "all");
    assert_eq!(
        config["bundle"]["createUpdaterArtifacts"], true,
        "bundle.createUpdaterArtifacts must be true"
    );

    let external_bins = config["bundle"]["externalBin"]
        .as_array()
        .expect("bundle.externalBin should be an array");
    assert!(
        external_bins.iter().any(|b| b == "binaries/apidot-agent"),
        "bundle.externalBin should contain 'binaries/apidot-agent'"
    );

    let endpoints = config["plugins"]["updater"]["endpoints"]
        .as_array()
        .expect("plugins.updater.endpoints should be an array");
    assert!(!endpoints.is_empty(), "updater endpoints should not be empty");
    let endpoint_str = endpoints[0].as_str().expect("endpoint should be string");
    assert!(
        endpoint_str.contains("github.com/medeiroshudson/ApiDot/releases"),
        "updater endpoint must point to GitHub releases"
    );
}

#[test]
fn test_default_capability_validation() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let cap_path = format!("{}/capabilities/default.json", manifest_dir);
    let cap_content = fs::read_to_string(&cap_path).expect("capabilities/default.json should exist");
    let cap: Value = serde_json::from_str(&cap_content).expect("capabilities/default.json should be valid JSON");

    assert_eq!(cap["identifier"], "default");

    let permissions = cap["permissions"]
        .as_array()
        .expect("permissions should be an array");
    let perm_strs: Vec<&str> = permissions.iter().filter_map(|p| p.as_str()).collect();

    assert!(
        perm_strs.contains(&"core:default"),
        "capabilities should include core:default"
    );
    assert!(
        perm_strs.contains(&"shell:default"),
        "capabilities should include shell:default"
    );
    assert!(
        perm_strs.contains(&"fs:default"),
        "capabilities should include fs:default"
    );
    assert!(
        perm_strs.contains(&"updater:default"),
        "capabilities should include updater:default"
    );
    assert!(
        perm_strs.contains(&"process:default"),
        "capabilities should include process:default"
    );
}
