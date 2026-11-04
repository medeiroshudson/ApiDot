# Tauri Desktop with Native AOT Sidecar and Offline Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package ApiDot as a cross-platform desktop application using Tauri v2, incorporating `ApiDot.Agent` compiled with .NET Native AOT as a secure loopback sidecar, adding granular execution target selectors, local-first disk persistence (`~/.apidot/storage`), and offline cloud reconciliation.

**Architecture:** Tauri v2 packages the Next.js 16/React 19 interface and manages the `ApiDot.Agent` Native AOT child process. The sidecar runs an ephemeral loopback HTTP server (`127.0.0.1:<port>`) authenticated via `X-ApiDot-Sidecar-Secret` for direct local request execution with zero CORS friction, while maintaining a reverse WebSocket connection to the cloud hub when online. State and collections are stored in `~/.apidot/storage` with an offline mutation queue reconciled via `POST /api/sync/batch` on `ApiDot.Server`.

**Tech Stack:** Tauri v2, Rust, .NET 9 (Native AOT, Kestrel Minimal API, SocketsHttpHandler), Next.js 16.4.4, React 19.3.1, Zustand 5, TypeScript 5.7, Vitest, xUnit.

**Spec:** `docs/plans/2026-11-02-tauri-desktop-and-sidecar-agent-design.md`

## Global Constraints

- **Strict Native AOT Compliance:** `ApiDot.Agent` avoids runtime reflection; JSON serialization via `AgentJsonContext` source generator.
- **Loopback Security:** All requests to the local sidecar require the `X-ApiDot-Sidecar-Secret` header.
- **Zero Orphan Processes:** Tauri terminates the child process with `SIGTERM`/kill upon window closure or application exit.
- **Dynamic Port:** The sidecar binds to port `0` (OS-assigned ephemeral port) and reports via stdout as `[APIDOT_SIDECAR_READY:<port>]`.
- **Web & Desktop Parity:** The frontend maintains full functionality in standard web browsers, activating desktop capabilities only when `__TAURI_INTERNALS__` is detected.
- **Shared Configuration:** Re-uses `~/.apidot/config.json` for server connectivity (default: `https://apidot.hmedeiros.dev`).

## Review Focus

1. **Unauthenticated Loopback Request:** Returns `401 Unauthorized` immediately to prevent DNS rebinding.
2. **Concurrent Edit Sync Conflicts:** Preserves local offline edits as `(Local Backup)` copies rather than silently overwriting remote state.
3. **Unexpected Sidecar Process Crash:** Tauri detects child process termination and automatically resurrects the sidecar on the next IPC request.
4. **Offline First-Run Experience:** Displays clear guidance indicating that initial login and workspace download require internet connectivity.
5. **Ephemeral Port Binding Failure:** Reports non-zero exit code with diagnostic details on stderr.

---

### Task 1: Sidecar Subcommand in `ApiDot.Agent` (.NET Native AOT)

**Files:**
- Create: `backend/src/ApiDot.Agent/Commands/SidecarCommand.cs`
- Modify: `backend/src/ApiDot.Agent/AgentCliParser.cs`
- Modify: `backend/src/ApiDot.Agent/Program.cs`
- Modify: `backend/src/ApiDot.Agent/Serialization/AgentJsonContext.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Agent/SidecarCommandTests.cs`

- [x] Implement CLI parsing and Kestrel Slim loopback listener with constant-time secret authentication and OS daemon detection.

---

### Task 2: Granular Target Selectors (Global and Collection Level) and Cascade Resolution

**Files:**
- Modify: `backend/src/ApiDot.Server/Data/Entities/Collection.cs`
- Modify: `backend/src/ApiDot.Server/Services/TargetResolver.cs`
- Modify: `frontend/src/components/settings/GlobalSettingsModal.tsx`
- Modify: `frontend/src/components/collection/CollectionSettingsModal.tsx`
- Modify: `frontend/src/stores/useDeviceStore.ts`
- Test: `backend/tests/ApiDot.Server.Tests/Services/TargetResolverTests.cs`
- Test: `frontend/src/components/settings/GlobalSettingsModal.test.tsx`
- Test: `frontend/src/components/collection/CollectionSettingsModal.test.tsx`

- [x] Implement cascade target resolution (`Request` -> `Folder` -> `Collection` -> `Global` -> `Active Device` fallback) and UI selectors.

---

### Task 3: Tauri v2 Desktop Scaffolding in `desktop/`

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/tauri.conf.json`
- Create: `desktop/src-tauri/capabilities/default.json`
- Create: `desktop/src-tauri/src/main.rs`
- Modify: `package.json`

- [x] Scaffold Tauri v2 workspace with build scripts and capabilities.

---

### Task 4: Sidecar Process Lifecycle Management in Rust (`sidecar.rs`)

**Files:**
- Create: `desktop/src-tauri/src/sidecar.rs`
- Modify: `desktop/src-tauri/src/main.rs`
- Test: `desktop/src-tauri/tests/sidecar_tests.rs`

- [x] Implement child process spawning, port extraction, stream draining, and automatic resurrection on crash.

---

### Task 5: Desktop Execution Adapter and Frontend Routing

**Files:**
- Create: `frontend/src/lib/desktop/runtime.ts`
- Create: `frontend/src/lib/desktop/desktopExecutor.ts`
- Modify: `frontend/src/components/workspace/WorkspaceEditorPane.tsx`
- Test: `frontend/src/lib/desktop/desktopExecutor.test.ts`
- Test: `frontend/src/components/workspace/WorkspaceEditorPane.test.tsx`

- [x] Implement direct loopback execution adapter with Base64 byte decoding and offline fallback routing.

---

### Task 6: Local-First Disk Persistence and Offline Mode

**Files:**
- Create: `desktop/src-tauri/src/storage.rs`
- Modify: `desktop/src-tauri/src/main.rs`
- Create: `frontend/src/lib/storage/offlineStorage.ts`
- Modify: `frontend/src/stores/useWorkspaceStore.ts`
- Test: `frontend/src/lib/storage/offlineStorage.test.ts`

- [x] Implement secure disk I/O with path traversal blocking and mutation queue persistence.

---

### Task 7: Backend Batch Reconciliation (`POST /api/sync/batch`)

**Files:**
- Create: `backend/src/ApiDot.Server/Endpoints/SyncEndpoints.cs`
- Create: `backend/src/ApiDot.Server/Models/SyncBatchModels.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/SyncBatchEndpointsTests.cs`

- [x] Implement batch sync endpoint with Last-Write-Wins resolution, BOLA prevention, and non-destructive local backup creation.

---

### Task 8: Frontend Reconnection Synchronizer (`syncManager.ts`)

**Files:**
- Create: `frontend/src/lib/sync/syncManager.ts`
- Modify: `frontend/src/components/layout/WorkspaceShell.tsx`
- Test: `frontend/src/lib/sync/syncManager.test.ts`

- [x] Implement reconnection listener with `/health` polling and selective queue eviction.

---

### Task 9: Full Build, Types, and Test Suite Validation

- [x] 629 backend .NET tests passing.
- [x] 1,061 frontend Vitest tests passing.
- [x] 19 Rust integration tests and 3 desktop validator suites passing.
- [x] Clean TypeScript typecheck (`tsc --noEmit`).
- [x] Next.js Turbopack production build passing.
