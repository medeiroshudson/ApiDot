# Gestão de Workspaces e Inicialização 100% Limpa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todas as constantes e árvores mockadas do código, disponibilizar o seletor `WorkspaceSwitcher` e o modal `WorkspaceModal` no topo da sidebar esquerda, e garantir que o ApiDot inicie 100% limpo quando o banco estiver vazio.

**Architecture:** No backend, as rotas `GET /api/workspaces` e `POST /api/workspaces` gerenciam os registros reais de workspaces com validação estrita e sem inicialização automática de workspace padrão. No frontend, `WorkspaceSwitcher` exibe o workspace ativo e opções de troca/criação no topo da sidebar, `WorkspaceModal` permite cadastrar novos workspaces via diálogo acessível, `useCollectionTree` passa a aceitar `workspaceId: string | null` retornando estado vazio imediato sem mocks, e a `page.tsx` persiste o workspace ativo no `localStorage`.

**Tech Stack:** .NET 9 Minimal APIs, C# 13, Entity Framework Core 9, xUnit, FluentAssertions, Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-26-workspace-management-and-clean-initialization-design.md`

## Global Constraints

- Eliminação completa de `Program.DefaultWorkspaceId` no backend e `DEFAULT_WORKSPACE_ID` / mock trees no frontend.
- O botão de criar workspace no seletor ou no empty state deve exibir texto limpo (`Novo Workspace` ou `Criar Workspace`, com ícone, sem sinal `+` no texto).
- A interface deve exibir um empty state amigável caso não haja nenhum workspace cadastrado, convidando o usuário a criar seu primeiro workspace.
- A seleção de workspace ativo deve persistir no `localStorage` do navegador sob a chave `apidot_active_workspace_id`.
- Validação de entrada: Nomes de workspace não podem ser vazios ou conter apenas espaços em branco (máximo de 200 caracteres).

## Review Focus

1. **Estado Vazio Convidativo:** Quando `GET /api/workspaces` retornar `[]`, a sidebar não deve exibir coleções mockadas nem disparar erros no console; deve renderizar o card de boas-vindas com botão `Criar Workspace`.
2. **Criação do Primeiro Workspace:** Clicar em `Criar Workspace` no empty state deve abrir `WorkspaceModal`, salvar via `POST /api/workspaces`, atualizar a lista e torná-lo ativo imediatamente.
3. **Persistência de Sessão no `localStorage`:** Ao alternar de workspace e recarregar a página, o workspace selecionado deve ser restaurado a partir do `localStorage` (se ainda existir na lista de workspaces).
4. **Fechamento do Dropdown do Switcher:** O menu dropdown do `WorkspaceSwitcher` deve fechar ao clicar fora, ao selecionar um workspace ou ao pressionar `Esc`.
5. **Comportamento Limpo no `useCollectionTree`:** Passar `workspaceId: null` ou `""` deve definir `tree: null` e `isLoading: false` de imediato, sem disparar requisições para a API.

---

### Task 1: Backend Cleanup & Workspace Endpoints Validation

**Files:**
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Create: `backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceEndpointsTests.cs`

**Interfaces:**
- Produces:
  - `GET /api/workspaces` -> `200 OK` com `List<WorkspaceDto>`
  - `POST /api/workspaces` -> `CreateWorkspaceRequest(string Name)` -> `201 Created` com `WorkspaceDto` (ou `400 BadRequest` se nome inválido)
- Removes:
  - `Program.DefaultWorkspaceId` e `Program.DefaultWorkspaceName`

- [ ] **Step 1: Write the failing tests for Workspace Endpoints**

```csharp
// backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceEndpointsTests.cs
using System.Net;
using System.Net.Http.Json;
using ApiDot.Server.Data;
using ApiDot.Server.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ApiDot.Server.Tests.Endpoints;

public class WorkspaceEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public WorkspaceEndpointsTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<ApiDotDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                var dbName = "InMemoryWsTest_" + Guid.NewGuid();
                services.AddDbContext<ApiDotDbContext>(options =>
                    options.UseSqlite($"Data Source={dbName}.db;Foreign Keys=True"));
            });
        });
    }

    [Fact]
    public async Task GetWorkspaces_Returns_Empty_List_When_No_Workspaces()
    {
        var client = _factory.CreateClient();
        var res = await client.GetAsync("/api/workspaces");
        res.StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await res.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        list.Should().NotBeNull();
        list.Should().BeEmpty();
    }

    [Fact]
    public async Task CreateWorkspace_Returns_201_And_Persists()
    {
        var client = _factory.CreateClient();
        var payload = new CreateWorkspaceRequest("Financeiro");
        var res = await client.PostAsJsonAsync("/api/workspaces", payload);
        res.StatusCode.Should().Be(HttpStatusCode.Created);

        var created = await res.Content.ReadFromJsonAsync<WorkspaceDto>();
        created.Should().NotBeNull();
        created!.Name.Should().Be("Financeiro");
        created.Id.Should().NotBeEmpty();

        var listRes = await client.GetAsync("/api/workspaces");
        var list = await listRes.Content.ReadFromJsonAsync<List<WorkspaceDto>>();
        list.Should().ContainSingle(w => w.Id == created.Id);
    }

    [Fact]
    public async Task CreateWorkspace_Returns_400_When_Name_Invalid()
    {
        var client = _factory.CreateClient();
        var resEmpty = await client.PostAsJsonAsync("/api/workspaces", new CreateWorkspaceRequest("   "));
        resEmpty.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var resLong = await client.PostAsJsonAsync("/api/workspaces", new CreateWorkspaceRequest(new string('a', 201)));
        resLong.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }
}
```

- [ ] **Step 2: Run test to verify it passes or fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~WorkspaceEndpointsTests`
Expected: PASS/FAIL

- [ ] **Step 3: Remove `DefaultWorkspaceId` from `Program.cs` and ensure clean start**

Remove `public static readonly Guid DefaultWorkspaceId` from `backend/src/ApiDot.Server/Program.cs`.

- [ ] **Step 4: Run all backend tests to verify full suite passes**

Run: `dotnet test backend/ApiDot.sln`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Program.cs backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceEndpointsTests.cs
git commit -m "feat(server): validate workspace endpoints and remove legacy default workspace constants"
```

---

### Task 2: Frontend Primitives (`WorkspaceSwitcher` & `WorkspaceModal`)

**Files:**
- Create: `frontend/src/components/layout/WorkspaceSwitcher.tsx`
- Create: `frontend/src/components/layout/WorkspaceSwitcher.test.tsx`
- Create: `frontend/src/components/workspace/WorkspaceModal.tsx`
- Create: `frontend/src/components/workspace/WorkspaceModal.test.tsx`

**Interfaces:**
- Produces:
  - `<WorkspaceSwitcher workspaces={WorkspaceDto[]} activeWorkspaceId={string | null} onSelectWorkspace={(id: string) => void} onCreateWorkspaceClick={() => void} />`
    - Displays active workspace name (or "Selecionar Workspace") with Briefcase/Layers icon and chevron.
    - Dropdown lists all workspaces with checkmark on the active one.
    - Button at bottom: `Novo Workspace` (with Plus icon, without "+" in text).
  - `<WorkspaceModal isOpen={boolean} onClose={() => void} onSave={(name: string) => Promise<void>} />`
    - Accessible dialog with autofocus text input, validation (non-empty, max 200 chars), Enter to submit, Esc to cancel.

- [ ] **Step 1: Write the failing tests for `WorkspaceSwitcher` and `WorkspaceModal`**

Create `frontend/src/components/layout/WorkspaceSwitcher.test.tsx`:
- Renders active workspace name.
- Toggles dropdown on click.
- Calls `onSelectWorkspace` when a workspace item is clicked.
- Calls `onCreateWorkspaceClick` when "Novo Workspace" is clicked.
- Closes dropdown on Escape or click outside.

Create `frontend/src/components/workspace/WorkspaceModal.test.tsx`:
- Renders input and buttons when `isOpen: true`.
- Focuses input on open.
- Disables submit when name is empty/whitespace.
- Calls `onSave` with trimmed name.
- Dismisses on Escape or Cancel click.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test -- src/components/layout/WorkspaceSwitcher.test.tsx src/components/workspace/WorkspaceModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `WorkspaceSwitcher.tsx` and `WorkspaceModal.tsx`**

Implement both components with Tailwind CSS matching dark neutral theme and accessible ARIA attributes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/layout/WorkspaceSwitcher.test.tsx src/components/workspace/WorkspaceModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/WorkspaceSwitcher.tsx frontend/src/components/layout/WorkspaceSwitcher.test.tsx frontend/src/components/workspace/WorkspaceModal.tsx frontend/src/components/workspace/WorkspaceModal.test.tsx
git commit -m "feat(web): add WorkspaceSwitcher and WorkspaceModal components"
```

---

### Task 3: Clean State Hook & Page Integration

**Files:**
- Modify: `frontend/src/hooks/useCollectionTree.ts`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `useCollectionTree`, `WorkspaceSwitcher`, `WorkspaceModal`, `fetchWorkspacesApi`, `createWorkspaceApi`.
- Changes:
  - `useCollectionTree(workspaceId: string | null)`: If `workspaceId` is null/empty, sets `tree: null` and `isLoading: false`.
  - In `frontend/src/app/page.tsx`:
    - Renders `WorkspaceSwitcher` at the top of the sidebar.
    - If `workspaces.length === 0`: renders empty state in sidebar with button `Criar Workspace` (with Plus icon, without "+" in text).
    - Persists `activeWorkspaceId` in `localStorage.getItem('apidot_active_workspace_id')`.
    - Handles opening and submitting `WorkspaceModal`.

- [ ] **Step 1: Write integration tests in `frontend/src/app/page.test.tsx`**

Add tests:
- Renders clean empty workspace state when `/api/workspaces` returns `[]`.
- Clicking `Criar Workspace` opens `WorkspaceModal`.
- Submitting `WorkspaceModal` creates workspace and loads its tree.
- Switching workspace via `WorkspaceSwitcher` changes active tree and persists in `localStorage`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/app/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `useCollectionTree.ts` and `page.tsx`**

Clean all mock defaults. Wire up `WorkspaceSwitcher`, `WorkspaceModal`, empty state, and `localStorage` persistence.

- [ ] **Step 4: Run full test suite (backend & frontend) and verify Docker**

Run:
`npm --prefix frontend test`
`dotnet test backend/ApiDot.sln`
`docker-compose build`
Expected: All tests pass, Docker images build cleanly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useCollectionTree.ts frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat(web): integrate WorkspaceSwitcher in sidebar, support clean zero-data state and localStorage persistence"
```
