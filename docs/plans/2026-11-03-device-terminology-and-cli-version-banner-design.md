# Device Terminology & CLI Version Banner Design

**Author:** Orchestrator & Hudson Medeiros  
**Date:** 2026-11-03  
**Status:** Approved  
**Related Issue/Task:** Refactor "Local Agents" terminology to human-centric "Devices" in frontend and resolve dynamic version banner in CLI.

---

## 1. Context & Motivation

In ApiDot, the execution agent is a zero-dependency Native AOT daemon (`backend/src/ApiDot.Agent`) that registers against `ApiDot.Server` via WebSocket (`/ws/agent`) and executes HTTP dispatches within its network boundary.

Historically, the frontend UI used mixed, ambiguous labels:
- *"Local Agents"*, *"Dispositivos & Local Agents"* in settings tabs and headers.
- *"Agente Local"* / *"Local Agent"* in request dispatch selectors.
- *"Send via Local Agent"* on send buttons.

### Modos de Falha Identificados:
1. **O paradoxo do "Local":** O daemon frequentemente roda em containers Docker (`docker-compose.yml`), VMs de homologação ou clusters Kubernetes privados. Chamar de *"Local"* em redes corporativas/VPCs é conceitualmente falso.
2. **Saturação do termo "Agent":** No cenário atual (2026), "Agent" isolado induz confusão com agentes autônomos de Inteligência Artificial / LLMs.
3. **Banner estático e versão ausente:** No CLI, `Console.WriteLine("ApiDot Local Agent v1.0")` continha versão hardcoded, sem refletir a tag de release (`v0.1.0`, `dev`, etc.) nem repassar a versão durante o handshake do WebSocket para registro em `AgentDevice.AgentVersion`.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals:
- **Frontend Human-Centric:** Unificar 100% da interface e i18n (`pt-BR`, `en-US`) em torno do conceito **"Dispositivos" / "Devices"** (sem redundâncias ou termos híbridos).
- **Alinhamento com Domínio:** O backend continua modelando `AgentDevice` e o projeto CLI `ApiDot.Agent`, estabelecendo a relação natural: *Dispositivo é a máquina/host; Agent é o daemon em segundo plano*.
- **Banner Dinâmico no CLI:** Extrair a versão semântica normalizada (`vX.Y.Z` ou `dev`) com resolução idêntica à API (`InstallScriptEndpoints`), exibindo `ApiDot Agent <version>` na inicialização.
- **Transmissão de Versão no WebSocket:** `AgentClient` deve enviar `&version=<version>` na query string do WebSocket para preencher `AgentVersion` na tabela SQLite `AgentDevices`.

### Non-Goals:
- Não renomear tabelas de banco de dados (`AgentDevices`), schemas do SQLite ou rotas `/ws/agent`.
- Não alterar enums internos como `ExecutionTarget.Agent` ou contratos serializados de dispatch.
- Não introduzir fallbacks de compatibilidade transitórios que gerem acoplamento ou poluição de código.

### Anti-Goals:
- Não utilizar termos compostos/ambíguos como *"Runners & Dispositivos"* ou *"Dispositivos & Local Agents"*.
- Não quebrar nenhum dos 1.625 testes existentes da solução.

---

## 3. Decisões Arquiteturais e Mapeamento

### A. Superfície de UI e Internacionalização (pt-BR / en-US)
| Chave i18n | Antes (pt-BR / en-US) | Depois (pt-BR / en-US) |
| :--- | :--- | :--- |
| `request.targetAgent` | `'Agente Local'` / `'Local Agent'` | `'Dispositivo'` / `'Device'` |
| `request.sendViaAgent` | `'Enviar via Agent Local'` / `'Send via Local Agent'` | `'Enviar via Dispositivo'` / `'Send via Device'` |
| `request.executeOnAgent` | `'Executar no Agent Local'` / `'Execute on Local Agent'` | `'Executar no Dispositivo'` / `'Execute on Device'` |
| `request.executeOnAgentDescOnline` | `'Disparo em rede local / localhost'` / `'Dispatch on local network / localhost'` | `'Disparo via dispositivo conectado'` / `'Dispatch via connected device'` |
| `request.executeOnAgentDescOffline` | `'Agent offline'` / `'Agent offline'` | `'Dispositivo offline'` / `'Device offline'` |
| `request.agentConnected` | `'Agent Conectado'` / `'Agent Connected'` | `'Dispositivo Conectado'` / `'Device Connected'` |
| `request.agentDisconnected` | `'Agent Desconectado'` / `'Agent Disconnected'` | `'Dispositivo Desconectado'` / `'Device Disconnected'` |
| `request.agentOfflineTooltip` | `'Agente local desconectado...'` / `'Local agent is offline...'` | `'Dispositivo desconectado...'` / `'Device is offline...'` |
| `settings.agentsTab` | `'Local Agents'` / `'Local Agents'` | `'Dispositivos'` / `'Devices'` |
| `settings.devicesAndAgents` | `'Dispositivos & Local Agents'` / `'Devices & Local Agents'` | `'Dispositivos'` / `'Devices'` |
| `settings.devicesSubtitle` | `'Dispositivos autorizados para execução local...'` / `'...for local execution...'` | `'Dispositivos autorizados para execução de chamadas HTTP'` / `'Authorized devices for execution of HTTP requests'` |
| `settings.noAgents` | `'Nenhum agente local cadastrado'` / `'No local agents registered'` | `'Nenhum dispositivo cadastrado'` / `'No devices registered'` |
| `settings.agentsOnlineCount` | `'{count} agente(s) online'` / `'{count} agent(s) online'` | `'{count} dispositivo(s) online'` / `'{count} device(s) online'` |
| `settings.subtitle` | `'Gerencie os agentes de execução local...'` / `'Manage local execution agents...'` | `'Gerencie dispositivos, preferências de interface e ambiente'` / `'Manage devices, interface preferences and environment'` |
| `collectionSettings.defaultTargetDesc`| `'...na nuvem ou no seu Agent local'` / `'...on Cloud Server or on your local Agent'` | `'...no Servidor ou em um Dispositivo'` / `'...on Cloud Server or on a Device'` |

### B. Resolução de Versão do Agent (`AgentVersion.cs`)
Prioridade de resolução:
1. Variável de ambiente `APIDOT_VERSION` (normalizada com prefixo `v`, ex: `0.1.0` -> `v0.1.0`, preservando `dev`).
2. Atributo `AssemblyInformationalVersionAttribute` (extraído e desprovido de sufixos de hash git).
3. `Assembly.GetName().Version` (se diferente de 0.0.0).
4. Fallback padrão: `"dev"`.

O banner do CLI passa a emitir: `ApiDot Agent <version>` (ex: `ApiDot Agent v0.1.0` ou `ApiDot Agent dev`).

### C. Handshake WebSocket
Em `AgentClient.BuildWebSocketUri()`:
A query string adiciona `&version={Uri.EscapeDataString(AgentVersion.GetNormalizedVersion())}`.
No servidor, `AgentWebSocketHandler.cs` já recebe e persiste este valor em `device.AgentVersion`.
