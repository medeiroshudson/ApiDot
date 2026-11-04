use apidot_desktop::menu::{
    create_about_metadata, ABOUT_AUTHORS, ABOUT_COMMENTS, ABOUT_COPYRIGHT, ABOUT_LICENSE,
    ABOUT_NAME, ABOUT_WEBSITE, OPEN_SETTINGS_ACCELERATOR, OPEN_SETTINGS_EVENT, OPEN_SETTINGS_ID,
};
use std::fs;
use std::path::PathBuf;

#[test]
fn test_menu_builder_compiles_and_creates_structure() {
    assert_eq!(OPEN_SETTINGS_ID, "open_settings");
    assert_eq!(OPEN_SETTINGS_ACCELERATOR, "CmdOrControl+,");
    assert_eq!(OPEN_SETTINGS_EVENT, "open-global-settings");
}

#[test]
fn test_about_metadata_configuration() {
    assert_eq!(ABOUT_NAME, "ApiDot");
    assert_eq!(
        ABOUT_COMMENTS,
        "Test and debug any API, anywhere — from localhost to production"
    );
    assert_eq!(ABOUT_AUTHORS, &["Hudson Medeiros"]);
    assert_eq!(ABOUT_WEBSITE, "https://apidot.hmedeiros.dev");
    assert_eq!(ABOUT_COPYRIGHT, "© 2026 Hudson Medeiros");
    assert_eq!(ABOUT_LICENSE, "MIT License");

    let version = "0.5.1";
    let metadata = create_about_metadata(version);

    assert_eq!(metadata.name.as_deref(), Some("ApiDot"));
    assert_eq!(metadata.version.as_deref(), Some("0.5.1"));
    assert_eq!(
        metadata.comments.as_deref(),
        Some("Test and debug any API, anywhere — from localhost to production")
    );
    assert_eq!(
        metadata.authors,
        Some(vec!["Hudson Medeiros".to_string()])
    );
    assert_eq!(
        metadata.website.as_deref(),
        Some("https://apidot.hmedeiros.dev")
    );
    assert_eq!(
        metadata.copyright.as_deref(),
        Some("© 2026 Hudson Medeiros")
    );
    assert_eq!(metadata.license.as_deref(), Some("MIT License"));
}

#[test]
fn test_menu_wiring_in_main_rs() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let main_rs_path = manifest_dir.join("src").join("main.rs");
    let main_rs_content = fs::read_to_string(&main_rs_path).expect("main.rs should exist");

    assert!(
        main_rs_content.contains("build_app_menu"),
        "main.rs must call build_app_menu"
    );
    assert!(
        main_rs_content.contains("set_menu"),
        "main.rs must set the built menu"
    );
    assert!(
        main_rs_content.contains("on_menu_event"),
        "main.rs must register on_menu_event handler"
    );
    assert!(
        main_rs_content.contains("open_settings"),
        "main.rs menu event handler must check for open_settings"
    );
    assert!(
        main_rs_content.contains("open-global-settings"),
        "main.rs menu event handler must emit open-global-settings"
    );
}

#[test]
fn test_menu_module_registered_in_lib_rs() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let lib_rs_path = manifest_dir.join("src").join("lib.rs");
    let lib_rs_content = fs::read_to_string(&lib_rs_path).expect("lib.rs should exist");

    assert!(
        lib_rs_content.contains("pub mod menu;"),
        "lib.rs must register pub mod menu;"
    );
}

#[test]
fn test_menu_labels_explicitly_use_apidot() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let menu_rs_path = manifest_dir.join("src").join("menu.rs");
    let menu_rs_content = fs::read_to_string(&menu_rs_path).expect("menu.rs should exist");

    assert!(
        menu_rs_content.contains("format!(\"About {}\", ABOUT_NAME)"),
        "menu.rs must explicitly format About label with ApiDot"
    );
    assert!(
        menu_rs_content.contains("format!(\"Hide {}\", ABOUT_NAME)"),
        "menu.rs must explicitly format Hide label with ApiDot"
    );
    assert!(
        menu_rs_content.contains("format!(\"Quit {}\", ABOUT_NAME)"),
        "menu.rs must explicitly format Quit label with ApiDot"
    );
}
