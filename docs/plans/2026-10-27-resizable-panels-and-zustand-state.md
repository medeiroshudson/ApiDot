# Painéis Redimensionáveis e Estado Global com Zustand - Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar divisores de painéis redimensionáveis (Sidebar e Request/Response) com persistência de posição e migrar os estados do frontend para stores modulares do Zustand.

**Architecture:** A aplicação adota o Zustand para separar o estado em quatro stores atômicas (`useLayoutStore`, `useWorkspaceStore`, `useRequestStore`, `useEnvironmentStore`). Um componente nativo reutilizável `PanelSplitter` gerencia o arraste com PointerEvents, acessibilidade por teclado e duplo-clique para redefinir. O `page.tsx` atua como contêiner que conecta as stores aos componentes visuais existentes, preservando seus contratos de propriedades e mantendo 100% dos testes existentes verdes.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand 5, Vitest, Testing Library.

**Spec:** `docs/plans/2026-10-27-resizable-panels-and-zustand-state-design.md`

## Global Constraints

- Compatibilidade total com React 19 (`react: ^19.0.0`) e Next.js 15 App Router.
- Preservação estrita dos contratos de propriedades de todos os componentes filhos (`RequestEditor`, `CollectionTree`, `AppHeader`, `EnvironmentModal`, `ResponseViewer`).
- O hook `useCollectionTree` continua responsável pelas operações detalhadas de árvore do workspace ativo, preservando seus 26 testes unitários.
- Persistência seletiva no `localStorage` via middleware `persist` do Zustand: layouts, identificador de workspace ativo e variáveis de ambiente; respostas volumosas e históricos HTTP são retidos em memória na sessão para evitar limites de cota do navegador (Anti-Goal 2.3).
- Zero quebras nos 411 testes automatizados existentes.

## Review Focus

1. **Hydration Mismatch no SSR / Next.js:** Leitura de valores persistidos do `localStorage` causando divergência entre servidor e cliente — resolvido garantindo renderização segura com verificação de montagem (`hasHydrated` / `useEffect`).
2. **Arraste de ponteiro sobre iframes ou CodeMirror:** Perda de eventos de arraste do mouse ao passar por cima de editores — mitigado via `setPointerCapture` e `releasePointerCapture`.
3. **Valores fora dos limites (Overflow/Underflow):** Arraste agressivo para além dos limites permitidos — clamp estrito na store (`180px` a `480px` para Sidebar; `20%` a `80%` para Request/Response).
4. **Isolamento de estado em testes unitários:** Poluição de estado entre execuções de testes do Zustand — stores com método `getState().reset()` ou `setState` inicial nos testes.
5. **Navegação por teclado acessível:** Usuários que operam via teclado conseguem ajustar a divisória com as setas esquerda e direita (`ArrowLeft`/`ArrowRight`) com atributos ARIA (`role="separator"`, `aria-orientation="vertical"`).

---

### Task 1: Instalação do Zustand e Store de Layout (`useLayoutStore`)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/stores/useLayoutStore.ts`
- Test: `frontend/src/stores/useLayoutStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LayoutState {
    sidebarWidth: number;
    requestResponseRatio: number;
    sidebarCollapsed: boolean;
    activeMobilePane: 'request' | 'response';
    isWorkspaceModalOpen: boolean;
    isSaveModalOpen: boolean;
    isEnvModalOpen: boolean;
    isCollectionSettingsOpen: boolean;
    isImportOpenApiModalOpen: boolean;
    isDrawerOpen: boolean;
    auditBanner: { collectionName: string; report: any } | null;
    syncError: string | null;
    setSidebarWidth: (width: number) => void;
    adjustSidebarWidth: (deltaPx: number) => void;
    setRequestResponseRatio: (ratio: number) => void;
    adjustRequestResponseRatio: (deltaPct: number) => void;
    resetSidebarWidth: () => void;
    resetRequestResponseRatio: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    toggleSidebarCollapsed: () => void;
    setActiveMobilePane: (pane: 'request' | 'response') => void;
    setModalOpen: (modal: string, isOpen: boolean) => void;
    setAuditBanner: (banner: { collectionName: string; report: any } | null) => void;
    setSyncError: (error: string | null) => void;
  }
  export const useLayoutStore: UseBoundStore<StoreApi<LayoutState>>;
  ```

- [ ] **Step 1: Instalar dependência `zustand`**
Executar `npm install zustand` no diretório `frontend`.

- [ ] **Step 2: Escrever teste de unidade para `useLayoutStore`**
Criar `frontend/src/stores/useLayoutStore.test.ts` testando valores padrão (256px, 50%), clamps de largura (mín 180, máx 480) e ratio (mín 20, máx 80), resets e toggle de modais.

- [ ] **Step 3: Executar teste para verificar falha**
Executar: `npm test frontend/src/stores/useLayoutStore.test.ts`
Esperado: FAIL com módulo não encontrado.

- [ ] **Step 4: Implementar `useLayoutStore` com middleware persist**
Criar `frontend/src/stores/useLayoutStore.ts` com tipagem forte e `partialize` persistindo apenas `sidebarWidth`, `requestResponseRatio` e `sidebarCollapsed`.

- [ ] **Step 5: Executar teste para verificar aprovação**
Executar: `npm test frontend/src/stores/useLayoutStore.test.ts`
Esperado: PASS.

---

### Task 2: Componente Reutilizável `PanelSplitter`

**Files:**
- Create: `frontend/src/components/layout/PanelSplitter.tsx`
- Test: `frontend/src/components/layout/PanelSplitter.test.tsx`

**Interfaces:**
- Consumes: Nenhum (componente controlado e desacoplado).
- Produces:
  ```ts
  export interface PanelSplitterProps {
    id: string;
    ariaLabel: string;
    direction?: 'horizontal';
    valueNow?: number;
    valueMin?: number;
    valueMax?: number;
    onDeltaChange: (deltaPixels: number) => void;
    onReset?: () => void;
    className?: string;
  }
  export const PanelSplitter: React.FC<PanelSplitterProps>;
  ```

- [ ] **Step 1: Escrever teste unitário para `PanelSplitter`**
Criar `frontend/src/components/layout/PanelSplitter.test.tsx` cobrindo atributos ARIA (`role="separator"`, `aria-orientation="vertical"`), pointer events (`pointerdown`, `pointermove`), duplo clique para reset e navegação por teclado (`ArrowLeft`, `ArrowRight`).

- [ ] **Step 2: Executar teste para verificar falha**
Executar: `npm test frontend/src/components/layout/PanelSplitter.test.tsx`
Esperado: FAIL com módulo não encontrado.

- [ ] **Step 3: Implementar `PanelSplitter.tsx`**
Criar o componente em `frontend/src/components/layout/PanelSplitter.tsx` com `setPointerCapture`, feedback visual no hover/dragging com Tailwind e listeners de teclado/duplo clique.

- [ ] **Step 4: Executar teste para verificar aprovação**
Executar: `npm test frontend/src/components/layout/PanelSplitter.test.tsx`
Esperado: PASS.

---

### Task 3: Store de Ambientes e Variáveis (`useEnvironmentStore`)

**Files:**
- Create: `frontend/src/stores/useEnvironmentStore.ts`
- Test: `frontend/src/stores/useEnvironmentStore.test.ts`

**Interfaces:**
- Consumes: `EnvironmentGroup`, `VariableItem` de `@/components/environment/EnvironmentModal` e `@/lib/variables`.
- Produces:
  ```ts
  export interface EnvironmentState {
    environments: EnvironmentGroup[];
    activeEnvironment: string | null;
    globals: VariableItem[];
    collectionVariables: VariableItem[];
    setEnvironments: (envs: EnvironmentGroup[]) => void;
    setActiveEnvironment: (name: string | null) => void;
    setGlobals: (vars: VariableItem[]) => void;
    setCollectionVariables: (vars: VariableItem[]) => void;
    getResolvedVariables: () => Record<string, string>;
  }
  export const useEnvironmentStore: UseBoundStore<StoreApi<EnvironmentState>>;
  ```

- [ ] **Step 1: Escrever teste de unidade para `useEnvironmentStore`**
Criar `frontend/src/stores/useEnvironmentStore.test.ts` testando cascata de variáveis (Globals -> Collection -> Active Environment), ativação e inativação de variáveis e persistência no localStorage.

- [ ] **Step 2: Executar teste para verificar falha**
Executar: `npm test frontend/src/stores/useEnvironmentStore.test.ts`
Esperado: FAIL com módulo não encontrado.

- [ ] **Step 3: Implementar `useEnvironmentStore`**
Criar `frontend/src/stores/useEnvironmentStore.ts` integrando com os helpers canônicos de `src/lib/variables.ts` e persistindo apenas ambientes e variáveis globais.

- [ ] **Step 4: Executar teste para verificar aprovação**
Executar: `npm test frontend/src/stores/useEnvironmentStore.test.ts`
Esperado: PASS.

---

### Task 4: Store de Workspaces (`useWorkspaceStore`)

**Files:**
- Create: `frontend/src/stores/useWorkspaceStore.ts`
- Test: `frontend/src/stores/useWorkspaceStore.test.ts`

**Interfaces:**
- Consumes: `WorkspaceDto`, `fetchWorkspacesApi`, `createWorkspaceApi` de `@/lib/treeApi`.
- Produces:
  ```ts
  export interface WorkspaceState {
    workspaces: WorkspaceDto[];
    activeWorkspaceId: string | null;
    isLoading: boolean;
    error: string | null;
    setWorkspaces: (workspaces: WorkspaceDto[]) => void;
    setActiveWorkspaceId: (id: string | null) => void;
    fetchWorkspaces: (preferredId?: string) => Promise<WorkspaceDto[]>;
    createWorkspace: (name: string) => Promise<WorkspaceDto>;
  }
  export const useWorkspaceStore: UseBoundStore<StoreApi<WorkspaceState>>;
  ```

- [ ] **Step 1: Escrever teste de unidade para `useWorkspaceStore`**
Criar `frontend/src/stores/useWorkspaceStore.test.ts` cobrindo carregamento de workspaces, seleção com fallback, criação e persistência do `activeWorkspaceId`.

- [ ] **Step 2: Executar teste para verificar falha**
Executar: `npm test frontend/src/stores/useWorkspaceStore.test.ts`
Esperado: FAIL com módulo não encontrado.

- [ ] **Step 3: Implementar `useWorkspaceStore`**
Criar `frontend/src/stores/useWorkspaceStore.ts` com persistência de `activeWorkspaceId` e integração assíncrona com `fetchWorkspacesApi` e `createWorkspaceApi`.

- [ ] **Step 4: Executar teste para verificar aprovação**
Executar: `npm test frontend/src/stores/useWorkspaceStore.test.ts`
Esperado: PASS.

---

### Task 5: Store de Requisições e Execução (`useRequestStore`)

**Files:**
- Create: `frontend/src/stores/useRequestStore.ts`
- Test: `frontend/src/stores/useRequestStore.test.ts`

**Interfaces:**
- Consumes: `RequestData`, `ResponseData`, `DependencyRequest`, `ExecutionTarget`.
- Produces:
  ```ts
  export interface RequestState {
    activeRequestId: string | null;
    activeRequestDetails: any | null;
    currentEditorData: RequestData | null;
    pendingSaveData: RequestData | null;
    isSavingRequest: boolean;
    isLoading: boolean;
    isAgentOnline: boolean;
    response: ResponseData | null;
    requestHistory: DependencyRequest[];
    setActiveRequest: (id: string | null, details: any | null) => void;
    setCurrentEditorData: (data: RequestData | null) => void;
    setPendingSaveData: (data: RequestData | null) => void;
    setIsSavingRequest: (isSaving: boolean) => void;
    setIsLoading: (isLoading: boolean) => void;
    setIsAgentOnline: (isOnline: boolean) => void;
    setResponse: (response: ResponseData | null) => void;
    addRequestHistory: (request: DependencyRequest) => void;
    resetScratchpad: () => void;
  }
  export const useRequestStore: UseBoundStore<StoreApi<RequestState>>;
  ```

- [ ] **Step 1: Escrever teste de unidade para `useRequestStore`**
Criar `frontend/src/stores/useRequestStore.test.ts` testando atualização de editor, adição de respostas ao histórico em memória e reset de scratchpad.

- [ ] **Step 2: Executar teste para verificar falha**
Executar: `npm test frontend/src/stores/useRequestStore.test.ts`
Esperado: FAIL com módulo não encontrado.

- [ ] **Step 3: Implementar `useRequestStore`**
Criar `frontend/src/stores/useRequestStore.ts` garantindo que `response` e `requestHistory` permaneçam em memória (não persistidos em localStorage).

- [ ] **Step 4: Executar teste para verificar aprovação**
Executar: `npm test frontend/src/stores/useRequestStore.test.ts`
Esperado: PASS.

---

### Task 6: Refatoração do `page.tsx` com `PanelSplitter` e Conexão das Stores

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Consumes: `useLayoutStore`, `useWorkspaceStore`, `useRequestStore`, `useEnvironmentStore`, `PanelSplitter`.
- Produces: Página inicial refatorada sem prop drilling excessivo e com splitters funcionais.

- [ ] **Step 1: Escrever testes de integração para redimensionamento no `page.test.tsx`**
Adicionar casos de teste validando que os splitters da Sidebar e do Request/Response estão presentes no DOM com seus respectivos `aria-label` e respondem aos eventos de redimensionamento.

- [ ] **Step 2: Integrar stores e splitters no `frontend/src/app/page.tsx`**
Substituir os `useState` locais pelas chamadas das stores Zustand correspondentes e injetar os componentes `PanelSplitter` entre a Sidebar e o Workspace, e entre `RequestEditor` e `ResponseViewer`.

- [ ] **Step 3: Executar testes de `page.test.tsx`**
Executar: `npm test frontend/src/app/page.test.tsx`
Esperado: PASS com todos os testes da página verdes.

---

### Task 7: Validação Completa de Regressão e Build

**Files:**
- Entire frontend test suite

- [ ] **Step 1: Executar suíte completa de testes do frontend**
Executar: `npm test` no diretório `frontend`.
Esperado: Todos os 25+ arquivos de teste e mais de 430 testes passando (100% de aprovação).

- [ ] **Step 2: Executar build de produção do Next.js**
Executar: `npm run build` no diretório `frontend`.
Esperado: Compilação de produção sem erros de TypeScript ou Next.js.
