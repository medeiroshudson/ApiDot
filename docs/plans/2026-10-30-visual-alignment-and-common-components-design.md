# Documento de Design Técnico: Padronização Visual e Componentes Comuns (Select & MethodBadge)

**Data:** 2026-10-30  
**Status:** Proposto (Aguardando Aprovação)  
**Autor:** Hudson Medeiros / Agente  
**Contexto:** Correção de alinhamento visual dos chevrons e badges de métodos HTTP no ApiDot.

---

## 1. Intenção e Diagnóstico

### 1.1. Problemas Identificados
1. **Seletor de Ambientes (`AppHeader.tsx`):** Utiliza `<select>` nativo sem `appearance-none`. No Safari/WebKit e Chrome (macOS), o chevron nativo do sistema operacional possui métricas rígidas de baseline e padding interno, ficando deslocado verticalmente para baixo e quebrando o alinhamento com os botões e textos adjacentes do cabeçalho.
2. **Seletor de Verbo HTTP (`RequestEditor.tsx`):** Também utiliza `<select>` nativo em um container de altura fixa `h-9`. O chevron nativo do SO fica achatado e desalinhado em relação ao texto em caixa alta `GET`/`POST`.
3. **Indicador do Verbo na Árvore de Requisições (`CollectionTree.tsx`):** 
   - Largura variável: `GET` ocupa ~28px enquanto `DELETE` ocupa ~48px. Isso causa um efeito desagradável de zigue-zague no início dos nomes/caminhos das requisições na barra lateral.
   - Desalinhamento vertical sutil entre o texto mono `text-[10px]` do badge e o texto `text-xs` da rota.
   - Cores e estilização de badges dispersas e duplicadas em 4 arquivos distintos (`CollectionTree.tsx`, `RequestAutocomplete.tsx`, `DependencyLinkerModal.tsx`, `RequestEditor.tsx`).

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos
- Criar componentes comuns reutilizáveis em `src/components/common/`:
  - `Select.tsx`: select nativo acessível encapsulado com `appearance-none` e chevron Lucide (`ChevronDown`) perfeitamente centralizado via CSS relativo/absoluto.
  - `MethodBadge.tsx`: cápsula padronizada com largura fixa (`w-[52px]`), altura equilibrada (`h-5`), tipografia monospace tabular (`font-mono text-[10px] font-semibold`) e texto centralizado (`inline-flex items-center justify-center`).
- Centralizar o mapeamento de cores e tokens dos verbos HTTP em uma única fonte de verdade (`src/components/common/MethodBadge.tsx` ou `src/lib/httpMethods.ts`), mantendo retrocompatibilidade total com as constantes exportadas para testes existentes (`HTTP_METHOD_BADGES`, `METHOD_COLORS`).
- Manter 100% de compatibilidade com os 825 testes do Vitest, em especial queries de acessibilidade `getByRole('combobox')` e eventos `fireEvent.change`.

### Não-Objetivos
- Não transformar o `Select` em uma listbox customizada em JavaScript (tipo popover/dropdown flutuante de `div`), preservando o menu nativo e acessibilidade de formulário do navegador.
- Não alterar as rotas, o layout do editor ou a lógica de negócio dos seletores.

### Anti-Objetivos
- Quebrar testes unitários existentes que esperam `HTMLSelectElement` e seus atributos.
- Introduzir bibliotecas externas desnecessárias (ex.: Radix, HeadlessUI).

---

## 3. Abordagens Consideradas

| Abordagem | Vantagens | Desvantagens | Decisão |
| :--- | :--- | :--- | :--- |
| **Abordagem 1: `Select` Nativo Encapsulado + `MethodBadge` Centralizado** | Alinhamento milimétrico com Lucide `ChevronDown`; 100% acessível e compatível com testes; zero overhead de dependências; responsive por padrão. | Dropdown aberto é renderizado pelo SO. | **Aprovada pelo usuário** |
| **Abordagem 2: Listbox 100% Customizada (React State / Popover)** | Estilização total do menu suspenso aberto. | Quebra testes existentes com `select.options` / `getByRole('combobox')`; perde seletor nativo mobile. | Rejeitada |
| **Abordagem 3: Patches CSS Isolados nos Componentes Atuais** | Poucos arquivos tocados. | Mantém código duplicado em 4 arquivos e viola padronização do design system. | Rejeitada |

---

## 4. Especificação Técnica dos Componentes

### 4.1. `src/components/common/Select.tsx`
Componente polimórfico ou encapsulado baseado em `forwardRef<HTMLSelectElement, SelectProps>`:
- **Props:**
  - `size?: 'sm' | 'md'` (default: `'sm'`, onde `sm` usa `h-7.5 py-1.5 text-xs` e `md` usa `h-9 text-xs`).
  - `variant?: 'default' | 'method'` (permite herdar cores customizadas para o seletor de verbo HTTP).
  - `iconColor?: string` (cor personalizada para o `<ChevronDown>` quando o fundo for colorido).
  - Herda todas as propriedades nativas de `React.SelectHTMLAttributes<HTMLSelectElement>`.
- **Estrutura DOM:**
  ```tsx
  <div className={`relative inline-flex items-center ${wrapperClassName}`}>
    <select
      ref={ref}
      className={`appearance-none bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-md pl-2.5 pr-8 focus:outline-none focus:ring-1 ... ${className}`}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 ${iconClassName}`}
      aria-hidden="true"
    />
  </div>
  ```

### 4.2. `src/components/common/MethodBadge.tsx`
Componente dedicado para renderização de verbos HTTP:
- **Props:**
  - `method: string`: método HTTP (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS`, etc.).
  - `className?: string`: extensões de classe opcionais.
  - `size?: 'sm' | 'md'` (default: `'sm'`, largura fixa `w-[52px]` e altura `h-5` para árvore lateral e listas de busca).
- **Cores & Tokens:**
  - `GET`: `text-emerald-400 bg-emerald-950/60 border-emerald-800/80`
  - `POST`: `text-blue-400 bg-blue-950/60 border-blue-800/80`
  - `PUT`: `text-amber-400 bg-amber-950/60 border-amber-800/80`
  - `PATCH`: `text-purple-400 bg-purple-950/60 border-purple-800/80`
  - `DELETE`: `text-rose-400 bg-rose-950/60 border-rose-800/80`
  - `HEAD`: `text-neutral-400 bg-neutral-900 border-neutral-700`
  - `OPTIONS`: `text-cyan-400 bg-cyan-950/60 border-cyan-800/80`
  - Fallback / Desconhecido: `text-neutral-400 bg-neutral-900 border-neutral-700`
- **Estrutura DOM:**
  ```tsx
  <span
    className={`inline-flex items-center justify-center w-[52px] h-5 text-[10px] font-mono font-semibold rounded border uppercase shrink-0 tracking-wide select-none ${methodStyles} ${className}`}
  >
    {normalizedMethod}
  </span>
  ```

---

## 5. Locais de Refatoração

1. **`AppHeader.tsx`:** Substituir o `<select>` de ambiente cru pelo `<Select size="sm">`.
2. **`RequestEditor.tsx`:** Substituir o `<select>` de verbo HTTP cru pelo `<Select size="md" variant="method">`.
3. **`CollectionTree.tsx`:** Substituir o `<span>` ad-hoc da árvore pelo `<MethodBadge method={req.method} />`.
4. **`RequestAutocomplete.tsx`:** Substituir o `<span>` de itens de requisição pelo `<MethodBadge method={item.method} />`.
5. **`DependencyLinkerModal.tsx`:** Substituir o `<span>` dos itens da lista pelo `<MethodBadge method={req.method} />`.
6. **`TargetSelector.tsx` (Opcional/Bônus de consistência):** Substituir o `<select>` de target pelo `<Select size="sm">` para garantir chevron alinhado em todos os seletores da aplicação.

---

## 6. Estratégia de Testes e Validação
- Testes unitários para `Select.test.tsx` (renderização, acessibilidade, classes, encaminhamento de ref e disparos de eventos).
- Testes unitários para `MethodBadge.test.tsx` (renderização dos métodos, normalização para uppercase, fallbacks e largura fixa `w-[52px]`).
- Execução da suíte completa de testes (`npm --prefix frontend test`) para garantir que os 825 testes continuam passando.
