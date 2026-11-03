# Desktop SSO via External Browser & Loopback Callback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o aplicativo Desktop autentique via SSO abrindo o navegador padrão do usuário (onde a sessão do Authentik já está ativa), redirecionando para o Sidecar local em loopback (`/auth/callback`), exibindo tela de sucesso com i18n (`/auth/desktop-success`) e concluindo o login no app automaticamente.

**Architecture:** O aplicativo Desktop abre a URL de login no navegador externo via Tauri opener com o parâmetro `desktop_callback=http://127.0.0.1:<port>/auth/callback`. O `ApiDot.Server` valida a sessão OIDC existente no Authentik, emite um token efêmero de uso único (`DesktopExchangeToken`) e redireciona o navegador para o Sidecar local. O Sidecar armazena o token e redireciona o navegador para `/auth/desktop-success` (Next.js com i18n). O desktop consulta o Sidecar via loopback (`GET /auth/session`), troca o token em `POST /api/auth/desktop-exchange` e entra no workspace.

**Tech Stack:** .NET 9 (ASP.NET Core, Kestrel Slim, OIDC), Next.js 16.4.4, React 19.3.1, Tauri v2, Zustand 5, TypeScript 5.7, Vitest, xUnit.

**Spec:** `docs/plans/2026-11-03-desktop-sso-browser-flow-design.md`

## Global Constraints

- **Tokens Efêmeros e de Uso Único:** O `DesktopExchangeToken` expira estritamente em 5 minutos e é invalidado imediatamente após a primeira troca em `POST /api/auth/desktop-exchange`.
- **Proteção do Endpoint de Sessão:** A rota `GET /auth/session` no Sidecar exige o cabeçalho `X-ApiDot-Sidecar-Secret`.
- **Página de Sucesso com i18n:** A rota `/auth/desktop-success` deve utilizar o sistema nativo de traduções do ApiDot (`en-US` como padrão, `pt-BR`).
- **Segurança de Origem e Loopback:** Apenas URLs de callback apontando para `http://127.0.0.1:<port>/auth/callback` ou `http://localhost:<port>/auth/callback` são aceitas como `desktop_callback`.
- **Preservação do Modo Web:** No navegador web, o fluxo de SSO permanece inalterado navegando diretamente para `/api/auth/login`.

## Review Focus

1. **Tentativa de injeção de `desktop_callback` malicioso:** O servidor valida que o hostname é estritamente `127.0.0.1` ou `localhost` e o caminho é `/auth/callback`, rejeitando URLs externas com `400 Bad Request`.
2. **Reutilização de token de troca:** Tentativa de trocar o mesmo `DesktopExchangeToken` pela segunda vez resulta em `401 Unauthorized`.
3. **Cancelamento do usuário no Desktop:** Se o usuário clicar em "Cancelar" na janela do Desktop durante o estado de espera, o polling é interrompido sem travar a interface.
4. **Tradução no navegador:** Ao abrir `/auth/desktop-success`, a página detecta ou respeita a localidade do usuário sem erros de hidratação.
5. **CORS no Sidecar:** A rota `/auth/session` permite a leitura do token pelo frontend do desktop sem bloqueios de CORS.

---

### Task 1: Backend Desktop SSO Token Exchange (`POST /api/auth/desktop-exchange` & `desktop_callback`)

**Files:**
- Modify: `backend/src/ApiDot.Server/Endpoints/AuthEndpoints.cs:25-70`
- Modify: `backend/src/ApiDot.Server/Services/AuthService.cs`
- Modify: `backend/src/ApiDot.Server/Services/IAuthService.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/DesktopAuthEndpointsTests.cs`

**Interfaces:**
- Consumes: `HttpContext`, `IAuthService`
- Produces: `POST /api/auth/desktop-exchange -> UserDto` e suporte a `desktop_callback` em `/api/auth/login`

- [ ] **Step 1: Escrever teste de falha para emissão e troca de DesktopExchangeToken**

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

- [ ] **Step 2: Executar teste para verificar falha**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter DesktopAuthEndpointsTests -v minimal`  
Expected: FAIL com 404 Not Found

- [ ] **Step 3: Implementar geração, validação e endpoint `POST /api/auth/desktop-exchange`**

No `AuthService.cs`, manter cache/dicionário thread-safe com expiração de 5 minutos para tokens de troca. Adicionar `CreateDesktopExchangeToken` e `ValidateAndConsumeDesktopTokenAsync`. Em `AuthEndpoints.cs`, receber parâmetro `desktop_callback` em `/api/auth/login`, validar que a URL aponta para loopback (`127.0.0.1` ou `localhost`), e mapear `POST /api/auth/desktop-exchange` validando o token, autenticando a sessão via `SignInAsync` e retornando `UserDto`.

- [ ] **Step 4: Executar testes de integração para verificar aprovação**

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
- Consumes: Parâmetros `token` em `GET /auth/callback`, header `X-ApiDot-Sidecar-Secret` em `GET /auth/session`
- Produces: `GET /auth/callback -> 302 Redirect`, `GET /auth/session -> { token }`

- [ ] **Step 1: Escrever teste de falha para rotas de autenticação do Sidecar**

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

- [ ] **Step 2: Executar teste para verificar falha**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SidecarAuthEndpointsTests -v minimal`  
Expected: FAIL com 404 Not Found

- [ ] **Step 3: Implementar endpoints `/auth/callback` e `/auth/session` no Kestrel Slim**

Em `SidecarCommand.cs`, declarar variável volátil/thread-safe para o token de autenticação pendente. Mapear `GET /auth/callback` para capturar `token` e retornar redirect `302` para `${serverUrl}/auth/desktop-success`. Mapear `GET /auth/session` (com validação de segredo) para retornar o token capturado e limpá-lo após leitura.

- [ ] **Step 4: Executar testes para verificar aprovação e recompilar Native AOT**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SidecarAuthEndpointsTests -v minimal`  
Run: `node desktop/prepare.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Agent/Commands/SidecarCommand.cs backend/tests/ApiDot.Server.Tests/Agent/
git commit -m "feat(agent): add sidecar /auth/callback and /auth/session loopback endpoints"
```

---

### Task 3: Página de Confirmação i18n (`/auth/desktop-success`)

**Files:**
- Create: `frontend/src/app/auth/desktop-success/page.tsx`
- Modify: `frontend/src/i18n/locales/en-US.ts:335-360`
- Modify: `frontend/src/i18n/locales/pt-BR.ts:335-360`
- Test: `frontend/src/app/auth/desktop-success/page.test.tsx`

**Interfaces:**
- Consumes: `useTranslation()`
- Produces: Rota `/auth/desktop-success` com títulos e mensagens em inglês e português

- [ ] **Step 1: Escrever teste de falha para a página `/auth/desktop-success`**

```typescript
it('renders authentication success message and open desktop button in en-US and pt-BR', () => {
  render(<DesktopSuccessPage />);
  expect(screen.getByText(/Authentication Successful/i)).toBeInTheDocument();
  expect(screen.getByText(/You can now close this tab/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- desktop-success/page.test.tsx`  
Expected: FAIL com módulo inexistente

- [ ] **Step 3: Implementar página e chaves de tradução**

Adicionar chaves `auth.desktopSuccessTitle`, `auth.desktopSuccessMessage`, `auth.desktopSuccessButton` em `en-US.ts` e `pt-BR.ts`. Criar `frontend/src/app/auth/desktop-success/page.tsx` com visual escuro consistente com o ApiDot, ícone de check verde esmeralda e botão de ação.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `npm --prefix frontend test -- desktop-success/page.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/auth/desktop-success/ frontend/src/i18n/
git commit -m "feat(frontend): add localized /auth/desktop-success confirmation page"
```

---

### Task 4: Integração Desktop no Login (`LoginPage.tsx` & `desktopAuth.ts`)

**Files:**
- Create: `frontend/src/lib/desktop/desktopAuth.ts`
- Modify: `frontend/src/app/login/page.tsx:120-160`
- Modify: `frontend/src/stores/useAuthStore.ts`
- Test: `frontend/src/lib/desktop/desktopAuth.test.ts`
- Test: `frontend/src/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `isDesktop()`, `getSidecarInfo()`, `loginDesktopSso()`
- Produces: Fluxo completo de SSO no navegador padrão com polling de token e hidratação de sessão

- [ ] **Step 1: Escrever teste de falha para o fluxo de autenticação desktop**

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

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- desktopAuth.test.ts`  
Expected: FAIL com módulo inexistente

- [ ] **Step 3: Implementar `desktopAuth.ts` e integração no `LoginPage.tsx`**

Em `desktopAuth.ts`, implementar função que abre a URL no navegador padrão usando o plugin opener do Tauri / `window.__TAURI__.core.invoke`, inicia polling em `http://127.0.0.1:<port>/auth/session` com timeout de 2 minutos, e troca o token em `/api/auth/desktop-exchange`. Em `LoginPage.tsx`, se `isDesktop()` for verdadeiro, interceptar o clique no botão SSO para acionar o fluxo desktop exibindo estado de espera (*"Aguardando autenticação no navegador..."*) com botão de cancelar.

- [ ] **Step 4: Executar testes de login do frontend**

Run: `npm --prefix frontend test -- desktopAuth.test.ts login/page.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/desktop/desktopAuth.ts frontend/src/app/login/
git commit -m "feat(desktop): integrate external browser sso flow with sidecar callback"
```

---

### Task 5: Validação Geral de Builds, Tipos e Suítes de Testes

**Files:**
- Test: Execução integral de testes (.NET backend, Vitest frontend e Desktop validators)

- [ ] **Step 1: Executar testes do backend .NET**

Run: `dotnet test backend/ApiDot.sln -v minimal`  
Expected: PASS

- [ ] **Step 2: Executar testes do frontend com Vitest**

Run: `npm --prefix frontend test`  
Expected: PASS

- [ ] **Step 3: Executar typecheck rigoroso do TypeScript**

Run: `./frontend/node_modules/.bin/tsc --project frontend/tsconfig.json --noEmit`  
Expected: 0 erros

- [ ] **Step 4: Executar compilação de produção do Next.js e validação desktop**

Run: `npm --prefix frontend run build`  
Run: `npm --prefix desktop run test`  
Expected: PASS

- [ ] **Step 5: Commit final da integração**

```bash
git add .
git commit -m "chore(desktop): finalize desktop sso browser authentication feature"
```
