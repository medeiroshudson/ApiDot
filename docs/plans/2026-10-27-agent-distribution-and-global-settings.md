# Plan: Distribuição do Agent via GitHub Releases, Setup via Script e Modal de Configurações Globais

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o ciclo de vida completo do ApiDot Local Agent — modelo de autenticação duradouro por dispositivo físico (`AgentDevice`), endpoint WebSocket `/ws/agent`, roteamento de execução direcionado por `X-Device-Id`, scripts de auto-instalação (`/install.sh`), comandos de serviço de sistema operacional no CLI (`ApiDot.Agent`), modal de configurações globais com gestão de dispositivos no frontend Next.js, e pipeline de CI/CD para compilação Native AOT anexada a releases do GitHub.

**Architecture:** O backend .NET 9 atua como hub WebSocket e distribuidor de scripts; cada máquina física é registrada como um `AgentDevice` com token seguro (armazenado como hash SHA-256). O frontend Next.js identifica o dispositivo atual via `localStorage`, despacha requisições com o header `X-Device-Id`, e fornece um modal de configurações com abas laterais para gerenciar dispositivos e copiar o comando de instalação de linha única (`curl ... | bash`). O CLI .NET AOT suporta execução interativa ou como daemon de usuário no SO (`launchd`/`systemd`/`schtasks`).

**Tech Stack:** .NET 9 (C#, EF Core, WebSockets, Native AOT), Next.js 15 (React 19, TypeScript, Tailwind CSS, Lucide Icons, Zustand), GitHub Actions.

**Spec:** `docs/plans/2026-10-27-agent-distribution-and-global-settings-design.md`

## Global Constraints

- **Compilação Native AOT:** O `ApiDot.Agent` deve compilar sem dependências do runtime do .NET na máquina do usuário final.
- **Segurança de Tokens:** O token gerado segue o padrão PAT (exibição em texto claro estritamente uma única vez na criação/regeneração; persistência exclusiva do hash SHA-256 no banco).
- **Sem privilégios de root:** Serviços de segundo plano no SO rodam estritamente a nível de usuário comum (`~/Library/LaunchAgents` no macOS, `systemd --user` no Linux, `schtasks` no Windows).
- **Zero Mixed-Content / PNA:** Toda a comunicação de execução com o Agent é mediada pelo hub WebSocket reverso no backend, sem requisições HTTP do browser para `localhost`.
- **Manutenção de Testes Existentes:** Todos os testes unitários anteriores de backend e frontend devem continuar passando sem regressões.

## Review Focus

1. **Tentativa de execução com Agent offline ou sem dispositivo vinculado:** O backend deve retornar `409 Conflict` limpo e o frontend exibir aviso informativo com atalho para o modal, sem travar a interface.
2. **Revogação de token com conexão WebSocket ativa:** A chamada `POST /api/agent/devices/{id}/revoke` deve fechar imediatamente o socket no `AgentHub` com código `PolicyViolation` e cancelar qualquer dispatch em voo.
3. **Reconexão do Agent com sobreposição de socket:** Se o mesmo dispositivo reconectar antes do socket anterior expirar, o `AgentHub` deve fechar o socket anterior de forma segura e substituir pelo novo sem vazamento de recursos.
4. **Resiliência do script `install.sh` contra variações de arquitetura:** O script deve mapear corretamente `Darwin x86_64` vs `arm64`, e `Linux x86_64` vs `aarch64`, falhando com mensagem amigável caso a arquitetura não seja suportada.
5. **Comportamento do `localStorage` vazio no navegador:** Ao abrir a aplicação pela primeira vez em um novo navegador sem `apidot_device_id`, a interface deve indicar que nenhum dispositivo está vinculado a esta sessão e orientar o cadastro.

---

### Task 1: Backend Data Model, Token Hashing & Device Persistence (`ApiDot.Server`)

**Files:**
- Create: `backend/src/ApiDot.Server/Data/Entities/AgentDevice.cs`
- Create: `backend/src/ApiDot.Server/Models/AgentDeviceModels.cs`
- Modify: `backend/src/ApiDot.Server/Data/ApiDotDbContext.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Data/AgentDevicePersistenceTests.cs`

**Interfaces:**
- Produces:
  - Entity `AgentDevice`: `Guid Id`, `string Name`, `string TokenHash`, `string TokenPrefix`, `DateTime CreatedAtUtc`, `DateTime? LastConnectedAtUtc`, `string? LastConnectedHostname`, `string? LastConnectedOs`, `string? AgentVersion`, `bool IsRevoked`
  - Helper `DeviceTokenHelper.GenerateToken()`: gera tupla `(string RawToken, string TokenHash, string TokenPrefix)` usando `RandomNumberGenerator` e `SHA256`
  - DTOs em `AgentDeviceModels.cs`: `AgentDeviceDto`, `CreateAgentDeviceRequest`, `CreateAgentDeviceResponse`, `RegenerateDeviceTokenResponse`

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public async Task Can_Create_And_Query_AgentDevice_With_Hashed_Token()
{
    using var context = CreateInMemoryContext();
    var (rawToken, tokenHash, tokenPrefix) = DeviceTokenHelper.GenerateToken();

    var device = new AgentDevice
    {
        Name = "MacBook Pro Hudson",
        TokenHash = tokenHash,
        TokenPrefix = tokenPrefix
    };

    context.AgentDevices.Add(device);
    await context.SaveChangesAsync();

    var saved = await context.AgentDevices.FindAsync(device.Id);
    saved.Should().NotBeNull();
    saved!.Name.Should().Be("MacBook Pro Hudson");
    saved.TokenHash.Should().Be(tokenHash);
    saved.TokenPrefix.Should().StartWith("apidot_dev_");
    rawToken.Should().StartWith(saved.TokenPrefix);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~AgentDevicePersistenceTests`
Expected: FAIL com tipo ou membro não definido.

- [ ] **Step 3: Implement `AgentDevice.cs`, `DeviceTokenHelper.cs`, DTOs e mapeamento no `ApiDotDbContext.cs`**

Criar entidade `AgentDevice`, configurar `DbSet<AgentDevice> AgentDevices` no `ApiDotDbContext` com índice em `TokenHash`, e utilitário seguro `DeviceTokenHelper` com SHA-256 em formato hexadecimal minúsculo.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~AgentDevicePersistenceTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Data/Entities/AgentDevice.cs \
        backend/src/ApiDot.Server/Models/AgentDeviceModels.cs \
        backend/src/ApiDot.Server/Data/ApiDotDbContext.cs \
        backend/tests/ApiDot.Server.Tests/Data/AgentDevicePersistenceTests.cs
git commit -m "feat(backend): add AgentDevice entity, token hashing and persistence"
```

---

### Task 2: Backend REST Endpoints para Gestão de Dispositivos (`ApiDot.Server`)

**Files:**
- Create: `backend/src/ApiDot.Server/Endpoints/AgentDeviceEndpoints.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/AgentDeviceEndpointsTests.cs`

**Interfaces:**
- Consumes: `ApiDotDbContext`, `IAgentHub`, `DeviceTokenHelper`
- Produces:
  - `GET /api/agent/devices` -> `IEnumerable<AgentDeviceDto>` (com `IsOnline: bool` obtido do `IAgentHub`)
  - `POST /api/agent/devices` -> `201 Created` com `CreateAgentDeviceResponse` (contém `RawToken` apenas uma vez)
  - `POST /api/agent/devices/{id:guid}/revoke` -> `200 OK` (marca `IsRevoked = true` e desloga do `IAgentHub`)
  - `POST /api/agent/devices/{id:guid}/regenerate-token` -> `200 OK` com `RegenerateDeviceTokenResponse` (novo `RawToken`)

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public async Task Device_Crud_Lifecycle_Generates_RawToken_Only_On_Create_And_Regenerate()
{
    // 1. POST /api/agent/devices cria dispositivo e retorna RawToken
    // 2. GET /api/agent/devices lista dispositivo mascarado sem expor RawToken
    // 3. POST /api/agent/devices/{id}/regenerate-token retorna novo RawToken
    // 4. POST /api/agent/devices/{id}/revoke marca como revogado
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~AgentDeviceEndpointsTests`
Expected: FAIL com 404 Not Found.

- [ ] **Step 3: Implement `AgentDeviceEndpoints.cs` e registrar em `Program.cs`**

Implementar endpoints com validação de nome obrigatório, consulta ao `IAgentHub.IsAgentOnline(deviceId)`, desconexão forçada via `IAgentHub.UnregisterAgent(deviceId)` ao revogar/regenerar e retorno de DTOs estruturados.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~AgentDeviceEndpointsTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Endpoints/AgentDeviceEndpoints.cs \
        backend/src/ApiDot.Server/Program.cs \
        backend/tests/ApiDot.Server.Tests/Endpoints/AgentDeviceEndpointsTests.cs
git commit -m "feat(backend): add REST endpoints for AgentDevice management and token lifecycle"
```

---

### Task 3: Backend WebSocket Endpoint `/ws/agent`, Autenticação e Heartbeat (`ApiDot.Server`)

**Files:**
- Modify: `backend/src/ApiDot.Server/WebSockets/AgentHub.cs`
- Modify: `backend/src/ApiDot.Server/WebSockets/IAgentHub.cs`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/WebSockets/AgentWebSocketAuthTests.cs`

**Interfaces:**
- Consumes: `ApiDotDbContext`, `AgentDevice`, `IAgentHub`
- Produces:
  - WebSocket `/ws/agent?token=<raw_token>&name=<hostname>&os=<os>&version=<version>`
  - Atualização de `LastConnectedAtUtc`, `LastConnectedHostname`, `LastConnectedOs`, `AgentVersion` no banco
  - Heartbeat a cada 15s (`WebSocketMessageType.Text` ou ping nativo) gravando latência média
  - Rejeição com `WebSocketCloseStatus.PolicyViolation` (4401) para tokens inválidos ou revogados

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public async Task WebSocket_Connection_With_Valid_Token_Registers_Device_In_AgentHub()
{
    // Configura AgentDevice ativo
    // Conecta client WebSocket em /ws/agent?token=...
    // Verifica que hub.IsAgentOnline(device.Id) é verdadeiro
    // Envia token revogado e verifica fechamento com PolicyViolation
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~AgentWebSocketAuthTests`
Expected: FAIL com rota `/ws/agent` inexistente.

- [ ] **Step 3: Implement `/ws/agent` handler em `Program.cs` e heartbeat no `AgentHub`**

Adicionar middleware de WebSockets, criar handler assíncrono para `/ws/agent`, autenticar via `DeviceTokenHelper.ComputeHash(token)`, vincular socket no `AgentHub`, atualizar metadados do dispositivo e disparar loop de heartbeat e escuta de mensagens.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~AgentWebSocketAuthTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/WebSockets/AgentHub.cs \
        backend/src/ApiDot.Server/WebSockets/IAgentHub.cs \
        backend/src/ApiDot.Server/Program.cs \
        backend/tests/ApiDot.Server.Tests/WebSockets/AgentWebSocketAuthTests.cs
git commit -m "feat(backend): implement /ws/agent websocket authentication and heartbeat"
```

---

### Task 4: Backend Roteamento de Execução Direcionado por Dispositivo (`ApiDot.Server`)

**Files:**
- Modify: `backend/src/ApiDot.Server/Program.cs` (endpoint `/api/requests/execute`)
- Test: `backend/tests/ApiDot.Server.Tests/Execution/DeviceTargetExecutionTests.cs`

**Interfaces:**
- Consumes: Header `X-Device-Id`, `IAgentHub`, `HttpRequestDispatch`
- Produces:
  - Execução via Agent roteada estritamente para o socket do `deviceId` fornecido no cabeçalho
  - Retorno `409 Conflict` detalhado caso `target == Agent` e o dispositivo não esteja conectado ou não seja informado

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public async Task Execute_Request_With_Target_Agent_Routes_To_Specified_Device_Or_Returns_409()
{
    // 1. Sem X-Device-Id: retorna 409 Conflict "Dispositivo não especificado"
    // 2. Com X-Device-Id offline: retorna 409 Conflict "Agent deste dispositivo offline"
    // 3. Com X-Device-Id online: despacha payload ao AgentHub e retorna 200 OK com resposta
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~DeviceTargetExecutionTests`
Expected: FAIL com comportamento anterior não roteado por dispositivo.

- [ ] **Step 3: Update `/api/requests/execute` em `Program.cs`**

Ler header `X-Device-Id: <guid>`. Se `resolvedTarget == ExecutionTarget.Agent`, validar presença e online status em `agentHub.IsAgentOnline(deviceId)`. Despachar via `agentHub.DispatchToAgentAsync(deviceId, ...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~DeviceTargetExecutionTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Program.cs \
        backend/tests/ApiDot.Server.Tests/Execution/DeviceTargetExecutionTests.cs
git commit -m "feat(backend): route agent execution requests by X-Device-Id header"
```

---

### Task 5: Backend Script de Instalação e Proxy de Download de Release (`ApiDot.Server`)

**Files:**
- Create: `backend/src/ApiDot.Server/Endpoints/InstallScriptEndpoints.cs`
- Create: `backend/src/ApiDot.Server/Scripts/install.sh`
- Create: `backend/src/ApiDot.Server/Scripts/install.ps1`
- Modify: `backend/src/ApiDot.Server/Program.cs`
- Test: `backend/tests/ApiDot.Server.Tests/Endpoints/InstallScriptEndpointsTests.cs`

**Interfaces:**
- Produces:
  - `GET /install.sh`: shell script dinâmico com URL base injetada
  - `GET /install.ps1`: script PowerShell para Windows
  - `GET /api/agent/download/{os}/{arch}`: 302 Redirect para o asset na GitHub Release pareada com a versão da aplicação

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public async Task Install_Script_Endpoints_Return_Executable_Scripts_And_Valid_Redirect()
{
    // Testa GET /install.sh com content-type text/x-shellscript e presença de uname / chmod +x
    // Testa GET /install.ps1 com content-type text/plain
    // Testa GET /api/agent/download/osx/arm64 retornando 302 Redirect para release do GitHub
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~InstallScriptEndpointsTests`
Expected: FAIL com 404 Not Found.

- [ ] **Step 3: Implement `InstallScriptEndpoints.cs` e templates de script**

Criar scripts enxutos que baixam via `/api/agent/download/{os}/{arch}` para `~/.apidot/bin`, configuram permissões de execução e oferecem instruções de uso.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Server.Tests --filter FullyQualifiedName~InstallScriptEndpointsTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Server/Endpoints/InstallScriptEndpoints.cs \
        backend/src/ApiDot.Server/Scripts/install.sh \
        backend/src/ApiDot.Server/Scripts/install.ps1 \
        backend/src/ApiDot.Server/Program.cs \
        backend/tests/ApiDot.Server.Tests/Endpoints/InstallScriptEndpointsTests.cs
git commit -m "feat(backend): add /install.sh, /install.ps1 and binary download redirect endpoints"
```

---

### Task 6: Agent CLI Configuração e Gerenciamento de Serviços (`ApiDot.Agent`)

**Files:**
- Create: `backend/src/ApiDot.Agent/Configuration/AgentConfigManager.cs`
- Create: `backend/src/ApiDot.Agent/Services/ServiceManager.cs`
- Modify: `backend/src/ApiDot.Agent/Program.cs`
- Test: `backend/tests/ApiDot.Agent.Tests/ServiceManagerTests.cs`

**Interfaces:**
- Produces:
  - `AgentConfigManager`: carrega/grava `~/.apidot/config.json` com permissão restrita
  - `ServiceManager`:
    - macOS: gera e registra `~/Library/LaunchAgents/dev.hmedeiros.apidot-agent.plist`
    - Linux: gera e registra `~/.config/systemd/user/apidot-agent.service`
    - Windows: registra tarefa de logon de usuário via `schtasks`
  - Comandos CLI: `service install`, `service start`, `service stop`, `service status`, `service uninstall`

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public void ServiceManager_Generates_Valid_Launchd_Plist_And_Systemd_Unit()
{
    var config = new AgentConfig("https://apidot.dev", "apidot_dev_token123", "MacBook-Hudson", false);
    var plist = ServiceManager.GenerateLaunchdPlist(config, "/usr/local/bin/apidot-agent");
    plist.Should().Contain("<key>Label</key><string>dev.hmedeiros.apidot-agent</string>");
    plist.Should().Contain("connect");

    var unit = ServiceManager.GenerateSystemdUnit(config, "/usr/local/bin/apidot-agent");
    unit.Should().Contain("[Unit]");
    unit.Should().Contain("ExecStart=");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test backend/tests/ApiDot.Agent.Tests --filter FullyQualifiedName~ServiceManagerTests`
Expected: FAIL com classes não encontradas.

- [ ] **Step 3: Implement `AgentConfigManager`, `ServiceManager` e wiring no `Program.cs`**

Implementar leitura e escrita de `config.json`, geradores de templates de daemon sem root, e subcomandos de controle de serviço chamando `launchctl` / `systemctl --user`.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test backend/tests/ApiDot.Agent.Tests --filter FullyQualifiedName~ServiceManagerTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/ApiDot.Agent/Configuration/AgentConfigManager.cs \
        backend/src/ApiDot.Agent/Services/ServiceManager.cs \
        backend/src/ApiDot.Agent/Program.cs \
        backend/tests/ApiDot.Agent.Tests/ServiceManagerTests.cs
git commit -m "feat(agent): add config persistence and OS background service management"
```

---

### Task 7: Frontend Device State, API Client & LocalStorage Pairing (`frontend`)

**Files:**
- Create: `frontend/src/lib/deviceApi.ts`
- Create: `frontend/src/stores/useDeviceStore.ts`
- Modify: `frontend/src/lib/treeApi.ts`
- Test: `frontend/src/lib/deviceApi.test.ts`
- Test: `frontend/src/stores/useDeviceStore.test.ts`

**Interfaces:**
- Produces:
  - `deviceApi`: `fetchDevices()`, `createDevice(name)`, `revokeDevice(id)`, `regenerateToken(id)`
  - `useDeviceStore`: armazena `activeDeviceId`, lista de dispositivos, polling de status (3s), e sincronização com `localStorage.getItem('apidot_device_id')`
  - Injeção automática de `X-Device-Id: activeDeviceId` nas chamadas de execução HTTP em `treeApi.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test('useDeviceStore initializes activeDeviceId from localStorage and fetches device list', async () => {
  localStorage.setItem('apidot_device_id', 'device-guid-123');
  // Verifica hidratação e chamadas de API
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test src/stores/useDeviceStore.test.ts`
Expected: FAIL com módulo não encontrado.

- [ ] **Step 3: Implement `deviceApi.ts` e `useDeviceStore.ts`**

Implementar store Zustand com suporte a polling ativo/inativo, persistência do `activeDeviceId` e integração de header na execução.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test src/stores/useDeviceStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/deviceApi.ts \
        frontend/src/stores/useDeviceStore.ts \
        frontend/src/lib/treeApi.ts \
        frontend/src/lib/deviceApi.test.ts \
        frontend/src/stores/useDeviceStore.test.ts
git commit -m "feat(frontend): add deviceApi, useDeviceStore and X-Device-Id execution header"
```

---

### Task 8: Frontend AppHeader & Global Settings Modal (`frontend`)

**Files:**
- Modify: `frontend/src/components/layout/AppHeader.tsx`
- Modify: `frontend/src/components/layout/AppHeader.test.tsx`
- Create: `frontend/src/components/settings/GlobalSettingsModal.tsx`
- Create: `frontend/src/components/settings/GlobalSettingsModal.test.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: `useDeviceStore`, `useLayoutStore`
- Produces:
  - `AppHeader`: sem o badge `Agent Online/Offline`, com novo botão `Configurações Globais`
  - `GlobalSettingsModal`: modal com abas laterais ("Local Agents" e "Geral & Interface")
  - Aba Local Agents: status do dispositivo ativo, tabela de dispositivos com prefixos mascarados, modal de cadastro com cópia única de token e script de linha única `curl -fsSL https://.../install.sh | bash`

- [ ] **Step 1: Write the failing test**

```typescript
test('GlobalSettingsModal renders sidebar tabs, lists devices and displays one-time token dialog on create', async () => {
  // Renderiza GlobalSettingsModal
  // Valida abas "Local Agents" e "Geral & Interface"
  // Cadastra novo dispositivo e valida exibição de RawToken e comando curl
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test src/components/settings/GlobalSettingsModal.test.tsx`
Expected: FAIL com componente não encontrado.

- [ ] **Step 3: Implement `GlobalSettingsModal.tsx` e atualizar `AppHeader.tsx` e `page.tsx`**

Construir o modal com design system consistente em Tailwind CSS, acessibilidade de foco e atalho ESC, integrando com `useDeviceStore` e `useLayoutStore`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test src/components/settings/GlobalSettingsModal.test.tsx src/components/layout/AppHeader.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppHeader.tsx \
        frontend/src/components/layout/AppHeader.test.tsx \
        frontend/src/components/settings/GlobalSettingsModal.tsx \
        frontend/src/components/settings/GlobalSettingsModal.test.tsx \
        frontend/src/app/page.tsx
git commit -m "feat(frontend): add GlobalSettingsModal and update AppHeader with settings trigger"
```

---

### Task 9: CI/CD GitHub Actions Workflow para Compilação Native AOT das Releases (`.github/workflows`)

**Files:**
- Create: `.github/workflows/agent-release.yml`

**Interfaces:**
- Produces:
  - Compilação automatizada do `ApiDot.Agent` para `osx-arm64`, `osx-x64`, `linux-x64`, `win-x64`
  - Upload dos binários gerados para a release do GitHub disparada por tag (`v*`)

- [ ] **Step 1: Implement `.github/workflows/agent-release.yml`**

Definir matriz multi-runner (`macos-latest`, `macos-13`, `ubuntu-latest`, `windows-latest`) com comandos `dotnet publish backend/src/ApiDot.Agent/ApiDot.Agent.csproj -c Release -r <RID> -p:PublishAot=true --self-contained -o ./artifacts/<RID>` e ação `softprops/action-gh-release` para publicar os assets.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/agent-release.yml
git commit -m "ci: add GitHub Actions workflow for multi-arch Native AOT Agent releases"
```

---

### Task 10: Validação de Regressão e Suíte Completa de Testes

**Files:**
- None (verificação do projeto todo)

- [ ] **Step 1: Run complete backend test suite**

Run: `dotnet test backend/ApiDot.sln`
Expected: All tests pass.

- [ ] **Step 2: Run complete frontend test suite**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: All tests pass.

- [ ] **Step 3: Run frontend typecheck and build validation**

Run: `cd frontend && npm run build`
Expected: Next.js build succeeds with zero type errors.

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: verify complete test suite and build validation"
```
