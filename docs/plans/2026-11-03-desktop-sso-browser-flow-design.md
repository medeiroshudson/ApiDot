# Design Técnico: Autenticação SSO no Navegador Externo via Loopback Callback e Tela de Sucesso i18n

**Data:** 2026-11-03  
**Status:** Aprovado  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Full-Stack (.NET 9 Backend & Native AOT Agent / Next.js 16 Web / Tauri v2 Desktop)

---

## 1. Intenção e Motivação (The Why)

No aplicativo Desktop (Tauri v2), ao clicar em "Entrar com SSO", a navegação padrão dentro do WebView isolado do sistema exige que o usuário redigite suas credenciais do Authentik (incluindo usuário, senha e chaves de segurança/2FA), pois o WebView não compartilha os cookies de sessão do navegador padrão do sistema operacional (Chrome, Safari, Brave, Edge).

Para proporcionar uma experiência de autenticação instantânea de um clique (aproveitando que o desenvolvedor já está autenticado no Authentik em seu navegador), o fluxo de SSO do aplicativo Desktop deve:
1. Abrir a tela de autenticação em uma nova aba do navegador padrão do sistema.
2. Permitir que o Authentik valide a sessão existente imediatamente.
3. Redirecionar o navegador de volta para o Sidecar local em loopback (`http://127.0.0.1:<porta>/auth/callback?token=...`).
4. O Sidecar recebe o token, notifica o aplicativo Desktop e redireciona o navegador para a página `/auth/desktop-success`.
5. A página exibe a mensagem de confirmação com suporte completo ao sistema nativo de internacionalização (`en-US` padrão, `pt-BR`).
6. O aplicativo Desktop conclui o login automaticamente, salva a sessão e carrega os workspaces.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Abertura no Navegador Externo:**
  - No Desktop, o clique no botão de SSO invoca o navegador padrão do sistema operacional, mantendo a janela do app aberta com indicador de espera (*"Aguardando autenticação no navegador..."*).
- **Callback no Sidecar Local (`ApiDot.Agent`):**
  - Rota `GET /auth/callback` no Kestrel Slim do Sidecar recebendo o token de troca temporário e redirecionando para `/auth/desktop-success`.
  - Rota `GET /auth/session` (protegida por `X-ApiDot-Sidecar-Secret`) para entrega segura e de uso único do token ao aplicativo Desktop.
- **Geração e Troca de Token no `ApiDot.Server`:**
  - Parâmetro `desktop_callback` no `/api/auth/login`, preservado no estado OIDC.
  - Ao concluir o fluxo OIDC, se `desktop_callback` estiver presente, gera um `DesktopExchangeToken` temporário (expiração em 5 minutos, uso único) e redireciona para `${desktop_callback}?token=${exchangeToken}`.
  - Endpoint `POST /api/auth/desktop-exchange` para validar o token de troca e emitir a sessão do usuário.
- **Página de Sucesso com i18n (`/auth/desktop-success`):**
  - Página estática/client em Next.js com internacionalização completa (`en-US` e `pt-BR`), informando que a autenticação foi concluída e que a aba pode ser fechada.
- **Preservação da Aplicação Web:**
  - No navegador Web comum, o botão de SSO continua navegando diretamente para `/api/auth/login` sem acionar o fluxo de desktop callback.

### 2.2. Não-Metas (Non-Goals)
- Não registrar esquemas de URI customizados no SO (`apidot://`) neste momento: o loopback callback no Sidecar é mais seguro, não exige permissões de registro no SO e evita telas de confirmação de segurança do navegador.
- Não manter tokens de troca ativos permanentemente: tokens de troca expiram em 5 minutos e são invalidados no primeiro uso.

### 2.3. Anti-Metas (Anti-Goals)
- **Zero digitação redundante de credenciais:** O usuário já autenticado no Authentik no navegador não deve ver tela de senha.
- **Zero exposição de segredos no histórico:** O token de troca é efêmero e não confere privilégios duradouros sem a troca segura na API.

---

## 3. Arquitetura e Fluxo Detalhado

```text
[ApiDot Desktop]                [Navegador Padrão]            [Authentik / ApiDot.Server]         [Sidecar Local]
       │                                │                                    │                            │
 1. Clica "SSO"                         │                                    │                            │
       ├───────────────────────────────►│                                    │                            │
       │  Abre browser padrão:          │                                    │                            │
       │  /api/auth/login?              │                                    │                            │
       │  desktop_callback=http://...   │                                    │                            │
       │                                ├───────────────────────────────────►│                            │
       │                                │ 2. Valida sessão existente         │                            │
       │                                │    no Authentik                    │                            │
       │                                │◄───────────────────────────────────┤                            │
       │                                │ 3. Redireciona:                    │                            │
       │                                │    http://127.0.0.1:<p>/auth/cb    │                            │
       │                                │    ?token=<exchange_token>         │                            │
       │                                ├────────────────────────────────────────────────────────────────►│
       │                                │                                    │   4. Guarda token          │
       │                                │◄────────────────────────────────────────────────────────────────┤
       │                                │ 5. Redireciona 302:                │      em memória            │
       │                                │    /auth/desktop-success           │                            │
       │                                ├───────────────────────────────────►│                            │
       │                                │ 6. Renderiza tela i18n             │                            │
       │ 7. Polling GET /auth/session   │                                    │                            │
       ├─────────────────────────────────────────────────────────────────────────────────────────────────►│
       │◄─────────────────────────────────────────────────────────────────────────────────────────────────┤
       │ 8. Recebe <exchange_token>     │                                    │                            │
       ├────────────────────────────────────────────────────────────────────►│                            │
       │ 9. POST /api/auth/desktop-exchange                                  │                            │
       │◄────────────────────────────────────────────────────────────────────┤                            │
       │ 10. Sessão autenticada (Cookie/UserDto)                             │                            │
       ▼                                                                                                  
  Entra no Workspace
```

---

## 4. Dicionários de Tradução (i18n)

### `frontend/src/i18n/locales/en-US.ts`
```typescript
auth: {
  ...
  desktopSuccessTitle: 'Authentication Successful',
  desktopSuccessMessage: 'You have successfully signed in. You can now close this tab and return to ApiDot Desktop.',
  desktopSuccessButton: 'Open ApiDot Desktop',
  waitingBrowserAuth: 'Waiting for authentication in your browser...',
  cancelWaiting: 'Cancel',
}
```

### `frontend/src/i18n/locales/pt-BR.ts`
```typescript
auth: {
  ...
  desktopSuccessTitle: 'Autenticação Concluída com Sucesso',
  desktopSuccessMessage: 'Você foi autenticado com sucesso. Você já pode fechar esta aba e voltar ao ApiDot Desktop.',
  desktopSuccessButton: 'Abrir o ApiDot Desktop',
  waitingBrowserAuth: 'Aguardando autenticação no navegador...',
  cancelWaiting: 'Cancelar',
}
```

---

## 5. Fases de Implementação

1. **Fase 1: Backend (`ApiDot.Server`)**
   - Suporte a `desktop_callback` no `/api/auth/login`.
   - Armazenamento em memória com expiração de `DesktopExchangeToken`.
   - Endpoint `POST /api/auth/desktop-exchange`.
   - Testes de integração.
2. **Fase 2: Sidecar (`ApiDot.Agent`)**
   - Endpoints `GET /auth/callback` e `GET /auth/session` no Kestrel Slim com CORS.
   - Testes unitários do sidecar auth.
3. **Fase 3: Frontend Web (`/auth/desktop-success`)**
   - Criação da página com suporte a i18n, logo do ApiDot e estilo escuro.
   - Testes com Vitest.
4. **Fase 4: Integração Desktop no Login (`LoginPage.tsx`)**
   - Detecção de `isDesktop()` no botão de SSO.
   - Abertura de browser padrão via Tauri IPC e polling de conclusão com fallback.
   - Testes de integração da tela de login.
