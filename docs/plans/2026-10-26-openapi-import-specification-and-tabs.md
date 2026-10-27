# OpenAPI Import, Tags to Folders, Path & Query Parameters, and Apidog-Style Specification Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a modern OpenAPI import workflow that creates new collections from specs, categorizes endpoints into folders via tags (including multi-tag duplication), formats route parameters as `:param` with bidirectional query synchronization, and introduces an Apidog-style Specification tab with schema-driven IntelliSense in the body editor.

**Architecture:** The .NET 9 backend expands `CanonicalRequest` and `OpenApiImportStrategy` with YAML/JSON parsing, tag extraction, `:param` route normalization, query parameter synthesis, and structured `SchemaDefinition` persistence. `CollectionMerger` maps tags to `Folder` entities and matches by `(Method, Route, FolderId)`. The Next.js 15 frontend adds `OpenApiImportModal`, reorganizes request tabs to `Especificação > Parâmetros > Cabeçalhos > Corpo > Autenticação`, implements visual schema editing/generation, and wires `RequestAutocomplete` directly to the active schema definition.

**Tech Stack:** .NET 9 Minimal APIs, Entity Framework Core, YamlDotNet, Next.js 15 App Router, React 19, Tailwind CSS, CodeMirror / Lucide React, Vitest, xUnit.

**Spec:** `docs/plans/2026-10-26-openapi-import-specification-and-tabs-design.md`

## Global Constraints

- Backend must support both JSON and YAML OpenAPI 3.x / Swagger 2.0 specifications.
- Route parameters must be normalized to `:param` syntax in URLs (e.g. `/pet/:petId`).
- The tab sequence in `RequestEditor` must strictly be: `Especificação` > `Parâmetros` > `Cabeçalhos` > `Corpo` > `Autenticação`.
- The database column and DTO property for the contract schema must remain named `SchemaDefinition`.
- Synchronization must remain surgical and non-destructive: do not delete user requests, preserve custom edits, and match by `(Method, Route, FolderId)`.

## Review Focus

1. **Spec contains `{param}` in route path but lacks explicit parameter entry in `parameters` array:** Strategy must detect undeclared path tokens, normalize them to `:param`, and create implicit path parameter metadata.
2. **Endpoint has multiple tags with whitespace or casing variants (e.g., `["pet", " pet ", "PET"]`):** Tag names must be trimmed, deduplicated case-insensitively, and mapped cleanly to folders.
3. **User edits URL bar with malformed query tokens (e.g. `?&=foo&&bar=`):** `ParamsTab` must parse resiliently without crashing or corrupting query state.
4. **Legacy records with raw JSON Schema strings in `SchemaDefinition`:** Frontend and backend must deserialize gracefully, wrapping legacy schemas in `{ body: ... }`.
5. **SSRF protection on remote OpenAPI URLs:** Remote spec fetching must strictly reject private, loopback, and local network IPs (`IsSafeSpecUrl`).

---

### Task 1: Domain Models, YAML Ingestion & OpenApi Parser Refinement (`ApiDot.Core`)

**Files:**
- Create/Modify: `backend/src/ApiDot.Core/Import/CanonicalImportModels.cs`
- Modify: `backend/src/ApiDot.Core/Import/OpenApiImportStrategy.cs`
- Modify: `backend/src/ApiDot.Core/ApiDot.Core.csproj`
- Test: `backend/tests/ApiDot.Core.Tests/Import/OpenApiImportStrategyTests.cs`

**Interfaces:**
- Consumes: OpenAPI / Swagger JSON or YAML strings.
- Produces: `CanonicalCollectionImport` with `CanonicalRequest` containing `Tags`, `PathParameters`, `QueryParameters`, normalized `Url` (`:param` and `?query`), `Responses`, and structured `SchemaDefinition`.

- [ ] **Step 1: Write failing tests for OpenAPI tag extraction, `:param` path normalization, query string synthesis, and YAML ingestion**

```csharp
[Fact]
public async Task ParseAsync_ShouldExtractTagsAndNormalizePathParamsToColonSyntax()
{
    var strategy = new OpenApiImportStrategy();
    var yaml = @"
openapi: 3.0.0
info:
  title: Petstore YAML
  version: 1.0.0
paths:
  /pet/{petId}:
    get:
      tags:
        - pet
        - admin
      summary: Find pet by ID
      parameters:
        - name: petId
          in: path
          required: true
          schema:
            type: integer
          example: 42
        - name: status
          in: query
          schema:
            type: string
          example: available
      responses:
        '200':
          description: successful operation
";

    var result = await strategy.ParseAsync(yaml);
    Assert.Single(result.Requests);
    var req = result.Requests[0];
    Assert.Equal(["pet", "admin"], req.Tags);
    Assert.Contains("/pet/:petId", req.Url);
    Assert.Contains("status=available", req.Url);
    Assert.NotNull(req.SchemaDefinition);
    Assert.Contains("petId", req.SchemaDefinition);
    Assert.Contains("200", req.SchemaDefinition);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/tests/ApiDot.Core.Tests --filter FullyQualifiedName~OpenApiImportStrategyTests`
Expected: FAIL due to missing YAML parsing, unhandled `tags`, and `{petId}` unnormalized.

- [ ] **Step 3: Add `YamlDotNet` package to `ApiDot.Core` and implement YAML-to-JSON preprocessing and tag/parameter extraction in `OpenApiImportStrategy`**

1. Add `<PackageReference Include="YamlDotNet" Version="16.3.0" />` to `backend/src/ApiDot.Core/ApiDot.Core.csproj`.
2. In `OpenApiImportStrategy`:
   - If content does not start with `{`, convert YAML to JSON using `DeserializerBuilder` / `SerializerBuilder`.
   - In `CanHandle`, verify if either JSON or parsed YAML contains `openapi` or `swagger`.
   - In `ParseRequest`:
     - Extract `tags` from `opEl.TryGetProperty("tags", ...)` into `List<string>`.
     - Convert path `{paramName}` to `:paramName`.
     - Extract `in: "path"` and `in: "query"` with defaults/examples.
     - Synthesize query string onto `fullUrl` if query parameters exist.
     - Extract `responses` from `opEl.TryGetProperty("responses", ...)`.
     - Assemble structured JSON `SchemaDefinition` containing `summary`, `description`, `parameters`, `body`, and `responses`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test backend/tests/ApiDot.Core.Tests --filter FullyQualifiedName~OpenApiImportStrategyTests`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/ApiDot.Core backend/tests/ApiDot.Core.Tests
git commit -m "feat(core): add YAML ingestion, tags, :param path normalization and structured SchemaDefinition"
```

---

### Task 2: Path Parameter Interpolation in `VariableInterpolator` (`ApiDot.Core`)

**Files:**
- Modify: `backend/src/ApiDot.Core/Variables/IVariableInterpolator.cs`
- Modify: `backend/src/ApiDot.Core/Variables/VariableInterpolator.cs`
- Test: `backend/tests/ApiDot.Core.Tests/Variables/VariableInterpolatorTests.cs`

**Interfaces:**
- Consumes: URL with `:param` tokens and dictionary of path variables.
- Produces: `InterpolatePathParameters(string url, IReadOnlyDictionary<string, string>? pathParams)` returning resolved URL.

- [ ] **Step 1: Write failing tests for `:param` path interpolation**

```csharp
[Fact]
public void InterpolatePathParameters_ShouldReplaceColonTokensWithProvidedValues()
{
    var interpolator = new VariableInterpolator();
    var pathParams = new Dictionary<string, string>
    {
        ["petId"] = "105",
        ["orderId"] = "999"
    };

    var result = interpolator.InterpolatePathParameters("https://api.com/v2/pet/:petId/order/:orderId?filter=true", pathParams);
    Assert.Equal("https://api.com/v2/pet/105/order/999?filter=true", result);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Core.Tests --filter FullyQualifiedName~VariableInterpolatorTests`
Expected: FAIL (`InterpolatePathParameters` not defined).

- [ ] **Step 3: Implement `InterpolatePathParameters` in `VariableInterpolator`**

1. Add method signature to `IVariableInterpolator`:
   `string? InterpolatePathParameters(string? url, IReadOnlyDictionary<string, string>? pathParameters);`
2. Implement in `VariableInterpolator.cs`:
   Use regex `(?<=/|:|^):([a-zA-Z0-9_]+)` to match `:param` and substitute value from dictionary if present; preserve token if missing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test backend/tests/ApiDot.Core.Tests --filter FullyQualifiedName~VariableInterpolatorTests`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/ApiDot.Core/Variables backend/tests/ApiDot.Core.Tests
git commit -m "feat(core): implement :param route parameter interpolation in VariableInterpolator"
```

---

### Task 3: CollectionMerger Folder-Tag Mapping & Deterministic Sync (`ApiDot.Server`)

**Files:**
- Modify: `backend/src/ApiDot.Server/Services/CollectionMerger.cs`
- Modify: `backend/src/ApiDot.Server/Services/ICollectionMerger.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Services/CollectionMergerTests.cs`

**Interfaces:**
- Consumes: `Collection` and `CanonicalCollectionImport` (with `Tags`).
- Produces: `MergeResult` with folders created for tags, multi-tag requests duplicated in their respective folders, untagged requests in root, and `(Method, Route, FolderId)` matching.

- [ ] **Step 1: Write failing tests for tag-to-folder mapping and multi-tag request duplication**

```csharp
[Fact]
public void Merge_ShouldCreateFoldersForTagsAndDuplicateMultiTagRequests()
{
    var merger = new CollectionMerger();
    var collection = new Collection
    {
        Id = Guid.NewGuid(),
        Name = "Test",
        WorkspaceId = Guid.NewGuid()
    };

    var imported = new CanonicalCollectionImport
    {
        Requests =
        [
            new CanonicalRequest
            {
                Name = "MultiTag Endpoint",
                Method = "GET",
                Path = "/items",
                Url = "/items",
                Tags = ["inventory", "sales"]
            },
            new CanonicalRequest
            {
                Name = "Root Endpoint",
                Method = "GET",
                Path = "/health",
                Url = "/health",
                Tags = []
            }
        ]
    };

    var result = merger.Merge(collection, imported);

    Assert.Equal(2, collection.Folders.Count);
    Assert.Contains(collection.Folders, f => f.Name == "inventory");
    Assert.Contains(collection.Folders, f => f.Name == "sales");

    Assert.Equal(3, collection.Requests.Count);
    Assert.Equal(1, collection.Requests.Count(r => r.FolderId == null));
    Assert.Equal(2, collection.Requests.Count(r => r.Name == "MultiTag Endpoint"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~CollectionMergerTests`
Expected: FAIL (`Folders` count is 0 and requests are not grouped by tag).

- [ ] **Step 3: Update `CollectionMerger` to create folders, assign `FolderId`, and index by `(Method, Route, FolderId)`**

1. Build a case-insensitive map of existing folders in `collection.Folders`.
2. For each canonical request:
   - If `Tags.Count > 0`:
     - For each tag in distinct normalized tags:
       - Find existing folder or instantiate `new Folder { Id = Guid.NewGuid(), Name = tag, CollectionId = collection.Id, WorkspaceId = collection.WorkspaceId }` and add to `collection.Folders`.
       - Match or create `RequestItem` with `FolderId = folder.Id` and assign `SchemaDefinition`.
   - If `Tags.Count == 0`:
     - Match or create `RequestItem` with `FolderId = null` and assign `SchemaDefinition`.
3. In `MergeRequest`, ensure `existing.SchemaDefinition = canonicalReq.SchemaDefinition` is updated when present.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~CollectionMergerTests`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/ApiDot.Server/Services backend/tests/ApiDot.Server.Tests
git commit -m "feat(server): support folder mapping from tags and multi-tag request distribution in CollectionMerger"
```

---

### Task 4: New Collection Import Endpoint & `SchemaDefinition` DTOs (`ApiDot.Server`)

**Files:**
- Modify: `backend/src/ApiDot.Server/Models/CollectionOpenApiModels.cs`
- Modify: `backend/src/ApiDot.Server/Models/RequestItemMutationModels.cs`
- Modify: `backend/src/ApiDot.Server/Models/WorkspaceTreeModels.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.E2E.Tests/CollectionOpenApiEndpointsTests.cs`

**Interfaces:**
- Consumes: `POST /api/collections/import-openapi` with `{ workspaceId, name, specUrl, specContent }`.
- Produces: Created `CollectionNodeDto` containing folders and requests with `SchemaDefinition`.

- [ ] **Step 1: Write failing E2E test for importing OpenAPI into a brand new collection**

```csharp
[Fact]
public async Task ImportOpenApiToNewCollection_ShouldCreateCollectionWithFoldersAndRequests()
{
    var client = _factory.CreateClient();
    var workspaceId = Guid.NewGuid(); // Seed workspace first
    var payload = new ImportOpenApiCollectionRequest(
        WorkspaceId: workspaceId,
        Name: "Petstore New",
        SpecContent: "{\"openapi\":\"3.0.0\",\"info\":{\"title\":\"Petstore API\",\"version\":\"1.0\"},\"paths\":{\"/pets\":{\"get\":{\"tags\":[\"pet\"],\"summary\":\"List pets\",\"responses\":{\"200\":{\"description\":\"ok\"}}}}}}"
    );

    var res = await client.PostAsJsonAsync("/api/collections/import-openapi", payload);
    Assert.Equal(HttpStatusCode.Created, res.StatusCode);

    var node = await res.Content.ReadFromJsonAsync<CollectionNodeDto>();
    Assert.NotNull(node);
    Assert.Equal("Petstore New", node.Name);
    Assert.Single(node.Folders);
    Assert.Equal("pet", node.Folders[0].Name);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.E2E.Tests --filter FullyQualifiedName~CollectionOpenApiEndpointsTests`
Expected: FAIL (`404 Not Found` for `/api/collections/import-openapi`).

- [ ] **Step 3: Implement `POST /api/collections/import-openapi` and update DTOs**

1. In `CollectionOpenApiModels.cs`:
   Define `public record ImportOpenApiCollectionRequest(Guid WorkspaceId, string? Name, string? SpecUrl, string? SpecContent);`
2. In `RequestItemMutationModels.cs` and `WorkspaceTreeModels.cs`:
   Add `string? SchemaDefinition = null` to `CreateRequestItemRequest`, `UpdateRequestItemRequest`, and `RequestItemNodeDto`.
3. In `Program.cs`:
   - Map `app.MapPost("/api/collections/import-openapi", ...)`:
     - Validate workspace exists.
     - Fetch/parse spec content with SSRF check (`IsSafeSpecUrl`).
     - Determine name: `request.Name` if provided, else `canonicalImport.Name`, else `"Imported Collection"`.
     - Create `Collection`, run `merger.Merge(collection, canonicalImport)`.
     - Add new folders to `db.Folders` and requests to `db.RequestItems`.
     - Save changes and return `Results.Created($"/api/collections/{collection.Id}", dto)`.
   - Update `POST /api/requests` and `PUT /api/requests/{id}` to persist `SchemaDefinition`.
   - Update `Program.ToRequestItemNodeDto` to map `r.SchemaDefinition`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test backend/tests/ApiDot.E2E.Tests --filter FullyQualifiedName~CollectionOpenApiEndpointsTests`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add backend/src/ApiDot.Server backend/tests/ApiDot.E2E.Tests
git commit -m "feat(server): expose POST /api/collections/import-openapi and persist SchemaDefinition across DTOs"
```

---

### Task 5: Frontend `OpenApiImportModal` & Global "+ Novo" Trigger (`frontend/src`)

**Files:**
- Create: `frontend/src/components/collection/OpenApiImportModal.tsx`
- Create: `frontend/src/components/collection/OpenApiImportModal.test.tsx`
- Modify: `frontend/src/components/layout/CollectionTree.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/lib/treeApi.ts`

**Interfaces:**
- Consumes: `treeApi.importOpenApiCollection({ workspaceId, name, specUrl, specContent })`.
- Produces: Interactive modal triggered by "+ Novo" -> "Importar OpenAPI" that creates a new collection and reloads the tree.

- [ ] **Step 1: Write failing component tests for `OpenApiImportModal`**

```tsx
describe('OpenApiImportModal', () => {
  it('validates URL, parses title suggestion, and submits to onImport', async () => {
    const onImport = vi.fn().mockResolvedValue({ id: 'c1', name: 'Petstore' });
    render(<OpenApiImportModal isOpen={true} onClose={vi.fn()} onImport={onImport} workspaceId="w1" />);
    
    const urlInput = screen.getByLabelText(/URL da Especificação/i);
    fireEvent.change(urlInput, { target: { value: 'https://petstore.swagger.io/v2/swagger.json' } });
    
    const submitBtn = screen.getByRole('button', { name: /Criar e Importar/i });
    fireEvent.click(submitBtn);

    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({
      specUrl: 'https://petstore.swagger.io/v2/swagger.json'
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- OpenApiImportModal` (in `frontend`)
Expected: FAIL (`OpenApiImportModal` not found).

- [ ] **Step 3: Implement `OpenApiImportModal` and wire into `page.tsx`**

1. Add `importOpenApiCollection` function to `frontend/src/lib/treeApi.ts`.
2. Implement `OpenApiImportModal.tsx`:
   - Inputs for URL and Raw Spec Content (with tabs for "URL" and "Colar Conteúdo").
   - Name input with suggestion placeholder.
   - Accessible dialog modal with ESC handling and loading state.
3. In `frontend/src/app/page.tsx`:
   - Replace existing `handleImportOpenApi` (which targeted `tree.collections[0]`) with `setIsImportOpenApiModalOpen(true)`.
   - On successful import, reload tree via `loadTree()`, select the new collection, and show audit banner.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- OpenApiImportModal` (in `frontend`)
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/src/components/collection frontend/src/app/page.tsx frontend/src/lib/treeApi.ts
git commit -m "feat(frontend): create OpenApiImportModal and decouple import from existing collections"
```

---

### Task 6: Frontend `ParamsTab` with `:param` and Bidirectional Query Sync (`frontend/src`)

**Files:**
- Create: `frontend/src/components/request/ParamsTab.tsx`
- Create: `frontend/src/components/request/ParamsTab.test.tsx`
- Modify: `frontend/src/components/request/RequestEditor.tsx`

**Interfaces:**
- Consumes: Current `url`, `pathParams` map, `queryParams` list, and `onChangeUrl(newUrl)`.
- Produces: Path parameter inputs for all `:param` tokens in the URL and query table synced bidirectionally with URL query string.

- [ ] **Step 1: Write failing tests for `ParamsTab`**

```tsx
describe('ParamsTab', () => {
  it('extracts :param segments as path parameters and syncs query table to URL', () => {
    const onUrlChange = vi.fn();
    render(
      <ParamsTab
        url="https://api.com/pets/:petId?limit=10"
        onUrlChange={onUrlChange}
      />
    );

    expect(screen.getByText('petId')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();

    const addQueryKey = screen.getByPlaceholderText(/Novo parâmetro/i);
    fireEvent.change(addQueryKey, { target: { value: 'page' } });
    fireEvent.blur(addQueryKey);

    expect(onUrlChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ParamsTab`
Expected: FAIL (`ParamsTab` not found).

- [ ] **Step 3: Implement `ParamsTab` and integrate into `RequestEditor`**

1. Create `ParamsTab.tsx`:
   - **Path Parameters Section:** Regex extracts `:([a-zA-Z0-9_]+)` from URL path. Renders non-deletable key-value rows. Changing value updates internal path params dictionary.
   - **Query Parameters Section:** Parses query string from URL into `{ id, key, value, enabled, description }`. Sincroniza bidirecionalmente: editing row reconstructs query string and emits `onUrlChange`.
2. In `RequestEditor.tsx`:
   - Add `'params'` to `TabType`.
   - Set tabs: `TABS = [{ id: 'specification', label: 'Especificação' }, { id: 'params', label: 'Parâmetros' }, { id: 'headers', label: 'Cabeçalhos' }, { id: 'body', label: 'Corpo' }, { id: 'auth', label: 'Autenticação' }]`.
   - Render `<ParamsTab />` in the `params` panel.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ParamsTab`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/src/components/request/ParamsTab* frontend/src/components/request/RequestEditor.tsx
git commit -m "feat(frontend): implement ParamsTab with :param detection and bidirectional query sync"
```

---

### Task 7: Frontend `SpecificationTab` (Apidog Style) & Body Example Generation (`frontend/src`)

**Files:**
- Create: `frontend/src/components/request/SpecificationTab.tsx`
- Create: `frontend/src/components/request/SpecificationTab.test.tsx`
- Modify: `frontend/src/components/request/RequestEditor.tsx`

**Interfaces:**
- Consumes: `schemaDefinition?: string`, `onUpdateSchema(schemaJson: string)`, `onGenerateBodyExample(sampleJson: string)`.
- Produces: Visual tree of request body properties, expected responses list, and "Gerar Exemplo no Corpo" button.

- [ ] **Step 1: Write failing tests for `SpecificationTab`**

```tsx
describe('SpecificationTab', () => {
  it('renders property tree, adds new property, and triggers example generation', () => {
    const onGenerate = vi.fn();
    const initialSchema = JSON.stringify({
      summary: 'Get Item',
      body: {
        type: 'object',
        properties: { name: { type: 'string', example: 'Widget' } },
        required: ['name']
      },
      responses: [{ statusCode: '200', description: 'Success' }]
    });

    render(
      <SpecificationTab
        schemaDefinition={initialSchema}
        onChange={vi.fn()}
        onGenerateBodyExample={onGenerate}
      />
    );

    expect(screen.getByText('Get Item')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();

    const generateBtn = screen.getByRole('button', { name: /Gerar Exemplo no Corpo/i });
    fireEvent.click(generateBtn);
    expect(onGenerate).toHaveBeenCalledWith(expect.stringContaining('Widget'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SpecificationTab`
Expected: FAIL (`SpecificationTab` not found).

- [ ] **Step 3: Implement `SpecificationTab` and integrate into `RequestEditor`**

1. Create `SpecificationTab.tsx`:
   - Summary & Description inputs.
   - **Corpo da Requisição (Schema Tree):** Table with columns: Propriedade, Tipo (`string`, `integer`, `number`, `boolean`, `object`, `array`), Obrigatório (checkbox), Descrição, Exemplo. Allows adding/removing rows and nesting for `object` types.
   - **Respostas Esperadas (Responses):** Table with Status Code (badge-colored), Descrição, and Exemplo.
   - **Botão "Gerar Exemplo no Corpo":** Generates sample JSON object matching properties and triggers `onGenerateBodyExample(json)`.
2. In `RequestEditor.tsx`:
   - Render `SpecificationTab` in the `specification` tabpanel.
   - When "Gerar Exemplo no Corpo" is clicked, update `body` state, switch active area to `body`, and set `isDirty`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- SpecificationTab`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/src/components/request/SpecificationTab* frontend/src/components/request/RequestEditor.tsx
git commit -m "feat(frontend): add Apidog-style SpecificationTab and sample body generator"
```

---

### Task 8: Schema-Driven IntelliSense in `RequestAutocomplete` (`frontend/src`)

**Files:**
- Modify: `frontend/src/components/request/RequestAutocomplete.tsx`
- Modify: `frontend/src/components/request/RequestAutocomplete.test.tsx`
- Modify: `frontend/src/components/request/RequestEditor.tsx`

**Interfaces:**
- Consumes: `schemaProperties?: Array<{ key: string; type: string; description?: string }>` passed to `RequestAutocomplete`.
- Produces: Autocompletion suggestions inside JSON quotes/keys matching properties defined in `SpecificationTab`.

- [ ] **Step 1: Write failing test for schema-driven autocompletion suggestions**

```tsx
describe('RequestAutocomplete with schemaProperties', () => {
  it('suggests schema properties with badge and description when typing in body editor', () => {
    const schemaProps = [
      { key: 'category', type: 'string', description: 'Pet category name' },
      { key: 'tags', type: 'array', description: 'Pet tags' }
    ];

    render(
      <RequestAutocomplete
        value='{ "cat'
        cursorPos={6}
        schemaProperties={schemaProps}
      />
    );

    expect(screen.getByText('category')).toBeInTheDocument();
    expect(screen.getByText('[string]')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- RequestAutocomplete`
Expected: FAIL (`schemaProperties` not supported).

- [ ] **Step 3: Update `RequestAutocomplete` and `RequestEditor` to pass and display schema suggestions**

1. In `RequestAutocomplete.tsx`:
   - Add `schemaProperties?: Array<{ key: string; type: string; description?: string }>` to `RequestAutocompleteProps`.
   - When cursor is inside JSON string or after `"`, include matching schema properties in suggestions with `type: 'property'` and type badge.
2. In `RequestEditor.tsx`:
   - Parse `schemaDefinition` and pass flattened list of properties to `<RequestAutocomplete schemaProperties={...} />` in the Body editor.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- RequestAutocomplete`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add frontend/src/components/request/RequestAutocomplete* frontend/src/components/request/RequestEditor.tsx
git commit -m "feat(frontend): wire SchemaDefinition properties into RequestAutocomplete for body IntelliSense"
```

---

### Task 9: Full Suite Verification & Regression Check

**Files:**
- Run full backend test suite (`dotnet test`).
- Run full frontend test suite (`npm test`).
- Execute Playwright E2E smoke tests.

- [ ] **Step 1: Execute all backend tests**

Run: `dotnet test backend/ApiDot.sln`
Expected: All tests pass (0 failures).

- [ ] **Step 2: Execute all frontend tests**

Run: `npm --prefix frontend test run`
Expected: All tests pass (0 failures).

- [ ] **Step 3: Run Playwright E2E tests**

Run: `npm --prefix frontend test:e2e`
Expected: All suites pass.

- [ ] **Step 4: Commit any final test adjustments**

```bash
git add .
git commit -m "chore: verify complete OpenAPI import, folders, params, and specification tab test suites"
```
