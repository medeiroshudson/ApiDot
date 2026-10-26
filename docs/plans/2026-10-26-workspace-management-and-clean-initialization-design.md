# Design Técnico: Gestão de Workspaces e Inicialização 100% Limpa no ApiDot

**Data:** 2026-10-26  
**Status:** Aguardando Aprovação  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Frontend (Next.js 15 / Tailwind CSS) e Backend (.NET 9 Minimal APIs / EF Core)

---

## 1. Intenção e Motivação (The Why)

O ApiDot ainda mantinha resquícios de IDs e árvores fictícias no frontend (`DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'` e coleções mockadas como "Coleção Padrão" e "Minha API") e no backend (`Program.DefaultWorkspaceId`). Além disso, não existia na interface nenhum seletor visual para alternar ou criar novos workspaces.

O objetivo deste ajuste é:
1. Eliminar 100% dos mocks e valores hardcoded para que o sistema reflita com fidelidade estrita o estado real do banco de dados.
2. Iniciar a aplicação totalmente limpa caso o banco de dados esteja zerado.
3. Disponibilizar um seletor e criador de workspaces no topo da barra lateral esquerda (acima da árvore de coleções).

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Eliminação Completa de Dados Falsos:** Remover o GUID `00000000-0000-0000-0000-000000000001` e os nomes "Default Workspace", "Coleção Padrão" e "Minha API" de todas as constantes de produção do frontend e do backend.
- **Seletor de Workspaces na Sidebar (`WorkspaceSwitcher`):**
  - Posicionado no topo da sidebar esquerda, exibindo o workspace ativo, ícone e chevron.
  - Ao clicar, abre dropdown com a lista de workspaces cadastrados no banco de dados e a opção `Novo Workspace` (com ícone, sem sinal "+" no texto).
- **Modal de Criação (`WorkspaceModal`):**
  - Modal acessível solicitando o nome do workspace (com foco automático, validação não-vazia e confirmação via `Enter` / fechamento via `Esc`).
  - Ao salvar, envia `POST /api/workspaces`, atualiza a lista de workspaces e define o novo workspace como ativo.
- **Estado Zerado (Empty State Convidativo):**
  - Se `GET /api/workspaces` retornar `[]`, a sidebar exibe: *"Nenhum workspace cadastrado"* acompanhado do botão `Criar Workspace` (com ícone, sem "+" no texto).
- **Persistência de Seleção:** Salvar o ID do workspace ativo no `localStorage` do navegador para manter a navegação ao recarregar a página.

### 2.2. Não-Metas (Non-Goals)
- Exclusão ou renomeação avançada de workspaces neste momento (foco na seleção e criação).
- Multi-tenancy ou permissões RBAC por workspace.

### 2.3. Anti-Metas (Anti-Goals)
- Não utilizar `<select>` HTML nativo genérico que destoe dos componentes escuros da sidebar.
- Não carregar coleções mockadas como fallback enquanto o banco estiver vazio.

---

## 3. Abordagens Consideradas

### Abordagem 1: Workspace Switcher Customizado + Modal de Criação (Escolhida)
- Dropdown integrado ao topo da sidebar com estilo consistente ao `ContextMenu`, exibindo lista de workspaces e botão `+ Novo Workspace` abrindo modal dedicado.
- Trata o estado de banco vazio com layout amigável para primeiro uso.
- **Decisão:** Escolhida pelo usuário.

### Abordagem 2: `<select>` Nativo com Criação Inline (Descartada)
- Campo `<select>` HTML básico com opção inline. Descartada por ter menor polimento visual e pouca flexibilidade para o fluxo de boas-vindas.

---

## 4. Mudanças no Backend (.NET 9 / EF Core)

1. Remover a constante `Program.DefaultWorkspaceId` e qualquer referência a ela em `Program.cs`.
2. Assegurar que `GET /api/workspaces` retorne `200 OK` com `[]` caso não haja registros.
3. `POST /api/workspaces` valida nome (não-nulo, não-vazio, máx 200 caracteres) e persiste novo `Workspace`.
4. Atualizar os testes do backend para validar que o banco inicia vazio e que novos workspaces são criados via `POST /api/workspaces`.

---

## 5. Mudanças no Frontend (Next.js 15)

1. **`WorkspaceSwitcher.tsx` (`frontend/src/components/layout/WorkspaceSwitcher.tsx`):**
   - Recebe `workspaces: WorkspaceDto[]`, `activeWorkspaceId: string | null`, `onSelectWorkspace: (id: string) => void`, `onCreateWorkspaceClick: () => void`.
   - Renderiza botão elegante no topo da sidebar com chevron. Ao abrir, lista as opções e o botão `+ Novo Workspace`.
2. **`WorkspaceModal.tsx` (`frontend/src/components/workspace/WorkspaceModal.tsx`):**
   - Modal com `input` para nome, botão cancelar e botão criar.
3. **`useCollectionTree.ts` & `treeApi.ts`:**
   - Remover `DEFAULT_WORKSPACE_TREE` com coleções mockadas.
   - O hook aceita `workspaceId: string | null`. Se `null` ou vazio, retorna `tree: null` e `isLoading: false` imediatamente sem disparar fetch para IDs inexistentes.
4. **`page.tsx`:**
   - Carrega a lista real de workspaces de `GET /api/workspaces`.
   - Se houver workspaces, seleciona o salvo no `localStorage` ou o primeiro da lista.
   - Se não houver nenhum, define `activeWorkspaceId: null` e renderiza o estado vazio convidativo no topo da sidebar.
   - Integra `WorkspaceSwitcher` e `WorkspaceModal`.
