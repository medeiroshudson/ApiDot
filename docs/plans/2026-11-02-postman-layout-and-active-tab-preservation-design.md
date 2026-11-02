# Documento de Design Técnico: Layout Postman em 3 Seções e Preservação de Aba Ativa

**Data:** 2026-11-02  
**Status:** Proposto (Aguardando Aprovação de Hudson Medeiros)  
**Autor:** Hudson Medeiros / Agente  
**Contexto:** Reestruturação do layout do `WorkspaceEditorPane` e `RequestEditor` no padrão Postman (Barra de Requisição ocupando 100% da largura do canvas no topo, com duas colunas inferiores para detalhes e resposta), reordenação das abas com *Authorization* em 2º lugar, definição da aba *Specification* como padrão e preservação da aba ativa ao navegar entre requisições.

---

## 1. Intenção e Diagnóstico

### 1.1. Problemas Identificados
1. **Estrangulamento Horizontal da URL no Desktop:**
   - Atualmente, o layout desktop do `WorkspaceEditorPane.tsx` divide o canvas verticalmente desde o topo em duas metades (50% esquerda para o `RequestEditor` e 50% direita para o `ResponseViewer`).
   - Como resultado, o campo de URL da requisição fica confinado a menos de 450px em monitores padrão, gerando truncamento severo e dificultando a leitura/escrita de rotas com múltiplos parâmetros de consulta (`query params`).
2. **Ordem e Padrão das Abas da Requisição:**
   - A ordem anterior das abas (`Specification | Params | Headers | Body | Auth`) deixava a Autenticação no final. Em fluxos de trabalho modernos (como no Postman), a autorização é configurada logo após o contrato/especificação.
   - A aba inicial padrão abria em `params` em vez de `specification`.
3. **Perda de Contexto de Aba na Navegação:**
   - Ao trocar de uma requisição para outra na árvore lateral (ex.: de Requisição A para Requisição B), a aba ativa era reinicializada para o valor padrão, obrigando o usuário a reabrir manualmente a aba que estava inspecionando (ex.: `body` ou `headers`).

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
- **Layout Postman em 3 Seções:**
  - **Seção 1 (Topo - 100% da Largura do Canvas):**
    - Barra de Título (Nome da requisição, indicador `dirty-dot`, botão *Salvar*).
    - Barra de Requisição Contínua (`[ GET ▾ ]` + `[ Input de URL 100% de largura ]` + `[ ⚡ Enviar | ▾ ]`).
  - **Seção 2 (Inferior Esquerda - Detalhes da Requisição):**
    - Reordenação das abas: `Specification` → **`Authorization`** (2º lugar) → `Params` → `Headers` → `Body`.
    - Painel da aba ativa (campos de Auth, grade de Params, headers, CodeMirror do body, ou editor de Specification).
  - **Seção 3 (Inferior Direita - Visualizador de Resposta):**
    - `ResponseViewer` ocupando a coluna direita, separado da Seção 2 pelo divisor central redimensionável (**`PanelSplitter`**).
- **Aba Padrão e Preservação de Navegação:**
  - Aba default inicial: `specification`.
  - Persistência da aba ativa no `useLayoutStore` (`activeRequestTab`), para que ao navegar entre quaisquer requisições na barra lateral (ou recarregar a página), o usuário permaneça na mesma aba em que estava trabalhando.
- **Responsividade Mobile:**
  - No mobile, o topo preserva a barra de requisição em linha única de largura total.
  - Abaixo, o seletor mobile `[ Requisição | Resposta ]` alterna confortavelmente entre a Seção 2 (Detalhes da Requisição) e a Seção 3 (ResponseViewer).
- **Zero Regressões:**
  - Compatibilidade com todos os 936 testes do Vitest e 545 testes do .NET.

### Não-Objetivos
- Não alterar a lógica de execução de requisições no backend (`/api/requests/execute`).
- Não alterar o comportamento de variáveis ou histórico.

### Anti-Objetivos
- Quebrar testes que esperam elementos de `RequestEditor` ou `ResponseViewer`.
- Introduzir dependências pesadas de layout.

---

## 3. Arquitetura e Especificação Técnica

### 3.1. Estado no `useLayoutStore.ts`
Adição do campo `activeRequestTab` ao store de preferências de layout:
```typescript
export interface LayoutState {
  ...
  activeRequestTab: 'specification' | 'auth' | 'params' | 'headers' | 'body';
  setActiveRequestTab: (tab: 'specification' | 'auth' | 'params' | 'headers' | 'body') => void;
}
```
- Inicializado com `'specification'`.
- Persistido no `localStorage` sob `apidot_layout_preferences` via `partialize`.

### 3.2. Reordenação e Slots no `RequestEditor.tsx`
1. Reordenação de `TABS`:
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
2. Props do `RequestEditor`:
```typescript
export interface RequestEditorProps {
  ...
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
  responseSlot?: React.ReactNode;
  splitterSlot?: React.ReactNode;
  requestDetailsRatio?: number;
  isDesktop?: boolean;
  activeMobilePane?: 'request' | 'response';
  onMobilePaneChange?: (pane: 'request' | 'response') => void;
  responseStatusCode?: number;
}
```
3. Estrutura JSX:
- **Topo (100% de largura):**
  - Title Bar (Título + Dirty Indicator + Botão Salvar).
  - Request Bar (Select de Método + Input de URL expansível + Split Send Button).
- **Abaixo da Barra de Requisição:**
  - Se `responseSlot` estiver presente (modo integrado de workspace):
    - No mobile: alternador mobile `[ Requisição | Resposta ]`. Se `activeMobilePane === 'request'`, exibe os detalhes da requisição; se `'response'`, exibe o `responseSlot`.
    - No desktop: container `flex flex-row overflow-hidden min-h-0 flex-1`:
      - Coluna Esquerda: `style={{ flex: '0 0 ' + requestDetailsRatio + '%' }}` contendo Tablist (`Specification | Auth | Params | Headers | Body`) e painéis de conteúdo.
      - Centro: `splitterSlot` (`PanelSplitter`).
      - Coluna Direita: `style={{ flex: '0 0 ' + (100 - requestDetailsRatio) + '%' }}` contendo `responseSlot` (`ResponseViewer`).
  - Se `responseSlot` for omitido (modo isolado em testes unitários do `RequestEditor`):
    - As abas e os painéis de conteúdo ocupam 100% da área inferior.

### 3.3. Integração no `WorkspaceEditorPane.tsx`
Simplificação do `WorkspaceEditorPane.tsx`:
- Conecta `activeRequestTab` e `setActiveRequestTab` do `useLayoutStore`.
- Passa `responseSlot={<ResponseViewer ... />}`, `splitterSlot={<PanelSplitter ... />}`, `requestDetailsRatio={requestResponseRatio}`, `isDesktop={isDesktop}`, `activeMobilePane={activeMobilePane}` diretamente para o `<RequestEditor>`.

---

## 4. Dicionário de Internacionalização (i18n)

Verificação das traduções em `pt-BR.ts` e `en-US.ts`:
- `request.tabSpec`: "Especificação" / "Specification"
- `request.tabAuth`: "Autenticação" / "Authorization"
- `request.tabParams`: "Parâmetros" / "Params"
- `request.tabHeaders`: "Cabeçalhos" / "Headers"
- `request.tabBody`: "Corpo" / "Body"

---

## 5. Arquivos Afetados

1. `frontend/src/stores/useLayoutStore.ts` e `useLayoutStore.test.ts`
2. `frontend/src/components/request/RequestEditor.tsx` e `RequestEditor.test.tsx`
3. `frontend/src/components/workspace/WorkspaceEditorPane.tsx` e `WorkspaceEditorPane.test.tsx`

---

## 6. Plano de Verificação e Rollback

### Verificação
1. Executar testes unitários específicos:
   ```bash
   cd frontend && npx vitest run src/stores/useLayoutStore.test.ts src/components/request/RequestEditor.test.tsx src/components/workspace/WorkspaceEditorPane.test.tsx
   ```
2. Executar suíte completa do frontend e backend:
   ```bash
   npm --prefix frontend test
   dotnet test backend/ApiDot.sln
   ```
3. Executar build de produção do Next.js:
   ```bash
   npm --prefix frontend run build
   ```

### Rollback
- Reversão atômica via Git dos arquivos em `frontend/src/`.
