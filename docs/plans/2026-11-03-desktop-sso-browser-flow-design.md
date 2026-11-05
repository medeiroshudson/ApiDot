# Technical Design: Desktop SSO via External Browser, Loopback Callback, and Localized Confirmation

**Date:** 2026-11-03  
**Status:** Approved  
**Author:** Hudson Medeiros & Orchestrator  
**Scope:** Full-Stack (.NET 9 Backend & Native AOT Agent / Next.js 16 Web / Tauri v2 Desktop)

---

## 1. Intent and Motivation (The Why)

In the desktop application (Tauri v2), clicking "Sign in with SSO" inside the isolated system WebView requires the user to re-enter their Authentik credentials (including username, password, and security keys/2FA) because the WebView does not share session cookies with the operating system's default browser (Chrome, Safari, Brave, Edge).

To provide an instant single-click authentication experience (leveraging the developer's active Authentik session in their primary browser), the desktop SSO flow must:
1. Open the authentication screen in a new tab of the operating system's default browser.
2. Allow Authentik to validate the existing session immediately without manual re-entry.
3. Redirect the browser back to the local loopback sidecar (`http://127.0.0.1:<port>/auth/callback?token=...`).
4. The sidecar captures the token, notifies the desktop application, and redirects the browser to `/auth/desktop-success`.
5. The confirmation page renders with native internationalization support (`en-US` default, `pt-BR`).
6. The desktop application completes authentication, stores the session, and loads the workspace.

---

## 2. Goals, Non-Goals, and Anti-Goals

### 2.1. Goals
- **System Browser Delegation:**
  - In desktop mode, clicking SSO opens the system default browser while keeping the desktop window in an accessible waiting state (*"Waiting for authentication in your browser..."*).
- **Loopback Callback on Sidecar (`ApiDot.Agent`):**
  - Endpoint `GET /auth/callback` in the sidecar Kestrel Slim server captures the ephemeral exchange token and redirects to `/auth/desktop-success`.
  - Endpoint `GET /auth/session` (protected by `X-ApiDot-Sidecar-Secret`) allows secure, single-use retrieval of the token by the desktop application.
- **Token Generation and Exchange on `ApiDot.Server`:**
  - Support `desktop_callback` query parameter on `/api/auth/login`, preserved through OIDC challenge state.
  - Upon OIDC completion, if `desktop_callback` is present, generate a single-use `DesktopExchangeToken` (5-minute TTL) and redirect to `${desktop_callback}?token=${exchangeToken}`.
  - Endpoint `POST /api/auth/desktop-exchange` validates the token and establishes the authenticated session.
- **Localized Confirmation Page (`/auth/desktop-success`):**
  - Static/client Next.js page with i18n (`en-US` default, `pt-BR`), instructing the user that sign-in succeeded and the tab can be closed.
- **Web App Preservation:**
  - Standard web browsers continue using direct in-tab navigation to `/api/auth/login` without triggering desktop loopback callbacks.

### 2.2. Non-Goals
- Do not register OS custom protocol schemes (`apidot://`) at this stage: loopback callback is more secure, requires no elevated registry/OS permissions, and avoids intrusive browser protocol confirmation prompts.
- Do not persist exchange tokens long-term: exchange tokens expire in 5 minutes and are invalidated on first read.

### 2.3. Anti-Goals
- **Zero redundant credential typing:** A user with an active Authentik session in their browser must not see a login/password form.
- **Zero secret leakage:** Ephemeral exchange tokens have strict TTL and grant zero access without server-side validation.

---

## 3. Architecture and Sequence Flow

```text
[ApiDot Desktop]                [Default Browser]             [Authentik / ApiDot.Server]         [Local Sidecar]
       │                                │                                    │                            │
 1. Clicks "SSO"                        │                                    │                            │
       ├───────────────────────────────►│                                    │                            │
       │  Opens default browser:        │                                    │                            │
       │  /api/auth/login?              │                                    │                            │
       │  desktop_callback=http://...   │                                    │                            │
       │                                ├───────────────────────────────────►│                            │
       │                                │ 2. Validates existing session      │                            │
       │                                │    in Authentik                    │                            │
       │                                │◄───────────────────────────────────┤                            │
       │                                │ 3. Redirects:                      │                            │
       │                                │    http://127.0.0.1:<p>/auth/cb    │                            │
       │                                │    ?token=<exchange_token>         │                            │
       │                                ├────────────────────────────────────────────────────────────────►│
       │                                │                                    │   4. Stores token          │
       │                                │◄────────────────────────────────────────────────────────────────┤
       │                                │ 5. 302 Redirect:                   │      in memory             │
       │                                │    /auth/desktop-success           │                            │
       │                                ├───────────────────────────────────►│                            │
       │                                │ 6. Renders i18n success UI         │                            │
       │ 7. Polling GET /auth/session   │                                    │                            │
       ├─────────────────────────────────────────────────────────────────────────────────────────────────►│
       │◄─────────────────────────────────────────────────────────────────────────────────────────────────┤
       │ 8. Receives <exchange_token>   │                                    │                            │
       ├────────────────────────────────────────────────────────────────────►│                            │
       │ 9. POST /api/auth/desktop-exchange                                  │                            │
       │◄────────────────────────────────────────────────────────────────────┤                            │
       │ 10. Authenticated session (Cookie/UserDto)                          │                            │
       ▼                                                                                                  
  Enters Workspace
```

---

## 4. Translation Dictionaries (i18n)

### `frontend/src/i18n/locales/en-US.ts`
```typescript
auth: {
  ...
  desktopSuccessTitle: 'Authentication Successful',
  desktopSuccessMessage: 'You have successfully signed in. You can now close this tab and return to ApiDot Desktop.',
  desktopSuccessButton: 'Open ApiDot Desktop',
  waitingBrowserAuth: 'Waiting for authentication in your browser...',
  cancelWaiting: 'Cancel',
}
```

### `frontend/src/i18n/locales/pt-BR.ts`
```typescript
auth: {
  ...
  desktopSuccessTitle: 'Autenticação Concluída com Sucesso',
  desktopSuccessMessage: 'Você foi autenticado com sucesso. Você já pode fechar esta aba e voltar ao ApiDot Desktop.',
  desktopSuccessButton: 'Abrir o ApiDot Desktop',
  waitingBrowserAuth: 'Aguardando autenticação no navegador...',
  cancelWaiting: 'Cancelar',
}
```

---

## 5. Delivery Phases

1. **Phase 1: Backend (`ApiDot.Server`)**
   - Support `desktop_callback` parameter in `/api/auth/login`.
   - In-memory thread-safe storage with TTL for `DesktopExchangeToken`.
   - Endpoint `POST /api/auth/desktop-exchange`.
   - Comprehensive integration tests.
2. **Phase 2: Sidecar (`ApiDot.Agent`)**
   - Endpoints `GET /auth/callback` and `GET /auth/session` in Kestrel Slim with CORS.
   - Unit tests for sidecar authentication loopback.
3. **Phase 3: Frontend Web (`/auth/desktop-success`)**
   - Static/client page with i18n support, ApiDot branding, and dark theme.
   - Vitest component tests.
4. **Phase 4: Desktop Login Integration (`LoginPage.tsx`)**
   - Runtime detection in SSO button.
   - External browser opener and sidecar session polling with cancellation.
   - Login integration tests.
