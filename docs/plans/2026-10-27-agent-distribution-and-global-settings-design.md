# Design Técnico: Distribuição do Agent via GitHub Releases, Setup via Script e Modal de Configurações Globais

**Data:** 2026-10-27  
**Status:** Em Revisão Técnica (Builder Check)  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Full-Stack (.NET 9 Backend & Native AOT Agent CLI / Next.js 15 Web / GitHub Actions CI/CD)

---

## 1. Intenção e Motivação (The Why)

O **ApiDot** suporta execução híbrida de requisições HTTP: via servidor central ou via **Agent Local** executando na máquina do usuário para acessar redes locais (`localhost`, serviços Docker, VPNs corporativas e IPs privados).

Atualmente:
1. O executável do Agent (`ApiDot.Agent`) existe como projeto de console, mas não possui esteira automatizada de build Native AOT multi-plataforma e distribuição vinculada a releases do repositório.
2. Não existe mecanismo duradouro de registro, autenticação e pareamento seguro entre as máquinas locais dos usuários e o servidor central.
3. O cabeçalho da aplicação web (`AppHeader`) exibe um indicador fixo `Agent Online/Offline` sem contexto de qual dispositivo está conectado e sem permitir a gestão centralizada da conexão.
4. Não há um local unificado no dashboard web para centralizar configurações da aplicação e gerenciar dispositivos autorizados.

Este projeto estabelece:
- Um fluxo de distribuição automatizado do binário Native AOT do Agent anexado a cada GitHub Release.
- Um script enxuto e oficial de instalação e inicialização rápida via terminal (`curl ... | bash` para macOS/Linux e `irm ... | iex` para Windows), servido diretamente pelo backend do ApiDot.
- Um modelo de autenticação baseado em **Dispositivos Nomeados (`AgentDevice`)**, onde o Agent é vinculado exclusivamente ao computador físico/sessão do usuário (e não a um workspace específico).
- Suporte no CLI tanto para execução interativa no terminal quanto para instalação como serviço/daemon persistente em segundo plano no sistema operacional (`launchd` no macOS, `systemd` no Linux e `Windows Service` no Windows).
- Um novo **Modal de Configurações Globais** com barra lateral de navegação (estilo IDE), removendo o indicador do `AppHeader` e centralizando o setup de dispositivos e preferências da aplicação.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Vinculação Exclusiva por Dispositivo Físico:**
  - O Agent é associado ao computador do usuário. Uma aba do ApiDot aberta no MacBook fala unicamente com o Agent local daquele MacBook; aberta no Windows, procurará o Agent daquele Windows (permanecendo Offline até ser iniciado lá).
  - O navegador identifica o dispositivo ativo através de um identificador salvo no `localStorage` (`apidot_device_id`).
- **Gerenciamento e Cadastro Explícito de Dispositivos:**
  - O usuário cadastra e nomeia explicitamente suas máquinas (ex: "MacBook Pro Hudson", "PC Windows Escritório").
  - Cada dispositivo possui seu próprio token de autenticação duradouro com controle total de revogação e regeneração.
  - A revogação de um dispositivo desconecta imediatamente qualquer sessão WebSocket ativa associada no servidor.
- **Distribuição e Instalação Padronizada Exclusivamente via Script:**
  - Endpoint `/install.sh` e `/install.ps1` servidos pelo backend do ApiDot.
  - O script detecta a plataforma (`uname -s` / `$env:OS`) e a arquitetura (`arm64`, `x64`), baixa a versão correspondente da Release do GitHub pareada com a versão do servidor, instala em `~/.apidot/bin` e concede permissões de execução.
- **Modos de Execução do Agent CLI:**
  - `apidot-agent connect --server <url> --token <token>`: execução em primeiro plano no terminal com logs formatados.
  - `apidot-agent service install --server <url> --token <token>`: instalação como daemon em segundo plano (`launchd` no macOS, `systemd` no Linux, `Windows Service` no Windows).
  - `apidot-agent service start | stop | status | uninstall`: comandos operacionais do daemon.
- **Modal de Configurações Globais:**
  - Modal com barra lateral esquerda ("Local Agents", "Geral & Interface").
  - No `AppHeader`, substituição do badge de status do Agent por um botão de engrenagem para abrir as Configurações Globais.
  - Status em tempo real do dispositivo selecionado com indicação visual de conexão, hostname, latência e versão pareada.
- **CI/CD e Releases no GitHub:**
  - Workflow do GitHub Actions compilando o `ApiDot.Agent` em Native AOT para 4 alvos: `osx-arm64`, `osx-x64`, `linux-x64` e `win-x64`.
  - Publicação dos binários comprimidos/renomeados diretamente como assets da tag de Release.

### 2.2. Não-Metas (Non-Goals)
- Não oferecer botão de download manual de arquivos avulsos no dashboard (a instalação é padronizada exclusivamente pelo script de terminal).
- Não vincular agents a coleções ou workspaces específicos (o vínculo é estritamente Dispositivo x Aplicação).
- Não permitir que múltiplos agents concorrentes usem o mesmo token de dispositivo simultaneamente (uma nova conexão sobrepõe a conexão anterior do mesmo dispositivo).
- Não expor servidores HTTP de loopback no Agent local (toda comunicação é via WebSocket reverso para o Hub).

### 2.3. Anti-Metas (Anti-Goals)
- **Não depender do .NET Runtime na máquina cliente:** O Agent deve ser estritamente compilado com Native AOT em binário único executável autônomo.
- **Não armazenar tokens em texto puro no banco de dados:** Armazenar exclusivamente o hash seguro dos tokens (`TokenHash` via SHA-256), exibindo o token em texto puro apenas no momento do cadastro/regeneração.
- **Não tolerar falhas de Mixed Content ou PNA:** Zero dependência de requisições do navegador para `localhost`.
- **Não sobrecarregar o AppHeader:** O cabeçalho deve permanecer limpo, sem badges ou seletores poluídos de status do agent.

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Hub WebSocket Reverso com Dispositivos Nomeados e Script Auto-Install (Escolhida)
- O backend atua como broker WebSocket (`/ws/agent`). O Agent conecta de dentro para fora (`outbound`) com seu token de dispositivo.
- O navegador web se comunica apenas com o backend via HTTPS/REST. Ao executar com `target: Agent`, o backend roteia a carga para o WebSocket do dispositivo cadastrado para aquela sessão do navegador.
- Instalação automatizada via script executável de linha única.
- **Motivo da Escolha:** Imunidade a políticas de segurança de navegadores (Mixed Content / PNA), segurança robusta, auditoria limpa e suporte a conexões locais mesmo com a aplicação rodando em VPS/Cloud.

### Abordagem 2: Servidor HTTP Local no Agent (Loopback Direto) (Descartada)
- O Agent abriria uma porta HTTP local (ex: `127.0.0.1:4050`) e a página web faria `fetch` diretamente para ela.
- **Motivo do Descarte:** Bloqueios severos de navegadores modernos contra sites HTTPS acessando recursos de rede privada/localhost sem certificados SSL válidos, além de inviabilizar o uso do dashboard em celulares e tablets.

---

## 4. Arquitetura Detalhada por Componente

### 4.1. Backend (.NET 9 - `ApiDot.Server` & `ApiDot.Core`)

#### 4.1.1. Modelo de Dados EF Core (`AgentDevice`)
```csharp
namespace ApiDot.Server.Data.Entities;

public class AgentDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty; // Ex: "MacBook Pro Hudson"
    public string TokenHash { get; set; } = string.Empty; // SHA-256 do token gerado
    public string? TokenPrefix { get; set; } // Primeiros 8 caracteres para identificação visual (ex: "apidot_agt_7f8a...")
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastConnectedAtUtc { get; set; }
    public string? LastConnectedIp { get; set; }
    public string? LastConnectedHostname { get; set; }
    public string? LastConnectedOs { get; set; }
    public string? AgentVersion { get; set; }
    public bool IsRevoked { get; set; } = false;
}
```

#### 4.1.2. Mapeamento WebSocket e Hub (`/ws/agent`)
- Endpoint WebSocket exposto em `/ws/agent?token=<raw_token>&name=<hostname>&os=<os>&version=<version>`.
- O servidor calcula o hash SHA-256 do token recebido e busca o `AgentDevice` ativo correspondente (`!IsRevoked`).
- Se válido:
  - Registra a conexão no `IAgentHub` indexando por `Guid deviceId`.
  - Atualiza `LastConnectedAtUtc`, `LastConnectedHostname`, `LastConnectedOs` e `AgentVersion`.
  - Mantém heartbeat leve (ping/pong a cada 15s) atualizando latência média e `LastSeenUtc`.
- Se inválido ou revogado: encerra a conexão com status `WebSocketCloseStatus.PolicyViolation` (4401).

#### 4.1.3. Endpoints REST da API
- `GET /api/agent/devices`: lista todos os dispositivos cadastrados com seus status em tempo real (obtidos consultando o `IAgentHub.IsAgentOnline(device.Id)` e métricas de heartbeat).
- `POST /api/agent/devices`: cadastra um novo dispositivo nomeado, gera um token seguro (`apidot_dev_<32_random_hex>`), armazena o hash SHA-256 e retorna o DTO com o token em texto puro (modelo PAT: exibido estritamente uma única vez na criação).
- `POST /api/agent/devices/{id:guid}/revoke`: revoga o dispositivo, marca `IsRevoked = true` e, caso haja socket ativo no `AgentHub`, desconecta imediatamente.
- `POST /api/agent/devices/{id:guid}/regenerate-token`: revoga o token anterior, gera um novo token para o mesmo dispositivo, desconecta qualquer socket ativo e retorna o novo token em texto puro para visualização única.
- `GET /install.sh`: serve o shell script para Unix (macOS e Linux) com detecção de plataforma e download via `/api/agent/download/{os}/{arch}`.
- `GET /install.ps1`: serve o PowerShell script para Windows.
- `GET /api/agent/download/{os}/{arch}`: endpoint do servidor que redireciona (302) ou faz proxy do binário compilado na GitHub Release correspondente, contornando limitações de rate limit anônimo da API do GitHub.

#### 4.1.4. Roteamento de Execução em `/api/requests/execute`
- A requisição do frontend inclui o cabeçalho opcional `X-Device-Id: <guid>`.
- Quando `ExecutionTarget == ExecutionTarget.Agent`:
  - Se `X-Device-Id` não for fornecido ou o dispositivo estiver offline no `AgentHub`, retorna erro `409 Conflict` informando que o Agent deste dispositivo não está conectado.
  - Caso online, despacha o payload `HttpRequestDispatch` exclusivamente para o socket daquele `deviceId`.

---

### 4.2. Agent CLI (.NET 9 Native AOT - `ApiDot.Agent`)

#### 4.2.1. Comandos do CLI e Gerenciamento de Configuração
- **Arquivo de Configuração do Usuário:** Parâmetros de execução são persistidos em `~/.apidot/config.json` (com permissões restritas `chmod 600`), evitando expor segredos em arquivos de serviço do sistema operacional.
- **Comandos:**
  1. `apidot-agent connect [--server <url>] [--token <token>] [--name <name>] [--ignore-ssl]`:
     - Conexão interativa em primeiro plano com tratamento de reconexão exponencial (backoff) e escuta de heartbeat.
     - Lê de `config.json` se os parâmetros não forem passados na CLI.
  2. `apidot-agent service install --server <url> --token <token> [--name <name>] [--ignore-ssl]`:
     - Grava as credenciais em `~/.apidot/config.json`.
     - Registra o executável como daemon a nível de usuário (sem exigir privilégios de root/administrador):
       - **macOS:** Cria plist de usuário em `~/Library/LaunchAgents/dev.hmedeiros.apidot-agent.plist` e carrega via `launchctl bootstrap`.
       - **Linux:** Cria unit file de usuário em `~/.config/systemd/user/apidot-agent.service` e habilita via `systemctl --user enable --now`.
       - **Windows:** Cria tarefa agendada de logon de usuário via `schtasks /create` apontando para o binário em `%USERPROFILE%\.apidot\bin\apidot-agent.exe`.
  3. `apidot-agent service start | stop | restart | status | uninstall`:
     - Controle operacional do daemon sem necessidade de editar arquivos de configuração manualmente.

#### 4.2.2. Script de Instalação (`install.sh` / `install.ps1`)
- O script `install.sh`:
  1. Detecta o SO (`Darwin` -> macOS, `Linux` -> Linux) e a arquitetura (`arm64`/`aarch64` vs `x86_64`).
  2. Determina o nome do asset na Release do GitHub (ex: `apidot-agent-osx-arm64`).
  3. Baixa o binário diretamente da release oficial pareada com a versão do servidor para `~/.apidot/bin/apidot-agent`.
  4. Aplica `chmod +x` e instrui o usuário ou atualiza temporariamente o PATH para execução imediata.

---

### 4.3. Frontend (Next.js 15 - `frontend/src/`)

#### 4.3.1. `AppHeader`
- Remoção do badge `Agent Online/Offline` da barra principal.
- Inclusão do botão de Configurações Globais (ícone `Settings` ou `Sliders`) no canto direito superior.

#### 4.3.2. `GlobalSettingsModal`
- Layout modal com abas verticais à esquerda:
  - **Local Agents:**
    - Seletor/aviso do dispositivo ativo para o navegador atual (`localStorage.getItem('apidot_device_id')`).
    - Lista de dispositivos cadastrados com indicador de status em tempo real (polling leve de 3s exclusivamente enquanto o modal estiver aberto, consultando `GET /api/agent/devices`).
    - Botão `+ Cadastrar Dispositivo`: abre diálogo solicitando nome (ex: "MacBook Pro Hudson"). Ao criar, exibe diálogo modal de segredo único com o comando de instalação pronto e botão de cópia única (modelo PAT).
    - Dispositivos existentes na tabela exibem o prefixo mascarado (`apidot_agt_7f8a...`), status online/offline, botão `Regenerar Token`, `Revogar` e `Vincular a este Navegador`.
    - Comando de instalação gerado:
      ```bash
      curl -fsSL https://apidot.hmedeiros.dev/install.sh | bash
      apidot-agent service install --server https://apidot.hmedeiros.dev --token <token>
      ```
  - **Geral & Interface:**
    - Versão do servidor, preferências de tema e configurações gerais de timeout.

#### 4.3.3. Integração com a Execução de Requisições
- O `useRequestStore` e o interceptor de requisições de execução injetam automaticamente o `deviceId` ativo no header `X-Device-Id`.
- Caso a execução falhe por Agent offline, a interface exibe toast informativo com atalho direto: *"O Agent para este dispositivo está offline. Clique para abrir as Configurações."*

---

### 4.4. CI/CD (GitHub Actions - `.github/workflows/agent-release.yml`)

- Gatilho: criação de tags de release (ex: `v*`) ou manual via `workflow_dispatch`.
- Matrix de compilação Native AOT:
  - `macos-latest` -> `osx-arm64`
  - `macos-13` -> `osx-x64`
  - `ubuntu-latest` -> `linux-x64`
  - `windows-latest` -> `win-x64`
- Flags de compilação: `dotnet publish -c Release -r <RID> --self-contained -p:PublishAot=true -p:InvariantGlobalization=true`.
- Upload automático dos binários gerados para a GitHub Release correspondente.

---

## 5. O que Fica a Cargo do Implementador (Left to the Builder)
- Implementação detalhada dos templates de plist (`launchd`) e service file (`systemd`).
- Política de reconexão exponencial com jitter no `AgentClient`.
- Animações e micro-interações do modal no design system existente (Tailwind CSS e Lucide Icons).
- Tratamento de mensagens amigáveis caso o PowerShell no Windows execute sem privilégios de execução de scripts (`Set-ExecutionPolicy`).

---

## 6. Riscos, Modos de Falha e Estratégia de Mitigação
1. **Risco:** O usuário roda a aplicação em uma máquina sem ter cadastrado um dispositivo previamente.
   - *Mitigação:* Se nenhum dispositivo estiver cadastrado no navegador, o modal sugere o cadastro automático nomeando o dispositivo com base no navegador/SO detectado (`navigator.userAgent`).
2. **Risco:** O token é revogado enquanto o agent está em execução.
   - *Mitigação:* O `AgentHub` recebe a notificação de revogação e executa `socket.CloseAsync(PolicyViolation)` imediatamente, cancelando qualquer dispatch em voo.
3. **Risco:** A release do GitHub é privada e o script `install.sh` não consegue baixar o asset anonimamente.
   - *Mitigação:* O backend do ApiDot possui o endpoint proxy/redirect `/api/agent/download/{os}/{arch}` ou suporta token de download embutido quando o repositório for privado.
