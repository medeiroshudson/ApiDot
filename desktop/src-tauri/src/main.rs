#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tokio::sync::Mutex;
use apidot_desktop::session::*;
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
        // Must stay the first plugin: it intercepts launches of a second instance.
        // The `deep-link` feature forwards the URL to tauri-plugin-deep-link, which
        // then emits `onOpenUrl`, so no event is re-emitted here.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        // Registered after single-instance so forwarded URLs are delivered.
        .plugin(tauri_plugin_deep_link::init())
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
            load_session,
            save_session,
            clear_session,
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run({
            // A quit request (AppleEvent, Cmd+Q) never reaches `on_window_event`, so the
            // sidecar must also be stopped from the app-level run loop. `stop_sidecar` is
            // idempotent (`child.take()`), so handling both exit events is safe.
            let sidecar_manager = sidecar_manager.clone();
            move |_app_handle, event| {
                if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                    let manager = sidecar_manager.clone();
                    tauri::async_runtime::block_on(async move {
                        let mut mgr = manager.lock().await;
                        let _ = mgr.stop_sidecar().await;
                    });
                }
            }
        });
}
