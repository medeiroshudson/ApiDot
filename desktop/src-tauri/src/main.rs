#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use std::sync::Arc;
use tokio::sync::Mutex;
use sidecar::{get_sidecar_info, SidecarManager};

fn main() {
    let sidecar_manager = Arc::new(Mutex::new(SidecarManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(sidecar_manager.clone())
        .invoke_handler(tauri::generate_handler![get_sidecar_info])
        .setup({
            let sidecar_manager = sidecar_manager.clone();
            move |_app| {
                // Inicia o sidecar em segundo plano na abertura da aplicação
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
