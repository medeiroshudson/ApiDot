# Padronização de Endpoints e Composição do Program.cs - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o backend do ApiDot extraindo mais de 2.100 linhas do `Program.cs` para classes modulares em `Endpoints/`, serviços dedicados de infraestrutura em `Services/` e `Security/`, migrations formais do EF Core em `Migrations/`, e extensões de composição fluente no `Program.cs`.

**Architecture:** A aplicação adota o padrão de Minimal APIs com métodos de extensão para registro de rotas por agregado de domínio (`WorkspaceEndpoints`, `CollectionEndpoints`, etc.). A lógica pesada de transporte WebSocket, validação anti-SSRF, streaming de OpenAPI e recursão de árvore é encapsulada em serviços injetados via DI. A persistência elimina DDL manual através de `db.Database.Migrate()` com EF Core Migrations.

**Tech Stack:** C# 13, .NET 9, ASP.NET Core Minimal APIs, Entity Framework Core 9.0.2, SQLite, xUnit.

**Spec:** `docs/plans/2026-10-27-backend-endpoints-and-composition-refactor-design.md`

## Global Constraints
- Target Framework: `net9.0` com C# 13 e `Nullable` habilitado em todos os projetos.
- Nenhuma alteração em contratos de API externos (rotas, payloads JSON, query params, headers e status codes permanecem idênticos).
- Sem métodos estáticos artificiais de compatibilidade ("gambiarras") no `Program.cs`: apenas `public partial class Program { }` para `WebApplicationFactory<Program>`.
- Todos os testes existentes que chamavam utilitários via `Program.*` devem ser atualizados diretamente para as novas classes especializadas.
- 100% dos ~440 testes existentes na suíte (`ApiDot.Core.Tests`, `ApiDot.Agent.Tests`, `ApiDot.Server.Tests`, `ApiDot.E2E.Tests`) devem passar após a conclusão.

## Review Focus
1. **Regressão no Protocolo WebSocket `/ws/agent`:** Perda de pacotes, estouro de buffer (limite de 16MB) ou deadlock no lock de envio `agent.SendLock` após extração do handler.
2. **Falha na Execução de Migrations SQLite em Inicialização:** Erro de sintaxe SQL ou falha na criação de tabelas e índices únicos (`TokenHash`, variáveis globais e scoped) no `db.Database.Migrate()`.
3. **Quebra de Validação Anti-SSRF:** Regressão na resolução de IPs de loopback, ranges de metadados de nuvem (`169.254.x.x`) ou IPv6 mapeados para IPv4 no `SpecUrlValidator`.
4. **Ciclo Infinito em Hierarquia de Pastas:** Falha de detecção de ciclo ou overflow de pilha ao montar árvores de workspaces com pastas recursivas no `WorkspaceTreeBuilder`.
5. **Comportamento de Injeção de Dependência:** Falta de registro de singleton ou scoped em `ServiceCollectionExtensions` resultando em `InvalidOperationException` em runtime ao resolver endpoints.

---

### Task 1: Entity Framework Core Migrations & Database Initialization

**Files:**
- Modify: `backend/src/ApiDot.Server/ApiDot.Server.csproj`
- Create: `backend/src/ApiDot.Server/Migrations/20261027000000_InitialCreate.cs`
- Create: `backend/src/ApiDot.Server/Migrations/ApiDotDbContextModelSnapshot.cs`
- Create: `backend/src/ApiDot.Server/Extensions/DatabaseExtensions.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Data/DbContextPersistenceTests.cs`

**Interfaces:**
- Consumes: `ApiDotDbContext` com todas as entidades existentes (`Workspace`, `Collection`, `Folder`, `RequestItem`, `EnvironmentVariable`, `ExecutionHistory`, `AgentDevice`).
- Produces: `DatabaseExtensions.ApplyDatabaseMigrations(this IHost app)`.

- [ ] **Step 1: Adicionar pacote `Microsoft.EntityFrameworkCore.Design` no `ApiDot.Server.csproj`**

Adicionar `<PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="9.0.2">` com `<PrivateAssets>all</PrivateAssets>` em `backend/src/ApiDot.Server/ApiDot.Server.csproj`.

- [ ] **Step 2: Gerar a Migration inicial `InitialCreate`**

Executar:
```bash
dotnet ef migrations add InitialCreate --project backend/src/ApiDot.Server/ApiDot.Server.csproj --startup-project backend/src/ApiDot.Server/ApiDot.Server.csproj --output-dir Migrations
```
Verificar que os arquivos de migration e o snapshot do modelo foram gerados em `backend/src/ApiDot.Server/Migrations/`.

- [ ] **Step 3: Criar `DatabaseExtensions.cs` com método de inicialização**

Criar `backend/src/ApiDot.Server/Extensions/DatabaseExtensions.cs`:
```csharp
namespace ApiDot.Server.Extensions;

public static class DatabaseExtensions
{
    public static IHost ApplyDatabaseMigrations(this IHost app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.Migrate();
        return app;
    }
}
```

- [ ] **Step 4: Executar testes de persistência do banco de dados**

Executar: `dotnet test backend/tests/ApiDot.Server.Tests/ --filter DbContextPersistenceTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/ApiDot.Server.csproj backend/src/ApiDot.Server/Migrations/ backend/src/ApiDot.Server/Extensions/DatabaseExtensions.cs
git commit -m "feat(backend): add EF Core migrations and DatabaseExtensions"
```

---

### Task 2: Extração dos Serviços de Segurança e Download de Especificações (SSRF & SpecFetcher)

**Files:**
- Create: `backend/src/ApiDot.Server/Security/SpecUrlValidator.cs`
- Create: `backend/src/ApiDot.Server/Services/ISpecFetcherService.cs`
- Create: `backend/src/ApiDot.Server/Services/SpecFetcherService.cs`
- Modify: `backend/tests/ApiDot.Server.Tests/Security/SpecUrlValidatorTests.cs`
- Modify: `backend/tests/ApiDot.E2E.Tests/CollectionSyncEndpointsTests.cs:506`

**Interfaces:**
- Produces: 
  - `SpecUrlValidator.IsSafeSpecUrl(string? url, out Uri? validUri) -> bool`
  - `ISpecFetcherService.MaxSpecSizeBytes -> long` (10MB)
  - `ISpecFetcherService.FetchSpecFromUrlAsync(Uri uri, CancellationToken cancellationToken) -> Task<(bool Success, string? Content, string? ErrorMessage)>`

- [ ] **Step 1: Criar `SpecUrlValidator.cs`**

Extrair a lógica de validação anti-SSRF do `Program.cs` para `backend/src/ApiDot.Server/Security/SpecUrlValidator.cs`:
- Validação de comprimento <= 2048 caracteres.
- Esquema HTTP/HTTPS absoluto.
- Bloqueio de loopback (`127.0.0.1`, `::1`), `localhost`, `*.localhost`, `metadata.google.internal`.
- Bloqueio de ranges link-local/site-local e ranges privados (`169.254.x.x`).
- Tratamento de IPv6 e IPv4-mapped IPv6.

- [ ] **Step 2: Criar `ISpecFetcherService.cs` e `SpecFetcherService.cs`**

Criar contrato e implementação em `backend/src/ApiDot.Server/Services/`:
- Constante pública `MaxSpecSizeBytes = 10 * 1024 * 1024` (10MB).
- Injeção de `IHttpClientFactory`.
- Uso do client nomeado `"SpecFetcher"`.
- Leitura em streaming com buffer de 80KB e verificação estrita do limite de 10MB.
- Retorno de tupla `(bool Success, string? Content, string? ErrorMessage)`.

- [ ] **Step 3: Atualizar os testes para referenciar as novas classes canônicas**

- Em `backend/tests/ApiDot.Server.Tests/Security/SpecUrlValidatorTests.cs`:
  - Substituir todas as chamadas `Program.IsSafeSpecUrl` por `SpecUrlValidator.IsSafeSpecUrl`.
- Em `backend/tests/ApiDot.E2E.Tests/CollectionSyncEndpointsTests.cs`:
  - Na linha 506, substituir `Program.MaxSpecSizeBytes` por `SpecFetcherService.MaxSpecSizeBytes`.

- [ ] **Step 4: Executar testes de validação de URL e sincronização**

Executar: `dotnet test backend/tests/ApiDot.Server.Tests/ --filter SpecUrlValidatorTests`
Expected: PASS (todos os 7 testes de SSRF passando diretamente via `SpecUrlValidator`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Security/SpecUrlValidator.cs backend/src/ApiDot.Server/Services/ISpecFetcherService.cs backend/src/ApiDot.Server/Services/SpecFetcherService.cs backend/tests/ApiDot.Server.Tests/Security/SpecUrlValidatorTests.cs backend/tests/ApiDot.E2E.Tests/CollectionSyncEndpointsTests.cs
git commit -m "refactor(backend): extract SpecUrlValidator and SpecFetcherService"
```

---

### Task 3: Extração do Serviço Construtor de Árvore (WorkspaceTreeBuilder)

**Files:**
- Create: `backend/src/ApiDot.Server/Services/IWorkspaceTreeBuilder.cs`
- Create: `backend/src/ApiDot.Server/Services/WorkspaceTreeBuilder.cs`
- Create: `backend/tests/ApiDot.Server.Tests/Services/WorkspaceTreeBuilderTests.cs`

**Interfaces:**
- Produces:
  - `IWorkspaceTreeBuilder.BuildCollectionNode(Collection col, IReadOnlyList<Folder> allFolders, IReadOnlyList<RequestItem> allRequests) -> CollectionNodeDto`
  - `IWorkspaceTreeBuilder.BuildFolderNode(Folder folder, IReadOnlyList<Folder> allFolders, IReadOnlyList<RequestItem> allRequests) -> FolderNodeDto`
  - `IWorkspaceTreeBuilder.ToRequestNode(RequestItem r) -> RequestItemNodeDto`

- [ ] **Step 1: Criar teste unitário para `WorkspaceTreeBuilder`**

Criar `backend/tests/ApiDot.Server.Tests/Services/WorkspaceTreeBuilderTests.cs` cobrindo:
- Construção de árvore hierárquica com coleções, subpastas aninhadas e requisições diretas.
- Ordenação alfabética por nome (`StringComparer.OrdinalIgnoreCase`).
- Detecção e prevenção de loops cíclicos em pastas aninhadas.

- [ ] **Step 2: Executar teste para verificar falha (Red)**

Executar: `dotnet test backend/tests/ApiDot.Server.Tests/ --filter WorkspaceTreeBuilderTests`
Expected: FAIL (tipos não encontrados).

- [ ] **Step 3: Criar `IWorkspaceTreeBuilder.cs` e `WorkspaceTreeBuilder.cs`**

Extrair a lógica de construção e travessia de nós de `Program.cs` para `backend/src/ApiDot.Server/Services/WorkspaceTreeBuilder.cs`:
- Utilização de `ILookup<Guid, Folder>` e `ILookup<Guid, RequestItem>` para indexação rápida em memória.
- Travessia com `HashSet<Guid> visited` para prevenção de recursão infinita.
- Mapeamento de DTOs `CollectionNodeDto`, `FolderNodeDto` e `RequestItemNodeDto`.

- [ ] **Step 4: Executar teste para verificar aprovação (Green)**

Executar: `dotnet test backend/tests/ApiDot.Server.Tests/ --filter WorkspaceTreeBuilderTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Services/IWorkspaceTreeBuilder.cs backend/src/ApiDot.Server/Services/WorkspaceTreeBuilder.cs backend/tests/ApiDot.Server.Tests/Services/WorkspaceTreeBuilderTests.cs
git commit -m "feat(backend): extract WorkspaceTreeBuilder with unit tests"
```

---

### Task 4: Extração do Manipulador de WebSocket de Agents (AgentWebSocketHandler & Endpoints)

**Files:**
- Create: `backend/src/ApiDot.Server/Services/IAgentWebSocketHandler.cs`
- Create: `backend/src/ApiDot.Server/Services/AgentWebSocketHandler.cs`
- Create: `backend/src/ApiDot.Server/Endpoints/AgentWebSocketEndpoints.cs`
- Test: `backend/tests/ApiDot.Server.Tests/WebSockets/AgentWebSocketAuthTests.cs`

**Interfaces:**
- Consumes: `IAgentHub`, `IServiceScopeFactory`, `ApiDotDbContext`.
- Produces: 
  - `IAgentWebSocketHandler.HandleAsync(HttpContext context) -> Task<IResult>`
  - `AgentWebSocketEndpoints.MapAgentWebSocketEndpoints(this IEndpointRouteBuilder app) -> IEndpointRouteBuilder`

- [ ] **Step 1: Criar `IAgentWebSocketHandler.cs` e `AgentWebSocketHandler.cs`**

Extrair a implementação completa do WebSocket de `Program.cs` (linhas 89-353) para `backend/src/ApiDot.Server/Services/AgentWebSocketHandler.cs`:
- Checagem `context.WebSockets.IsWebSocketRequest` (retorna 400 Bad Request se falso).
- Validação e hash SHA256 do query param `token`. Rejeição com close status `PolicyViolation` se token ausente, não encontrado ou revogado.
- Captura de metadados de telemetria (`LastConnectedHostname`, `LastConnectedOs`, `AgentVersion`, `LastConnectedIp`, `LastConnectedAtUtc`) e persistência no banco.
- `agentHub.RegisterAgent(deviceId, agentName, webSocket)`.
- Loop de leitura em streaming até 16MB por mensagem (`WebSocketCloseStatus.MessageTooBig` caso excedido).
- Resposta a frames JSON: `heartbeat`, `pong`, `ping` (envio thread-safe com `agent.SendLock`) e `HttpResponsePayload` para `agentHub.TryCompleteDispatch`.
- Desregistro garantido no `finally` com `agentHub.UnregisterAgent(deviceId, webSocket)`.

- [ ] **Step 2: Criar `AgentWebSocketEndpoints.cs`**

Criar `backend/src/ApiDot.Server/Endpoints/AgentWebSocketEndpoints.cs`:
```csharp
namespace ApiDot.Server.Endpoints;

public static class AgentWebSocketEndpoints
{
    public static IEndpointRouteBuilder MapAgentWebSocketEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapMethods("/ws/agent", ["GET"], async (
            HttpContext context,
            IAgentWebSocketHandler handler) =>
        {
            return await handler.HandleAsync(context);
        });

        return app;
    }
}
```

- [ ] **Step 3: Compilar e verificar integridade estática**

Executar: `dotnet build backend/src/ApiDot.Server/`
Expected: Build succeeded.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ApiDot.Server/Services/IAgentWebSocketHandler.cs backend/src/ApiDot.Server/Services/AgentWebSocketHandler.cs backend/src/ApiDot.Server/Endpoints/AgentWebSocketEndpoints.cs
git commit -m "feat(backend): extract AgentWebSocketHandler and AgentWebSocketEndpoints"
```

---

### Task 5: Extração dos Endpoints de Workspace e Pastas (WorkspaceEndpoints & FolderEndpoints)

**Files:**
- Create: `backend/src/ApiDot.Server/Endpoints/WorkspaceEndpoints.cs`
- Create: `backend/src/ApiDot.Server/Endpoints/FolderEndpoints.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceEndpointsTests.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceTreeEndpointsTests.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/FolderEndpointsTests.cs`
- Test: `backend/tests/ApiDot.E2E.Tests/VariableEndpointsTests.cs`

**Interfaces:**
- Consumes: `ApiDotDbContext`, `IWorkspaceTreeBuilder`, `IVariableResolver`.
- Produces:
  - `WorkspaceEndpoints.MapWorkspaceEndpoints(this IEndpointRouteBuilder app) -> IEndpointRouteBuilder`
  - `FolderEndpoints.MapFolderEndpoints(this IEndpointRouteBuilder app) -> IEndpointRouteBuilder`

- [ ] **Step 1: Criar `WorkspaceEndpoints.cs`**

Extrair de `Program.cs` para `backend/src/ApiDot.Server/Endpoints/WorkspaceEndpoints.cs`:
- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/{id:guid}/tree` (utilizando `IWorkspaceTreeBuilder`)
- `GET /api/workspaces/{id:guid}/variables`
- `PUT /api/workspaces/{id:guid}/variables` (validações de escopo Global/Collection/Environment, deduplicação e persistência)
- `POST /api/workspaces/{id:guid}/variables/resolve`

- [ ] **Step 2: Criar `FolderEndpoints.cs`**

Extrair de `Program.cs` para `backend/src/ApiDot.Server/Endpoints/FolderEndpoints.cs`:
- `POST /api/folders`
- `PUT /api/folders/{id:guid}` (validação de descendência cíclica e integridade de collection/workspace)
- `DELETE /api/folders/{id:guid}` (utilizando `IWorkspaceTreeBuilder` para retorno do nó)

- [ ] **Step 3: Compilar o projeto**

Executar: `dotnet build backend/src/ApiDot.Server/`
Expected: Build succeeded.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ApiDot.Server/Endpoints/WorkspaceEndpoints.cs backend/src/ApiDot.Server/Endpoints/FolderEndpoints.cs
git commit -m "feat(backend): extract WorkspaceEndpoints and FolderEndpoints"
```

---

### Task 6: Extração dos Endpoints de Coleções, Requisições e Saúde (Collection, RequestItem & Health)

**Files:**
- Create: `backend/src/ApiDot.Server/Endpoints/HealthEndpoints.cs`
- Create: `backend/src/ApiDot.Server/Endpoints/CollectionEndpoints.cs`
- Create: `backend/src/ApiDot.Server/Endpoints/RequestItemEndpoints.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/CollectionEndpointsTests.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/RequestItemEndpointsTests.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/HealthcheckEndpointTests.cs`
- Test: `backend/tests/ApiDot.E2E.Tests/CollectionOpenApiEndpointsTests.cs`
- Test: `backend/tests/ApiDot.E2E.Tests/CollectionSyncEndpointsTests.cs`
- Test: `backend/tests/ApiDot.E2E.Tests/FullExecutionFlowTests.cs`

**Interfaces:**
- Consumes: `ApiDotDbContext`, `ISpecImportStrategy`, `ICollectionMerger`, `ISpecFetcherService`, `IWorkspaceTreeBuilder`, `ITargetResolver`, `IServerHttpExecutor`, `IAgentHub`, `IVariableInterpolator`, `IVariableResolver`, `IResponseHistoryProvider`.
- Produces:
  - `HealthEndpoints.MapHealthEndpoints(this IEndpointRouteBuilder app) -> IEndpointRouteBuilder`
  - `CollectionEndpoints.MapCollectionEndpoints(this IEndpointRouteBuilder app) -> IEndpointRouteBuilder`
  - `RequestItemEndpoints.MapRequestItemEndpoints(this IEndpointRouteBuilder app) -> IEndpointRouteBuilder`

- [ ] **Step 1: Criar `HealthEndpoints.cs`**

Criar `backend/src/ApiDot.Server/Endpoints/HealthEndpoints.cs` mapeando:
- `GET /health` retornando status `"Healthy"`, versão normalizada da aplicação e timestamp UTC.

- [ ] **Step 2: Criar `CollectionEndpoints.cs`**

Extrair de `Program.cs` para `backend/src/ApiDot.Server/Endpoints/CollectionEndpoints.cs`:
- `POST /api/collections`
- `PUT /api/collections/{id:guid}`
- `DELETE /api/collections/{id:guid}`
- `GET /api/collections/{id:guid}/openapi`
- `PUT /api/collections/{id:guid}/openapi`
- `POST /api/collections/{id:guid}/sync` (usando `ISpecFetcherService` e `SpecUrlValidator`)
- `POST /api/collections/import-openapi` (usando `ISpecFetcherService` e `SpecUrlValidator`)

- [ ] **Step 3: Criar `RequestItemEndpoints.cs`**

Extrair de `Program.cs` para `backend/src/ApiDot.Server/Endpoints/RequestItemEndpoints.cs`:
- `POST /api/requests`
- `GET /api/requests/{id:guid}`
- `PUT /api/requests/{id:guid}`
- `POST /api/requests/{id:guid}/duplicate`
- `DELETE /api/requests/{id:guid}`
- `POST /api/requests/execute` (orquestração completa com variáveis resolvidas, interpolação, roteamento por alvo Server ou Agent via header `X-Device-Id` e gravação de histórico).

- [ ] **Step 4: Compilar o projeto**

Executar: `dotnet build backend/src/ApiDot.Server/`
Expected: Build succeeded.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Endpoints/HealthEndpoints.cs backend/src/ApiDot.Server/Endpoints/CollectionEndpoints.cs backend/src/ApiDot.Server/Endpoints/RequestItemEndpoints.cs
git commit -m "feat(backend): extract HealthEndpoints, CollectionEndpoints and RequestItemEndpoints"
```

---

### Task 7: Composição do Program.cs, Extensões de Injeção de Dependência e Validação Total

**Files:**
- Create: `backend/src/ApiDot.Server/Extensions/ServiceCollectionExtensions.cs`
- Create: `backend/src/ApiDot.Server/Extensions/EndpointRouteBuilderExtensions.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`

**Interfaces:**
- Produces:
  - `ServiceCollectionExtensions.AddServerDatabase(this IServiceCollection services, IConfiguration configuration)`
  - `ServiceCollectionExtensions.AddServerServices(this IServiceCollection services, IConfiguration configuration)`
  - `ServiceCollectionExtensions.AddServerHttpClients(this IServiceCollection services)`
  - `EndpointRouteBuilderExtensions.MapApiEndpoints(this IEndpointRouteBuilder app)`
  - `public partial class Program { }`

- [ ] **Step 1: Criar `ServiceCollectionExtensions.cs`**

Criar `backend/src/ApiDot.Server/Extensions/ServiceCollectionExtensions.cs`:
- `AddServerDatabase`: registro do `ApiDotDbContext` com SQLite.
- `AddServerServices`: registro de todos os serviços de domínio e infraestrutura (`ITargetResolver`, `InMemoryResponseHistoryProvider`, `IVariableInterpolator`, `IVariableResolver`, `IAgentHub`, `ISpecImportStrategy`, `ICollectionMerger`, `IWorkspaceTreeBuilder`, `ISpecFetcherService`, `IAgentWebSocketHandler`).
- `AddServerHttpClients`: registro de `IServerHttpExecutor`, `HttpClient` e client `"SpecFetcher"` (timeout 15s, sem auto-redirect).

- [ ] **Step 2: Criar `EndpointRouteBuilderExtensions.cs`**

Criar `backend/src/ApiDot.Server/Extensions/EndpointRouteBuilderExtensions.cs`:
```csharp
namespace ApiDot.Server.Extensions;

public static class EndpointRouteBuilderExtensions
{
    public static IEndpointRouteBuilder MapApiEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapHealthEndpoints();
        app.MapAgentDeviceEndpoints();
        app.MapInstallScriptEndpoints();
        app.MapAgentWebSocketEndpoints();
        app.MapWorkspaceEndpoints();
        app.MapCollectionEndpoints();
        app.MapFolderEndpoints();
        app.MapRequestItemEndpoints();
        return app;
    }
}
```

- [ ] **Step 3: Refatorar `Program.cs` para composição limpa de ~35 linhas**

Substituir o conteúdo de `backend/src/ApiDot.Server/Program.cs` por:
```csharp
using System.Text.Json.Serialization;
using ApiDot.Server.Extensions;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddServerDatabase(builder.Configuration);
builder.Services.AddServerServices(builder.Configuration);
builder.Services.AddServerHttpClients();

var app = builder.Build();

app.ApplyDatabaseMigrations();

app.UseExceptionHandler();
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(15)
});

app.MapApiEndpoints();

app.Run();

public partial class Program { }
```

- [ ] **Step 4: Executar a suíte completa de testes da aplicação**

Executar: `dotnet test backend/`
Expected: 100% dos testes passando em todos os 4 projetos (`ApiDot.Core.Tests`, `ApiDot.Agent.Tests`, `ApiDot.Server.Tests`, `ApiDot.E2E.Tests`). Zero falhas.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Extensions/ServiceCollectionExtensions.cs backend/src/ApiDot.Server/Extensions/EndpointRouteBuilderExtensions.cs backend/src/ApiDot.Server/Program.cs
git commit -m "refactor(backend): clean Program.cs composition and fluent extension methods"
```
