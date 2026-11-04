use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Runtime,
};

pub const OPEN_SETTINGS_ID: &str = "open_settings";
pub const OPEN_SETTINGS_ACCELERATOR: &str = "CmdOrControl+,";
pub const OPEN_SETTINGS_EVENT: &str = "open-global-settings";

pub const ABOUT_NAME: &str = "ApiDot";
pub const ABOUT_COMMENTS: &str =
    "Test and debug any API, anywhere — from localhost to production";
pub const ABOUT_AUTHORS: &[&str] = &["Hudson Medeiros"];
pub const ABOUT_WEBSITE: &str = "https://apidot.hmedeiros.dev";
pub const ABOUT_COPYRIGHT: &str = "© 2026 Hudson Medeiros";
pub const ABOUT_LICENSE: &str = "MIT License";

/// Creates the About dialog metadata populated with ApiDot application details.
pub fn create_about_metadata(version: &str) -> AboutMetadata<'static> {
    AboutMetadata {
        name: Some(ABOUT_NAME.to_string()),
        version: Some(version.to_string()),
        comments: Some(ABOUT_COMMENTS.to_string()),
        authors: Some(ABOUT_AUTHORS.iter().map(|s| s.to_string()).collect()),
        website: Some(ABOUT_WEBSITE.to_string()),
        copyright: Some(ABOUT_COPYRIGHT.to_string()),
        license: Some(ABOUT_LICENSE.to_string()),
        ..Default::default()
    }
}

/// Creates the Settings menu item bound to `CmdOrControl+,` accelerator.
pub fn create_settings_item<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(
        app,
        OPEN_SETTINGS_ID,
        "Settings...",
        true,
        Some(OPEN_SETTINGS_ACCELERATOR),
    )
}

/// Builds the native menu structure conforming to macOS Human Interface Guidelines.
pub fn build_macos_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app.package_info();
    let about_metadata = create_about_metadata(&pkg_info.version.to_string());
    let settings_item = create_settings_item(app)?;

    let about_label = format!("About {}", ABOUT_NAME);
    let hide_label = format!("Hide {}", ABOUT_NAME);
    let quit_label = format!("Quit {}", ABOUT_NAME);

    let app_menu = Submenu::with_items(
        app,
        ABOUT_NAME,
        true,
        &[
            &PredefinedMenuItem::about(app, Some(&about_label), Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(&hide_label))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&quit_label))?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(app, None)?],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_items(app, "Help", true, &[])?;

    Menu::with_items(
        app,
        &[&app_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
    )
}

/// Builds the native menu structure conforming to Windows and Linux desktop guidelines.
pub fn build_non_macos_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app.package_info();
    let about_metadata = create_about_metadata(&pkg_info.version.to_string());
    let settings_item = create_settings_item(app)?;

    let about_label = format!("About {}", ABOUT_NAME);
    let quit_label = format!("Quit {}", ABOUT_NAME);

    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(&quit_label))?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(app, None)?],
    )?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[&PredefinedMenuItem::about(app, Some(&about_label), Some(about_metadata))?],
    )?;

    Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &help_menu])
}

/// Builds the application menu tailored to the current host operating system.
pub fn build_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    #[cfg(target_os = "macos")]
    {
        build_macos_menu(app)
    }

    #[cfg(not(target_os = "macos"))]
    {
        build_non_macos_menu(app)
    }
}
