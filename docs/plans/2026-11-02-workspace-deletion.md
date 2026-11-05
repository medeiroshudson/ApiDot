# Workspace Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement safe workspace deletion in ApiDot with unconditional protection for the default workspace, strict Owner/Root authorization, cascading database cleanup, and an accessible confirmation modal.

**Architecture:** Minimal APIs in .NET 9 with EF Core 9 migrations enforce permission checks and cascade deletes at the domain layer. Next.js 16 (React 19) frontend leverages Zustand for workspace state management and accessible Tailwind modal components with full bilingual i18n support.

**Tech Stack:** .NET 9 Minimal APIs, Entity Framework Core 9 (SQLite), Next.js 16.4.4, React 19.3.1, Tailwind CSS, Lucide React, Zustand, xUnit / FluentAssertions, Vitest / Testing Library.

**Spec:** `docs/plans/2026-11-02-workspace-deletion-design.md`

## Global Constraints

- **Language & Frameworks:** C# 13 / .NET 9 for backend; TypeScript 5.8+ / Next.js 16.4.4 / React 19.3.1 for frontend.
- **Default Workspace Immutability:** Workspaces marked with `IsDefault = true` must NEVER be deleted under any circumstances (including by Root), returning `400 Bad Request`.
- **Role Authorization:** Only members with `WorkspaceRole.Owner` or users with `currentUserContext.IsRoot == true` may delete a workspace; others receive `403 Forbidden`.
- **Relational Integrity:** Workspace deletion must cleanly cascade to collections, folders, requests, environment variables, execution history, and workspace members without leaving orphan records.
- **Frontend Navigation Safety:** Deleting the active workspace must immediately redirect to the user's default workspace (or the first available workspace) and update `localStorage` without unhandled errors.
- **Design System & A11y:** The confirmation dialog must be accessible (ARIA attributes, backdrop click, Escape key, tab trapping, explicit danger cues) with bilingual copy in `pt-BR` and `en-US`.

## Review Focus

1. **Non-Owner attempting deletion via API:** Returns `403 Forbidden` with ProblemDetails; verified in `WorkspaceEndpointsTests.cs`.
2. **Attempting deletion of `IsDefault = true` workspace:** Returns `400 Bad Request` with ProblemDetails; verified in `WorkspaceEndpointsTests.cs`.
3. **Deleting the currently active workspace in UI:** UI immediately updates store, persists target ID in `localStorage`, and redirects to default workspace without null reference error; verified in `useWorkspaceStore.test.ts`.
4. **Preventing delete button rendering for default workspaces or non-owners:** `WorkspaceSwitcher` suppresses the trash icon when `ws.isDefault === true` or `ws.isOwner === false`; verified in `WorkspaceSwitcher.test.tsx`.
5. **Cascade deletion verification:** Deleting a workspace removes all its child entities (collections, folders, requests, variables); verified in `WorkspaceEndpointsTests.cs`.

---

### Task 1: Backend Domain, Entity & Database Migration

**Files:**
- Modify: `backend/src/ApiDot.Server/Data/Entities/Workspace.cs`
- Modify: `backend/src/ApiDot.Server/Data/Configurations/WorkspaceConfiguration.cs`
- Create: `backend/src/ApiDot.Server/Migrations/20261102120000_AddWorkspaceIsDefault.cs`
- Create: `backend/src/ApiDot.Server/Migrations/20261102120000_AddWorkspaceIsDefault.Designer.cs`
- Modify: `backend/src/ApiDot.Server/Migrations/ApiDotDbContextModelSnapshot.cs`
- Modify: `backend/src/ApiDot.Server/Services/AuthService.cs`
- Modify: `backend/src/ApiDot.Server/Security/UserSeeder.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Data/AuthEntityPersistenceTests.cs`

**Interfaces:**
- Consumes: `ApiDotDbContext`, `Workspace`, `UserSeeder`, `AuthService`.
- Produces: `Workspace.IsDefault: bool` property persisted via EF Core, with default workspaces seeded and migration applied on startup.

- [ ] **Step 1: Write the failing test**

In `backend/tests/ApiDot.Server.Tests/Data/AuthEntityPersistenceTests.cs`, add:
```csharp
[Fact]
public async Task Workspace_CanPersistAndRetrieve_IsDefaultFlag()
{
    var options = new DbContextOptionsBuilder<ApiDotDbContext>()
        .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
        .Options;

    using var context = new ApiDotDbContext(options);
    var wsDefault = new Workspace { Name = "Default WS", IsDefault = true };
    var wsCustom = new Workspace { Name = "Custom WS", IsDefault = false };
    context.Workspaces.AddRange(wsDefault, wsCustom);
    await context.SaveChangesAsync();

    var loadedDefault = await context.Workspaces.FindAsync(wsDefault.Id);
    var loadedCustom = await context.Workspaces.FindAsync(wsCustom.Id);

    loadedDefault.Should().NotBeNull();
    loadedDefault!.IsDefault.Should().BeTrue();
    loadedCustom.Should().NotBeNull();
    loadedCustom!.IsDefault.Should().BeFalse();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~Workspace_CanPersistAndRetrieve_IsDefaultFlag`
Expected: FAIL (compilation error: `Workspace` does not contain a definition for `IsDefault`).

- [ ] **Step 3: Implement `IsDefault` in `Workspace.cs`, `WorkspaceConfiguration.cs`, migration and seeders**

1. In `backend/src/ApiDot.Server/Data/Entities/Workspace.cs`:
   Add `public bool IsDefault { get; set; } = false;`.
2. In `backend/src/ApiDot.Server/Data/Configurations/WorkspaceConfiguration.cs`:
   Add `builder.Property(w => w.IsDefault).HasDefaultValue(false);`.
3. In `backend/src/ApiDot.Server/Migrations/20261102120000_AddWorkspaceIsDefault.cs`:
   Add column `IsDefault` with default `0`, and data update setting `IsDefault = 1` for the oldest workspace of each member/root.
4. In `backend/src/ApiDot.Server/Migrations/20261102120000_AddWorkspaceIsDefault.Designer.cs` and `ApiDotDbContextModelSnapshot.cs`:
   Update model snapshot with `b.Property<bool>("IsDefault").ValueGeneratedOnAdd().HasColumnType("INTEGER").HasDefaultValue(false);`.
5. In `backend/src/ApiDot.Server/Services/AuthService.cs`:
   Set `IsDefault = true` when instantiating `personalWorkspace` in `ProcessOidcLoginAsync`.
6. In `backend/src/ApiDot.Server/Security/UserSeeder.cs`:
   Set `IsDefault = true` when instantiating `demoWorkspace` in `SeedDemoUserAsync`, and ensure the first workspace in `SeedRootUserAndOrphanWorkspacesAsync` has `IsDefault = true` if none is default.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~Workspace_CanPersistAndRetrieve_IsDefaultFlag`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Data/Entities/Workspace.cs \
        backend/src/ApiDot.Server/Data/Configurations/WorkspaceConfiguration.cs \
        backend/src/ApiDot.Server/Migrations/ \
        backend/src/ApiDot.Server/Services/AuthService.cs \
        backend/src/ApiDot.Server/Security/UserSeeder.cs \
        backend/tests/ApiDot.Server.Tests/Data/AuthEntityPersistenceTests.cs
git commit -m "feat(backend): add IsDefault flag to Workspace entity with EF Core migration"
```

---

### Task 2: Backend API Endpoints & Authorization

**Files:**
- Modify: `backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs`
- Modify: `backend/src/ApiDot.Server/Endpoints/WorkspaceEndpoints.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceEndpointsTests.cs`

**Interfaces:**
- Consumes: `Workspace`, `WorkspaceDto`, `ICurrentUserContext`, `WorkspaceRole`.
- Produces: `WorkspaceDto(Guid Id, string Name, DateTime CreatedAtUtc, bool IsDefault = false, bool IsOwner = false)` and `DELETE /api/workspaces/{id:guid}` endpoint.

- [ ] **Step 1: Write failing integration tests for workspace deletion and DTO projection**

In `backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceEndpointsTests.cs`, add:
```csharp
[Fact]
public async Task DeleteWorkspace_AsOwner_SucceedsWith204AndCascades()
// Creates custom workspace with collections/requests, deletes as Owner, asserts 204 NoContent, asserts collections/requests removed from DB

[Fact]
public async Task DeleteWorkspace_AsRoot_SucceedsWith204()
// Creates custom workspace, deletes as Root, asserts 204 NoContent

[Fact]
public async Task DeleteWorkspace_WhenDefault_Returns400BadRequest()
// Creates workspace with IsDefault = true, attempts delete as Owner, asserts 400 BadRequest with "Default workspace cannot be deleted"

[Fact]
public async Task DeleteWorkspace_AsMember_Returns403Forbidden()
// Creates workspace where user is WorkspaceRole.Member, attempts delete, asserts 403 Forbidden

[Fact]
public async Task DeleteWorkspace_NonExistent_Returns404NotFound()
// Attempts delete with random Guid, asserts 404 NotFound
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~DeleteWorkspace`
Expected: FAIL (endpoints not found / 405 Method Not Allowed).

- [ ] **Step 3: Implement `WorkspaceDto` update and `DELETE /api/workspaces/{id}` in `WorkspaceEndpoints.cs`**

1. In `backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs`:
   Update `WorkspaceDto`:
   ```csharp
   public record WorkspaceDto(
       Guid Id,
       string Name,
       DateTime CreatedAtUtc,
       bool IsDefault = false,
       bool IsOwner = false);
   ```
2. In `backend/src/ApiDot.Server/Endpoints/WorkspaceEndpoints.cs`:
   - In `GET /`: inject `ICurrentUserContext currentUserContext`, project `w.IsDefault` and `isOwner = currentUserContext.IsRoot || (currentUserContext.UserId.HasValue && w.Members.Any(m => m.UserId == currentUserContext.UserId.Value && m.Role == WorkspaceRole.Owner))`.
   - In `POST /`: return `new WorkspaceDto(ws.Id, ws.Name, ws.CreatedAtUtc, IsDefault: false, IsOwner: true)`.
   - Add `group.MapDelete("/{id:guid}", ...)`:
     - Find workspace including `Members`.
     - 404 if null.
     - 403 if not `isRoot` and not `isOwner`.
     - 400 if `workspace.IsDefault` with title "Invalid Operation" and detail "Default workspace cannot be deleted.".
     - `db.Workspaces.Remove(workspace); await db.SaveChangesAsync(cancellationToken);`
     - Return `Results.NoContent()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test backend/tests/ApiDot.Server.Tests/ApiDot.Server.Tests.csproj --filter FullyQualifiedName~WorkspaceEndpointsTests`
Expected: PASS (all workspace endpoint tests green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs \
        backend/src/ApiDot.Server/Endpoints/WorkspaceEndpoints.cs \
        backend/tests/ApiDot.Server.Tests/Endpoints/WorkspaceEndpointsTests.cs
git commit -m "feat(backend): implement DELETE /api/workspaces/{id} with default protection and role validation"
```

---

### Task 3: Frontend Data Layer & Store

**Files:**
- Modify: `frontend/src/lib/treeApi.ts`
- Modify: `frontend/src/stores/useWorkspaceStore.ts`
- Test: `frontend/src/lib/treeApi.test.ts`
- Test: `frontend/src/stores/useWorkspaceStore.test.ts`

**Interfaces:**
- Consumes: `DELETE /api/workspaces/{id}` API.
- Produces: `deleteWorkspaceApi(workspaceId: string): Promise<void>` and `deleteWorkspace: (id: string) => Promise<void>` in `useWorkspaceStore`.

- [ ] **Step 1: Write failing tests in `treeApi.test.ts` and `useWorkspaceStore.test.ts`**

1. In `frontend/src/lib/treeApi.test.ts`:
   Test `deleteWorkspaceApi` sends `DELETE /api/workspaces/{id}` and handles success (204) and error responses.
2. In `frontend/src/stores/useWorkspaceStore.test.ts`:
   Test:
   - `deleteWorkspace` calls `deleteWorkspaceApi`, removes workspace from state `workspaces`.
   - If the deleted workspace is active, `activeWorkspaceId` automatically switches to the workspace where `isDefault === true` (or the first available).
   - If delete API fails, store captures `error` and rethrows without corrupting state.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- frontend/src/stores/useWorkspaceStore.test.ts`
Expected: FAIL (`deleteWorkspace` is not a function).

- [ ] **Step 3: Implement `deleteWorkspaceApi` and `useWorkspaceStore.deleteWorkspace`**

1. In `frontend/src/lib/treeApi.ts`:
   - Update `WorkspaceDto`:
     ```typescript
     export interface WorkspaceDto {
       id: string;
       name: string;
       createdAtUtc: string;
       isDefault?: boolean;
       isOwner?: boolean;
     }
     ```
   - Implement `deleteWorkspaceApi`:
     ```typescript
     export async function deleteWorkspaceApi(workspaceId: string): Promise<void> {
       const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
         method: 'DELETE',
       });
       if (!res.ok) {
         let errorDetail = 'Falha ao excluir workspace';
         try {
           const json = await res.json();
           errorDetail = json.detail || json.title || errorDetail;
         } catch {
           const text = await res.text();
           if (text) errorDetail = text;
         }
         throw new Error(errorDetail);
       }
     }
     ```
2. In `frontend/src/stores/useWorkspaceStore.ts`:
   - Add `deleteWorkspace: (id: string) => Promise<void>` to `WorkspaceState`.
   - In implementation:
     ```typescript
     deleteWorkspace: async (id: string): Promise<void> => {
       set({ isLoading: true, error: null });
       try {
         await deleteWorkspaceApi(id);
         const remaining = get().workspaces.filter((w) => w.id !== id);
         let nextActiveId = get().activeWorkspaceId;
         if (nextActiveId === id) {
           const defaultWs = remaining.find((w) => w.isDefault);
           nextActiveId = defaultWs ? defaultWs.id : remaining[0]?.id ?? null;
           if (typeof window !== 'undefined' && nextActiveId) {
             localStorage.setItem('apidot_active_workspace_id', nextActiveId);
           }
         }
         set({
           workspaces: remaining,
           activeWorkspaceId: nextActiveId,
           isLoading: false,
           error: null,
         });
       } catch (err: unknown) {
         const errorMessage = err instanceof Error ? err.message : 'Falha ao excluir workspace';
         set({ error: errorMessage, isLoading: false });
         throw err;
       }
     }
     ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- frontend/src/stores/useWorkspaceStore.test.ts frontend/src/lib/treeApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/treeApi.ts \
        frontend/src/stores/useWorkspaceStore.ts \
        frontend/src/lib/treeApi.test.ts \
        frontend/src/stores/useWorkspaceStore.test.ts
git commit -m "feat(frontend): implement deleteWorkspaceApi and useWorkspaceStore delete action"
```

---

### Task 4: Frontend UI Components, Modal & i18n

**Files:**
- Modify: `frontend/src/i18n/locales/en-US.ts`
- Modify: `frontend/src/i18n/locales/pt-BR.ts`
- Create: `frontend/src/components/workspace/DeleteWorkspaceModal.tsx`
- Modify: `frontend/src/components/layout/WorkspaceSwitcher.tsx`
- Modify: `frontend/src/components/layout/CollectionTree.tsx`
- Modify: `frontend/src/components/layout/WorkspaceShell.tsx`
- Create: `frontend/src/components/workspace/DeleteWorkspaceModal.test.tsx`
- Modify: `frontend/src/components/layout/WorkspaceSwitcher.test.tsx`

**Interfaces:**
- Consumes: `useWorkspaceStore.deleteWorkspace`, `WorkspaceDto`.
- Produces: `DeleteWorkspaceModal`, trash action on `WorkspaceSwitcher`, integrated in `WorkspaceShell`.

- [ ] **Step 1: Write failing tests for modal and switcher integration**

1. Create `frontend/src/components/workspace/DeleteWorkspaceModal.test.tsx`:
   - Renders with workspace name and warning message.
   - Disables buttons and shows spinner when submitting.
   - Invokes `onConfirm` when confirm button is clicked.
   - Closes on cancel button, backdrop click, or Escape.
2. In `frontend/src/components/layout/WorkspaceSwitcher.test.tsx`:
   - Verifies delete button (`aria-label`) is NOT rendered for `isDefault === true`.
   - Verifies delete button is rendered for non-default workspaces where `isOwner !== false`.
   - Clicking delete button stops event propagation (does not trigger workspace selection) and invokes `onDeleteWorkspaceClick`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- frontend/src/components/workspace/DeleteWorkspaceModal.test.tsx frontend/src/components/layout/WorkspaceSwitcher.test.tsx`
Expected: FAIL (missing component / prop).

- [ ] **Step 3: Implement `DeleteWorkspaceModal`, `WorkspaceSwitcher` delete action, and i18n strings**

1. Add i18n keys to `frontend/src/i18n/locales/pt-BR.ts` and `frontend/src/i18n/locales/en-US.ts`:
   - `sidebar.deleteWorkspace`: "Excluir workspace" / "Delete workspace"
   - `deleteWorkspaceModal.title`: "Excluir Workspace" / "Delete Workspace"
   - `deleteWorkspaceModal.description`: "Tem certeza que deseja excluir o workspace \"{name}\"?" / "Are you sure you want to delete workspace \"{name}\"?"
   - `deleteWorkspaceModal.warning`: "Esta ação é irreversível. Todas as coleções, pastas, requisições e variáveis deste workspace serão excluídas permanentemente." / "This action is irreversible. All collections, folders, requests, and variables in this workspace will be permanently deleted."
   - `deleteWorkspaceModal.confirmButton`: "Excluir Workspace" / "Delete Workspace"
   - `deleteWorkspaceModal.deleting`: "Excluindo..." / "Deleting..."
   - `deleteWorkspaceModal.cancelButton`: "Cancelar" / "Cancel"
   - `deleteWorkspaceModal.defaultCannotDelete`: "O workspace padrão não pode ser excluído." / "Default workspace cannot be deleted."
2. Create `frontend/src/components/workspace/DeleteWorkspaceModal.tsx` following accessible modal patterns (`WorkspaceModal.tsx`).
3. In `frontend/src/components/layout/WorkspaceSwitcher.tsx`:
   - Add `onDeleteWorkspaceClick?: (workspace: WorkspaceDto) => void` to `WorkspaceSwitcherProps`.
   - In option render loop: if `!ws.isDefault && ws.isOwner !== false`, add a `Trash2` button with `e.stopPropagation()` calling `onDeleteWorkspaceClick(ws)`.
4. In `frontend/src/components/layout/CollectionTree.tsx`:
   - Forward `onDeleteWorkspaceClick` to `WorkspaceSwitcher`.
5. In `frontend/src/components/layout/WorkspaceShell.tsx`:
   - Add state `workspaceToDelete: WorkspaceDto | null`.
   - Render `<DeleteWorkspaceModal>` when `workspaceToDelete !== null`.
   - On confirm: call `deleteWorkspace(workspaceToDelete.id)`. If `workspaceToDelete.id === workspaceId`, navigate with `router.push('/workspace/' + nextId)`. Close modal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- frontend/src/components/workspace/DeleteWorkspaceModal.test.tsx frontend/src/components/layout/WorkspaceSwitcher.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/ \
        frontend/src/components/workspace/DeleteWorkspaceModal.tsx \
        frontend/src/components/workspace/DeleteWorkspaceModal.test.tsx \
        frontend/src/components/layout/WorkspaceSwitcher.tsx \
        frontend/src/components/layout/WorkspaceSwitcher.test.tsx \
        frontend/src/components/layout/CollectionTree.tsx \
        frontend/src/components/layout/WorkspaceShell.tsx
git commit -m "feat(frontend): add DeleteWorkspaceModal and delete action to WorkspaceSwitcher"
```

---

### Task 5: Full Regression Suite & Verification

**Files:**
- Test all modified areas and run full backend and frontend validation suites.

- [ ] **Step 1: Run complete backend test suite**

Run: `dotnet test backend/ApiDot.sln`
Expected: PASS (all tests pass across Server, Core, Agent, and E2E suites).

- [ ] **Step 2: Run complete frontend test suite**

Run: `npm test -- --run` in `frontend/`
Expected: PASS (all test files and suites pass 100%).

- [ ] **Step 3: Run production build verification**

Run: `npm run build` in `frontend/`
Expected: PASS (Next.js 16 build succeeds with zero TypeScript or lint errors).

- [ ] **Step 4: Final commit and plan completion**

```bash
git add docs/plans/2026-11-02-workspace-deletion.md
git commit -m "docs: complete workspace deletion implementation plan"
```
