# Layout Postman em 3 Seções e Preservação de Aba Ativa — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar a área de trabalho do ApiDot no layout Postman de 3 seções (Barra de Requisição ocupando 100% da largura do canvas no topo, com duas colunas inferiores para detalhes e resposta), reordenar as abas com *Authorization* em 2º lugar, fixar a aba *Specification* como padrão e preservar a aba ativa durante a navegação entre requisições.

**Architecture:** 
- `useLayoutStore.ts`: Estado `activeRequestTab` (default `'specification'`) persistido no `localStorage`.
- `RequestEditor.tsx`: Reordenação de `TABS` (`Specification` → `Authorization` → `Params` → `Headers` → `Body`), renderização da Barra de Requisição em 100% de largura no topo e suporte a slots para divisão inferior (`responseSlot`, `splitterSlot`, `requestDetailsRatio`).
- `WorkspaceEditorPane.tsx`: Integração com `useLayoutStore`, passando `ResponseViewer` e `PanelSplitter` como slots para a área inferior do canvas, garantindo que o topo ocupe todo o espaço horizontal sem confinamento em coluna.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide React, Zustand, Vitest, Testing Library.

**Spec:** `docs/plans/2026-11-02-postman-layout-and-active-tab-preservation-design.md`

## Global Constraints

- Altura baseline da barra de requisição e controles mantida em `h-9` (36px).
- Nenhuma dependência externa adicional; utilizar componentes existentes e Tailwind CSS.
- Aba default inicial deve ser estritamente `specification`.
- A ordem das abas deve ser: `Specification` → `Authorization` → `Params` → `Headers` → `Body`.
- Ao navegar entre requisições (ou alterar URL da rota), a aba ativa deve ser preservada.
- Zero regressões nas 52 suítes de testes do frontend e 4 projetos de teste do .NET.

## Review Focus

1. **Largura Total da URL:** No desktop, a barra de requisição (Método + URL + Enviar) deve ocupar 100% da largura do canvas horizontal, sem sofrer influência do `requestResponseRatio`.
2. **Preservação de Aba na Navegação:** Trocar de Requisição A para Requisição B deve manter a aba ativa inalterada (ex.: se o usuário estava na aba `body`, a Requisição B deve abrir exibindo a aba `body`).
3. **Ordem e Roving TabIndex:** A navegação por teclado (`ArrowRight` / `ArrowLeft`) deve seguir a nova ordem exata: `Specification` (0) → `Authorization` (1) → `Params` (2) → `Headers` (3) → `Body` (4).
4. **Resizing com PanelSplitter:** O divisor central redimensionável deve atuar exclusivamente na área inferior (dividindo Detalhes da Requisição e ResponseViewer), sem afetar a barra de URL superior.
5. **Responsividade Mobile:** No mobile, a barra de requisição superior permanece visível no topo, enquanto o alternador `[ Requisição | Resposta ]` alterna entre os painéis de detalhes e resposta.

---

### Task 1: Estado e Persistência de Aba Ativa no `useLayoutStore`

**Files:**
- Modify: `frontend/src/stores/useLayoutStore.ts`
- Test: `frontend/src/stores/useLayoutStore.test.ts`

**Interfaces:**
- Produces:
  - `activeRequestTab: 'specification' | 'auth' | 'params' | 'headers' | 'body'` (default `'specification'`).
  - `setActiveRequestTab: (tab: 'specification' | 'auth' | 'params' | 'headers' | 'body') => void`.
  - Persistência em `localStorage` via `partialize` sob chave `apidot_layout_preferences`.

- [ ] **Step 1: Escrever testes unitários em `useLayoutStore.test.ts`**

```typescript
// frontend/src/stores/useLayoutStore.test.ts
it('should initialize activeRequestTab with specification by default', () => {
  const state = useLayoutStore.getState();
  expect(state.activeRequestTab).toBe('specification');
});

it('should update activeRequestTab and persist in partialize', () => {
  useLayoutStore.getState().setActiveRequestTab('body');
  expect(useLayoutStore.getState().activeRequestTab).toBe('body');

  const persistOptions = (useLayoutStore as any).persist?.getOptions?.();
  const partialized = persistOptions.partialize(useLayoutStore.getState());
  expect(partialized.activeRequestTab).toBe('body');
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `cd frontend && npx vitest run src/stores/useLayoutStore.test.ts`  
Expected: FAIL com `activeRequestTab` indefinido.

- [ ] **Step 3: Implementar `activeRequestTab` em `useLayoutStore.ts`**

1. Atualizar interface `LayoutState`:
   - `activeRequestTab: 'specification' | 'auth' | 'params' | 'headers' | 'body';`
   - `setActiveRequestTab: (tab: 'specification' | 'auth' | 'params' | 'headers' | 'body') => void;`
2. Atualizar `INITIAL_LAYOUT_STATE`:
   - `activeRequestTab: 'specification' as const,`
3. Implementar no creator:
   - `activeRequestTab: 'specification',`
   - `setActiveRequestTab: (tab) => set({ activeRequestTab: tab }),`
4. Atualizar `partialize` para incluir `activeRequestTab: state.activeRequestTab`.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/stores/useLayoutStore.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/useLayoutStore.ts frontend/src/stores/useLayoutStore.test.ts
git commit -m "feat(store): add activeRequestTab with specification default and persistence in useLayoutStore"
```

---

### Task 2: Reordenação das Abas e Suporte a Slots no `RequestEditor`

**Files:**
- Modify: `frontend/src/components/request/RequestEditor.tsx`
- Test: `frontend/src/components/request/RequestEditor.test.tsx`

**Interfaces:**
- Consumes: `activeTab?: TabType`, `onTabChange?: (tab: TabType) => void`, `responseSlot?: React.ReactNode`, `splitterSlot?: React.ReactNode`, `requestDetailsRatio?: number`.
- Produces: Nova ordem de `TABS` (`Specification` → `Authorization` → `Params` → `Headers` → `Body`), renderização da Barra de Requisição em 100% de largura e área inferior modular com slots.

- [ ] **Step 1: Atualizar testes em `RequestEditor.test.tsx`**

```typescript
// frontend/src/components/request/RequestEditor.test.tsx
it('renders tabs in new order with Authorization in second place and default to specification', () => {
  render(<RequestEditor />);
  const tabs = screen.getAllByRole('tab');
  expect(tabs[0]).toHaveTextContent(/specification|especificação/i);
  expect(tabs[1]).toHaveTextContent(/authorization|autenticação/i);
  expect(tabs[2]).toHaveTextContent(/params|parâmetros/i);
  expect(tabs[3]).toHaveTextContent(/headers|cabeçalhos/i);
  expect(tabs[4]).toHaveTextContent(/body|corpo/i);
  expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
});

it('renders responseSlot and splitterSlot side-by-side below request bar when provided', () => {
  render(
    <RequestEditor
      isDesktop={true}
      requestDetailsRatio={60}
      responseSlot={<div data-testid="mock-response-viewer">Response Content</div>}
      splitterSlot={<div data-testid="mock-splitter">Splitter</div>}
    />
  );
  expect(screen.getByTestId('mock-response-viewer')).toBeInTheDocument();
  expect(screen.getByTestId('mock-splitter')).toBeInTheDocument();
});
```

- [ ] **Step 2: Executar testes para verificar falha**

Run: `cd frontend && npx vitest run src/components/request/RequestEditor.test.tsx`  
Expected: FAIL com ordem antiga de abas.

- [ ] **Step 3: Implementar nova ordem de abas e slots no `RequestEditor.tsx`**

1. Reordenar `TABS`:
   ```typescript
   export type TabType = 'specification' | 'auth' | 'params' | 'headers' | 'body';

   export const TABS: { id: TabType; label: string }[] = [
     { id: 'specification', label: 'Specification' },
     { id: 'auth', label: 'Authorization' },
     { id: 'params', label: 'Params' },
     { id: 'headers', label: 'Headers' },
     { id: 'body', label: 'Body' },
   ];
   ```
2. Adicionar props:
   - `activeTab?: TabType`
   - `onTabChange?: (tab: TabType) => void`
   - `responseSlot?: React.ReactNode`
   - `splitterSlot?: React.ReactNode`
   - `requestDetailsRatio?: number`
   - `isDesktop?: boolean`
   - `activeMobilePane?: 'request' | 'response'`
   - `onMobilePaneChange?: (pane: 'request' | 'response') => void`
   - `responseStatusCode?: number`
3. Ajustar `currentTab = activeTabProp ?? localActiveTab`, default inicial `'specification'`.
4. Renderizar a estrutura de 3 seções:
   - Topo: Title Bar (w-full) + Request Bar (w-full 100% canvas).
   - Inferior:
     - Se `responseSlot` presente:
       - No mobile: alternador `[ Requisição | Resposta ]` seguido do conteúdo ativo.
       - No desktop: container `flex flex-row overflow-hidden flex-1 min-h-0`:
         - Coluna Esquerda (`style={{ flex: '0 0 ' + requestDetailsRatio + '%' }}`): Tablist e painéis da requisição.
         - Centro: `splitterSlot`.
         - Coluna Direita (`style={{ flex: '0 0 ' + (100 - requestDetailsRatio) + '%' }}`): `responseSlot`.
     - Se `responseSlot` omitido: Tablist e painéis ocupam 100% da área inferior.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/components/request/RequestEditor.test.tsx`  
Expected: PASS (todos os 27 testes passando).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/request/RequestEditor.tsx frontend/src/components/request/RequestEditor.test.tsx
git commit -m "feat(editor): reorder tabs with authorization in second place and support split response slots"
```

---

### Task 3: Reestruturação do `WorkspaceEditorPane` no Layout Postman

**Files:**
- Modify: `frontend/src/components/workspace/WorkspaceEditorPane.tsx`
- Test: `frontend/src/components/workspace/WorkspaceEditorPane.test.tsx`

**Interfaces:**
- Consumes: `useLayoutStore.activeRequestTab`, `setActiveRequestTab`, `requestResponseRatio`, `adjustRequestResponseRatio`.
- Produces: Layout Postman em 3 seções com preservação de aba ativa entre trocas de requisições.

- [ ] **Step 1: Atualizar testes em `WorkspaceEditorPane.test.tsx`**

```typescript
// frontend/src/components/workspace/WorkspaceEditorPane.test.tsx
it('preserves active tab when navigating between different requests', async () => {
  const { rerender } = render(<WorkspaceEditorPane workspaceId="ws-1" requestId="req-1" />);

  // Click Body tab
  const bodyTab = screen.getByRole('tab', { name: /body|corpo/i });
  fireEvent.click(bodyTab);
  expect(bodyTab).toHaveAttribute('aria-selected', 'true');

  // Switch to another request
  rerender(<WorkspaceEditorPane workspaceId="ws-1" requestId="req-2" />);
  expect(screen.getByRole('tab', { name: /body|corpo/i })).toHaveAttribute('aria-selected', 'true');
});

it('renders request bar spanning full canvas width with bottom split for details and response', () => {
  render(<WorkspaceEditorPane workspaceId="ws-1" requestId="req-1" />);
  const urlInput = screen.getByRole('textbox', { name: /request url/i });
  expect(urlInput).toBeInTheDocument();
  expect(screen.getByTestId('response-viewer-container')).toBeInTheDocument();
});
```

- [ ] **Step 2: Executar testes para verificar falha**

Run: `cd frontend && npx vitest run src/components/workspace/WorkspaceEditorPane.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implementar no `WorkspaceEditorPane.tsx`**

1. Obter do `useLayoutStore`:
   - `const activeRequestTab = useLayoutStore((s) => s.activeRequestTab);`
   - `const setActiveRequestTab = useLayoutStore((s) => s.setActiveRequestTab);`
2. No render:
   - Renderizar `<RequestEditor>` ocupando o container principal (`h-full w-full flex flex-col`), passando:
     - `activeTab={activeRequestTab}`
     - `onTabChange={setActiveRequestTab}`
     - `isDesktop={isDesktop}`
     - `requestDetailsRatio={requestResponseRatio}`
     - `activeMobilePane={activeMobilePane}`
     - `onMobilePaneChange={setActiveMobilePane}`
     - `responseStatusCode={response?.statusCode}`
     - `splitterSlot={isDesktop && <PanelSplitter ratio={requestResponseRatio} onResize={adjustRequestResponseRatio} onReset={resetRequestResponseRatio} containerRef={workspaceRef} />}`
     - `responseSlot={<ResponseViewer response={response} isLoading={isLoading} isAgentOnline={isAgentOnline} activeDeviceId={activeDeviceId} executedCurl={executedCurl} />}`

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/components/workspace/WorkspaceEditorPane.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/workspace/WorkspaceEditorPane.tsx frontend/src/components/workspace/WorkspaceEditorPane.test.tsx
git commit -m "feat(workspace): adopt Postman 3-section layout and preserve active tab across requests"
```

---

### Task 4: Validação Completa do Sistema e Build

**Files:**
- N/A (Validação cruzada e verificação)

- [ ] **Step 1: Executar suite completa do Vitest**

Run: `npm --prefix frontend test`  
Expected: 52 arquivos de teste e 936+ testes aprovados (100% verde).

- [ ] **Step 2: Executar suite completa do .NET**

Run: `dotnet test backend/ApiDot.sln`  
Expected: 545 testes aprovados (100% verde).

- [ ] **Step 3: Executar build de produção do Next.js**

Run: `npm --prefix frontend run build`  
Expected: Compilação bem-sucedida em < 2s com zero erros.
