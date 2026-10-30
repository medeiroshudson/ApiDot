# Documento de Design: Autenticação Híbrida (OIDC e Local Root) com RBAC e Desacoplamento no EF Core

**Data:** 2026-10-30  
**Status:** Proposto (Aguardando Aprovação)  
**Autor:** Hudson Medeiros & Orchestrator  
**Alvo:** `ApiDot.Server` (.NET 9), `ApiDot.Core`, `ApiDot.Web` (Next.js 15)

---

## 1. Contexto e Motivação

Atualmente, o ApiDot opera como uma aplicação mono-usuário e sem autenticação:
- Workspaces, coleções, requisições, ambientes e histórico de execução são globais na base SQLite.
- Qualquer requisição ao frontend ou backend tem acesso irrestrito a todos os dados.
- O daemon `ApiDot.Agent` valida apenas um token de dispositivo no handshake WebSocket, sem isolamento por conta de usuário.

Com a implantação do ApiDot em infraestrutura corporativa/homelab (K3s com Authentik como Identity Provider central), é necessário proteger a plataforma contra acessos não autorizados, permitir login federado via SSO (OpenID Connect) e possibilitar o acesso local via credenciais de contingência/administração (`APIDOT_ROOT_EMAIL` / `APIDOT_ROOT_PASSWORD`), garantindo isolamento de dados com governança multi-usuário (RBAC).

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos (Goals)
1. **Autenticação Híbrida Unificada**: Suporte simultâneo a SSO via OpenID Connect (PKCE) e autenticação local para usuário root, gerando o mesmo formato de sessão segura baseada em Cookies (`HttpOnly`, `SameSite=Lax`).
2. **Unificação de Contas (Account Linking)**: Se o usuário root local for configurado com o mesmo e-mail presente no IdP (ex.: `contato@hmedeiros.dev`), o primeiro login via SSO vincula automaticamente a identidade OIDC (`sub`) à conta existente, compartilhando o mesmo `UserId`, workspaces e permissões.
3. **Provisionamento Just-In-Time (JIT)**: Usuários que autenticarem pela primeira vez via SSO são cadastrados automaticamente no banco de dados e recebem um workspace pessoal padrão como `Owner`.
4. **RBAC N:N em Workspaces**: Relacionamento N:N entre `User` e `Workspace` através da tabela associativa `WorkspaceMember`, com papéis explícitos: `Owner`, `Admin` e `Member`.
5. **Arquitetura Desacoplada no EF Core**:
   - Configurações de mapeamento de entidades isoladas em classes dedicadas `IEntityTypeConfiguration<T>` na pasta `Data/Configurations/`, mantendo `OnModelCreating` limpo via `ApplyConfigurationsFromAssembly`.
   - Filtros de escopo e isolamento multi-tenant desacoplados através de Interceptors do Entity Framework Core (`DbCommandInterceptor` / query expression interceptor), evitando acoplamento direto de serviços de escopo (`ICurrentUserContext`) dentro do `OnModelCreating`.
6. **Interface de Login no Frontend**: Tela de autenticação clara no Next.js 15 apresentando lado a lado / empilhadas as opções de SSO e login local, com proteção de rotas privadas e botão de logout no cabeçalho.
7. **Migração Segura de Dados Existentes**: Atribuir a titularidade de workspaces e dados legados ao usuário root na primeira inicialização, prevenindo perda de acesso ou orfandade de dados.

### Não-Objetivos (Non-Goals)
1. **Gestão colaborativa de membros (Etapa 2)**: Telas e fluxos para convidar novos usuários por e-mail, transferir ownership ou alterar papéis em workspaces existentes ficam diferidos para a próxima etapa. Nesta primeira entrega, consolidam-se a autenticação híbrida, o isolamento multi-tenant N:N e o provisionamento automático do workspace pessoal inicial de cada usuário.
2. **Autenticação externa de clientes HTTP (Auth Tab)**: Obtenção de tokens OAuth2 para execução de chamadas externas na aba "Auth" do RequestEditor não faz parte deste escopo (trata-se de feature separada de execução de testes).
3. **Gestão avançada de organizações/times multi-nível**: Hierarquias além de Workspace -> Membros com Role fixa não serão implementadas nesta fase.
4. **Servidor IdP interno**: O ApiDot não atuará como emissor de identidade para terceiros; atua puramente como Relying Party (OIDC Client).
5. **RP-Initiated IdP Logout**: O logout limpa exclusivamente a sessão local do ApiDot (`/api/auth/logout`), preservando a sessão global ativa no Authentik para outras aplicações do homelab/cluster.

### Anti-Objetivos (Anti-Goals)
1. **Sem armazenamento de tokens JWT em localStorage**: Proibido guardar tokens de sessão no storage do navegador para evitar vulnerabilidades de XSS; a sessão é estritamente mantida via cookies `HttpOnly` com proteção CSRF (`SameSite=Lax` e validação de `Origin`).
2. **Sem acoplamento no `OnModelCreating`**: Proibido injetar `ICurrentUserContext` no construtor do `ApiDotDbContext` para definir filtros inline no `OnModelCreating`, garantindo que o contexto permaneça desacoplado, testável e sem dependências circulares.
3. **Sem quebra da execução offline/local e testes automatizados**: A aplicação suporta flag `APIDOT_AUTH_ENABLED` (padrão: `true`). Quando desabilitada ou em ambiente de testes unitários onde nenhuma credencial for configurada, a aplicação opera em modo de desenvolvimento transparente assumindo um usuário Root sintético, garantindo que os 446 testes existentes executem sem regressões.

---

## 3. Abordagens Consideradas e Decisão

### Abordagem 1: Backend-Managed Auth com Cookie Session e BFF Transparente (Escolhida)
- O backend .NET 9 é a autoridade central de autenticação, configurando `CookieAuthentication` e `OpenIdConnectAuthentication`.
- O Next.js atua como BFF transparente via `rewrites` no `next.config.ts`, encaminhando `/api/*` com cookies de sessão.
- **Vantagens**: Centralização de segurança, zero vazamento de Client Secrets para o cliente, injeção nativa de `ClaimsPrincipal` no pipeline do ASP.NET Core para alimentar o `ICurrentUserContext`.

### Abordagem 2: Frontend-Managed Auth via NextAuth / Auth.js com JWT Bearer no Backend (Descartada)
- O Next.js gerencia os provedores e emite tokens Bearer para o .NET 9.
- **Desvantagens**: Duplicação da lógica de autenticação (backend precisaria de endpoint de conferência de hash local apenas para o NextAuth), complexidade desnecessária para gerenciar expiração de tokens e maior atrito com WebSockets.

---

## 4. Arquitetura Detalhada e Modelagem de Dados

### 4.1 Entidades de Domínio

#### `User` (`Data/Entities/User.cs`)
```csharp
public class User
{
    public Guid Id { get; init; } = Guid.NewGuid();

    [MaxLength(256)]
    public required string Email { get; set; }

    [MaxLength(200)]
    public required string DisplayName { get; set; }

    [MaxLength(256)]
    public string? PasswordHash { get; set; }

    [MaxLength(128)]
    public string? PasswordSalt { get; set; }

    [MaxLength(256)]
    public string? OidcSubject { get; set; }

    [MaxLength(256)]
    public string? OidcIssuer { get; set; }

    public bool IsRoot { get; set; } = false;

    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? LastLoginAtUtc { get; set; }

    public ICollection<WorkspaceMember> WorkspaceMemberships { get; init; } = [];
    public ICollection<AgentDevice> Devices { get; init; } = [];
}
```

#### `WorkspaceRole` (Enum em `Enums/WorkspaceRole.cs`)
```csharp
public enum WorkspaceRole
{
    Owner = 1,
    Admin = 2,
    Member = 3
}
```

#### `WorkspaceMember` (`Data/Entities/WorkspaceMember.cs`)
```csharp
public class WorkspaceMember
{
    public Guid WorkspaceId { get; set; }
    public Workspace Workspace { get; set; } = null!;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public WorkspaceRole Role { get; set; } = WorkspaceRole.Member;
    public DateTime JoinedAtUtc { get; set; } = DateTime.UtcNow;
}
```

#### `AgentDevice` (`Data/Entities/AgentDevice.cs` - Atualizado)
- Adiciona `UserId` (Guid?, FK para `User`) para vincular o dispositivo ao proprietário.

---

### 4.2 Configuração Modularizada das Entidades (`Data/Configurations/`)

Todas as definições de esquema são isoladas em classes que implementam `IEntityTypeConfiguration<T>`:
- `Data/Configurations/UserConfiguration.cs`: Índice único em `Email`, índice em `OidcSubject`.
- `Data/Configurations/WorkspaceMemberConfiguration.cs`: Chave composta `(WorkspaceId, UserId)`, relacionamentos em cascata com `Workspace` e `User`.
- `Data/Configurations/AgentDeviceConfiguration.cs`: FK para `User` com delete restrito.
- `Data/Configurations/WorkspaceConfiguration.cs`, etc.

No `ApiDotDbContext.OnModelCreating`, apenas invocamos:
```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApiDotDbContext).Assembly);
}
```

---

### 4.3 Isolamento Multi-Tenant via EF Core Interceptors

Em vez de acoplar serviços e cláusulas condicionais no `OnModelCreating`, o isolamento de consultas é gerenciado de forma desacoplada por meio de um Interceptor de Consultas do EF Core (`WorkspaceScopeInterceptor` que herda de `DbCommandInterceptor`):
- Registrado no container de injeção de dependências (`services.AddScoped<WorkspaceScopeInterceptor>()` ou factory).
- Obtém o `ICurrentUserContext` resolvido no escopo da requisição HTTP ativa.
- Quando a consulta SQL atinge entidades protegidas (`Workspaces`, `Collections`, `Requests`, etc.), o interceptor valida se o usuário é `IsRoot`; se não for, injeta o predicado de filtro garantindo que apenas recursos onde o usuário é membro ativo sejam retornados.
- Métodos administrativos, migrações e rotas de sistema podem suprimir o interceptor quando necessário via escopo explícito.

---

### 4.4 Unificação de Contas (Account Linking) e Seed

No serviço de autenticação (`IAuthService`):
1. **Login Local**:
   - Busca usuário por `Email.ToLowerInvariant()`.
   - Valida senha contra `PasswordHash` / `PasswordSalt` usando `Rfc2898DeriveBytes` (PBKDF2-SHA256, 100.000 iterações).
   - Se válido, atualiza `LastLoginAtUtc` e emite Cookie de Sessão com Claims:
     `NameIdentifier` = `User.Id`, `Email` = `User.Email`, `Name` = `User.DisplayName`, `IsRoot` = `User.IsRoot`.
2. **Login OIDC**:
   - Callback recebe claims `sub`, `email`, `name`.
   - Busca usuário existente:
     - 1º: Por `OidcSubject == sub`.
     - 2º: Por `Email == email.ToLowerInvariant()`.
   - Se encontrado por e-mail (ex.: conta root pré-existente):
     - Atualiza `OidcSubject = sub`, `OidcIssuer = issuer`, `LastLoginAtUtc = DateTime.UtcNow`.
     - Salva no banco.
   - Se não encontrado:
     - Cria novo `User` (JIT).
     - Cria automaticamente um `Workspace` inicial ("Meu Workspace") com `WorkspaceMember` (`Role = Owner`).
3. **Seed do Usuário Root e Workspaces Órfãos**:
   - Na inicialização (`ApplyDatabaseMigrations` / `DatabaseExtensions`):
     - Se `APIDOT_ROOT_EMAIL` e `APIDOT_ROOT_PASSWORD` estiverem definidos:
       - Garante a existência do usuário root.
       - Atualiza a senha caso tenha mudado nas variáveis de ambiente.
       - Identifica workspaces existentes no banco que não possuem membros (`!w.Members.Any()`) e vincula-os ao usuário root como `Owner`.

---

### 4.5 Endpoints de Autenticação (`Endpoints/AuthEndpoints.cs`)

1. **`GET /api/auth/config`** (Anônimo):
   - Retorna `{ oidcEnabled: bool, localAuthEnabled: bool, providerName: string }`.
2. **`GET /api/auth/login`** (Anônimo):
   - Dispara `Challenge(OpenIdConnectDefaults.AuthenticationScheme)`.
3. **`POST /api/auth/local`** (Anônimo):
   - Payload: `{ email: string, password: string }`.
   - Retorna 200 OK com dados do usuário ou 401 Unauthorized com mensagem amigável.
4. **`GET /api/auth/me`** (Autorizado):
   - Retorna perfil do usuário logado: `{ id, email, displayName, isRoot, workspaces: [{ id, name, role }] }`.
5. **`POST /api/auth/logout`** (Autorizado):
   - Executa `SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme)`.

---

### 4.6 Frontend (Next.js 15)

1. **Página de Login (`src/app/login/page.tsx`)**:
   - Componente visual com layout centrado e tema escuro consistente.
   - Seção superior: Botão "Entrar com SSO" (redireciona para `/api/auth/login`).
   - Divisor "ou continue com credenciais locais".
   - Seção inferior: Formulário de e-mail e senha locais chamando `POST /api/auth/local`.
   - Mensagens de erro claras para credenciais inválidas.
2. **Store de Autenticação (`src/stores/useAuthStore.ts`)**:
   - Guarda o estado `user`, `isLoading`, `isAuthenticated`.
   - Método `checkAuth()` que consulta `/api/auth/me`.
   - Método `logout()` que dispara `/api/auth/logout` e redireciona para `/login`.
3. **Proteção de Rotas e Redirecionamentos**:
   - O layout raiz e o workspace layout verificam o estado de autenticação. Se a API responder 401, redireciona imediatamente para `/login`.
   - Se usuário autenticado tentar acessar `/login`, redireciona para `/`.
4. **Interface do Usuário no Header (`AppHeader.tsx`)**:
   - Exibe menu com nome/avatar do usuário autenticado no canto superior direito.
   - Badge indicando a Role no Workspace ativo (`Owner`, `Admin`, `Member`).
   - Ação de "Sair" (Logout).

---

## 5. Variáveis de Configuração

| Variável | Padrão | Descrição |
|---|---|---|
| `APIDOT_AUTH_ENABLED` | `true` | Se `false`, ativa bypass para modo dev/testes |
| `APIDOT_ROOT_EMAIL` | `contato@hmedeiros.dev` | E-mail do usuário root local e âncora de unificação |
| `APIDOT_ROOT_PASSWORD` | *(Obrigatório para login local)* | Senha do usuário root para login local |
| `OIDC_AUTHORITY` | `""` | URL base do IdP (ex.: `https://auth.hmedeiros.dev/application/o/apidot/`) |
| `OIDC_CLIENT_ID` | `""` | Client ID registrado no Authentik |
| `OIDC_CLIENT_SECRET` | `""` | Client Secret registrado no Authentik |
| `OIDC_SCOPES` | `openid profile email` | Escopos solicitados na autorização |

---

## 6. O que Fica a Critério do Implementador (Builder Decisions)
- O algoritmo exato de hash de senha (recomendado PBKDF2 com `Rfc2898DeriveBytes`).
- Os tempos de expiração do cookie de sessão (sugestão: 7 dias com sliding expiration).
- A estilização fina dos componentes de UI na página `/login` e no menu de usuário em `AppHeader.tsx`, mantendo estrita harmonia com as classes Tailwind e o tema escuro existente.
