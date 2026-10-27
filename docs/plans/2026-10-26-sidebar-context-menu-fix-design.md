# Design Doc: Correção Definitiva do Menu de Contexto da Sidebar

## 1. Intenção e Motivação
Em determinados pontos da barra lateral do ApiDot (abaixo de itens, no padding, entre itens ou em estados de lista vazia), cliques com o botão direito não abrem o menu de contexto do ApiDot e vazam para o menu nativo do navegador (Google Chrome). O objetivo é interceptar 100% dos cliques na barra lateral de forma definitiva e consistente, delegando cliques em áreas livres para o menu geral de criação (`Nova Coleção`, `Importar OpenAPI`, `Recarregar Árvore`), enquanto preserva o menu nativo do Chrome estritamente sobre o campo de busca textual.

## 2. Metas, Não-Metas e Anti-Metas
- **Metas:**
  - Garantir que qualquer clique com o botão direito dentro do container da barra lateral (`CollectionTree`) abra o menu de contexto apropriado do ApiDot sem invocar o menu nativo do Chrome.
  - Manter o menu nativo do navegador ativo especificamente quando o clique ocorrer dentro do `<input>` de busca de texto.
  - Manter os menus contextuais específicos para nós existentes (`collection`, `folder`, `request`).
  - Corrigir a expansão vertical da área vazia (`role="tree"` com `flex flex-col` e `flex-1`) para que todo o espaço livre abaixo dos itens responda ao menu de área vazia.
- **Não-Metas:**
  - Alterar o design visual ou os itens dos menus de contexto já homologados.
  - Adicionar menus de contexto fora da barra lateral (ex: no editor central ou no visualizador de resposta).
- **Anti-Metas:**
  - Não bloquear o menu nativo do navegador em campos de texto onde o usuário precisa de recortar/copiar/colar/inspecionar ortografia.
  - Não espalhar handlers pontuais de `onContextMenu` em dezenas de sub-elementos que possam ser esquecidos em manutenções futuras.

## 3. Restrições
- Não quebrar nenhum dos 352 testes automatizados existentes no frontend.
- O componente `ContextMenu` já existente deve continuar sendo a fonte da verdade para renderização dos menus flutuantes.

## 4. Abordagens Consideradas
1. **Delegação no Container Raiz (`collection-tree-container`) com Exceção para Inputs (Escolhida):**
   - Um manipulador `onContextMenu` no container raiz captura eventos não interceptados por nós específicos da árvore via borbulhamento (bubbling).
   - Ignora elementos onde `e.target` for uma tag `input` (ou dentro de um input), permitindo o comportamento nativo do navegador.
   - Ajusta o container `role="tree"` para `flex flex-col` com `flex-1` para que o espaço abaixo dos itens preencha a altura total sem lacunas.
   - *Por que foi escolhida:* Elimina todos os pontos cegos estruturalmente sem necessidade de caçar e cobrir manualmente cada tag interna.
2. **Interceptação Global no `<aside>` (`page.tsx`):**
   - Cobriria a margem mais externa do layout no desktop, mas criaria acoplamento desnecessário entre o layout da página e a lógica interna do `CollectionTree`, além de exigir duplicação para o `MobileDrawer`.
3. **Correção Pontual por Elemento e Ajuste de CSS:**
   - Adicionaria handlers manuais em cada div órfã. Rejeitada por fragilidade: novos elementos ou espaçamentos adicionados futuramente voltariam a vazar o menu nativo do navegador.

## 5. Decisões de Implementação
- **Container Raiz:** Adicionar `onContextMenu={handleRootContextMenu}` no elemento raiz de `CollectionTree.tsx` (`data-testid="collection-tree-container"`).
- **Tratamento de Exceção:** No `handleRootContextMenu`:
  - Se `(e.target as HTMLElement).closest('input')` for verdadeiro, retorna sem chamar `preventDefault()`.
  - Caso contrário, chama `e.preventDefault()`, fecha eventuais menus abertos de `+ Novo` e abre o menu de contexto do tipo `'empty'` na posição `{ x: e.clientX, y: e.clientY }`.
- **Nós Específicos:** Os nós de requisição, pasta e coleção continuam chamando `e.stopPropagation()` e `e.preventDefault()` no seu `handleContextMenu(e, type, item)`, garantindo que o menu específico do nó tenha precedência sobre o menu raiz.
- **Layout Vertical:** Adicionar `flex flex-col` ao `role="tree"` para que `collection-tree-empty-area` com `flex-1` preencha efetivamente toda a altura residual da árvore até a base da tela.
- **Testes Unitários:** Adicionar testes em `CollectionTree.test.tsx` cobrindo:
  - Clique direito em área residual / container dispara o menu de contexto `empty`.
  - Clique direito no campo de busca não previne o evento nativo (não abre o menu customizado).
