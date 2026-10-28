# Design Técnico: Padronização de Endpoints e Reorganização da Composição do Backend

**Data:** 2026-10-27  
**Status:** Aguardando Aprovação de Hudson Medeiros  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Backend (.NET 9 / ASP.NET Core Minimal APIs / Entity Framework Core / SQLite)

---

## 1. Intenção e Motivação (The Why)

Atualmente no ApiDot:
1. **Monolito no `Program.cs`:** O arquivo `backend/src/ApiDot.Server/Program.cs` atingiu mais de 2.160 linhas de código. Ele concentra todas as rotas REST de Workspaces, Coleções, Pastas, Requisições e Execução, a rota WebSocket `/ws/agent`, rotinas manuais de DDL SQLite (`ExecuteSqlRaw`), validações de segurança contra SSRF, download em streaming de OpenAPI e algoritmos recursivos de construção de árvore de nós.
2. **Falta de Padronização na Pasta `Endpoints/`:** Embora existam `AgentDeviceEndpoints.cs` e `InstallScriptEndpoints.cs` na pasta `Endpoints/`, todas as demais rotas da aplicação continuam declaradas diretamente no `Program.cs`.
3. **Fragilidade na Manutenção e Testabilidade:** A ausência de separação entre o pipeline HTTP e a lógica de infraestrutura (como o ciclo de conexões WebSocket e validação de URLs) dificulta testes unitários isolados e polui a composição inicial da aplicação.
4. **Acoplamento de DDL Manual com EF Core:** A tabela `AgentDevices` foi adicionada com comandos SQL manuais no `Program.cs` porque `EnsureCreated()` não aplica alterações em bancos SQLite já existentes.

Este projeto estabelece:
- A migração formal para **EF Core Migrations**, eliminando qualquer DDL manual do código.
- A extração das rotas para classes estáticas de endpoint dedicadas dentro da pasta `Endpoints/`.
- A extração da lógica de infraestrutura (WebSocket de Agents, Validador SSRF, Fetcher de OpenAPI e Construtor de Árvore) para serviços dedicados em `Services/` e `Security/`.
- A reorganização da composição do `Program.cs` utilizando métodos de extensão limpos (`AddServerDatabase`, `AddServerServices`, `AddServerHttpClients`, `MapApiEndpoints`, `ApplyDatabaseMigrations`), reduzindo o `Program.cs` a ~35 linhas de composição puramente declarativa.
- **Refatoração Canônica dos Testes:** Atualização direta dos testes que referenciavam membros internos de `Program` para apontar para suas classes especializadas (`SpecUrlValidator`, `SpecFetcherService`, `WorkspaceTreeBuilder`), eliminando fachadas e métodos de delegação artificiais.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Padronização das Rotas em `Endpoints/`:**
  - `WorkspaceEndpoints`: Mapeia `/api/workspaces`, `/api/workspaces/{id}/tree`, `/api/workspaces/{id}/variables` e `/api/workspaces/{id}/variables/resolve`.
  - `CollectionEndpoints`: Mapeia `/api/collections` (CRUD), `/api/collections/{id}/openapi`, `/api/collections/{id}/sync` e `/api/collections/import-openapi`.
  - `FolderEndpoints`: Mapeia `/api/folders` (CRUD com validação de ciclo e hierarquia).
  - `RequestItemEndpoints`: Mapeia `/api/requests` (CRUD, duplicate) e `/api/requests/execute`.
  - `AgentWebSocketEndpoints`: Mapeia `/ws/agent` delegando para o manipulador de infraestrutura.
  - `HealthEndpoints`: Mapeia `/health`.
- **Serviços de Infraestrutura Dedicados:**
  - `AgentWebSocketHandler`: Gerencia autenticação de token, registro de agent, loop de leitura de pacotes WebSocket, heartbeat/ping/pong e resposta de dispatches.
  - `SpecUrlValidator`: Isolamento da validação de segurança anti-SSRF (IPs privados, loopback, link-local, metadados).
  - `SpecFetcherService`: Download controlado de especificações OpenAPI com timeout, cabeçalhos e teto de tamanho (10MB).
  - `WorkspaceTreeBuilder`: Algoritmos recursivos de montagem da árvore de nós (`WorkspaceTreeDto`, `CollectionNodeDto`, `FolderNodeDto`).
- **Entity Framework Core Migrations:**
  - Adição do pacote `Microsoft.EntityFrameworkCore.Design` (9.0.2).
  - Criação da migration inicial `InitialCreate` cobrindo o modelo completo (Workspaces, Collections, Folders, RequestItems, EnvironmentVariables, ExecutionHistories, AgentDevices).
  - Remoção do DDL manual `CREATE TABLE IF NOT EXISTS AgentDevices`.
  - Extension `app.ApplyDatabaseMigrations()` executando `db.Database.Migrate()` na inicialização do servidor.
- **Composição Limpa no `Program.cs`:**
  - Composição fluente dividida em extensions (`ServiceCollectionExtensions.cs`, `EndpointRouteBuilderExtensions.cs`, `DatabaseExtensions.cs`).
  - `Program.cs` conciso, declarativo e legível.
- **Estabilidade da Suíte de Testes:**
  - 100% dos ~440 testes existentes continuam passando sem modificações que quebrem contratos.

### 2.2. Não-Metas (Non-Goals)
- Não alterar contratos de API REST existentes (URLs, payloads JSON, status HTTP e regras de validação permanecem idênticos).
- Não alterar os schemas das tabelas do banco de dados (o modelo do `ApiDotDbContext` já está correto).
- Não alterar o frontend ou o cliente `ApiDot.Agent`.

### 2.3. Anti-Metas (Anti-Goals)
- **Quebrar testes de integração:** Testes que utilizam `WebApplicationFactory<Program>` ou invocam `Program.IsSafeSpecUrl` e `Program.MaxSpecSizeBytes` não devem ser quebrados.
- **Regressão de concorrência no WebSocket:** A sincronização de locks de envio (`agent.SendLock`) e tratamento de exceções de encerramento do socket devem ser preservados exatamente como no código original.
- **Overengineering:** Evitar camadas desnecessárias (ex.: repositórios genéricos desnecessários para operações simples do DbContext ou DTOs intermediários supérfluos).

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Composição Modular com Serviços de Infraestrutura e EF Core Migrations (Escolhida)
- **Estrutura:**
  - `backend/src/ApiDot.Server/Endpoints/`: Classes estáticas de mapeamento por recurso.
  - `backend/src/ApiDot.Server/Services/`: `AgentWebSocketHandler`, `WorkspaceTreeBuilder`, `SpecFetcherService`.
  - `backend/src/ApiDot.Server/Security/`: `SpecUrlValidator`.
  - `backend/src/ApiDot.Server/Extensions/`: `ServiceCollectionExtensions`, `EndpointRouteBuilderExtensions`, `DatabaseExtensions`.
  - `backend/src/ApiDot.Server/Migrations/`: Migrations formais do EF Core.
- **Vantagens:** Separação limpa de responsabilidades, alta testabilidade, remoção total de DDL manual, código expressivo e de fácil manutenção.
- **Trade-off:** Exige a introdução controlada de novas classes de serviço e bridges de compatibilidade em `Program`.

### Abordagem 2: Agrupamento Direto em Endpoints com Extension de Banco Simples (Descartada)
- **Estrutura:** Apenas move os blocos de código do `Program.cs` para arquivos em `Endpoints/` sem extrair os serviços de infraestrutura (WebSocket e SSRF dentro dos endpoints).
- **Motivo do Descarte:** Mantém alto acoplamento entre a camada HTTP e detalhes de transporte/rede/segurança, dificultando a evolução futura.

---

## 4. Detalhamento Arquitetural

### 4.0. Diretrizes Canônicas de Implementação

Com base nas decisões de Hudson Medeiros:
1. **Migrations Canônicas do EF Core (Sem baselining artificial):**
   - Não serão utilizadas rotinas paliativas de baselining em runtime. O método de extensão `ApplyDatabaseMigrations()` executa de forma limpa e direta:
     ```csharp
     using var scope = app.Services.CreateScope();
     var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
     db.Database.Migrate();
     ```
   - O arquivo local `apidot.db` pré-existente sem histórico de migrations pode ser descartado/recriado sem restrições.
2. **Arquitetura Limpa nos Testes (Sem shims ou métodos de fachada no Program):**
   - `partial class Program` conterá unicamente a declaração `public partial class Program { }` necessária para o `WebApplicationFactory<Program>` dos testes de integração.
   - Todas as chamadas diretas existentes nos testes serão atualizadas para consumir os novos serviços canônicos:
     - `Program.IsSafeSpecUrl` -> `SpecUrlValidator.IsSafeSpecUrl`
     - `Program.MaxSpecSizeBytes` -> `SpecFetcherService.MaxSpecSizeBytes`
     - `Program.BuildFolderNodeDto` / `BuildCollectionNodeDto` -> `WorkspaceTreeBuilder.*`

---

### 4.1. Estrutura de Diretórios Proposta

```
backend/src/ApiDot.Server/
├── Data/
│   ├── Entities/
│   └── ApiDotDbContext.cs
├── Migrations/
│   └── 20261027000000_InitialCreate.cs
├── Endpoints/
│   ├── AgentDeviceEndpoints.cs     (já existente)
│   ├── InstallScriptEndpoints.cs   (já existente)
│   ├── HealthEndpoints.cs          (novo)
│   ├── WorkspaceEndpoints.cs       (novo)
│   ├── CollectionEndpoints.cs      (novo)
│   ├── FolderEndpoints.cs          (novo)
│   ├── RequestItemEndpoints.cs     (novo)
│   └── AgentWebSocketEndpoints.cs  (novo)
├── Services/
│   ├── IAgentWebSocketHandler.cs   (novo)
│   ├── AgentWebSocketHandler.cs    (novo)
│   ├── IWorkspaceTreeBuilder.cs    (novo)
│   ├── WorkspaceTreeBuilder.cs     (novo)
│   ├── ISpecFetcherService.cs      (novo)
│   └── SpecFetcherService.cs       (novo)
├── Security/
│   └── SpecUrlValidator.cs         (novo)
├── Extensions/
│   ├── ServiceCollectionExtensions.cs    (novo)
│   ├── EndpointRouteBuilderExtensions.cs (novo)
│   └── DatabaseExtensions.cs             (novo)
└── Program.cs                      (reestruturado e enxuto)
```

### 4.2. Infraestrutura e Serviços Extraídos

#### 4.2.1. Segurança contra SSRF: `SpecUrlValidator`
- Namespace: `ApiDot.Server.Security`
- Responsabilidade: Método `bool IsSafeSpecUrl(string? url, out Uri? validUri)`
- Valida comprimento, esquemas HTTP/HTTPS, loopback, nomes `localhost` / `metadata.google.internal`, ranges de IP privados (IPv4 e IPv6 link-local/site-local/mapped).

#### 4.2.2. Download de Especificações: `SpecFetcherService`
- Interface: `ISpecFetcherService`
- Responsabilidade:
  - Constante `MaxSpecSizeBytes = 10 * 1024 * 1024` (10MB).
  - Método `Task<(bool Success, string? Content, string? ErrorMessage)> FetchSpecFromUrlAsync(Uri uri, CancellationToken cancellationToken)`
  - Utiliza o client HTTP `"SpecFetcher"`, executa streaming com buffer de 80KB e interrompe caso exceda 10MB.

#### 4.2.3. Construtor de Árvore: `WorkspaceTreeBuilder`
- Interface: `IWorkspaceTreeBuilder`
- Responsabilidade:
  - `BuildCollectionNodeDto(Collection col, IReadOnlyList<Folder> allFolders, IReadOnlyList<RequestItem> allRequests)`
  - `BuildFolderNodeDto(Folder folder, IReadOnlyList<Folder> allFolders, IReadOnlyList<RequestItem> allRequests)`
  - `ToRequestItemNodeDto(RequestItem r)`
  - Prevenção de loops de ciclo com `HashSet<Guid> visited`.

#### 4.2.4. Manipulador de WebSocket: `AgentWebSocketHandler`
- Interface: `IAgentWebSocketHandler`
- Responsabilidade:
  - Método `Task HandleAsync(HttpContext context, CancellationToken cancellationToken)`
  - Valida handshake WebSocket e extrai o query parameter `token`.
  - Valida o token contra o banco `AgentDevices` (hash SHA256) e rejeita com `PolicyViolation` se inválido ou revogado.
  - Atualiza telemetria de conexão (`LastConnectedHostname`, `LastConnectedOs`, `AgentVersion`, `LastConnectedIp`, `LastConnectedAtUtc`).
  - Registra o socket no `IAgentHub`.
  - Processa loop de mensagens até 16MB por frame, respondendo a `ping`/`pong`, registrando latência em `heartbeat` e despachando respostas via `agentHub.TryCompleteDispatch`.
  - Desregistra o socket no encerramento no bloco `finally`.

### 4.3. Extensões de Composição

#### 4.3.1. `ServiceCollectionExtensions`
- `AddServerDatabase(this IServiceCollection services, IConfiguration configuration)`:
  - Configura `ApiDotDbContext` com SQLite (`DefaultConnection` ou `"Data Source=apidot.db;Foreign Keys=True"`).
- `AddServerServices(this IServiceCollection services, IConfiguration configuration)`:
  - Registra os serviços singletons e scoped: `ITargetResolver`, `InMemoryResponseHistoryProvider`, `IResponseHistoryProvider`, `IVariableInterpolator`, `IVariableResolver`, `IAgentHub`, `ISpecImportStrategy`, `ICollectionMerger`, `IWorkspaceTreeBuilder`, `ISpecFetcherService`, `IAgentWebSocketHandler`.
- `AddServerHttpClients(this IServiceCollection services)`:
  - Registra `IServerHttpExecutor` com `ServerHttpExecutor`, o `HttpClient` padrão e o client `"SpecFetcher"` com timeout de 15s e redirecionamento desabilitado.

#### 4.3.2. `DatabaseExtensions`
- `ApplyDatabaseMigrations(this IHost app)`:
  - Cria um escopo do provedor de serviços, recupera `ApiDotDbContext` e chama `dbContext.Database.Migrate()`.

#### 4.3.3. `EndpointRouteBuilderExtensions`
- `MapApiEndpoints(this IEndpointRouteBuilder app)`:
  - Encadeia as chamadas:
    ```csharp
    app.MapHealthEndpoints();
    app.MapAgentDeviceEndpoints();
    app.MapInstallScriptEndpoints();
    app.MapAgentWebSocketEndpoints();
    app.MapWorkspaceEndpoints();
    app.MapCollectionEndpoints();
    app.MapFolderEndpoints();
    app.MapRequestItemEndpoints();
    return app;
    ```

### 4.4. O Novo `Program.cs` e a Declaração para Testes de Integração

O arquivo principal `Program.cs` passa a ser estruturado em:

```csharp
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

// Necessário apenas para visibilidade do entrypoint pelo WebApplicationFactory<Program> nos testes
public partial class Program { }
```

### 4.5. Atualização Direta dos Testes Existentes

Os testes que anteriormente acessavam utilitários via `Program` serão atualizados para invocar diretamente as classes canônicas:
- `SpecUrlValidatorTests.cs`:
  - `Program.IsSafeSpecUrl(...)` ➔ `SpecUrlValidator.IsSafeSpecUrl(...)`
- `CollectionSyncEndpointsTests.cs`:
  - `Program.MaxSpecSizeBytes` ➔ `SpecFetcherService.MaxSpecSizeBytes`
- Classes de teste de integração que usam `WebApplicationFactory<Program>` continuam funcionando nativamente através do `public partial class Program { }`.

---

## 5. Estratégia de Testes e Validação

1. **Compilação e Verificação Estática:**
   - O projeto `ApiDot.Server` deve compilar com 0 erros e 0 warnings novos.
2. **Execução da Suíte Completa de Testes:**
   - Executar `dotnet test` a partir da raiz `backend/`:
     - `ApiDot.Core.Tests` (63 testes)
     - `ApiDot.Agent.Tests` (65 testes)
     - `ApiDot.Server.Tests` (254 testes)
     - `ApiDot.E2E.Tests` (58 testes)
     - Total: 440 testes devem passar sem nenhuma falha.
3. **Novos Testes Unitários de Serviços Extraídos:**
   - Testar `SpecUrlValidator` e `WorkspaceTreeBuilder` diretamente em testes unitários dedicados.
4. **Verificação de Migrations:**
   - Verificar se `dotnet ef migrations list` reconhece `InitialCreate` e se a inicialização aplica a migration sem erros no SQLite.
