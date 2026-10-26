# Padronização do RequestEditor com CodeMirror 6 e Abas na Coleção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o CodeMirror 6 nos campos de Headers e Body com linting estrito e indentação via Tab, reposicionar o Intellisense no cursor, padronizar o design system do `RequestEditor` para escala compacta (h-9 / 36px) com botão de envio dividido (split button com override de alvo), e reorganizar o `CollectionSettingsModal` em 3 abas dedicadas com botão único de salvar.

**Architecture:** A biblioteca `@uiw/react-codemirror` com `@codemirror/lang-json` e `@codemirror/lint` substitui os textareas de Headers e Body, fornecendo linting nativo e cálculo de coordenadas do cursor para o `RequestAutocomplete`. No `RequestEditor`, a barra de URL é compactada para `h-9` e adota um botão dividido `[ Enviar | ▾ ]` que prioriza o Agent local quando online e permite despachar via Servidor pelo dropdown. O seletor de alvo fixo e o botão "Vincular" saem do editor e migram para o `CollectionSettingsModal` organizado nas abas `Geral & Alvo`, `OpenAPI / Sync` e `Vínculos & Dependências`.

**Tech Stack:** Next.js 15, React 19, TypeScript, CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-json`, `@codemirror/lint`), Tailwind CSS, Lucide React, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-26-request-editor-codemirror-and-design-system-design.md`

## Global Constraints

- Headers e Body devem forçar formato JSON estrito com linting visual de erros.
- A tecla <kbd>Tab</kbd> deve inserir 2 espaços no editor sem transferir o foco para outro elemento.
- Barra de URL padronizada em `h-9` (36px) com tipografia font-mono `text-xs`/`text-sm`.
- O botão de envio dividido `[ Enviar | ▾ ]` deve priorizar o Agent local se online e sem override; o menu dropdown oferece o modo alternativo ("Executar no Servidor Nuvem" ou "Executar no Agent Local" desabilitado se offline).
- O `CollectionSettingsModal` possui 3 abas dedicadas e um único botão "Salvar Alterações" no rodapé.
- Todos os testes automatizados do frontend e backend devem passar sem regressões.

## Review Focus

1. **Linting de JSON Estrito em Headers e Body:** Digitar JSON inválido (ex.: chave sem aspas ou vírgula faltando) deve exibir marcas de erro do linter no editor.
2. **Indentação com Tecla Tab:** Pressionar <kbd>Tab</kbd> no CodeMirror deve inserir 2 espaços; pressionar <kbd>Shift+Tab</kbd> deve recuar a indentação.
3. **Posicionamento do Intellisense:** Digitar `{{` ou `{{$request[` deve abrir o popover de sugestões próximo ao cursor em vez de ficar fixado no rodapé da tela.
4. **Comportamento do Split Button de Envio:** O clique no botão principal deve enviar usando o alvo preferencial (Agent se online, senão Servidor); o clique no chevron deve abrir menu com o alvo oposto.
5. **Persistência Unificada no Modal da Coleção:** Clicar em "Salvar Alterações" deve atualizar Nome, DefaultTarget e OpenAPI simultaneamente.

---

### Task 1: CodeMirror 6 Dependencies & Reusable `CodeEditor` Component

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/components/common/CodeEditor.tsx`
- Create: `frontend/src/components/common/CodeEditor.test.tsx`

**Interfaces:**
- Produces:
  - `<CodeEditor value={string} onChange={(val: string) => void} onCursorChange?: (coords: { left: number; top: number; bottom: number } | null, pos: number) => void language="json" placeholder?: string minHeight?: string maxHeight?: string readOnly?: boolean />`
  - Inclui extensões `json()`, `linter(jsonParseLinter())`, `keymap.of([indentWithTab])`, números de linha e tema dark consistente com `neutral-900`/`neutral-950`.

- [ ] **Step 1: Install CodeMirror 6 packages**

Run: `npm --prefix frontend install @uiw/react-codemirror @codemirror/lang-json @codemirror/lint @codemirror/commands`

- [ ] **Step 2: Write the failing tests for `CodeEditor`**

Test:
- Renders CodeMirror container with given value.
- Calls `onChange` when text is modified.
- Emits cursor position coordinates on caret movement.
- Configures JSON linting and Tab key extension.

- [ ] **Step 3: Implement `CodeEditor.tsx`**

Implement `CodeEditor` wrapping `@uiw/react-codemirror` with `json()`, `jsonParseLinter()`, `indentWithTab`, and cursor listener via `EditorView.updateListener`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/common/CodeEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/common/CodeEditor.tsx frontend/src/components/common/CodeEditor.test.tsx
git commit -m "feat(web): add CodeMirror 6 CodeEditor component with JSON linting and Tab indentation"
```

---

### Task 2: Split Send Button & Compact Scale in `RequestEditor`

**Files:**
- Modify: `frontend/src/components/request/RequestEditor.tsx`
- Modify: `frontend/src/components/request/RequestEditor.test.tsx`
- Modify: `frontend/src/components/request/RequestAutocomplete.tsx`

**Interfaces:**
- Produces:
  - Barra de URL compacta (`h-9`): method select, URL input, split send button.
  - Split button `[ Enviar | ▾ ]`:
    - Dispara com alvo prioritário (Agent se online, senão Server).
    - Chevron abre menu dropdown com o alvo alternativo ("Executar no Servidor Nuvem" ou "Executar no Agent Local").
  - Remoção de `TargetSelector` e `Vincular` da barra de abas.
  - Headers e Body utilizam `CodeEditor` com JSON estrito e intellisense posicionado no cursor.

- [ ] **Step 1: Write failing tests in `RequestEditor.test.tsx`**

Test:
- Renders compact `h-9` URL controls.
- Default send button dispatches with Agent when online, or Server when offline.
- Chevron click opens dropdown offering alternative target.
- TargetSelector and Vincular button are absent from tabs bar.
- CodeEditor is rendered for Headers and Body.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `RequestEditor.tsx` and `RequestAutocomplete.tsx`**

Implement compact scale, split button with target override, replace textareas with `CodeEditor`, and support cursor coordinates in `RequestAutocomplete`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/request/RequestEditor.tsx frontend/src/components/request/RequestEditor.test.tsx frontend/src/components/request/RequestAutocomplete.tsx
git commit -m "feat(web): compact RequestEditor scale, split send button with target override, and CodeMirror integration"
```

---

### Task 3: Dedicated Tabs in `CollectionSettingsModal` & Page Integration

**Files:**
- Modify: `frontend/src/components/collection/CollectionSettingsModal.tsx`
- Modify: `frontend/src/components/collection/CollectionSettingsModal.test.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Produces:
  - 3 tabs no `CollectionSettingsModal`:
    - `Geral & Alvo`: Nome da coleção, `TargetSelector` para `DefaultTarget`.
    - `OpenAPI / Sync`: Spec URL, Spec Content, botão sincronizar e cards de auditoria.
    - `Vínculos & Dependências`: Lista de requisições encadeadas da coleção com botão de copiar token.
  - Botão único "Salvar Alterações" no rodapé.
  - `page.tsx`: manipula salvamento de nome, defaultTarget e OpenAPI da coleção.

- [ ] **Step 1: Write failing tests in `CollectionSettingsModal.test.tsx`**

Test:
- Switches between the 3 tabs (`Geral & Alvo`, `OpenAPI / Sync`, `Vínculos & Dependências`).
- Tab 1 allows editing Name and DefaultTarget.
- Tab 2 allows configuring OpenAPI and syncing.
- Tab 3 lists chained dependency requests and copies tokens.
- Footer "Salvar Alterações" saves changes.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test -- src/components/collection/CollectionSettingsModal.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement tabs in `CollectionSettingsModal.tsx` and wire in `page.tsx`**

Build 3 dedicated tabs and unified save action.

- [ ] **Step 4: Run full test suite and verify docker build**

Run:
`npm --prefix frontend test`
`dotnet test backend/ApiDot.sln`
`docker-compose build`
Expected: All tests pass, Docker images build cleanly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/collection/CollectionSettingsModal.tsx frontend/src/components/collection/CollectionSettingsModal.test.tsx frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat(web): restructure CollectionSettingsModal into 3 dedicated tabs with unified save"
```
