# Redesign da Sidebar Unificada no ApiDot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o topo da barra lateral esquerda em um cabeçalho compacto de linha única (WorkspaceSwitcher + botões rápidos "Novo" e "🔄"), eliminando a faixa redundante "COLEÇÕES & PASTAS", reduzindo a altura do cabeçalho de 220px para ~75px e exibindo um fluxo guiado limpo quando o banco estiver vazio.

**Architecture:** `CollectionTree` integra o `WorkspaceSwitcher` diretamente no topo do seu container toolbar. Na primeira linha, o seletor de workspace divide espaço com os botões `Novo` e `🔄`. Na segunda linha, o input de busca textual filtra a árvore. Se não houver workspace cadastrado, a barra oculta as ações de coleções e exibe um card acolhedor no corpo da sidebar com a ação `Criar Workspace`. A `page.tsx` repassa os estados de workspace e modais para a sidebar unificada.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide React, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-26-workspace-management-and-clean-initialization-design.md`

## Global Constraints

- O seletor de workspace e os botões rápidos compartilham a mesma linha no topo da sidebar.
- Altura do cabeçalho compactada (máximo de ~75px somando as duas linhas compactas).
- Sem repetição de botões ou mensagens conflitantes ("Nenhum workspace" vs barra de criar coleções).
- Os botões utilizam apenas texto descritivo e ícones, sem o caractere `+` no texto (`Criar Workspace`, `Novo Workspace`, `Novo`).
- 100% dos testes do frontend (Vitest) e backend (.NET) devem passar sem regressões.

## Review Focus

1. **Layout Compacto e Responsivo:** A linha superior não deve quebrar em duas linhas nem vazar para fora da sidebar (truncamento gracioso com `truncate` no nome do workspace).
2. **Estado Zero Workspaces:** Com zero workspaces no banco, o botão `Novo` e o campo de busca não devem aparecer; o card centralizado de boas-vindas com o botão `Criar Workspace` deve ser renderizado.
3. **Dropdowns não se sobrepõem:** Abrir o dropdown do WorkspaceSwitcher fecha o menu de `Novo`, e vice-versa.
4. **Fechamento ao Clicar Fora:** Os menus abertos fecham ao clicar em qualquer outro elemento ou pressionar `Esc`.
5. **Acessibilidade e Foco:** Manter atributos WAI-ARIA (`aria-expanded`, `aria-haspopup`, `role="dialog"`) em todos os botões e modais.

---

### Task 1: Compact WorkspaceSwitcher & Unified Header in CollectionTree

**Files:**
- Modify: `frontend/src/components/layout/WorkspaceSwitcher.tsx`
- Modify: `frontend/src/components/layout/CollectionTree.tsx`
- Test: `frontend/src/components/layout/CollectionTree.test.tsx`
- Test: `frontend/src/components/layout/WorkspaceSwitcher.test.tsx`

**Interfaces:**
- `CollectionTreeProps`:
  - Add optional workspace props:
    - `workspaces?: WorkspaceDto[]`
    - `activeWorkspaceId?: string | null`
    - `onSelectWorkspace?: (id: string) => void`
    - `onCreateWorkspaceClick?: () => void`
    - `isWorkspacesLoading?: boolean`
- Visual:
  - Row 1: `WorkspaceSwitcher` (flex-1) + `Novo` button + `🔄` button.
  - Row 2: Search input.
  - Body: When `workspaces.length === 0`, render clean welcome card with `Criar Workspace`.

- [ ] **Step 1: Write the failing tests in `CollectionTree.test.tsx` and `WorkspaceSwitcher.test.tsx`**

Test that:
- `CollectionTree` renders `WorkspaceSwitcher` in the same top row as `Novo`.
- When `workspaces` is empty, `CollectionTree` renders the welcome card and does not show `Novo` or search input.
- When `workspaces` has items, `CollectionTree` renders active workspace name, `Novo`, and search input.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx src/components/layout/WorkspaceSwitcher.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement unified header in `CollectionTree.tsx` and compact styling in `WorkspaceSwitcher.tsx`**

Update `CollectionTree.tsx` and `WorkspaceSwitcher.tsx` to match the validated interactive mockup.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx src/components/layout/WorkspaceSwitcher.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/WorkspaceSwitcher.tsx frontend/src/components/layout/WorkspaceSwitcher.test.tsx frontend/src/components/layout/CollectionTree.tsx frontend/src/components/layout/CollectionTree.test.tsx
git commit -m "feat(web): consolidate sidebar header into unified compact workspace and action bar"
```

---

### Task 2: Page Integration and Full Test Suite Validation

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `CollectionTree` with integrated `WorkspaceSwitcher`.
- Simplifies `renderSidebarContent` in `page.tsx`: delegates the full sidebar header and zero-workspace state to `CollectionTree`.

- [ ] **Step 1: Write failing integration tests in `page.test.tsx`**

Verify that:
- Unified sidebar header displays workspace switcher and actions.
- Zero workspace state renders cleanly without duplicate toolbars.
- Creating and switching workspaces updates the unified tree.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/app/page.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `page.tsx` to wire the unified `CollectionTree`**

Delegate workspace switcher props directly into `CollectionTree`. Clean up redundant outer wrappers.

- [ ] **Step 4: Run full test suite and verify docker build**

Run:
`npm --prefix frontend test`
`dotnet test backend/ApiDot.sln`
`docker-compose build`
Expected: All tests pass, Docker build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat(web): wire unified sidebar in page and verify zero-data flow"
```
