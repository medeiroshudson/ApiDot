# Technical Design: Native Desktop Application Menus, About Metadata, and Keyboard Shortcuts

**Date:** 2026-11-03  
**Status:** Approved  
**Author:** Hudson Medeiros & Orchestrator  
**Scope:** Desktop (Tauri v2 / Rust) & Frontend (Next.js 16 / React)

---

## 1. Intent and Motivation (The Why)

Standard desktop applications across macOS, Windows, and Linux are expected to adhere to their respective platform conventions for system application menus, standard accelerators (shortcuts), and application metadata ("About" information):

1. **macOS Human Interface Guidelines (HIG):**
   - The primary application menu (`ApiDot`) contains "About ApiDot" with rich metadata (version, license, authors, description, website).
   - "Settings..." (Preferences) is bound to the canonical **`Cmd+,`** (`⌘,`) shortcut.
   - Standard menu bars include `Edit` (Undo, Redo, Cut, Copy, Paste, Select All), `View` (Reload, Toggle Fullscreen), and `Window` (Minimize, Zoom).
2. **Windows & Linux Guidelines:**
   - The `File` menu provides "Settings..." bound to **`Ctrl+,`** and "Exit" (`Alt+F4` / `Ctrl+Q`).
   - The `Help` menu provides "About ApiDot" and documentation links.
3. **Web & Desktop Keyboard Shortcut Parity:**
   - Pressing `Cmd+,` on macOS or `Ctrl+,` on Windows/Linux inside the application window should trigger the Global Settings Modal, regardless of whether the shortcut is invoked through the OS native menu bar or directly via in-window keyboard events.

---

## 2. Goals, Non-Goals, and Anti-Goals

### 2.1. Goals
- **Platform-Native Menus:**
  - Build platform-specific menu trees in Rust using Tauri v2's native `tauri::menu::*` APIs.
  - On macOS, construct the Application Menu (`ApiDot`), `Edit`, `View`, `Window`, and `Help`.
  - On Windows/Linux, construct `File`, `Edit`, `View`, and `Help`.
- **Rich "About" Dialog:**
  - Configure `AboutMetadata`:
    - **Name:** `ApiDot`
    - **Version:** Synchronized with `app.package_info().version` (`0.5.1`)
    - **Description:** *"Test and debug any API, anywhere — from localhost to production"*
    - **Authors:** `["Hudson Medeiros"]`
    - **Website:** `https://apidot.hmedeiros.dev`
    - **Copyright:** `© 2026 Hudson Medeiros`
    - **License:** `MIT License`
- **Settings Shortcuts (`Cmd+,` / `Ctrl+,`):**
  - Native menu item `"Settings..."` configured with accelerator `CmdOrControl+,`.
  - Menu click handler emits the IPC event `open-global-settings` to the webview.
  - Frontend `WorkspaceShell.tsx` listens to `open-global-settings` and registers a window `keydown` handler for `(e.metaKey || e.ctrlKey) && e.key === ','`.
- **Automated Verification:**
  - Unit and integration tests for menu construction, event dispatching, and frontend keyboard listener.

### 2.2. Non-Goals
- Do not create a custom in-app HTML modal for "About": the native OS About box is standard, lightweight, and expected on macOS/Windows.
- Do not intercept shortcuts when text input fields or code editors are actively processing commas.

### 2.3. Anti-Goals
- **Zero cross-platform key conflicts:** Use `CmdOrControl+,` so the shortcut resolves to `Cmd+,` on macOS and `Ctrl+,` on Windows/Linux automatically.

---

## 3. Architecture & Event Bridge

```text
[OS Menu / Shortcut]              [Tauri v2 Main Process]               [Frontend WorkspaceShell]
        │                                   │                                      │
  Press Cmd+, / Ctrl+,                      │                                      │
  or click "Settings..."                    │                                      │
        ├──────────────────────────────────►│                                      │
        │                                   │ on_menu_event:                       │
        │                                   │ app.emit("open-global-settings")     │
        │                                   ├─────────────────────────────────────►│
        │                                   │                                      │ setIsSettingsOpen(true)
        │                                   │                                      ▼
        │                                   │                           [GlobalSettingsModal Opens]
```

---

## 4. Implementation Steps

1. **Rust Menu Builder (`desktop/src-tauri/src/menu.rs`):**
   - Implement `build_app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>>`.
   - Setup `AboutMetadata` and platform-conditional submenus.
2. **Rust Event Handler (`desktop/src-tauri/src/main.rs`):**
   - Register menu on the builder: `.menu(menu)`.
   - Add `.on_menu_event(|app, event| { ... })` forwarding `open_settings` to `open-global-settings`.
3. **Frontend Integration (`frontend/src/components/layout/WorkspaceShell.tsx`):**
   - Add Tauri event listener for `open-global-settings`.
   - Add in-window `keydown` handler for `(e.metaKey || e.ctrlKey) && e.key === ','`.
4. **Validation:**
   - Rust menu tests, desktop validation script, and Vitest component tests.
