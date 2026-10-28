# Design Técnico: Lançamento Público Oficial (v0.1.0), README, About e Desacoplamento de Versão

**Data:** 2026-10-27  
**Status:** Em Revisão Técnica (Builder Check)  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Full-Stack & DevOps (Next.js 15 Web / GitHub Actions CI/CD / Docker / Documentação / Playwright)

---

## 1. Intenção e Motivação (The Why)

O **ApiDot** está pronto para seu primeiro lançamento público oficial sob a versão **v0.1.0**. 

Atualmente:
1. **Ausência de Documentação Pública de Entrada:** O repositório não possui um `README.md` raiz nem metadados configurados para a seção **About** do GitHub. O projeto precisa de uma apresentação clara, moderna e visualmente atraente no mesmo padrão de referências consagradas do ecossistema de APIs (Bruno, Hoppscotch e Yaak).
2. **Versão Engessada no Código:** A versão `'0.4.0'` está hardcoded em arquivos do frontend (`package.json`, `AppHeader.tsx`, `GlobalSettingsModal.tsx`), no backend (`InstallScriptEndpoints.cs`) e validada estaticamente em diversos testes unitários e de integração. O correto é que a versão seja injetada dinamicamente a partir da tag Git gerada no pipeline de release, exibindo `'dev'` em ambiente local.
3. **Título da Aba Estático e Genérico:** O título da página exibe `'ApiDot - Hybrid API Client'`, sendo genérico e pouco informativo. O título da aba deve refletir dinamicamente o workspace ativo (ex: `ApiDot - Personal Workspace`).
4. **Screenshots com Dados Internos:** Os scripts legados de captura do Playwright contêm dados mockados e domínios corporativos internos (`viveo.internal`, nomes reais). Para o lançamento público, as capturas de tela devem ser geradas a partir de dados neutros (`api.example.com`, `httpbin.org`) e organizadas em seções colapsáveis no README.
5. **Higienização de Tags do Repositório:** A tag anterior `v0.4.0` deve ser expurgada para que o repositório público seja oficialmente inaugurado com a tag `v0.1.0`.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Apresentação Oficial no GitHub (README.md & About):**
  - **Slogan:** *"Test and debug any API, anywhere — from localhost to production"*
  - **About:** Descrição clara e concisa acompanhada de tópicos estratégicos (`api-client`, `developer-tools`, `self-hosted`, `rest-api`, `openapi`, `postman-alternative`, `nextjs`, `dotnet`).
  - **README.md (Inglês):** Estrutura profissional com Badges, Hero, Visão Geral, Grade de Funcionalidades, Quick Start via Docker Compose em comando único, Galeria Visual com `<details>` colapsáveis, Instruções para Contribuição e Licença.
- **Desacoplamento Dinâmico de Versão:**
  - Criação do módulo `frontend/src/lib/version.ts` exportando `APP_VERSION`, alimentado por `process.env.NEXT_PUBLIC_APP_VERSION` com fallback para `'dev'`.
  - Atualização do `frontend/Dockerfile` para aceitar `ARG NEXT_PUBLIC_APP_VERSION` no estágio de build e gravá-lo no ambiente do Next.js.
  - Atualização do `.github/workflows/release.yml` para passar `--build-arg NEXT_PUBLIC_APP_VERSION=${{ github.ref_name }}` durante a compilação dos containers.
  - Ajuste de `AppHeader` e `GlobalSettingsModal` para consumir `APP_VERSION`.
  - Alinhamento de testes para validar o padrão dinâmico sem depender de valores fixos.
- **Título Dinâmico no Navegador:**
  - Configuração do título base no `app/layout.tsx`.
  - Atualização dinâmica de `document.title` ao carregar/trocar de workspace para `ApiDot - [Nome do Workspace]`.
- **Captura e Armazenamento de Screenshots Sanitizados:**
  - Script dedicado `frontend/playwright/capture-public-screenshots.js` utilizando mocks genéricos e universais (`https://api.example.com`).
  - Salvamento dos assets oficiais em `docs/assets/screenshots/`:
    - `01-desktop-hero-request-response.png`
    - `02-desktop-variable-autocomplete.png`
    - `03-desktop-openapi-sync-audit.png`
    - `04-desktop-workspace-and-tree.png`
- **Procedimento de Transição de Tags:**
  - Guia de comandos seguros para exclusão da tag `v0.4.0` local e remota, seguido pela criação e push da tag oficial `v0.1.0`.

### 2.2. Não-Metas (Non-Goals)
- Não alterar a lógica de execução de requisições, endpoints de negócio do backend ou esquemas do banco SQLite.
- Não expor detalhes de arquitetura excessivamente técnicos no topo do README (como detalhes de baixo nível de WebSockets reversos no Hero).
- Não alterar regras de negócio de workspaces, variáveis ou coleções.

### 2.3. Anti-Metas (Anti-Goals)
- **Zero Vazamento de Dados Internos:** Nenhuma imagem, texto de mock ou código no repositório público conterá nomes de empresas, domínios corporativos ou identificadores privados.
- **Não Quebrar Builds Locais:** Desenvolvedores rodando `npm run dev` ou `docker compose` sem informar variáveis de ambiente devem ver a versão `'dev'` sem erros de build ou compilação.
- **Evitar Poluição Visual no README:** Não sobrecarregar a visualização com uma lista vertical interminável de imagens em alta resolução; utilizar seções expansíveis (`<details><summary>...</summary></details>`).

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Pipeline Integrado de Lançamento com Versão Dinâmica (Escolhida)
- **Estrutura:**
  - Injeção de `NEXT_PUBLIC_APP_VERSION` no build Docker a partir de `github.ref_name`.
  - Módulo utilitário `src/lib/version.ts` com fallback gracioso para `'dev'`.
  - Título reativo no layout do workspace.
  - Script Playwright sanitizado gerando assets reais na pasta `docs/assets/screenshots/`.
  - README em padrão internacional com galeria colapsável.
- **Vantagens:** Solução definitiva e sustentável para qualquer release futuro via tags sem necessidade de commits manuais de bump de versão.
- **Trade-off:** Exige atualizar testes que mockavam ou asseriam a string `'0.4.0'`.

### Abordagem 2: Bump Manual Estático para v0.1.0 (Descartada)
- **Estrutura:** Apenas alterar `'0.4.0'` para `'0.1.0'` nos arquivos de código e nos testes.
- **Motivo do Descarte:** Mantém a dívida técnica de versionamento rígido, exigindo mutações em código a cada tag lançada no GitHub.

---

## 4. Especificação Detalhada dos Componentes

### 4.1. README.md e Metadados do GitHub (About)

#### GitHub About
- **Description:** *"Test and debug any API, anywhere — from localhost to production. Modern, self-hosted open-source API client and workspace."*
- **Topics:** `api-client`, `developer-tools`, `self-hosted`, `rest-api`, `openapi`, `postman-alternative`, `nextjs`, `dotnet`

#### Estrutura do `README.md`
1. **Header & Badges:**
   - Logotipo/Nome estilizado: `# ⚡ ApiDot`
   - Slogan: `> Test and debug any API, anywhere — from localhost to production.`
   - Badges: GitHub Release, License (MIT), Docker Pulls/Status, Next.js 15, .NET 9.
2. **Hero Image:**
   - Screenshot principal em modo escuro com requisição ativa, editor JSON e resposta com métricas de latência.
3. **Por que o ApiDot? (Overview):**
   - Parágrafo enxuto posicionando o produto: um cliente de API auto-hospedado, rápido, focado em privacidade, que roda onde você precisar (nuvem, servidor local ou máquina de desenvolvimento).
4. **Principais Recursos (Features):**
   - 🎯 **Full-featured Request Editor:** Suporte a múltiplos métodos HTTP, JSON formatado e linting, formulários e raw payloads.
   - ⚡ **Lightning Fast Responses:** Métricas precisas de tempo (DNS, TLS, TTFB e transferência total).
   - 🧩 **Smart Variable System:** Variáveis em cascata (Globais, Coleções, Ambientes) com autocomplete `{{...}}`.
   - 🔄 **OpenAPI v3 Sync:** Importação e sincronização com auditoria detalhada de alterações.
   - 💻 **Flexible Execution:** Dispare requisições a partir do servidor central ou da sua máquina local para alcançar redes privadas e `localhost`.
   - 🔗 **Deep Linking:** URLs declarativas por workspace e requisição (`/workspace/:id/request/:id`).
5. **Quick Start (30 segundos):**
   ```bash
   git clone https://github.com/medeiroshudson/ApiDot.git
   cd ApiDot
   docker compose up -d
   ```
   Acesso imediato em `http://localhost:3000`.
6. **Galeria de Capturas de Tela (`<details>` colapsáveis):**
   - Bloco expansível para visualização de Autocomplete, Sincronização OpenAPI, Árvore de Navegação e Configurações Globais.
7. **Desenvolvimento Local:**
   - Comandos simples para rodar frontend e backend em modo dev.
8. **Licença:**
   - Informações da licença MIT.

---

### 4.2. Variável de Versão Unificada (`APIDOT_VERSION`) para Backend e Frontend

Para garantir consistência absoluta entre os componentes sem duplicidade de fontes, adotamos a variável unificada **`APIDOT_VERSION`** com fallback padrão universal para **`"dev"`**:

1. **No Backend (`ApiDot.Server`):**
   - Helper centralizado de versão via `IConfiguration`:
     ```csharp
     public static string GetAppVersion(IConfiguration configuration) =>
         configuration["APIDOT_VERSION"] ?? configuration["AgentRelease:Version"] ?? "dev";
     ```
   - **Healthcheck (`/health`):**
     Atualização do endpoint `/health` em `Program.cs` para expor o campo `version`:
     ```csharp
     app.MapGet("/health", (IConfiguration configuration) => Results.Ok(new
     {
         status = "Healthy",
         version = GetAppVersion(configuration),
         timestamp = DateTime.UtcNow
     }));
     ```
   - **Download do Agent (`InstallScriptEndpoints.cs`):**
     Utiliza `GetAppVersion(configuration)` para determinar a versão dos binários na GitHub Release. Quando a versão for `"dev"`, aponta diretamente para a tag/release `dev`.
   - **Testes de Integração:**
     `InstallScriptEndpointsTests.cs` passa a validar contra a versão padrão `"dev"` ou o valor injetado no teste.

2. **No Frontend (`Next.js 15`):**
   - `frontend/src/lib/version.ts`:
     ```typescript
     export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
     ```
   - `frontend/Dockerfile`:
     ```dockerfile
     ARG NEXT_PUBLIC_APP_VERSION=dev
     ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
     ```
   - Consumido reativamente no `AppHeader.tsx` e `GlobalSettingsModal.tsx`.

3. **No CI/CD (`.github/workflows/release.yml`):**
   - Configuração de gatilhos para incluir commits na branch `dev`:
     ```yaml
     on:
       push:
         tags:
           - 'v*'
         branches:
           - dev
       workflow_dispatch:
         inputs:
           tag_name:
             description: 'Release tag name (e.g. v0.1.0 or dev)'
             required: false
             type: string
     ```
   - Resolução determinística da tag do release:
     ```yaml
     - name: Resolve Release Version
       id: version
       run: |
         if [ "${{ github.event_name }}" = "workflow_dispatch" ] && [ -n "${{ github.event.inputs.tag_name }}" ]; then
           TAG="${{ github.event.inputs.tag_name }}"
         elif [ "${{ github.ref_type }}" = "tag" ]; then
           TAG="${{ github.ref_name }}"
         elif [ "${{ github.ref_name }}" = "dev" ]; then
           TAG="dev"
         else
           TAG="dev"
         fi
         echo "tag=$TAG" >> "$GITHUB_OUTPUT"
     ```
   - Passagem de build-args/envs para os containers da matriz:
     - `server`: `APIDOT_VERSION=${{ steps.version.outputs.tag }}`
     - `web`: `NEXT_PUBLIC_APP_VERSION=${{ steps.version.outputs.tag }}`
   - Na publicação da Release do GitHub, se a tag for `dev`, marca como pre-release ou atualiza o release `dev` existente com os binários do Agent e imagens `:dev` no GHCR.

4. **No `docker-compose.yml` e `docker-compose.dev.yml`:**
   - Declaração transparente com fallback `'dev'`:
     ```yaml
     server:
       environment:
         - APIDOT_VERSION=${APIDOT_VERSION:-dev}
     web:
       environment:
         - NEXT_PUBLIC_APP_VERSION=${APIDOT_VERSION:-dev}
     ```

5. **Tag `dev` no Repositório:**
   - Criação da tag `dev` no Git e envio ao GitHub (`git tag dev && git push origin dev`), servindo como âncora permanente para o fallback de desenvolvimento local.

---

### 4.3. Título Dinâmico do Workspace

1. **`frontend/src/app/layout.tsx`:**
   - Definir `metadata.title` base: `'ApiDot - Test and debug any API, anywhere'`.
2. **Sincronização Reativa com o Workspace Ativo:**
   - No layout do workspace (`app/workspace/[workspaceId]/layout.tsx`), um efeito sincroniza o `document.title`:
   ```typescript
   useEffect(() => {
     if (activeWorkspace?.name) {
       document.title = `ApiDot - ${activeWorkspace.name}`;
     }
   }, [activeWorkspace?.name]);
   ```

---

### 4.4. Sanitização e Captura de Screenshots via Playwright

1. **Script `frontend/playwright/capture-public-screenshots.js`:**
   - Mocking de respostas HTTP com URLs neutras: `https://api.example.com/v1/orders`.
   - Payload JSON simulado contendo dados limpos de demonstração de e-commerce / API REST.
   - Variáveis demonstrativas: `{{baseUrl}}`, `{{apiKey}}`.
2. **Diretório de Armazenamento:**
   - Criação da pasta `docs/assets/screenshots/` e exportação direta das capturas PNG em alta densidade (1440x900 para desktop).

---

### 4.5. Procedimento de Transição de Tags e Limpeza de Releases

1. **Expurgo da Release e Tag `v0.4.0`:**
   - Remoção da Release no GitHub com limpeza da tag remota:
     ```bash
     gh release delete v0.4.0 --cleanup-tag --yes
     ```
   - Remoção da tag Git local:
     ```bash
     git tag -d v0.4.0
     ```
2. **Disparo da nova tag oficial `v0.1.0`:**
   - Após a conclusão e validação de todos os passos de código, testes, capturas de tela e documentação aprovados na branch `main`:
     ```bash
     git tag -a v0.1.0 -m "ApiDot v0.1.0 - Official First Public Release"
     git push origin v0.1.0
     ```

---

## 5. O que fica a cargo do Executor (What's left to the builder)

- Composição exata do layout visual das badges e sintaxe Markdown do `README.md`.
- Ajuste das asserções de testes unitários em `AppHeader.test.tsx` e `GlobalSettingsModal.test.tsx` para cobrir o fallback `'dev'` e valores customizados via variável de ambiente.
- Execução do script Playwright para gravação dos PNGs em `docs/assets/screenshots/`.
