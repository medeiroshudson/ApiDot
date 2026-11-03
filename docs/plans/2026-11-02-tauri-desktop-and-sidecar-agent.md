# Tauri Desktop com Sidecar Native AOT e Operação Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empacotar o ApiDot como aplicação desktop multi-plataforma com Tauri v2, incorporando o `ApiDot.Agent` compilado em Native AOT como sidecar com listener de loopback local seguro, adicionando seletor granular de alvos de execução, persistência local em disco (`~/.apidot/storage`) e sincronização/reconciliação offline com a nuvem.

**Architecture:** O Tauri v2 empacota a interface Next.js 16/React 19 compilada e gerencia o ciclo de vida do binário `ApiDot.Agent` como processo filho. O Sidecar sobe um listener HTTP em porta efêmera (`127.0.0.1:<porta>`) protegido por segredo de sessão efêmero (`X-ApiDot-Sidecar-Secret`) para execução local direta com latência zero e bypass de CORS, enquanto simultaneamente se conecta ao WebSocket do Hub central quando online. O estado e coleções são mantidos em `~/.apidot/storage` com fila de mutações offline e reconciliação via `POST /api/sync/batch` no `ApiDot.Server`.

**Tech Stack:** Tauri v2, Rust, .NET 9 (Native AOT, Kestrel Minimal API, SocketsHttpHandler), Next.js 16.4.4, React 19.3.1, Zustand 5, TypeScript 5.7, Vitest, xUnit.

**Spec:** `docs/plans/2026-11-02-tauri-desktop-and-sidecar-agent-design.md`

## Global Constraints

- **Compilação Native AOT Estrita:** O `ApiDot.Agent` não deve usar reflexão em tempo de execução; serialização JSON via `AgentJsonContext` source generator.
- **Segurança de Loopback:** Todas as requisições para a porta local do sidecar devem obrigatoriamente exigir o cabeçalho `X-ApiDot-Sidecar-Secret`.
- **Zero Processos Órfãos:** O Tauri deve matar o processo filho com `SIGTERM`/`kill` ao fechar qualquer janela ou sair do app.
- **Porta Dinâmica:** O sidecar deve ligar na porta `0` (efêmera do SO) e reportar via stdout no formato `[APIDOT_SIDECAR_READY:<port>]`.
- **Compatibilidade Web e Desktop:** O frontend deve continuar funcionando de forma idêntica no navegador web, ativando recursos desktop somente quando `__TAURI_INTERNALS__` estiver presente.
- **Configuração Compartilhada:** Reutilizar `~/.apidot/config.json` para conexão com o servidor (padrão `https://apidot.hmedeiros.dev`).

## Review Focus

1. **Tentativa de requisição ao loopback sem segredo:** Retorna `401 Unauthorized` imediato no Sidecar para bloquear DNS rebinding.
2. **Conflito de sincronização com edição simultânea nuvem/local:** Preserva a alteração local como uma cópia `(Local Backup)` sem sobrescrever silenciosamente dados remotos.
3. **Queda repentina do processo Sidecar durante o uso:** O Tauri detecta a saída do processo e tenta reiniciar o sidecar automaticamente ou notifica a interface.
4. **Tentativa de uso offline sem login prévio no primeiro acesso:** A interface exibe aviso claro de que o primeiro acesso exige conexão para autenticação e download inicial dos workspaces.
5. **Comportamento quando a porta efêmera não puder ser vinculada:** O Agent reporta código de erro diferente de zero e mensagem descritiva no stderr.

---

### Task 1: Subcomando `sidecar` no `ApiDot.Agent` (.NET Native AOT)

**Files:**
- Create: `backend/src/ApiDot.Agent/Commands/SidecarCommand.cs`
- Modify: `backend/src/ApiDot.Agent/AgentCliParser.cs:15-80`
- Modify: `backend/src/ApiDot.Agent/Program.cs:20-65`
- Modify: `backend/src/ApiDot.Agent/Serialization/AgentJsonContext.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Agent/SidecarCommandTests.cs`

**Interfaces:**
- Consumes: `HttpRequestDispatch`, `HttpResponsePayload` de `ApiDot.Core.Models`
- Produces: Subcomando `apidot-agent sidecar --port <p> --secret <s> --config <c>` com listener Kestrel Slim em loopback

- [ ] **Step 1: Escrever teste de falha para parsing de opções do sidecar**

```csharp
[Fact]
public void Parse_SidecarCommand_ParsesPortAndSecretSuccessfully()
{
    var args = new[] { "sidecar", "--port", "51234", "--secret", "test-secret-123" };
    var options = AgentCliParser.Parse(args, null);

    Assert.Equal(AgentCommandType.Sidecar, options.Command);
    Assert.Equal(51234, options.Port);
    Assert.Equal("test-secret-123", options.Secret);
}
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SidecarCommandTests -v minimal`  
Expected: FAIL com `AgentCommandType does not contain Sidecar`

- [ ] **Step 3: Implementar parsing e comando Sidecar com Minimal API Kestrel Slim**

Adicionar `AgentCommandType.Sidecar`, propriedades `Port` e `Secret` em `AgentCliOptions`. Em `SidecarCommand.cs`, configurar `WebApplication.CreateSlimBuilder` escutando em `127.0.0.1:<port>`, validar header `X-ApiDot-Sidecar-Secret`, mapear `POST /execute` consumindo `HttpExecutor.ExecuteAsync(dispatch)` e emitir `[APIDOT_SIDECAR_READY:<port>]` na inicialização. Antes de iniciar a conexão WebSocket de background com o Hub central, verificar se `ServiceManager.Status().Success` já indica o serviço do sistema ativo; se ativo, suprimir a conexão WebSocket redundante para unificar a identidade do dispositivo sem conflitos de sessão.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SidecarCommandTests -v minimal`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Agent/ backend/tests/ApiDot.Server.Tests/Agent/
git commit -m "feat(agent): implement sidecar loopback listener with secret auth"
```

---

### Task 2: Seletor Granular de Alvos (Global e Coleção) e Resolução em Cascata

**Files:**
- Modify: `backend/src/ApiDot.Server/Data/Entities/Collection.cs:10-25`
- Modify: `backend/src/ApiDot.Server/Services/TargetResolver.cs:10-45`
- Modify: `backend/src/ApiDot.Server/Services/ITargetResolver.cs`
- Modify: `frontend/src/components/settings/GlobalSettingsModal.tsx:400-500`
- Modify: `frontend/src/components/collection/CollectionSettingsModal.tsx:510-540`
- Modify: `frontend/src/stores/useDeviceStore.ts:50-80`
- Test: `backend/tests/ApiDot.Server.Tests/Services/TargetResolverTests.cs`
- Test: `frontend/src/components/settings/GlobalSettingsModal.test.tsx`
- Test: `frontend/src/components/collection/CollectionSettingsModal.test.tsx`

**Interfaces:**
- Consumes: `ExecutionTarget` enum, `AgentDeviceDto`
- Produces: `Collection.TargetDeviceId`, `TargetResolutionResult { Target, DeviceId }`

- [ ] **Step 1: Escrever teste de falha para resolução de alvo com TargetDeviceId**

```csharp
[Fact]
public void ResolveTarget_WhenCollectionHasSpecificDevice_ReturnsAgentWithDeviceId()
{
    var deviceId = Guid.NewGuid();
    var collection = new Collection { Name = "Col", DefaultTarget = ExecutionTarget.Agent, TargetDeviceId = deviceId };
    var request = new RequestItem { Name = "Req", Url = "http://test", Collection = collection };

    var resolver = new TargetResolver();
    var result = resolver.ResolveTargetWithDevice(request, activeDeviceId: null);

    Assert.Equal(ExecutionTarget.Agent, result.Target);
    Assert.Equal(deviceId, result.DeviceId);
}
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter TargetResolverTests -v minimal`  
Expected: FAIL com `ResolveTargetWithDevice não definido`

- [ ] **Step 3: Implementar resolução no backend e seletores no frontend**

Atualizar `Collection.cs` com `public Guid? TargetDeviceId { get; set; }`. Atualizar `TargetResolver` para resolver a cascata `Request -> Folder -> Collection -> GlobalSettings -> ActiveDevice`. No frontend, adicionar seletor em `GlobalSettingsModal.tsx` ("Nuvem", "Dispositivo Ativo", dispositivos cadastrados) e em `CollectionSettingsModal.tsx` ("Herdar", "Nuvem", "Dispositivo Ativo", dispositivo específico).

- [ ] **Step 4: Executar testes unitários do backend e frontend**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter TargetResolverTests`  
Run: `npm --prefix frontend test -- GlobalSettingsModal.test.tsx CollectionSettingsModal.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/ frontend/src/
git commit -m "feat: add global and collection level target execution selectors"
```

---

### Task 3: Scaffolding do Projeto Tauri v2 em `desktop/`

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/tauri.conf.json`
- Create: `desktop/src-tauri/capabilities/default.json`
- Create: `desktop/src-tauri/src/main.rs`
- Modify: `package.json:1-10`

**Interfaces:**
- Consumes: Next.js dev server em `localhost:3000` / export estático em `frontend/out`
- Produces: Estrutura base de compilação Tauri v2 e scripts `npm run desktop:dev` e `npm run desktop:build`

- [ ] **Step 1: Escrever teste de validação de configuração do Tauri**

Criar script de teste ou assert em TypeScript/Bash verificando se `desktop/src-tauri/tauri.conf.json` possui `identifier: "dev.hmedeiros.apidot"`, `frontendDist` configurado e permissões de shell declaradas.

- [ ] **Step 2: Configurar Cargo.toml e tauri.conf.json**

Declarar dependências do Tauri v2: `tauri = { version = "2", features = [] }`, `tauri-plugin-shell = "2"`, `tauri-plugin-fs = "2"`, `serde`, `serde_json`, `uuid`, `tokio`. Configurar `tauri.conf.json` com título "ApiDot", dimensões 1280x800 e permissões essenciais.

- [ ] **Step 3: Adicionar scripts de automação no package.json da raiz**

```json
"desktop:dev": "cargo tauri dev --config desktop/src-tauri/tauri.conf.json",
"desktop:build": "cargo tauri build --config desktop/src-tauri/tauri.conf.json"
```

- [ ] **Step 4: Validar sintaxe e integridade dos manifestos com `cargo check`**

Run: `cargo check --manifest-path desktop/src-tauri/Cargo.toml`  
Expected: PASS (ou compilação limpa das dependências)

- [ ] **Step 5: Commit**

```bash
git add desktop/ package.json
git commit -m "feat(desktop): scaffold tauri v2 desktop project structure"
```

---

### Task 4: Gerenciamento do Ciclo de Vida do Sidecar no Rust (`sidecar.rs`)

**Files:**
- Create: `desktop/src-tauri/src/sidecar.rs`
- Modify: `desktop/src-tauri/src/main.rs`
- Test: `desktop/src-tauri/tests/sidecar_tests.rs`

**Interfaces:**
- Consumes: Binário nativo `apidot-agent` compilado
- Produces: Comandos IPC `get_sidecar_info() -> { port: u16, secret: String }`, encerramento limpo via RAII/drop

- [ ] **Step 1: Escrever teste Rust de extração de porta do stdout do sidecar**

```rust
#[test]
fn test_parse_sidecar_ready_line() {
    let output = "[APIDOT_SIDECAR_READY:54321]\n";
    let port = parse_sidecar_port(output).expect("Deveria extrair a porta");
    assert_eq!(port, 54321);
}
```

- [ ] **Step 2: Executar teste Rust para verificar falha**

Run: `cargo test --manifest-path desktop/src-tauri/Cargo.toml --test sidecar_tests`  
Expected: FAIL com `parse_sidecar_port não definido`

- [ ] **Step 3: Implementar spawn do processo, captura de porta e comando IPC**

No `sidecar.rs`, gerar `secret` com `uuid::Uuid::new_v4().to_string()`. Usar `tokio::process::Command` para invocar o binário `apidot-agent sidecar --port 0 --secret <secret>`, ler linha por linha do stdout via `BufReader` até encontrar `[APIDOT_SIDECAR_READY:<port>]`. Armazenar `(port, secret)` em um `Arc<Mutex<SidecarState>>`. Implementar `on_window_event` no Tauri para enviar sinal de término ao processo filho quando a aplicação for fechada.

- [ ] **Step 4: Executar teste Rust para verificar aprovação**

Run: `cargo test --manifest-path desktop/src-tauri/Cargo.toml --test sidecar_tests`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src-tauri/
git commit -m "feat(desktop): implement sidecar process lifecycle and IPC in Rust"
```

---

### Task 5: Adaptador de Execução Desktop e Roteamento no Frontend

**Files:**
- Create: `frontend/src/lib/desktop/runtime.ts`
- Create: `frontend/src/lib/desktop/desktopExecutor.ts`
- Modify: `frontend/src/components/workspace/WorkspaceEditorPane.tsx:220-250`
- Test: `frontend/src/lib/desktop/desktopExecutor.test.ts`
- Test: `frontend/src/components/workspace/WorkspaceEditorPane.test.tsx`

**Interfaces:**
- Consumes: `isDesktop()`, comando Tauri `get_sidecar_info`
- Produces: Função `executeViaDesktopSidecar(dispatch: HttpRequestDispatch): Promise<ResponseData>`

- [ ] **Step 1: Escrever teste de falha para o executor desktop**

```typescript
it('dispatches request to sidecar loopback port with X-ApiDot-Sidecar-Secret header', async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ statusCode: 200, statusText: 'OK', body: '{"ok":true}' }),
  });
  globalThis.fetch = mockFetch;

  const result = await executeViaDesktopSidecar({
    port: 54321,
    secret: 'test-secret',
    dispatch: { method: 'GET', url: 'http://localhost:3000/api/health', headers: {} } as any,
  });

  expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:54321/execute', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({
      'X-ApiDot-Sidecar-Secret': 'test-secret',
    }),
  }));
  expect(result.statusCode).toBe(200);
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- desktopExecutor.test.ts`  
Expected: FAIL com `executeViaDesktopSidecar não definido`

- [ ] **Step 3: Implementar `runtime.ts`, `desktopExecutor.ts` e integração no `WorkspaceEditorPane.tsx`**

`isDesktop()` verifica `window.__TAURI_INTERNALS__`. No `WorkspaceEditorPane.tsx`, se `isDesktop()` for verdadeiro e a requisição tiver alvo Agent ou estiver offline, obter porta e segredo via cache do store desktop e chamar `executeViaDesktopSidecar`.

- [ ] **Step 4: Executar testes de execução do frontend**

Run: `npm --prefix frontend test -- desktopExecutor.test.ts WorkspaceEditorPane.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/desktop/ frontend/src/components/workspace/WorkspaceEditorPane.tsx
git commit -m "feat(frontend): integrate desktop sidecar direct loopback execution"
```

---

### Task 6: Persistência em Disco no Tauri e Modo Offline (Local-First)

**Files:**
- Create: `desktop/src-tauri/src/storage.rs`
- Modify: `desktop/src-tauri/src/main.rs`
- Create: `frontend/src/lib/storage/offlineStorage.ts`
- Modify: `frontend/src/stores/useWorkspaceStore.ts:30-80`
- Test: `frontend/src/lib/storage/offlineStorage.test.ts`

**Interfaces:**
- Consumes: Diretório `~/.apidot/storage/` via Tauri fs IPC
- Produces: `saveWorkspaceLocally(ws)`, `loadWorkspacesLocally()`, `queuePendingMutation(mutation)`

- [ ] **Step 1: Escrever teste de falha para persistência offline local**

```typescript
it('saves workspace JSON to local storage and enqueues mutation when offline', async () => {
  const mockSave = vi.fn().mockResolvedValue(true);
  const mockQueue = vi.fn().mockResolvedValue(true);

  await saveWorkspaceOffline({ id: 'ws-1', name: 'Local WS' } as any, {
    saveFile: mockSave,
    queueMutation: mockQueue,
  });

  expect(mockSave).toHaveBeenCalledWith('workspaces/ws-1.json', expect.stringContaining('Local WS'));
  expect(mockQueue).toHaveBeenCalledWith(expect.objectContaining({
    entityType: 'Workspace',
    action: 'Upsert',
  }));
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- offlineStorage.test.ts`  
Expected: FAIL com `saveWorkspaceOffline não definido`

- [ ] **Step 3: Implementar comandos Rust de I/O em disco e adaptador TypeScript**

No Rust (`storage.rs`), criar comandos `fs_save_storage`, `fs_load_storage` e `fs_list_storage` restritos estritamente ao diretório `~/.apidot/storage/`. No TypeScript (`offlineStorage.ts`), estruturar persistência de workspaces, coleções e fila `pending_mutations.json`. Integrar no `useWorkspaceStore` para salvar localmente em background quando `isDesktop()` for ativo.

- [ ] **Step 4: Executar testes unitários de armazenamento**

Run: `npm --prefix frontend test -- offlineStorage.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src-tauri/src/storage.rs frontend/src/lib/storage/
git commit -m "feat(storage): implement offline json disk storage and mutation queue"
```

---

### Task 7: Endpoint de Reconciliação no Backend (`POST /api/sync/batch`)

**Files:**
- Create: `backend/src/ApiDot.Server/Endpoints/SyncEndpoints.cs`
- Create: `backend/src/ApiDot.Server/Models/SyncBatchModels.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs:80-120`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/SyncBatchEndpointsTests.cs`

**Interfaces:**
- Consumes: DTOs `SyncBatchRequest`, `SyncItemMutation` com `Id`, `EntityType`, `PayloadJson`, `UpdatedAtUtc`
- Produces: `POST /api/sync/batch -> SyncBatchResponse { AppliedCount, Conflicts: [] }`

- [ ] **Step 1: Escrever teste de falha para `POST /api/sync/batch`**

```csharp
[Fact]
public async Task SyncBatch_AppliesNewWorkspaceAndReturnsAppliedStatus()
{
    var client = _factory.CreateClient();
    var request = new SyncBatchRequest
    {
        Mutations = new List<SyncItemMutation>
        {
            new() { Id = Guid.NewGuid(), EntityType = "Workspace", Action = "Upsert", UpdatedAtUtc = DateTime.UtcNow, PayloadJson = "{\"name\":\"Offline WS\"}" }
        }
    };

    var response = await client.PostAsJsonAsync("/api/sync/batch", request);
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    var result = await response.Content.ReadFromJsonAsync<SyncBatchResponse>();
    Assert.Equal(1, result!.AppliedCount);
}
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SyncBatchEndpointsTests -v minimal`  
Expected: FAIL com 404 Not Found

- [ ] **Step 3: Implementar endpoint `POST /api/sync/batch` com resolução Last-Write-Wins**

Em `SyncEndpoints.cs`, receber lote de mutações, validar autenticação do usuário (`ICurrentUserContext`), iterar pelas entidades aplicando alterações caso `UpdatedAtUtc` local seja mais recente que o registro no banco. Se houver conflito não trivial, clonar entidade local como `(Local Backup)`.

- [ ] **Step 4: Executar testes para verificar aprovação**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter SyncBatchEndpointsTests -v minimal`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Endpoints/ backend/tests/ApiDot.Server.Tests/
git commit -m "feat(server): implement POST /api/sync/batch with last-write-wins resolution"
```

---

### Task 8: Sincronizador de Reconexão no Frontend (`syncManager.ts`)

**Files:**
- Create: `frontend/src/lib/sync/syncManager.ts`
- Modify: `frontend/src/components/layout/WorkspaceShell.tsx:30-80`
- Test: `frontend/src/lib/sync/syncManager.test.ts`

**Interfaces:**
- Consumes: `navigator.onLine`, `window.addEventListener('online')`, `POST /api/sync/batch`
- Produces: `startSyncListener()`, `syncPendingMutations()`

- [ ] **Step 1: Escrever teste de falha para sincronização automática na reconexão**

```typescript
it('dispatches pending mutations to /api/sync/batch upon online event and clears queue', async () => {
  const pendingMutations = [{ id: 'm1', entityType: 'Collection', action: 'Upsert' }];
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ appliedCount: 1, conflicts: [] }),
  });
  globalThis.fetch = mockFetch;

  const result = await processSyncQueue(pendingMutations as any);

  expect(mockFetch).toHaveBeenCalledWith('/api/sync/batch', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ mutations: pendingMutations }),
  }));
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- syncManager.test.ts`  
Expected: FAIL com `processSyncQueue não definido`

- [ ] **Step 3: Implementar `syncManager.ts` e registrar listener no `WorkspaceShell.tsx`**

Implementar rotina que escuta o evento `online` do navegador e realiza polling de conectividade com `/health`. Ao reconectar, lê `~/.apidot/storage/queue/pending_mutations.json`, despacha para `/api/sync/batch` e, se bem-sucedido, esvazia a fila.

- [ ] **Step 4: Executar testes unitários do gerenciador de sincronização**

Run: `npm --prefix frontend test -- syncManager.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/sync/ frontend/src/components/layout/WorkspaceShell.tsx
git commit -m "feat(sync): implement online reconnect listener and mutation batch dispatcher"
```

---

### Task 9: Validação Geral de Builds, Tipos e Suíte de Testes

**Files:**
- Modify: `frontend/package.json`
- Test: Execução integral das suítes de testes automatizados (.NET e Vitest)

**Interfaces:**
- Consumes: Todo o código implementado nas tarefas anteriores
- Produces: 100% de testes verdes e compilação de produção sem avisos

- [ ] **Step 1: Executar suíte completa de testes do backend .NET**

Run: `dotnet test backend/ApiDot.sln -v minimal`  
Expected: PASS (todos os testes de Core, Server e Agent verdes)

- [ ] **Step 2: Executar suíte completa de testes do frontend com Vitest**

Run: `npm --prefix frontend test`  
Expected: PASS (todos os testes unitários e de integração verdes)

- [ ] **Step 3: Executar type-check rigoroso do TypeScript**

Run: `npx --prefix frontend tsc --noEmit`  
Expected: 0 erros

- [ ] **Step 4: Executar build de produção do Next.js**

Run: `npm --prefix frontend run build`  
Expected: Build bem-sucedido com rotas estáticas e compilador React ativo

- [ ] **Step 5: Commit final da integração**

```bash
git add .
git commit -m "chore(desktop): finalize tauri desktop and sidecar implementation validation"
```
