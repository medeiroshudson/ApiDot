# Padronização Visual e Componentes Comuns (Select & MethodBadge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar o desalinhamento de chevrons em seletores dropdown e padronizar os badges de verbos HTTP em formato de cápsula com largura fixa na árvore de requisições, encapsulando componentes reutilizáveis acessíveis em `src/components/common/`.

**Architecture:** Criar dois componentes comuns (`Select` e `MethodBadge`). `Select` encapsula um `<select>` nativo com `appearance-none` e posiciona o ícone `<ChevronDown>` da Lucide perfeitamente centralizado verticalmente via container relativo, preservando 100% de acessibilidade e contratos de teste. `MethodBadge` centraliza o mapeamento de cores dos métodos HTTP e padroniza a largura (`w-[52px]`), altura (`h-5`), tipografia monospace tabular (`font-mono text-[10px] font-semibold`) e centralização de texto. Em seguida, refatorar progressivamente os seletores e badges em `AppHeader`, `RequestEditor`, `CollectionTree`, `RequestAutocomplete`, `DependencyLinkerModal` e `TargetSelector`.

**Tech Stack:** React 19, Next.js 15, Tailwind CSS v3, Lucide React, Vitest, React Testing Library.

**Spec:** `docs/plans/2026-10-30-visual-alignment-and-common-components-design.md`

## Global Constraints

- Preservar acessibilidade nativa e queries semânticas (`getByRole('combobox')`, `role="treeitem"`, etc.).
- Todos os componentes criados devem possuir cobertura de testes unitários com Vitest em `src/components/common/`.
- Manter retrocompatibilidade de constantes exportadas (`HTTP_METHOD_BADGES`, `METHOD_COLORS`) para não quebrar testes ou imports existentes.
- Garantir que todos os 825 testes passem ao final de cada tarefa.

## Review Focus

1. **Seletores nativos acessíveis:** O componente `Select` deve encaminhar `ref` (`forwardRef`), permitir `aria-label`, disparar eventos `onChange` e `onBlur`, e aceitar `<option>` como `children`.
2. **Posicionamento do Chevron:** O ícone `<ChevronDown>` deve conter `pointer-events-none` e estar fixado em `absolute right-2.5 top-1/2 -translate-y-1/2`, de modo que cliques no chevron ativem o select nativo.
3. **Largura Fixa do `MethodBadge`:** O badge deve manter `w-[52px]` e `shrink-0` independentemente do método (`GET` 3 letras, `DELETE` 6 letras ou `OPTIONS` 7 letras), garantindo alinhamento perfeitamente colunar dos nomes das requisições na barra lateral.
4. **Resiliência a métodos desconhecidos/nulos:** `MethodBadge` deve lidar com valores em minúsculas (ex: `get` -> `GET`), nulos/vazios (fallback seguro para `'GET'`) e verbos não padrão (fallback para estilo neutro).
5. **Variantes de Altura do `Select`:** Suporte a `size="sm"` (`h-7.5 py-1.5 text-xs` para headers/toolbars) e `size="md"` (`h-9 text-xs` para a barra principal de URL do RequestEditor).

---

### Task 1: Componente `MethodBadge` e Metadados Centralizados de Métodos HTTP

**Files:**
- Create: `frontend/src/components/common/MethodBadge.tsx`
- Test: `frontend/src/components/common/MethodBadge.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export const HTTP_METHOD_BADGES: Record<string, string>;
  export const METHOD_COLORS: Record<string, string>;
  export interface MethodBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    method?: string | null;
    size?: 'sm' | 'md';
  }
  export function MethodBadge({ method, size, className, ...rest }: MethodBadgeProps): React.JSX.Element;
  ```

- [ ] **Step 1: Write failing tests for `MethodBadge`**

Criar `frontend/src/components/common/MethodBadge.test.tsx` testando:
- Renderização correta com método em maiúsculas (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`).
- Normalização de métodos em minúsculas (ex: `post` renderiza `POST`).
- Fallback para método não especificado (`null` ou `undefined` renderiza `GET`).
- Fallback visual para métodos customizados ou desconhecidos (ex: `CUSTOM` renderiza texto com estilo neutro).
- Aplicação das classes de largura fixa `w-[52px]` e `shrink-0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test frontend/src/components/common/MethodBadge.test.tsx`  
Expected: FAIL (arquivo do componente não encontrado).

- [ ] **Step 3: Implement `MethodBadge.tsx`**

Implementar `frontend/src/components/common/MethodBadge.tsx` com:
- Dicionário `HTTP_METHOD_BADGES` com cores consistentes para `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.
- Export de alias `METHOD_COLORS = HTTP_METHOD_BADGES`.
- Componente `MethodBadge` com `inline-flex items-center justify-center w-[52px] h-5 text-[10px] font-mono font-semibold rounded border uppercase shrink-0 tracking-wide select-none`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test frontend/src/components/common/MethodBadge.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/MethodBadge.tsx frontend/src/components/common/MethodBadge.test.tsx
git commit -m "feat(frontend): create shared MethodBadge component with fixed width and centralized colors"
```

---

### Task 2: Componente `Select` com Chevron Lucide Centralizado

**Files:**
- Create: `frontend/src/components/common/Select.tsx`
- Test: `frontend/src/components/common/Select.test.tsx`

**Interfaces:**
- Produces:
  ```typescript
  export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    sizeVariant?: 'sm' | 'md';
    wrapperClassName?: string;
    iconClassName?: string;
  }
  export const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLSelectElement>>;
  ```

- [ ] **Step 1: Write failing tests for `Select`**

Criar `frontend/src/components/common/Select.test.tsx` testando:
- Renderização do elemento `<select>` com `role="combobox"` e opções.
- Preservação do valor selecionado e disparo do evento `onChange`.
- Encaminhamento correto de `ref` (`forwardRef`).
- Renderização do ícone `<ChevronDown>` com `aria-hidden="true"` e classe `pointer-events-none`.
- Suporte a `sizeVariant="sm"` e `sizeVariant="md"`.
- Desabilitação correta (`disabled`) no select e estilo condicional no chevron.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend test frontend/src/components/common/Select.test.tsx`  
Expected: FAIL (arquivo do componente não encontrado).

- [ ] **Step 3: Implement `Select.tsx`**

Implementar `frontend/src/components/common/Select.tsx` com:
- `forwardRef<HTMLSelectElement, SelectProps>`.
- Container relativo `relative inline-flex items-center`.
- `<select>` com `appearance-none`, `pr-8` (para garantir espaço para o chevron), estilos padrão de foco e borda.
- `<ChevronDown>` posicionado com `absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend test frontend/src/components/common/Select.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Select.tsx frontend/src/components/common/Select.test.tsx
git commit -m "feat(frontend): create Select component with appearance-none and centered ChevronDown"
```

---

### Task 3: Refatorar Seletor de Ambientes no `AppHeader` e `TargetSelector`

**Files:**
- Modify: `frontend/src/components/layout/AppHeader.tsx`
- Modify: `frontend/src/components/request/TargetSelector.tsx`
- Test: `frontend/src/components/layout/AppHeader.test.tsx`
- Test: `frontend/src/components/request/TargetSelector.test.tsx`

**Interfaces:**
- Consumes: `Select` de `src/components/common/Select`.

- [ ] **Step 1: Update `AppHeader.tsx` to use `Select`**

Substituir o elemento `<select>` bruto em `AppHeader.tsx` por `<Select sizeVariant="sm">`, mantendo:
- `value={activeEnvironment ?? ''}`
- `onChange={(e) => onSelectEnvironment?.(e.target.value === '' ? null : e.target.value)}`
- `aria-label="Selecionar ambiente ativo"`
- `className="max-w-[120px] sm:max-w-[200px] truncate ..."`

- [ ] **Step 2: Update `TargetSelector.tsx` to use `Select`**

Substituir o `<select>` bruto em `TargetSelector.tsx` por `<Select sizeVariant="sm">`, garantindo consistência visual.

- [ ] **Step 3: Run existing unit tests**

Run: `npm --prefix frontend test frontend/src/components/layout/AppHeader.test.tsx frontend/src/components/request/TargetSelector.test.tsx`  
Expected: PASS sem quebras de contratos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppHeader.tsx frontend/src/components/request/TargetSelector.tsx
git commit -m "refactor(frontend): use standardized Select in AppHeader and TargetSelector"
```

---

### Task 4: Refatorar Seletor de Métodos HTTP no `RequestEditor`

**Files:**
- Modify: `frontend/src/components/request/RequestEditor.tsx`
- Test: `frontend/src/components/request/RequestEditor.test.tsx`

**Interfaces:**
- Consumes: `Select` de `src/components/common/Select` e `HTTP_METHOD_BADGES` de `src/components/common/MethodBadge`.

- [ ] **Step 1: Update `RequestEditor.tsx` to use `Select` for HTTP method**

Substituir o `<select>` bruto da barra de envio por `<Select sizeVariant="md">`:
- `aria-label="Método HTTP"`
- `value={method}`
- `disabled={isLoading}`
- `onChange={(e) => handleMethodChange(e.target.value)}`
- `className={`font-bold text-xs shrink-0 ${HTTP_METHOD_BADGES[method] || '...'}`}`
- `iconClassName="text-current opacity-70"` (chevron herda a cor do método selecionado com opacidade elegante).

- [ ] **Step 2: Run RequestEditor unit tests**

Run: `npm --prefix frontend test frontend/src/components/request/RequestEditor.test.tsx`  
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/request/RequestEditor.tsx
git commit -m "refactor(frontend): use standardized Select for HTTP method in RequestEditor"
```

---

### Task 5: Refatorar Badges de Verbos em `CollectionTree`, `RequestAutocomplete` e `DependencyLinkerModal`

**Files:**
- Modify: `frontend/src/components/layout/CollectionTree.tsx`
- Modify: `frontend/src/components/request/RequestAutocomplete.tsx`
- Modify: `frontend/src/components/request/DependencyLinkerModal.tsx`
- Test: `frontend/src/components/layout/CollectionTree.test.tsx`
- Test: `frontend/src/components/request/RequestAutocomplete.test.tsx`
- Test: `frontend/src/components/request/DependencyLinkerModal.test.tsx`

**Interfaces:**
- Consumes: `MethodBadge` e `HTTP_METHOD_BADGES` de `src/components/common/MethodBadge`.
- Produces: Re-export de `HTTP_METHOD_BADGES` em `CollectionTree.tsx` e `RequestAutocomplete.tsx` para compatibilidade total.

- [ ] **Step 1: Update `CollectionTree.tsx` to use `MethodBadge`**

- Substituir a tag `<span className="px-1.5 py-0.5 ...">{methodUpper}</span>` na linha ~622 por `<MethodBadge method={req.method} />`.
- Atualizar a definição de `HTTP_METHOD_BADGES` em `CollectionTree.tsx` para re-exportar a partir de `@/components/common/MethodBadge`.

- [ ] **Step 2: Update `RequestAutocomplete.tsx` to use `MethodBadge`**

- Substituir a tag `<span>` de badge na linha ~660 por `<MethodBadge method={item.method} />`.
- Re-exportar `HTTP_METHOD_BADGES` e `METHOD_COLORS` a partir de `@/components/common/MethodBadge`.

- [ ] **Step 3: Update `DependencyLinkerModal.tsx` to use `MethodBadge`**

- Substituir a tag `<span>` de badge na linha ~503 por `<MethodBadge method={req.method} />`.

- [ ] **Step 4: Run all affected tests and full suite**

Run: `npm --prefix frontend test`  
Expected: PASS em todos os 47+ arquivos de teste (825+ testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/CollectionTree.tsx \
         frontend/src/components/request/RequestAutocomplete.tsx \
         frontend/src/components/request/DependencyLinkerModal.tsx
git commit -m "refactor(frontend): unify HTTP method badges across CollectionTree, Autocomplete, and Modals"
```

---

### Task 6: Validação Visual Final e Teste de Regressão

**Files:**
- Test: Full Vitest suite

- [ ] **Step 1: Run full test suite and build validation**

Run:
```bash
npm --prefix frontend test
npm --prefix frontend run build
```
Expected: Build bem-sucedido e todos os testes passando.

- [ ] **Step 2: Capture screenshot comparison if needed / final verification**

Verificar no dev server / testes se a árvore lateral exibe as cápsulas perfeitamente alinhadas em coluna e os seletores com chevrons centralizados.
