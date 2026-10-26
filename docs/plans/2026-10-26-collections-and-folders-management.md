# Gestão de Coleções, Pastas e Requisições no ApiDot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o cadastro, organização hierárquica e gestão persistente de Coleções, Pastas e Requisições HTTP no ApiDot (.NET 9 Minimal APIs / EF Core e Next.js 15 / Tailwind CSS), permitindo que o usuário crie, edite inline, duplique, salve e exclua entidades diretamente na sidebar com menus de contexto e botão unificado "+ Novo".

**Architecture:** O backend expõe uma projeção unificada de árvore em `GET /api/workspaces/{id}/tree` via EF Core (`AsNoTracking`) e endpoints REST atômicos para mutações (Coleções, Pastas e Requisições). No frontend, o hook `useCollectionTree` consome a árvore e gerencia o estado da sidebar, enquanto o componente `CollectionTree` oferece busca textual instantânea, botão `+ Novo` sem chevron, menus de contexto acionados com botão direito (inclusive em área vazia), nós com edição inline (`InlineNodeInput`) e o modal `SaveRequestModal` para salvar requisições avulsas no `RequestEditor` via `Ctrl+S` / `Cmd+S`.

**Tech Stack:** .NET 9 Minimal APIs, C# 13, Entity Framework Core 9 (SQLite / PostgreSQL), FluentAssertions, xUnit, Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-26-collections-and-folders-management-design.md`

## Global Constraints

- Backend implementado em .NET 9 Minimal APIs em `backend/src/ApiDot.Server/Program.cs` e modelos em `backend/src/ApiDot.Server/Models/`.
- Frontend implementado com componentes funcionais React em TypeScript estrito em `frontend/src/`.
- Sem bibliotecas externas de UI pesadas; componentes de menu de contexto, árvore e modais utilizam React nativo e Tailwind CSS existente.
- A exclusão de Coleção ou Pasta deve executar deleção em cascata garantida pelo EF Core / SQLite Foreign Keys.
- Validação de entrada: Nomes não podem ser vazios ou conter apenas espaços em branco; limite de 200 caracteres para nomes e 2048 para URLs.
- Duplicação nesta fase restrita a requisições individuais (`RequestItem`), mantendo método, URL, headers e body, com nome sufixado por `" (Copy)"`.

## Review Focus

1. **Ciclo de dependência entre pastas (Folder self-parenting ou circular loop):** Ao atualizar o `ParentFolderId` de uma pasta para ela mesma ou para uma de suas subpastas descendentes, o backend deve rejeitar com `400 BadRequest` ("A folder cannot be its own parent or descendant").
2. **Exclusão da requisição atualmente em edição:** Ao excluir na sidebar a requisição que está ativa no `RequestEditor`, a interface deve resetar o editor para uma requisição nova/avulsa (scratchpad) sem falhar ou tentar salvar no ID deletado.
3. **Persistência de headers e body complexos na criação e salvamento:** JSONs de headers vazios (`"{}"`) e bodies nulos ou formatados devem ser preservados sem corrupção de escape ou `NullReferenceException`.
4. **Fechamento do Menu de Contexto ao redimensionar ou rolar a janela:** Menus de contexto flutuantes devem fechar imediatamente quando o usuário clica fora, pressiona `Esc` ou rola o container da árvore.
5. **Colisão de nomes ou caracteres especiais em edição inline:** Pressionar `Enter` com nome vazio não deve submeter a alteração; pressionar `Esc` deve descartar as alterações e restaurar o nome anterior.

---

### Task 1: Workspace Initialization & Tree Projection Endpoint

**Files:**
- Create: `backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceTreeEndpointsTests.cs`

**Interfaces:**
- Produces: `GET /api/workspaces/{id:guid}/tree` -> `Results.Ok(WorkspaceTreeDto)` ou `404 NotFound` se o workspace não existir.
- Types:
  ```csharp
  public record WorkspaceTreeDto(Guid WorkspaceId, string WorkspaceName, List<CollectionNodeDto> Collections);
  public record CollectionNodeDto(Guid Id, string Name, ExecutionTarget DefaultTarget, string? OpenApiSpecUrl, List<FolderNodeDto> Folders, List<RequestItemNodeDto> Requests);
  public record FolderNodeDto(Guid Id, string Name, Guid CollectionId, Guid? ParentFolderId, ExecutionTarget DefaultTarget, List<FolderNodeDto> SubFolders, List<RequestItemNodeDto> Requests);
  public record RequestItemNodeDto(Guid Id, string Name, string Method, string Url, ExecutionTarget Target, HttpBodyType BodyType, string HeadersJson, string? BodyContent, Guid? CollectionId, Guid? FolderId);
  ```

- [ ] **Step 1: Write the failing tests for Workspace Bootstrap and Tree Endpoint**

```csharp
// backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceTreeEndpointsTests.cs
using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class WorkspaceTreeEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public WorkspaceTreeEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                var dbName = "InMemoryTreeTest_" + Guid.NewGuid();
                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={dbName}.db;Foreign Keys=True"));
            });
        });
    }

    [Fact]
    public async Task GetTree_Returns_404_When_Workspace_Not_Found()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/workspaces/{Guid.NewGuid()}/tree");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetTree_Returns_Hierarchical_Structure_Ordered_By_Name()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "Test WS " + Guid.NewGuid() };
        var col = new Collection { Name = "Payments", Workspace = ws };
        var rootFolder = new Folder { Name = "v1", Workspace = ws, Collection = col };
        var subFolder = new Folder { Name = "Charges", Workspace = ws, Collection = col, ParentFolder = rootFolder };
        var req = new RequestItem
        {
            Name = "Create Charge",
            Method = "POST",
            Url = "https://api.stripe.com/charges",
            Workspace = ws,
            Collection = col,
            Folder = subFolder,
            HeadersJson = "{\"Authorization\":\"Bearer test\"}",
            BodyType = HttpBodyType.Json,
            BodyContent = "{\"amount\":100}"
        };

        db.Workspaces.Add(ws);
        db.Collections.Add(col);
        db.Folders.AddRange(rootFolder, subFolder);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var response = await client.GetAsync($"/api/workspaces/{ws.Id}/tree");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var tree = await response.Content.ReadFromJsonAsync<WorkspaceTreeDto>();
        tree.Should().NotBeNull();
        tree!.WorkspaceId.Should().Be(ws.Id);
        tree.Collections.Should().ContainSingle(c => c.Id == col.Id);

        var colDto = tree.Collections.First();
        colDto.Folders.Should().ContainSingle(f => f.Id == rootFolder.Id);
        var rootDto = colDto.Folders.First();
        rootDto.SubFolders.Should().ContainSingle(sf => sf.Id == subFolder.Id);
        rootDto.SubFolders.First().Requests.Should().ContainSingle(r => r.Id == req.Id);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~WorkspaceTreeEndpointsTests`
Expected: FAIL (endpoint `/api/workspaces/{id}/tree` not found / 404).

- [ ] **Step 3: Implement `WorkspaceTreeModels.cs`, bootstrap default workspace and map `GET /api/workspaces/{id:guid}/tree`**

In `backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs`, declare the records `WorkspaceTreeDto`, `CollectionNodeDto`, `FolderNodeDto`, `RequestItemNodeDto`.
In `backend/src/ApiDot.Server/Program.cs`:
1. In the database startup scope, check if `!db.Workspaces.Any()`. If true, insert a default workspace (`00000000-0000-0000-0000-000000000001`, "Default Workspace") and save changes.
2. Implement `app.MapGet("/api/workspaces/{id:guid}/tree", ...)` querying the workspace and assembling the hierarchical tree recursively from `Collections`, `Folders` (where `ParentFolderId == null`), and `Requests`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~WorkspaceTreeEndpointsTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs backend/src/ApiDot.Server/Program.cs backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceTreeEndpointsTests.cs
git commit -m "feat(server): add default workspace seeding and GET /api/workspaces/{id}/tree endpoint"
```

---

### Task 2: Collection CRUD Endpoints

**Files:**
- Create: `backend/src/ApiDot.Server/Models/CollectionMutationModels.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/CollectionEndpointsTests.cs`

**Interfaces:**
- Produces:
  - `POST /api/collections` -> `CreateCollectionRequest` -> `201 Created` with Collection DTO.
  - `PUT /api/collections/{id:guid}` -> `UpdateCollectionRequest` -> `200 OK` with Collection DTO.
  - `DELETE /api/collections/{id:guid}` -> `204 NoContent`.

- [ ] **Step 1: Write the failing tests for Collection CRUD**

```csharp
// backend/tests/ApiDot.Server.Tests/Endpoints/CollectionEndpointsTests.cs
using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class CollectionEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public CollectionEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                var dbName = "InMemoryCollTest_" + Guid.NewGuid();
                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={dbName}.db;Foreign Keys=True"));
            });
        });
    }

    [Fact]
    public async Task Create_Collection_Returns_201_When_Valid()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "Workspace For Coll " + Guid.NewGuid() };
        db.Workspaces.Add(ws);
        await db.SaveChangesAsync();

        var payload = new CreateCollectionRequest("Core API", ws.Id, ExecutionTarget.Server);
        var res = await client.PostAsJsonAsync("/api/collections", payload);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Core API");
        created.DefaultTarget.Should().Be(ExecutionTarget.Server);
    }

    [Fact]
    public async Task Create_Collection_Returns_400_When_Name_Empty()
    {
        var client = _factory.CreateClient();
        var payload = new CreateCollectionRequest("   ", Guid.NewGuid(), ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/collections", payload);
        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Update_Collection_Updates_Fields_And_Returns_200()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Old Name", Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var updateReq = new UpdateCollectionRequest("New Name", ExecutionTarget.Agent);
        var res = await client.PutAsJsonAsync($"/api/collections/{coll.Id}", updateReq);

        res.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
        updated!.Name.Should().Be("New Name");
        updated.DefaultTarget.Should().Be(ExecutionTarget.Agent);
    }

    [Fact]
    public async Task Delete_Collection_Removes_In_Cascade_And_Returns_204()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "To Delete", Workspace = ws };
        var req = new RequestItem { Name = "Child Req", Url = "https://test.com", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var res = await client.DeleteAsync($"/api/collections/{coll.Id}");
        res.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var freshDb = _factory.Services.CreateScope().ServiceProvider.GetRequiredService<ApiDotDbContext>();
        (await freshDb.Collections.AnyAsync(c => c.Id == coll.Id)).Should().BeFalse();
        (await freshDb.RequestItems.AnyAsync(r => r.Id == req.Id)).Should().BeFalse();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~CollectionEndpointsTests`
Expected: FAIL

- [ ] **Step 3: Implement Collection CRUD in `Program.cs` and models in `CollectionMutationModels.cs`**

Create `backend/src/ApiDot.Server/Models/CollectionMutationModels.cs`:
```csharp
namespace ApiDot.Server.Models;
public record CreateCollectionRequest(string Name, Guid WorkspaceId, ExecutionTarget DefaultTarget = ExecutionTarget.Inherit);
public record UpdateCollectionRequest(string Name, ExecutionTarget DefaultTarget);
```
Map `POST /api/collections`, `PUT /api/collections/{id:guid}` and `DELETE /api/collections/{id:guid}` in `Program.cs` with validation on `Name` (not null/whitespace, max 200 chars) and existence of `WorkspaceId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~CollectionEndpointsTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Models/CollectionMutationModels.cs backend/src/ApiDot.Server/Program.cs backend/tests/ApiDot.Server.Tests/Endpoints/CollectionEndpointsTests.cs
git commit -m "feat(server): add POST, PUT and DELETE endpoints for collections"
```

---

### Task 3: Folder CRUD Endpoints & Cycle Detection

**Files:**
- Create: `backend/src/ApiDot.Server/Models/FolderMutationModels.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/FolderEndpointsTests.cs`

**Interfaces:**
- Produces:
  - `POST /api/folders` -> `CreateFolderRequest` -> `201 Created` with Folder DTO.
  - `PUT /api/folders/{id:guid}` -> `UpdateFolderRequest` -> `200 OK` (with cycle guard returning `400 BadRequest` if `ParentFolderId` creates cycle).
  - `DELETE /api/folders/{id:guid}` -> `204 NoContent`.

- [ ] **Step 1: Write the failing tests for Folder CRUD and Cycle Detection**

```csharp
// backend/tests/ApiDot.Server.Tests/Endpoints/FolderEndpointsTests.cs
using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class FolderEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public FolderEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                var dbName = "InMemoryFolderTest_" + Guid.NewGuid();
                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={dbName}.db;Foreign Keys=True"));
            });
        });
    }

    [Fact]
    public async Task Create_Folder_Returns_201_When_Valid()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var payload = new CreateFolderRequest("Auth Folder", ws.Id, coll.Id, null, ExecutionTarget.Inherit);
        var res = await client.PostAsJsonAsync("/api/folders", payload);

        res.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await res.Content.ReadFromJsonAsync<FolderNodeDto>();
        created!.Name.Should().Be("Auth Folder");
        created.CollectionId.Should().Be(coll.Id);
    }

    [Fact]
    public async Task Update_Folder_Prevents_Self_Parenting_Cycle_Returns_400()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "SelfParent", Workspace = ws, Collection = coll };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.Add(folder);
        await db.SaveChangesAsync();

        var payload = new UpdateFolderRequest("SelfParent", folder.Id, ExecutionTarget.Inherit);
        var res = await client.PutAsJsonAsync($"/api/folders/{folder.Id}", payload);

        res.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Delete_Folder_Removes_In_Cascade_Returns_204()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var folder = new Folder { Name = "Parent", Workspace = ws, Collection = coll };
        var child = new Folder { Name = "Child", Workspace = ws, Collection = coll, ParentFolder = folder };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.Folders.AddRange(folder, child);
        await db.SaveChangesAsync();

        var res = await client.DeleteAsync($"/api/folders/{folder.Id}");
        res.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var freshDb = _factory.Services.CreateScope().ServiceProvider.GetRequiredService<ApiDotDbContext>();
        (await freshDb.Folders.AnyAsync(f => f.Id == folder.Id || f.Id == child.Id)).Should().BeFalse();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~FolderEndpointsTests`
Expected: FAIL

- [ ] **Step 3: Implement Folder CRUD and cycle detection in `Program.cs`**

Create `backend/src/ApiDot.Server/Models/FolderMutationModels.cs`:
```csharp
namespace ApiDot.Server.Models;
public record CreateFolderRequest(string Name, Guid WorkspaceId, Guid CollectionId, Guid? ParentFolderId, ExecutionTarget DefaultTarget = ExecutionTarget.Inherit);
public record UpdateFolderRequest(string Name, Guid? ParentFolderId, ExecutionTarget DefaultTarget);
```
Map `POST /api/folders`, `PUT /api/folders/{id:guid}`, and `DELETE /api/folders/{id:guid}`.
In `PUT`, check `if (request.ParentFolderId == id)` or if `ParentFolderId` is in the descendant tree of `id`, returning `Results.Problem(statusCode: 400, title: "Invalid Parent Folder", detail: "A folder cannot be its own parent or descendant.")`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~FolderEndpointsTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Models/FolderMutationModels.cs backend/src/ApiDot.Server/Program.cs backend/tests/ApiDot.Server.Tests/Endpoints/FolderEndpointsTests.cs
git commit -m "feat(server): add POST, PUT and DELETE endpoints for folders with cycle protection"
```

---

### Task 4: RequestItem CRUD & Duplication Endpoints

**Files:**
- Create: `backend/src/ApiDot.Server/Models/RequestItemMutationModels.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/RequestItemEndpointsTests.cs`

**Interfaces:**
- Produces:
  - `POST /api/requests` -> `CreateRequestItemRequest` -> `201 Created`
  - `GET /api/requests/{id:guid}` -> `200 OK`
  - `PUT /api/requests/{id:guid}` -> `UpdateRequestItemRequest` -> `200 OK`
  - `POST /api/requests/{id:guid}/duplicate` -> `201 Created`
  - `DELETE /api/requests/{id:guid}` -> `204 NoContent`

- [ ] **Step 1: Write the failing tests for RequestItem CRUD and Duplication**

```csharp
// backend/tests/ApiDot.Server.Tests/Endpoints/RequestItemEndpointsTests.cs
using System.Net;
using System.Net.Http.Json;
using ApiDot.Core.Enums;
using ApiDot.Server.Data;
using ApiDot.Server.Data.Entities;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class RequestItemEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public RequestItemEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                var dbName = "InMemoryReqItemTest_" + Guid.NewGuid();
                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={dbName}.db;Foreign Keys=True"));
            });
        });
    }

    [Fact]
    public async Task Create_And_Get_RequestItem_Returns_Expected_Data()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        await db.SaveChangesAsync();

        var payload = new CreateRequestItemRequest("Get User", "GET", "https://api.test/user", ws.Id, coll.Id, null);
        var postRes = await client.PostAsJsonAsync("/api/requests", payload);
        postRes.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await postRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        created!.Name.Should().Be("Get User");

        var getRes = await client.GetAsync($"/api/requests/{created.Id}");
        getRes.StatusCode.Should().Be(HttpStatusCode.OK);
        var fetched = await getRes.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        fetched!.Url.Should().Be("https://api.test/user");
    }

    [Fact]
    public async Task Duplicate_RequestItem_Creates_Copy_With_Suffix()
    {
        var client = _factory.CreateClient();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApiDotDbContext>();
        db.Database.EnsureCreated();

        var ws = new Workspace { Name = "WS" };
        var coll = new Collection { Name = "Coll", Workspace = ws };
        var req = new RequestItem
        {
            Name = "Original Req",
            Method = "POST",
            Url = "https://api.test/login",
            Workspace = ws,
            Collection = coll,
            HeadersJson = "{\"x-custom\":\"1\"}",
            BodyContent = "{\"user\":\"admin\"}"
        };
        db.Workspaces.Add(ws);
        db.Collections.Add(coll);
        db.RequestItems.Add(req);
        await db.SaveChangesAsync();

        var res = await client.PostAsync($"/api/requests/{req.Id}/duplicate", null);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var copy = await res.Content.ReadFromJsonAsync<RequestItemNodeDto>();
        copy!.Id.Should().NotBe(req.Id);
        copy.Name.Should().Be("Original Req (Copy)");
        copy.Method.Should().Be("POST");
        copy.Url.Should().Be("https://api.test/login");
        copy.HeadersJson.Should().Be(req.HeadersJson);
        copy.BodyContent.Should().Be(req.BodyContent);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~RequestItemEndpointsTests`
Expected: FAIL

- [ ] **Step 3: Implement RequestItem CRUD & Duplicate in `Program.cs`**

Create `backend/src/ApiDot.Server/Models/RequestItemMutationModels.cs`:
```csharp
namespace ApiDot.Server.Models;
public record CreateRequestItemRequest(
    string Name,
    string Method,
    string Url,
    Guid WorkspaceId,
    Guid? CollectionId,
    Guid? FolderId,
    ExecutionTarget Target = ExecutionTarget.Inherit,
    string HeadersJson = "{}",
    HttpBodyType BodyType = HttpBodyType.None,
    string? BodyContent = null);

public record UpdateRequestItemRequest(
    string Name,
    string Method,
    string Url,
    ExecutionTarget Target,
    string HeadersJson,
    HttpBodyType BodyType,
    string? BodyContent,
    Guid? CollectionId,
    Guid? FolderId);
```
Map endpoints `POST /api/requests`, `GET /api/requests/{id:guid}`, `PUT /api/requests/{id:guid}`, `POST /api/requests/{id:guid}/duplicate` and `DELETE /api/requests/{id:guid}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~RequestItemEndpointsTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Models/RequestItemMutationModels.cs backend/src/ApiDot.Server/Program.cs backend/tests/ApiDot.Server.Tests/Endpoints/RequestItemEndpointsTests.cs
git commit -m "feat(server): add CRUD and duplicate endpoints for request items"
```

---

### Task 5: Frontend API Client & Tree State Hook (`useCollectionTree`)

**Files:**
- Create: `frontend/src/lib/treeApi.ts`
- Create: `frontend/src/lib/treeApi.test.ts`
- Create: `frontend/src/hooks/useCollectionTree.ts`
- Create: `frontend/src/hooks/useCollectionTree.test.ts`

**Interfaces:**
- Produces:
  - `fetchWorkspaceTree(workspaceId: string): Promise<WorkspaceTreeDto>`
  - `createCollectionApi(data: CreateCollectionRequest): Promise<CollectionNodeDto>`
  - `updateCollectionApi(id: string, data: UpdateCollectionRequest): Promise<CollectionNodeDto>`
  - `deleteCollectionApi(id: string): Promise<void>`
  - `createFolderApi(data: CreateFolderRequest): Promise<FolderNodeDto>`
  - `updateFolderApi(id: string, data: UpdateFolderRequest): Promise<FolderNodeDto>`
  - `deleteFolderApi(id: string): Promise<void>`
  - `createRequestApi(data: CreateRequestItemRequest): Promise<RequestItemNodeDto>`
  - `updateRequestApi(id: string, data: UpdateRequestItemRequest): Promise<RequestItemNodeDto>`
  - `duplicateRequestApi(id: string): Promise<RequestItemNodeDto>`
  - `deleteRequestApi(id: string): Promise<void>`
  - Hook `useCollectionTree(workspaceId: string)`:
    `{ tree, isLoading, error, reload, activeItem, setActiveItem, createCollection, updateCollection, deleteCollection, createFolder, updateFolder, deleteFolder, createRequest, updateRequest, duplicateRequest, deleteRequest, filterText, setFilterText }`

- [ ] **Step 1: Write the failing tests for `treeApi` and `useCollectionTree`**

Create `frontend/src/lib/treeApi.test.ts`:
Verify each API wrapper issues correct HTTP method, URL, and handles 2xx / error payload parsing.
Create `frontend/src/hooks/useCollectionTree.test.ts`:
Using `@testing-library/react`'s `renderHook`, verify initial loading of the tree, selecting an item, filtering tree nodes by name/URL, and re-fetching/updating state on mutations.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test -- src/lib/treeApi.test.ts src/hooks/useCollectionTree.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `treeApi.ts` and `useCollectionTree.ts`**

Implement `treeApi.ts` calling `/api/workspaces/...`, `/api/collections/...`, `/api/folders/...`, `/api/requests/...`.
Implement `useCollectionTree.ts` with React `useState`, `useEffect`, `useCallback`, and memoized filter logic matching items by name and route.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/lib/treeApi.test.ts src/hooks/useCollectionTree.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/treeApi.ts frontend/src/lib/treeApi.test.ts frontend/src/hooks/useCollectionTree.ts frontend/src/hooks/useCollectionTree.test.ts
git commit -m "feat(web): add tree API client and useCollectionTree state management hook"
```

---

### Task 6: Reusable ContextMenu & InlineNodeInput Components

**Files:**
- Create: `frontend/src/components/common/ContextMenu.tsx`
- Create: `frontend/src/components/common/ContextMenu.test.tsx`
- Create: `frontend/src/components/layout/InlineNodeInput.tsx`
- Create: `frontend/src/components/layout/InlineNodeInput.test.tsx`

**Interfaces:**
- Produces:
  - `<ContextMenu isOpen={boolean} position={{x, y}} onClose={() => void} items={ContextMenuItem[]} />`
    with automatic boundary detection within viewport/container, `Esc` key handling, and click-outside dismissal.
  - `<InlineNodeInput initialValue={string} onCommit={(val: string) => void} onCancel={() => void} placeholder={string} />`
    renders an `<input autoFocus>`, commits on `Enter` (if trimmed text is non-empty), cancels on `Esc` or blur.

- [ ] **Step 1: Write the failing tests for `ContextMenu` and `InlineNodeInput`**

Test `ContextMenu.test.tsx`:
- Renders menu items when `isOpen: true`.
- Calls `item.onClick` and `onClose` when an option is clicked.
- Listens to `keydown` `Escape` and calls `onClose`.
Test `InlineNodeInput.test.tsx`:
- Focuses input on mount.
- Calls `onCommit` on `Enter`.
- Calls `onCancel` on `Escape`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test -- src/components/common/ContextMenu.test.tsx src/components/layout/InlineNodeInput.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `ContextMenu.tsx` and `InlineNodeInput.tsx`**

Build `ContextMenu.tsx` with Tailwind positioning, bounding check, and portal/absolute styling.
Build `InlineNodeInput.tsx` with `useRef`, `onKeyDown`, and clean styled dark border.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/common/ContextMenu.test.tsx src/components/layout/InlineNodeInput.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/ContextMenu.tsx frontend/src/components/common/ContextMenu.test.tsx frontend/src/components/layout/InlineNodeInput.tsx frontend/src/components/layout/InlineNodeInput.test.tsx
git commit -m "feat(web): create reusable ContextMenu and InlineNodeInput components"
```

---

### Task 7: CollectionTree Component & Toolbar

**Files:**
- Create: `frontend/src/components/layout/CollectionTree.tsx`
- Create: `frontend/src/components/layout/CollectionTree.test.tsx`
- Modify: `frontend/src/components/layout/CollectionsNav.tsx` (re-export or adapt for backward compatibility)

**Interfaces:**
- Produces: `<CollectionTree tree={WorkspaceTreeDto} ... />`
  - Toolbar with single `+ Novo` button (no chevron), reload button `🔄`, search input.
  - Nodes rendered with hierarchical indent, expand/collapse state, method badges (`GET`, `POST`, `PUT`, `DELETE`).
  - Right-click handlers on collection, folder, request and empty scroll area.
  - Inline input active when creating or renaming an entity.
  - Confirm dialog when deleting non-empty collections or folders.

- [ ] **Step 1: Write the failing tests for `CollectionTree`**

```tsx
// frontend/src/components/layout/CollectionTree.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CollectionTree } from './CollectionTree';

const mockTree = {
  workspaceId: '00000000-0000-0000-0000-000000000001',
  workspaceName: 'Default Workspace',
  collections: [
    {
      id: 'coll-1',
      name: 'Auth API',
      defaultTarget: 'Inherit' as const,
      openApiSpecUrl: null,
      folders: [
        {
          id: 'fold-1',
          name: 'V1',
          collectionId: 'coll-1',
          parentFolderId: null,
          defaultTarget: 'Inherit' as const,
          subFolders: [],
          requests: [
            {
              id: 'req-1',
              name: 'Login',
              method: 'POST',
              url: 'https://api.test/login',
              target: 'Inherit' as const,
              bodyType: 'Json' as const,
              headersJson: '{}',
              bodyContent: null,
              collectionId: 'coll-1',
              folderId: 'fold-1',
            },
          ],
        },
      ],
      requests: [],
    },
  ],
};

describe('CollectionTree', () => {
  it('renders single + Novo button without chevron and filter bar', () => {
    render(<CollectionTree tree={mockTree} />);
    const btn = screen.getByRole('button', { name: /\+ novo/i });
    expect(btn).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/filtrar/i)).toBeInTheDocument();
  });

  it('opens creation dropdown on + Novo click and triggers creation', async () => {
    const onStartCreate = vi.fn();
    render(<CollectionTree tree={mockTree} onStartCreate={onStartCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ novo/i }));

    expect(screen.getByText(/nova coleção/i)).toBeInTheDocument();
    expect(screen.getByText(/nova pasta/i)).toBeInTheDocument();
    expect(screen.getByText(/nova requisição/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/nova coleção/i));
    expect(onStartCreate).toHaveBeenCalledWith('collection', null);
  });

  it('opens context menu on right click of a request item', () => {
    render(<CollectionTree tree={mockTree} />);
    const reqNode = screen.getByText('Login');
    fireEvent.contextMenu(reqNode);

    expect(screen.getByText(/duplicar/i)).toBeInTheDocument();
    expect(screen.getByText(/renomear/i)).toBeInTheDocument();
    expect(screen.getByText(/excluir/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `CollectionTree.tsx`**

Build `CollectionTree` implementing:
1. Header with `+ Novo`, reload button, and search input.
2. Render recursion for Collection -> Folders -> Requests.
3. Hook up `ContextMenu` and `InlineNodeInput` for inline creation and renaming.
4. Hook up context menu on empty space at the bottom of the tree.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/CollectionTree.tsx frontend/src/components/layout/CollectionTree.test.tsx frontend/src/components/layout/CollectionsNav.tsx
git commit -m "feat(web): implement CollectionTree component with unified + Novo toolbar and context menus"
```

---

### Task 8: SaveRequestModal & RequestEditor Integration (Save & Save As)

**Files:**
- Create: `frontend/src/components/request/SaveRequestModal.tsx`
- Create: `frontend/src/components/request/SaveRequestModal.test.tsx`
- Modify: `frontend/src/components/request/RequestEditor.tsx`
- Modify: `frontend/src/components/request/RequestEditor.test.tsx`

**Interfaces:**
- Produces:
  - `<SaveRequestModal isOpen={boolean} onClose={() => void} collections={CollectionOption[]} onSave={(name: string, collectionId: string, folderId?: string) => Promise<void>} />`
  - In `RequestEditor`:
    - Shows request title, dirty indicator dot when modified.
    - Button "Salvar" (`Ctrl+S` / `Cmd+S` listener).
    - If `currentRequestId` exists, calls `onSaveExisting(data)`.
    - If `currentRequestId` is null/undefined, calls `onSaveAs(data)` opening `SaveRequestModal`.

- [ ] **Step 1: Write the failing tests for `SaveRequestModal` and `RequestEditor` save handling**

Test `SaveRequestModal.test.tsx`:
- Renders inputs for request name, collection select, folder select.
- Submits selected values on save button click.
Test `RequestEditor.test.tsx`:
- Triggering `Ctrl+S` or clicking "Salvar" with `currentRequestId` calls `onSaveExisting`.
- Triggering `Ctrl+S` or clicking "Salvar" without `currentRequestId` calls `onSaveAs`.
- Editing URL, method or headers marks dirty indicator.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test -- src/components/request/SaveRequestModal.test.tsx src/components/request/RequestEditor.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `SaveRequestModal.tsx` and enhance `RequestEditor.tsx`**

Build `SaveRequestModal` with accessible dialog, validation for non-empty name, collection select dropdown, and folder select dropdown.
Update `RequestEditor.tsx` with header action bar containing Request Name, "Salvar" button with dirty state dot, and keyboard shortcut handler.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/request/SaveRequestModal.test.tsx src/components/request/RequestEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/request/SaveRequestModal.tsx frontend/src/components/request/SaveRequestModal.test.tsx frontend/src/components/request/RequestEditor.tsx frontend/src/components/request/RequestEditor.test.tsx
git commit -m "feat(web): add SaveRequestModal and integrate Save/Save-As workflow into RequestEditor"
```

---

### Task 9: Home Page (`page.tsx`) Integration & E2E Validation

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `useCollectionTree`, `CollectionTree`, `SaveRequestModal`, `RequestEditor`.
- Integrates full lifecycle:
  - Sidebar loads real tree from backend `/api/workspaces/{id}/tree`.
  - Creating new collection/folder/request updates tree.
  - Selecting a request in tree loads its URL, method, headers and body into `RequestEditor`.
  - Saving in `RequestEditor` updates request in backend and tree node.
  - Deleting active request resets editor to clean scratchpad.

- [ ] **Step 1: Write the failing integration tests in `page.test.tsx`**

Add tests to `frontend/src/app/page.test.tsx`:
- Tree loads from `/api/workspaces/.../tree` on mount and renders collections.
- Clicking a request node loads its details into the editor.
- Pressing `Ctrl+S` on unsaved request opens SaveRequestModal.
- Saving existing request calls `PUT /api/requests/{id}` and clears dirty state.
- Deleting an active request resets editor to blank.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/app/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Integrate `CollectionTree` and save handlers into `page.tsx`**

Replace static collections nav with `CollectionTree` hooked up to `useCollectionTree`.
Bind active request state with `RequestEditor`.
Handle `SaveRequestModal` open/close and mutation callbacks.

- [ ] **Step 4: Run all frontend and backend tests to verify full suite passes**

Run:
`dotnet test backend/ApiDot.sln`
`npm --prefix frontend test`
Expected: All tests PASS across both suites.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat(web): wire up dynamic collection tree and full request save/edit lifecycle on home page"
```
