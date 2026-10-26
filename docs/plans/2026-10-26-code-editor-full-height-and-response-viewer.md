# Altura Total no CodeEditor, Sequência de Body e Padronização do ResponseViewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajustar o seletor de corpo para a sequência "Nenhum > Texto > JSON", fazer o CodeEditor preencher 100% da área útil do painel com rolagem estritamente interna (sem vazar), e substituir o SyntaxHighlighter legado no ResponseViewer pelo CodeEditor em modo readOnly com fallback para texto.

**Architecture:** No `RequestEditor`, a ordem do radiogroup de formato do corpo passa a ser `Nenhum`, `Texto`, `JSON`, e os containers flexbox aplicam `flex-1 h-full min-h-0 overflow-hidden` com scroller interno `height: 100% !important`, cobrindo toda a altura útil. No `ResponseViewer`, as abas *Pretty* e *Raw* passam a utilizar o `CodeEditor` em modo somente-leitura (`readOnly = true`); na aba Pretty, se o payload não for JSON válido, faz fallback automático transparente para `language="text"`.

**Tech Stack:** Next.js 15, React 19, TypeScript, CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-json`, `@codemirror/lint`), Tailwind CSS, Lucide React, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-26-code-editor-full-height-and-response-viewer-design.md`

## Global Constraints

- A ordem do seletor de corpo deve ser estritamente: `Nenhum`, `Texto`, `JSON`.
- O `CodeEditor` deve preencher 100% da área útil do painel até o rodapé, sem vazar para fora da tela (overflow interno controlado pelo CodeMirror).
- O `ResponseViewer` deve renderizar o `CodeEditor` em modo `readOnly`, eliminando o componente legado `SyntaxHighlighter` da visualização da resposta.
- Caso o retorno na aba Pretty não seja JSON válido, o visualizador deve fazer fallback automático transparente para modo texto sem travar ou acusar erro.
- Todos os testes automatizados do frontend e backend devem passar sem regressões.

## Review Focus

1. **Ordem dos Botões de Formato:** A interface deve renderizar os botões na ordem visual exata `Nenhum` $\to$ `Texto` $\to$ `JSON`.
2. **Preenchimento de Altura Total no Body e Headers:** Ao alternar para `JSON` ou `Texto`, o container do editor deve manter a mesma altura útil e expansão vertical que o card de `Nenhum` exibe.
3. **Rolagem Interna em Payloads Extensos:** Ao colar um JSON de milhares de linhas, a barra de rolagem deve ocorrer exclusivamente dentro do `CodeEditor`, sem expandir a página nem quebrar o layout.
4. **Padronização no ResponseViewer:** As abas *Pretty* e *Raw* devem exibir o `CodeEditor` com números de linha e tema dark idêntico ao editor de requisições.
5. **Fallback Transparente na Resposta:** Uma resposta com HTML (ex: erro 500 do servidor) deve renderizar perfeitamente no CodeEditor na aba Pretty em modo texto puro sem falhas.

---

### Task 1: Full Height Layout & Body Selector Sequence in `RequestEditor`

**Files:**
- Modify: `frontend/src/components/common/CodeEditor.tsx`
- Modify: `frontend/src/components/request/RequestEditor.tsx`
- Modify: `frontend/src/components/request/RequestEditor.test.tsx`

**Interfaces:**
- Sequência de `BodyFormat`: `Nenhum`, `Texto`, `JSON`.
- Containers do editor de headers e body com `flex-1 h-full min-h-0 flex flex-col overflow-hidden`.
- CodeEditor preenchendo 100% da altura disponível.

- [ ] **Step 1: Write failing tests in `RequestEditor.test.tsx`**

Test:
- Radiogroup options are rendered in order: Nenhum, Texto, JSON.
- CodeEditor container has `flex-1` and `h-full` ensuring full height expansion.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement body sequence and height styling**

Update `RequestEditor.tsx` and `CodeEditor.tsx` with rigid flex containment and sequence order.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/CodeEditor.tsx frontend/src/components/request/RequestEditor.tsx frontend/src/components/request/RequestEditor.test.tsx
git commit -m "feat(web): update body format sequence to None > Text > JSON and ensure full height CodeEditor expansion"
```

---

### Task 2: Standardize `ResponseViewer` with `CodeEditor` & Fallback

**Files:**
- Modify: `frontend/src/components/response/ResponseViewer.tsx`
- Modify: `frontend/src/components/response/ResponseViewer.test.tsx`

**Interfaces:**
- Substitui `SyntaxHighlighter` por `CodeEditor` (readOnly = true) nas abas Pretty e Raw.
- Na aba Pretty: avalia se `JSON.parse` é bem-sucedido. Se sim, `language="json"`; se não, fallback automático transparente para `language="text"`.
- Na aba Raw: `language="text"`.
- Preserva status badge, tempo em ms, tamanho em bytes e ação de copiar.

- [ ] **Step 1: Write failing tests in `ResponseViewer.test.tsx`**

Test:
- Pretty tab renders CodeEditor with formatted JSON.
- Pretty tab falls back to text language on non-JSON response (e.g. HTML/XML).
- Raw tab renders CodeEditor in text mode with raw response.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test -- src/components/response/ResponseViewer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `CodeEditor` in `ResponseViewer.tsx`**

Replace `SyntaxHighlighter` with `CodeEditor`, wire auto-fallback and clean layout.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix frontend test -- src/components/response/ResponseViewer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/response/ResponseViewer.tsx frontend/src/components/response/ResponseViewer.test.tsx
git commit -m "feat(web): standardize ResponseViewer with CodeEditor and automatic plain text fallback"
```

---

### Task 3: Full Test Suite & Docker Build Verification

**Files:**
- Run: Full frontend and backend test suites, and rebuild docker containers.

- [ ] **Step 1: Run all frontend tests**

Run: `npm --prefix frontend test`
Expected: All tests PASS.

- [ ] **Step 2: Run all backend tests**

Run: `dotnet test backend/ApiDot.sln`
Expected: All tests PASS.

- [ ] **Step 3: Rebuild and start docker containers**

Run: `docker-compose up -d --build web`
Expected: Containers healthy and running.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-10-26-code-editor-full-height-and-response-viewer-design.md docs/plans/2026-10-26-code-editor-full-height-and-response-viewer.md
git commit -m "docs: finalize CodeEditor full height and ResponseViewer standardization plan"
```
