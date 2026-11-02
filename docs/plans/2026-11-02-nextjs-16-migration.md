# Migração do Frontend para Next.js 16.4 e React 19.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar o frontend do ApiDot para Next.js 16.4 e React 19.3 com Turbopack estável e React Compiler habilitado, garantindo 100% de passagem nos 935 testes automatizados e build standalone do Docker em Node 22 Alpine funcional.

**Architecture:** Atualização pontual do ecossistema de dependências em `frontend/package.json`, ativação declarativa de `reactCompiler: true` em `frontend/next.config.ts`, validação da suíte Vitest com os renderizadores do React 19.3 e certificação do artefato standalone gerado pelo Turbopack.

**Tech Stack:** Next.js 16.4.4, React 19.3.1, React-DOM 19.3.1, babel-plugin-react-compiler 1.0.0, Vitest 3.0.5, TypeScript 5.7.3.

**Spec:** docs/plans/2026-11-02-nextjs-16-migration-design.md

## Global Constraints

- O runtime mínimo obrigatório é Node.js 20.9+ (ApiDot opera em Node 22).
- TypeScript permanece na versão 5.7.3 com verificação estrita (`strict: true`).
- A aplicação permanece como Client-Side SPA nas rotas de workspace sob Zustand; nenhuma rota deve ser convertida para Server Component ou introduzir flags experimentais como `turbopackRustReactCompiler`.
- O build de produção deve gerar obrigatoriamente a estrutura `output: 'standalone'` consumida pelo `Dockerfile`.
- Todos os 935 testes existentes em `npm test` devem passar sem remoção ou supressão de testes.

## Review Focus

1. Incompatibilidade de peer dependencies com React 19.3: `@testing-library/react` ou `@uiw/react-codemirror` apresentando avisos ou falhas de resolução durante `npm install`.
2. Emissão do artefato standalone pelo Turbopack: garantir que `.next/standalone/server.js` e `.next/static` existam após `npm run build`.
3. Comportamento assíncrono de route params: garantir que `WorkspaceLayout`, `WorkspacePage` e `RequestPage` continuem desembrulhando `params` sem warnings de acesso síncrono.
4. Avisos de `act(...)` no Vitest: certificar que atualizações de estado do React 19.3 não quebrem asserções assíncronas nos testes do frontend.
5. Preservação de rewrites e variáveis de ambiente em `next.config.ts` no ambiente de desenvolvimento e produção.

---

### Task 1: Atualizar Dependências do Next.js, React e React Compiler

**Files:**
- Modify: `frontend/package.json:13-38`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes: `docs/plans/2026-11-02-nextjs-16-migration-design.md` (seções 2 e 5.1).
- Produces: `package.json` e `package-lock.json` atualizados com `next@^16.4.4`, `react@^19.3.1`, `react-dom@^19.3.1`, `@types/react@^19.3.0`, `@types/react-dom@^19.3.0` e `babel-plugin-react-compiler@^1.0.0`.

- [ ] **Step 1: Atualizar dependências em `frontend/package.json`**

Editar `frontend/package.json` com as seguintes versões exatas:
```json
  "dependencies": {
    "@codemirror/commands": "^6.11.1",
    "@codemirror/lang-json": "^6.0.2",
    "@codemirror/lint": "^6.9.7",
    "@uiw/react-codemirror": "^4.25.12",
    "lucide-react": "^1.16.0",
    "next": "^16.4.4",
    "react": "^19.3.1",
    "react-dom": "^19.3.1",
    "zustand": "^5.0.16"
  },
  "devDependencies": {
    "@playwright/test": "^1.64.1",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.13.1",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "babel-plugin-react-compiler": "^1.0.0",
    "jsdom": "^26.0.0",
    "postcss": "^8.5.2",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
```

- [ ] **Step 2: Instalar as novas dependências e regenerar lockfile**

Executar no diretório `frontend`:
```bash
npm install
```
Expected output: Resolução bem-sucedida de pacotes e atualização de `package-lock.json` sem falhas de integridade.

- [ ] **Step 3: Verificar versões instaladas no `node_modules`**

Executar no diretório `frontend`:
```bash
npm list next react react-dom babel-plugin-react-compiler
```
Expected output: Árvore exibindo `next@16.4.4`, `react@19.3.1`, `react-dom@19.3.1` e `babel-plugin-react-compiler@1.0.0`.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): upgrade to next 16.4.4, react 19.3.1 and babel-plugin-react-compiler"
```

---

### Task 2: Habilitar React Compiler em `frontend/next.config.ts`

**Files:**
- Modify: `frontend/next.config.ts:40-64`

**Interfaces:**
- Consumes: `babel-plugin-react-compiler` instalado na Task 1.
- Produces: `next.config.ts` com `reactCompiler: true`.

- [ ] **Step 1: Adicionar `reactCompiler: true` na configuração do Next.js**

Editar `frontend/next.config.ts` para incluir a diretiva estável do React Compiler:
```typescript
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

- [ ] **Step 2: Executar validação de tipagem TypeScript**

Executar no diretório `frontend`:
```bash
npx tsc --noEmit
```
Expected output: Sem erros de tipagem (`Exit code 0`).

- [ ] **Step 3: Commit**

```bash
git add frontend/next.config.ts
git commit -m "feat(frontend): enable react compiler in next.config.ts"
```

---

### Task 3: Validar a Suíte Completa de Testes no Vitest

**Files:**
- Test: `frontend/vitest.config.ts`
- Test: `frontend/src/**/*.test.ts`
- Test: `frontend/src/**/*.test.tsx`

**Interfaces:**
- Consumes: Dependências e configurações das Tasks 1 e 2.
- Produces: Relatório de execução dos 52 arquivos de teste unitários e de integração.

- [ ] **Step 1: Executar a suíte de testes com Vitest**

Executar no diretório `frontend`:
```bash
npm test
```
Expected output: `52 passed (52)`, `935 passed (935)`.

- [ ] **Step 2: Investigar e ajustar eventuais divergências**

Se algum teste unitário apresentar regressão devido a mudanças sutis em `react-dom/test-utils` ou no comportamento de timing do React 19.3, ajustar pontualmente o teste ou encapsulamento de `act(...)` correspondente sem alterar a regra de negócio.

- [ ] **Step 3: Commit (se houver ajustes)**

```bash
git add frontend/src/
git commit -m "test(frontend): ensure full test suite passes on react 19.3"
```

---

### Task 4: Validar Build Standalone com Turbopack e Dockerfile

**Files:**
- Modify (se necessário): `frontend/Dockerfile`
- Test: `frontend/src/app/`

**Interfaces:**
- Consumes: Configuração `output: 'standalone'` e `reactCompiler: true`.
- Produces: Diretório `.next/standalone` e `.next/static`.

- [ ] **Step 1: Executar build de produção do Next.js**

Executar no diretório `frontend`:
```bash
npm run build
```
Expected output:
- Compilação realizada com sucesso pelo Turbopack (`▲ Next.js 16 (Turbopack)`).
- Geração da saída `.next/standalone/server.js` e `.next/static`.

- [ ] **Step 2: Validar a existência dos artefatos do build standalone**

Executar no diretório `frontend`:
```bash
test -f .next/standalone/server.js && test -d .next/static && echo "Standalone build OK"
```
Expected output: `"Standalone build OK"`.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore(frontend): validate nextjs 16 standalone production build"
```
