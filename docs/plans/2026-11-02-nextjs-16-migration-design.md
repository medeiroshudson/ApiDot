# Design Doc: Migração do Frontend para Next.js 16.4 e React 19.3

## 1. Contexto e Motivação
O frontend do ApiDot opera atualmente em Next.js 15.2 com React 19.0.0. A aplicação foi construída com foco em interatividade no cliente (SPA/desktop-like), consumindo a API ASP.NET Core via rotas reescritas (`rewrites`) e WebSocket no endpoint do backend.
O Next.js 16.4 traz maturidade ao Turbopack (agora padrão e estável para dev e build), suporte oficial ao React Compiler estável (eliminando overhead de re-renderizações manuais) e alinhamento com o React 19.3 (com suporte estável a View Transitions e otimizações de runtime).

A migração atualiza o ecossistema frontend para as versões estáveis mais recentes, reduzindo tempos de build, acelerando o ciclo de desenvolvimento local (Fast Refresh) e otimizando a responsividade da interface de usuário sem quebrar os 935 testes unitários existentes e a compilação standalone em container Docker.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos (Goals)
1. **Atualização de Versões do Core:**
   - Atualizar `next` para `16.4.4` (ou última estável `16.4.x`).
   - Atualizar `react` e `react-dom` para `19.3.1` (com `@types/react` e `@types/react-dom` em `19.3.0`).
2. **Ativação do React Compiler Estável:**
   - Adicionar `babel-plugin-react-compiler@1.0.0` como dependência de desenvolvimento.
   - Habilitar `reactCompiler: true` em `frontend/next.config.ts`.
3. **Adoção do Turbopack Estável:**
   - Manter compilação de desenvolvimento (`npm run dev`) e produção (`npm run build`) utilizando o Turbopack por padrão.
4. **Preservação de Suíte de Testes e Build Standalone:**
   - Garantir 100% de sucesso nos 935 testes do Vitest (`npm test`).
   - Garantir que o build standalone (`output: 'standalone'`) continue gerando os artefatos esperados para o `Dockerfile` de produção.

### Não-Objetivos (Non-Goals)
1. **Reestruturação para React Server Components (RSC):**
   - Não converter as páginas do workspace, árvore ou editor para Server Components com streaming/fetch no servidor. As rotas continuam sob `'use client'`, preservando o ecossistema Zustand e mutações síncronas.
2. **Adoção de Cache Components (`'use cache'`):**
   - Não adotar primitivas de cache de servidor desnecessárias para uma ferramenta interativa autenticada.
3. **Flags Experimentais de Risco:**
   - Não ativar flags que quebrem compatibilidade no ambiente Alpine Linux (`musl`), como o compilador React em Rust ainda experimental (`turbopackRustReactCompiler`).

### Anti-Objetivos (Anti-Goals)
1. **Regressão na DX ou Suites de Testes:** Não aceitar supressão ou desativação de testes existentes para contornar warnings de tipos ou render.
2. **Introdução de Dependências Desnecessárias:** Não instalar bibliotecas pesadas de terceiros fora do pacote do React Compiler.

---

## 3. Restrições e Compatibilidade
- **Node.js:** A aplicação roda em Node 22 (suportado pelo Next.js 16, cujo mínimo é Node 20.9+).
- **TypeScript:** A versão configurada é `5.7.3` (Next.js 16 exige TypeScript 5.1+).
- **Async Route Params:** Next.js 16 reforça o acesso assíncrono aos parâmetros de rotas (`params`). O ApiDot já utiliza o padrão `React.use(params)` em `WorkspacePage` e `RequestPage`, suportando tanto Promises quanto objetos diretos.
- **Docker Standalone:** O `Dockerfile` copia `.next/standalone` e `.next/static`. O Turbopack no Next.js 16.4 suporta plenamente o target standalone.

---

## 4. Abordagens Consideradas

### Abordagem 1: Migração Estável & Otimizada (Escolhida pelo Usuário)
- Atualiza `next` para 16.4.4, `react` e `react-dom` para 19.3.1.
- Habilita o React Compiler estável via `babel-plugin-react-compiler`.
- Turbopack padrão sem flags experimentais arriscadas.
- Validação total de testes unitários e build Docker standalone.
- **Motivo da Escolha:** Oferece o ganho real de velocidade e render sem introduzir instabilidades no pipeline CI/CD ou no container Alpine.

### Abordagem 2: Migração com Flags Experimentais
- Inclui flags como `turbopackRustReactCompiler`, `turbopackGc` e `turbopackFileSystemCacheForDev`.
- **Descartada:** Flags experimentais em Rust podem falhar no build Alpine Linux (`musl`) e não trazem benefício crítico imediato.

### Abordagem 3: Bump Conservador (Sem React Compiler)
- Apenas atualiza a versão do Next.js sem ativar o compilador.
- **Descartada:** Perde a principal otimização de runtime da versão (eliminação de renders na árvore e nos editores sem espalhar `useMemo`/`useCallback`).

---

## 5. Plano Detalhado de Implementação

### 5.1 Dependências em `frontend/package.json`
- `dependencies`:
  - `next`: `^16.4.4`
  - `react`: `^19.3.1`
  - `react-dom`: `^19.3.1`
- `devDependencies`:
  - `@types/react`: `^19.3.0`
  - `@types/react-dom`: `^19.3.0`
  - `babel-plugin-react-compiler`: `^1.0.0`

### 5.2 Configuração em `frontend/next.config.ts`
Adicionar a chave `reactCompiler: true`:
```ts
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/api/:path*`,
      },
      {
        source: '/signin-oidc',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/signin-oidc`,
      },
      {
        source: '/install.sh',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/install.sh`,
      },
      {
        source: '/install.ps1',
        destination: `${process.env.API_BASE_URL || 'http://127.0.0.1:5000'}/install.ps1`,
      },
    ];
  },
};
```

### 5.3 Verificação de Compatibilidade com Vitest e React 19.3
- Executar `npm test` para certificar que os 52 arquivos de teste (935 testes) passam sem quebras.
- Caso o React 19.3 reporte avisos de act(...) em novos ciclos de microtasks, inspecionar e assegurar conformidade.

### 5.4 Verificação de Build de Produção
- Rodar `npm run build` na pasta `frontend/`.
- Validar se o output standalone `.next/standalone/` e `.next/static/` são emitidos corretamente pelo Turbopack.

---

## 6. O que fica a cargo do Executor (Builder)
- Resolução de eventuais avisos de peer dependencies durante o `npm install`.
- Verificação se o script `package.json` de build necessita de ajustes ou flags adicionais.
- Execução dos testes e verificação da saída de compilação.
