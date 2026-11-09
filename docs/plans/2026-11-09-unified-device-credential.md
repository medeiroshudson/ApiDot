# Unified Device Credential — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one credential per machine drives both the desktop UI (REST) and its sidecar (WebSocket), with one revocation point, while local `/execute` stays available offline.

**Architecture:** extend `AgentDevice` with scopes, expiry, last-used and a machine key; issue and rotate one token at login (SSO or local); authenticate REST with `rest` scope and `/ws/agent` with `ws`; the sidecar starts its WS on demand through a secret-protected local endpoint; the app stores the session in `~/.apidot/session.json` (0600).

**Tech stack:** ASP.NET Core 9, EF Core/SQLite, xUnit + FluentAssertions, Tauri v2 (Rust), Next.js 16, vitest.

**Spec:** `docs/plans/2026-11-09-unified-device-credential-design.md`

## Global Constraints

- Prerequisite: PRs #23, #24 and #25 merged into `dev`; PR #26 closed without merging.
- No new NuGet, npm or cargo packages.
- Tokens stored hashed only (SHA-256 of 32 random bytes).
- The web cookie session and the `APIDOT_AUTH_ENABLED=false` bypass keep working.
- SQLite migrations are applied at startup; one migration per schema change.
- Every task ends with `dotnet test backend/ApiDot.sln -c Release`, `npm test -- --run` in `frontend`, and `cargo check` when Rust changed.

## Review Focus

- **Logout vs revocation.** A logout must leave the device reusable; an operator revoke must never be undone by a silent re-registration.
- **Scope confusion.** A `rest`-only token must be rejected on `/ws/agent`, and a `ws`-only token on the REST API.
- **Stale credentials at boot.** An expired token must surface as a 401 and clear the session, not as an endless WS reconnect loop.
- **Legacy rows.** Devices created before this change have no scopes, no expiry and no key; they must keep connecting over WS.
- **Secret boundaries.** The sidecar secret never becomes the device token, and the device token is never written to the agent's `config.json`.

---

### Task 1: Device scope, columns and migration

**Files:**
- Create: `backend/src/ApiDot.Server/Enums/DeviceScope.cs`
- Modify: `backend/src/ApiDot.Server/Data/Entities/AgentDevice.cs`
- Modify: `backend/src/ApiDot.Server/Data/Configurations/AgentDeviceConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Migrations/<timestamp>_AddDeviceScopes.cs` (via `dotnet ef migrations add AddDeviceScopes`)
- Test: `backend/tests/ApiDot.Server.Tests/Data/DeviceSchemaTests.cs`

**Interfaces:**
- `[Flags] public enum DeviceScope { Ws = 1, Rest = 2 }`
- `AgentDevice` gains `string? DeviceKey`, `DeviceScope Scopes`, `DateTime? ExpiresAtUtc`, `DateTime? LastUsedAtUtc`.

- [ ] Write a test that creates an `AgentDevice` with no scope, saves it, and asserts the default `Scopes == DeviceScope.Ws`, plus a second device with `Rest | Ws` and a key that round-trips.
- [ ] Run it and confirm it fails to compile (columns missing).
- [ ] Add the enum, the four properties and the configuration (index on `(UserId, DeviceKey)`, no unique constraint).
- [ ] Generate the migration and add `migrationBuilder.Sql("UPDATE \"AgentDevices\" SET \"Scopes\" = 1 WHERE \"Scopes\" = 0;")`.
- [ ] Run the test; then the full backend suite.

### Task 2: Device token service

**Files:**
- Create: `backend/src/ApiDot.Server/Security/DeviceTokenHelper.cs` (ported from `DesktopTokenHelper` on #26; delete that file if present)
- Modify: `backend/src/ApiDot.Server/Services/IAuthService.cs`, `AuthService.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Security/DeviceTokenServiceTests.cs`

**Interfaces:**
```csharp
public enum DeviceTokenIssueStatus { Issued, DeviceRevoked }
public sealed record IssuedDeviceToken(string RawToken, Guid DeviceId, string DeviceKey, DateTimeOffset? ExpiresAtUtc);
Task<(DeviceTokenIssueStatus Status, IssuedDeviceToken? Token)> IssueDeviceTokenAsync(
    Guid userId, string? deviceKey, string? name, string? os, string? version,
    DeviceScope scopes, TimeSpan? lifetime, CancellationToken ct = default);
Task<AgentDevice?> ValidateDeviceTokenAsync(string rawToken, DeviceScope requiredScope, CancellationToken ct = default);
```

- [ ] Tests: reusing a key keeps the row id and rotates the hash (the old raw token stops validating); an unknown key creates a row with the supplied or generated key; a revoked key returns `DeviceRevoked`; `rest` tokens expire, `ws`-only tokens do not; `ValidateDeviceTokenAsync` rejects a wrong scope.
- [ ] Implement, reusing `DeviceTokenHelper` for generation/hash/prefix and the hourly `LastUsedAtUtc` throttle.

### Task 3: Issue on exchange and local login

**Files:**
- Modify: `backend/src/ApiDot.Server/Models/AuthModels.cs` (optional `DeviceKey`, `DeviceName`, `DeviceOs`, `AgentVersion` on both requests)
- Modify: `backend/src/ApiDot.Server/Endpoints/AuthEndpoints.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/DeviceCredentialIssuanceTests.cs`

**Interfaces:** response headers `X-Desktop-Access-Token`, `X-Desktop-Access-Token-Expires`, `X-Desktop-Device-Id`, `X-Desktop-Device-Key`; body unchanged.

- [ ] Tests: exchange with no key creates a device (`Rest | Ws`, 30 days) and returns the four headers with the same JSON body; exchange with a known key reuses the row; local login issues the same headers; revoked key returns 403 with a `device_revoked` detail.
- [ ] Implement one shared helper used by both endpoints; local login keeps the cookie sign-in.
- [ ] Add `WithExposedResponseHeaders("X-Desktop-Access-Token", "X-Desktop-Access-Token-Expires", "X-Desktop-Device-Id", "X-Desktop-Device-Key")` to the desktop CORS policy.

### Task 4: Authenticate REST and WebSocket by scope

**Files:**
- Move/rename: `Security/DesktopBearerAuthenticationHandler.cs` → `Security/DeviceTokenAuthenticationHandler.cs` (scheme `DeviceToken`)
- Modify: `Extensions/ServiceCollectionExtensions.cs`, `Services/AgentWebSocketHandler.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/DeviceTokenAuthTests.cs`, `WebSockets/DeviceScopeTests.cs`

- [ ] Tests: a `rest` token authenticates `/api/workspaces`; a `ws`-only token gets 401 there; a `rest`-only token is closed with `PolicyViolation` on `/ws/agent`; expired and revoked tokens get 401; a legacy row (scope `Ws`, no key/expiry) still opens the WS but not REST.
- [ ] Implement: handler requires `Rest`, not revoked, not expired; WS requires `Ws`; keep the policy-scheme selector shape.

### Task 5: Logout and operator revocation

**Files:**
- Modify: `Endpoints/AuthEndpoints.cs` (`DELETE /api/auth/device-token`), `Endpoints/AgentDeviceEndpoints.cs` (`/revoke` unchanged, now also ends the WS)
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/DeviceRevocationTests.cs`

- [ ] Tests: logout clears the hash and the row stays reusable on the next exchange with the same key; operator revoke sets `IsRevoked` and the same key is refused; revoking the current device drops the WS agent registration.
- [ ] Implement; the deleted `/desktop-token` endpoint from #26 is not carried over.

### Task 6: Sidecar connect and terminal auth failure

**Files:**
- Modify: `backend/src/ApiDot.Agent/Commands/SidecarCommand.cs`, `backend/src/ApiDot.Agent/AgentClient.cs`
- Test: `backend/tests/ApiDot.Agent.Tests/Commands/SidecarConnectionTests.cs`, `AgentClientRetryTests.cs`

- [ ] Tests: `/connect` without the secret is 401; with the secret it starts a connection (injected starter) and is idempotent; `/disconnect` stops it and `/execute` still works; `AgentClient` stops retrying after a `PolicyViolation` close and reports `unauthorized`.
- [ ] Implement `POST /connect`, `POST /disconnect`, `GET /agent-status` behind the existing secret middleware.

### Task 7: Tauri session file

**Files:**
- Create: `desktop/src-tauri/src/session.rs`
- Modify: `desktop/src-tauri/src/lib.rs` (commands), `desktop/src-tauri/tauri.conf.json` only if a capability is needed
- Test: Rust unit tests in `session.rs`

- [ ] Tests: save → load round-trip; file mode 0600 and directory 0700 on Unix; `clear` removes token fields but preserves `deviceKey`; corrupt JSON loads as `None` without throwing.
- [ ] Implement `load_session`, `save_session`, `clear_session` with the same permission helpers as `storage.rs`.

### Task 8: Client session, boot reconnect and 401

**Files:**
- Create: `frontend/src/lib/api/session.ts` (shape + IPC calls), `frontend/src/lib/desktop/session.ts` (invoke wrappers, no-op on web)
- Modify: `frontend/src/lib/desktop/desktopAuth.ts` (read the four headers, drop `credentials: 'include'`), `frontend/src/lib/api/client.ts` (401 hook), `frontend/src/app/layout.tsx`/`ApiBaseBootstrap` (boot hydration), `frontend/src/app/login/page.tsx` (save session after either login), `frontend/src/components/settings/GlobalSettingsModal.tsx` (persist `serverUrl` into the session too)
- Test: `session.test.ts`, `client.test.ts`, `desktopAuth.test.ts` additions

- [ ] Tests: exchange stores token/device/expiry; boot with a session calls `/api/auth/me` then `/connect`; 401 clears the session and calls `/disconnect`; logout revokes, disconnects and clears; web builds never call IPC.
- [ ] Implement, keeping web behaviour unchanged when no session exists.

### Task 9: Device list scopes and current device

**Files:**
- Modify: `frontend/src/lib/deviceApi.ts` (DTO scopes), `frontend/src/components/settings/GlobalSettingsModal.tsx` (agents tab), i18n locales
- Test: `GlobalSettingsModal.test.tsx` additions

- [ ] Tests: a `Rest | Ws` device shows a Desktop badge, a `Ws` device shows Agent, the current device is marked, and revoking the current device triggers the logout path.
- [ ] Implement with the existing list UI; no layout redesign.

### Task 10: Integration, #26 cleanup and docs

**Files:**
- Modify: `docs/plans/2026-11-09-unified-device-credential-design.md` (status → implemented), `.env.example` if a new key is needed (none expected)

- [ ] Merge #23/#24/#25 into a scratch branch, apply this branch, run backend + frontend + `cargo check` + desktop validators + the standalone and export builds.
- [ ] Close PR #26 with a comment pointing at this plan.
- [ ] Record the result and any deviation in the PR body.
