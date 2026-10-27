# Sidebar Context Menu Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure 100% reliable context menu interception across the entire ApiDot sidebar by delegating unhandled right-clicks to the empty-area context menu while preserving the browser's native context menu exclusively on search inputs.

**Architecture:** Add `onContextMenu` delegation at the root `collection-tree-container` element in `CollectionTree.tsx`, checking whether the target element is or is contained in an `<input>`. If inside an input, bypass custom handling so the browser native context menu appears; otherwise, invoke `handleContextMenu(e, 'empty')`. Adjust the `role="tree"` container to `flex flex-col` so that `collection-tree-empty-area` expands smoothly across all remaining vertical space.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-26-sidebar-context-menu-fix-design.md`

## Global Constraints

- Do not alter visual styling, positioning logic, or action callbacks of existing `ContextMenu` items.
- Preserve native browser context menu (cut, copy, paste) on search inputs (`<input>`).
- Existing tree item menus (`collection`, `folder`, `request`) must continue to take precedence via `e.stopPropagation()`.
- All 352 frontend tests must pass cleanly without regressions.

## Review Focus

- Right-click on empty state text ("Nenhuma coleção disponível.") opens the empty-area context menu.
- Right-click on toolbar padding or background (outside buttons and input) opens the empty-area context menu.
- Right-click directly inside the search input allows native event default (no custom menu opened).
- Right-click on tree items (`collection`, `folder`, `request`) continues opening their specific context menus without bubbling up to empty.
- Right-click on the expanded vertical empty space below collections opens the empty-area context menu.

---

### Task 1: Root Container Delegation and Input Exemption in CollectionTree

**Files:**
- Modify: `frontend/src/components/layout/CollectionTree.tsx:260-280, 848-854, 955-960`
- Modify: `frontend/src/components/layout/CollectionTree.test.tsx`

**Interfaces:**
- Consumes: `CollectionTreeProps`, `ContextMenu`, `handleContextMenu(e, 'empty')`
- Produces: Root delegation via `handleRootContextMenu(e: React.MouseEvent)` on `data-testid="collection-tree-container"`

- [ ] **Step 1: Write the failing tests in `CollectionTree.test.tsx`**

Add tests exercising:
1. Right-click on `data-testid="collection-tree-container"` triggers the empty context menu (`Nova Coleção`, `Importar OpenAPI`, `Recarregar Árvore`).
2. Right-click on the search input (`placeholder="Filtrar por nome ou rota..."`) does not trigger the custom context menu and does not call `preventDefault()`.
3. Right-click on the empty state message (`Nenhuma coleção disponível.`) opens the empty context menu.

```tsx
it('opens empty context menu when right-clicking on empty container areas or empty message', () => {
  render(<CollectionTree tree={{ collections: [] }} activeWorkspaceId="ws-1" workspaces={[{ id: 'ws-1', name: 'Default', isDefault: true, createdAt: '', updatedAt: '' }]} />);
  const container = screen.getByTestId('collection-tree-container');
  fireEvent.contextMenu(container);
  expect(screen.getByText('Nova Coleção')).toBeInTheDocument();
  expect(screen.getByText('Importar OpenAPI')).toBeInTheDocument();
});

it('allows native context menu when right-clicking inside search input', () => {
  render(<CollectionTree tree={mockTree} activeWorkspaceId="ws-1" workspaces={[{ id: 'ws-1', name: 'Default', isDefault: true, createdAt: '', updatedAt: '' }]} />);
  const input = screen.getByPlaceholderText('Filtrar por nome ou rota...');
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(screen.queryByText('Nova Coleção')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement `handleRootContextMenu` and layout styling in `CollectionTree.tsx`**

1. Define `handleRootContextMenu`:
```tsx
const handleRootContextMenu = (e: React.MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (target?.closest('input')) {
    return;
  }
  handleContextMenu(e, 'empty');
};
```
2. Attach `onContextMenu={handleRootContextMenu}` to the container div:
```tsx
<div
  ref={treeContainerRef}
  data-testid="collection-tree-container"
  onContextMenu={handleRootContextMenu}
  className={`flex flex-col h-full overflow-hidden text-sm ${className}`}
>
```
3. Update `role="tree"` container to include `flex flex-col`:
```tsx
<div
  role="tree"
  aria-label="Árvore de Coleções"
  className="flex-1 flex flex-col overflow-y-auto space-y-0.5 min-h-[120px] focus:outline-none"
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx`
Expected: PASS

- [ ] **Step 5: Run full frontend test suite**

Run: `npm --prefix frontend test`
Expected: PASS (all 352+ tests)

- [ ] **Step 6: Commit changes**

```bash
git add frontend/src/components/layout/CollectionTree.tsx frontend/src/components/layout/CollectionTree.test.tsx docs/plans/2026-10-26-sidebar-context-menu-fix-design.md docs/plans/2026-10-26-sidebar-context-menu-fix.md
git commit -m "fix(web): delegate sidebar context menu to root container and exempt search input"
```
