# Desktop SSO via External Browser & Loopback Callback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable desktop application SSO authentication by opening the user's default browser (where an Authentik session is already active), redirecting to the local sidecar loopback (`/auth/callback`), displaying a localized confirmation page (`/auth/desktop-success`), and completing login automatically in the desktop app.

**Architecture:** The desktop app opens the login URL in the external system browser via Tauri opener with `desktop_callback=http://127.0.0.1:<port>/auth/callback`. `ApiDot.Server` validates the active OIDC session in Authentik, issues an ephemeral single-use token (`DesktopExchangeToken`), and redirects the browser to the local sidecar. The sidecar captures the token and redirects the browser to `/auth/desktop-success` (Next.js with i18n). The desktop app queries the sidecar via loopback (`GET /auth/session`), exchanges the token at `POST /api/auth/desktop-exchange`, and navigates to the workspace.

**Tech Stack:** .NET 9 (ASP.NET Core, Kestrel Slim, OIDC), Next.js 16.4.4, React 19.3.1, Tauri v2, Zustand 5, TypeScript 5.7, Vitest, xUnit.

**Spec:** `docs/plans/2026-11-03-desktop-sso-browser-flow-design.md`

## Global Constraints

- **Ephemeral Single-Use Tokens:** `DesktopExchangeToken` expires strictly in 5 minutes and is invalidated immediately upon first exchange at `POST /api/auth/desktop-exchange`.
- **Session Endpoint Security:** Endpoint `GET /auth/session` on the sidecar requires the `X-ApiDot-Sidecar-Secret` header.
- **Localized Success Page:** The `/auth/desktop-success` route must use the native ApiDot translation system (`en-US` default, `pt-BR`).
- **Loopback Origin Security:** Only callback URLs pointing to `http://127.0.0.1:<port>/auth/callback` or `http://localhost:<port>/auth/callback` are accepted as `desktop_callback`.
- **Web Mode Preservation:** Standard web browsers preserve direct navigation to `/api/auth/login`.

## Review Focus

1. **Malicious `desktop_callback` Injection:** The server validates that the host is strictly `127.0.0.1` or `localhost` and path is `/auth/callback`, rejecting external URLs with `400 Bad Request`.
2. **Token Reuse:** Attempting to exchange the same `DesktopExchangeToken` a second time results in `401 Unauthorized`.
3. **Desktop User Cancellation:** If the user cancels the waiting state in the desktop window, polling halts cleanly without freezing the UI.
4. **Browser Localization:** Navigating to `/auth/desktop-success` renders cleanly without hydration mismatches in both `en-US` and `pt-BR`.
5. **Sidecar CORS:** Endpoint `/auth/session` allows retrieval by the desktop frontend without CORS errors.

---

### Task 1: Backend Desktop SSO Token Exchange (`POST /api/auth/desktop-exchange` & `desktop_callback`)

**Files:**
- Modify: `backend/src/ApiDot.Server/Endpoints/AuthEndpoints.cs:25-70`
- Modify: `backend/src/ApiDot.Server/Services/AuthService.cs`
- Modify: `backend/src/ApiDot.Server/Services/IAuthService.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/DesktopAuthEndpointsTests.cs`

**Interfaces:**
- Consumes: `HttpContext`, `IAuthService`
- Produces: `POST /api/auth/desktop-exchange -> UserDto` and `desktop_callback` support in `/api/auth/login`

- [ ] **Step 1: Write failing test for DesktopExchangeToken issuance and exchange**

```csharp
[Fact]
public async Task DesktopExchange_WithValidToken_ReturnsUserDtoAndSetsCookie()
{
    var client = _factory.CreateClient();
    var exchangeToken = _authService.CreateDesktopExchangeToken(Guid.NewGuid(), "test@hmedeiros.dev", "Hudson");

    var response = await client.PostAsJsonAsync("/api/auth/desktop-exchange", new { Token = exchangeToken });
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var user = await response.Content.ReadFromJsonAsync<UserDto>();
    Assert.Equal("test@hmedeiros.dev", user!.Email);
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter DesktopAuthEndpointsTests -v minimal`  
Expected: FAIL with 404 Not Found

- [ ] **Step 3: Implement token generation, validation, and `POST /api/auth/desktop-exchange`**

In `AuthService.cs`, implement thread-safe dictionary with 5-minute TTL for exchange tokens. Add `CreateDesktopExchangeToken` and `ValidateAndConsumeDesktopTokenAsync`. In `AuthEndpoints.cs`, accept `desktop_callback` in `/api/auth/login`, validate loopback origin (`127.0.0.1` or `localhost`), and map `POST /api/auth/desktop-exchange` establishing session via `SignInAsync` and returning `UserDto`.

- [ ] **Step 4: Run integration tests to verify pass**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter DesktopAuthEndpointsTests -v minimal`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/ backend/tests/ApiDot.Server.Tests/
git commit -m "feat(auth): implement desktop sso exchange token and login callback support"
```

---

### Task 2: Sidecar Auth Callback & Session Endpoints (`ApiDot.Agent`)

**Files:**
- Modify: `backend/src/ApiDot.Agent/Commands/SidecarCommand.cs:55-80`
- Test: `backend/tests/ApiDot.Server.Tests/Agent/SidecarAuthEndpointsTests.cs`

**Interfaces:**
- Consumes: Parameter `token` on `GET /auth/callback`, header `X-ApiDot-Sidecar-Secret` on `GET /auth/session`
- Produces: `GET /auth/callback -> 302 Redirect`, `GET /auth/session -> { token }`

- [ ] **Step 1: Write failing test for Sidecar auth routes**

```csharp
[Fact]
public async Task Sidecar_AuthCallback_StoresTokenAndRedirectsToSuccessPage()
{
    var app = SidecarCommand.BuildWebApplication(0, "secret-123");
    await app.StartAsync();

    try
    {
        var port = SidecarCommand.GetBoundPort(app);
        using var client = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { BaseAddress = new Uri($"http://127.0.0.1:{port}") };

        var callbackRes = await client.GetAsync("/auth/callback?token=test-desktop-token-123");
        Assert.Equal(HttpStatusCode.Redirect, callbackRes.StatusCode);
        Assert.Contains("/auth/desktop-success", callbackRes.Headers.Location!.ToString());

        client.DefaultRequestHeaders.Add("X-ApiDot-Sidecar-Secret", "secret-123");
        var sessionRes = await client.GetAsync("/auth/session");
        Assert.Equal(HttpStatusCode.OK, sessionRes.StatusCode);
    }
    finally
    {
        await app.StopAsync();
        await app.DisposeAsync();
    }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SidecarAuthEndpointsTests -v minimal`  
Expected: FAIL with 404 Not Found

- [ ] **Step 3: Implement `/auth/callback` and `/auth/session` endpoints in Kestrel Slim**

In `SidecarCommand.cs`, implement thread-safe pending token storage. Map `GET /auth/callback` to capture `token` and return 302 redirect to `${targetOrigin}/auth/desktop-success`. Map `GET /auth/session` (with secret validation) returning the token and clearing it upon read.

- [ ] **Step 4: Run tests and verify Native AOT build**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SidecarAuthEndpointsTests -v minimal`  
Run: `node desktop/prepare.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Agent/Commands/SidecarCommand.cs backend/tests/ApiDot.Server.Tests/Agent/
git commit -m "feat(agent): add sidecar /auth/callback and /auth/session loopback endpoints"
```

---

### Task 3: Localized Confirmation Page (`/auth/desktop-success`)

**Files:**
- Create: `frontend/src/app/auth/desktop-success/page.tsx`
- Modify: `frontend/src/i18n/locales/en-US.ts:335-360`
- Modify: `frontend/src/i18n/locales/pt-BR.ts:335-360`
- Test: `frontend/src/app/auth/desktop-success/page.test.tsx`

**Interfaces:**
- Consumes: `useTranslation()`
- Produces: Route `/auth/desktop-success` with titles and descriptions in English and Portuguese

- [ ] **Step 1: Write failing test for `/auth/desktop-success` page**

```typescript
it('renders authentication success message and open desktop button in en-US and pt-BR', () => {
  render(<DesktopSuccessPage />);
  expect(screen.getByText(/Authentication Successful/i)).toBeInTheDocument();
  expect(screen.getByText(/You can now close this tab/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix frontend test -- desktop-success/page.test.tsx`  
Expected: FAIL with module not found

- [ ] **Step 3: Implement page and translation keys**

Add keys `auth.desktopSuccessTitle`, `auth.desktopSuccessMessage`, and `auth.desktopSuccessButton` in `en-US.ts` and `pt-BR.ts`. Create `frontend/src/app/auth/desktop-success/page.tsx` with dark theme styling, emerald check icon, and action button.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm --prefix frontend test -- desktop-success/page.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/auth/desktop-success/ frontend/src/i18n/
git commit -m "feat(frontend): add localized /auth/desktop-success confirmation page"
```

---

### Task 4: Desktop Login Integration (`LoginPage.tsx` & `desktopAuth.ts`)

**Files:**
- Create: `frontend/src/lib/desktop/desktopAuth.ts`
- Modify: `frontend/src/app/login/page.tsx:120-160`
- Modify: `frontend/src/stores/useAuthStore.ts`
- Test: `frontend/src/lib/desktop/desktopAuth.test.ts`
- Test: `frontend/src/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `isDesktop()`, `getSidecarInfo()`, `loginDesktopSso()`
- Produces: Complete desktop SSO flow with browser delegation, polling, and session hydration

- [ ] **Step 1: Write failing test for desktop authentication flow**

```typescript
it('initiates desktop SSO flow, opens browser, polls sidecar session and exchanges token', async () => {
  const mockOpen = vi.fn().mockResolvedValue(undefined);
  const mockExchange = vi.fn().mockResolvedValue({ id: 'u1', email: 'test@hmedeiros.dev' });

  const result = await startDesktopSsoFlow({
    openBrowser: mockOpen,
    pollSession: vi.fn().mockResolvedValue('exchange-token-123'),
    exchangeToken: mockExchange,
    port: 54321,
    serverUrl: 'https://apidot.hmedeiros.dev',
  });

  expect(mockOpen).toHaveBeenCalledWith(expect.stringContaining('desktop_callback=http%3A%2F%2F127.0.0.1%3A54321%2Fauth%2Fcallback'));
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix frontend test -- desktopAuth.test.ts`  
Expected: FAIL with module not found

- [ ] **Step 3: Implement `desktopAuth.ts` and integration into `LoginPage.tsx`**

In `desktopAuth.ts`, implement function to launch external browser via Tauri shell opener, start polling `http://127.0.0.1:<port>/auth/session` with 2-minute timeout, and exchange token at `/api/auth/desktop-exchange`. In `LoginPage.tsx`, if `isDesktop()` is true, intercept SSO button click to trigger desktop flow, rendering waiting state with cancel button.

- [ ] **Step 4: Run frontend login tests**

Run: `npm --prefix frontend test -- desktopAuth.test.ts login/page.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/desktop/desktopAuth.ts frontend/src/app/login/
git commit -m "feat(desktop): integrate external browser sso flow with sidecar callback"
```

---

### Task 5: Full Build, Types, and Test Suite Validation

**Files:**
- Test: Full test suite execution across all projects

- [ ] **Step 1: Run .NET backend tests**

Run: `dotnet test backend/ApiDot.sln -v minimal`  
Expected: PASS

- [ ] **Step 2: Run frontend Vitest suite**

Run: `npm --prefix frontend test`  
Expected: PASS

- [ ] **Step 3: Run strict TypeScript type check**

Run: `./frontend/node_modules/.bin/tsc --project frontend/tsconfig.json --noEmit`  
Expected: 0 errors

- [ ] **Step 4: Run Next.js production build and desktop validators**

Run: `npm --prefix frontend run build`  
Run: `npm --prefix desktop run test`  
Expected: PASS

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore(desktop): finalize desktop sso browser authentication feature"
```
