# Rotina de Auto Update no ApiDot Desktop com GitHub Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar uma rotina completa de atualização automática (Auto Update) no aplicativo ApiDot Desktop com Tauri v2, baseada nas releases estáveis do GitHub (`latest.json`), com assinatura criptográfica ed25519, fechamento gracioso do sidecar AOT, interface reativa com Zustand e i18n, e pipeline de CI/CD no GitHub Actions.

**Architecture:** O Tauri v2 consome o plugin nativo `tauri-plugin-updater` apontando para o endpoint estático `https://github.com/medeiroshudson/ApiDot/releases/latest/download/latest.json`. No frontend Next.js 16/React 19, a store `useUpdateStore` gerencia os estados do ciclo de vida da atualização (`idle`, `checking`, `up-to-date`, `available`, `downloading`, `ready-to-restart`, `error`) com verificação em background não intrusiva no startup e checagem sob demanda. Ao aplicar a atualização, um comando IPC dedicado no Rust encerra graciosamente o processo filho `ApiDot.Agent` antes de reiniciar o processo principal, eliminando conflitos de porta ou arquivos travados.

**Tech Stack:** Tauri v2, Rust, Next.js 16.4.4, React 19.3.1, Zustand 5, TypeScript 5.7, Vitest, GitHub Actions (`tauri-apps/tauri-action@v0`), minisign / ed25519.

**Spec:** `docs/plans/2026-11-04-desktop-auto-update-design.md`

## Global Constraints

- **Segurança de Assinatura:** O aplicativo só deve aceitar atualizações assinadas com a chave pública ed25519 declarada em `tauri.conf.json`.
- **Zero Travamento de Sidecar:** O sidecar `ApiDot.Agent` deve ser finalizado via `SidecarManager::stop_sidecar` antes do restart do Tauri.
- **Compatibilidade Web e Desktop:** Todo código de frontend deve operar em modo no-op seguro quando executado em navegador comum (`isDesktop() === false`), sem disparar exceções nem renderizar controles desktop irrelevantes.
- **Internacionalização Obrigatória:** Todas as strings de interface devem pertencer aos arquivos de tradução `en-US.ts` e `pt-BR.ts`.
- **Abordagem Não Intrusiva (Abordagem 1):** Proibido exibir alertas ou modais bloqueantes na inicialização; a interação deve ocorrer via pill no cabeçalho e card na aba "Geral" das Configurações.

## Review Focus

1. **Tentativa de verificação de atualização no navegador comum (Web):** Não dispara IPC nem gera erros no console; a store se mantém em `idle` ou desabilitada.
2. **Queda de conexão ou release inacessível no GitHub durante o download:** O store captura a falha, transiciona para o estado `error` com mensagem i18n descritiva e permite retentativa imediata sem travar a UI.
3. **Download corrompido ou assinatura ed25519 inválida:** O plugin do Tauri rejeita a instalação com erro de validação criptográfica, a store reporta o erro e nenhum arquivo corrompido é executado.
4. **Encerramento limpo do Sidecar no reinício:** O comando `restart_app_cleanly` garante que o processo do `ApiDot.Agent` receba sinal de término antes de disparar o `restart()` da aplicação.
5. **Tentativa de disparar múltiplos downloads concorrentes:** O store bloqueia chamadas redundantes a `downloadAndInstall()` enquanto o status for `downloading`.

---

### Task 1: Configuração do Tauri v2 (Rust Backend & Dependências do Updater)

**Files:**
- Modify: `desktop/src-tauri/Cargo.toml:15-28`
- Modify: `desktop/src-tauri/tauri.conf.json:20-35`
- Modify: `desktop/src-tauri/capabilities/default.json:5-20`
- Modify: `desktop/src-tauri/src/main.rs:10-45`
- Modify: `desktop/validate-config.js:10-50`
- Test: `desktop/src-tauri/tests/desktop_config_test.rs`

**Interfaces:**
- Consumes: `SidecarManager` em `apidot_desktop::sidecar`
- Produces: Plugins `tauri_plugin_updater` e `tauri_plugin_process`, comando Tauri IPC `restart_app_cleanly`

- [ ] **Step 1: Escrever teste de falha para validação de configuração do Updater**

Em `desktop/validate-config.js` (ou teste em `desktop/src-tauri/tests/desktop_config_test.rs`):

```javascript
// Validar que createUpdaterArtifacts está ativo e endpoints do updater apontam para o repositório correto
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
assert(tauriConfig.bundle.createUpdaterArtifacts === true, 'bundle.createUpdaterArtifacts must be true');
assert(tauriConfig.plugins?.updater?.endpoints?.length > 0, 'updater endpoints must be configured');
assert(tauriConfig.plugins.updater.endpoints[0].includes('github.com/medeiroshudson/ApiDot/releases'), 'updater endpoint must point to GitHub releases');
```

- [ ] **Step 2: Executar validação para verificar falha**

Run: `node desktop/validate-config.js`  
Expected: FAIL com `bundle.createUpdaterArtifacts must be true`

- [ ] **Step 3: Atualizar Cargo.toml, tauri.conf.json, capabilities e main.rs**

1. Adicionar `tauri-plugin-updater = "2"` e `tauri-plugin-process = "2"` no `desktop/src-tauri/Cargo.toml`.
2. Em `desktop/src-tauri/tauri.conf.json`:
   - Configurar `"createUpdaterArtifacts": true` em `bundle`.
   - Adicionar seção `"plugins": { "updater": { "pubkey": "...", "endpoints": ["https://github.com/medeiroshudson/ApiDot/releases/latest/download/latest.json"] } }`.
3. Em `desktop/src-tauri/capabilities/default.json`: adicionar `"updater:default"` e `"process:default"`.
4. Em `desktop/src-tauri/src/main.rs`:
   - Inicializar `.plugin(tauri_plugin_process::init())` e `.plugin(tauri_plugin_updater::Builder::new().build())`.
   - Implementar e registrar o comando `restart_app_cleanly` que adquire o lock do `SidecarManager`, invoca `stop_sidecar().await` e chama `app_handle.restart()`.

- [ ] **Step 4: Executar validação e cargo check para verificar aprovação**

Run: `node desktop/validate-config.js && cargo check --manifest-path desktop/src-tauri/Cargo.toml`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src-tauri/ desktop/validate-config.js
git commit -m "feat(desktop): configure tauri v2 updater plugin and clean restart ipc"
```

---

### Task 2: Dicionários de Tradução i18n para Auto Update (`pt-BR` e `en-US`)

**Files:**
- Modify: `frontend/src/i18n/locales/en-US.ts:150-200`
- Modify: `frontend/src/i18n/locales/pt-BR.ts:150-200`
- Test: `frontend/src/i18n/locales/locales.test.ts`

**Interfaces:**
- Consumes: Objeto `TranslationDictionary`
- Produces: Chaves de tradução sob namespace `updater.*`

- [ ] **Step 1: Escrever teste de falha para chaves de tradução do Updater**

```typescript
it('contains all required updater translation keys in en-US and pt-BR', () => {
  const requiredKeys = [
    'updater.checkNow',
    'updater.checking',
    'updater.upToDate',
    'updater.upToDateDesc',
    'updater.updateAvailable',
    'updater.releaseNotesSummary',
    'updater.downloadAndInstall',
    'updater.downloading',
    'updater.downloadComplete',
    'updater.readyToRestartDesc',
    'updater.restartNow',
    'updater.updateFailed',
    'updater.updatePill',
    'updater.cancel',
    'updater.errorCheck',
  ];
  for (const key of requiredKeys) {
    expect(tEn(key)).not.toBe(key);
    expect(tPt(key)).not.toBe(key);
  }
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- -t "contains all required updater translation keys"`  
Expected: FAIL indicando chaves ausentes

- [ ] **Step 3: Adicionar traduções em `en-US.ts` e `pt-BR.ts`**

Adicionar seção `updater` com todos os textos descritos na especificação técnica.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npm --prefix frontend test -- -t "contains all required updater translation keys"`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/
git commit -m "feat(i18n): add auto update localized strings in en-US and pt-BR"
```

---

### Task 3: Módulo de Abstração do Desktop Updater (`frontend/src/lib/desktop/updater.ts`)

**Files:**
- Create: `frontend/src/lib/desktop/updater.ts`
- Test: `frontend/src/lib/desktop/updater.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-updater`, `isDesktop()` de `@/lib/desktop/runtime`
- Produces: `checkDesktopUpdate(): Promise<DesktopUpdateInfo | null>`, `downloadAndInstallUpdate(onProgress): Promise<void>`, `relaunchAppCleanly(): Promise<void>`

- [ ] **Step 1: Escrever testes unitários para o módulo `updater.ts`**

Cobrir:
1. Retorno `null` imediato quando `isDesktop() === false`.
2. Detecção de atualização quando Tauri Updater retorna `available: true`.
3. Tratamento de progresso no callback de `downloadAndInstall`.
4. Invocação do comando IPC `restart_app_cleanly`.
5. Tratamento defensivo de exceções de rede/parse.

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- frontend/src/lib/desktop/updater.test.ts`  
Expected: FAIL com arquivo inexistente

- [ ] **Step 3: Implementar `frontend/src/lib/desktop/updater.ts`**

Implementar funções utilitárias que realizam import dinâmico ou encapsulamento seguro das chamadas do `@tauri-apps/plugin-updater` e fallback imediato caso `isDesktop()` seja falso.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npm --prefix frontend test -- frontend/src/lib/desktop/updater.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/desktop/
git commit -m "feat(desktop): implement safe desktop updater bridge module"
```

---

### Task 4: Store Reativo Zustand (`frontend/src/stores/useUpdateStore.ts`)

**Files:**
- Create: `frontend/src/stores/useUpdateStore.ts`
- Test: `frontend/src/stores/useUpdateStore.test.ts`

**Interfaces:**
- Consumes: `checkDesktopUpdate`, `downloadAndInstallUpdate`, `relaunchAppCleanly` de `@/lib/desktop/updater`
- Produces: `useUpdateStore` hook (estados: `status`, `availableVersion`, `progressPercent`, `downloadedBytes`, `totalBytes`, `errorMessage`, ações: `checkForUpdates`, `downloadAndInstall`, `restartAndApply`, `resetError`)

- [ ] **Step 1: Escrever testes unitários para a store `useUpdateStore`**

Cobrir:
1. Estado inicial `status: 'idle'`.
2. Fluxo de verificação manual (`checking` → `up-to-date` ou `checking` → `available`).
3. Bloqueio de download concorrente se já estiver em `downloading`.
4. Progresso do download calculando porcentagem correta (`downloading` → `ready-to-restart`).
5. Captura de erro em falha de conexão com transição para `error`.
6. Reinício chamando `restartAndApply()`.

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- frontend/src/stores/useUpdateStore.test.ts`  
Expected: FAIL com arquivo inexistente

- [ ] **Step 3: Implementar `useUpdateStore.ts`**

Criar store com Zustand implementando as transições de estado, controle de concorrência e atualização atômica de progresso.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npm --prefix frontend test -- frontend/src/stores/useUpdateStore.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/useUpdateStore.ts frontend/src/stores/useUpdateStore.test.ts
git commit -m "feat(updater): implement useUpdateStore with reactive lifecycle state"
```

---

### Task 5: Componente de Interface do Cabeçalho (`AppHeader.tsx`)

**Files:**
- Modify: `frontend/src/components/layout/AppHeader.tsx:135-155`
- Test: `frontend/src/components/layout/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `useUpdateStore` (`status`, `availableVersion`), `isDesktop()`
- Produces: Pill de atualização renderizado ao lado do badge de versão quando `status === 'available'`

- [ ] **Step 1: Escrever teste de falha para renderização do pill no AppHeader**

```typescript
it('renders update pill when isDesktop is true and update status is available', () => {
  (window as any).__TAURI__ = {};
  useUpdateStore.setState({ status: 'available', availableVersion: '0.6.0' });

  render(<AppHeader onOpenSettings={onOpenSettings} />);
  expect(screen.getByText(/v0.6.0/i)).toBeInTheDocument();
  
  fireEvent.click(screen.getByRole('button', { name: /update available/i }));
  expect(onOpenSettings).toHaveBeenCalled();
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- frontend/src/components/layout/AppHeader.test.tsx`  
Expected: FAIL com elemento pill não encontrado

- [ ] **Step 3: Implementar renderização do pill no AppHeader**

Adicionar renderização condicional do pill discreto com animação de pulso suave e clique que aciona `onOpenSettings` direcionando para a aba geral.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npm --prefix frontend test -- frontend/src/components/layout/AppHeader.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AppHeader.tsx frontend/src/components/layout/AppHeader.test.tsx
git commit -m "feat(header): add localized non-intrusive update indicator pill"
```

---

### Task 6: Painel de Atualizações na Aba Geral (`GlobalSettingsModal.tsx`)

**Files:**
- Modify: `frontend/src/components/settings/GlobalSettingsModal.tsx:490-535`
- Test: `frontend/src/components/settings/GlobalSettingsModal.test.tsx`

**Interfaces:**
- Consumes: `useUpdateStore` (`status`, `availableVersion`, `progressPercent`, `checkForUpdates`, `downloadAndInstall`, `restartAndApply`), `isDesktop()`
- Produces: Card de versão interativo com 4 estados reativos (Up to date, Atualização disponível, Baixando, Pronto para reiniciar)

- [ ] **Step 1: Escrever testes unitários para os 4 estados do card de atualização**

Cobrir:
1. Estado A: Exibe botão "Verificar agora" e badge de versão atual.
2. Estado B: Exibe versão disponível e botão "Baixar e Atualizar".
3. Estado C: Exibe barra de progresso com porcentagem e botão "Cancelar".
4. Estado D: Exibe mensagem de download concluído e botão destacado "Reiniciar Agora".
5. Em ambiente web (`isDesktop === false`), exibe apenas o badge estático sem os controles de auto-update.

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- frontend/src/components/settings/GlobalSettingsModal.test.tsx`  
Expected: FAIL indicando ausência dos novos controles

- [ ] **Step 3: Implementar os estados interativos no `GlobalSettingsModal.tsx`**

Integrar o `useUpdateStore` substituindo a linha estática de versão pelo componente com os 4 estados visuais desenhados no mockup aprovado.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npm --prefix frontend test -- frontend/src/components/settings/GlobalSettingsModal.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/GlobalSettingsModal.tsx frontend/src/components/settings/GlobalSettingsModal.test.tsx
git commit -m "feat(settings): implement interactive 4-state update section in general settings"
```

---

### Task 7: Disparo de Verificação em Segundo Plano no Startup (`WorkspaceShell.tsx`)

**Files:**
- Modify: `frontend/src/components/layout/WorkspaceShell.tsx:50-80`
- Test: `frontend/src/components/layout/WorkspaceShell.test.tsx`

**Interfaces:**
- Consumes: `useUpdateStore.getState().checkForUpdates`
- Produces: Agendamento de verificação automática após 5 segundos da montagem da aplicação desktop

- [ ] **Step 1: Escrever teste de verificação do agendamento de update no startup**

```typescript
it('schedules background update check on desktop after mount delay', async () => {
  vi.useFakeTimers();
  const checkSpy = vi.fn();
  useUpdateStore.setState({ checkForUpdates: checkSpy });
  (window as any).__TAURI__ = {};

  render(<WorkspaceShell />);
  expect(checkSpy).not.toHaveBeenCalled();

  vi.advanceTimersByTime(5000);
  expect(checkSpy).toHaveBeenCalledWith(false);
  vi.useRealTimers();
});
```

- [ ] **Step 2: Executar teste para verificar falha**

Run: `npm --prefix frontend test -- frontend/src/components/layout/WorkspaceShell.test.tsx`  
Expected: FAIL com checkSpy não chamado

- [ ] **Step 3: Implementar o agendamento em `WorkspaceShell.tsx`**

Adicionar `useEffect` que detecta `isDesktop()` e dispara `checkForUpdates(false)` com debounce/timeout de 5000ms, limpando o timer no unmount.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `npm --prefix frontend test -- frontend/src/components/layout/WorkspaceShell.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/WorkspaceShell.tsx frontend/src/components/layout/WorkspaceShell.test.tsx
git commit -m "feat(desktop): schedule delayed background update check on startup"
```

---

### Task 8: Workflow Multi-Plataforma no GitHub Actions (`.github/workflows/desktop-release.yml`)

**Files:**
- Create: `.github/workflows/desktop-release.yml`
- Modify: `desktop/prepare.js:15-85`

**Interfaces:**
- Consumes: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `GITHUB_TOKEN`
- Produces: Artefatos de release (`.dmg`, `.app.tar.gz`, `.msi`, `.nsis.zip`, `.deb`, `.AppImage.tar.gz`), assinaturas `.sig` e `latest.json` unificado na tag de release

- [ ] **Step 1: Escrever validação estática do arquivo de workflow e script de prepare**

Verificar via teste ou script que `prepare.js` aceita flags ou variáveis de ambiente para targets de CI e que `.github/workflows/desktop-release.yml` referencia corretamente a action `tauri-apps/tauri-action@v0` com matriz de SOs (`macos-latest`, `ubuntu-latest`, `windows-latest`).

- [ ] **Step 2: Executar teste para verificar falha**

Run: `test -f .github/workflows/desktop-release.yml`  
Expected: FAIL com arquivo inexistente

- [ ] **Step 3: Criar `.github/workflows/desktop-release.yml` e aprimorar `desktop/prepare.js`**

1. Configurar gatilhos para push de tags `v*` e `workflow_dispatch`.
2. Montar matriz de runners com compilação prévia do `ApiDot.Agent` AOT para o target correspondente.
3. Integrar `tauri-apps/tauri-action@v0` configurado para gerar os instaladores e assinar com `TAURI_SIGNING_PRIVATE_KEY`.
4. Habilitar a geração e upload automático do `latest.json` na GitHub Release.

- [ ] **Step 4: Validar sintaxe do YAML e execução local do `prepare.js`**

Run: `node desktop/prepare.js && node desktop/validate-config.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/desktop-release.yml desktop/prepare.js
git commit -m "ci(desktop): add multi-platform desktop release workflow with tauri updater artifacts"
```

---

### Task 9: Validação Geral de Regressão e Build da Solução

**Files:**
- Test: Full Test Suite (`npm --prefix frontend test`, `cargo check`, `dotnet test`)

- [ ] **Step 1: Executar suíte completa de testes do frontend**

Run: `npm --prefix frontend test`  
Expected: PASS (todos os testes de componentes, stores e lógica)

- [ ] **Step 2: Executar checagem do Rust / Tauri**

Run: `cargo check --manifest-path desktop/src-tauri/Cargo.toml`  
Expected: PASS sem warnings impeditivos

- [ ] **Step 3: Executar suíte completa de testes do backend .NET**

Run: `dotnet test backend/ApiDot.sln -v minimal`  
Expected: PASS

- [ ] **Step 4: Commit de finalização**

```bash
git commit --allow-empty -m "chore(desktop): finalize automated test validation for desktop auto-update"
```
