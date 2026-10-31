# Documento de Design: Sistema de Internacionalização (i18n) en-US / pt-BR no ApiDot

**Data:** 2026-10-30  
**Status:** Proposto (Aguardando Aprovação)  
**Autor:** Hudson Medeiros & Orchestrator  
**Alvo:** `ApiDot.Web` (Next.js 15), `ApiDot.Server` (.NET 9), `ApiDot.Core`

---

## 1. Contexto e Motivação

O ApiDot está em processo de abertura pública de código no GitHub. Para acolher a comunidade internacional de desenvolvedores mantendo o suporte nativo ao público brasileiro, a aplicação precisa adotar **en-US (Inglês)** como o idioma padrão da plataforma e disponibilizar **pt-BR (Português do Brasil)** como opção configurável.

Hoje, todos os textos de interface, labels, tooltips, modais, placeholders e mensagens de status estão codificados de forma rígida em português (hardcoded) ao longo de mais de 40 componentes React e validados diretamente na suíte de testes do Vitest.

Além disso, é fundamental:
1. **Lembrar a preferência do usuário**: tanto localmente via `localStorage` (evitando layout shift antes do login) quanto no banco de dados para usuários autenticados.
2. **Aproveitar o SSO corporativo**: capturar a claim padrão `locale` do token OIDC emitido pelo Authentik durante o provisionamento Just-In-Time (JIT) ou no primeiro login, definindo o idioma inicial sem atrito.

---

## 2. Objetivos, Não-Objetivos e Anti-Objetivos

### Objetivos (Goals)
1. **Idioma Padrão en-US**: Toda a interface deve inicializar em inglês (`en-US`) por padrão para novos visitantes e acessos sem preferências prévias.
2. **Suporte Completo a pt-BR**: Dicionário integral em português cobrindo 100% dos textos visíveis na interface (cabeçalho, barra lateral, árvore de coleções, editor de requisições, visualizador de respostas, modais de configuração, ambientes e telas de autenticação).
3. **Persistência Híbrida Inteligente**:
   - **Local (`localStorage`)**: Carregamento imediato no client-side para evitar flashes de tradução.
   - **Servidor (`ApiDot.Server`)**: Persistência do campo `Locale` na entidade `User` com sincronização via endpoint dedicado `PATCH /api/auth/me/locale`.
4. **Integração com Claim Padrão de SSO**: Ler a claim padrão `locale` no `OnTokenValidated` do OpenID Connect e persistir no usuário durante o provisionamento JIT ou se o usuário não possuir locale configurado.
5. **Arquitetura Leve e Tipada com Zustand**: Criar um store dedicado `useI18nStore` e hook `useTranslation()` (`t(key, params)`), com validação estrita de chaves pelo TypeScript em tempo de compilação sem dependências externas adicionais no bundle.
6. **Seletor de Idioma Amigável**: Disponibilizar o controle de troca de idioma na aba "General & Interface" do modal de configurações globais (`GlobalSettingsModal`) e no menu de usuário no `AppHeader`.
7. **Troca Instantânea Sem Recarregar**: Mudança de idioma reativa em memória sem necessidade de refresh na página nem alteração nas URLs.
8. **Paridade e Atualização dos Testes**: Manter 100% dos 825 testes do frontend e 513 testes do backend passando, atualizando asserções literais de interface para os novos padrões em inglês.

### Não-Objetivos (Non-Goals)
1. **Roteamento por Prefixo de URL (`/[locale]/...`)**: O ApiDot é uma SPA técnica orientada a workspace; o idioma não alterará a semântica de rotas existentes (`/workspace/[id]/request/[id]`), mantendo deep-links intactos.
2. **Tradução de Payloads e Dados de Domínio**: Respostas de APIs testadas, nomes customizados de coleções/pastas criadas pelo usuário e logs brutos de execução não são traduzidos.
3. **Mecanismo Avançado de Plurais Complexos (ICU syntax completa)**: Uma interpolação simples de variáveis (`t('tree.itemsCount', { count: 5 })`) e chaves específicas suprem plenamente o par `en-US` e `pt-BR`.
4. **Carregamento Dinâmico Remoto via CDN**: Os dicionários serão embutidos no bundle da aplicação para garantir disponibilidade offline e zero latência de rede.

### Anti-Objetivos (Anti-Goals)
1. **Sem Bibliotecas Pesadas de Terceiros**: Não introduzir `next-intl` ou `i18next` que adicionariam 45-50 KB ao bundle e exigiriam envelopar componentes em Providers nos 47 arquivos de teste do Vitest.
2. **Sem Texto em Branco por Falta de Tradução (Fallback Silencioso)**: Se uma chave não existir no dicionário ativo (`pt-BR`), o sistema faz fallback imediato para o dicionário padrão (`en-US`), e se ainda assim faltar, renderiza a própria chave para auditoria visual em desenvolvimento.
3. **Sem Bloqueio de Inicialização**: A detecção ou sincronização de locale não deve bloquear a inicialização ou renderização do workspace.

---

## 3. Abordagens Consideradas e Decisão

### Abordagem 1: Store Nativa em Zustand com Dicionários Tipados (Escolhida)
- Dicionários TypeScript (`en-US.ts` e `pt-BR.ts`) com verificação estrita de propriedades idênticas.
- Store `useI18nStore` persistida via `localStorage` e hook `useTranslation()`.
- **Vantagens**: Zero dependências externas; integração direta com o ecossistema existente (`useAuthStore`, `useLayoutStore`); tipagem estrita no TypeScript (autocomplete e checagem de erros); execução limpa em testes sem dependência de Context Providers; tamanho mínimo no bundle.
- **Desvantagem**: Necessidade de manter uma função simples de interpolação própria.

### Abordagem 2: `next-intl` (Descartada)
- Biblioteca padrão para Next.js App Router com `NextIntlClientProvider`.
- **Desvantagens**: Exige configurar provedores em todos os 47 arquivos de teste de componentes do Vitest ou mockar a biblioteca globalmente; tende a acoplar o idioma à estrutura de rotas; complexidade desnecessária para um app com estado em Zustand.

### Abordagem 3: `i18next` + `react-i18next` (Descartada)
- Stack clássica de tradução para React.
- **Desvantagens**: Adiciona de 45 a 50 KB de dependências; potencial risco de problemas de hidratação no React 19/SSR; overhead de configuração.

---

## 4. Arquitetura Detalhada e Modelagem

### 4.1 Backend (.NET 9)

#### 4.1.1 Entidade `User` (`Data/Entities/User.cs`)
Adicionar a propriedade `Locale`:
```csharp
[MaxLength(16)]
public string? Locale { get; set; }
```

#### 4.1.2 Configuração EF Core (`Data/Configurations/UserConfiguration.cs`)
```csharp
builder.Property(u => u.Locale)
    .HasMaxLength(16)
    .IsRequired(false);
```
Criar uma nova migração EF Core: `AddUserLocale`.

#### 4.1.3 Contratos de DTO (`Models/AuthModels.cs`)
```csharp
public record UpdateLocaleRequest(string Locale);

public record AuthUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    bool IsRoot,
    string? Locale,
    IReadOnlyList<AuthWorkspaceDto> Workspaces);
```

#### 4.1.4 Extração da Claim Padrão de SSO (`Extensions/ServiceCollectionExtensions.cs`)
No evento `OnTokenValidated` do OpenID Connect:
```csharp
var localeClaim = principal?.FindFirst("locale")?.Value;
var normalizedLocale = NormalizeLocale(localeClaim);

var user = await authService.ProcessOidcLoginAsync(
    sub,
    email,
    name,
    iss,
    normalizedLocale,
    context.HttpContext.RequestAborted);
```

Método de normalização:
```csharp
private static string? NormalizeLocale(string? locale)
{
    if (string.IsNullOrWhiteSpace(locale)) return null;
    var clean = locale.Trim().ToLowerInvariant();
    if (clean.StartsWith("pt")) return "pt-BR";
    if (clean.StartsWith("en")) return "en-US";
    return null;
}
```

#### 4.1.5 Serviço de Autenticação (`Services/AuthService.cs`)
No método `ProcessOidcLoginAsync`:
- Se for criação de novo usuário JIT: inicializa `Locale = normalizedLocale ?? "en-US"`. Workspace pessoal padrão nomeado em inglês: `"My Workspace"`.
- Se for usuário existente com conta vinculada: se `user.Locale` estiver nulo e o claim estiver presente, atualiza para `normalizedLocale`. Se o usuário já tiver um `Locale` explicitamente definido no banco, preserva a escolha do usuário sem sobrescrever.

Adicionar método para atualização de locale:
```csharp
Task<bool> UpdateUserLocaleAsync(Guid userId, string locale, CancellationToken ct);
```

#### 4.1.6 Endpoints de Autenticação (`Endpoints/AuthEndpoints.cs`)
Adicionar endpoint para atualização de locale:
- `PATCH /api/auth/me/locale`
  - Valida se o locale é suportado (`"en-US"`, `"pt-BR"`).
  - Atualiza o registro no banco via `UpdateUserLocaleAsync`.
  - Retorna `204 NoContent` ou `400 BadRequest`.

---

### 4.2 Frontend (Next.js 15 / React 19)

#### 4.2.1 Estrutura de Arquivos
```
frontend/src/i18n/
  ├── types.ts              // Tipagem de dicionário e chaves
  ├── locales/
  │   ├── en-US.ts          // Dicionário canônico (Inglês)
  │   └── pt-BR.ts          // Dicionário secundário (Português)
  └── index.ts              // Funções getTranslation, interpolate, fallbacks
frontend/src/stores/
  └── useI18nStore.ts       // Zustand store com persistência localStorage e sync backend
frontend/src/hooks/
  └── useTranslation.ts     // Hook utilitário useTranslation()
```

#### 4.2.2 Tipagem Estrita (`src/i18n/types.ts`)
```typescript
import type enUS from './locales/en-US';

export type Locale = 'en-US' | 'pt-BR';

export type TranslationSchema = typeof enUS;

// Utilitário recursivo para extrair chaves pontuadas ("header.globalSettings")
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationSchema>;

export type InterpolationParams = Record<string, string | number>;
```

#### 4.2.3 Store Zustand (`src/stores/useI18nStore.ts`)
```typescript
export interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale, syncBackend?: boolean) => Promise<void>;
  initFromUser: (serverLocale?: string | null) => void;
}
```
- Armazena a chave persistida em `localStorage` sob `apidot_locale`.
- No `initFromUser`: se o usuário autenticado trouxer `locale` do backend, atualiza o store se for diferente do atual.
- No `setLocale`: atualiza o estado imediatamente, persiste no `localStorage`, e se o usuário estiver autenticado, dispara `PATCH /api/auth/me/locale` de forma não bloqueante.

#### 4.2.4 Hook `useTranslation` (`src/hooks/useTranslation.ts`)
```typescript
export function useTranslation() {
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);

  const t = (key: TranslationKey, params?: InterpolationParams): string => {
    return translate(locale, key, params);
  };

  return { t, locale, setLocale };
}
```

#### 4.2.5 Resolução de Idioma e Ciclo de Vida
1. **Primeiro Acesso Anônimo**:
   - `localStorage.getItem('apidot_locale')` -> Se vazio, adota estritamente `"en-US"` por padrão, prevenindo descompassos de hidratação SSR (Next.js 15) e garantindo determinismo total na suíte de testes.
2. **Login com SSO**:
   - O backend extrai a claim `locale` e salva no `User`.
   - Ao carregar a aplicação, `useAuthStore.checkAuth()` obtém o `AuthUserDto` contendo `locale`.
   - O frontend sincroniza `useI18nStore` com a preferência do usuário.
3. **Alteração Manual pelo Usuário**:
   - O usuário escolhe no seletor de idiomas (no modal de configurações globais ou menu do cabeçalho).
   - O frontend atualiza a store e o `localStorage` imediatamente.
   - Dispara requisição assíncrona para `PATCH /api/auth/me/locale` para persistir no backend.

---

### 4.3 Dicionários de Tradução e Módulos de Interface

Os dicionários cobrirão todos os domínios da interface divididos por seções lógicas:
- `common`: Ações globais (`save`, `cancel`, `delete`, `edit`, `create`, `close`, `copy`, `copied`, `loading`, `error`, `actions`, `search`).
- `header`: Elementos do cabeçalho (`noEnvironment`, `environments`, `globalSettings`, `logout`, `account`, `roles`).
- `sidebar`: Árvore de navegação e workspaces (`workspace`, `newWorkspace`, `collections`, `newCollection`, `newFolder`, `newRequest`, `emptyWorkspace`, `deleteConfirm`).
- `request`: Editor de chamadas HTTP (`method`, `send`, `sending`, `params`, `headers`, `auth`, `body`, `spec`, `inheritAuth`, `noAuth`, `basicAuth`, `bearerToken`, `saveRequest`).
- `response`: Painel de resposta (`status`, `time`, `size`, `waterfall`, `headers`, `cookies`, `raw`, `preview`, `emptyResponse`).
- `settings`: Configurações globais e de coleções (`title`, `generalTab`, `agentsTab`, `language`, `languageDesc`, `sidebarWidth`, `resetDefault`, `devices`, `registerDevice`).
- `environments`: Modal de variáveis e ambientes (`title`, `globalsTab`, `collectionTab`, `environmentsTab`, `computedTab`, `addVariable`, `variableName`, `initialValue`, `currentValue`).
- `auth`: Autenticação e login (`loginTitle`, `loginSubtitle`, `email`, `password`, `signIn`, `ssoSignIn`, `errorInvalidCredentials`).

---

## 5. Estratégia de Testes e Migração

1. **Testes do Backend**:
   - `AuthEntityPersistenceTests`: validar persistência e default `"en-US"` do campo `Locale` na entidade `User`.
   - `AuthEndpointsTests`:
     - Testar `GET /api/auth/me` retornando o campo `locale`.
     - Testar `PATCH /api/auth/me/locale` com sucesso (`204`) e com locale inválido (`400`).
     - Testar `ProcessOidcLoginAsync` persistindo a claim `locale` vinda do token OIDC.
2. **Testes do Frontend**:
   - `useI18nStore.test.ts`: testar inicialização com `en-US`, alternância para `pt-BR`, persistência em `localStorage` e chamada de sincronização com o backend.
   - `useTranslation.test.ts`: testar busca de chaves aninhadas, interpolação de parâmetros e fallback de chave faltante.
   - **Atualização dos 47 Testes Existentes (825 testes)**:
     - Como a aplicação passa a iniciar em `en-US` por padrão, os testes de componentes que procuram textos literais em português (como `'Salvar'`, `'Configurações Globais'`, `'Sem Ambiente'`, `'Coleções & Pastas'`, `'Excluir'`) serão atualizados para seus equivalentes em inglês (`'Save'`, `'Global Settings'`, `'No Environment'`, `'Collections & Folders'`, `'Delete'`).
     - Adicionar testes cobrindo a alternância de idioma na interface.

---

## 6. Procedimento de Rollback e Segurança

- **Banco de Dados**: A migração adiciona apenas uma coluna de texto (`Locale`) com valor padrão `"en-US"`, sem operações destrutivas ou quebra de dados legados.
- **Frontend**: Se o seletor falhar ou um locale corrompido for gravado no storage, o sistema faz fallback estrito e imediato para `en-US`.
- **Compatibilidade Retroativa**: A API aceita requisições sem o campo `Locale`, mantendo compatibilidade total com versões anteriores de clientes ou agentes.
