# Design Técnico: Gestão de Coleções, Pastas e Requisições no ApiDot

**Data:** 2026-10-26  
**Status:** Aprovado para Planejamento  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Backend (.NET 9 Minimal APIs / EF Core) e Frontend (Next.js 15 / Tailwind CSS / React)

---

## 1. Intenção e Motivação (The Why)

Atualmente, o ApiDot executa requisições avulsas com resolução de variáveis e permite sincronização de OpenAPI por coleção, mas o usuário final não possui autonomia na interface para:
1. Criar novas coleções e organizar projetos.
2. Criar e aninhar pastas hierarquicamente para estruturar fluxos de API.
3. Criar, salvar, carregar, renomear e excluir requisições vinculadas a coleções ou pastas.

Sem essas funcionalidades de gestão, o sistema opera apenas como um executor isolado, incapaz de funcionar como um cliente de API completo no dia a dia. Este documento especifica a arquitetura e os fluxos completos para cadastro e gestão persistente de Coleções, Pastas e Requisições.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Árvore Hierárquica Completa:** Visualização em árvore na sidebar contendo Coleções -> Pastas (com suporte a aninhamento recursivo) -> Requisições HTTP.
- **Botão Superior Unificado "+ Novo":** Botão minimalista na toolbar da sidebar (sem chevron) abrindo menu dropdown com opções padronizadas (`🗂️ Nova Coleção`, `📁 Nova Pasta`, `📄 Nova Requisição`, `📥 Importar OpenAPI`).
- **Menus de Contexto (Right-Click):**
  - Clique com botão direito sobre Coleção, Pasta e Requisição abre menu com ações específicas do nó (Criar filho, Renomear, Duplicar requisição, Excluir, Sincronizar OpenAPI).
  - Clique com botão direito na área vazia da sidebar abre menu de ações gerais (Nova Coleção, Importar OpenAPI, Recarregar Árvore).
- **Edição Inline Ágil:** Criação e renomeação de itens diretamente no nó da árvore com foco imediato no campo de texto, confirmação com `Enter` e cancelamento com `Esc`.
- **Persistência Completa no Backend:** Endpoints REST CRUD atômicos para Coleções, Pastas e Requisições, além de um endpoint unificado de árvore `GET /api/workspaces/{id}/tree`.
- **Integração com RequestEditor & Fluxo "Salvar Como":**
  - Ao clicar em uma requisição salva na árvore, carregar seus dados no editor. Alterações no método, URL, headers, body ou target habilitam o botão **Salvar** e o atalho `Ctrl+S` / `Cmd+S`, com indicador visual de estado modificado (dirty).
  - Ao pressionar `Ctrl+S` ou clicar em "Salvar" em uma requisição avulsa (scratchpad / sem ID na árvore), abrir o modal **"Salvar Como"** solicitando Nome, Coleção e Pasta de destino.
- **Duplicação de Requisições:** Ação de duplicar requisição individual (`POST /api/requests/{id}/duplicate` ou via frontend com sufixo ` (Copy)`) criando cópia imediata na mesma pasta/coleção.
- **Garantia de Workspace Padrão:** O backend inicializa de forma idempotente um `Workspace` padrão caso a base SQLite esteja vazia, garantindo integridade referencial sem exigir complexidade de gerenciador de workspaces na interface neste momento.

### 2.2. Não-Metas (Non-Goals)
- Clonagem profunda (deep-clone) de coleções e pastas inteiras em cascata — mantido no roadmap futuro; nesta fase a duplicação foca em requisições individuais.
- Drag & Drop na árvore — reorganização estrutural avançada fica para versão posterior; o foco é organização direta via criação na pasta correta e edição de nós.
- Gestão visual de múltiplos workspaces (mudança ou troca de workspaces na UI) — mantido transparente via workspace padrão.
- Controle de acesso baseado em papéis (RBAC) ou autenticação multi-tenant no backend.
- Execução em lote de coleções inteiras (Collection Runner).

### 2.3. Anti-Metas (Anti-Goals)
- **Efeito N+1 de requisições:** Não adotar carregamento sob demanda preguiçoso (lazy loading por clique de nó) que gera múltiplos spinners e impede a busca rápida em memória na sidebar.
- **Proliferação de botões na barra de ferramentas:** Não poluir o topo da sidebar com botões separados para cada entidade; manter um único botão de ação `+ Novo`.

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Árvore Hierárquica Unificada + Mutações CRUD Atômicas (Escolhida)
- **Backend:** Endpoint único `GET /api/workspaces/{id}/tree` que projeta Coleções, Pastas e Requisições em um payload estruturado com EF Core `AsNoTracking`, acompanhado de endpoints REST atômicos `POST/PUT/DELETE` para cada recurso.
- **Frontend:** O cliente consome a árvore uma única vez, armazena em cache/estado no hook `useCollectionTree` e atualiza a interface de forma reativa a cada mutação.
- **Trade-offs:** Exige DTO recursivo no backend, mas elimina totalmente a latência de navegação entre pastas e permite busca textual instantânea por rota ou nome.

### Abordagem 2: Endpoints Isolados Desaninhados com Lazy Loading (Descartada)
- Endpoints REST planos sem projeção em árvore; cada expansão de pasta no frontend dispararia nova consulta HTTP ao servidor.
- **Motivo do descarte:** Gera lentidão ao navegar em coleções profundas, múltiplos spinners e quebra a funcionalidade de filtro/busca da sidebar para itens não expandidos.

---

## 4. Design da API Backend (.NET 9 / EF Core)

### 4.1. Workspace Padrão e Bootstrap
No startup da aplicação (`Program.cs`), após `dbContext.Database.EnsureCreated()`, o sistema verifica se existe algum workspace. Caso não exista, cria:
```csharp
var defaultWorkspace = new Workspace
{
    Id = Guid.Parse("00000000-0000-0000-0000-000000000001"),
    Name = "Default Workspace"
};
```
O frontend usará este ID padrão caso nenhum workspace explícito esteja selecionado.

### 4.2. Modelos e DTOs

#### DTO da Árvore Hierárquica
```csharp
public record WorkspaceTreeDto(
    Guid WorkspaceId,
    string WorkspaceName,
    List<CollectionNodeDto> Collections
);

public record CollectionNodeDto(
    Guid Id,
    string Name,
    ExecutionTarget DefaultTarget,
    string? OpenApiSpecUrl,
    List<FolderNodeDto> Folders,
    List<RequestItemNodeDto> Requests
);

public record FolderNodeDto(
    Guid Id,
    string Name,
    Guid CollectionId,
    Guid? ParentFolderId,
    ExecutionTarget DefaultTarget,
    List<FolderNodeDto> SubFolders,
    List<RequestItemNodeDto> Requests
);

public record RequestItemNodeDto(
    Guid Id,
    string Name,
    string Method,
    string Url,
    ExecutionTarget Target,
    HttpBodyType BodyType,
    string HeadersJson,
    string? BodyContent,
    Guid? CollectionId,
    Guid? FolderId
);
```

#### DTOs de Mutação (Create/Update)
- `CreateCollectionRequest(string Name, Guid WorkspaceId, ExecutionTarget DefaultTarget = ExecutionTarget.Inherit)`
- `UpdateCollectionRequest(string Name, ExecutionTarget DefaultTarget)`
- `CreateFolderRequest(string Name, Guid WorkspaceId, Guid CollectionId, Guid? ParentFolderId, ExecutionTarget DefaultTarget = ExecutionTarget.Inherit)`
- `UpdateFolderRequest(string Name, Guid? ParentFolderId, ExecutionTarget DefaultTarget)`
- `CreateRequestItemRequest(string Name, string Method, string Url, Guid WorkspaceId, Guid? CollectionId, Guid? FolderId, ExecutionTarget Target = ExecutionTarget.Inherit, string HeadersJson = "{}", HttpBodyType BodyType = HttpBodyType.None, string? BodyContent = null)`
- `UpdateRequestItemRequest(string Name, string Method, string Url, ExecutionTarget Target, string HeadersJson, HttpBodyType BodyType, string? BodyContent, Guid? CollectionId, Guid? FolderId)`

### 4.3. Endpoints REST
- `GET /api/workspaces/{id:guid}/tree` -> Retorna `WorkspaceTreeDto` com projeção ordenada por nome.
- **Coleções:**
  - `POST /api/collections` -> Cria coleção. Retorna `201 Created`.
  - `PUT /api/collections/{id:guid}` -> Atualiza metadados. Retorna `200 OK`.
  - `DELETE /api/collections/{id:guid}` -> Remove coleção e itens em cascata. Retorna `204 NoContent`.
- **Pastas:**
  - `POST /api/folders` -> Cria pasta ou subpasta. Retorna `201 Created`.
  - `PUT /api/folders/{id:guid}` -> Atualiza nome ou move pasta. Retorna `200 OK`.
  - `DELETE /api/folders/{id:guid}` -> Remove pasta em cascata. Retorna `204 NoContent`.
- **Requisições:**
  - `POST /api/requests` -> Cria requisição. Retorna `201 Created`.
  - `GET /api/requests/{id:guid}` -> Obtém detalhes de uma requisição salva. Retorna `200 OK`.
  - `PUT /api/requests/{id:guid}` -> Atualiza URL, método, headers, body e target da requisição salva. Retorna `200 OK`.
  - `POST /api/requests/{id:guid}/duplicate` -> Duplica requisição com sufixo ` (Copy)`. Retorna `201 Created`.
  - `DELETE /api/requests/{id:guid}` -> Remove requisição. Retorna `204 NoContent`.

---

## 5. Design do Frontend (Next.js 15 / React)

### 5.1. Componentes e Estrutura
1. **`CollectionsNav` / `CollectionTree`:**
   - Toolbar superior com:
     - Botão `+ Novo` (dispara dropdown menu com `🗂️ Nova Coleção`, `📁 Nova Pasta`, `📄 Nova Requisição`, `📥 Importar OpenAPI`).
     - Botão `🔄` para recarregar a árvore.
     - Campo de busca textual filtrando coleções, pastas e requisições (por nome e rota).
   - Área rolável com renderização recursiva de nós:
     - Nó de Coleção: ícone `Layers`/`Folder`, chevron de expansão, contagem de requisições, botões hover de sync/settings.
     - Nó de Pasta: ícone de pasta (aberta/fechada), chevron de expansão, indentação de nível.
     - Nó de Requisição: badge colorida do método HTTP (`GET`, `POST`, `PUT`, `DELETE`), nome e indicador de ativo.
     - Área vazia ao final para captura de clique direito.
2. **Resolução de Destino para "+ Novo":**
   - Se o usuário selecionar `📁 Nova Pasta` ou `📄 Nova Requisição` via botão superior `+ Novo`:
     - Caso um nó da árvore esteja selecionado (Coleção ou Pasta), o novo item é inserido imediatamente abaixo desse nó com edição inline ativa.
     - Caso nada esteja selecionado na árvore, o item é inserido na primeira coleção disponível.
3. **`ContextMenu` Reutilizável:**
   - Componente genérico posicionado absolutamente por coordenadas `(x, y)` com contenção automática nos limites da janela (`boundary check`).
   - Suporte a fechamento ao clicar fora ou pressionar `Esc`.
   - Utilizado tanto para o clique com botão direito nos nós quanto para o clique no botão `+ Novo`.
4. **`InlineNodeInput` (Edição Inline):**
   - Ao disparar "Renomear" ou "Novo Item", o nó exibe um `<input>` pré-focado.
   - Pressionar `Enter` submete a mutação para a API; pressionar `Esc` cancela.
5. **Modal `SaveRequestModal` ("Salvar Como"):**
   - Aberto quando o usuário pressiona `Ctrl+S` / clica em "Salvar" em uma requisição avulsa (scratchpad).
   - Campos: Nome da Requisição, Seletor de Coleção de destino e Seletor opcional de Pasta de destino.
   - Ao confirmar, envia `POST /api/requests`, adiciona o item na árvore e vincula o editor ao novo ID salvo.
6. **Integração no `RequestEditor` e `page.tsx`:**
   - Ao clicar em uma requisição na árvore, seu ID torna-se ativo e seus dados (`method`, `url`, `headers`, `body`, `target`) são carregados no formulário do editor.
   - Barra de título do editor exibe o nome da requisição e um botão **Salvar** com atalho `Ctrl+S` / `Cmd+S`.
   - Se o usuário editar qualquer campo, um ponto colorido (dirty state) indica que há alterações não salvas.
   - Modal de confirmação ao tentar excluir coleções ou pastas não vazias.

---

## 6. Tratamento de Erros, Casos de Borda e Segurança
- **Validação de Nomes:** Nomes de coleções, pastas e requisições não podem ser vazios ou compostos apenas por espaços (limite de 200 caracteres).
- **Integridade Referencial:** Excluir uma coleção ou pasta aciona deleção em cascata controlada no SQLite com retorno `204`.
- **Prevenção de Ciclos em Pastas:** Ao mover ou atualizar `ParentFolderId`, o backend valida se a pasta pai não é ela própria nem uma de suas subpastas descendentes.
- **Concorrência e Estado do Editor:** Se uma requisição for excluída na sidebar enquanto estiver aberta no editor, o editor volta para o estado inicial de nova requisição avulsa.

---

## 7. Decisões do Usuário vs O que Fica a Cargo do Builder

### Decidido pelo Usuário:
- Botão superior único `+ Novo` na toolbar da sidebar, sem chevron.
- Menus de contexto ativados pelo botão direito do mouse em Coleções, Pastas, Requisições e na área livre da sidebar.
- Nomenclaturas padronizadas entre o menu superior e os menus de contexto (`Nova Coleção`, `Nova Pasta`, `Nova Requisição`, `Importar OpenAPI`).
- Abordagem arquitetural 1 (Árvore hierárquica unificada no endpoint `tree` + CRUDs atômicos).
- Fluxo de salvamento de requisição avulsa através de modal dedicado "Salvar Como".
- Duplicação focada exclusivamente em requisições individuais nesta fase.

### A Cargo do Builder:
- Estilização exata do modal de confirmação de exclusão em cascata.
- Formatação exata do payload DTO e serialização JSON (`System.Text.Json` options).
- Tratamento de foco e acessibilidade via teclado (navegação por setas e foco automático no input inline).
