# Design Técnico: Funcionalidade de Exclusão de Workspace no ApiDot

**Data:** 2026-11-02  
**Status:** Aguardando Aprovação  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Backend (.NET 9 Minimal APIs / EF Core) e Frontend (Next.js 16 / Tailwind CSS / Zustand)

---

## 1. Intenção e Motivação (The Why)

Atualmente, o ApiDot permite listar, alternar e criar novos workspaces, mas não oferece suporte para exclusão de workspaces. Usuários que criam múltiplos workspaces de teste ou de projetos temporários acumulam workspaces sem utilidade, sem uma forma de removê-los.

Ao mesmo tempo, cada usuário possui um **workspace padrão** (provisionado no primeiro login ou seeding da conta). A exclusão acidental ou proposital deste workspace padrão causaria inconsistências operacionais graves, perda do contexto primário do usuário e risco de deixar contas sem nenhum workspace válido.

O objetivo desta funcionalidade é:
1. Permitir a exclusão segura e definitiva de workspaces não-padrão por seus proprietários (`WorkspaceRole.Owner`) ou pelo administrador (`IsRoot`).
2. Proteger incondicionalmente o **workspace padrão** (`IsDefault = true`), impedindo sua deleção tanto no backend quanto no frontend.
3. Executar a deleção em cascata atômica e limpa no banco de dados para todos os agregados do workspace (coleções, pastas, requisições, variáveis de ambiente, histórico de execução e vínculos de membros).
4. Oferecer uma experiência de usuário defensiva com modal de confirmação destrutiva e redirecionamento automático caso o workspace ativo seja o excluído.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Persistência Explícita de Workspace Padrão:**
  - Adicionar a propriedade `bool IsDefault` na entidade `Workspace` com migration EF Core (`AddWorkspaceIsDefault`).
  - Na migration, marcar como `IsDefault = true` apenas o workspace mais antigo (`MIN(CreatedAtUtc)`) de cada usuário, preservando os demais workspaces existentes como deletáveis (`IsDefault = false`).
  - Garantir que o workspace inicial gerado no provisionamento JIT (`AuthService.cs`) e no seeding (`UserSeeder.cs`) seja marcado como `IsDefault = true`. Workspaces criados manualmente via `POST /api/workspaces` recebem `IsDefault = false`.
- **Endpoint `DELETE /api/workspaces/{id:guid}`:**
  - Validar autenticação (401 se ausente).
  - Validar existência e visibilidade no escopo do usuário (404 Not Found caso o workspace não exista ou o usuário não tenha acesso).
  - Validar autorização: apenas membros com papel `WorkspaceRole.Owner` ou usuários `IsRoot` podem excluir (403 Forbidden para outros membros).
  - Bloquear exclusão do workspace padrão: se `workspace.IsDefault == true`, retornar `400 Bad Request` com `ProblemDetails` explicativo ("O workspace padrão não pode ser excluído.").
  - Executar remoção em cascata de todas as entidades associadas e retornar `204 NoContent`.
- **Contrato de API (`WorkspaceDto`):**
  - Estender `WorkspaceDto` no backend e no frontend com os campos `isDefault: boolean` e `isOwner: boolean`.
  - No `GET /api/workspaces`, projetar `isDefault` e calcular `isOwner` com base no `currentUserContext` (`isRoot || member.Role == Owner`).
- **Interface e Experiência do Usuário (Frontend):**
  - No `WorkspaceSwitcher`, listar workspaces exibindo opção de exclusão (ícone de lixeira / Delete) **apenas** para workspaces onde `!ws.isDefault` e `ws.isOwner === true`.
  - O workspace padrão exibe um indicativo visual claro (ou ausência da ação de deleção) para que o usuário saiba que ele é protegido.
  - Criar o componente `DeleteWorkspaceModal.tsx` com acessibilidade ARIA completa, foco gerenciado, tecla `Escape` e aviso textual explícito sobre a perda permanente de todas as coleções, pastas, requisições e variáveis do workspace.
  - Se o workspace ativo for excluído, redirecionar o usuário para o workspace padrão (ou primeiro workspace disponível) e persistir o novo ID no `localStorage`.
- **Internacionalização (i18n):**
  - Chaves completas em português (`pt-BR`) e inglês (`en-US`) cobrindo confirmação, aviso destrutivo, botões e mensagens de erro da API.
- **Cobertura de Testes Automatizados:**
  - Testes de integração no backend cobrindo: exclusão por Owner (204), exclusão por Root (204), tentativa de deletar workspace default (400), tentativa de deletar por membro sem role Owner (403), e workspace inexistente (404).
  - Testes unitários no frontend cobrindo: store de workspaces (`deleteWorkspace`), renderização condicional do botão de delete no `WorkspaceSwitcher`, e interação no modal `DeleteWorkspaceModal`.

### 2.2. Não-Metas (Non-Goals)
- Transferência de propriedade ou alteração de papéis de membros neste fluxo.
- Mudança dinâmica do workspace padrão (tornar outro workspace o "padrão").
- Soft-delete ou lixeira com recuperação de workspaces apagados (a exclusão é permanente e imediata).

### 2.3. Anti-Metas (Anti-Goals)
- Não permitir que usuários com papel `Member` ou `Admin` deletem workspaces de terceiros ou da organização.
- Não permitir a exclusão do workspace padrão sob hipótese alguma, mesmo por administradores `Root`.
- Não disparar a exclusão sem confirmação explícita no modal do frontend.
- Não deixar o frontend em estado inconsistente ou com tela de erro caso o workspace deletado seja o que está aberto no momento.

---

## 3. Abordagens Consideradas

### Abordagem 1: Coluna explícita `IsDefault` na entidade `Workspace` (Escolhida)
- Adiciona `bool IsDefault` no banco via migration EF Core, mantendo integridade explícita e determinística tanto no backend quanto no frontend.
- **Decisão:** Escolhida pelo usuário Hudson Medeiros.

### Abordagem 2: Regra de Negócio Dinâmica sem Coluna (Descartada)
- Inferir o workspace padrão pela data de criação ou contagem de workspaces restantes. Descartada por ser implícita, frágil e propensa a falhas em ordenação ou renomeação.

---

## 4. Arquitetura e Mudanças Técnicas

### 4.1. Backend (.NET 9 / EF Core)

1. **Entidade `Workspace` (`backend/src/ApiDot.Server/Data/Entities/Workspace.cs`):**
   ```csharp
   public bool IsDefault { get; set; } = false;
   ```
2. **Configuração EF Core (`backend/src/ApiDot.Server/Data/Configurations/WorkspaceConfiguration.cs`):**
   ```csharp
   builder.Property(w => w.IsDefault).HasDefaultValue(false);
   ```
3. **Migration EF Core (`AddWorkspaceIsDefault`):**
   - Criação da coluna `IsDefault` (INTEGER/BOOLEAN, default `0`).
   - Lógica de migração de dados no `Up`:
     ```sql
     -- Marca como default o workspace mais antigo de cada usuário
     UPDATE Workspaces
     SET IsDefault = 1
     WHERE Id IN (
         SELECT wm.WorkspaceId
         FROM WorkspaceMembers wm
         JOIN Workspaces w ON w.Id = wm.WorkspaceId
         GROUP BY wm.UserId
         HAVING w.CreatedAtUtc = MIN(w.CreatedAtUtc)
     );
     ```
     Caso existam workspaces sem membros (órfãos), o mais antigo também é marcado como default.
4. **Provisionamento e Seeders:**
   - `AuthService.ProcessOidcLoginAsync`: marcar `personalWorkspace.IsDefault = true`.
   - `UserSeeder.SeedDemoUserAsync`: marcar `demoWorkspace.IsDefault = true`.
   - `UserSeeder.SeedRootUserAndOrphanWorkspacesAsync`: assegurar que o primeiro workspace do Root seja marcado com `IsDefault = true` caso nenhum outro seja default.
5. **DTOs (`backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs`):**
   ```csharp
   public record WorkspaceDto(
       Guid Id,
       string Name,
       DateTime CreatedAtUtc,
       bool IsDefault = false,
       bool IsOwner = false);
   ```
6. **Endpoints (`backend/src/ApiDot.Server/Endpoints/WorkspaceEndpoints.cs`):**
   - Atualizar `GET /api/workspaces` para calcular `isOwner` com base no `ICurrentUserContext`:
     ```csharp
     var isRoot = currentUserContext.IsRoot;
     var currentUserId = currentUserContext.UserId;

     var workspaces = await db.Workspaces
         .AsNoTracking()
         .OrderBy(w => w.Name)
         .Select(w => new WorkspaceDto(
             w.Id,
             w.Name,
             w.CreatedAtUtc,
             w.IsDefault,
             isRoot || (currentUserId.HasValue && w.Members.Any(m => m.UserId == currentUserId.Value && m.Role == WorkspaceRole.Owner))))
         .ToListAsync(cancellationToken);
     ```
   - Mapear `DELETE /api/workspaces/{id:guid}`:
     ```csharp
     group.MapDelete("/{id:guid}", async (
         Guid id,
         ApiDotDbContext db,
         ICurrentUserContext currentUserContext,
         CancellationToken cancellationToken) =>
     {
         var workspace = await db.Workspaces
             .Include(w => w.Members)
             .FirstOrDefaultAsync(w => w.Id == id, cancellationToken);

         if (workspace is null)
         {
             return Results.Problem(
                 statusCode: StatusCodes.Status404NotFound,
                 title: "Workspace Not Found",
                 detail: $"Workspace with ID '{id}' was not found.");
         }

         // Validar autorização: Root ou Owner
         var isRoot = currentUserContext.IsRoot;
         var currentUserId = currentUserContext.UserId;
         var isOwner = currentUserId.HasValue && workspace.Members.Any(m => m.UserId == currentUserId.Value && m.Role == WorkspaceRole.Owner);

         if (!isRoot && !isOwner)
         {
             return Results.Problem(
                 statusCode: StatusCodes.Status403Forbidden,
                 title: "Forbidden",
                 detail: "You do not have permission to delete this workspace.");
         }

         // Proteger workspace padrão
         if (workspace.IsDefault)
         {
             return Results.Problem(
                 statusCode: StatusCodes.Status400BadRequest,
                 title: "Invalid Operation",
                 detail: "Default workspace cannot be deleted.");
         }

         db.Workspaces.Remove(workspace);
         await db.SaveChangesAsync(cancellationToken);

         return Results.NoContent();
     });
     ```

### 4.2. Frontend (Next.js 16 / React 19 / Zustand)

1. **Camada de Dados (`frontend/src/lib/treeApi.ts`):**
   - Atualizar `WorkspaceDto`:
     ```typescript
     export interface WorkspaceDto {
       id: string;
       name: string;
       createdAtUtc: string;
       isDefault?: boolean;
       isOwner?: boolean;
     }
     ```
   - Criar `deleteWorkspaceApi(workspaceId: string): Promise<void>`.
2. **Gerenciamento de Estado (`frontend/src/stores/useWorkspaceStore.ts`):**
   - Adicionar `deleteWorkspace: (id: string) => Promise<void>`.
   - Ao executar `deleteWorkspace`:
     - Invocar `deleteWorkspaceApi(id)`.
     - Atualizar a lista local de workspaces removendo o excluído.
     - Se `activeWorkspaceId === id`:
       - Identificar o workspace default (`w.isDefault`) ou o primeiro restante.
       - Atualizar `activeWorkspaceId` e sincronizar `localStorage`.
3. **Componente `DeleteWorkspaceModal.tsx` (`frontend/src/components/workspace/DeleteWorkspaceModal.tsx`):**
   - Diálogo modal acessível com título, mensagem de confirmação destacando o nome do workspace e o alerta vermelho de perda irreversível de coleções, requisições e variáveis.
   - Botões de ação: "Cancelar" e "Excluir Workspace" (com estado de loading durante a exclusão).
4. **Integração no `WorkspaceSwitcher.tsx` (`frontend/src/components/layout/WorkspaceSwitcher.tsx`):**
   - Em cada linha de workspace do dropdown:
     - Se `!ws.isDefault` e `ws.isOwner !== false`, renderizar botão de ação com ícone `Trash2` (hover com tom rose, `aria-label`).
     - Ao clicar na lixeira, impede a propagação de seleção (`e.stopPropagation()`) e abre o modal de confirmação.
5. **Integração no `WorkspaceShell.tsx` (`frontend/src/components/layout/WorkspaceShell.tsx`):**
   - Gerenciar o estado do `DeleteWorkspaceModal` e garantir o redirecionamento com `router.push('/workspace/' + targetId)` quando o workspace ativo for excluído.
6. **Internacionalização (`en-US.ts` e `pt-BR.ts`):**
   - Adicionar traduções para o modal de exclusão e mensagens de erro.

---

## 5. Plano de Validação e Evidência

1. **Testes de Backend (.NET 9):**
   - Executar suíte completa: `dotnet test backend/ApiDot.sln`.
   - Novos testes específicos em `WorkspaceEndpointsTests.cs`:
     - `DeleteWorkspace_AsOwner_SucceedsWith204AndCascades`
     - `DeleteWorkspace_AsRoot_SucceedsWith204`
     - `DeleteWorkspace_WhenDefault_Returns400BadRequest`
     - `DeleteWorkspace_AsMember_Returns403Forbidden`
     - `DeleteWorkspace_NonExistent_Returns404NotFound`
2. **Testes de Frontend (Vitest):**
   - Executar suíte completa: `npm test` no diretório `frontend`.
   - Testes unitários para `DeleteWorkspaceModal.test.tsx`, `WorkspaceSwitcher.test.tsx` e `useWorkspaceStore.test.ts`.
3. **Auditoria Visual e Fluxo:**
   - Testar o fluxo completo no frontend: alternância, bloqueio no default, exclusão de workspace secundário e redirecionamento suave para o workspace padrão.
