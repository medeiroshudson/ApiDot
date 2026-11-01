# Documento de Design Técnico: Redesenho da Topbar, Barra de Requisição e Gestão Híbrida de Variáveis de Coleção

**Data:** 2026-11-01  
**Status:** Proposto (Aguardando Aprovação de Hudson Medeiros)  
**Autor:** Hudson Medeiros / Agente  
**Contexto:** Otimização visual, responsividade e ergonomia da barra superior (topbar) no mobile, da seção de requisição (verbo HTTP, URL e botão de envio) no desktop e mobile, e solução arquitetural para o gerenciamento de variáveis de múltiplas coleções no ApiDot.

---

## 1. Intenção e Diagnóstico

### 1.1. Problemas Identificados

1. **Topbar Mobile (`AppHeader.tsx`):**
   - Em telas estreitas (360px a 390px), o lado direito da barra comprime quatro controles independentes em linha: `<Select>` de ambientes, botão de Sliders (variáveis de ambiente), botão de Settings (configurações globais) e avatar de perfil com chevron.
   - Isso satura o espaço horizontal, gerando alvos de toque pequenos, riscos de toque acidental e truncamento excessivo do nome do ambiente selecionado.

2. **Barra de Requisição (`RequestEditor.tsx`):**
   - **No Desktop:** O seletor de verbo HTTP, o input de URL e o botão de envio funcionam como três elementos soltos com estilizações e bordas desconexas. O split button atual `[ Enviar | ▾ ]` não explicita visualmente para onde a requisição será despachada (Servidor vs Agente) sem abrir o dropdown, e possui um comportamento confuso onde o dropdown exibe apenas o alvo alternativo.
   - **No Mobile:** O botão de envio quebra para uma segunda linha isolada (`flex-col sm:flex-row`), consumindo altura vertical preciosa (mais de 80px) em um dispositivo onde o teclado virtual, as abas de requisição e o painel de resposta competem por espaço.
   - **Prolixidade e Poluição Visual:** Textos como "Enviar via Agente" e badges com o texto "ONLINE" ocupam espaço desnecessário no botão de envio.

3. **Gerenciamento de Variáveis de Coleção (`EnvironmentModal.tsx` vs $N$ Coleções):**
   - O backend do ApiDot já opera em modelo relacional correto: a entidade `EnvironmentVariable` exige `CollectionId` no escopo `Collection`, e o `VariableResolver` no C# faz o merge isolado das variáveis da coleção à qual a requisição pertence.
   - No frontend, o `EnvironmentModal` apresentava uma aba estática e cega de "Coleção" com uma única lista plana anônima (`collectionVariables`), sem contextualizar a qual das $N$ coleções do workspace aquelas variáveis pertenciam.
   - Ao mesmo tempo, o `CollectionSettingsModal` (configuração individual de uma coleção) não oferecia uma aba para editar as variáveis próprias daquela coleção.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos

- **Topbar Unificada (`AppHeader.tsx`):**
  - Substituir o par `<Select>` + botão `<Sliders>` por um único componente em formato de pílula (`EnvironmentPill`), exibindo dot indicador de status (verde se ativo, neutro se sem ambiente), nome do ambiente truncado e chevron. Ao clicar, abre menu com lista de ambientes, opção de desvincular e link no rodapé para *"Gerenciar ambientes e variáveis"*.
  - No mobile, remover o botão isolado de Configurações Globais da barra principal, disponibilizando o atalho dentro do menu suspenso do perfil do usuário (`UserDropdown`) e mantendo o atalho direto no desktop (`hidden sm:flex`).
  - Manter área de toque confortável (≥40px no mobile) e alinhamento visual perfeito na altura `h-14` (56px).

- **Barra de Requisição Otimizada (Abordagem B Refinada em Linha Única):**
  - Manter **linha única contínua** tanto no desktop quanto no mobile (`flex flex-row items-start gap-1.5 sm:gap-2 w-full`).
  - Padronizar a altura baseline em `h-9` (36px) para Método, URL e Botão de Envio.
  - Manter `autoGrow` no input de URL: compacto em 36px por padrão, expandindo até 84px apenas durante o foco para visualização/edição de URLs longas, recolhendo no blur.
  - **Botão Enviar Enxuto e Informativo (`[ Ícone + Enviar | ▾ ]`):**
    - Exibir ícone contextual do alvo ativo: `Cpu` (⚡) para Agente Local ou `Send` (☁️) para Servidor na Nuvem.
    - Rótulo conciso: apenas `Enviar` (sem "via..." e sem badge de texto "ONLINE").
    - **Semáforo Funcional:** Quando o alvo ativo for explicitamente `Agent` e o agente estiver desconectado (`isAgentOnline === false`), o botão principal de envio fica desativado (`opacity-50`, `cursor-not-allowed`, `disabled`). Quando o alvo for `Inherit`, ele faz o fallback natural para `Server` quando offline (mantendo o botão habilitado). O chevron `[ ▾ ]` permanece 100% ativo e clicável em qualquer estado para permitir o disparo imediato pelo outro alvo com 1 clique.
    - O menu do chevron dispara a execução imediata no alvo selecionado (`handleSend(target)`) e define o alvo em tempo de execução para a sessão, sem disparar falso `isDirty` na requisição.

- **Gestão Híbrida de Variáveis de Coleção:**
  - **Acesso Direto na Coleção (`CollectionSettingsModal.tsx`):** Adicionar a aba dedicada **Variáveis (`variables`)** nas configurações de cada coleção (`Geral | Variáveis | Autenticação | OpenAPI | Dependências`), permitindo edição contextual direta daquela coleção.
  - **Hub Centralizado no `EnvironmentModal.tsx`:** Na aba "Coleção", adicionar um seletor de coleção no topo (`[ Selecionar Coleção ▾ ]`). Caso haja uma coleção ativa na navegação/requisição, o modal já abre com ela pré-selecionada. Permite alternar entre qualquer uma das $N$ coleções do workspace para visualizar e editar suas variáveis.
  - **Aba Calculadas Contextual:** A aba "Calculadas" reflete as variáveis resolvidas considerando a coleção selecionada no momento.
  - Suporte a múltiplas coleções no `useEnvironmentStore.ts` via mapa `collectionVariablesByCollectionId: Record<string, VariableItem[]>`, persistido no `localStorage`.

### Não-Objetivos
- Não alterar os contratos da API backend de variáveis (`/api/workspaces/{id}/variables`), que já suportam `CollectionId`.
- Não alterar a lógica de execução de requisições no backend (`/api/requests/execute`).

### Anti-Objetivos
- Quebrar testes unitários existentes do Vitest.
- Criar menus modais aninhados complexos ou dependências externas pesadas.

---

## 3. Abordagens Consideradas

### 3.1. Barra de Requisição e Topbar
| Abordagem | Vantagens | Desvantagens | Decisão |
| :--- | :--- | :--- | :--- |
| **Abordagem A: Omnibar Contínua com Chip Integrado** | Cápsula única moderna. | Menos flexível para disparos rápidos de alvo alternativo. | Rejeitada |
| **Abordagem B: Split Button Informativo Enxuto em Linha Única** | Rótulo conciso (`[ ⚡ Enviar \| ▾ ]`), sem badges redundantes, semáforo offline no botão principal sem bloquear o chevron, linha única em qualquer resolução. | Requer padding cirúrgico em 360px. | **Aprovada por Hudson Medeiros** |

### 3.2. Gerenciamento de Variáveis de Coleção
| Abordagem | Vantagens | Desvantagens | Decisão |
| :--- | :--- | :--- | :--- |
| **Opção 1: Desacoplamento Estrito (Apenas na Coleção)** | Modelo mental limpo tipo Postman. | Perde a visão centralizada de todas as variáveis no modal de ambientes. | Rejeitada |
| **Opção 2: Hub Centralizado Apenas no EnvironmentModal** | Centraliza todas as variáveis num lugar só. | Obriga o usuário a sair da coleção para editar suas variáveis. | Rejeitada |
| **Opção 3: Híbrida (Direto na Coleção + Seletor de Coleção no Hub)** | Máxima conveniência: edição contextual direta na coleção E visão centralizada no hub de ambientes com suporte claro a $N$ coleções. | Requer sincronização por `collectionId`. | **Aprovada por Hudson Medeiros** |

---

## 4. Arquitetura e Especificação Técnica

### 4.1. Componente `EnvironmentPill` (`AppHeader.tsx`)
- Substitui o `<Select>` com chevron do SO e o botão `<Sliders>`.
- Renderiza botão tipo pill:
  ```tsx
  <button
    type="button"
    onClick={() => setIsEnvMenuOpen((p) => !p)}
    aria-haspopup="menu"
    aria-expanded={isEnvMenuOpen}
    aria-label={t('header.environmentSelectorAria')}
    className="flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-200 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-neutral-400 max-w-[120px] sm:max-w-[180px]"
  >
    <span className={`w-2 h-2 rounded-full shrink-0 ${activeEnvironment ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50' : 'bg-neutral-600'}`} />
    <span className="truncate font-medium">{activeEnvironment || t('header.noEnvironment')}</span>
    <ChevronDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
  </button>
  ```
- Dropdown flutuante exibe a lista de ambientes com checkmark, opção "Sem ambiente", divisor e link *"Gerenciar ambientes e variáveis..."* (que abre o `EnvironmentModal`).
- Botão de Configurações Globais (Engrenagem): `hidden sm:flex` na barra principal e sempre presente dentro do menu do perfil do usuário (`UserDropdown`) e na gaveta lateral mobile.

### 4.2. Barra de Requisição em Linha Única (`RequestEditor.tsx`)
- Container:
  ```tsx
  <div className="p-2 sm:p-2.5 border-b border-neutral-800 bg-neutral-900/40 flex items-start gap-1.5 sm:gap-2 w-full shrink-0">
  ```
- **Seletor de Método:** Altura `h-9` (36px), compacto (`min-w-[68px] sm:min-w-[76px]`).
- **Input de URL:** Ocupa todo o espaço restante (`flex-1 min-w-0`), `h-9` padrão com `autoGrow` até 84px no foco ativo e botão `✕` para limpar.
- **Split Button Enxuto (`[ Ícone + Enviar | ▾ ]`):**
  - **Resolução de Alvo Efetivo:**
    ```ts
    const effectiveTarget = runtimeTargetOverride ?? (target !== 'Inherit' ? target : (isAgentOnline ? 'Agent' : 'Server'));
    const isSendDisabled = isLoading || (effectiveTarget === 'Agent' && !isAgentOnline);
    ```
  - Botão principal:
    - Desativado (`opacity-50`, `disabled`) apenas quando `effectiveTarget === 'Agent'` e `!isAgentOnline`.
    - Ícone dinâmico: `Cpu` para Agente, `Send` para Servidor.
    - Rótulo: apenas `Enviar` (`t('request.send')`).
  - Chevron `[ ▾ ]`:
    - Sempre clicável.
    - Dropdown com alvos claros (`Servidor` e `Agente Local`). Clicar dispara imediatamente via `handleSend(selectedTarget)` e atualiza `runtimeTargetOverride`, preservando o estado `isDirty` da requisição sem falsos avisos de modificação.

### 4.3. Gestão Híbrida de Variáveis de Coleção

#### A. No `CollectionSettingsModal.tsx`
- Adiciona a aba `variables`:
  ```ts
  export type CollectionModalTab = 'general' | 'variables' | 'auth' | 'openapi' | 'dependencies';
  ```
- Conecta com `useEnvironmentStore`:
  - Carrega variáveis via `useEnvironmentStore.getState().getCollectionVariablesForId(collection.id)`.
  - Salva via `setCollectionVariablesForId(collection.id, updatedVars)`.
- Exibe o `VariableGrid` da coleção, com suporte a variáveis ativas/inativas, valores secretos e edição em lote (JSON).

#### B. No `EnvironmentModal.tsx`
- Props atualizadas:
  ```ts
  export interface EnvironmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: ModalTab;
    globals?: VariableItem[];
    collections?: Array<{ id: string; name: string }>;
    activeCollectionId?: string | null;
    collectionVariablesByCollectionId?: Record<string, VariableItem[]>;
    environments?: EnvironmentGroup[] | Record<string, VariableItem[]>;
    activeEnvironment?: string | null;
    onSave?: (data: any) => void;
    onGlobalsChange?: (variables: VariableItem[]) => void;
    onCollectionVariablesChange?: (collectionId: string, variables: VariableItem[]) => void;
    onEnvironmentsChange?: (environments: EnvironmentGroup[]) => void;
    onSelectActiveEnvironment?: (envName: string | null) => void;
  }
  ```
- Na aba "Coleção":
  - Seletor de coleção no topo:
    ```tsx
    <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-neutral-400">{t('environments.selectCollection')}:</span>
        <Select
          sizeVariant="sm"
          value={selectedCollectionId || ''}
          onChange={(e) => setSelectedCollectionId(e.target.value)}
          className="min-w-[180px]"
        >
          {collections.map((col) => (
            <option key={col.id} value={col.id}>{col.name}</option>
          ))}
        </Select>
      </div>
    </div>
    ```
  - Renderiza o `VariableGrid` da coleção selecionada.
  - Se não houver coleções criadas no workspace: renderiza empty state informativo.
- Na aba "Calculadas":
  - Reflete a resolução hierárquica considerando a coleção selecionada: `Globals -> Coleção Selecionada -> Ambiente Ativo`.

#### C. No `useEnvironmentStore.ts`
- Estado expandido para suportar o dicionário por coleção:
  ```ts
  activeCollectionId: string | null;
  collectionVariablesByCollectionId: Record<string, VariableItem[]>;
  setActiveCollectionId: (id: string | null) => void;
  setCollectionVariablesForId: (collectionId: string, vars: VariableItem[]) => void;
  getCollectionVariablesForId: (collectionId: string) => VariableItem[];
  ```
- Persistência em `localStorage` atualizada no `partialize`:
  ```ts
  partialize: (state) => ({
    environments: state.environments,
    activeEnvironment: state.activeEnvironment,
    globals: state.globals,
    collectionVariablesByCollectionId: state.collectionVariablesByCollectionId,
  })
  ```
- Preserva retrocompatibilidade total com `collectionVariables` apontando para `collectionVariablesByCollectionId[activeCollectionId] || []`.

---

## 5. Dicionário de Internacionalização (i18n)

Chaves a serem adicionadas/ajustadas em `src/i18n/locales/pt-BR.ts` e `src/i18n/locales/en-US.ts`:
- `header.environmentSelectorAria`: "Selecionar ambiente ativo" / "Select active environment"
- `header.environmentManage`: "Gerenciar ambientes e variáveis..." / "Manage environments and variables..."
- `request.agentOfflineTooltip`: "Agente local desconectado. Alterne para o Servidor para enviar." / "Local agent offline. Switch to Server to send."
- `request.targetServer`: "Servidor (Nuvem)" / "Server (Cloud)"
- `request.targetAgent`: "Agente Local" / "Local Agent"
- `environments.selectCollection`: "Coleção" / "Collection"
- `environments.noCollections`: "Nenhuma coleção encontrada neste workspace." / "No collections found in this workspace."
- `collection.variablesTab`: "Variáveis" / "Variables"
- `collection.variablesTitle`: "Variáveis da Coleção" / "Collection Variables"
- `collection.variablesDescription`: "Variáveis exclusivas desta coleção, acessíveis por todas as suas requisições." / "Variables exclusive to this collection, accessible by all its requests."

---

## 6. Arquivos Afetados

1. `frontend/src/components/layout/AppHeader.tsx` e `AppHeader.test.tsx`
2. `frontend/src/components/request/RequestEditor.tsx` e `RequestEditor.test.tsx`
3. `frontend/src/components/environment/EnvironmentModal.tsx` e `EnvironmentModal.test.tsx`
4. `frontend/src/components/collection/CollectionSettingsModal.tsx` e `CollectionSettingsModal.test.tsx`
5. `frontend/src/stores/useEnvironmentStore.ts` e `useEnvironmentStore.test.ts`
6. `frontend/src/components/layout/WorkspaceShell.tsx`
7. `frontend/src/i18n/locales/pt-BR.ts` e `frontend/src/i18n/locales/en-US.ts`

---

## 7. Plano de Verificação e Rollback

### Verificação
1. Executar testes unitários de todos os componentes afetados:
   ```bash
   cd frontend && npx vitest run src/components/layout/AppHeader.test.tsx src/components/request/RequestEditor.test.tsx src/components/environment/EnvironmentModal.test.tsx src/components/collection/CollectionSettingsModal.test.tsx src/stores/useEnvironmentStore.test.ts
   ```
2. Executar build completo do frontend:
   ```bash
   cd frontend && npm run build
   ```
3. Verificação de responsividade (360px mobile e 1280px desktop).

### Rollback
- Reversão atômica via Git dos arquivos alterados em `frontend/src/`.
