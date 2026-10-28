# Public Launch (v0.1.0), README, About, and Dynamic Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch ApiDot publicly under version v0.1.0 with an international open-source README, GitHub About metadata, dynamic version decoupling across frontend/backend, reactive workspace tab title, sanitized Playwright screenshots, and a clean tag transition from v0.4.0.

**Architecture:** Unified versioning using `APIDOT_VERSION` with `'dev'` fallback, injected into .NET 9 backend (`/health`, `InstallScriptEndpoints`) and Next.js 15 frontend (`APP_VERSION` via build args). Browser tab titles reactively sync to `ApiDot - [Workspace Name]`. Playwright generates neutral screenshots in `docs/assets/screenshots/`. The root `README.md` showcases features, a 30-second Docker quickstart, and collapsible feature galleries. CI/CD in `release.yml` triggers on `v*` tags, `workflow_dispatch`, and pushes to branch `dev`.

**Tech Stack:** .NET 9 (C# Minimal APIs, EF Core), Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS, Zustand), Docker, GitHub Actions, Playwright, Vitest.

**Spec:** `docs/plans/2026-10-27-public-launch-v010-and-readme-design.md`

## Global Constraints

- Slogan must be verbatim: *"Test and debug any API, anywhere — from localhost to production"*
- Unconfigured version fallback must be verbatim: `"dev"`
- Root `README.md` must be written in English.
- No corporate, internal, or private domains or usernames (e.g. `viveo.internal`) in public code, mocks, or screenshots.
- Zero breaking changes to existing SQLite data models or request execution logic.
- All 552+ Vitest tests and 321+ .NET backend tests must pass with zero errors.

## Review Focus

1. **Unconfigured Environment Version:** When running locally without `APIDOT_VERSION` or `NEXT_PUBLIC_APP_VERSION`, backend `/health` and frontend `AppHeader` must display `"dev"` without crashing or throwing null reference exceptions.
2. **Local Agent Download URL Generation:** When backend is running in `"dev"` mode, agent download redirects must resolve to `.../releases/download/dev/{assetName}` without producing malformed URLs like `.../download/vdev/...`.
3. **Reactive Workspace Title on Refresh & Switch:** When navigating directly to `/workspace/:id` or switching workspaces, `document.title` must immediately update to `ApiDot - {WorkspaceName}`, falling back to `ApiDot - Test and debug any API, anywhere` when no workspace is loaded.
4. **Non-destructive Playwright Mocking:** The public screenshot script must mock responses cleanly without mutating local SQLite database records or leaving persistent test artifacts.
5. **CI/CD Workflow Dispatch Safety:** When triggering `.github/workflows/release.yml` manually without input, the resolved version must default to `dev` rather than baking the git branch name into production images.

---

### Task 1: Backend Dynamic Versioning, Healthcheck & Agent Download Endpoints

**Files:**
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Modify: `backend/src/ApiDot.Server/Endpoints/InstallScriptEndpoints.cs`
- Modify: `backend/tests/ApiDot.Server.Tests/Endpoints/InstallScriptEndpointsTests.cs`
- Create: `backend/tests/ApiDot.Server.Tests/Endpoints/HealthcheckEndpointTests.cs`

**Interfaces:**
- Consumes: `IConfiguration` from Microsoft.Extensions.Configuration.
- Produces: `InstallScriptEndpoints.GetAppVersion(IConfiguration configuration) -> string`
- Produces: `GET /health -> { status = "Healthy", version = string, timestamp = DateTime }`

- [ ] **Step 1: Write failing tests for `/health` with version and `InstallScriptEndpoints` with `"dev"` fallback**

Create `HealthcheckEndpointTests.cs` verifying that `GET /health` returns HTTP 200 with JSON `{ status: "Healthy", version: "dev" }` by default, or `{ version: "v0.1.0" }` when `APIDOT_VERSION=v0.1.0` is configured.
Update `InstallScriptEndpointsTests.cs` to verify that without explicit configuration, download redirects point to `.../releases/download/dev/{asset}` instead of `v0.4.0`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~HealthcheckEndpointTests|FullyQualifiedName~InstallScriptEndpointsTests"`
Expected: FAIL due to missing `version` property in healthcheck response and mismatched redirect URL.

- [ ] **Step 3: Implement version resolution helper and update `/health` & `InstallScriptEndpoints`**

In `backend/src/ApiDot.Server/Endpoints/InstallScriptEndpoints.cs`, add:
```csharp
public static string GetAppVersion(IConfiguration configuration)
{
    var raw = configuration["APIDOT_VERSION"] ?? configuration["AgentRelease:Version"] ?? "dev";
    return string.IsNullOrWhiteSpace(raw) ? "dev" : raw.Trim();
}

public static string GetNormalizedVersion(IConfiguration configuration)
{
    var version = GetAppVersion(configuration);
    if (string.Equals(version, "dev", StringComparison.OrdinalIgnoreCase))
    {
        return "dev";
    }
    return version.StartsWith("v", StringComparison.OrdinalIgnoreCase) ? version : $"v{version}";
}
```
Update `Program.cs` around line 79 to inject `IConfiguration` into `GET /health` and return `version: InstallScriptEndpoints.GetAppVersion(configuration)`.
Update line 70 of `InstallScriptEndpoints.cs` to use `GetNormalizedVersion(configuration)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~HealthcheckEndpointTests|FullyQualifiedName~InstallScriptEndpointsTests"`
Expected: PASS (all tests green).

- [ ] **Step 5: Run full backend test suite**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj`
Expected: PASS (all 320+ tests green).

- [ ] **Step 6: Commit**

```bash
git add backend/src/ApiDot.Server/Program.cs backend/src/ApiDot.Server/Endpoints/InstallScriptEndpoints.cs backend/tests/ApiDot.Server.Tests/
git commit -m "feat(backend): unify versioning via APIDOT_VERSION with dev fallback in healthcheck and install scripts"
```

---

### Task 2: Frontend Dynamic Versioning & Reactive Workspace Tab Title

**Files:**
- Create: `frontend/src/lib/version.ts`
- Create: `frontend/src/lib/version.test.ts`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/layout/AppHeader.tsx`
- Modify: `frontend/src/components/layout/AppHeader.test.tsx`
- Modify: `frontend/src/components/settings/GlobalSettingsModal.tsx`
- Modify: `frontend/src/components/settings/GlobalSettingsModal.test.tsx`
- Modify: `frontend/src/app/workspace/[workspaceId]/layout.tsx` (or workspace page if layout is not yet present)

**Interfaces:**
- Produces: `export const APP_VERSION: string` in `frontend/src/lib/version.ts`.
- Consumes: `useWorkspaceStore` active workspace to update `document.title`.

- [ ] **Step 1: Write failing tests for `version.ts`, `AppHeader`, and `GlobalSettingsModal`**

Create `frontend/src/lib/version.test.ts` testing default `'dev'` and custom `process.env.NEXT_PUBLIC_APP_VERSION`.
Update `AppHeader.test.tsx` to assert that the version badge renders `v{APP_VERSION}` (or `dev` when `'dev'`).
Update `GlobalSettingsModal.test.tsx` to assert that modal footer displays `ApiDot {APP_VERSION}`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test frontend/src/lib/version.test.ts frontend/src/components/layout/AppHeader.test.tsx frontend/src/components/settings/GlobalSettingsModal.test.tsx`
Expected: FAIL due to missing module `src/lib/version.ts` and mismatched version text.

- [ ] **Step 3: Implement `src/lib/version.ts` and update components**

Create `frontend/src/lib/version.ts`:
```typescript
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

export function formatDisplayVersion(version: string = APP_VERSION): string {
  if (version.toLowerCase() === 'dev') return 'dev';
  return version.startsWith('v') ? version : `v${version}`;
}
```
Update `AppHeader.tsx` to import `APP_VERSION` and `formatDisplayVersion`, rendering `{formatDisplayVersion(APP_VERSION)}`.
Update `GlobalSettingsModal.tsx` to render `ApiDot {formatDisplayVersion(APP_VERSION)}`.
Update `frontend/src/app/layout.tsx`:
```typescript
export const metadata: Metadata = {
  title: 'ApiDot - Test and debug any API, anywhere',
  description: 'Test and debug any API, anywhere — from localhost to production',
};
```
In the workspace layout/component (`frontend/src/app/workspace/[workspaceId]/layout.tsx` or `frontend/src/app/page.tsx`), add reactive title synchronization:
```typescript
useEffect(() => {
  const workspaceName = activeWorkspace?.name;
  if (workspaceName) {
    document.title = `ApiDot - ${workspaceName}`;
  } else {
    document.title = 'ApiDot - Test and debug any API, anywhere';
  }
}, [activeWorkspace?.name]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test frontend/src/lib/version.test.ts frontend/src/components/layout/AppHeader.test.tsx frontend/src/components/settings/GlobalSettingsModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full frontend test suite**

Run: `npm --prefix frontend test`
Expected: PASS (all tests green).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/version.ts frontend/src/lib/version.test.ts frontend/src/app/layout.tsx frontend/src/components/layout/ frontend/src/components/settings/ frontend/src/app/
git commit -m "feat(frontend): add dynamic version decoupling and reactive workspace tab title"
```

---

### Task 3: Docker & CI/CD Pipeline Update for `APIDOT_VERSION` and `dev` Branch Trigger

**Files:**
- Modify: `frontend/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: Git tag (e.g. `v0.1.0`), branch `dev`, or `workflow_dispatch` input.
- Produces: Docker build arg `NEXT_PUBLIC_APP_VERSION` and environment variable `APIDOT_VERSION`.

- [ ] **Step 1: Update `frontend/Dockerfile` build stage**

In `frontend/Dockerfile`, add `ARG NEXT_PUBLIC_APP_VERSION=dev` and `ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION` in the `FROM deps AS build` section before `RUN npm run build`.

- [ ] **Step 2: Update `docker-compose.yml` and `docker-compose.dev.yml`**

Add `APIDOT_VERSION: ${APIDOT_VERSION:-dev}` in `server` environment.
Add `NEXT_PUBLIC_APP_VERSION: ${APIDOT_VERSION:-dev}` in `web` environment.

- [ ] **Step 3: Update `.github/workflows/release.yml`**

Update triggers:
```yaml
on:
  push:
    tags:
      - 'v*'
    branches:
      - dev
  workflow_dispatch:
    inputs:
      tag_name:
        description: 'Release tag name (e.g. v0.1.0 or dev)'
        required: false
        type: string
```
Add tag resolution step before container build:
```yaml
      - name: Resolve Release Version
        id: version
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ] && [ -n "${{ github.event.inputs.tag_name }}" ]; then
            TAG="${{ github.event.inputs.tag_name }}"
          elif [ "${{ github.ref_type }}" = "tag" ]; then
            TAG="${{ github.ref_name }}"
          elif [ "${{ github.ref_name }}" = "dev" ]; then
            TAG="dev"
          else
            TAG="dev"
          fi
          echo "tag=$TAG" >> "$GITHUB_OUTPUT"
```
Pass build arguments to the web container:
```yaml
          build-args: |
            NEXT_PUBLIC_APP_VERSION=${{ steps.version.outputs.tag }}
```

- [ ] **Step 4: Validate Next.js production build locally**

Run: `npm --prefix frontend run build`
Expected: Build completed successfully with standalone output.

- [ ] **Step 5: Commit**

```bash
git add frontend/Dockerfile docker-compose.yml docker-compose.dev.yml .github/workflows/release.yml
git commit -m "ci(release): add dev branch trigger, resolve version tag deterministically and inject into docker build"
```

---

### Task 4: Public Sanitized Screenshots Capture Script & Asset Storage

**Files:**
- Create: `frontend/playwright/capture-public-screenshots.js`
- Create directory: `docs/assets/screenshots/`
- Generated images:
  - `docs/assets/screenshots/01-desktop-hero-request-response.png`
  - `docs/assets/screenshots/02-desktop-variable-autocomplete.png`
  - `docs/assets/screenshots/03-desktop-openapi-sync-audit.png`
  - `docs/assets/screenshots/04-desktop-workspace-and-tree.png`

**Interfaces:**
- Produces: 4 high-resolution (1440x900) PNG assets with neutral, generic mock data (`api.example.com`).

- [ ] **Step 1: Write `frontend/playwright/capture-public-screenshots.js`**

Implement Playwright script that launches Chromium at 1440x900, routes `/api/requests/execute` to return a clean e-commerce order response (`https://api.example.com/v1/orders/ord_882910`), triggers autocomplete on `{{baseUrl}}`, opens the OpenAPI sync modal on `https://api.example.com/openapi.json`, and captures the 4 target PNGs into `docs/assets/screenshots/`.

- [ ] **Step 2: Run the script to generate screenshots**

Run: `mkdir -p docs/assets/screenshots && node frontend/playwright/capture-public-screenshots.js`
Expected: 4 PNG files created in `docs/assets/screenshots/` with non-zero byte size.

- [ ] **Step 3: Verify image outputs**

Verify: `ls -la docs/assets/screenshots/` shows all 4 files with size > 10KB.

- [ ] **Step 4: Commit**

```bash
git add frontend/playwright/capture-public-screenshots.js docs/assets/screenshots/
git commit -m "chore(docs): add public sanitized screenshot capture script and generate official assets"
```

---

### Task 5: Root `README.md` and GitHub `About` Metadata

**Files:**
- Create: `README.md`
- Create: `docs/about-github.md`

**Interfaces:**
- Produces: Official open-source repository documentation and GitHub repository settings reference.

- [ ] **Step 1: Create `docs/about-github.md`**

Document exact GitHub About description, website link, and topic tags:
- Description: `Test and debug any API, anywhere — from localhost to production. Modern, self-hosted open-source API client and workspace.`
- Topics: `api-client`, `developer-tools`, `self-hosted`, `rest-api`, `openapi`, `postman-alternative`, `nextjs`, `dotnet`

- [ ] **Step 2: Create root `README.md`**

Write standard, high-impact English `README.md`:
- Header: `# ⚡ ApiDot`
- Slogan: `> Test and debug any API, anywhere — from localhost to production.`
- Badges: GitHub release, MIT license, Next.js 15, .NET 9, Docker.
- Hero screenshot linking to `docs/assets/screenshots/01-desktop-hero-request-response.png`.
- Overview: Pitching the self-hosted, lightweight, developer-first API client.
- Key Features grid: Full-featured Request Editor, Precise Latency Metrics, Cascading Variables (`{{...}}`), OpenAPI v3 Sync, Hybrid Local/Server Execution, Deep Linking.
- Quick Start:
  ```bash
  git clone https://github.com/medeiroshudson/ApiDot.git
  cd ApiDot
  docker compose up -d
  ```
  Open `http://localhost:3000`.
- Collapsible `<details><summary>📸 Visual Feature Tour</summary>...</details>` with screenshots 02, 03, and 04.
- Local Development guide (`npm run dev`, `dotnet run`).
- Contributing and License (MIT).

- [ ] **Step 3: Review Markdown formatting and links**

Verify all internal image paths and relative links exist.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/about-github.md
git commit -m "docs: add official root README.md and github about metadata"
```

---

### Task 6: Comprehensive Validation, Tag Purge & Dev Tag Setup

**Files/Actions:**
- Run full test suite: frontend (Vitest) + backend (.NET) + production build (`next build`).
- Git & GitHub commands for tag transition.

- [ ] **Step 1: Run complete validation suite**

Run: `dotnet test backend/ApiDot.sln`
Run: `npm --prefix frontend test`
Run: `npm --prefix frontend run build`
Expected: 100% tests passing, zero build errors.

- [ ] **Step 2: Exclude legacy `v0.4.0` Release and Tag from GitHub**

Command:
```bash
gh release delete v0.4.0 --cleanup-tag --yes
git tag -d v0.4.0
```
Expected: `v0.4.0` deleted locally and remotely.

- [ ] **Step 3: Create and push `dev` tag**

Command:
```bash
git tag dev
git push origin dev
```
Expected: `dev` tag created and tracked on remote.

- [ ] **Step 4: Prepare `v0.1.0` release command for final user sign-off**

Document the final execution command:
```bash
git tag -a v0.1.0 -m "ApiDot v0.1.0 - Official First Public Release"
git push origin v0.1.0
```
