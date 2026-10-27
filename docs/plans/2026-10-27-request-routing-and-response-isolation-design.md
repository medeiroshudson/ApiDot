# Design Técnico: Roteamento de Workspace/Requisição e Isolamento de Respostas por ID

**Data:** 2026-10-27  
**Status:** Aguardando Aprovação de Hudson Medeiros  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Frontend (Next.js 15 App Router / React 19 / Tailwind CSS / Zustand)

---

## 1. Intenção e Motivação (The Why)

Atualmente no ApiDot:
1. **Vazamento de estado entre respostas:** No `useRequestStore`, a resposta HTTP (`response`) é armazenada como uma única variável global (`response: ResponseData | null`). Quando o usuário executa a Requisição A e depois clica na Requisição B na árvore lateral, o `ResponsePanel` continua exibindo o resultado da Requisição A, gerando confusão visual e risco de interpretação incorreta de dados.
2. **Ausência de Deep Linking e Perda de Contexto no Refresh (F5):** A aplicação reside exclusivamente na rota raiz `/` (`frontend/src/app/page.tsx`). O workspace ativo é recuperado via `localStorage`, mas a requisição selecionada vive apenas em memória volátil (`activeItem` / `activeRequestId`). Ao recarregar a página ou tentar compartilhar um link direto, o usuário perde a requisição em que estava trabalhando.

Este projeto estabelece:
- **Isolamento de Respostas por Requisição:** Cada requisição mantém sua própria resposta independente (em memória e com persistência seletiva em `localStorage`), garantindo que transitar entre requisições mostre unicamente a resposta da requisição ativa ou o estado vazio.
- **Roteamento Declarativo via URL (Next.js 15 App Router):** Adoção de rotas explícitas com layout compartilhado (`/workspace/:workspaceId` e `/workspace/:workspaceId/request/:requestId`), viabilizando recarregamento direto (F5), histórico de navegação nativo (voltar/avançar) e links diretos para requisições específicas.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Isolamento de Resposta por Requisição:**
  - `useRequestStore` armazena respostas indexadas por ID: `responsesByRequestId: Record<string, ResponseData>`.
  - O rascunho em branco (*scratchpad*) possui chave própria identificada (`__scratchpad__`), garantindo que chamadas ad-hoc também mantenham sua resposta isolada.
  - Seletor reativo `getResponseForActiveRequest()` que retorna a resposta correspondente à requisição atualmente ativa.
- **Persistência de Respostas via IndexedDB com Proteção de Tamanho:**
  - Persistir as últimas respostas executadas no IndexedDB para restauração instantânea após refresh (F5).
  - Limite de tamanho configurável via variável de ambiente `NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB` (padrão: 5 MB).
  - **Zero corte ou mutação:** Payloads de resposta são armazenados 100% íntegros. Caso uma resposta individual ultrapasse o limite configurado (ex: 5MB), ela é mantida normalmente na sessão em memória no Zustand, apenas ignorando a persistência em disco.
  - O `localStorage` é preservado exclusivamente para rascunhos de edição (`currentEditorData`) e estados leves, eliminando qualquer risco de `QuotaExceededError`.
- **Roteamento com Layout Compartilhado (App Router):**
  - `/`: Redirecionamento automático para o último workspace ativo ou para o primeiro disponível da API.
  - `/workspace/[workspaceId]`: Página de workspace com editor limpo em branco (*scratchpad*).
  - `/workspace/[workspaceId]/request/[requestId]`: Carrega a requisição especificada, sincronizando a árvore lateral, o editor e a resposta isolada.
  - `app/workspace/[workspaceId]/layout.tsx`: Layout compartilhado contendo `AppHeader`, `CollectionTree` (sidebar com `PanelSplitter`), gaveta mobile e modais globais. Transições entre requisições re-renderizam apenas o miolo central (`RequestEditor` + `ResponseViewer`), preservando o estado de expansão da árvore e evitando flashes.
- **Robustez de Navegação e Fallbacks:**
  - Caso um `:requestId` não exista ou não pertença ao workspace atual, redirecionar de forma transparente para `/workspace/:workspaceId` exibindo notificação não intrusiva.
  - Sincronização bidirecional: clicar em uma requisição na árvore atualiza a URL via `router.push`; alterar a URL ou usar voltar/avançar atualiza a árvore e o editor.
- **Compatibilidade e Suíte de Testes:**
  - Preservar a passagem de 100% dos testes unitários existentes e adicionar testes cobrindo o novo roteamento e o isolamento de respostas.

### 2.2. Não-Metas (Non-Goals)
- Não alterar a API do backend (.NET 9) — o backend já persiste requisições e histórico no SQLite; este projeto é puramente de arquitetura frontend e UX.
- Não introduzir abas múltiplas de requisições no topo do editor (tabbed editor) neste ciclo — a navegação continua sendo orientada pela árvore de coleções e pela URL ativa.
- Não sincronizar o histórico completo de execuções passadas de terceiros via WebSocket neste momento.

### 2.3. Anti-Metas (Anti-Goals)
- **Remontar a árvore de coleções a cada troca de rota:** O layout deve ser estável; trocar de requisição não pode recarregar a árvore nem perder nós expandidos.
- **Estourar a cota do `localStorage` (`QuotaExceededError`):** Respostas de dezenas de megabytes ou binários base64 nunca devem quebrar a persistência da aplicação.
- **Gargalo no SSR:** O Next.js não deve quebrar durante renderização no servidor por acessos indevidos a `window` ou `localStorage`.

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Next.js App Router com Layout Compartilhado e Sub-rotas (Escolhida)
- **Estrutura:**
  - `app/page.tsx`: Root redirector client-side para o workspace ativo.
  - `app/workspace/[workspaceId]/layout.tsx`: Estrutura persistente com Sidebar (`CollectionTree`), `AppHeader`, gaveta mobile e modais.
  - `app/workspace/[workspaceId]/page.tsx`: Workspace view no modo rascunho (*scratchpad*).
  - `app/workspace/[workspaceId]/request/[requestId]/page.tsx`: Visualização e edição da requisição ativa.
- **Vantagens:** Convenção nativa do Next.js 15, navegação instantânea com preservação de layout, suporte completo a histórico e F5, desacoplamento do `page.tsx` monolítico.
- **Trade-off:** Exige redistribuir o código do antigo `app/page.tsx` entre o layout do workspace e os componentes de página.

### Abordagem 2: Rota Única Catch-All (`app/workspace/[workspaceId]/[[...slug]]/page.tsx`) (Descartada)
- **Estrutura:** Um único arquivo de página manipula todas as variações de URL via parâmetros dinâmicos.
- **Motivo do Descarte:** Mantém um componente excessivamente denso e acoplado, acumulando condicionais de roteamento dentro do ciclo de renderização.

### Abordagem 3: Rota Estática Única com `history.pushState` Manual (Descartada)
- **Estrutura:** Permanece em `app/page.tsx` chamando `window.history.pushState` manualmente.
- **Motivo do Descarte:** Bypassa o ecossistema do Next.js, frágil a recarregamentos de página (F5) e desnecessariamente complexo para sincronização de eventos `popstate`.

---

## 4. Arquitetura Detalhada

### 4.0. Decisões Arquiteturais de Contorno (Builder Check Resolution)

A partir da análise técnica de viabilidade e das decisões de arquitetura, foram firmadas as seguintes diretrizes:

1. **Persistência Assíncrona de Respostas via IndexedDB (Zero Mutação de Payloads):**
   - O `localStorage` é utilizado exclusivamente para dados leves de configuração e rascunho de edição (`currentEditorData`).
   - A persistência de respostas (`responsesByRequestId`) é delegada ao **IndexedDB** (`apidot_responses_db`), eliminando a cota síncrona rígida de 5MB do `localStorage`.
   - **Regra de Ouro:** O payload de resposta **nunca** é truncado, fatiado ou modificado. Ele é mantido 100% íntegro.
   - Caso uma resposta individual ultrapasse o limite de cache configurado por `NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB` (padrão: 5 MB), ela permanece completa e utilizável na sessão em memória, sendo apenas ignorada na gravação em disco para evitar consumo excessivo de I/O.

2. **Isolamento de Scratchpad por Workspace:**
   - O rascunho em branco (*scratchpad*) e sua respectiva resposta são indexados por workspace: `__scratchpad__:${workspaceId}`.
   - Ao acessar `/workspace/:workspaceId`, o editor exibe o rascunho e a resposta específicos daquele workspace, sem contaminação entre ambientes distintos.

3. **Hidratação de Cold Load (F5) e Deep Link a partir da Árvore:**
   - O `WorkspaceTreeDto` já contém os campos completos da requisição (`RequestItemNodeDto`: `method`, `url`, `headersJson`, `bodyContent`, `target`, `schemaDefinition`).
   - A página `[requestId]/page.tsx` consome os dados da requisição a partir da árvore fornecida pelo layout compartilhado (`WorkspaceContext`), sem chamadas HTTP redundantes.
   - A resposta da requisição é carregada instantaneamente do mapa em memória e hidratada do IndexedDB em segundo plano se necessário.



Modificações no `frontend/src/stores/useRequestStore.ts`:

1. **Estrutura de Armazenamento de Respostas:**
```typescript
export const SCRATCHPAD_REQ_ID = '__scratchpad__';

export interface RequestState {
  activeRequestId: string | null;
  activeRequestDetails: ActiveRequestDetails | null;
  currentEditorData: RequestData | null;
  pendingSaveData: RequestData | null;
  isSavingRequest: boolean;
  isLoading: boolean;
  isAgentOnline: boolean;
  
  // Mapa de respostas por requestId (ou SCRATCHPAD_REQ_ID)
  responsesByRequestId: Record<string, ResponseData>;
  
  // Getter auxiliar de conveniência
  getResponseForActiveRequest: () => ResponseData | null;
  
  // Actions atualizadas
  setActiveRequest: (id: string | null, details: ActiveRequestDetails | null) => void;
  setResponseForRequest: (requestId: string, response: ResponseData | null) => void;
  clearResponseForRequest: (requestId: string) => void;
  resetScratchpad: () => void;
  // ...
}
```

2. **Política de Persistência Assíncrona no IndexedDB:**
- O `localStorage` armazena exclusivamente:
  - `currentEditorData`: dados em edição do rascunho.
- O armazenamento persistente de `responsesByRequestId` ocorre via IndexedDB (`frontend/src/lib/responseStorage.ts`):
  - Verifica o tamanho da resposta contra `process.env.NEXT_PUBLIC_MAX_RESPONSE_CACHE_MB` (padrão: `5`).
  - Respostas até o teto são gravadas **100% íntegras** no IndexedDB (sem nenhuma mutação ou corte de payload).
  - Respostas que excederem o teto permanecem em memória durante a sessão e não são salvas no IndexedDB.
  - No carregamento inicial ou troca de rota, caso uma requisição não esteja no mapa em memória, tenta recuperar do IndexedDB de forma assíncrona.

---

### 4.2. Estrutura de Rotas e Páginas (Next.js 15)

```
frontend/src/app/
├── globals.css
├── layout.tsx                     # Root HTML/Body e fontes
├── page.tsx                       # Redirecionador para /workspace/[workspaceId]
└── workspace/
    └── [workspaceId]/
        ├── layout.tsx             # Shell: Header, Sidebar, Splitter, Modais
        ├── page.tsx               # Rascunho / Scratchpad
        └── request/
            └── [requestId]/
                └── page.tsx       # Editor + ResponseViewer da requisição
```

#### A. `app/page.tsx` (Root Redirect)
- Lê o `activeWorkspaceId` do `useWorkspaceStore` ou `localStorage`.
- Se existir, redireciona via `redirect('/workspace/' + id)` ou `router.replace`.
- Se não houver workspace carregado, dispara `fetchWorkspaces()` e redireciona para o primeiro retornado.

#### B. `app/workspace/[workspaceId]/layout.tsx` (Workspace Shell)
- Valida e atualiza o `activeWorkspaceId` no `useWorkspaceStore` com base em `params.workspaceId`.
- Inicializa o hook de árvore `useCollectionTree(workspaceId)`.
- Renderiza:
  - `AppHeader` (com `WorkspaceSwitcher` e seletores de ambiente).
  - Container principal com `PanelSplitter` dividindo a Sidebar (`CollectionTree`) e a área de conteúdo (`children`).
  - `MobileDrawer` para telas móveis.
  - Modais globais (`WorkspaceModal`, `EnvironmentModal`, `CollectionSettingsModal`, `OpenApiImportModal`, `SaveRequestModal`).
- Fornece um contexto leve ou expõe a navegação para os nós da árvore, direcionando cliques para:
  - Requisição: `router.push('/workspace/' + workspaceId + '/request/' + reqId)`
  - Nova requisição / Scratchpad: `router.push('/workspace/' + workspaceId)`

#### C. `app/workspace/[workspaceId]/page.tsx` (Scratchpad View)
- Define a requisição ativa como rascunho (`activeRequestId = null`, target `SCRATCHPAD_REQ_ID`).
- Renderiza o container central com `RequestEditor` e `ResponseViewer` conectados ao `SCRATCHPAD_REQ_ID`.

#### D. `app/workspace/[workspaceId]/request/[requestId]/page.tsx` (Request View)
- Sincroniza a requisição ativa com base em `params.requestId`.
- Localiza a requisição correspondente na árvore ou busca seus dados.
- Renderiza o container central com `RequestEditor` e `ResponseViewer` vinculados ao `requestId`.
- Se a requisição não existir na árvore após o carregamento completo, realiza fallback seguro redirecionando para `/workspace/[workspaceId]`.

---

## 5. Plano de Validação e Testes

1. **Testes Unitários do Store (`useRequestStore.test.ts`):**
   - Testar armazenamento isolado de respostas por ID (`req-1` vs `req-2` vs `__scratchpad__`).
   - Testar o seletor `getResponseForActiveRequest()`.
   - Testar sanitização do `partialize` com payloads superiores a 5MB.
   - Testar que a troca de requisição ativa não vaza nem sobrescreve respostas anteriores.
2. **Testes das Rotas e Componentes:**
   - Testar o redirecionamento da raiz `/` para o workspace ativo.
   - Testar a renderização do layout persistente no `app/workspace/[workspaceId]/layout.tsx`.
   - Testar a seleção e troca de requisições no `app/workspace/[workspaceId]/request/[requestId]/page.tsx`.
   - Testar o comportamento do scratchpad em `/workspace/[workspaceId]`.
3. **Validação Manual e Integrada:**
   - Executar Requisição 1 -> visualizar resposta no painel.
   - Clicar na Requisição 2 -> verificar que o painel fica limpo/vazio (ou com sua própria resposta anterior).
   - Voltar à Requisição 1 -> verificar que a resposta anterior é restaurada imediatamente.
   - Pressionar F5 na Requisição 1 -> confirmar que a URL permanece `/workspace/.../request/...` e a resposta é mantida após o reload.

---

## 6. O Que Fica a Cargo do Construtor (Builder)

- Organização dos componentes auxiliares (`WorkspaceLayoutContent` ou wrappers) para evitar duplicação de handlers entre `page.tsx` do scratchpad e da requisição.
- Ajuste pontual das mensagens e estilos de banner no fallback de requisição não encontrada.
- Formatação exata da mensagem de aviso quando um payload de resposta é omitido do `localStorage`.
