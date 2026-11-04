# Technical Design: Tauri Desktop Packaging, Native AOT Sidecar, and Offline Operations

**Date:** 2026-11-02  
**Status:** Approved  
**Author:** Hudson Medeiros & Orchestrator  
**Scope:** Desktop (Tauri v2) / Native AOT Agent (.NET 9) / Frontend (Next.js 16) / Offline Sync & Reconciliation

---

## 1. Intent and Motivation (The Why)

**ApiDot** primarily operates as a web application paired with a local CLI agent (`ApiDot.Agent`) compiled via .NET Native AOT. Testing requests against local APIs (`localhost`, private networks, Docker containers, and corporate VPNs) requires users of the web version to install and run the agent separately via terminal or system daemon (`launchd`/`systemd`).

A purely client-side browser approach (using standard `fetch`) is blocked by browser security restrictions:
1. **CORS and Private Network Access (PNA):** Strict browser blocking of status codes, headers, and response bodies for `localhost`/LAN endpoints lacking permissive preflight headers.
2. **Forbidden Headers:** The W3C specification forbids browser code from modifying headers like `Host`, `Origin`, `User-Agent`, and `Cookie`.
3. **Mixed Content:** Secure web applications served over HTTPS (`https://apidot.hmedeiros.dev`) cannot issue plain HTTP requests to local targets.

To eliminate terminal installation friction and provide a first-class native desktop experience similar to Postman/Insomnia/Bruno, this project introduces **ApiDot Desktop** packaged with **Tauri v2**, embedding `ApiDot.Agent` as a **transparently managed sidecar**.

Additionally, the desktop app supports full **offline operation**, storing workspaces and collections on disk in JSON format under `~/.apidot/storage/` and reconciling data with the cloud server (`https://apidot.hmedeiros.dev`) upon reconnection.

---

## 2. Goals, Non-Goals, and Anti-Goals

### 2.1. Goals
- **Desktop Packaging with Tauri v2:**
  - Build native installers and binaries for macOS (.dmg / universal or arm64/x64), Windows (.msi / .exe), and Linux (.deb / AppImage).
  - Embed the Next.js 16 frontend in a mode compatible with Tauri's native webview.
- **Transparent Native Sidecar (.NET Native AOT):**
  - Package the `ApiDot.Agent` binary inside the Tauri bundle.
  - Automatically start the sidecar child process in the background upon application startup.
  - Send clean termination signals (`SIGTERM`/kill) on application exit to prevent orphan processes.
- **Hybrid Sidecar Communication (Loopback HTTP + WebSocket):**
  - Expose a minimal loopback Kestrel HTTP listener (`127.0.0.1:<ephemeral-port>`).
  - When online, connect to the cloud hub WebSocket (`https://apidot.hmedeiros.dev`), preserving parity with the remote execution model.
  - When offline or targeting local endpoints, dispatch requests directly to the sidecar loopback listener, bypassing CORS and mixed content.
- **First-Run Authentication & Cache Hydration:**
  - Initial desktop launch requires internet connectivity for mandatory user authentication and initial workspace/collection cache download from `ApiDot.Server`.
  - Store the authenticated session safely for subsequent offline launches.
- **Centralized Configuration in `~/.apidot/config.json`:**
  - Re-use the existing `~/.apidot/config.json` configuration file used by the agent CLI (default server: `https://apidot.hmedeiros.dev`).
- **Granular Execution Target Selectors (Global and Collection Level):**
  - **Global Settings:** Default target selector allowing `Local Device` (default), `Cloud server`, or a specific registered device (`TargetDeviceId`).
  - **Collection Settings:** Granular target selector: `Inherit from Global Settings`, `Cloud server`, `Local Device`, or a specific registered device (`TargetDeviceId`).
  - **Cascade Resolution:** Request -> Folder -> Collection -> Global Settings -> Active Device fallback.
- **Subsequent Offline Operation (Local-First):**
  - After first successful login, users can open and use the desktop app 100% offline.
  - Persist workspaces, collections, and requests in local JSON files under `~/.apidot/storage/`.
  - Allow creating, editing, and executing requests offline against local services.
- **Cloud Reconciliation on Reconnect:**
  - Automatically detect network status changes.
  - Synchronize queued mutations to `POST /api/sync/batch` using Last-Write-Wins (LWW) resolution and create non-destructive `(Local Backup)` copies on strict conflict.

### 2.2. Non-Goals
- Do not rewrite the HTTP request engine in Rust: execution remains powered by `SocketsHttpHandler` in C# Native AOT.
- Do not deprecate the standalone Agent CLI: developers using headless servers or preferring terminal commands retain full support for `apidot-agent connect` and `service install`.
- Do not embed PostgreSQL in the desktop client: offline mode persists JSON documents directly on disk.

### 2.3. Anti-Goals
- **Zero orphan processes:** Under no circumstances should `ApiDot.Agent` remain running after closing the desktop window.
- **Zero port conflicts:** Loopback listeners must bind to port `0` (OS-assigned ephemeral port).
- **Zero web regressions:** The Next.js frontend code remains shared between Web and Desktop using clean runtime detection.

---

## 3. Evaluated Approaches and Architectural Decision

### Approach 1: Tauri v2 + .NET Native AOT Sidecar with Loopback HTTP & Reverse WebSocket (Selected)
- **Description:** Tauri embeds the web UI and manages `ApiDot.Agent` as a sidecar process. The agent starts a lightweight loopback Kestrel server (`127.0.0.1:0`) and reports the allocated port via stdout to Tauri. When online, it also connects via WebSocket to `apidot.hmedeiros.dev`.
- **Trade-offs:** 
  - *Pros:* Re-uses 100% of tested DTOs (`HttpRequestDispatch`, `HttpResponsePayload`), Native AOT serialization context (`AgentJsonContext`), and execution engine.
  - *Cons:* Requires dynamic port communication from child process to Tauri frontend.

### Approach 2: Tauri v2 + Stdio IPC Sidecar
- **Description:** Tauri and the agent communicate purely over `stdin`/`stdout` streams.
- **Trade-offs:**
  - *Pros:* Allocates zero loopback network ports.
  - *Cons:* Requires custom binary message framing and buffering in C# and Rust.

### Approach 3: Tauri without Sidecar (Native Rust `reqwest` Engine)
- **Description:** Rust directly executes requests using `reqwest`.
- **Trade-offs:**
  - *Pros:* Smaller bundle size without child process.
  - *Cons:* Duplicates variable resolution, timing breakdowns, response history, and execution divergence from .NET backend.

---

## 4. Architecture and Execution Flow

### 4.1. Repository Layout
```text
ApiDot/
├── backend/
│   ├── src/ApiDot.Agent/      # CLI + sidecar mode
│   └── src/ApiDot.Server/     # ASP.NET Core API + /api/sync/batch
├── frontend/                  # Shared Next.js 16 Web/Desktop UI
│   └── src/
│       ├── lib/desktop/       # Runtime detection (Web vs Tauri) & executor
│       └── lib/sync/          # Offline queue & reconciliation manager
├── desktop/                   # Tauri v2 Desktop Project
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   ├── src/
│   │   │   ├── main.rs        # Application entry, IPC registration
│   │   │   ├── sidecar.rs     # Process lifecycle, port detection, shutdown
│   │   │   └── storage.rs     # Local-first disk storage commands
│   │   └── binaries/          # Native AOT binaries with target triple suffix
```

### 4.2. Sidecar Process Lifecycle
1. On startup, `desktop/src-tauri/src/sidecar.rs` generates a secure random UUID secret and launches:
   ```bash
   apidot-agent sidecar --config ~/.apidot/config.json --port 0 --secret <secret-token>
   ```
2. The agent binds Kestrel to `127.0.0.1:0` and prints to stdout:
   ```text
   [APIDOT_SIDECAR_READY:54321]
   ```
3. Tauri captures the port number, stores `(port, secret)` in managed state, and exposes it via IPC command `get_sidecar_info`.
4. **Loopback Protection:** All loopback requests require the `X-ApiDot-Sidecar-Secret` header, blocking cross-origin DNS rebinding attacks.
5. **CORS & Preflight:** Handles `OPTIONS` with `204 No Content` and Private Network Access (`Access-Control-Allow-Private-Network`).
6. **Daemon Detection:** Checks `ServiceManager.Status().Success`. If an OS background service is already active, suppresses duplicate WebSocket connections to preserve a unified device identity.

### 4.3. Request Dispatch Routing
- **Web Browser:** Dispatches to `POST /api/requests/execute` on `ApiDot.Server`.
- **Desktop (Online & Server Target):** Dispatches to `POST /api/requests/execute` on the server.
- **Desktop (Local Device Target or Offline):** Dispatches directly to `http://127.0.0.1:<port>/execute` on the local sidecar.

### 4.4. Offline Storage Structure
```text
~/.apidot/
├── config.json              # Connection configuration
├── storage/
│   ├── workspaces/
│   │   └── <workspaceId>.json
│   ├── collections/
│   │   └── <workspaceId>/<collectionId>.json
│   └── queue/
│       └── pending_mutations.json
```

---

## 5. Delivery Phases

1. **Phase 1: Sidecar Mode in `ApiDot.Agent` (.NET Native AOT)**
2. **Phase 2: Granular Target Selectors & Cascade Resolution**
3. **Phase 3: Tauri v2 Desktop Scaffolding in `desktop/`**
4. **Phase 4: Sidecar Process Lifecycle Management in Rust**
5. **Phase 5: Desktop Execution Adapter and Frontend Routing**
6. **Phase 6: Local-First Disk Persistence and Offline Mode**
7. **Phase 7: Backend Batch Reconciliation (`POST /api/sync/batch`)**
8. **Phase 8: Frontend Reconnection Synchronizer (`syncManager.ts`)**
9. **Phase 9: Full Build and Test Suite Validation**
