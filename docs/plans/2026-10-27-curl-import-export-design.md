# Design Técnico: Importação e Exportação de Requisições via cURL

**Data:** 2026-10-27  
**Status:** Pronto para Aprovação  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Frontend (Next.js 15 / TypeScript / React / Tailwind CSS / Vitest)

---

## 1. Intenção e Motivação (The Why)

Em fluxos de desenvolvimento de software e testes de integração de APIs, o comando `cURL` é o padrão universal para reproduzir, documentar e compartilhar requisições HTTP. Desenvolvedores frequentemente:
- Copiam requisições de ferramentas de inspeção de rede (DevTools do navegador - *"Copy as cURL"*).
- Copiam exemplos de documentações públicas de APIs (Stripe, GitHub, AWS, etc.).
- Compartilham comandos cURL no terminal ou em canais de comunicação com colegas.

Atualmente, o ApiDot não oferece suporte nativo a cURL:
1. Para criar uma requisição a partir de um cURL, o usuário precisa digitar manualmente a URL, selecionar o método, formatar os headers em JSON e colar o payload no corpo.
2. Não há forma rápida de extrair uma requisição configurada no ApiDot para executá-la no terminal ou enviá-la para terceiros.
3. Não é possível copiar o cURL exato da requisição que acabou de ser executada a partir do painel de respostas (`ResponseViewer`).

Este design estabelece a arquitetura e a especificação de interface para **Importação via cURL** (diretamente nas coleções e pastas) e **Exportação via cURL** (no editor de requisições, na árvore lateral e no painel de respostas).

---

## 2. Metas, Não-Metas e Anti-Metas

### 2.1. Metas (Goals)
- **Motor de Parsing de cURL (`curlParser.ts`):**
  - Tokenizador de argumentos em linha de comando compatível com aspas simples, aspas duplas, escapes e quebras de linha (`\`).
  - Reconhecimento de métodos HTTP via `-X`, `--request` ou inferido (POST se houver flag de corpo, GET por padrão).
  - Reconhecimento de cabeçalhos via `-H`, `--header` (gerando JSON formatado para a aba Cabeçalhos).
  - Reconhecimento de corpo via `-d`, `--data`, `--data-raw`, `--data-binary`, `--data-ascii`, `--data-urlencode` (identificando formato JSON ou Texto).
  - Reconhecimento de autenticação básica via `-u`, `--user`, convertendo diretamente para o cabeçalho `Authorization: Basic <base64>` em `headers` e `headersJson`.
  - Reconhecimento de cookies via `-b`, `--cookie`, convertendo para o cabeçalho `Cookie: <cookie_string>`.
  - Tratamento permissivo para DevTools de navegadores (Chrome, Firefox, Safari): ignora silenciosamente flags booleanas comuns (`--compressed`, `-k`, `--insecure`, `-s`, `--silent`, `-v`, `--verbose`, `-L`, `--location`, `-i`).
  - Extração da URL preservando sua query string original (o `ParamsTab` decompõe automaticamente).
- **Motor de Geração de cURL (`curlGenerator.ts`):**
  - Construção de comando cURL formatado em múltiplas linhas com `\` para legibilidade no terminal.
  - Resolução de variáveis de ambiente (`{{variavel}}`) utilizando os valores do ambiente ativo selecionado (conforme decisão expressa do usuário).
  - Resolução de path parameters (`:param`) presentes na URL.
  - Emissão limpa de todos os cabeçalhos (`-H 'Chave: Valor'`). Se `auth` possuir credenciais ativas na aba Autenticação que ainda não constem em `headersJson`, injeta o cabeçalho correspondente sem duplicações.
- **Modal de Importação (`CurlImportModal.tsx`):**
  - Acionado pelo menu de contexto de Coleções e Pastas na árvore lateral (`CollectionTree`).
  - Campo de texto (Textarea monospace) para colar o comando cURL.
  - Sugestão automática do nome da requisição a partir do método e do último segmento do path da URL (ex.: `POST /api/v1/orders` -> `Criar Orders` ou `Orders`).
  - Pré-visualização instantânea dos metadados identificados (método com cor correspondente, URL, quantidade de headers, presença de corpo).
  - Salvamento direto na coleção e pasta selecionadas via `createRequest`, abrindo a requisição no editor logo após a importação.
- **Ações de Exportação ("Copiar cURL"):**
  - **Na barra superior do editor (`RequestEditor.tsx`):** Botão "Copiar cURL" com ícone de terminal e feedback visual de confirmação ("Copiado!").
  - **No menu de contexto da requisição (`CollectionTree.tsx`):** Opção "Copiar cURL" para cópia rápida com dados da requisição.
  - **No painel de resposta (`ResponseViewer.tsx`):** Botão "Copiar cURL" ao lado do botão de copiar corpo, exportando exatamente o comando executado no último disparo.

### 2.2. Não-Metas (Non-Goals)
- Upload e leitura de arquivos binários locais a partir de flags do tipo `-F file=@/path/to/file` ou `--data-binary @arquivo`.
- Emulação de opções avançadas de rede de baixo nível (como configurações de proxy `--proxy`, certificados de cliente `--cert`, limitação de taxa de transferência ou DNS customizado).
- Execução direta de binário cURL no sistema operacional (toda a execução continua ocorrendo pelos executores oficiais do ApiDot: Nuvem ou Agent Local).

### 2.3. Anti-Metas (Anti-Goals)
- **Sem bloqueios ou travamento de UI:** O parser não deve lançar exceções não tratadas ao receber entradas malformadas; deve exibir mensagens claras de validação.
- **Sem latência de rede para exportação:** A cópia de cURL não deve realizar chamadas HTTP desnecessárias ao backend.
- **Sem perda de literais de variáveis:** Se o usuário não tiver ambiente ativo selecionado ou a variável não estiver definida, os tokens `{{variavel}}` devem ser mantidos legíveis no cURL gerado.

---

## 3. Abordagens Consideradas e Escolha Arquitetural

### Abordagem 1: Motor Client-Side em TypeScript Puro no Frontend (Escolhida)
- O parser e o gerador de cURL são implementados como utilitários puros em TypeScript no frontend (`src/lib/curl/curlParser.ts` e `src/lib/curl/curlGenerator.ts`).
- A importação interpreta o comando colado diretamente no navegador e invoca a API já existente de persistência de requisições (`createRequest`).
- A exportação aproveita diretamente as funções de interpolação em memória (`interpolateVariables`), montando o comando cURL e copiando para o clipboard instantaneamente.
- **Vantagens:** 
  - Experiência do usuário sem qualquer latência para operações de cópia.
  - Feedback visual reativo em tempo real durante a digitação/colagem no modal.
  - Não exige novas rotas nem lógica duplicada no backend em .NET.
- **Decisão:** Aprovada expressamente pelo usuário.

### Abordagem 2: Processamento Server-Side no Backend em C# (Descartada)
- Endpoints dedicados (`POST /api/requests/import-curl` e `POST /api/requests/export-curl`) no `ApiDot.Server`.
- **Motivo do descarte:** Adiciona latência desnecessária a cada clique de "Copiar cURL", exige tráfego de rede para validação simples de texto e introduz acoplamento de estado não salvo da interface com o servidor.

---

## 4. Design Detalhado da Solução

### 4.1. Parser de cURL (`frontend/src/lib/curl/curlParser.ts`)

O parser recebe uma string com o comando cURL e retorna uma estrutura canônica ou erros de validação:

```typescript
export interface ParsedCurlRequest {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  headersJson: string;
  bodyContent: string | null;
  bodyType: 'None' | 'Json' | 'RawText';
  auth: {
    type: 'none' | 'bearer' | 'basic' | 'apikey';
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
}

export interface CurlParseResult {
  success: boolean;
  request?: ParsedCurlRequest;
  error?: string;
}
```

#### Regras do Parser:
1. **Normalização e Estratégia Permissiva para DevTools:**
   - Remove quebras de linha com barra invertida (`\\\n` e `\\\r\n`), espaços excedentes e o prefixo `curl` inicial.
   - Flags booleanas sem argumento são ignoradas com segurança (`--compressed`, `-k`, `--insecure`, `-s`, `--silent`, `-v`, `--verbose`, `-L`, `--location`, `-i`).
   - Flags com argumentos desconhecidos têm seus argumentos descartados sem corromper a identificação da URL.
2. **Tokenização Segura:** Implementa um analisador léxico de argumentos respeitando aspas simples (`'...'`), aspas duplas (`"..."`) e caracteres de escape (`\"`, `\'`).
3. **Mapeamento de Flags:**
   - `-X <METH>`, `--request <METH>`: Define o método HTTP (em maiúsculas). Se ausente, infere `POST` se houver flag de corpo, ou `GET`.
   - `-H <HEADER>`, `--header <HEADER>`: Extrai o par `Chave: Valor`.
   - `-b <COOKIE>`, `--cookie <COOKIE>`: Mapeia para o cabeçalho `Cookie: <COOKIE>`.
   - `-d <DATA>`, `--data <DATA>`, `--data-raw <DATA>`, `--data-ascii <DATA>`, `--data-binary <DATA>`, `--data-urlencode <DATA>`: Concatena o corpo da requisição. Se for detectado JSON válido (`{...}` ou `[...]`), define `bodyType = 'Json'`, senão `RawText`. Se não houver corpo, `None`.
   - `-u <USER:PASS>`, `--user <USER:PASS>`: Mapeia para autenticação Basic: codifica em Base64 e adiciona diretamente o cabeçalho `Authorization: Basic <base64>` em `headers` e `headersJson`, além de preencher `auth: { type: 'basic', username, password }`.
   - Se houver cabeçalho `Authorization: Bearer <TOKEN>`, preenche `auth: { type: 'bearer', token }`.
4. **Tratamento de URL:** A URL é preservada verbatim com sua query string original. O `ParamsTab` já extrai e sincroniza automaticamente os query params com a interface.
5. **Sugestão de Nome:** Gera um nome baseado no último segmento do path (ex.: `POST /api/v1/orders` -> `Orders` ou `Criar Orders`, `GET /users` -> `Users`).

---

### 4.2. Gerador de cURL (`frontend/src/lib/curl/curlGenerator.ts`)

A função `generateCurlCommand` converte qualquer requisição do ApiDot em sintaxe cURL:

```typescript
export interface GenerateCurlOptions {
  variables?: Record<string, string>;
  requestHistory?: any[];
  resolveVariables?: boolean;
}

export function generateCurlCommand(
  request: {
    method: string;
    url: string;
    headers?: string | Record<string, string>;
    body?: string | null;
    bodyFormat?: string;
    auth?: {
      type: string;
      token?: string;
      username?: string;
      password?: string;
      key?: string;
      value?: string;
    };
    pathParams?: Record<string, string>;
  },
  options?: GenerateCurlOptions
): string;
```

#### Regras de Geração e Deduplicação:
1. **Resolução de Variáveis:** Se `resolveVariables` for `true` (padrão quando variáveis de ambiente são fornecidas), utiliza `interpolateVariables` na URL, nos headers e no body, e `resolvePathParams` para substituir tokens `:param`.
2. **Método e URL:** Inicia com `curl -X <METODO> '<URL>'`.
3. **Cabeçalhos:**
   - Converte `headers` para objeto chave-valor.
   - Se `auth` estiver configurado e o cabeçalho `Authorization` não estiver presente em `headers`:
     - `bearer`: adiciona `Authorization: Bearer <token>`.
     - `basic`: adiciona `Authorization: Basic <base64>`.
     - `apikey`: adiciona `<auth.key>: <auth.value>`.
   - Se houver corpo JSON e nenhum cabeçalho `Content-Type` configurado, adiciona `Content-Type: application/json`.
   - Formata cada cabeçalho como `-H '<Chave>: <Valor>'`.
4. **Corpo:**
   - Se houver corpo e o método permitir (`POST`, `PUT`, `PATCH`, `DELETE`):
     - Adiciona a flag `--data-raw '<corpo>'` (com escapes de aspas apropriados).
5. **Formatação Multilinha:** Cada flag principal (`-H`, `--data-raw`) é formatada em uma nova linha com `\\` ao final para máxima legibilidade no terminal.

---

### 4.3. Componente `CurlImportModal.tsx`

Componente de diálogo modal com suporte a acessibilidade (WAI-ARIA, foco automático, Escape para fechar) localizado em `frontend/src/components/request/CurlImportModal.tsx`:

- **Cabeçalho:** Título "Importar Requisição via cURL" e subtítulo explicativo com botão de fechar.
- **Área de Texto (Comando cURL):** Textarea com fonte monospace (`font-mono text-xs`), altura confortável (h-48), com placeholder demonstrando um comando cURL válido.
- **Feedback Dinâmico:** Conforme o usuário digita ou cola:
  - Se for um cURL válido: exibe um card com o método detectado (com as cores oficiais de método do ApiDot, ex.: verde para POST, azul para GET), URL identificada e contadores de headers e body.
  - Se for inválido: exibe mensagem de alerta contextualizada (ex.: "Nenhuma URL encontrada no comando cURL").
- **Campo "Nome da Requisição":** Input editável pré-preenchido automaticamente pela sugestão do parser.
- **Destino da Importação:** Exibe o nome da Coleção / Pasta onde o item será inserido.
- **Rodapé:** Botões "Cancelar" e "Importar Requisição" (desabilitado se o comando for inválido ou estiver vazio).

---

### 4.4. Integração na Árvore Lateral (`CollectionTree.tsx` e `page.tsx`)

1. **Menu de Contexto de Coleção e Pasta:**
   - No `CollectionTree.tsx`, adiciona a opção `{ id: 'import-curl', label: 'Importar cURL', icon: <Terminal className="w-4 h-4 text-emerald-400" /> }`.
   - Ao clicar, emite o callback `onImportCurl(collectionId, folderId)`.
2. **Menu de Contexto de Requisição:**
   - No menu de contexto de cada item de requisição, adiciona a opção `{ id: 'copy-curl', label: 'Copiar cURL', icon: <Copy className="w-4 h-4 text-neutral-300" /> }`.
   - Se o item for o que está aberto no editor (`node.id === activeRequestId`), utiliza os dados em memória do editor (`currentEditorData`) para exportar; caso contrário, utiliza os dados persistidos no nó da árvore.
   - Gera o comando cURL com as variáveis resolvidas do ambiente ativo e copia para o clipboard através de `navigator.clipboard.writeText`.
3. **Estado Global do Modal no `page.tsx`:**
   - Controla `isImportCurlModalOpen`, `importCurlTarget: { collectionId: string, folderId?: string }`.
   - Ao concluir a importação, cria a requisição no backend via `createRequest`, atualiza a árvore via `reloadTree`, seleciona a requisição importada e a abre no `RequestEditor`.

---

### 4.5. Integração no Editor de Requisições (`RequestEditor.tsx`)

Na barra de cabeçalho superior (ao lado do botão "Salvar" existente):
- Adiciona o botão **"Copiar cURL"** com ícone `Terminal`.
- Ao clicar, invoca a geração de cURL passando os dados atuais em edição no editor (incluindo alterações não salvas de URL, headers, body, auth e params) com interpolação das variáveis ativas do ambiente.
- Copia para `navigator.clipboard.writeText` e exibe feedback momentâneo com badge/ícone verde de check: *"Copiado!"* durante 2 segundos.

---

### 4.6. Integração no Painel de Resposta (`ResponseViewer.tsx`)

1. **Geração do `executedCurl` no Despacho (`handleSend` em `page.tsx`):**
   - No momento em que `handleSend` monta a requisição para disparo ao `/api/requests/execute` (com a URL final resolvida, todos os headers interpolados enviados e o corpo transmitido), ele gera a string `executedCurl` e a armazena no estado do `page.tsx`.
   - A prop `executedCurl?: string` é passada diretamente ao `ResponseViewer`.
2. **Ação no Cabeçalho do `ResponseViewer`:**
   - Na barra de status superior do painel de resposta (ao lado do botão existente "Copiar" que copia o corpo da resposta), adiciona o botão **"Copiar cURL"** com ícone `Terminal`.
   - O clique copia `executedCurl` para a área de transferência com feedback momentâneo de *"Copiado!"* por 2 segundos.
   - Se nenhuma requisição foi disparada ainda ou o disparo falhou antes da montagem da requisição, o botão permanece desabilitado.

---

## 5. Estratégia de Testes

### 5.1. Testes Unitários (`curlParser.test.ts`)
- Parse de GET simples: `curl https://api.example.com/users`.
- Parse de método explícito: `curl -X DELETE https://api.example.com/items/123`.
- Parse de múltiplos headers com diferentes flags (`-H`, `--header`).
- Parse de cookies (`-b 'session=abc; theme=dark'`).
- Parse de corpos com `-d`, `--data-raw`, JSON multilinha e caracteres especiais com escape.
- Parse de flags de DevTools de navegadores (`--compressed`, `-k`, `-s`).
- Parse de autenticação com `-u admin:secret123` e com header `Authorization: Bearer token123`.
- Parse de quebras de linha com `\`.
- Casos de erro e robustez: string vazia, texto aleatório que não é cURL, URLs sem protocolo.

### 5.2. Testes Unitários (`curlGenerator.test.ts`)
- Geração de comando cURL a partir de um `RequestData`.
- Geração com interpolação de variáveis de ambiente (`{{baseUrl}}` -> `https://api.dev.com`).
- Geração com resolução de path params (`:id` -> `42`).
- Formatação correta com quebras de linha (`\`) e escape de aspas.

### 5.3. Testes de Componente
- `CurlImportModal.test.tsx`:
  - Renderização inicial e foco automático.
  - Validação de entrada em tempo real.
  - Submissão com criação de requisição e fechamento do modal.
- `RequestEditor.test.tsx`:
  - Presença do botão "Copiar cURL".
  - Clique aciona `navigator.clipboard.writeText` e muda estado para "Copiado!".
- `ResponseViewer.test.tsx`:
  - Presença e funcionamento do botão "Copiar cURL" ao exibir uma resposta com `executedCurl`.
- `CollectionTree.test.tsx`:
  - Opção "Importar cURL" presente nos menus de contexto de coleções e pastas.
  - Opção "Copiar cURL" presente no menu de contexto de requisições.
