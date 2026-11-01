# Redesenho da Topbar, Barra de Requisição e Gestão Híbrida de Variáveis de Coleção — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Otimizar o layout da topbar no mobile e desktop via `EnvironmentPill`, unificar a barra de requisição em linha única compacta com botão de envio informativo enxuto, e implementar o gerenciamento híbrido de variáveis para $N$ coleções no frontend.

**Architecture:** 
- `AppHeader.tsx`: Substituição do par `<Select>` + `<Sliders>` pelo componente compacto `EnvironmentPill` com dropdown e link gerenciador; ocultação da engrenagem isolada no mobile com transferência para o menu de perfil (`UserDropdown`).
- `RequestEditor.tsx`: Layout em linha única contínua (`h-9`), botão split enxuto (`[ ⚡ Enviar | ▾ ]` ou `[ ☁️ Enviar | ▾ ]`), semáforo offline no botão principal sem bloquear o chevron de troca rápida.
- `useEnvironmentStore.ts`: Dicionário `collectionVariablesByCollectionId: Record<string, VariableItem[]>` com persistência em `localStorage` e suporte a `activeCollectionId`.
- `CollectionSettingsModal.tsx` & `EnvironmentModal.tsx`: Aba dedicada de variáveis por coleção nas configurações da coleção (`CollectionSettingsModal`) e seletor de coleção no hub global (`EnvironmentModal`).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide React, Zustand, Vitest, Testing Library.

**Spec:** `docs/plans/2026-11-01-mobile-topbar-and-request-bar-redesign-design.md`

## Global Constraints

- Altura baseline da barra de requisição e controles padronizada em `h-9` (36px).
- Nenhuma dependência externa adicional; utilizar componentes existentes e Tailwind CSS.
- Altura da topbar preservada em `h-14` (56px) com alvos de toque mobile ≥40px.
- Todos os textos de interface internacionalizados em `pt-BR` e `en-US`.
- Zero regressões nos testes existentes do Vitest.

## Review Focus

1. **Agente offline com alvo explícito vs herdado:** Quando `target === 'Agent'` e `isAgentOnline === false`, o botão principal de envio deve estar `disabled` e com `opacity-50`; quando `target === 'Inherit'`, deve realizar fallback para `Server` sem desativar o botão.
2. **Chevron sempre clicável:** O botão de chevron `[ ▾ ]` no split button deve permanecer clicável mesmo quando o botão principal estiver desativado por agente offline.
3. **Persistência de variáveis entre múltiplas coleções:** Variáveis editadas na Coleção A não podem sobrescrever nem vazar para a Coleção B ao alternar no seletor do `EnvironmentModal` ou no `CollectionSettingsModal`.
4. **Sem falso `isDirty` no envio via chevron:** Disparar a requisição com override de alvo pelo menu do chevron não pode marcar a requisição com `isDirty = true`.
5. **Comportamento do `autoGrow` na URL:** A URL deve permanecer em 36px por padrão e expandir até 84px apenas com foco ativo, mantendo alinhamento `items-start` com Método e Enviar.

---

### Task 1: i18n Localization Keys

**Files:**
- Modify: `frontend/src/i18n/locales/pt-BR.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`
- Test: `frontend/src/i18n/index.test.ts`

**Interfaces:**
- Produces: Chaves de tradução adicionadas nas seções `header`, `request`, `environments`, e `collection`.

- [ ] **Step 1: Escrever teste para as novas chaves de tradução**

```typescript
// frontend/src/i18n/index.test.ts
it('should have all new topbar, request bar, and collection variables keys in pt-BR and en-US', () => {
  const { ptBR, enUS } = require('./index');
  const requiredKeys = [
    'header.environmentSelectorAria',
    'header.environmentManage',
    'request.agentOfflineTooltip',
    'request.targetServer',
    'request.targetAgent',
    'environments.selectCollection',
    'environments.noCollections',
    'collection.variablesTab',
    'collection.variablesTitle',
    'collection.variablesDescription',
  ];
  requiredKeys.forEach((key) => {
    const [section, subkey] = key.split('.');
    expect(ptBR[section]?.[subkey]).toBeDefined();
    expect(enUS[section]?.[subkey]).toBeDefined();
  });
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `cd frontend && npx vitest run src/i18n/index.test.ts`  
Expected: FAIL indicando chaves ausentes.

- [ ] **Step 3: Adicionar chaves em `pt-BR.ts` e `en-US.ts`**

Adicionar as seguintes chaves em `frontend/src/i18n/locales/pt-BR.ts`:
- `header.environmentSelectorAria`: "Selecionar ambiente ativo"
- `header.environmentManage`: "Gerenciar ambientes e variáveis..."
- `request.agentOfflineTooltip`: "Agente local desconectado. Alterne para o Servidor para enviar."
- `request.targetServer`: "Servidor (Nuvem)"
- `request.targetAgent`: "Agente Local"
- `environments.selectCollection`: "Coleção"
- `environments.noCollections`: "Nenhuma coleção encontrada neste workspace."
- `collection.variablesTab`: "Variáveis"
- `collection.variablesTitle`: "Variáveis da Coleção"
- `collection.variablesDescription`: "Variáveis exclusivas desta coleção, acessíveis por todas as suas requisições."

Adicionar as respectivas traduções em `frontend/src/i18n/locales/en-US.ts`:
- `header.environmentSelectorAria`: "Select active environment"
- `header.environmentManage`: "Manage environments and variables..."
- `request.agentOfflineTooltip`: "Local agent offline. Switch to Server to send."
- `request.targetServer`: "Server (Cloud)"
- `request.targetAgent`: "Local Agent"
- `environments.selectCollection`: "Collection"
- `environments.noCollections`: "No collections found in this workspace."
- `collection.variablesTab`: "Variables"
- `collection.variablesTitle`: "Collection Variables"
- `collection.variablesDescription`: "Variables exclusive to this collection, accessible by all its requests."

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `cd frontend && npx vitest run src/i18n/index.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/pt-BR.ts frontend/src/i18n/locales/en-US.ts frontend/src/i18n/index.test.ts
git commit -m "feat(i18n): add localization keys for topbar, request bar, and collection variables"
```

---

### Task 2: Multi-Collection State no `useEnvironmentStore`

**Files:**
- Modify: `frontend/src/stores/useEnvironmentStore.ts`
- Test: `frontend/src/stores/useEnvironmentStore.test.ts`

**Interfaces:**
- Consumes: `VariableItem` de `@/components/environment/VariableGrid`.
- Produces: 
  - `collectionVariablesByCollectionId: Record<string, VariableItem[]>`
  - `activeCollectionId: string | null`
  - `setActiveCollectionId(id: string | null): void`
  - `setCollectionVariablesForId(collectionId: string, vars: VariableItem[]): void`
  - `getCollectionVariablesForId(collectionId: string): VariableItem[]`
  - Atualização do `partialize` para persistir `collectionVariablesByCollectionId`.

- [ ] **Step 1: Escrever testes unitários para gerenciamento por `collectionId`**

```typescript
// frontend/src/stores/useEnvironmentStore.test.ts
it('should store and retrieve variables isolated by collectionId', () => {
  const store = useEnvironmentStore.getState();
  const colAVars = [{ key: 'API_URL', value: 'https://api-a.com', isActive: true }];
  const colBVars = [{ key: 'API_URL', value: 'https://api-b.com', isActive: true }];

  store.setCollectionVariablesForId('col-a', colAVars);
  store.setCollectionVariablesForId('col-b', colBVars);

  expect(store.getCollectionVariablesForId('col-a')).toEqual(colAVars);
  expect(store.getCollectionVariablesForId('col-b')).toEqual(colBVars);
  expect(store.getCollectionVariablesForId('col-nonexistent')).toEqual([]);
});

it('should resolve variables using activeCollectionId', () => {
  const store = useEnvironmentStore.getState();
  store.setGlobals([{ key: 'GLOBAL_VAR', value: 'global', isActive: true }]);
  store.setCollectionVariablesForId('col-active', [{ key: 'COL_VAR', value: 'from-col-a', isActive: true }]);
  store.setActiveCollectionId('col-active');

  const resolved = store.getResolvedVariables();
  expect(resolved['GLOBAL_VAR']).toBe('global');
  expect(resolved['COL_VAR']).toBe('from-col-a');
});
```

- [ ] **Step 2: Executar testes para verificar falha**

Run: `cd frontend && npx vitest run src/stores/useEnvironmentStore.test.ts`  
Expected: FAIL com funções indefinidas.

- [ ] **Step 3: Implementar métodos no `useEnvironmentStore.ts`**

1. Adicionar campos na interface `EnvironmentState`:
   - `collectionVariablesByCollectionId: Record<string, VariableItem[]>`
   - `activeCollectionId: string | null`
   - `setActiveCollectionId: (id: string | null) => void`
   - `setCollectionVariablesForId: (collectionId: string, vars: VariableItem[]) => void`
   - `getCollectionVariablesForId: (collectionId: string) => VariableItem[]`
2. Implementar no creator:
   - `activeCollectionId: null`
   - `collectionVariablesByCollectionId: {}`
   - `setActiveCollectionId: (id) => set({ activeCollectionId: id })`
   - `setCollectionVariablesForId: (colId, vars) => set((s) => ({ collectionVariablesByCollectionId: { ...s.collectionVariablesByCollectionId, [colId]: vars } }))`
   - `getCollectionVariablesForId: (colId) => get().collectionVariablesByCollectionId[colId] || []`
3. Atualizar getter `getResolvedVariables` e `getAvailableVariables` para usar `activeCollectionId`:
   - Se `activeCollectionId` estiver definido, busca `collectionVariablesByCollectionId[activeCollectionId] || []`.
4. Incluir `collectionVariablesByCollectionId` no `partialize` para persistência em `localStorage`.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/stores/useEnvironmentStore.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/useEnvironmentStore.ts frontend/src/stores/useEnvironmentStore.test.ts
git commit -m "feat(store): add multi-collection variable isolation and persistence in useEnvironmentStore"
```

---

### Task 3: Topbar `EnvironmentPill` e Limpeza Mobile no `AppHeader`

**Files:**
- Modify: `frontend/src/components/layout/AppHeader.tsx`
- Test: `frontend/src/components/layout/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `environments`, `activeEnvironment`, `onSelectEnvironment`, `onOpenEnvironmentSettings`, `onOpenSettings`.
- Produces: Componente `EnvironmentPill` interativo com dropdown acessível e link gerenciador; ocultação da engrenagem isolada no mobile com transferência para o menu do usuário.

- [ ] **Step 1: Atualizar testes do `AppHeader.test.tsx`**

```typescript
// frontend/src/components/layout/AppHeader.test.tsx
it('renders environment pill with active environment indicator and opens dropdown on click', () => {
  render(
    <AppHeader
      environments={['Development', 'Production']}
      activeEnvironment="Production"
    />
  );
  const pill = screen.getByRole('button', { name: /selecionar ambiente ativo/i });
  expect(pill).toBeInTheDocument();
  expect(pill).toHaveTextContent('Production');

  fireEvent.click(pill);
  expect(screen.getByRole('menu', { name: /ambientes disponíveis/i })).toBeInTheDocument();
  expect(screen.getByText('Development')).toBeInTheDocument();
  expect(screen.getByText('Gerenciar ambientes e variáveis...')).toBeInTheDocument();
});

it('calls onOpenEnvironmentSettings when clicking manage link inside environment pill dropdown', () => {
  const onOpenEnvSettings = vi.fn();
  render(
    <AppHeader
      environments={['Production']}
      activeEnvironment="Production"
      onOpenEnvironmentSettings={onOpenEnvSettings}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /selecionar ambiente ativo/i }));
  fireEvent.click(screen.getByText('Gerenciar ambientes e variáveis...'));
  expect(onOpenEnvSettings).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Executar testes para verificar falha**

Run: `cd frontend && npx vitest run src/components/layout/AppHeader.test.tsx`  
Expected: FAIL buscando elementos do novo pill.

- [ ] **Step 3: Implementar `EnvironmentPill` e refatorar `AppHeader.tsx`**

1. Substituir `<Select>` e o botão solto `<Sliders>` pelo `EnvironmentPill`:
   - Botão tipo pill com altura `h-8`, dot verde se ativo, dot cinza se sem ambiente, nome truncado e chevron.
   - Estado `isEnvMenuOpen` com ref para fechar no click outside e tecla Escape.
   - Dropdown listando os ambientes disponíveis, opção "Sem ambiente" (`onSelectEnvironment(null)`), divisor e ação *"Gerenciar ambientes e variáveis..."* (`onOpenEnvironmentSettings()`).
2. Ajustar botão de Configurações Globais (`Settings`):
   - Na barra: ocultar no mobile e exibir no desktop com `hidden sm:flex p-2 rounded-md ...`.
   - No menu do usuário (`UserDropdown`): adicionar item "Configurações Globais" com ícone de `Settings` chamando `onOpenSettings()`.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/components/layout/AppHeader.test.tsx`  
Expected: PASS (todos os 19+ testes passando).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppHeader.tsx frontend/src/components/layout/AppHeader.test.tsx
git commit -m "feat(layout): implement unified EnvironmentPill and declutter mobile topbar in AppHeader"
```

---

### Task 4: Barra de Requisição em Linha Única e Botão Enviar Enxuto no `RequestEditor`

**Files:**
- Modify: `frontend/src/components/request/RequestEditor.tsx`
- Test: `frontend/src/components/request/RequestEditor.test.tsx`

**Interfaces:**
- Consumes: `isAgentOnline`, `initialRequest`, `onSend`.
- Produces: Layout contínuo em linha única (`h-9`), split button enxuto com semáforo offline e fallback imediato sem falso `isDirty`.

- [ ] **Step 1: Atualizar testes do `RequestEditor.test.tsx`**

```typescript
// frontend/src/components/request/RequestEditor.test.tsx
it('renders single-row request bar layout and concise send button', () => {
  render(<RequestEditor />);
  const sendButton = screen.getByRole('button', { name: /enviar requisição/i });
  expect(sendButton).toBeInTheDocument();
  expect(sendButton).toHaveTextContent('Enviar');
  expect(sendButton).not.toHaveTextContent('via');
});

it('disables primary send button when target is explicitly Agent and agent is offline, while chevron remains clickable', () => {
  render(
    <RequestEditor
      initialRequest={{ target: 'Agent', url: 'https://api.test' }}
      isAgentOnline={false}
    />
  );
  const sendButton = screen.getByRole('button', { name: /enviar requisição/i });
  expect(sendButton).toBeDisabled();

  const chevron = screen.getByRole('button', { name: /opções de envio/i });
  expect(chevron).not.toBeDisabled();
  fireEvent.click(chevron);
  expect(screen.getByRole('menu')).toBeInTheDocument();
});

it('dispatches immediately and updates target when selecting alternative target in dropdown without marking dirty', () => {
  const onSend = vi.fn();
  render(
    <RequestEditor
      initialRequest={{ target: 'Agent', url: 'https://api.test' }}
      isAgentOnline={false}
      onSend={onSend}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /opções de envio/i }));
  fireEvent.click(screen.getByText(/servidor \(nuvem\)/i));

  expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ target: 'Server' }));
  expect(screen.queryByTestId('dirty-indicator')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Executar testes para verificar falha**

Run: `cd frontend && npx vitest run src/components/request/RequestEditor.test.tsx`  
Expected: FAIL devido à estrutura anterior.

- [ ] **Step 3: Refatorar barra de requisição e botão split em `RequestEditor.tsx`**

1. Container principal: alterar de `flex flex-col sm:flex-row gap-2` para:
   ```tsx
   <div className="p-2 sm:p-2.5 border-b border-neutral-800 bg-neutral-900/40 flex items-start gap-1.5 sm:gap-2 w-full shrink-0">
   ```
2. Método: classe compacta `min-w-[68px] sm:min-w-[76px] h-9 shrink-0`.
3. Input de URL: container `flex-1 min-w-0 relative`, mantendo `autoGrow`.
4. Botão Split:
   - Adicionar estado `runtimeTargetOverride: ExecutionTarget | null` para manter a escolha do dropdown na sessão sem disparar `isDirty`.
   - `effectiveTarget = runtimeTargetOverride ?? (target !== 'Inherit' ? target : (isAgentOnline ? 'Agent' : 'Server'))`.
   - Botão principal:
     - Rótulo: `{isLoading ? t('request.sending') : t('request.send')}`.
     - Ícone: `Cpu` quando `effectiveTarget === 'Agent'`, `Send` quando `effectiveTarget === 'Server'`.
     - `disabled = isLoading || (effectiveTarget === 'Agent' && !isAgentOnline)`.
   - Chevron: sempre habilitado (`disabled={isLoading}`).
   - Dropdown: ao clicar em um alvo, executa `handleSend(selectedTarget)`, atualiza `runtimeTargetOverride` e fecha o menu.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/components/request/RequestEditor.test.tsx`  
Expected: PASS (todos os 23+ testes passando).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/request/RequestEditor.tsx frontend/src/components/request/RequestEditor.test.tsx
git commit -m "feat(editor): implement continuous single-row request bar and concise split send button"
```

---

### Task 5: Aba de Variáveis Contextual no `CollectionSettingsModal`

**Files:**
- Modify: `frontend/src/components/collection/CollectionSettingsModal.tsx`
- Test: `frontend/src/components/collection/CollectionSettingsModal.test.tsx`

**Interfaces:**
- Consumes: `collection`, `useEnvironmentStore`.
- Produces: Aba `variables` em `CollectionModalTab` com `VariableGrid` conectada ao `collection.id`.

- [ ] **Step 1: Escrever teste para a aba de variáveis em `CollectionSettingsModal.test.tsx`**

```typescript
// frontend/src/components/collection/CollectionSettingsModal.test.tsx
it('renders Variables tab and allows adding collection-scoped variables', () => {
  const collection = { id: 'col-123', name: 'Billing API', folders: [], requests: [] };
  render(
    <CollectionSettingsModal
      isOpen={true}
      onClose={vi.fn()}
      collection={collection}
    />
  );
  const varsTab = screen.getByRole('tab', { name: /variáveis/i });
  expect(varsTab).toBeInTheDocument();

  fireEvent.click(varsTab);
  expect(screen.getByText(/variáveis da coleção/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `cd frontend && npx vitest run src/components/collection/CollectionSettingsModal.test.tsx`  
Expected: FAIL indicando que a aba não existe.

- [ ] **Step 3: Implementar aba `variables` em `CollectionSettingsModal.tsx`**

1. Atualizar tipo: `export type CollectionModalTab = 'general' | 'variables' | 'auth' | 'openapi' | 'dependencies';`.
2. Adicionar aba `variables` na tablist com ícone `Sliders` ou `FolderGit2`.
3. Ler as variáveis da coleção via `useEnvironmentStore((s) => s.getCollectionVariablesForId(collection?.id || ''))`.
4. Renderizar `VariableGrid` conectado a `setCollectionVariablesForId(collection.id, updatedVars)`.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/components/collection/CollectionSettingsModal.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/collection/CollectionSettingsModal.tsx frontend/src/components/collection/CollectionSettingsModal.test.tsx
git commit -m "feat(collection): add dedicated variables tab in CollectionSettingsModal"
```

---

### Task 6: Seletor de Coleção no `EnvironmentModal` e Integração no `WorkspaceShell`

**Files:**
- Modify: `frontend/src/components/environment/EnvironmentModal.tsx`
- Modify: `frontend/src/components/layout/WorkspaceShell.tsx`
- Test: `frontend/src/components/environment/EnvironmentModal.test.tsx`

**Interfaces:**
- Consumes: `collections`, `activeCollectionId`, `collectionVariablesByCollectionId`.
- Produces: Seletor de coleção no topo da aba "Coleção" e resolução na aba "Calculadas".

- [ ] **Step 1: Escrever testes para o seletor de coleções no `EnvironmentModal.test.tsx`**

```typescript
// frontend/src/components/environment/EnvironmentModal.test.tsx
it('renders collection selector in Collection tab and updates grid when switching collections', () => {
  const collections = [
    { id: 'col-1', name: 'Users API' },
    { id: 'col-2', name: 'Orders API' },
  ];
  const collectionVars = {
    'col-1': [{ key: 'BASE_USERS', value: 'https://users.api', isActive: true }],
    'col-2': [{ key: 'BASE_ORDERS', value: 'https://orders.api', isActive: true }],
  };

  render(
    <EnvironmentModal
      isOpen={true}
      onClose={vi.fn()}
      initialTab="collection"
      collections={collections}
      activeCollectionId="col-1"
      collectionVariablesByCollectionId={collectionVars}
    />
  );

  expect(screen.getByDisplayValue('Users API')).toBeInTheDocument();
  expect(screen.getByDisplayValue('BASE_USERS')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: /coleção/i }), {
    target: { value: 'col-2' },
  });
  expect(screen.getByDisplayValue('BASE_ORDERS')).toBeInTheDocument();
});

it('renders empty state when workspace has no collections', () => {
  render(
    <EnvironmentModal
      isOpen={true}
      onClose={vi.fn()}
      initialTab="collection"
      collections={[]}
    />
  );
  expect(screen.getByText(/nenhuma coleção encontrada neste workspace/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Executar testes para verificar falha**

Run: `cd frontend && npx vitest run src/components/environment/EnvironmentModal.test.tsx`  
Expected: FAIL.

- [ ] **Step 3: Implementar seletor no `EnvironmentModal.tsx` e integrar no `WorkspaceShell.tsx`**

1. Em `EnvironmentModal.tsx`:
   - Adicionar props `collections`, `activeCollectionId`, `collectionVariablesByCollectionId`, `onCollectionVariablesChange`.
   - Estado `selectedCollectionId` inicializado com `activeCollectionId || (collections[0]?.id ?? null)`.
   - Na aba "Coleção", renderizar seletor no topo com lista de coleções. Se lista vazia, exibir empty state.
   - Na aba "Calculadas", utilizar as variáveis da coleção selecionada para a resolução (`map.set(...)`).
2. Em `WorkspaceShell.tsx`:
   - Mapear coleções existentes a partir da `tree`: `collections = tree.collections.map((c) => ({ id: c.id, name: c.name }))`.
   - Obter `activeCollectionId` da requisição ativa ou seleção.
   - Passar `collections`, `activeCollectionId`, `collectionVariablesByCollectionId` para o `EnvironmentModal`.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `cd frontend && npx vitest run src/components/environment/EnvironmentModal.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/environment/EnvironmentModal.tsx frontend/src/components/environment/EnvironmentModal.test.tsx frontend/src/components/layout/WorkspaceShell.tsx
git commit -m "feat(environments): add collection selector in EnvironmentModal and wire workspace collections"
```

---

### Task 7: Validação Completa do Sistema e Build

**Files:**
- N/A (Verificação e consolidação)

**Interfaces:**
- Validação cruzada de todas as suites tocadas.

- [ ] **Step 1: Executar suite de testes unitários consolidada**

Run: `cd frontend && npx vitest run src/components/layout/AppHeader.test.tsx src/components/request/RequestEditor.test.tsx src/components/collection/CollectionSettingsModal.test.tsx src/components/environment/EnvironmentModal.test.tsx src/stores/useEnvironmentStore.test.ts src/i18n/index.test.ts`  
Expected: PASS em 100% dos testes.

- [ ] **Step 2: Executar build de produção do Next.js**

Run: `cd frontend && npm run build`  
Expected: Build bem-sucedido com zero erros de TypeScript e ESLint.

- [ ] **Step 3: Executar verificação Git**

Run: `git status`  
Expected: Working tree limpa sem arquivos não rastreados esquecidos.
