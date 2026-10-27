# Design Técnico: Importação OpenAPI em Nova Coleção, Mapeamento de Pastas, Parâmetros e Aba de Especificação estilo Apidog

**Data:** 2026-10-26  
**Status:** Pronto para Aprovação  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Backend (.NET 9 Minimal APIs / EF Core) e Frontend (Next.js 15 / Tailwind CSS / React)

---

## 1. Intenção e Motivação (The Why)

O ApiDot conta com uma estratégia inicial de importação e sincronização OpenAPI (`OpenApiImportStrategy` e `CollectionMerger`), porém o fluxo atual apresenta lacunas de usabilidade e fidelidade em relação a clientes modernos de API (como Apidog, Postman e Insomnia):

1. **Vínculo Incorreto na Ação Global "+ Novo":** Ao clicar em `+ Novo` -> `Importar OpenAPI` (ou no menu de contexto da área vazia), o frontend hoje redireciona para a tela de configurações da primeira coleção existente (`tree.collections[0]`). O comportamento esperado para esse fluxo é criar uma **nova coleção** no workspace ativo a partir da especificação fornecida.
2. **Ausência de Pastas por Tags:** As especificações Swagger/OpenAPI agrupam endpoints através da propriedade `tags` (ex.: *pet*, *store*, *user*). Hoje, o ApiDot ignora tags e importa todas as requisições na raiz da coleção (`FolderId = null`). É necessário mapear tags diretamente para pastas (`Folder`), garantindo que requisições associadas a múltiplas tags sejam importadas em todas as suas respectivas pastas, enquanto requisições sem tag permaneçam na raiz.
3. **Parâmetros de Path e Query Não Montados:** Parâmetros de rota (`in: "path"`) e query (`in: "query"`) não são sintetizados na URL da requisição com base nos valores default/exemplo declarados na especificação.
4. **Falta de uma Aba de Especificação (Estilo Apidog):** Não há uma área visual e estruturada de contrato dentro da requisição. Os desenvolvedores precisam documentar e visualizar propriedades, tipos de dados, descrições, campos obrigatórios e respostas esperadas (ex.: 200, 400, 500) da API.
5. **Autosugestão (IntelliSense) Desconectada:** O autocompletion no corpo da requisição deve utilizar as propriedades e tipos definidos na especificação para acelerar a escrita e evitar erros manuais.
6. **Ordem Funcional das Abas:** O editor de requisições precisa de uma organização coerente de abas, começando pelo contrato e seguindo a ordem lógica de execução:
   `Especificação > Parâmetros/Query > Cabeçalhos > Corpo > Autenticação`.

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Modal de Criação via OpenAPI:** Criar o componente `OpenApiImportModal` disparado por `+ Novo` -> `Importar OpenAPI` e pelo menu de contexto vazio da sidebar, permitindo informar URL da spec ou colar conteúdo JSON/YAML, sugerindo o nome da coleção via `info.title` e criando uma nova coleção no workspace ativo.
- **Mapeamento de Tags para Pastas:**
  - Identificar cada tag declarada na operação e associá-la a uma pasta correspondente (`Folder`) na coleção (reutilizando pastas existentes ou criando novas sob demanda).
  - Se um endpoint possuir múltiplas tags (ex.: `["pet", "admin"]`), importar um item de requisição em cada uma das pastas correspondentes.
  - Endpoints sem nenhuma tag permanecem na raiz da coleção (`FolderId = null`).
- **Sintetização de Parâmetros na URL e Tabela de Query:**
  - Extrair parâmetros `in: "path"` e `in: "query"`.
  - Montar a URL padrão substituindo `{param}` pelos valores de exemplo/default quando disponíveis.
  - Montar a query string da URL (ex.: `?status=available`) baseada nos parâmetros da spec.
  - Disponibilizar a aba **Parâmetros** com sincronização bidirecional em tempo real entre a tabela de query params e a barra de URL.
- **Aba "Especificação" (Estilo Apidog):**
  - Primeira aba do editor de requisições.
  - Formulário estruturado com resumo, descrição, tabela/árvore de schema do corpo (nome, tipo, obrigatório, descrição, exemplo) e lista de respostas esperadas (código HTTP, descrição, schema/exemplo).
  - Edição manual completa de campos ou preenchimento automático na importação OpenAPI.
  - Ação rápida *"Gerar Corpo de Exemplo"* que gera um JSON inicial no editor do Corpo a partir do schema documentado.
- **IntelliSense no Corpo da Requisição:** O `RequestAutocomplete` consulta a árvore de propriedades do `SchemaDefinition` da requisição para autocompletar chaves e tipos no editor de código JSON.
- **Persistência do SchemaDefinition:** Manter o nome do campo como `SchemaDefinition` na entidade `RequestItem` e expô-lo nos DTOs de leitura e mutação do backend.

### 2.2. Não-Metas (Non-Goals)
- Validação estrita em tempo de execução bloqueando o envio de requisições que não estejam 100% aderentes ao schema (o schema é documentação e guia de produtividade, sem impedir requisições exploratórias).
- Suporte a formatos de contrato legados que não sejam OpenAPI 3.x e Swagger 2.0 (ex.: WSDL/SOAP, RAML).
- Editor visual gráfico estilo diagrama UML de schemas.

### 2.3. Anti-Metas (Anti-Goals)
- **Não normalizar o schema em dezenas de tabelas relacionais:** Evitar complexidade excessiva de tabelas como `SpecificationFields`, `PropertyTypes`, etc., preservando `SchemaDefinition` como JSON estruturado e auditável no `RequestItem`.
- **Não exigir coleção pré-existente:** Nunca mais redirecionar a importação de uma nova spec para configurações de coleções já existentes.

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Contrato Unificado em JSON (`SchemaDefinition`) na Requisição (Escolhida)
- O `RequestItem` armazena a especificação completa serializada em `SchemaDefinition` (metadados, parâmetros documentados, schema do corpo e respostas esperadas).
- O backend extrai essas informações de forma canônica e o frontend as renderiza de maneira amigável em componentes visuais.
- **Vantagens:** Alta performance, suporte natural a estruturas JSON recursivas, serialização direta de/para OpenAPI, sem impacto em migrações relacionais complexas.
- **Decisão do Usuário:** Manter expressamente o nome do campo como `SchemaDefinition`.

### Abordagem 2: Modelo Relacional Completo no EF Core (Descartada)
- Criação de tabelas relacionais para cada nível de propriedade do schema e respostas.
- **Motivo do descarte:** Rigidez excessiva, alta complexidade de persistência para tipos dinâmicos/aninhados e custo desnecessário de queries relacionais.

### Abordagem 3: Especificação Virtual Baseada na Coleção (Descartada)
- Requisições apenas apontam para o endpoint da spec da coleção, sem especificação própria.
- **Motivo do descarte:** Impede o preenchimento manual de especificação em requisições criadas do zero sem OpenAPI.

---

## 4. Design Detalhado da Solução

### 4.1. Estrutura Canônica de `SchemaDefinition`

Para conciliar compatibilidade retroativa e o modelo visual estilo Apidog, o campo `SchemaDefinition` passa a serializar um contrato padronizado:
```json
{
  "summary": "Busca pet por ID",
  "description": "Retorna os detalhes completos do pet",
  "parameters": [
    {
      "name": "petId",
      "in": "path",
      "type": "integer",
      "required": true,
      "description": "ID numérico do pet",
      "defaultOrExample": "1"
    },
    {
      "name": "status",
      "in": "query",
      "type": "string",
      "required": false,
      "description": "Filtro por status",
      "defaultOrExample": "available"
    }
  ],
  "body": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Nome do pet", "example": "doggie" },
      "status": { "type": "string", "enum": ["available", "pending", "sold"] }
    },
    "required": ["name"]
  },
  "responses": [
    {
      "statusCode": "200",
      "description": "Operação bem-sucedida",
      "example": "{\"id\": 1, \"name\": \"doggie\"}"
    },
    {
      "statusCode": "400",
      "description": "ID inválido fornecido"
    }
  ]
}
```
*Compatibilidade:* Se um registro legado contiver apenas um JSON Schema bruto (sem as chaves raiz `parameters` ou `responses`), o frontend e o backend encapsulam automaticamente esse schema dentro do nó `body`.

### 4.2. Ingestão YAML e JSON no Backend
- Adição da biblioteca `YamlDotNet` ao `ApiDot.Core`.
- Caso o conteúdo de entrada (ou resposta da URL remota) seja YAML, o parser converte para JSON em memória antes da análise pelo `JsonDocument`, garantindo suporte nativo a specs OpenAPI em YAML tanto no upload quanto em URLs remotas com proteção anti-SSRF.

### 4.3. Regra de Mesclagem Multi-Tag no `CollectionMerger`
- O índice de rota existente passa a considerar a tupla `(Method, Route, FolderId)`.
- Isso garante que endpoints com múltiplas tags (ex.: `pet` e `admin`) sejam atualizados de forma determinística na sua respectiva pasta, sem sobrescrever o item da pasta irmã.
- Preservação cirúrgica: sincronizações subsequentes atualizam schemas e descrições sem excluir requisições nem apagar edições feitas pelo usuário.

Em `ApiDot.Core/Import/CanonicalImportModels.cs`:
```csharp
public class CanonicalCollectionImport
{
    public string Name { get; set; } = "Imported Collection";
    public string? Description { get; set; }
    public string? BaseUrl { get; set; }
    public List<CanonicalRequest> Requests { get; set; } = [];
}

public class CanonicalResponse
{
    public string StatusCode { get; set; } = "200";
    public string? Description { get; set; }
    public string? BodySchemaJson { get; set; }
    public string? ExampleContent { get; set; }
}

public class CanonicalParameter
{
    public string Name { get; set; } = string.Empty;
    public string In { get; set; } = "query"; // query, path, header
    public string Type { get; set; } = "string";
    public bool Required { get; set; }
    public string? Description { get; set; }
    public string? DefaultOrExample { get; set; }
}

public class CanonicalRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Method { get; set; } = "GET";
    public string Path { get; set; } = "/";
    public string Url { get; set; } = "/";
    public string? OperationId { get; set; }
    public string? Summary { get; set; }
    public List<string> Tags { get; set; } = [];
    public List<CanonicalParameter> Parameters { get; set; } = [];
    public Dictionary<string, string> Headers { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> QueryParameters { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> PathParameters { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public HttpBodyType BodyType { get; set; } = HttpBodyType.None;
    public string? BodyContent { get; set; }
    public string? BodySchemaJson { get; set; }
    public List<CanonicalResponse> Responses { get; set; } = [];
    public string? SchemaDefinition { get; set; }
}
```

### 4.2. Estratégia de Parse (`OpenApiImportStrategy`)
1. **Extração de Tags:** Lê a propriedade `tags` do objeto da operação (ex.: `["pet", "store"]`).
2. **Extração e Montagem de Parâmetros:**
   - Para `in: "path"`: registra no dicionário `PathParameters` e substitui na URL se houver valor de exemplo/default.
   - Para `in: "query"`: registra no dicionário `QueryParameters` e monta a query string final da URL inicial.
3. **Extração de Respostas:** Lê `responses` da operação (ex.: `"200"`, `"400"`, `"default"`), capturando descrições, schemas e exemplos.
4. **Construção do `SchemaDefinition`:** Gera uma estrutura JSON consistente contendo metadados, parâmetros tipados, propriedades do corpo e respostas.

### 4.3. Motor de Mesclagem (`CollectionMerger`)
1. **Agrupamento em Pastas:**
   - Para cada requisição canônica:
     - Se `Tags` contiver itens:
       - Para cada `tag` na lista:
         - Localiza na coleção a `Folder` cujo nome seja igual à `tag` (case-insensitive). Se não existir, cria a `Folder` vinculada à coleção e a adiciona à lista `collection.Folders`.
         - Cria uma instância de `RequestItem` vinculada à coleção e com `FolderId = folder.Id`.
     - Se `Tags` estiver vazia:
       - Cria o `RequestItem` na raiz da coleção (`FolderId = null`).
2. **Atribuição do `SchemaDefinition`:** Garante que o `SchemaDefinition` gerado ou atualizado seja gravado no `RequestItem`.

### 4.4. Endpoints e Contratos no Backend (`ApiDot.Server`)
1. **Novo Endpoint de Criação via Importação:**
   `POST /api/collections/import-openapi`
   - Payload:
     ```json
     {
       "workspaceId": "00000000-0000-0000-0000-000000000001",
       "name": "Swagger Petstore (Opcional - usa info.title se vazio)",
       "specUrl": "https://petstore.swagger.io/v2/swagger.json",
       "specContent": "{ ... }"
     }
     ```
   - Cria a nova coleção, baixa a spec (com validação anti-SSRF `IsSafeSpecUrl`), executa o parser e o merger, persiste pastas e requisições atomicamente e retorna o `CollectionNodeDto` criado.
2. **Atualização de Mutações de Requisição:**
   - Incluir `SchemaDefinition` em `CreateRequestItemRequest`, `UpdateRequestItemRequest` e `RequestItemNodeDto`.
   - Garantir persistência de `SchemaDefinition` em `POST /api/requests`, `PUT /api/requests/{id}` e duplicação.

### 4.5. Interface e Frontend (`frontend/src`)

1. **Modal de Importação (`OpenApiImportModal.tsx`):**
   - Modal com abas/opções para:
     - URL da especificação (com validação de formato e preview).
     - Conteúdo JSON/YAML colado diretamente ou arquivo carregado.
     - Campo editável de Nome da Coleção (preenchido dinamicamente ao analisar a spec ou via input manual).
     - Botão primário: *"Criar e Importar Coleção"*.
   - Acionado via `+ Novo` -> `Importar OpenAPI` e pelo menu de contexto na raiz.

2. **Reorganização das Abas no `RequestEditor.tsx`:**
   A ordem passa a ser rigorosamente:
   ```text
   [ Especificação ] [ Parâmetros ] [ Cabeçalhos ] [ Corpo ] [ Autenticação ]
   ```

3. **Aba "Especificação" (`SpecificationTab.tsx`):**
   - Formulário estilo Apidog com duas seções:
     - **Corpo da Requisição (Request Body Schema):**
       - Tabela com colunas: *Nome da Propriedade*, *Tipo* (`string`, `number`, `integer`, `boolean`, `object`, `array`), *Obrigatório* (checkbox), *Descrição* e *Exemplo*.
       - Suporte a adicionar novas propriedades, excluir e aninhar nós filhos para objetos.
       - Botão *"Gerar Exemplo no Corpo"*: converte o schema atual em um objeto JSON preenchido com os exemplos/defaults e aplica na aba **Corpo**.
     - **Respostas Esperadas (Responses):**
       - Lista de respostas contendo: *Código HTTP* (ex.: 200, 201, 400), *Descrição*, *Corpo de Exemplo* ou *Schema*.
       - Botão *"Adicionar Resposta"*.

### 4.4. Parâmetros de Rota (Path Parameters no Padrão `:param`) e Query Parameters

A gestão e envio de parâmetros segue o padrão consagrado da indústria (Postman, Insomnia, Express):
1. **Sintaxe de Path Parameters (`:param`):**
   - Na importação de especificações OpenAPI (que usam `{param}`), as rotas são normalizadas para a sintaxe `:param` (ex.: `/pet/{petId}` vira `/pet/:petId`).
   - Essa convenção elimina qualquer colisão com variáveis de ambiente do ApiDot (que utilizam a sintaxe de chaves duplas `{{variavel}}`).
   - O interpolador aceita primordialmente `:param` (e mantém suporte tolerante a `{param}` para rotas digitadas manualmente).
2. **Aba Parâmetros Dividida:**
   - **Path Parameters (Parâmetros de Rota):** Identifica automaticamente os segmentos `:param` presentes na URL ou listados na especificação. Permite editar o valor de cada parâmetro (ex.: chave `petId` $\to$ valor `1`). Não possui toggle de desativação por ser parte fixa do caminho da rota.
   - **Query Parameters (Parâmetros de Consulta):** Tabela chave-valor com toggle de ativação (checkbox). Sincronizada bidirecionalmente em tempo real com a query string da barra de URL (`?status=available`).
3. **Interpolação no Envio:**
   - Antes do dispatch HTTP (no servidor ou agent local), o `VariableInterpolator` resolve os path parameters substituindo os tokens `:param` pelos respectivos valores preenchidos na tabela de parâmetros, antes de interpolar as variáveis de ambiente `{{...}}`.

5. **IntelliSense no `CodeEditor` (`RequestAutocomplete.tsx`):**
   - Extrair as chaves e propriedades de primeiro nível e aninhadas do `SchemaDefinition` da requisição ativa.
   - Ao digitar no editor JSON, exibir opções com badge de tipo (`[str]`, `[num]`, `[obj]`) e descrição do campo.

---

## 5. Estratégia de Testes

- **Backend Unit Tests:**
  - `OpenApiImportStrategyTests`:
    - Validação de extração de tags e endpoints com múltiplas tags.
    - Validação de extração e substituição de path parameters na URL.
    - Validação de query parameters montados na URL.
    - Validação de extração de responses e geração do `SchemaDefinition`.
  - `CollectionMergerTests`:
    - Validação de criação automática de pastas baseada em tags.
    - Validação de duplicação do `RequestItem` em múltiplas pastas quando houver múltiplas tags.
    - Validação de requisições sem tag permanecendo com `FolderId = null`.
    - Preservação e mesclagem de `SchemaDefinition`.
  - `CollectionOpenApiEndpointsTests`:
    - Teste de integração do endpoint `POST /api/collections/import-openapi`.
- **Frontend Unit & Component Tests:**
  - `OpenApiImportModal.test.tsx`: renderização, validações de URL/conteúdo e submissão.
  - `SpecificationTab.test.tsx`: inclusão e edição de propriedades do schema, respostas esperadas e acionamento de "Gerar Exemplo no Corpo".
  - `ParamsTab.test.tsx`: sincronização bidirecional com a URL.
  - `RequestEditor.test.tsx`: validação da nova ordem de abas (`Especificação > Parâmetros > Cabeçalhos > Corpo > Autenticação`).
