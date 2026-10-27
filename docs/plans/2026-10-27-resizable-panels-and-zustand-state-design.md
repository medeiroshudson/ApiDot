# Design Técnico: Painéis Redimensionáveis e Estado Global com Zustand no ApiDot

**Data:** 2026-10-27  
**Status:** Em Revisão Técnica (Builder Check)  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Frontend (Next.js 15 / React 19 / Tailwind CSS / Zustand)

---

## 1. Intenção e Motivação (The Why)

Atualmente, a interface desktop do ApiDot possui divisões de layout rígidas:
1. A barra lateral de coleções e workspaces possui largura fixa (`w-64` / 256px), impedindo a visualização confortável de coleções com nomes longos ou caminhos de pastas aninhados.
2. Os painéis centrais de **Requisição** (`RequestEditor`) e **Resposta** (`ResponseViewer`) dividem o espaço igualmente (`flex-1` / 50% cada) em telas desktop. O usuário não consegue expandir o editor para redigir payloads JSON complexos nem expandir a resposta para analisar respostas volumosas ou cachoeiras de tempo (`TimingWaterfall`).
3. O componente `page.tsx` acumula mais de 15 estados locais (`useState`), múltiplos efeitos colaterais e persistência manual com `localStorage`, criando acoplamento excessivo e tornando a manutenção e a renderização reativa propensas a sobrecarga.

Este projeto introduz:
- Divisores arrastáveis (splitters) com memória persistente para a Sidebar (largura) e para a divisão Requisição / Resposta (proporção).
- Uma arquitetura modular de estado global utilizando **Zustand** com persistência seletiva (`persist` middleware), desacoplando layout, workspaces, requisições e variáveis de ambiente.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Divisor Central Redimensionável (Request vs. Response):**
  - Barra divisora vertical entre `RequestEditor` e `ResponseViewer` em desktop.
  - Arraste suave com cursor `col-resize`, feedback visual no hover/ativo e limites seguros (mínimo de 20% e máximo de 80% da área útil do workspace).
  - Duplo-clique no divisor redefine a proporção para 50/50.
  - Acessibilidade por teclado (`role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`, suporte a setas esquerda/direita com passos de 2% ou 5%).
- **Sidebar Esquerda Redimensionável:**
  - Barra divisora entre a Sidebar de coleções e a área de trabalho principal.
  - Limites seguros: mínimo de 180px e máximo de 480px (largura padrão: 256px).
  - Duplo-clique redefine para o tamanho padrão (256px).
- **Persistência Imediata de Preferências:**
  - Proporção Request/Response e largura da Sidebar salvas no `localStorage` via Zustand e restauradas automaticamente ao recarregar a página ou reabrir o navegador.
  - Zero layout shift perceptível com hidratação segura no Next.js (SSR/client-side hydration).
- **Modularização de Estado Global com Zustand:**
  - Criação de 4 stores atômicas:
    - `useLayoutStore`: largura da sidebar, proporção dos painéis, abas mobile, estado dos modais e banners de notificação.
    - `useWorkspaceStore`: lista de workspaces, workspace ativo, árvore de coleções, filtro de busca e CRUD de nós.
    - `useRequestStore`: requisição ativa, detalhes, rascunho de edição (dirty state), resposta HTTP da execução e histórico de requisições encadeáveis.
    - `useEnvironmentStore`: ambientes, variáveis globais, variáveis de coleção e variáveis ativas resolvidas.
- **Manutenção de 100% dos Contratos e Testes:**
  - Todos os 25 arquivos de teste e mais de 411 testes existentes continuam passando sem quebras.
  - Adição de novos testes unitários para o componente `PanelSplitter` e para as stores Zustand.

### 2.2. Não-Metas (Non-Goals)
- Divisão horizontal entre Request e Response (painéis empilhados verticalmente) — o layout desktop permanece lado a lado com redimensionamento horizontal; o layout mobile continua utilizando as abas "Requisição" e "Resposta".
- Redimensionamento de painéis internos do `RequestEditor` (ex: abas Headers vs. Body).
- Instalação de bibliotecas externas pesadas de painéis redimensionáveis que conflitem com React 19.

### 2.3. Anti-Metas (Anti-Goals)
- **Persistir dados voláteis ou sensíveis indiscriminadamente:** Não salvar respostas HTTP volumosas, senhas de variáveis marcadas como secretas em texto puro ou payloads binários em `localStorage`.
- **Store Monolítica Gigante:** Não criar um único `useAppStore` com dezenas de actions mescladas.
- **Flicker de Layout no SSR:** Não permitir que os painéis apareçam em 50% e saltem abruptamente para 70% sem proteção contra flash de hidratação.

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem A: Stores Modulares Zustand + Splitter Nativo React/Tailwind (Escolhida)
- Utiliza a biblioteca oficial e minimalista `zustand` (`npm install zustand`).
- Divide as responsabilidades em 4 stores dedicadas: `useLayoutStore`, `useWorkspaceStore`, `useRequestStore` e `useEnvironmentStore`.
- Implementa um componente nativo e leve `PanelSplitter` com `PointerEvents` (`setPointerCapture`), garantindo que o arraste funcione perfeitamente mesmo se o cursor passar sobre iframes, CodeMirror ou seletores de texto.
- **Motivo da Escolha:** Alta performance, zero risco de conflito com React 19, re-renderizações isoladas e controle total do design system (Tailwind).

### Abordagem B: Store Única Monolítica (`useAppStore`) (Descartada)
- Concentrar todos os estados e actions em um único objeto de store.
- **Motivo do Descarte:** Aumenta o acoplamento, dificulta a testabilidade isolada e torna a configuração de `partialize` (para escolher o que vai ao `localStorage`) frágil e propensa a vazamento de memória.

### Abordagem C: Biblioteca Externa (`react-resizable-panels`) (Descartada)
- Delegar a mecânica de redimensionamento a uma biblioteca de terceiros.
- **Motivo do Descarte:** Conflitos comuns de peer dependencies com React 19 e Next.js 15 App Router, além de introduzir overhead desnecessário para um comportamento perfeitamente solucionável de forma declarativa e atômica.

---

## 4. Arquitetura Detalhada

### 4.0. Decisões Arquiteturais de Contorno (Builder Check Resolution)

A partir da revisão técnica de viabilidade, foram firmadas as seguintes diretrizes para garantir estabilidade operacional e zero regressão:
1. **Preservação dos Contratos de Componentes Filhos:**
   - Componentes visuais (`RequestEditor`, `CollectionTree`, `EnvironmentModal`, `ResponseViewer`, etc.) continuarão recebendo suas propriedades via props normais.
   - `page.tsx` (ou contêineres de página) consumirá os seletores das stores Zustand e distribuirá os dados aos filhos.
   - **Garantia:** Isso impede quebras em cascata e mantém 100% íntegros os mais de 411 testes unitários já existentes.
2. **Coexistência entre `useWorkspaceStore` e `useCollectionTree`:**
   - `useWorkspaceStore` gerencia a lista global de workspaces e o `activeWorkspaceId`.
   - O hook `useCollectionTree` permanece como o motor especializado de manipulação e filtragem da árvore para o workspace ativo, preservando seus 26 testes unitários isolados (`useCollectionTree.test.ts`).
3. **Orquestração Multidomínio Desacoplada:**
   - Fluxos que cruzam múltiplos domínios (como `handleSend`, que lê variáveis do ambiente, dispara a requisição e alterna a aba mobile para resposta) são orquestrados em handlers de alto nível no `page.tsx` ou em hook coordenador, mantendo as stores atômicas, sem acoplamento cruzado (`getState()`) e facilmente testáveis.
4. **Política de Persistência Segura (`localStorage`):**
   - **`useLayoutStore`:** Persiste `sidebarWidth`, `requestResponseRatio` e `sidebarCollapsed`.
   - **`useWorkspaceStore`:** Persiste apenas `activeWorkspaceId`.
   - **`useEnvironmentStore`:** Persiste `environments`, `activeEnvironment` e `globals` para continuidade de sessão do desenvolvedor.
   - **`useRequestStore`:** A resposta HTTP atual (`response`) e o histórico de requisições encadeáveis (`requestHistory`) são mantidos em memória durante a sessão para evitar exceder o limite de 5MB do `localStorage` (`QuotaExceededError`) com grandes payloads JSON ou binários. Apenas o rascunho da requisição em edição (`scratchpad`) pode ser recuperado.

---

### 4.1. Componente `PanelSplitter` (`frontend/src/components/layout/PanelSplitter.tsx`)

O componente `PanelSplitter` atua como divisor entre dois blocos irmãos:
```tsx
interface PanelSplitterProps {
  id: string;
  ariaLabel: string;
  direction?: 'horizontal'; // redimensionamento no eixo X (col-resize)
  onDeltaChange: (deltaPixels: number) => void;
  onReset?: () => void;
  className?: string;
}
```
**Mecânica de Arraste:**
- `onPointerDown`: registra a posição inicial (`startX = e.clientX`), define estado `isDragging = true` e chama `e.currentTarget.setPointerCapture(e.pointerId)`.
- `onPointerMove`: se `isDragging`, calcula `delta = e.clientX - startX`, chama `onDeltaChange(delta)`, e atualiza `startX = e.clientX`.
- `onPointerUp` / `onPointerCancel`: libera o ponteiro com `releasePointerCapture` e seta `isDragging = false`.
- Previne seleção acidental de texto adicionando `select-none` durante o arraste.
- Suporta duplo-clique (`onDoubleClick`) para invocar `onReset()`.
- Suporte a teclado: `onKeyDown` para teclas `ArrowLeft` / `ArrowRight` (passo fixo de pixels ou percentual) e `Home` / `End` ou duplo `Enter` para reset.

---

### 4.2. Estrutura das Stores Zustand (`frontend/src/stores/`)

#### 1. `useLayoutStore.ts`
Gerencia geometria de layout e visibilidade de modais:
- **Estado Persistente (`localStorage` chave: `apidot_layout_preferences`):**
  - `sidebarWidth: number` (padrão: 256px, mín: 180px, máx: 480px)
  - `requestResponseRatio: number` (padrão: 50, mín: 20, máx: 80 - representa % da largura do painel de Request)
  - `sidebarCollapsed: boolean` (padrão: false)
- **Estado Volátil (Transient UI):**
  - `activeMobilePane: 'request' | 'response'` (padrão: 'request')
  - `isWorkspaceModalOpen: boolean`
  - `isSaveModalOpen: boolean`
  - `isEnvModalOpen: boolean`
  - `isCollectionSettingsOpen: boolean`
  - `isImportOpenApiModalOpen: boolean`
  - `isDrawerOpen: boolean`
  - `auditBanner: { collectionName: string; report: SyncReport } | null`
  - `syncError: string | null`
- **Actions:**
  - `setSidebarWidth(width: number)`
  - `setRequestResponseRatio(ratio: number)`
  - `adjustSidebarWidth(deltaPx: number)`
  - `adjustRequestResponseRatio(deltaPct: number)`
  - `resetSidebarWidth()`
  - `resetRequestResponseRatio()`
  - `toggleSidebarCollapsed()`
  - `setActiveMobilePane(pane: 'request' | 'response')`
  - `setModalOpen(modalKey: string, isOpen: boolean)`
  - `setAuditBanner(...)`, `setSyncError(...)`

#### 2. `useWorkspaceStore.ts`
Gerencia workspaces e sincronização da árvore de coleções:
- **Estado:**
  - `workspaces: WorkspaceDto[]`
  - `activeWorkspaceId: string | null` (persistido via `apidot_active_workspace_id`)
  - `isWorkspacesLoading: boolean`
  - `tree: WorkspaceTreeDto | null`
  - `filterText: string`
  - `activeItem: ActiveTreeItem | null`
  - `isTreeLoading: boolean`
  - `treeError: string | null`
  - `selectedCollectionId: string | null`
  - `syncingCollectionId: string | null`
  - `editingCollection: CollectionNodeDto | null`
- **Actions:**
  - `fetchWorkspaces(preferredWorkspaceId?: string): Promise<WorkspaceDto[]>`
  - `selectWorkspace(id: string): void`
  - `createWorkspace(name: string): Promise<WorkspaceDto>`
  - `loadTree(workspaceId: string): Promise<void>`
  - `setFilterText(term: string): void`
  - `setActiveItem(item: ActiveTreeItem | null): void`
  - Operações CRUD na árvore delegadas à API com atualização do estado em memória.

#### 3. `useRequestStore.ts`
Gerencia a requisição em foco no editor, envio HTTP e histórico:
- **Estado:**
  - `activeRequestId: string | null`
  - `activeRequestDetails: RequestItemDetails | null`
  - `currentEditorData: RequestData | null`
  - `pendingSaveData: RequestData | null`
  - `isSavingRequest: boolean`
  - `isAgentOnline: boolean`
  - `isLoading: boolean` (despacho HTTP ativo)
  - `response: ResponseData | null`
  - `requestHistory: DependencyRequest[]` (persistido seletivamente com limite das últimas 20 requisições)
- **Actions:**
  - `selectRequest(req: RequestItemNodeDto): void`
  - `setEditorData(data: RequestData): void`
  - `resetToScratchpad(): void`
  - `dispatchRequest(requestData: RequestData, contextVariables: Record<string, string>): Promise<void>`
  - `setResponse(response: ResponseData | null): void`
  - `addHistory(req: DependencyRequest): void`

#### 4. `useEnvironmentStore.ts`
Gerencia ambientes, variáveis globais, variáveis de coleção e resolução de escopo:
- **Estado (Persistido via `apidot_environment_storage`):**
  - `environments: EnvironmentGroup[]`
  - `activeEnvironment: string | null`
  - `globals: VariableItem[]`
  - `collectionVariables: VariableItem[]`
- **Computed / Selectors:**
  - `availableVariables: AutocompleteVariable[]`
  - `resolvedVariables: Record<string, string>`
- **Actions:**
  - `setEnvironments(envs: EnvironmentGroup[]): void`
  - `setActiveEnvironment(name: string | null): void`
  - `setGlobals(vars: VariableItem[]): void`
  - `setCollectionVariables(vars: VariableItem[]): void`

---

### 4.3. Integração no Layout Principal (`page.tsx`)

Na visualização desktop (`hidden md:flex`), a estrutura DOM é ajustada da seguinte forma:

```tsx
<div className="flex flex-1 overflow-hidden">
  {/* Sidebar com largura dinâmica inline style e transição suave quando não estiver arrastando */}
  <aside
    style={{ width: `${sidebarWidth}px` }}
    className="hidden md:flex flex-col border-r border-neutral-800 bg-neutral-900/50 p-4 overflow-hidden shrink-0"
  >
    {renderSidebarContent()}
  </aside>

  {/* Divisor Sidebar <-> Workspace */}
  <PanelSplitter
    id="sidebar-splitter"
    ariaLabel="Redimensionar barra lateral de coleções"
    onDeltaChange={handleSidebarResize}
    onReset={resetSidebarWidth}
  />

  {/* Workspace com contêiner relativo para cálculo do percentual */}
  <main ref={workspaceRef} className="flex-1 flex flex-col md:flex-row overflow-hidden bg-neutral-950">
    {/* Painel de Requisição: largura configurável no desktop */}
    <section
      style={{ flex: isDesktop ? `0 0 ${requestResponseRatio}%` : undefined }}
      className={`border-b md:border-b-0 border-neutral-800 overflow-hidden flex flex-col ${
        activeMobilePane === 'request' ? 'flex flex-1' : 'hidden md:flex'
      }`}
    >
      <RequestEditor ... />
    </section>

    {/* Divisor Request <-> Response (apenas desktop) */}
    <div className="hidden md:flex items-stretch">
      <PanelSplitter
        id="request-response-splitter"
        ariaLabel="Redimensionar painel de requisição e resposta"
        onDeltaChange={handlePanelsResize}
        onReset={resetRequestResponseRatio}
      />
    </div>

    {/* Painel de Resposta: preenche o restante da área */}
    <section
      className={`flex-1 overflow-hidden flex flex-col ${
        activeMobilePane === 'response' ? 'flex' : 'hidden md:flex'
      }`}
    >
      <ResponseViewer ... />
    </section>
  </main>
</div>
```

---

## 5. Estratégia de Testes e Validação

1. **Testes Unitários do `PanelSplitter` (`PanelSplitter.test.tsx`):**
   - Renderização correta com atributos ARIA (`role="separator"`, `aria-orientation="vertical"`).
   - Resposta a eventos de ponteiro (`pointerdown`, `pointermove`, `pointerup`).
   - Disparo de reset no duplo-clique.
   - Resposta a navegação por setas do teclado.
2. **Testes Unitários das Stores Zustand:**
   - `useLayoutStore.test.ts`: verificação de limites (min/max), reset e persistência no localStorage.
   - `useEnvironmentStore.test.ts`: cascata de variáveis e atualização de ambiente ativo.
   - `useWorkspaceStore.test.ts` e `useRequestStore.test.ts`: despacho de ações e fluxo de dados.
3. **Testes de Regressão da Aplicação:**
   - Execução de toda a suíte existente (`npm test`), assegurando que todos os 411 testes existentes permaneçam verdes.
   - Validação da renderização de `page.test.tsx` com as novas stores integradas.

---

## 6. O que Fica a Critério do Implementador (Builder Freedom)
- Estilização exata do elemento visual central do divisor (ex: largura do hit target invisível de 6px ou 8px com linha visível de 1px a 2px em `neutral-800` realçada para `sky-500` no hover).
- Otimização do listener de resize com `requestAnimationFrame` durante o arraste caso necessário para fluidez a 60 FPS.
- Decisão sobre granularidade de exportação de hooks seletores (ex: `useSidebarWidth = () => useLayoutStore(s => s.sidebarWidth)`).
