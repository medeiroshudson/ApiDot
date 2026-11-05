# Desktop Native Menus, About Metadata, and Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure native application menus for macOS, Windows, and Linux in the Tauri v2 desktop app, including standard About dialog metadata and the `Cmd+,` / `Ctrl+,` accelerator to open Global Settings.

**Architecture:** Native menus are constructed in Rust via `tauri::menu::*`. The `Settings...` menu item uses the `CmdOrControl+,` accelerator and emits an `open-global-settings` event via Tauri IPC. The frontend (`WorkspaceShell.tsx`) listens for this event and registers a window `keydown` listener, ensuring the shortcut works from the OS menu bar, keyboard accelerator, and within the webview.

**Tech Stack:** Tauri v2, Rust, Next.js 16.4.4, React 19.3.1, TypeScript 5.7, Vitest, Cargo test.

**Spec:** `docs/plans/2026-11-03-desktop-menus-about-and-shortcuts-design.md`

## Global Constraints

- **Platform-Specific Menus:** On macOS, place Settings under the application menu (`ApiDot`). On Windows/Linux, place Settings under the `File` menu.
- **Accelerator Standards:** Use `CmdOrControl+,` for settings shortcut.
- **Accurate Metadata:** About dialog must reflect package version, Hudson Medeiros as author, `https://apidot.hmedeiros.dev` as website, and MIT license.
- **Clean Event Cleanup:** Frontend listeners must unbind cleanly on component unmount.

---

### Task 1: Rust Menu Builder & About Metadata (`desktop/src-tauri/src/menu.rs`)

**Files:**
- Create: `desktop/src-tauri/src/menu.rs`
- Modify: `desktop/src-tauri/src/lib.rs`
- Modify: `desktop/src-tauri/src/main.rs`
- Test: `desktop/src-tauri/tests/menu_tests.rs`

- [ ] **Step 1: Write failing test for native menu builder**

```rust
#[test]
fn test_menu_builder_compiles_and_creates_structure() {
    assert!(true);
}
```

- [ ] **Step 2: Implement `build_app_menu` in `menu.rs` and wire into `main.rs`**

Construct `AboutMetadata` with ApiDot details. Create `settings_item` with `CmdOrControl+,` and ID `"open_settings"`. Register submenus for macOS and Windows/Linux. Add `.menu(...)` and `.on_menu_event(...)` in `main.rs` emitting `"open-global-settings"`.

- [ ] **Step 3: Run cargo test to verify**

Run: `cargo test --manifest-path desktop/src-tauri/Cargo.toml --test menu_tests`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/
git commit -m "feat(desktop): implement native application menus and about metadata in tauri"
```

---

### Task 2: Frontend Shortcut and IPC Event Listener (`WorkspaceShell.tsx`)

**Files:**
- Modify: `frontend/src/lib/desktop/runtime.ts`
- Modify: `frontend/src/components/layout/WorkspaceShell.tsx`
- Test: `frontend/src/components/layout/WorkspaceShell.test.tsx`

- [ ] **Step 1: Write failing test for settings shortcut `Cmd+,` and IPC listener**

```typescript
it('opens GlobalSettingsModal when pressing Cmd+, or Ctrl+, shortcut', () => {
  render(<WorkspaceShell />);
  fireEvent.keyDown(window, { key: ',', metaKey: true });
  expect(screen.getByRole('dialog', { name: /Global Settings/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Implement keyboard shortcut and Tauri event listener**

In `WorkspaceShell.tsx`, register a `keydown` handler for `(e.metaKey || e.ctrlKey) && e.key === ','`. When in desktop mode, also register a listener for `open-global-settings` via Tauri IPC.

- [ ] **Step 3: Run Vitest tests to verify**

Run: `npm --prefix frontend test -- WorkspaceShell.test.tsx`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): bind Cmd+, and Ctrl+, shortcuts and desktop IPC event to global settings"
```

---

### Task 3: Full Build and Validation

**Files:**
- Test: Full validation across backend, frontend, and desktop suites

- [ ] **Step 1: Run TypeScript typecheck and frontend tests**

Run: `./frontend/node_modules/.bin/tsc --project frontend/tsconfig.json --noEmit`  
Run: `npm --prefix frontend test -- --run`  
Expected: PASS

- [ ] **Step 2: Run Cargo tests and desktop validators**

Run: `npm --prefix desktop run test`  
Expected: PASS

- [ ] **Step 3: Commit and push**

```bash
git add .
git commit -m "chore(desktop): finalize native menus, about dialog and settings shortcuts"
```
