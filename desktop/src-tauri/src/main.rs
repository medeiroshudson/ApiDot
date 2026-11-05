#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tokio::sync::Mutex;
use apidot_desktop::sidecar::*;
use apidot_desktop::storage::*;
use tauri::Manager;

#[tauri::command]
async fn restart_app_cleanly(
    app_handle: tauri::AppHandle,
    sidecar_manager: tauri::State<'_, Arc<Mutex<SidecarManager>>>,
) -> Result<(), String> {
    let mut mgr = sidecar_manager.lock().await;
    let _ = mgr.stop_sidecar().await;
    drop(mgr);
    app_handle.restart();
    #[allow(unreachable_code)]
    Ok(())
}

fn main() {
    let sidecar_manager = Arc::new(Mutex::new(SidecarManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(sidecar_manager.clone())
        .invoke_handler(tauri::generate_handler![
            get_sidecar_info,
            restart_app_cleanly,
            fs_save_storage,
            fs_load_storage,
            fs_list_storage,
            fs_delete_storage,
        ])
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "open_settings" {
                let _ = tauri::Emitter::emit(app, "open-global-settings", ());
                if let Some(window) = app.get_webview_window("main") {
                    let _ = tauri::Emitter::emit(&window, "open-global-settings", ());
                    let _ = window.eval("window.dispatchEvent(new CustomEvent('open-global-settings'))");
                }
            }
        })
        .setup({
            let sidecar_manager = sidecar_manager.clone();
            move |app| {
                // Attach application menu
                let menu = apidot_desktop::menu::build_app_menu(app.handle())?;
                app.set_menu(menu)?;

                // Start sidecar in the background upon application startup
                tauri::async_runtime::spawn(async move {
                    let mut mgr = sidecar_manager.lock().await;
                    if let Err(err) = mgr.start_sidecar().await {
                        eprintln!("[sidecar] Notice: sidecar startup postponed or failed: {}", err);
                    }
                });
                Ok(())
            }
        })
        .on_window_event({
            let sidecar_manager = sidecar_manager.clone();
            move |_window, event| {
                if let tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed = event {
                    let manager = sidecar_manager.clone();
                    tauri::async_runtime::block_on(async move {
                        let mut mgr = manager.lock().await;
                        let _ = mgr.stop_sidecar().await;
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
