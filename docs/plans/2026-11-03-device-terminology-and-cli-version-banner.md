# Device Terminology and CLI Version Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor frontend and i18n terminology to "Dispositivos" / "Devices" while aligning the ApiDot.Agent CLI banner and WebSocket handshake with dynamic application release versioning.

**Architecture:** Implement a zero-allocation `AgentVersion` utility in `ApiDot.Agent` that mirrors the server version normalization rules (`APIDOT_VERSION` / `AssemblyInformationalVersion` / `dev`). Inject this normalized version into the CLI startup banner and WebSocket handshake query string. Unify all user-facing frontend i18n keys across `pt-BR` and `en-US` to the clean concept of "Dispositivos" / "Devices", eliminating "Local Agent" ambiguities without breaking internal contracts.

**Tech Stack:** .NET 9 (C#, Native AOT, xUnit, FluentAssertions), Next.js 16 / React 19 (TypeScript, Vitest, Testing Library), GitHub Actions.

**Spec:** `docs/plans/2026-11-03-device-terminology-and-cli-version-banner-design.md`

## Global Constraints

- No database schema migrations or breaking changes to `AgentDevice` table / SQLite structure.
- No changes to internal enum values (`ExecutionTarget.Agent`), WebSocket route (`/ws/agent`), or REST routes (`/api/devices`).
- Avoid hybrid terms in UI (no "Runners & Dispositivos" or "Dispositivos & Local Agents"); use single, clear human terminology ("Dispositivos" / "Devices").
- All 1.625 existing tests across .NET backend and Next.js frontend must continue passing.

## Review Focus

1. **Version Normalization with Leading 'v':** `AgentVersion.Normalize("0.1.0")` must produce `"v0.1.0"`, while `"dev"` remains `"dev"`.
2. **WebSocket Handshake Version Query:** `AgentClient.BuildWebSocketUri()` must correctly URL-encode and append `&version={version}` to query parameters without disrupting existing `token` and `name` queries.
3. **Daemon Service Description:** `ServiceManager.cs` systemd unit file must specify `Description=ApiDot Agent` without the obsolete word `"Local"`.
4. **Settings Tab Accessibility in Vitest:** `GlobalSettingsModal.test.tsx` must successfully query the tab using `/devices|dispositivos/i` without failing role-based queries.
5. **No Residual "Local Agent" UI Text:** Ensure request selectors, tooltips, and collection settings display "Dispositivo" / "Device" consistently.

---

### Task 1: AgentVersion Helper, Dynamic Banner, and WebSocket Handshake Versioning

**Files:**
- Create: `backend/src/ApiDot.Agent/AgentVersion.cs`
- Create: `backend/tests/ApiDot.Agent.Tests/AgentVersionTests.cs`
- Modify: `backend/src/ApiDot.Agent/Program.cs:6-8`
- Modify: `backend/src/ApiDot.Agent/AgentClient.cs:77-90`

**Interfaces:**
- Consumes: `Environment.GetEnvironmentVariable("APIDOT_VERSION")`, `AssemblyInformationalVersionAttribute`
- Produces: `AgentVersion.GetNormalizedVersion() -> string`, `AgentVersion.Normalize(string) -> string`

- [ ] **Step 1: Write failing tests for `AgentVersion`**

Create `backend/tests/ApiDot.Agent.Tests/AgentVersionTests.cs` verifying:
- `AgentVersion.Normalize("dev")` returns `"dev"`.
- `AgentVersion.Normalize("0.2.0")` returns `"v0.2.0"`.
- `AgentVersion.Normalize("v0.2.0")` returns `"v0.2.0"`.
- When `APIDOT_VERSION` is set to `"0.3.5"`, `AgentVersion.GetNormalizedVersion()` returns `"v0.3.5"`.
- When `APIDOT_VERSION` is set to `"dev"`, `AgentVersion.GetNormalizedVersion()` returns `"dev"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Agent.Tests/ApiDot.Agent.Tests.csproj --filter "FullyQualifiedName~AgentVersionTests"`
Expected: FAIL (compilation error, type not found).

- [ ] **Step 3: Implement `AgentVersion.cs`**

Create `backend/src/ApiDot.Agent/AgentVersion.cs` with `GetNormalizedVersion()` and `Normalize(string)`.

- [ ] **Step 4: Update `Program.cs` and `AgentClient.cs`**

In `backend/src/ApiDot.Agent/Program.cs`:
Replace hardcoded `Console.WriteLine("ApiDot Local Agent v1.0");` with:
```csharp
var appVersion = AgentVersion.GetNormalizedVersion();
Console.WriteLine($"ApiDot Agent {appVersion}");
```
In `backend/src/ApiDot.Agent/AgentClient.cs` inside `BuildWebSocketUri()`:
Append `&version={Uri.EscapeDataString(AgentVersion.GetNormalizedVersion())}` to the query builder.

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test backend/tests/ApiDot.Agent.Tests/ApiDot.Agent.Tests.csproj`
Expected: PASS with all tests passing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ApiDot.Agent/AgentVersion.cs backend/src/ApiDot.Agent/Program.cs backend/src/ApiDot.Agent/AgentClient.cs backend/tests/ApiDot.Agent.Tests/AgentVersionTests.cs
git commit -m "feat(agent): resolve dynamic version banner and send version in websocket handshake"
```

---

### Task 2: ServiceManager Description Refactoring

**Files:**
- Modify: `backend/src/ApiDot.Agent/Services/ServiceManager.cs:60-65`
- Modify: `backend/tests/ApiDot.Agent.Tests/ServiceManagerTests.cs:85-95`

**Interfaces:**
- Consumes: Systemd unit generator in `ServiceManager`
- Produces: `Description=ApiDot Agent` in generated systemd unit definition

- [ ] **Step 1: Update unit test in `ServiceManagerTests.cs`**

In `backend/tests/ApiDot.Agent.Tests/ServiceManagerTests.cs:90`:
Change expectation from `"Description=ApiDot Local Agent"` to `"Description=ApiDot Agent"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Agent.Tests/ApiDot.Agent.Tests.csproj --filter "FullyQualifiedName~ServiceManagerTests"`
Expected: FAIL with string mismatch.

- [ ] **Step 3: Update `ServiceManager.cs`**

In `backend/src/ApiDot.Agent/Services/ServiceManager.cs:63`:
Change `Description=ApiDot Local Agent` to `Description=ApiDot Agent`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Agent.Tests/ApiDot.Agent.Tests.csproj --filter "FullyQualifiedName~ServiceManagerTests"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Agent/Services/ServiceManager.cs backend/tests/ApiDot.Agent.Tests/ServiceManagerTests.cs
git commit -m "refactor(agent): remove local from systemd service description"
```

---

### Task 3: Frontend i18n & Settings Tab Terminology

**Files:**
- Modify: `frontend/src/i18n/locales/pt-BR.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`
- Modify: `frontend/src/components/settings/GlobalSettingsModal.test.tsx:85-95,170-195`

**Interfaces:**
- Consumes: `useTranslation` hook dictionaries
- Produces: Updated localized labels for `targetAgent`, `sendViaAgent`, `executeOnAgent`, `agentsTab`, `devicesAndAgents`, `noAgents`

- [ ] **Step 1: Update `GlobalSettingsModal.test.tsx`**

Update test line 178 from:
```tsx
const agentsTab = screen.getByRole('tab', { name: /local agents/i });
```
to:
```tsx
const agentsTab = screen.getByRole('tab', { name: /devices|dispositivos/i });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/components/settings/GlobalSettingsModal.test.tsx --run`
Expected: FAIL (cannot find role tab matching /devices|dispositivos/i).

- [ ] **Step 3: Update `pt-BR.ts` and `en-US.ts`**

In `frontend/src/i18n/locales/pt-BR.ts`:
- `sendViaAgent`: `'Enviar via Dispositivo'`
- `executeOnAgent`: `'Executar no Dispositivo'`
- `executeOnAgentDescOnline`: `'Disparo via dispositivo conectado'`
- `executeOnAgentDescOffline`: `'Dispositivo offline'`
- `agentConnected`: `'Dispositivo Conectado'`
- `agentDisconnected`: `'Dispositivo Desconectado'`
- `targetAgent`: `'Dispositivo'`
- `agentOfflineTooltip`: `'Dispositivo desconectado. Alterne para o Servidor para enviar.'`
- `subtitle`: `'Gerencie dispositivos, preferências de interface e ambiente'`
- `agentsTab`: `'Dispositivos'`
- `noAgents`: `'Nenhum dispositivo cadastrado'`
- `agentsOnlineCount`: `'{count} dispositivo(s) online'`
- `devicesAndAgents`: `'Dispositivos'`
- `devicesSubtitle`: `'Dispositivos autorizados para execução de chamadas HTTP'`
- `defaultTargetDesc`: `'Define onde as requisições desta coleção são executadas por padrão (no Servidor ou em um Dispositivo).'`

In `frontend/src/i18n/locales/en-US.ts`:
- `sendViaAgent`: `'Send via Device'`
- `executeOnAgent`: `'Execute on Device'`
- `executeOnAgentDescOnline`: `'Dispatch via connected device'`
- `executeOnAgentDescOffline`: `'Device offline'`
- `agentConnected`: `'Device Connected'`
- `agentDisconnected`: `'Device Disconnected'`
- `targetAgent`: `'Device'`
- `agentOfflineTooltip`: `'Device is offline. Switch to Server to send requests.'`
- `subtitle`: `'Manage devices, interface preferences and environment'`
- `agentsTab`: `'Devices'`
- `noAgents`: `'No devices registered'`
- `agentsOnlineCount`: `'{count} device(s) online'`
- `devicesAndAgents`: `'Devices'`
- `devicesSubtitle`: `'Authorized devices for execution of HTTP requests'`
- `defaultTargetDesc`: `'Defines where requests in this collection execute by default (on Cloud Server or on a Device).'`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/components/settings/GlobalSettingsModal.test.tsx --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/pt-BR.ts frontend/src/i18n/locales/en-US.ts frontend/src/components/settings/GlobalSettingsModal.test.tsx
git commit -m "refactor(web): update agent and execution target terminology to devices"
```

---

### Task 4: GitHub Actions Release CI/CD Version Injection

**Files:**
- Modify: `.github/workflows/release.yml:150-155`

**Interfaces:**
- Consumes: `${{ github.ref_name }}` / `${{ github.event.inputs.tag_name }}`
- Produces: `-p:Version` and `-p:InformationalVersion` flags on `dotnet publish`

- [ ] **Step 1: Update `.github/workflows/release.yml`**

In `build-agent-binaries` job, update the `Publish Native AOT Agent` step to inject the version property derived from the release tag:
```yaml
      - name: Publish Native AOT Agent
        env:
          RELEASE_TAG: ${{ github.ref_name }}
        run: |
          dotnet publish backend/src/ApiDot.Agent/ApiDot.Agent.csproj -c Release -r ${{ matrix.rid }} -p:PublishAot=true -p:InvariantGlobalization=true -p:Version=${RELEASE_TAG#v} -p:InformationalVersion=${RELEASE_TAG} --self-contained -o ./publish
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: inject version properties into native aot agent publish"
```

---

### Task 5: End-to-End Suite Verification

**Files:**
- Repository-wide verification

- [ ] **Step 1: Run full backend test suite**

Run: `dotnet test backend/ApiDot.sln`
Expected: 588+ tests PASS with 0 failures.

- [ ] **Step 2: Run full frontend test suite**

Run: `npm --prefix frontend test -- --run`
Expected: 1.037+ tests PASS with 0 failures across all 57 test files.

- [ ] **Step 3: Verify git working tree status**

Run: `git status`
Expected: Clean working tree on branch `refactor/agent-naming`.
