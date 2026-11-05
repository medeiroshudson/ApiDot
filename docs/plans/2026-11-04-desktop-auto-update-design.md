# Design Técnico: Rotina de Atualização Automática (Auto Update) no ApiDot Desktop com GitHub Releases

**Data:** 2026-11-04  
**Status:** Em Revisão (Aguardando Builder Check)  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Full-Stack & DevOps (Tauri v2 / Rust / Next.js 16 Web / GitHub Actions)

---

## 1. Intenção e Motivação (The Why)

O ApiDot Desktop empacota a interface Next.js 16/React 19 com o motor de execução local `ApiDot.Agent` compilado em Native AOT como sidecar. Atualmente, novas versões da aplicação exigem que o usuário acesse manualmente os releases do GitHub, faça o download do pacote adequado para seu sistema operacional (macOS, Linux ou Windows) e reinstale a aplicação.

Para garantir que correções de segurança, otimizações no sidecar de loopback e melhorias na interface cheguem rapidamente e sem fricção aos desenvolvedores, é necessário implementar uma rotina nativa de atualização automática baseada no ecossistema de Releases do GitHub (`https://github.com/medeiroshudson/ApiDot`).

A rotina deve:
1. Verificar periodicamente (ou sob demanda) a existência de novas versões estáveis no GitHub.
2. Exibir indicadores discretos e transparentes na interface do usuário sem bloquear seu fluxo de trabalho.
3. Permitir que o desenvolvedor escolha o momento ideal para baixar e reiniciar.
4. Garantir a integridade binária através de assinaturas criptográficas ed25519.
5. Encerrar de forma limpa o processo sidecar (`ApiDot.Agent`) antes do reinício da aplicação, eliminando o risco de processos órfãos ou arquivos travados.

---

## 2. Abordagens Consideradas (Approaches)

### Abordagem 1: Verificação em Background com Notificação Não Intrusiva e Ação do Usuário (Escolhida)
- **Descrição:** O aplicativo verifica a existência de releases no GitHub em segundo plano (logo após a inicialização e sob demanda nas configurações). Se uma nova versão for encontrada, um pill informativo sutil é exibido no cabeçalho (`AppHeader`) ao lado do badge de versão e na aba "Geral" das Configurações (`GlobalSettingsModal`). O download e a reinicialização são disparados exclusivamente por ação voluntária do usuário.
- **Vantagens:** Não interrompe testes de API ou edições de código em andamento; total previsibilidade operacional; encerramento limpo do sidecar Native AOT apenas quando o usuário aceitar o reinício; feedback visual detalhado com changelog e barra de progresso.
- **Desvantagens:** Requer gerenciamento de estado dedicado (`useUpdateStore`) e tratamento fino dos 4 estados visuais.

### Abordagem 2: Diálogo Bloqueante na Inicialização
- **Descrição:** Ao iniciar, o app consulta o GitHub e, se houver versão mais recente, bloqueia o carregamento com um modal obrigatório: *"Deseja atualizar agora ou ignorar esta versão?"*.
- **Vantagens:** Implementação simples e direta.
- **Desvantagens:** Interrompe abruptamente o desenvolvedor que abriu o aplicativo para uma tarefa rápida ou urgente; cria atrito frequente em lançamentos incrementais.

### Abordagem 3: Atualização Totalmente Silenciosa (Silent Background Download)
- **Descrição:** O app baixa silenciosamente os novos binários em segundo plano sem notificar o usuário e aplica a atualização ao fechar a janela ou no próximo boot.
- **Vantagens:** Zero cliques para o usuário final.
- **Desvantagens:** Consome largura de banda sem aviso prévio; no macOS e Linux, a substituição de pacotes em execução pode corromper links simbólicos ou deixar o sidecar inconsistente caso o encerramento do app ocorra por encerramento forçado do SO.

**Decisão:** Aprovada a **Abordagem 1** por alinhamento rigoroso com a experiência de ferramentas consolidadas de desenvolvimento (VS Code, Postman).

---

## 3. Metas, Não-Metas e Anti-Metas

### 3.1. Metas (Goals)
- **Tauri v2 Updater Nativo:** Integrar o plugin oficial `tauri-plugin-updater` no projeto Rust (`desktop/src-tauri`).
- **Segurança e Validação Criptográfica:** Assinatura de todos os artefatos com par de chaves ed25519 (`minisign`), com chave pública embutida no `tauri.conf.json` e chave privada armazenada nos segredos do repositório no GitHub.
- **Manifesto Estático no GitHub Releases:** Configurar o endpoint para consultar diretamente o arquivo `latest.json` publicado em `https://github.com/medeiroshudson/ApiDot/releases/latest/download/latest.json`.
- **Pipeline de CI/CD para Desktop:** Criar workflow no GitHub Actions para compilação multi-plataforma dos instaladores (macOS .dmg/.tar.gz, Linux .deb/.AppImage.tar.gz, Windows .msi/.nsis.zip), geração dos hashes, assinaturas e publicação unificada do `latest.json` junto à tag `v*`.
- **Gerenciamento de Estado no Frontend:** Implementar `useUpdateStore` (Zustand) gerenciando o ciclo de vida completo: `idle`, `checking`, `available`, `downloading`, `downloaded`, `error` e `up-to-date`.
- **Interface e Experiência do Usuário (UI):**
  - Pill de atualização discreto e acessível no `AppHeader.tsx`.
  - Painel com 4 estados reativos na aba "Geral" do `GlobalSettingsModal.tsx` com barra de progresso em tempo real e botão de verificação manual.
- **Encerramento Limpo do Sidecar:** Garantir que o comando de reinício (`relaunch`) invoque previamente `SidecarManager::stop_sidecar` para matar o processo filho com `SIGTERM`/`kill`.
- **Internacionalização (i18n):** Adicionar todas as mensagens nos dicionários oficiais `pt-BR` e `en-US`.

### 3.2. Não-Metas (Non-Goals)
- Não disponibilizar canais `beta` ou `nightly` separados neste primeiro momento (todas as versões seguirão o canal estável via tags `v*`).
- Não atualizar o aplicativo web executado no navegador comum (no ambiente web, as opções de auto update são desabilitadas com fallback seguro).
- Não utilizar servidores de distribuição proprietários ou pagos: a entrega de artefatos é 100% ancorada no GitHub Releases.

### 3.3. Anti-Metas (Anti-Goals)
- **Zero travamento de processos:** Não permitir que a substituição de executáveis ocorra enquanto o processo do `ApiDot.Agent` estiver ativo.
- **Zero instalação de binários não assinados:** A aplicação deve recusar sumariamente atualizações cuja assinatura não confira com a chave pública embutida.
- **Zero intrusão no workflow:** Nenhuma tela modal bloqueante ou forçada durante a execução de requisições.

---

## 4. Arquitetura e Fluxo Detalhado

```text
[ApiDot Frontend (Zustand)]         [Tauri IPC / Updater Plugin]           [GitHub Releases]             [Sidecar (Agent)]
             │                                   │                                  │                            │
 1. Startup ou "Verificar"                       │                                  │                            │
             ├──────────────────────────────────►│                                  │                            │
             │   check_for_updates()             ├─────────────────────────────────►│                            │
             │                                   │   GET /releases/latest/download/ │                            │
             │                                   │   latest.json                    │                            │
             │                                   │◄─────────────────────────────────┤                            │
             │◄──────────────────────────────────┤   Retorna versão e URLs          │                            │
             │   Emit: { available: true,        │                                  │                            │
             │           version: "0.6.0" }      │                                  │                            │
             │                                   │                                  │                            │
 2. Exibe Pill no Header                         │                                  │                            │
    e Estado B no Modal                          │                                  │                            │
             │                                   │                                  │                            │
 3. Usuário clica:                               │                                  │                            │
    "Baixar e Atualizar"                         │                                  │                            │
             ├──────────────────────────────────►│                                  │                            │
             │   download_and_install()          ├─────────────────────────────────►│                            │
             │                                   │   Baixa artefato assinado        │                            │
             │◄──────────────────────────────────┤◄─────────────────────────────────┤                            │
             │   Event: download-progress (%)    │   Valida chave ed25519           │                            │
             │                                   │   Prepara substituição           │                            │
 4. Estado D: "Reiniciar Agora"                  │                                  │                            │
             │                                   │                                  │                            │
 5. Usuário clica em Reiniciar                   │                                  │                            │
             ├──────────────────────────────────►│                                  │                            │
             │   relaunch_app()                  │                                  │                            │
             │                                   ├──────────────────────────────────────────────────────────────►│
             │                                   │   stop_sidecar()                 │                            │ 6. SIGTERM/Kill
             │                                   │◄──────────────────────────────────────────────────────────────┤    processo morre
             │                                   │                                                               
             │                                   │ 7. Executa relaunch() e substitui pacote
             ▼                                   ▼
    [App reinicia na v0.6.0 com novo Sidecar integrado]
```

---

## 5. Especificação Técnica dos Componentes

### 5.1. Tauri v2 (Rust Backend)

#### `desktop/src-tauri/Cargo.toml`
Adição da dependência do plugin updater:
```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-fs = "2"
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
```

#### `desktop/src-tauri/tauri.conf.json`
Habilitação da geração de artefatos de update e configuração dos endpoints e chave pública:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ApiDot",
  "version": "0.5.1",
  "identifier": "dev.hmedeiros.apidot",
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": true,
    "externalBin": [
      "binaries/apidot-agent"
    ]
  },
  "plugins": {
    "updater": {
      "pubkey": "REPLACE_WITH_GENERATED_ED25519_PUBLIC_KEY",
      "endpoints": [
        "https://github.com/medeiroshudson/ApiDot/releases/latest/download/latest.json"
      ]
    }
  }
}
```

#### `desktop/src-tauri/capabilities/default.json`
Declaração de permissões para o plugin updater e controle de processo:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for ApiDot Desktop",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:default",
    "fs:default",
    "updater:default",
    "process:default"
  ]
}
```

#### `desktop/src-tauri/src/main.rs`
Inicialização dos plugins e comando com garantia de desligamento do sidecar:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(sidecar_manager.clone())
    .invoke_handler(tauri::generate_handler![
        get_sidecar_info,
        restart_app_cleanly,
        ...
    ])
```

Comando customizado para garantir a parada do sidecar antes de reiniciar:
```rust
#[tauri::command]
async fn restart_app_cleanly(
    app_handle: tauri::AppHandle,
    sidecar_manager: tauri::State<'_, Arc<Mutex<SidecarManager>>>,
) -> Result<(), String> {
    let mut mgr = sidecar_manager.lock().await;
    let _ = mgr.stop_sidecar().await;
    app_handle.restart();
    Ok(())
}
```

---

### 5.2. Frontend (Next.js & Zustand)

#### `frontend/src/lib/desktop/updater.ts`
Módulo de abstração do Tauri Updater com fallback seguro para ambiente Web:
```typescript
import { isDesktop } from './runtime';

export interface UpdateMetadata {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export interface UpdateProgress {
  chunkLength: number;
  contentLength?: number;
  downloadedBytes: number;
  percent: number;
}
```

#### `frontend/src/stores/useUpdateStore.ts`
Store reativo para controle centralizado de estado:
```typescript
export type UpdateStatus = 
  | 'idle' 
  | 'checking' 
  | 'up-to-date' 
  | 'available' 
  | 'downloading' 
  | 'ready-to-restart' 
  | 'error';

interface UpdateStoreState {
  status: UpdateStatus;
  availableVersion: string | null;
  releaseNotes: string | null;
  releaseDate: string | null;
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number | null;
  errorMessage: string | null;
  lastCheckedAt: Date | null;
  
  checkForUpdates: (manual?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restartAndApply: () => Promise<void>;
  resetError: () => void;
}
```

#### `frontend/src/components/layout/AppHeader.tsx`
Renderização condicional do pill discreto no cabeçalho:
```tsx
{isDesktopApp && status === 'available' && (
  <button
    type="button"
    onClick={onOpenSettingsToUpdate}
    aria-label={t('updater.updateAvailableAria')}
    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 text-xs transition-colors cursor-pointer"
  >
    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
    <span>{t('updater.updatePill', { version: availableVersion })}</span>
  </button>
)}
```

#### `frontend/src/components/settings/GlobalSettingsModal.tsx`
Substituição da linha estática "Versão da Aplicação" pelo card interativo com os 4 estados visuais desenhados e validados no mockup.

---

### 5.3. Dicionários de Tradução (i18n)

#### `frontend/src/i18n/locales/en-US.ts`
```typescript
updater: {
  checkNow: 'Check for updates',
  checking: 'Checking for updates...',
  upToDate: 'Up to date',
  upToDateDesc: 'You are on the latest version of ApiDot.',
  updateAvailable: 'New version available',
  releaseNotesSummary: 'Released on GitHub • Includes performance and stability updates.',
  downloadAndInstall: 'Download & Update',
  downloading: 'Downloading update ({version})...',
  verifyingSignature: 'Verifying ed25519 signature...',
  downloadComplete: 'Download Complete',
  readyToRestartDesc: 'Restart the application to complete the update.',
  restartNow: 'Restart Now',
  updateFailed: 'Failed to update',
  updatePill: 'Update available: {version}',
  cancel: 'Cancel',
  errorCheck: 'Could not connect to update server.',
}
```

#### `frontend/src/i18n/locales/pt-BR.ts`
```typescript
updater: {
  checkNow: 'Verificar agora',
  checking: 'Verificando atualizações...',
  upToDate: 'Atualizado',
  upToDateDesc: 'Você está utilizando a versão mais recente do ApiDot.',
  updateAvailable: 'Nova versão disponível',
  releaseNotesSummary: 'Lançada no GitHub • Inclui melhorias de performance e estabilidade.',
  downloadAndInstall: 'Baixar e Atualizar',
  downloading: 'Baixando atualização ({version})...',
  verifyingSignature: 'Validando assinatura ed25519...',
  downloadComplete: 'Download Concluído',
  readyToRestartDesc: 'Reinicie a aplicação para finalizar a instalação.',
  restartNow: 'Reiniciar Agora',
  updateFailed: 'Falha ao atualizar',
  updatePill: 'Atualização disponível: {version}',
  cancel: 'Cancelar',
  errorCheck: 'Não foi possível consultar o servidor de atualizações.',
}
```

---

### 5.4. Pipeline de CI/CD e Geração de Artefatos no GitHub Actions

#### Extensão em `.github/workflows/release.yml` (ou workflow dedicado `.github/workflows/desktop-release.yml`)
1. **Passo prévio:** Compilar os binários `apidot-agent` (Native AOT) nas 4 RIDs suportadas (`osx-arm64`, `linux-x64`, `linux-arm64`, `win-x64`).
2. **Build dos Bundles do Tauri:**
   - Executa `desktop/prepare.js` com o target correto posicionando o binário do agent em `desktop/src-tauri/binaries/`.
   - Utiliza `tauri-apps/tauri-action@v0`:
     - Compila o bundle para cada SO (macOS universal/arm64, Linux .deb/.AppImage, Windows .msi/.nsis).
     - Assina cada artefato usando `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
     - Consolida os downloads e assinaturas gerando o manifesto canônico `latest.json`:
       ```json
       {
         "version": "0.6.0",
         "notes": "ApiDot Release v0.6.0",
         "pub_date": "2026-11-04T12:00:00Z",
         "platforms": {
           "darwin-aarch64": {
             "signature": "...",
             "url": "https://github.com/medeiroshudson/ApiDot/releases/download/v0.6.0/ApiDot_0.6.0_aarch64.app.tar.gz"
           },
           "darwin-x86_64": { ... },
           "linux-x86_64": { ... },
           "windows-x86_64": { ... }
         }
       }
       ```
3. **Publicação no GitHub Release:**
   - Anexa `latest.json` e todos os arquivos compactados (`.tar.gz`, `.zip`, `.sig`) diretamente na Release correspondente.

---

## 6. O que Fica a Critério do Implementador (Left to the Builder)

1. **Agendamento de verificação periódica:** O intervalo sugerido é a cada 4 horas ou uma checagem 5 segundos após a montagem do app inicial para não concorrer com o carregamento da sessão de workspaces. O implementador pode ajustar a temporização exata.
2. **Tratamento de timeout de rede:** Definir se a requisição do `check()` terá timeout de 10s ou 15s para evitar manter estados pendentes indefinidamente em conexões lentas.
3. **Mecanismo de log no console/dev:** Logar avisos de verificação apenas quando em ambiente de desenvolvimento ou debug.

---

## 7. Estratégia de Verificação e Testes

1. **Testes Unitários de Frontend:**
   - `useUpdateStore.test.ts`: Cobrir transições de estado (`idle` → `checking` → `available` → `downloading` → `ready-to-restart`), tratamento de erro de rede e cálculo de porcentagem de download.
   - `AppHeader.test.tsx`: Validar presença do pill quando `status === 'available'` e ausência no ambiente Web ou status `up-to-date`.
   - `GlobalSettingsModal.test.tsx`: Validar renderização dos botões "Verificar agora", barra de progresso no estado `downloading` e botão "Reiniciar Agora" no estado `ready-to-restart`.
2. **Testes de Configuração e Compilação Desktop:**
   - `desktop/validate-config.js`: Estender o validador para assegurar que `plugins.updater.endpoints` e `bundle.createUpdaterArtifacts` estão devidamente configurados.
   - `cargo check --manifest-path desktop/src-tauri/Cargo.toml` para garantir ausência de erros de compilação com o `tauri-plugin-updater`.
3. **Testes do Sidecar Shutdown no Restart:**
   - Testar o comando Rust `restart_app_cleanly` assegurando que `stop_sidecar()` é invocado antes de acionar a reinicialização.
4. **Verificação de Regressão da Solução:**
   - Executar a suíte completa de testes de frontend (`npm test` no frontend) e backend (`dotnet test`) garantindo que nenhum teste existente seja quebrado.
