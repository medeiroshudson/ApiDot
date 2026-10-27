# Design Doc: Componente Canônico Input com Suporte a Auto-grow

## 1. Intenção e Motivação
Em telas de notebook (1280px a 1440px), o espaço horizontal do painel de requisição do ApiDot é restrito, fazendo com que URLs longas sejam cortadas. Em vez de acoplar a lógica de expansão diretamente dentro do `RequestEditor`, a solução canônica e reutilizável é criar o componente `Input` em `frontend/src/components/common/Input.tsx`.

Esse componente servirá como o elemento de entrada padrão do design system do ApiDot, suportando tanto o modo nativo de input de linha única quanto o modo `autoGrow` (para URLs e outros campos textuais que se beneficiam de expansão vertical sob demanda).

## 2. Metas, Não-Metas e Anti-Metas
- **Metas:**
  - Criar o componente canônico `Input` (`frontend/src/components/common/Input.tsx`) com suporte a `forwardRef` para `HTMLInputElement | HTMLTextAreaElement`.
  - Implementar a prop booleana `autoGrow?: boolean` (padrão: `false`).
  - Quando `autoGrow=false` (padrão): renderiza um `<input>` estilizado conforme o padrão visual escuro do ApiDot (`h-9`, bg neutro, bordas suaves, focus ring azul, estados de erro/disabled).
  - Quando `autoGrow=true`: renderiza um `<textarea rows={1}>` elástico que:
    - Inicia com altura base de 36px (`min-h-[36px]`).
    - Ao receber foco (`focus`), expande dinamicamente para até 3 linhas (`max-h-[84px]`, com `word-break: break-all`).
    - Ao perder o foco (`blur`), recolhe suavemente para a altura de 1 linha (36px).
    - Impede quebra de linha com a tecla `Enter` e remove quebras acidentais de paste (`\r\n`).
  - Adicionar prop opcional `maxRows?: number` (padrão: `3`).
  - Integrar o novo componente `Input` no `RequestEditor.tsx` no campo de URL com `autoGrow={true}`.
  - Garantir interoperabilidade total com `RequestAutocomplete`, validações de erro e testes unitários.
- **Não-Metas:**
  - Alterar outros inputs existentes do sistema que não necessitam de autoGrow nesta entrega (manter refatorações pontuais e seguras).
- **Anti-Metas:**
  - Não introduzir duplicação de lógica de styling ou expansão fora do componente `Input`.
  - Não quebrar o comportamento de envio com a tecla `Enter` nem a navegação de autocomplete.

## 3. Restrições e Compatibilidade
- React 19 / Next.js 15, Tailwind CSS.
- TypeScript estrito: tipagem polimórfica ou unificada de atributos de input/textarea via `forwardRef`.
- `RequestAutocomplete` deve continuar recebendo o ref com compatibilidade para `HTMLInputElement | HTMLTextAreaElement`.

## 4. Abordagens Consideradas
1. **Componente Canônico `Input` com Prop `autoGrow` (Escolhida):**
   - Cria `frontend/src/components/common/Input.tsx`.
   - Isola estilos canônicos do design system do ApiDot e toda a inteligência de foco/redimensionamento.
   - *Por que foi escolhida:* Centraliza a responsabilidade, facilita reuso em outras telas (como headers, params e body form-data) e mantém o `RequestEditor` limpo e focado no fluxo de envio.
2. **Implementação Ad-hoc inline no `RequestEditor`:**
   - *Descartada:* Dificulta a reutilização e sobrecarrega o `RequestEditor` com lógica de manipulação direta de DOM do textarea.

## 5. Especificação do Componente `Input`
- **Arquivo:** `frontend/src/components/common/Input.tsx` e `frontend/src/components/common/Input.test.tsx`.
- **Interface de Props:**
  ```typescript
  export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    autoGrow?: boolean;
    maxRows?: number;
    error?: boolean;
    // Permite handlers e atributos comuns de textarea quando autoGrow=true
    textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  }
  ```
- **Comportamento quando `autoGrow=true`:**
  - Renderiza tag `<textarea rows={1}>`.
  - Manipula `onFocus` e `onBlur` com toggle de classe/estilo de expansão (`isFocused`).
  - Manipula `onKeyDown`: dispara callbacks normais; caso `e.key === 'Enter'`, previne inserção de `\n`.
  - Manipula `onChange`: filtra `\r` e `\n` da string antes de repassar ao `onChange`.
- **Adoção no `RequestEditor`:**
  - Substitui o `<input ...>` nativo por `<Input autoGrow ... />`.
  - O seletor de Método e o botão Enviar permanecem ancorados ao topo com 36px (`items-start`).

## 6. Testes Automatizados
- Testes dedicados em `Input.test.tsx`:
  - Renderiza como `<input>` padrão quando `autoGrow` é falso/omitido.
  - Renderiza como `<textarea>` quando `autoGrow=true`.
  - Expande no foco e contrai no blur.
  - Bloqueia `\n` no pressionamento de `Enter`.
  - Sanitiza quebras de linha em colagens de texto.
  - Propaga refs corretamente para o elemento subjacente.
- Validação da suíte de regressão em `RequestEditor.test.tsx` e `RequestAutocomplete.test.tsx`.
