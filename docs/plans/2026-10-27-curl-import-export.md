# cURL Import & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement robust cURL import (via collection/folder context menu) and cURL export (in request editor, sidebar context menu, and response viewer) with variable interpolation and devtools tolerance.

**Architecture:** Client-side pure TypeScript parser and generator (`curlParser.ts` and `curlGenerator.ts`) integrated with existing `createRequest` API and `interpolateVariables` engine, wrapped in an accessible `CurlImportModal` and action buttons with visual feedback.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide Icons, Vitest, Testing Library.

**Spec:** `docs/plans/2026-10-27-curl-import-export-design.md`

## Global Constraints
- Pure client-side parsing and generation in TypeScript — no backend C# modifications or DB migrations required.
- SQLite persistence uses `headersJson` for headers and auth; `Authorization: Basic` or `Bearer` extracted during cURL import is stored in `headersJson`.
- cURL export resolves environment variables (`{{var}}`) using the active environment (decisão expressa do usuário).
- DevTools tolerance: cURL parser safely ignores browser flags (`--compressed`, `-k`, `-s`, `-v`, `-L`, `-i`, `--location`) and maps `-b` / `--cookie` to `Cookie` header.
- UI components follow the ApiDot dark theme design tokens (`bg-neutral-900`, `border-neutral-800`, `text-neutral-100`, monospace inputs, Lucide icons).

## Review Focus
- Browser DevTools cURL inputs containing line continuations (`\`), `--compressed`, and cookie flags (`-b`) must parse cleanly without throwing errors or corrupting the URL.
- Variable interpolation during cURL export must not throw when active environment is null, variables contain dashes/underscores, or variables are undefined.
- Single quotes and special characters in payloads (e.g. JSON strings with embedded quotes and newlines) must be escaped correctly in `--data-raw '...'`.
- In `ResponseViewer`, "Copiar cURL" must copy the exact executed payload dispatched by `handleSend` (independent of any unsaved edits subsequently made in `RequestEditor`).
- On import, request names inferred from URLs with trailing slashes or query parameters must produce clean, readable names (e.g. `https://api.com/v1/orders/?sort=desc` -> `Orders`).

---

### Task 1: cURL Parser Engine

**Files:**
- Create: `frontend/src/lib/curl/curlParser.ts`
- Test: `frontend/src/lib/curl/curlParser.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ParsedCurlRequest {
    name: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    headersJson: string;
    bodyContent: string | null;
    bodyType: 'None' | 'Json' | 'RawText';
    auth: {
      type: 'none' | 'bearer' | 'basic' | 'apikey';
      token?: string;
      username?: string;
      password?: string;
      key?: string;
      value?: string;
    };
  }

  export interface CurlParseResult {
    success: boolean;
    request?: ParsedCurlRequest;
    error?: string;
  }

  export function tokenizeShellArgs(command: string): string[];
  export function parseCurl(curlCommand: string): CurlParseResult;
  ```

- [x] **Step 1: Write the failing unit tests in `frontend/src/lib/curl/curlParser.test.ts`**
  Cover:
  - Simple GET: `curl https://api.example.com/users`
  - Explicit method: `curl -X DELETE https://api.example.com/items/123`
  - Headers with `-H` and `--header`: `curl -H "Accept: application/json" -H "X-Custom: 123" https://api.example.com`
  - Cookies with `-b`: `curl -b "session=abc123" https://api.example.com` -> maps to `Cookie: session=abc123`
  - Data flags: `-d '{"foo":"bar"}'` and `--data-raw '{"foo":"bar"}'` with `bodyType: 'Json'`
  - Text data: `-d 'hello world'` with `bodyType: 'RawText'`
  - Basic auth with `-u admin:secret` -> sets `Authorization: Basic YWRtaW46c2VjcmV0` and `auth: { type: 'basic', username: 'admin', password: 'secret' }`
  - Bearer auth with `-H "Authorization: Bearer mytoken"` -> sets `auth: { type: 'bearer', token: 'mytoken' }`
  - DevTools copy-paste with `\\\n` continuations, `--compressed`, and `-k`
  - Name suggestion from URL: `POST https://api.example.com/v1/orders` -> `Orders`
  - Invalid inputs: empty string, non-curl text, URLs without protocol.

- [x] **Step 2: Run test to verify it fails**
  Run: `npm --prefix frontend test -- src/lib/curl/curlParser.test.ts`
  Expected: FAIL with module not found or functions not defined.

- [x] **Step 3: Implement `tokenizeShellArgs` and `parseCurl` in `frontend/src/lib/curl/curlParser.ts`**
  - Implement shell argument tokenization handling quotes and escapes.
  - Parse flags, normalize headers, infer body type and request name.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm --prefix frontend test -- src/lib/curl/curlParser.test.ts`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/lib/curl/curlParser.ts frontend/src/lib/curl/curlParser.test.ts
  git commit -m "feat(curl): implement robust cURL parser engine with devtools tolerance"
  ```

---

### Task 2: cURL Generator Engine

**Files:**
- Create: `frontend/src/lib/curl/curlGenerator.ts`
- Test: `frontend/src/lib/curl/curlGenerator.test.ts`

**Interfaces:**
- Consumes:
  - `interpolateVariables` from `frontend/src/lib/variables.ts`
  - `resolvePathParams` from `frontend/src/components/request/RequestEditor.tsx`
- Produces:
  ```typescript
  export interface GenerateCurlOptions {
    variables?: Record<string, string>;
    requestHistory?: any[];
    resolveVariables?: boolean;
  }

  export function generateCurlCommand(
    request: {
      method: string;
      url: string;
      headers?: string | Record<string, string>;
      body?: string | null;
      bodyFormat?: string;
      auth?: {
        type: string;
        token?: string;
        username?: string;
        password?: string;
        key?: string;
        value?: string;
      };
      pathParams?: Record<string, string>;
    },
    options?: GenerateCurlOptions
  ): string;
  ```

- [x] **Step 1: Write the failing unit tests in `frontend/src/lib/curl/curlGenerator.test.ts`**
  Cover:
  - Basic GET: `generateCurlCommand({ method: 'GET', url: 'https://api.example.com/items' })` -> `curl -X GET 'https://api.example.com/items'`
  - POST with JSON body and headers: emits `-H 'Content-Type: application/json'` and `--data-raw '{"key":"value"}'`
  - Single quote escaping in body: `'It\'s ok'` -> handles bash quote escaping safely
  - Variable interpolation: `url: '{{baseUrl}}/users'`, `variables: { baseUrl: 'https://dev.api.com' }` -> resolves to `'https://dev.api.com/users'`
  - Path param resolution: `url: 'https://api.com/users/:id'`, `pathParams: { id: '42' }` -> resolves to `'https://api.com/users/42'`
  - Auth header injection: Bearer token, Basic credentials, and API Key when not already present in headers
  - Multiline formatting with `\` line continuations.

- [x] **Step 2: Run test to verify it fails**
  Run: `npm --prefix frontend test -- src/lib/curl/curlGenerator.test.ts`
  Expected: FAIL with module not found or functions not defined.

- [x] **Step 3: Implement `generateCurlCommand` in `frontend/src/lib/curl/curlGenerator.ts`**
  - Implement options handling, variable interpolation, header formatting, and body quoting.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm --prefix frontend test -- src/lib/curl/curlGenerator.test.ts`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/lib/curl/curlGenerator.ts frontend/src/lib/curl/curlGenerator.test.ts
  git commit -m "feat(curl): implement cURL command generator with variable interpolation"
  ```

---

### Task 3: `CurlImportModal` Component

**Files:**
- Create: `frontend/src/components/request/CurlImportModal.tsx`
- Test: `frontend/src/components/request/CurlImportModal.test.tsx`

**Interfaces:**
- Consumes:
  - `parseCurl` from `frontend/src/lib/curl/curlParser.ts`
  - `METHOD_COLORS` from `frontend/src/components/request/RequestAutocomplete.tsx`
- Produces:
  ```typescript
  export interface CurlImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetName?: string;
    onImport: (parsed: ParsedCurlRequest, requestName: string) => Promise<void> | void;
  }

  export function CurlImportModal(props: CurlImportModalProps): React.JSX.Element | null;
  ```

- [x] **Step 1: Write the failing component tests in `frontend/src/components/request/CurlImportModal.test.tsx`**
  Cover:
  - Does not render when `isOpen: false`
  - Renders dialog title "Importar Requisição via cURL" when `isOpen: true`
  - Autofocuses textarea on mount
  - Displays validation error when input is invalid or not cURL
  - Shows preview card with method badge (e.g. POST in emerald), URL, and header count when valid cURL is entered
  - Prefills and allows editing the request name input
  - Displays target destination name (e.g. "Coleção: Pagamentos")
  - Calls `onImport` with parsed data and confirmed name when clicking "Importar Requisição"
  - Closes on Escape key and Cancel button.

- [x] **Step 2: Run test to verify it fails**
  Run: `npm --prefix frontend test -- src/components/request/CurlImportModal.test.tsx`
  Expected: FAIL with component not found.

- [x] **Step 3: Implement `CurlImportModal.tsx` in `frontend/src/components/request/`**
  - Implement modal structure with WAI-ARIA role="dialog", backdrop, textarea, live preview card, and actions.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm --prefix frontend test -- src/components/request/CurlImportModal.test.tsx`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/components/request/CurlImportModal.tsx frontend/src/components/request/CurlImportModal.test.tsx
  git commit -m "feat(curl): add CurlImportModal component with live validation and preview"
  ```

---

### Task 4: Export Button in `RequestEditor`

**Files:**
- Modify: `frontend/src/components/request/RequestEditor.tsx`
- Modify: `frontend/src/components/request/RequestEditor.test.tsx`

**Interfaces:**
- Consumes:
  - `generateCurlCommand` from `frontend/src/lib/curl/curlGenerator.ts`
  - `Terminal`, `Check` icons from `lucide-react`
- Produces:
  - Top action bar button: `<button aria-label="Copiar cURL">...`
  - Feedback state toggling to "Copiado!" for 2000ms.

- [x] **Step 1: Write the failing tests in `frontend/src/components/request/RequestEditor.test.tsx`**
  Cover:
  - Renders "Copiar cURL" button in top action bar next to "Salvar"
  - Clicking "Copiar cURL" calls `navigator.clipboard.writeText` with valid cURL generated from current editor fields
  - Displays visual feedback "Copiado!" upon clicking
  - Preserves variable interpolation options when variables are provided via props.

- [x] **Step 2: Run test to verify it fails**
  Run: `npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx`
  Expected: FAIL with button not found.

- [x] **Step 3: Implement "Copiar cURL" button in `RequestEditor.tsx`**
  - Add button in title/action bar with `Terminal` icon and copy feedback handler.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm --prefix frontend test -- src/components/request/RequestEditor.test.tsx`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/components/request/RequestEditor.tsx frontend/src/components/request/RequestEditor.test.tsx
  git commit -m "feat(curl): add Copiar cURL action to RequestEditor header"
  ```

---

### Task 5: Export Button in `ResponseViewer`

**Files:**
- Modify: `frontend/src/components/response/ResponseViewer.tsx`
- Modify: `frontend/src/components/response/ResponseViewer.test.tsx`

**Interfaces:**
- Consumes:
  - `Terminal`, `Check` icons from `lucide-react`
- Produces:
  - `ResponseViewerProps` updated with optional `executedCurl?: string`
  - Status bar button: `<button aria-label="Copiar cURL da requisição">...`

- [x] **Step 1: Write the failing tests in `frontend/src/components/response/ResponseViewer.test.tsx`**
  Cover:
  - Renders "Copiar cURL" button in top bar when response is present
  - Disabled when `executedCurl` is not provided or empty
  - Enabled when `executedCurl` is passed
  - Clicking calls `navigator.clipboard.writeText(executedCurl)` and displays "Copiado!" feedback for 2000ms.

- [x] **Step 2: Run test to verify it fails**
  Run: `npm --prefix frontend test -- src/components/response/ResponseViewer.test.tsx`
  Expected: FAIL with prop or button not found.

- [x] **Step 3: Implement "Copiar cURL" in `ResponseViewer.tsx`**
  - Add `executedCurl?: string` to `ResponseViewerProps`.
  - Add button next to "Copiar" with copy feedback state.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm --prefix frontend test -- src/components/response/ResponseViewer.test.tsx`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/components/response/ResponseViewer.tsx frontend/src/components/response/ResponseViewer.test.tsx
  git commit -m "feat(curl): add Copiar cURL button to ResponseViewer"
  ```

---

### Task 6: Context Menu Actions in `CollectionTree`

**Files:**
- Modify: `frontend/src/components/layout/CollectionTree.tsx`
- Modify: `frontend/src/components/layout/CollectionTree.test.tsx`

**Interfaces:**
- Consumes:
  - `Terminal` from `lucide-react`
- Produces:
  - `CollectionTreeProps` updated with:
    - `onImportCurl?: (collectionId: string, folderId?: string | null) => void`
    - `onCopyCurl?: (request: RequestItemNodeDto) => void`
  - Context menu items for collections and folders: "Importar cURL"
  - Context menu items for request items: "Copiar cURL"

- [x] **Step 1: Write the failing tests in `frontend/src/components/layout/CollectionTree.test.tsx`**
  Cover:
  - Context menu of collection contains "Importar cURL" and triggers `onImportCurl(collection.id, null)`
  - Context menu of folder contains "Importar cURL" and triggers `onImportCurl(collection.id, folder.id)`
  - Context menu of request contains "Copiar cURL" and triggers `onCopyCurl(request)`

- [x] **Step 2: Run test to verify it fails**
  Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx`
  Expected: FAIL with menu items not found.

- [x] **Step 3: Implement context menu items in `CollectionTree.tsx`**
  - Add "Importar cURL" to collection and folder context menu item arrays.
  - Add "Copiar cURL" to request item context menu item array.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm --prefix frontend test -- src/components/layout/CollectionTree.test.tsx`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/components/layout/CollectionTree.tsx frontend/src/components/layout/CollectionTree.test.tsx
  git commit -m "feat(curl): add Importar cURL and Copiar cURL to sidebar context menus"
  ```

---

### Task 7: Full Application Integration & Orchestration

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/page.test.tsx`

**Interfaces:**
- Consumes:
  - `CurlImportModal` from `frontend/src/components/request/CurlImportModal.tsx`
  - `generateCurlCommand` from `frontend/src/lib/curl/curlGenerator.ts`
  - `createRequestApi` from `frontend/src/lib/treeApi.ts`

- [x] **Step 1: Write the failing integration tests in `frontend/src/app/page.test.tsx`**
  Cover:
  - Right-clicking a collection/folder and clicking "Importar cURL" opens `CurlImportModal`
  - Submitting a cURL command calls `createRequest`, reloads tree, sets the imported request active, and closes modal
  - Disagreeing edits: right-clicking an active request item in the tree to "Copiar cURL" uses active editor data with interpolated variables
  - After dispatching a request via `handleSend`, `executedCurl` is passed to `ResponseViewer` and its "Copiar cURL" button is enabled.

- [x] **Step 2: Run test to verify it fails**
  Run: `npm --prefix frontend test -- src/app/page.test.tsx`
  Expected: FAIL.

- [x] **Step 3: Implement state and integration logic in `frontend/src/app/page.tsx`**
  - Add state `isImportCurlModalOpen`, `importCurlTarget: { collectionId: string, folderId?: string | null, targetName?: string }`.
  - Add state `executedCurl: string | null`.
  - In `handleSend`: generate and store `executedCurl` using resolved URL, interpolated headers and body.
  - Implement `handleImportCurl` to persist via `createRequest` and select newly created request item.
  - Wire `onImportCurl` and `onCopyCurl` to `CollectionTree`.
  - Render `<CurlImportModal>`.
  - Pass `executedCurl` to `ResponseViewer`.

- [x] **Step 4: Run test to verify it passes**
  Run: `npm --prefix frontend test -- src/app/page.test.tsx`
  Expected: PASS

- [x] **Step 5: Commit**
  ```bash
  git add frontend/src/app/page.tsx frontend/src/app/page.test.tsx
  git commit -m "feat(curl): integrate cURL import and export across the application"
  ```

---

### Task 8: Full Regression Suite Verification

- [ ] **Step 1: Run full frontend test suite**
  Run: `npm --prefix frontend test`
  Expected: All frontend tests PASS.

- [ ] **Step 2: Run full backend test suite to ensure zero regressions**
  Run: `dotnet test backend/ApiDot.sln`
  Expected: All backend tests PASS.
