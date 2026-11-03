# Design Técnico: Empacotamento Desktop com Tauri, Sidecar Native AOT e Operação Offline

**Data:** 2026-11-02  
**Status:** Em Revisão Técnica (Builder Check)  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Desktop (Tauri v2) / Native AOT Agent (.NET 9) / Frontend (Next.js 16) / Sincronização e Reconciliação Offline

---

## 1. Intenção e Motivação (The Why)

O **ApiDot** hoje opera primariamente como uma aplicação Web combinada a um **Agent Local CLI** compilado via .NET Native AOT. Para testar requisições contra APIs locais (`localhost`, redes privadas, containers Docker e VPNs corporativas), o usuário da versão Web precisa instalar e gerenciar o Agent separadamente via terminal ou serviço de background (`launchd`/`systemd`).

Uma abordagem puramente client-side no navegador (via `fetch`) é inviabilizada pelas proteções da plataforma Web:
1. **CORS e Private Network Access (PNA):** Bloqueio estrito de leitura de status, cabeçalhos e corpos para APIs em `localhost`/LAN que não emitam cabeçalhos de preflight permissivos.
2. **Forbidden Headers:** Impossibilidade de controlar cabeçalhos como `Host`, `Origin`, `User-Agent` e `Cookie`.
3. **Mixed Content:** Bloqueio de tráfego HTTP inseguro quando a UI é servida sob HTTPS (`https://apidot.hmedeiros.dev`).

Para eliminar qualquer fricção de instalação de terminal e oferecer uma experiência desktop nativa de primeira classe no estilo Postman/Insomnia/Bruno, este projeto introduz o **ApiDot Desktop** empacotado via **Tauri v2**, embutindo o binário do `ApiDot.Agent` como um **Sidecar gerenciado de forma transparente**.

Além disso, o aplicativo desktop deve ser capaz de operar **100% offline**, persistindo coleções e workspaces em disco em formato JSON sob `~/.apidot/` e reconciliando os dados com a nuvem central (`https://apidot.hmedeiros.dev`) ao restabelecer conexão.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Empacotamento Desktop com Tauri v2:**
  - Gerar instaladores e binários nativos para macOS (.dmg / .app universal ou arm64/x64), Windows (.msi / .exe) e Linux (.deb / AppImage).
  - Integrar o frontend Next.js 16 existente em modo compatível com o WebView nativo do Tauri.
- **Sidecar Nativo Transparente (.NET Native AOT):**
  - O executável do `ApiDot.Agent` é incluído dentro do bundle do instalador Tauri.
  - Ao iniciar o aplicativo desktop, o processo Rust do Tauri sobe o Sidecar automaticamente em segundo plano.
  - Ao fechar a janela ou encerrar o aplicativo, o Tauri envia sinal de encerramento (`SIGTERM`/cancelamento) para encerrar o Sidecar sem deixar processos órfãos.
- **Comunicação Híbrida do Sidecar (Loopback HTTP + WebSocket):**
  - O Sidecar expõe um listener HTTP mínimo em loopback local (`127.0.0.1:<porta-efêmera>`), alocando porta dinâmica para evitar colisões.
  - Quando online, o Sidecar simultaneamente registra/conecta o WebSocket com o hub central do `ApiDot.Server` (`https://apidot.hmedeiros.dev`), mantendo paridade com o modelo de execução em nuvem.
  - Quando offline, requisições de teste disparadas na UI desktop são enviadas diretamente para o endpoint de loopback local do Sidecar, mantendo suporte total a `localhost` e bypass de CORS.
- **Autenticação no Primeiro Acesso e Hidratação de Cache:**
  - O primeiro acesso ao aplicativo desktop exige conexão à internet para autenticação obrigatória do usuário e download/hidratação inicial de seus workspaces e coleções remotos a partir do `ApiDot.Server`.
  - A sessão autenticada e as credenciais necessárias são armazenadas localmente de forma segura.
- **Configuração Centralizada em `~/.apidot/config.json`:**
  - O app desktop reutiliza e respeita o mesmo arquivo de configuração `~/.apidot/config.json` já utilizado pelo Agent CLI (servidor padrão: `https://apidot.hmedeiros.dev`).
- **Seletor Granular de Alvo de Execução (Global e por Coleção):**
  - **Configurações Globais:** Seletor de alvo de execução padrão global permitindo escolher entre Servidor/Nuvem (`Server`), o Agent do dispositivo ativo local (`ActiveDevice` - padrão) ou um Agent/dispositivo específico cadastrado (`Agent: <deviceId>`).
  - **Configurações da Coleção:** Seletor com herança (`Inherit`), Nuvem (`Server`), Agent local ativo (`ActiveDevice`) ou Agent específico cadastrado (`Agent: <deviceId>`).
  - **Prioridade e Resolução em Cascata:** Request -> Folder -> Collection -> Configurações Globais -> Fallback (Agent do dispositivo ativo se online, senão Server).
- **Operação Offline Subsequente (Local-First):**
  - Após o primeiro login com sucesso, o usuário pode abrir e utilizar o app desktop 100% offline.
  - Armazenar workspaces, coleções e requisições em arquivos JSON locais dentro de `~/.apidot/storage/workspaces/<workspaceId>/...`.
  - Permitir criar, editar, organizar e disparar requisições offline contra serviços locais.
- **Reconciliação e Sincronização ao Reconectar:**
  - Detectar status de conectividade (online/offline).
  - Sincronizar alterações pendentes com o PostgreSQL da nuvem via estratégia baseada em timestamps (`updated_at`), resolvendo conflitos por *last-write-wins* com registro auditável.

### 2.2. Não-Metas (Non-Goals)
- Não reescrever o motor de requisições HTTP em Rust: o motor de execução permanece sendo o `SocketsHttpHandler` em C# com Native AOT já testado e validado.
- Não descontinuar o Agent CLI avulso: desenvolvedores que utilizam servidores remotos headless ou preferem rodar o Agent via terminal continuam com suporte integral ao `apidot-agent connect` e `service install`.
- Não embutir o banco de dados PostgreSQL nem a API completa do `ApiDot.Server` dentro do desktop: a versão offline persiste dados estruturados diretamente em arquivos JSON no disco.

### 2.3. Anti-Metas (Anti-Goals)
- **Zero processos órfãos:** Sob nenhuma circunstância o processo do `ApiDot.Agent` deve continuar rodando em background após o usuário fechar a aplicação desktop.
- **Zero conflitos de porta:** O listener local não deve usar portas fixas (como 5000 ou 8080) que possam colidir com serviços do próprio desenvolvedor. A porta deve ser vinculada à porta efêmera `0` e informada ao processo pai.
- **Zero quebra da aplicação Web:** A base de código do frontend Next.js deve permanecer compartilhada entre a Web e o Desktop, utilizando abstrações limpas que detectam o runtime Tauri em tempo de execução.

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Tauri v2 + Sidecar .NET AOT com Loopback HTTP Dinâmico e WebSocket Reverso (Escolhida)
- **Descrição:** O Tauri empacota a interface e gerencia o `ApiDot.Agent` como sidecar. O Agent sobe um servidor HTTP ultraleve em loopback (`127.0.0.1:0`) via Minimal API Native AOT e reporta a porta atribuída na inicialização para o Tauri. Se houver conexão de rede, o Agent conecta também ao hub WebSocket central em `apidot.hmedeiros.dev`.
- **Offline:** Disparos vão diretamente ao loopback local; leitura e escrita de dados utilizam arquivos JSON em `~/.apidot/`.
- **Trade-offs:** 
  - *Prós:* Reaproveita 100% dos DTOs (`HttpRequestDispatch`, `HttpResponsePayload`), do contexto de serialização Native AOT (`AgentJsonContext`) e dos testes existentes; desacoplamento limpo.
  - *Contras:* Exige passar a porta dinâmica do processo filho para o frontend Tauri.

### Abordagem 2: Tauri v2 + Sidecar via Stdio IPC (Pipes de Processo)
- **Descrição:** O Tauri e o Agent conversam exclusivamente através de streams `stdin`/`stdout`.
- **Trade-offs:**
  - *Prós:* Não aloca nenhuma porta TCP de loopback na máquina.
  - *Contras:* Exige construir um protocolo manual de framing e buffers de mensagens em C# e Rust, aumentando a complexidade de serialização de payloads binários ou multipart.

### Abordagem 3: Tauri sem Sidecar (Reimplementação do Executor em Rust via `reqwest`)
- **Descrição:** O próprio processo Rust do Tauri executa as requisições HTTP nativas.
- **Trade-offs:**
  - *Prós:* Binário ligeiramente menor sem necessidade de processo filho.
  - *Contras:* Duplicação completa da lógica de resolução de variáveis, métricas detalhadas de DNS/TCP/TLS, histórico de respostas e desvio de comportamento em relação ao backend e Agent .NET.

---

## 4. Arquitetura e Fluxo de Execução

### 4.1. Estrutura do Repositório
```text
ApiDot/
├── backend/
│   ├── src/ApiDot.Agent/      # CLI existente + novo modo 'sidecar'
│   └── src/ApiDot.Server/     # Backend ASP.NET Core existente
├── frontend/                  # Next.js 16 compartilhado
│   └── src/
│       ├── lib/desktop/       # Abstração de detecção de runtime (Web vs Tauri)
│       └── lib/sync/          # Gerenciador de sincronização offline <-> nuvem
├── desktop/                   # Projeto Tauri v2
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   ├── src/
│   │   │   ├── main.rs        # Inicialização, IPC, ciclo de vida do Sidecar
│   │   │   └── sidecar.rs     # Spawn, heartbeat, graceful shutdown do Agent
│   │   └── binaries/          # Executáveis Native AOT com sufixo de target
```

### 4.2. Ciclo de Vida do Sidecar e Inicialização
1. Ao iniciar, o `desktop/src-tauri/src/sidecar.rs` gera um segredo efêmero aleatório em memória e invoca o binário `apidot-agent` com o comando:
   ```bash
   apidot-agent sidecar --config ~/.apidot/config.json --port 0 --secret <secret-token>
   ```
2. O Agent cria um servidor Web Kestrel enxuto (`WebApplication.CreateSlimBuilder`) escutando em `127.0.0.1:0`.
3. Ao bindar na porta efêmera do SO (ex.: `54321`), o Agent imprime na saída padrão:
   ```text
   [APIDOT_SIDECAR_READY:54321]
   ```
4. O Tauri captura essa linha via stream stdout, armazena a porta no estado Rust e a disponibiliza para a WebView via comando IPC `get_sidecar_endpoint`.
5. **Segurança de Loopback:** Todas as chamadas para o loopback local do Sidecar exigem o cabeçalho `X-ApiDot-Sidecar-Secret: <secret-token>`, protegendo o endpoint contra ataques de DNS rebinding a partir de navegadores de terceiros.
6. **Contrato do Endpoint Local:** A rota `POST /execute` do Sidecar recebe diretamente o DTO canônico `HttpRequestDispatch` e retorna `HttpResponsePayload`, aproveitando o contexto de serialização Native AOT `AgentJsonContext` existente.
7. **Detecção de Serviço Existente e Unificação de Conexão:**
   - Antes de iniciar a conexão WebSocket com o Hub do servidor, o Agent verifica se já existe um serviço em background (`dev.hmedeiros.apidot-agent`) ativo no sistema operacional (`launchd`/`systemd`/`schtasks`) utilizando o mesmo `config.json`.
   - **Se o serviço já estiver rodando:** o Sidecar opera exclusivamente como listener HTTP de loopback local (`127.0.0.1:<porta>`), abstendo-se de abrir uma segunda conexão WebSocket que derrubaria a sessão do serviço no servidor. O servidor e a interface enxergam um único dispositivo unificado.
   - **Se o serviço NÃO estiver rodando:** o Sidecar assume a responsabilidade da conexão WebSocket de background com o servidor durante a vida útil da janela do app.

### 4.3. Fluxo de Disparo de Requisição (Request Execution)
- **No Navegador Web:**
  - Mantém o fluxo atual: `POST /api/requests/execute` no servidor.
- **No App Desktop (Online):**
  - Se o target for `Server`: despacha para o servidor central.
  - Se o target for `Agent` ou requisição local: despacha diretamente para `http://127.0.0.1:<porta>/execute` do Sidecar, com latência zero e sem trânsito desnecessário pelo servidor remoto.
- **No App Desktop (Offline):**
  - Despacha automaticamente para o loopback local do Sidecar. O Sidecar executa localmente via `SocketsHttpHandler` e devolve o payload completo com status, headers, body e métricas de timing.

### 4.4. Armazenamento Offline, Primeiro Login e Reconciliação
O diretório `~/.apidot` é estruturado da seguinte forma:
```text
~/.apidot/
├── config.json              # Configurações de conexão (servidor, token, deviceId)
├── session.json             # Sessão autenticada do usuário (token JWT/refresh)
├── storage/
│   ├── workspaces/
│   │   └── <workspaceId>.json
│   ├── collections/
│   │   └── <collectionId>.json
│   └── queue/
│       └── pending_mutations.json  # Fila de mutações offline para reconciliação
```

- **Primeiro Acesso (Obrigatoriamente Online):**
  1. O usuário abre o aplicativo desktop com conexão ativa e realiza login (`POST /api/auth/login` ou fluxo OIDC).
  2. Após o login, o app salva a sessão em `session.json` e realiza o download de hidratação dos metadados de workspaces, coleções e requisições (`GET /api/workspaces`, `GET /api/tree`), gravando o estado inicial em `~/.apidot/storage/`.
  3. O sidecar `ApiDot.Agent` é inicializado e registra a conexão WebSocket com o Hub do servidor.
- **Acessos Subsequentes e Operação Offline (Local-First com Cache):**
  - Caso o app seja aberto sem conexão, a sessão persistida em `session.json` e o estado salvo em `~/.apidot/storage/` são carregados imediatamente, permitindo que o usuário trabalhe normalmente.
  - Criações e edições de requisições são salvas nos arquivos JSON em disco e enfileiradas em `pending_mutations.json`.
  - Disparos de requisições são direcionados ao loopback local do Sidecar, mantendo suporte total a serviços em `localhost` e redes privadas.
- **Reconciliação ao Reconectar:**
  1. O app detecta reconexão (evento `window.addEventListener('online')` + ping de health no backend).
  2. Dispara a fila de mutações pendentes para o servidor (`POST /api/sync/batch` no `ApiDot.Server`).
  3. Se houver divergência entre o estado da nuvem e o local:
     - Regra base: *Last-Write-Wins* avaliado pelo campo `UpdatedAt` (UTC).
     - Em caso de conflito estrito (ambos modificados offline), preserva a versão local como uma nova cópia de rascunho com sufixo `(Local Backup)` para evitar qualquer perda de dados do desenvolvedor.

### 4.5. Seletor de Alvo Granular (Configurações Globais e Coleção)
Para dar controle total sobre o roteamento das requisições tanto no Desktop quanto na Web:

1. **Configurações Globais (`GlobalSettingsModal.tsx`):**
   - Na aba "Geral & Interface" ou aba dedicada, é adicionado o campo **Alvo de Execução Padrão Global**:
     - `Dispositivo Local Ativo (Padrão)`: utiliza o `deviceId` da máquina em uso (seja o Sidecar desktop ou o Agent CLI pareado).
     - `Nuvem / Servidor`: direciona requisições não roteadas para o `ApiDot.Server`.
     - `Dispositivo Específico (Agent A, Agent B, ...)`: lista os dispositivos cadastrados no workspace para fixar a execução em uma máquina remota específica (ex: servidor de staging ou máquina interna com VPN).
2. **Configurações de Coleção (`CollectionSettingsModal.tsx`):**
   - O campo `DefaultTarget` da coleção é aprimorado:
     - `Herdar das Configurações Globais (Inherit)` (Padrão).
     - `Nuvem / Servidor (Server)`.
     - `Dispositivo Local Ativo`.
     - `Dispositivo Específico (Agent A, Agent B, ...)`.
   - Adiciona-se na entidade `Collection` e DTOs o campo opcional `TargetDeviceId` (Guid?) para persistir a amarração com um dispositivo específico quando selecionado.
3. **Resolução de Roteamento em Cascata:**
   - A hierarquia de resolução do alvo avalia:
     ```text
     RequestItem.Target
       └── Folder.DefaultTarget
            └── Collection.DefaultTarget
                 └── GlobalSettings.DefaultTarget
                      └── Fallback: Dispositivo Ativo (se online) -> Nuvem (Server)
     ```
   - O cabeçalho `X-Device-Id` é injetado automaticamente apontando para o dispositivo resolvido na cadeia.

---

## 5. Plano de Entrega e Fases

1. **Fase 1: Modo Sidecar no `ApiDot.Agent` (.NET Native AOT)**
   - Adicionar comando `sidecar` com listener HTTP Kestrel Slim em porta `0`.
   - Adicionar rota `POST /execute` consumindo o mesmo executor e DTOs existentes.
   - Testes unitários e de integração no agente.
2. **Fase 2: Estrutura do App Desktop com Tauri v2**
   - Criação da pasta `desktop/` com configuração do Tauri v2.
   - Script de empacotamento que compila o `ApiDot.Agent` em Native AOT e copia para a pasta de binários do Tauri com os target triples corretos.
   - Gerenciamento de ciclo de vida do processo filho no Rust com parada limpa.
3. **Fase 3: Integração do Frontend (Next.js & Tauri IPC) & Seletor de Alvos**
   - Módulo `desktopClient.ts` com detecção de runtime e roteamento dinâmico de execução.
   - Adição do seletor de alvo global em `GlobalSettingsModal.tsx` (Nuvem, Dispositivo Ativo, Dispositivo Específico).
   - Atualização do seletor em `CollectionSettingsModal.tsx` e persistência do `TargetDeviceId`.
   - Resolução em cascata do alvo no `TargetResolver.cs` e injeção do `X-Device-Id`.
   - Adaptação das chamadas de execução no `WorkspaceEditorPane.tsx`.
4. **Fase 4: Persistência em Disco e Reconciliação Offline**
   - Comandos Rust no Tauri para leitura e escrita na pasta `~/.apidot/storage`.
   - Implementação de `POST /api/sync/batch` no `ApiDot.Server` com resolução de conflitos.
   - Sincronizador de mutações e reconciliação com o backend no frontend.
5. **Fase 5: Pipeline de Build e CI/CD**
   - GitHub Actions para gerar instaladores desktop (.dmg, .msi, .deb) em conjunto com as tags de release.
