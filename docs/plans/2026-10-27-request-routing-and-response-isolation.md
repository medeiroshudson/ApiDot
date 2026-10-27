# Roteamento de Workspace/Requisição e Isolamento de Respostas - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o isolamento de respostas HTTP por requisição com persistência assíncrona íntegra via IndexedDB e estruturar o roteamento declarativo por URL no Next.js 15 App Router (`/workspace/:workspaceId` e `/workspace/:workspaceId/request/:requestId`).

**Architecture:** O `useRequestStore` gerencia em memória o mapa `responsesByRequestId` com acesso reativo e síncrono. A persistência em disco das respostas é delegada ao IndexedDB (`frontend/src/lib/responseStorage.ts`), eliminando a cota síncrona do `localStorage` e garantindo que nenhum payload de resposta seja cortado ou alterado. Respostas até o teto de 5MB (`NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB`) são persistidas 100% íntegras; respostas acima de 5MB permanecem completas na sessão em memória e apenas não são gravadas em disco. A interface é organizada em torno de um shell compartilhado com `WorkspaceContext` (`app/workspace/[workspaceId]/layout.tsx`), rascunho em branco no workspace (`[workspaceId]/page.tsx`), e requisição ativa (`[workspaceId]/request/[requestId]/page.tsx`).

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Zustand 5, IndexedDB, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-27-request-routing-and-response-isolation-design.md`

## Global Constraints

- Compatibilidade total com React 19 (`react: ^19.0.0`) e Next.js 15 App Router (`next: ^15.2.0`).
- Todas as páginas e componentes de roteamento cliente utilizam `'use client'` e leem parâmetros via `useParams()` do `next/navigation` de forma segura no SSR/hidratação.
- Preservação estrita dos contratos visuais existentes (`RequestEditor`, `CollectionTree`, `ResponseViewer`, `AppHeader`, `PanelSplitter`, modais).
- A árvore de coleções e os modais residem no layout persistente do workspace (`app/workspace/[workspaceId]/layout.tsx`), evitando desmontagens, perda de nós expandidos ou recarregamentos ao transitar entre requisições.
- O isolamento de respostas garante que o rascunho (*scratchpad*) e cada requisição aberta possuam respostas independentes.
- **Regra de Ouro:** Payloads de resposta **nunca** sofrem cortes, truncamentos ou alterações de conteúdo. Respostas até 5MB são persistidas na íntegra no IndexedDB; acima de 5MB permanecem em memória durante a sessão.
- O `localStorage` permanece reservado para rascunhos de edição (`currentEditorData`) e layouts leves.
- Zero quebras nos 552 testes automatizados existentes do frontend.

## Review Focus

1. **Vazamento de resposta entre requisições:** Ao clicar na Requisição B após disparar a Requisição A, o `ResponseViewer` deve exibir a resposta da Requisição B (ou estado vazio), sem manter o resultado da Requisição A.
2. **Cold Load e F5 em Deep Link (`/workspace/:workspaceId/request/:requestId`):** O recarregamento direto da URL deve sincronizar a requisição ativa, selecioná-la na árvore, abrir seus dados no editor e recuperar a resposta íntegra do IndexedDB.
3. **Fallback de Requisição Inexistente:** Se o `:requestId` na URL não existir na árvore após o carregamento, a interface deve redirecionar para `/workspace/:workspaceId` sem travar a aplicação.
4. **Isolamento de Scratchpad por Workspace:** Mudar de workspace não deve carregar rascunhos ou respostas de outro workspace; a chave de rascunho é isolada por workspace (`__scratchpad__:${workspaceId}`).
5. **Integridade Absoluta do Payload:** O corpo da resposta gravado e recuperado do IndexedDB deve ser exatamente idêntico ao retornado pelo servidor, sem nenhuma modificação.

---

### Task 1: Módulo de Armazenamento IndexedDB (`responseStorage`) e Isolamento no `useRequestStore`

**Files:**
- Create: `frontend/src/lib/responseStorage.ts`
- Create: `frontend/src/lib/responseStorage.test.ts`
- Modify: `frontend/src/stores/useRequestStore.ts`
- Test: `frontend/src/stores/useRequestStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // responseStorage.ts
  export function getMaxResponseCacheBytes(): number;
  export function saveResponseToStorage(key: string, data: ResponseData): Promise<boolean>;
  export function getResponseFromStorage(key: string): Promise<ResponseData | null>;
  export function deleteResponseFromStorage(key: string): Promise<void>;
  export function clearAllResponsesFromStorage(): Promise<void>;

  // useRequestStore.ts
  export const SCRATCHPAD_REQ_ID = '__scratchpad__';
  export function getScratchpadKey(workspaceId?: string | null): string;

  export interface RequestState {
    activeRequestId: string | null;
    activeRequestDetails: ActiveRequestDetails | null;
    currentEditorData: RequestData | null;
    pendingSaveData: RequestData | null;
    isSavingRequest: boolean;
    isLoading: boolean;
    isAgentOnline: boolean;
    response: ResponseData | null;
    responsesByRequestId: Record<string, ResponseData>;
    requestHistory: DependencyRequest[];

    setActiveRequest: (id: string | null, details: ActiveRequestDetails | null, workspaceId?: string | null) => void;
    setActiveRequestName: (name: string) => void;
    setCurrentEditorData: (data: RequestData | null) => void;
    setPendingSaveData: (data: RequestData | null) => void;
    setIsSavingRequest: (isSaving: boolean) => void;
    setIsLoading: (isLoading: boolean) => void;
    setIsAgentOnline: (isOnline: boolean) => void;
    setResponse: (response: ResponseData | null, targetRequestId?: string | null, workspaceId?: string | null) => void;
    setResponseForRequest: (requestId: string, response: ResponseData | null) => void;
    loadResponseForRequest: (requestId: string) => Promise<ResponseData | null>;
    getResponseForActiveRequest: (workspaceId?: string | null) => ResponseData | null;
    clearResponseForRequest: (requestId: string) => void;
    addRequestHistory: (request: DependencyRequest) => void;
    resetScratchpad: (workspaceId?: string | null) => void;
    reset: () => void;
    getInitialEditorRequest: () => Partial<RequestData> & { id?: string };
  }
  ```

- [ ] **Step 1: Escrever testes unitários em `responseStorage.test.ts` e `useRequestStore.test.ts`**
  - Em `responseStorage.test.ts`: testar salvamento e recuperação assíncrona no IndexedDB, respeitando o limite de 5MB (respostas > 5MB não são gravadas no disco e retornam `false`, mas payloads <= 5MB são gravados e lidos 100% íntegros).
  - Em `useRequestStore.test.ts`: testar armazenamento de respostas em `responsesByRequestId`, isolamento de scratchpad (`__scratchpad__:${workspaceId}`), `setActiveRequest` alternando a resposta exibida e `getResponseForActiveRequest()`.

- [ ] **Step 2: Executar testes para verificar falhas**
  Run: `npm test frontend/src/lib/responseStorage.test.ts frontend/src/stores/useRequestStore.test.ts`
  Expected: FAIL (módulos e novos métodos não implementados).

- [ ] **Step 3: Implementar `responseStorage.ts` e refatorar `useRequestStore.ts`**
  - Criar `frontend/src/lib/responseStorage.ts` com IndexedDB nativo (database `apidot_responses_db`, store `responses`), verificando tamanho via `JSON.stringify(data).length` e sem alterar o payload.
  - No `useRequestStore.ts`, adicionar `responsesByRequestId: {}`, atualizar `setActiveRequest` para apontar `response` para a resposta isolada, implementar `setResponse` integrando salvamento assíncrono no IndexedDB, e manter no `localStorage` (`partialize`) apenas `currentEditorData`.

- [ ] **Step 4: Executar testes para verificar aprovação**
  Run: `npm test frontend/src/lib/responseStorage.test.ts frontend/src/stores/useRequestStore.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/lib/responseStorage.ts frontend/src/lib/responseStorage.test.ts frontend/src/stores/useRequestStore.ts frontend/src/stores/useRequestStore.test.ts
  git commit -m "feat(store): isolate responses by requestId with IndexedDB persistence and zero payload mutation"
  ```

---

### Task 2: Extração de Contexto do Workspace e Shell de Layout (`WorkspaceContext` e `WorkspaceShell`)

**Files:**
- Create: `frontend/src/context/WorkspaceContext.tsx`
- Create: `frontend/src/context/WorkspaceContext.test.tsx`
- Create: `frontend/src/components/layout/WorkspaceShell.tsx`
- Create: `frontend/src/components/layout/WorkspaceShell.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface WorkspaceContextValue {
    workspaceId: string;
    tree: WorkspaceTreeDto | null;
    filteredTree: WorkspaceTreeDto | null;
    isTreeLoading: boolean;
    treeError: string | null;
    reloadTree: () => Promise<void>;
    activeItem: ActiveTreeItem | null;
    setActiveItem: React.Dispatch<React.SetStateAction<ActiveTreeItem | null>>;
    filterText: string;
    setFilterText: (text: string) => void;
    createCollection: (data: any) => Promise<any>;
    updateCollection: (id: string, data: any) => Promise<any>;
    deleteCollection: (id: string) => Promise<void>;
    createFolder: (data: any) => Promise<any>;
    updateFolder: (id: string, data: any) => Promise<any>;
    deleteFolder: (id: string) => Promise<void>;
    createRequest: (data: any) => Promise<any>;
    updateRequest: (id: string, data: any) => Promise<any>;
    duplicateRequest: (id: string) => Promise<any>;
    deleteRequest: (id: string) => Promise<void>;
    handleSelectItem: (item: ActiveTreeItem) => void;
    handleCreateRequest: (name: string, colId?: string | null, foldId?: string | null) => Promise<any>;
    handleUpdateRequestName: (id: string, name: string) => Promise<any>;
    handleSaveExisting: (reqData: RequestData) => Promise<void>;
    handleSaveAs: (reqData: RequestData) => void;
  }

  export function WorkspaceProvider({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }): JSX.Element;
  export function useWorkspaceContext(): WorkspaceContextValue;

  export interface WorkspaceShellProps {
    workspaceId: string;
    children: React.ReactNode;
  }
  export function WorkspaceShell({ workspaceId, children }: WorkspaceShellProps): JSX.Element;
  ```

- [ ] **Step 1: Escrever testes para `WorkspaceContext` e `WorkspaceShell`**
  Criar `frontend/src/context/WorkspaceContext.test.tsx` e `frontend/src/components/layout/WorkspaceShell.test.tsx`:
  - Testar que `WorkspaceProvider` carrega a árvore para o `workspaceId` fornecido.
  - Testar que `WorkspaceShell` renderiza `AppHeader`, a Sidebar com `CollectionTree`, o divisor `PanelSplitter` e os `children`.
  - Testar que a seleção de item na árvore navega para a URL correta via `router.push`.

- [ ] **Step 2: Executar testes para verificar falhas**
  Run: `npm test frontend/src/context/WorkspaceContext.test.tsx frontend/src/components/layout/WorkspaceShell.test.tsx`
  Expected: FAIL (módulos ainda não implementados).

- [ ] **Step 3: Implementar `WorkspaceContext.tsx` e `WorkspaceShell.tsx`**
  - Em `WorkspaceContext.tsx`, criar o contexto React, encapsulando `useCollectionTree(workspaceId)` e os handlers de CRUD da árvore, roteando seleções de requisições para `/workspace/${workspaceId}/request/${req.id}`.
  - Em `WorkspaceShell.tsx`, estruturar o layout compartilhado com `AppHeader`, `CollectionTree`, `PanelSplitter`, `MobileDrawer` e os modais (`WorkspaceModal`, `EnvironmentModal`, etc.), envolvendo o conteúdo em `<WorkspaceProvider workspaceId={workspaceId}>`.

- [ ] **Step 4: Executar testes para verificar aprovação**
  Run: `npm test frontend/src/context/WorkspaceContext.test.tsx frontend/src/components/layout/WorkspaceShell.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/context/ frontend/src/components/layout/WorkspaceShell.tsx frontend/src/components/layout/WorkspaceShell.test.tsx
  git commit -m "feat(layout): create WorkspaceContext and persistent WorkspaceShell component"
  ```

---

### Task 3: Redirecionamento Raiz (`app/page.tsx`) e Layout do Workspace (`app/workspace/[workspaceId]/layout.tsx`)

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/workspace/[workspaceId]/layout.tsx`
- Create: `frontend/src/app/workspace/[workspaceId]/layout.test.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceShell`, `useWorkspaceStore`, `next/navigation`.
- Produces:
  - `app/page.tsx`: Componente raiz que redireciona para `/workspace/:workspaceId`.
  - `app/workspace/[workspaceId]/layout.tsx`: Layout que consome `params.workspaceId` e renderiza `<WorkspaceShell workspaceId={workspaceId}>{children}</WorkspaceShell>`.

- [x] **Step 1: Escrever testes para `app/workspace/[workspaceId]/layout.tsx` e atualizar `app/page.test.tsx`**
  - Criar `frontend/src/app/workspace/[workspaceId]/layout.test.tsx` testando extração de `workspaceId` via `useParams()` e sincronização com `useWorkspaceStore.setActiveWorkspaceId`.
  - Atualizar `frontend/src/app/page.test.tsx` para validar o redirecionamento para o workspace ativo recuperado do store/localStorage ou primeiro retornado pelo backend.

- [x] **Step 2: Executar testes para verificar falhas**
  Run: `npm test frontend/src/app/workspace/[workspaceId]/layout.test.tsx`
  Expected: FAIL (layout ainda não existe).

- [x] **Step 3: Implementar `app/workspace/[workspaceId]/layout.tsx` e refatorar `app/page.tsx`**
  - Criar `app/workspace/[workspaceId]/layout.tsx` com `'use client'`, consumindo `useParams()` para obter `workspaceId` e renderizando `WorkspaceShell`.
  - Refatorar `app/page.tsx` para atuar como redirecionador limpo (`useRouter().replace('/workspace/' + targetId)`), mantendo fallback seguro de carregamento.

- [x] **Step 4: Executar testes para verificar aprovação**
  Run: `npm test frontend/src/app/workspace/[workspaceId]/layout.test.tsx frontend/src/app/page.test.tsx`
  Expected: PASS.

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/app/page.tsx frontend/src/app/page.test.tsx frontend/src/app/workspace/[workspaceId]/layout.tsx frontend/src/app/workspace/[workspaceId]/layout.test.tsx
  git commit -m "feat(routing): implement root redirector and shared workspace layout"
  ```

---

### Task 4: Painel Central Unificado (`WorkspaceEditorPane`), Rota de Scratchpad e Rota de Requisição

**Files:**
- Create: `frontend/src/components/workspace/WorkspaceEditorPane.tsx`
- Create: `frontend/src/components/workspace/WorkspaceEditorPane.test.tsx`
- Create: `frontend/src/app/workspace/[workspaceId]/page.tsx`
- Create: `frontend/src/app/workspace/[workspaceId]/request/[requestId]/page.tsx`
- Create: `frontend/src/app/workspace/[workspaceId]/routing.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface WorkspaceEditorPaneProps {
    workspaceId: string;
    requestId?: string | null;
  }
  export function WorkspaceEditorPane({ workspaceId, requestId }: WorkspaceEditorPaneProps): JSX.Element;
  ```

- [ ] **Step 1: Escrever testes unitários para `WorkspaceEditorPane` e as rotas de página**
  Criar `frontend/src/components/workspace/WorkspaceEditorPane.test.tsx` e `frontend/src/app/workspace/[workspaceId]/routing.test.tsx`:
  - `WorkspaceEditorPane`: Testar montagem do `RequestEditor`, divisor central `PanelSplitter`, e `ResponseViewer` com resposta isolada.
  - Rota `/workspace/:workspaceId`: Testar montagem com rascunho em branco (*scratchpad*) e `activeRequestId = null`.
  - Rota `/workspace/:workspaceId/request/:requestId`: Testar sincronização dos dados da requisição a partir da árvore e exibição da resposta correspondente a `:requestId`.
  - Testar fallback: quando `:requestId` não existe na árvore, acionar redirecionamento para `/workspace/:workspaceId`.

- [ ] **Step 2: Executar testes para verificar falhas**
  Run: `npm test frontend/src/components/workspace/WorkspaceEditorPane.test.tsx frontend/src/app/workspace/[workspaceId]/routing.test.tsx`
  Expected: FAIL (módulos e páginas ainda não existem).

- [ ] **Step 3: Implementar `WorkspaceEditorPane.tsx`, `page.tsx` (Scratchpad) e `[requestId]/page.tsx` (Requisição)**
  - Implementar `WorkspaceEditorPane.tsx` encapsulando a execução da requisição HTTP (`handleSend`), interpolação de variáveis, timing waterfall, e armazenamento da resposta em `setResponse(res, requestId, workspaceId)`.
  - Implementar `app/workspace/[workspaceId]/page.tsx` renderizando `<WorkspaceEditorPane workspaceId={workspaceId} requestId={null} />`.
  - Implementar `app/workspace/[workspaceId]/request/[requestId]/page.tsx` consumindo `useParams()`, sincronizando `setActiveRequest` com a requisição da árvore e renderizando `<WorkspaceEditorPane workspaceId={workspaceId} requestId={requestId} />`.

- [ ] **Step 4: Executar testes para verificar aprovação**
  Run: `npm test frontend/src/components/workspace/WorkspaceEditorPane.test.tsx frontend/src/app/workspace/[workspaceId]/routing.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add frontend/src/components/workspace/WorkspaceEditorPane.tsx frontend/src/components/workspace/WorkspaceEditorPane.test.tsx frontend/src/app/workspace/[workspaceId]/page.tsx frontend/src/app/workspace/[workspaceId]/request/[requestId]/page.tsx frontend/src/app/workspace/[workspaceId]/routing.test.tsx
  git commit -m "feat(routing): implement WorkspaceEditorPane, scratchpad route and request route"
  ```

---

### Task 5: Validação Integrada, Regressão e Verificação Geral

**Files:**
- Review: Todos os arquivos modificados e criados.

- [ ] **Step 1: Executar suíte completa de testes unitários do frontend**
  Run: `npm test -- --run` no diretório `frontend`.
  Expected: Todos os testes passam (100% verde, sem regressões).

- [ ] **Step 2: Executar compilação de produção do Next.js**
  Run: `npm run build` no diretório `frontend`.
  Expected: Compilação bem-sucedida sem erros de tipo TypeScript ou avisos impeditivos de rotas.

- [ ] **Step 3: Executar testes do backend para garantir integridade do repositório**
  Run: `dotnet test backend/ApiDot.sln`
  Expected: Todos os testes do backend passam (100% verde).

- [ ] **Step 4: Commit de integração final (se necessário)**
  ```bash
  git commit --allow-empty -m "chore: complete request routing and response isolation feature"
  ```
