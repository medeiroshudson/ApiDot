# Autenticação Híbrida (OIDC e Local Root) com RBAC e Desacoplamento no EF Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar autenticação híbrida no ApiDot (SSO via OpenID Connect e credenciais locais para usuário Root) com sessão por cookies seguros, governança N:N em workspaces (`Owner`, `Admin`, `Member`), unificação de contas por e-mail, mapeamentos modulares no EF Core (`IEntityTypeConfiguration<T>`) e isolamento de consultas multi-tenant via Interceptor do EF Core.

**Architecture:** O backend .NET 9 atua como autoridade central de identidade via Minimal APIs e Cookie Authentication padrão (`HttpOnly`, `SameSite=Lax`). As entidades de banco são modularizadas em `Data/Configurations/` com mapeamento limpo via `ApplyConfigurationsFromAssembly`, e o isolamento de consultas entre usuários é aplicado de forma desacoplada por um `DbCommandInterceptor` que consome `ICurrentUserContext`. O frontend Next.js 15 consome os endpoints de autenticação via proxy reverso (`rewrites`), expõe a tela `/login` com SSO e formulário local, armazena o perfil no Zustand (`useAuthStore`) e protege o acesso aos workspaces.

**Tech Stack:** .NET 9, ASP.NET Core Minimal APIs, Entity Framework Core 9 (SQLite), OpenID Connect, Microsoft.AspNetCore.Authentication.Cookies, Next.js 15 (App Router), React 19, Zustand, Tailwind CSS, Vitest, xUnit, FluentAssertions.

**Spec:** `docs/plans/2026-10-30-oidc-and-local-auth-design.md`

## Global Constraints
- `APIDOT_AUTH_ENABLED`: Padrão `true`; quando `false` ou em ambientes de testes sem credenciais configuradas, o sistema opera em modo de desenvolvimento transparente assumindo um usuário Root sintético.
- `APIDOT_ROOT_EMAIL`: E-mail âncora para o usuário Root local e unificação com conta SSO (default: `contato@hmedeiros.dev`).
- `APIDOT_ROOT_PASSWORD`: Senha do usuário Root para login local (obrigatória para autenticação local).
- Cookies de sessão: `HttpOnly`, `Secure` (em produção), `SameSite=Lax`. Nenhum token de sessão armazenado em `localStorage`.
- `OnModelCreating`: Mapeamentos de entidades exclusivamente em `Data/Configurations/` via `ApplyConfigurationsFromAssembly`. Proibido injetar serviços de contexto ou lógica de usuário dentro do `OnModelCreating`.
- Testes: Toda a suíte existente de 446 testes automatizados (.NET e Vitest) deve permanecer 100% verde ao final de cada tarefa.

## Review Focus
1. **Unificação de Contas por E-mail:** Um usuário já cadastrado como Root local que posteriormente faz login via OIDC com o mesmo e-mail deve ter o `OidcSubject` vinculado à conta existente sem duplicar registros ou perder workspaces.
2. **Isolamento de Consultas por Interceptor:** Consultas de workspaces, coleções, pastas e requisições executadas por um usuário comum nunca devem retornar dados pertencentes a outros usuários, enquanto consultas do usuário Root retornam todos os registros.
3. **Fallback Transparente em Testes:** A suíte de testes existente sem cookies de autenticação deve continuar executando sem erros `401 Unauthorized` por meio do bypass de desenvolvimento configurado no `ICurrentUserContext`.
4. **Proteção contra Enumeração e Timing Attack:** Verificação de credenciais locais deve utilizar derivação de chave de tempo constante (PBKDF2-SHA256 com 100.000 iterações e salt criptográfico).
5. **Redirecionamento Idempotente no Frontend:** Usuários desautenticados devem ser redirecionados para `/login`, e usuários já autenticados que acessam `/login` devem ser redirecionados imediatamente para seu primeiro workspace disponível.

---

### Task 1: Domain Entities, Configurations & EF Core Migration

**Files:**
- Create: `backend/src/ApiDot.Server/Enums/WorkspaceRole.cs`
- Create: `backend/src/ApiDot.Server/Data/Entities/User.cs`
- Create: `backend/src/ApiDot.Server/Data/Entities/WorkspaceMember.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/UserConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/WorkspaceMemberConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/AgentDeviceConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/WorkspaceConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/CollectionConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/FolderConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/RequestItemConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/EnvironmentVariableConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Data/Configurations/ExecutionHistoryConfiguration.cs`
- Modify: `backend/src/ApiDot.Server/Data/Entities/Workspace.cs`
- Modify: `backend/src/ApiDot.Server/Data/Entities/AgentDevice.cs`
- Modify: `backend/src/ApiDot.Server/Data/ApiDotDbContext.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Data/AuthEntityPersistenceTests.cs`

**Interfaces:**
- Produces:
  - `WorkspaceRole` enum: `Owner = 1, Admin = 2, Member = 3`
  - `User` entity com `Id`, `Email`, `DisplayName`, `PasswordHash`, `PasswordSalt`, `OidcSubject`, `OidcIssuer`, `IsRoot`, `CreatedAtUtc`, `LastLoginAtUtc`
  - `WorkspaceMember` entity com chave composta `(WorkspaceId, UserId)` e `Role`
  - `Workspace.Members` (`ICollection<WorkspaceMember>`)
  - `AgentDevice.UserId` (Guid? com navegação para `User`)

- [ ] **Step 1: Write the failing test**
Criar `backend/tests/ApiDot.Server.Tests/Data/AuthEntityPersistenceTests.cs` validando:
- Criação e persistência de `User` com unicidade de e-mail.
- Criação de `WorkspaceMember` associando `User` e `Workspace` com `WorkspaceRole.Owner`.
- Vínculo opcional de `AgentDevice` a um `User`.
- Deleção em cascata de `WorkspaceMember` quando `Workspace` ou `User` são removidos.

- [ ] **Step 2: Run test to verify it fails**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~AuthEntityPersistenceTests"
```
Expected: FAIL (tipos `User`, `WorkspaceMember`, `WorkspaceRole` não existem).

- [ ] **Step 3: Implement domain entities and modular configurations**
1. Implementar `WorkspaceRole.cs` em `backend/src/ApiDot.Server/Enums/`.
2. Implementar `User.cs` e `WorkspaceMember.cs` em `backend/src/ApiDot.Server/Data/Entities/`.
3. Adicionar `UserId` e `User?` em `AgentDevice.cs`.
4. Adicionar `ICollection<WorkspaceMember> Members { get; init; } = [];` em `Workspace.cs`.
5. Implementar todas as classes `IEntityTypeConfiguration<T>` em `backend/src/ApiDot.Server/Data/Configurations/`.
6. Atualizar `ApiDotDbContext.cs`:
   - Adicionar `public DbSet<User> Users => Set<User>();` e `public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();`.
   - Substituir corpo de `OnModelCreating` por `modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApiDotDbContext).Assembly);`.
7. Gerar e aplicar a migração EF Core para o modelo SQLite:
```bash
dotnet ef migrations add AddAuthAndWorkspaceMembers --project backend/src/ApiDot.Server --output-dir Migrations
```

- [ ] **Step 4: Run test to verify it passes**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~AuthEntityPersistenceTests"
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/ApiDot.Server/Enums/ backend/src/ApiDot.Server/Data/ backend/tests/ApiDot.Server.Tests/Data/AuthEntityPersistenceTests.cs
git commit -m "feat(data): add User and WorkspaceMember entities with modular EF configurations"
```

---

### Task 2: CurrentUserContext Abstraction & Multi-Tenant EF Core Interceptor

**Files:**
- Create: `backend/src/ApiDot.Server/Security/ICurrentUserContext.cs`
- Create: `backend/src/ApiDot.Server/Security/HttpCurrentUserContext.cs`
- Create: `backend/src/ApiDot.Server/Security/WorkspaceScopeInterceptor.cs`
- Modify: `backend/src/ApiDot.Server/Extensions/ServiceCollectionExtensions.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Security/WorkspaceScopeInterceptorTests.cs`

**Interfaces:**
- Produces:
  - `ICurrentUserContext`: `Guid? UserId { get; }`, `string? Email { get; }`, `string? DisplayName { get; }`, `bool IsAuthenticated { get; }`, `bool IsRoot { get; }`
  - `WorkspaceScopeInterceptor`: `DbCommandInterceptor` que injeta filtro em `CommandCreating`/`ReaderExecuting` para isolamento de dados do usuário autenticado.

- [ ] **Step 1: Write the failing test**
Criar `backend/tests/ApiDot.Server.Tests/Security/WorkspaceScopeInterceptorTests.cs`:
- Quando `CurrentUserContext.IsRoot` for `true`, consultas a `Workspaces` retornam todos os workspaces cadastrados.
- Quando `CurrentUserContext.UserId` for de um usuário regular, consultas a `Workspaces` retornam exclusivamente workspaces onde `WorkspaceMember` possui o `UserId` correspondente.
- Quando `CurrentUserContext.IsAuthenticated` for `false` mas em modo dev/test (`APIDOT_AUTH_ENABLED=false`), resolve como Root sintético.

- [ ] **Step 2: Run test to verify it fails**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~WorkspaceScopeInterceptorTests"
```
Expected: FAIL (tipos não encontrados).

- [ ] **Step 3: Implement CurrentUserContext and Interceptor**
1. Criar `ICurrentUserContext.cs` em `backend/src/ApiDot.Server/Security/`.
2. Criar `HttpCurrentUserContext.cs` lendo `IHttpContextAccessor.HttpContext?.User`:
   - Claims lidas: `ClaimTypes.NameIdentifier` (GUID), `ClaimTypes.Email`, `ClaimTypes.Name`, `IsRoot` ("true").
   - Se `APIDOT_AUTH_ENABLED` for `false` ou usuário não autenticado em ambiente de testes, resolver `IsRoot = true` e `UserId = Guid.Empty`.
3. Criar `WorkspaceScopeInterceptor.cs` aplicando o filtro de isolamento multi-tenant de forma limpa e desacoplada do DbContext.
4. Registrar os serviços em `ServiceCollectionExtensions.cs`:
   - `services.AddHttpContextAccessor();`
   - `services.AddScoped<ICurrentUserContext, HttpCurrentUserContext>();`
   - Adicionar interceptor nas opções do DbContext: `options.AddInterceptors(...)`.

- [ ] **Step 4: Run test to verify it passes**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~WorkspaceScopeInterceptorTests"
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/ApiDot.Server/Security/ backend/src/ApiDot.Server/Extensions/ServiceCollectionExtensions.cs backend/tests/ApiDot.Server.Tests/Security/
git commit -m "feat(security): implement CurrentUserContext and decoupled EF Core query interceptor"
```

---

### Task 3: Password Hashing, Root User Seeding & Workspace Data Migration

**Files:**
- Create: `backend/src/ApiDot.Server/Security/IPasswordHasher.cs`
- Create: `backend/src/ApiDot.Server/Security/PasswordHasher.cs`
- Create: `backend/src/ApiDot.Server/Security/IUserSeeder.cs`
- Create: `backend/src/ApiDot.Server/Security/UserSeeder.cs`
- Modify: `backend/src/ApiDot.Server/Extensions/DatabaseExtensions.cs`
- Modify: `backend/src/ApiDot.Server/Extensions/ServiceCollectionExtensions.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Security/PasswordHasherTests.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Security/UserSeederTests.cs`

**Interfaces:**
- Produces:
  - `IPasswordHasher`: `(string Hash, string Salt) HashPassword(string password)`, `bool VerifyPassword(string password, string hash, string salt)`
  - `IUserSeeder`: `Task SeedRootUserAndOrphanWorkspacesAsync(CancellationToken cancellationToken)`

- [ ] **Step 1: Write the failing tests**
1. `PasswordHasherTests.cs`:
   - Gera salt e hash para uma senha conhecida.
   - Valida senha correta retornando `true`.
   - Rejeita senha incorreta retornando `false`.
   - Utiliza PBKDF2-SHA256 com tempo de execução seguro.
2. `UserSeederTests.cs`:
   - Quando `APIDOT_ROOT_EMAIL` e `APIDOT_ROOT_PASSWORD` estiverem configurados, cria o usuário Root no banco com `IsRoot = true`.
   - Se o usuário Root já existir, atualiza a senha caso alterada.
   - Localiza workspaces existentes sem membros e associa-os ao Root como `WorkspaceRole.Owner`.

- [ ] **Step 2: Run tests to verify they fail**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~PasswordHasherTests|FullyQualifiedName~UserSeederTests"
```
Expected: FAIL.

- [ ] **Step 3: Implement PasswordHasher and UserSeeder**
1. Implementar `PasswordHasher.cs` utilizando `Rfc2898DeriveBytes.Pbkdf2` com SHA-256 e 100.000 iterações.
2. Implementar `UserSeeder.cs` lendo `IConfiguration` e executando a lógica de seed e vinculação de workspaces legados.
3. Atualizar `DatabaseExtensions.ApplyDatabaseMigrations` para invocar o `UserSeeder` após `db.Database.Migrate()`.
4. Registrar `IPasswordHasher` e `IUserSeeder` em `ServiceCollectionExtensions.cs`.

- [ ] **Step 4: Run tests to verify they pass**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~PasswordHasherTests|FullyQualifiedName~UserSeederTests"
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/ApiDot.Server/Security/ backend/src/ApiDot.Server/Extensions/DatabaseExtensions.cs backend/tests/ApiDot.Server.Tests/Security/
git commit -m "feat(security): implement PBKDF2 password hasher and root user seeder"
```

---

### Task 4: Authentication Service & OIDC / Local Auth Endpoints

**Files:**
- Create: `backend/src/ApiDot.Server/Models/AuthModels.cs`
- Create: `backend/src/ApiDot.Server/Services/IAuthService.cs`
- Create: `backend/src/ApiDot.Server/Services/AuthService.cs`
- Create: `backend/src/ApiDot.Server/Endpoints/AuthEndpoints.cs`
- Modify: `backend/src/ApiDot.Server/Extensions/ServiceCollectionExtensions.cs`
- Modify: `backend/src/ApiDot.Server/Extensions/EndpointRouteBuilderExtensions.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/AuthEndpointsTests.cs`

**Interfaces:**
- Produces:
  - `GET /api/auth/config`: `{ oidcEnabled: bool, localAuthEnabled: bool, providerName: string }`
  - `GET /api/auth/login`: Dispara `ChallengeResult` para OpenID Connect
  - `POST /api/auth/local`: Recebe `LocalLoginRequest(Email, Password)`, valida e emite Cookie
  - `GET /api/auth/me`: Retorna `AuthUserDto(Id, Email, DisplayName, IsRoot, Workspaces)` ou 401
  - `POST /api/auth/logout`: Executa `SignOutAsync` do cookie de autenticação

- [ ] **Step 1: Write the failing tests**
Criar `backend/tests/ApiDot.Server.Tests/Endpoints/AuthEndpointsTests.cs`:
- `GET /api/auth/config` retorna flags conforme configuração.
- `POST /api/auth/local` com credenciais corretas emite cookie `Set-Cookie: apidot_session=...` e status 200.
- `POST /api/auth/local` com credenciais incorretas retorna 401 Unauthorized com mensagem de erro.
- `GET /api/auth/me` autenticado retorna dados do usuário e lista de workspaces.
- `GET /api/auth/me` anônimo retorna 401.
- `POST /api/auth/logout` revoga o cookie de sessão.
- Simulação do callback OIDC: quando e-mail coincide com usuário root local, vincula `OidcSubject` e não cria usuário duplicado (Account Linking).

- [ ] **Step 2: Run test to verify it fails**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~AuthEndpointsTests"
```
Expected: FAIL (endpoints não mapeados).

- [ ] **Step 3: Implement AuthService and AuthEndpoints**
1. Criar DTOs em `backend/src/ApiDot.Server/Models/AuthModels.cs`.
2. Implementar `IAuthService` e `AuthService` com métodos para login local, unificação de contas OIDC e busca de perfil.
3. Criar `backend/src/ApiDot.Server/Endpoints/AuthEndpoints.cs`.
4. Mapear rotas em `EndpointRouteBuilderExtensions.cs` (`app.MapAuthEndpoints()`).
5. Configurar esquema de autenticação em `ServiceCollectionExtensions.cs`:
   - `AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(...)`.
   - Se `OIDC_AUTHORITY` configurado, adicionar `.AddOpenIdConnect(...)`.
   - Adicionar `app.UseAuthentication();` e `app.UseAuthorization();` no pipeline.

- [ ] **Step 4: Run test to verify it passes**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~AuthEndpointsTests"
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/ApiDot.Server/Models/AuthModels.cs backend/src/ApiDot.Server/Services/AuthService.cs backend/src/ApiDot.Server/Endpoints/AuthEndpoints.cs backend/src/ApiDot.Server/Extensions/ backend/tests/ApiDot.Server.Tests/Endpoints/AuthEndpointsTests.cs
git commit -m "feat(auth): implement AuthService and authentication endpoints with OIDC and local login"
```

---

### Task 5: Agent Device Ownership & WebSocket / Execution Authorization

**Files:**
- Modify: `backend/src/ApiDot.Server/Endpoints/AgentDeviceEndpoints.cs`
- Modify: `backend/src/ApiDot.Server/Endpoints/RequestItemEndpoints.cs`
- Modify: `backend/src/ApiDot.Server/WebSockets/AgentHub.cs`
- Test: `backend/tests/ApiDot.Server.Tests/WebSockets/AgentDeviceAuthTests.cs`

**Interfaces:**
- Consumes: `ICurrentUserContext`
- Modifies: `POST /api/agent/devices` associa o dispositivo ao `CurrentUserContext.UserId`.
- Modifies: `GET /api/agent/devices` retorna apenas dispositivos do usuário logado (ou todos para Root).
- Modifies: `POST /api/requests/execute` com destino `Agent` valida posse do dispositivo.

- [ ] **Step 1: Write the failing tests**
Criar `backend/tests/ApiDot.Server.Tests/WebSockets/AgentDeviceAuthTests.cs`:
- Criação de dispositivo associa automaticamente o `UserId` do usuário logado.
- Usuário A não enxerga nem pode revogar dispositivos criados pelo Usuário B.
- Usuário Root enxerga todos os dispositivos.
- Despacho de requisição para dispositivo alheio retorna 403 Forbidden.

- [ ] **Step 2: Run test to verify it fails**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~AgentDeviceAuthTests"
```
Expected: FAIL.

- [ ] **Step 3: Implement device ownership and authorization checks**
1. Atualizar `AgentDeviceEndpoints.cs` para atribuir `device.UserId = currentUser.UserId` e filtrar por proprietário.
2. Atualizar `RequestItemEndpoints.cs` no endpoint de execução para validar se o dispositivo selecionado pertence ao usuário solicitante.

- [ ] **Step 4: Run test to verify it passes**
```bash
dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter "FullyQualifiedName~AgentDeviceAuthTests"
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/src/ApiDot.Server/Endpoints/AgentDeviceEndpoints.cs backend/src/ApiDot.Server/Endpoints/RequestItemEndpoints.cs backend/tests/ApiDot.Server.Tests/WebSockets/AgentDeviceAuthTests.cs
git commit -m "feat(security): enforce AgentDevice user ownership on registration and execution"
```

---

### Task 6: Frontend Auth Store & API Client

**Files:**
- Create: `frontend/src/lib/authApi.ts`
- Create: `frontend/src/lib/authApi.test.ts`
- Create: `frontend/src/stores/useAuthStore.ts`
- Create: `frontend/src/stores/useAuthStore.test.ts`

**Interfaces:**
- Produces:
  - `authApi`: `getAuthConfig()`, `loginLocal(email, password)`, `getCurrentUser()`, `logout()`
  - `useAuthStore`: `user`, `isLoading`, `isAuthenticated`, `checkAuth()`, `logout()`, `loginLocal(email, password)`

- [ ] **Step 1: Write the failing tests**
1. `frontend/src/lib/authApi.test.ts`:
   - Valida chamadas corretas para `/api/auth/config`, `/api/auth/local`, `/api/auth/me` e `/api/auth/logout`.
   - Trata erro 401 retornando `null` em `getCurrentUser()`.
2. `frontend/src/stores/useAuthStore.test.ts`:
   - Estado inicial com `isLoading: true, isAuthenticated: false`.
   - `checkAuth` popula `user` e seta `isAuthenticated: true` quando `/api/auth/me` responde sucesso.
   - `logout` limpa o estado do usuário e seta `isAuthenticated: false`.

- [ ] **Step 2: Run tests to verify they fail**
```bash
npm --prefix frontend test frontend/src/lib/authApi.test.ts frontend/src/stores/useAuthStore.test.ts
```
Expected: FAIL (módulos não encontrados).

- [ ] **Step 3: Implement authApi and useAuthStore**
1. Implementar `frontend/src/lib/authApi.ts`.
2. Implementar `frontend/src/stores/useAuthStore.ts` com Zustand.

- [ ] **Step 4: Run tests to verify they pass**
```bash
npm --prefix frontend test frontend/src/lib/authApi.test.ts frontend/src/stores/useAuthStore.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/authApi.ts frontend/src/lib/authApi.test.ts frontend/src/stores/useAuthStore.ts frontend/src/stores/useAuthStore.test.ts
git commit -m "feat(web): implement authApi client and useAuthStore with Zustand"
```

---

### Task 7: Frontend Login Page (`/login`)

**Files:**
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/app/login/page.test.tsx`

**Interfaces:**
- Produces: Rota `/login` com layout centrado, tema escuro, botão SSO e formulário de credenciais locais.

- [x] **Step 1: Write the failing test**
Criar `frontend/src/app/login/page.test.tsx`:
- Renderiza botão "Entrar com SSO" quando `oidcEnabled` for `true`.
- Renderiza campos de Email, Senha e botão de submissão local.
- Ao submeter credenciais válidas, chama `authStore.loginLocal` e redireciona para `/`.
- Ao submeter credenciais inválidas, exibe mensagem de erro na tela.

- [x] **Step 2: Run test to verify it fails**
```bash
npm --prefix frontend test frontend/src/app/login/page.test.tsx
```
Expected: FAIL.

- [x] **Step 3: Implement LoginPage component**
1. Criar `frontend/src/app/login/page.tsx` seguindo o design system do ApiDot (Tailwind CSS, ícones `lucide-react`, cores e contrastes acessíveis).
2. Conectar com `useAuthStore` e manipular feedbacks visuais de carregamento e erro.

- [x] **Step 4: Run test to verify it passes**
```bash
npm --prefix frontend test frontend/src/app/login/page.test.tsx
```
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add frontend/src/app/login/
git commit -m "feat(web): create unified login page with SSO button and local credentials form"
```

---

### Task 8: Frontend Route Guard & AppHeader User Menu

**Files:**
- Modify: `frontend/src/components/layout/AppHeader.tsx`
- Modify: `frontend/src/components/layout/AppHeader.test.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/workspace/[workspaceId]/layout.tsx`

**Interfaces:**
- Consumes: `useAuthStore`
- Produces:
  - Menu de usuário no `AppHeader` com iniciais, e-mail, badge da Role e botão de logout.
  - Guarda de navegação: redireciona para `/login` quando desautenticado; redireciona para o primeiro workspace quando autenticado na raiz `/`.

- [ ] **Step 1: Write the failing test**
Atualizar `frontend/src/components/layout/AppHeader.test.tsx`:
- Exibe o e-mail e as iniciais do usuário autenticado no canto direito.
- Exibe a badge com a Role do usuário no workspace ativo (`Owner`, `Admin`, `Member`).
- O clique no botão de logout dispara a ação de logout e redireciona para `/login`.

- [ ] **Step 2: Run test to verify it fails**
```bash
npm --prefix frontend test frontend/src/components/layout/AppHeader.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement AppHeader User Menu and Route Guards**
1. Atualizar `AppHeader.tsx` adicionando o componente de menu de perfil e logout.
2. Atualizar `app/page.tsx` e `workspace/[workspaceId]/layout.tsx` para verificar o estado de autenticação via `useAuthStore` e aplicar o redirecionamento para `/login` caso não autenticado.

- [ ] **Step 4: Run test to verify it passes**
```bash
npm --prefix frontend test frontend/src/components/layout/AppHeader.test.tsx
```
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/layout/AppHeader.tsx frontend/src/components/layout/AppHeader.test.tsx frontend/src/app/
git commit -m "feat(web): add user profile menu with role badge and client-side route guards"
```

---

### Task 9: Full End-to-End Verification & Docker Configuration

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`
- Create: `backend/tests/ApiDot.E2E.Tests/AuthFlowE2ETests.cs`

**Interfaces:**
- Valida o fluxo ponta a ponta completo: inicialização do servidor, seed do usuário root, login local, acesso a workspaces protegidos, isolamento de dados e logout.

- [ ] **Step 1: Write the E2E test**
Criar `backend/tests/ApiDot.E2E.Tests/AuthFlowE2ETests.cs`:
- Valida fluxo completo de login local via API, emissão e consumo de cookie `apidot_session`, acesso ao workspace atribuído ao Root e logout com revogação de sessão.

- [ ] **Step 2: Run E2E test to verify it passes**
```bash
dotnet test backend/tests/ApiDot.E2E.Tests/ApiDot.E2E.Tests.csproj --filter "FullyQualifiedName~AuthFlowE2ETests"
```
Expected: PASS.

- [ ] **Step 3: Update Docker Compose files**
Atualizar `docker-compose.yml` e `docker-compose.dev.yml` para documentar as variáveis:
- `APIDOT_ROOT_EMAIL`
- `APIDOT_ROOT_PASSWORD`
- `OIDC_AUTHORITY`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`

- [ ] **Step 4: Run complete test suites**
Executar a validação integral de ambas as camadas:
```bash
dotnet test backend/ApiDot.sln
npm --prefix frontend test
```
Expected: 100% dos testes aprovados em ambos os ambientes (backend e web).

- [ ] **Step 5: Commit**
```bash
git add docker-compose.yml docker-compose.dev.yml backend/tests/ApiDot.E2E.Tests/AuthFlowE2ETests.cs
git commit -m "chore(config): update docker compose configuration and add auth E2E test suite"
```
