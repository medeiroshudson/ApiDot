# Design Técnico: Altura Total no CodeEditor, Sequência de Body e Padronização do ResponseViewer

**Data:** 2026-10-26  
**Status:** Aguardando Aprovação  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Frontend (Next.js 15 / React 19 / CodeMirror 6 / Tailwind CSS)

---

## 1. Intenção e Motivação (The Why)

Após a introdução do CodeMirror 6, dois pontos de experiência e consistência visual foram observados:
1. **Quebra de Altura e Espaçamento no Body/Headers:** Quando o corpo está em `JSON` ou `Texto`, o editor encolhia acompanhando apenas a quantidade de linhas digitadas, enquanto o estado `Nenhum` preenchia toda a área útil. O editor deve preencher 100% da área disponível para baixo, mantendo as linhas numeradas contínuas e rolagem estritamente interna quando o conteúdo for extenso, sem vazar para fora do layout.
2. **Sequência Intuitiva do Seletor:** A ordem das opções deve seguir a progressão de complexidade: `Nenhum` $\to$ `Texto` $\to$ `JSON`.
3. **Disparidade Visual na Resposta:** O `ResponseViewer` ainda utilizava o `SyntaxHighlighter` legado baseado em regex rudimentar, sem números de linha e sem as capacidades modernas do CodeMirror. Padronizar o visualizador de resposta com o `CodeEditor` em modo somente leitura (`readOnly`) unifica o design system da aplicação.

---

## 2. Decisões de Design e UX

### 2.1. Sequência do Seletor de Corpo
- No `RequestEditor`, a barra do Body exibe os botões na ordem:
  1. `Nenhum`
  2. `Texto`
  3. `JSON`

### 2.2. Preenchimento Total da Altura com Rolagem Interna Segura
- O `CodeEditor` passa a ter `height: 100%`, `min-height: 100%` e `overflow: hidden` no container externo.
- O `.cm-editor` e o `.cm-scroller` operam com `height: 100% !important`, `flex: 1`, `min-height: 0` e `overflow: auto`.
- **Prevenção de Vazamento (No Leak):** O painel pai (`panel-headers` e `panel-body`) aplica `flex-1 min-h-0 flex flex-col overflow-hidden`. Quando o payload tiver 5.000 linhas, a barra de rolagem ocorre estritamente dentro da calha do CodeMirror, sem expandir a página nem quebrar a barra inferior.

### 2.3. Padronização do `ResponseViewer` com `CodeEditor`
- As abas **Pretty** e **Raw** passam a utilizar o `CodeEditor` em modo somente-leitura (`readOnly = true`):
  - **Aba Pretty:** Tenta formatar como JSON indentado. Se o retorno for JSON válido, ativa `language="json"`. Se o retorno não for JSON (HTML de erro, XML ou texto), faz fallback automático transparente para `language="text"`.
  - **Aba Raw:** Exibe o payload bruto com `language="text"` e números de linha.
  - As métricas de status code, duração em ms, tamanho em bytes e botão de copiar são mantidas intactas no topo.

---

## 3. Abordagens Consideradas

### Abordagem 1: CodeEditor Unificado com Layout Flexbox Rígido (Escolhida)
- Utiliza a mesma biblioteca CodeMirror 6 tanto no RequestEditor quanto no ResponseViewer.
- Garante identidade visual idêntica (fontes, cores de sintaxe, numeração de linha e seleção).
- Regula `min-h-0` e `flex-1` em toda a cadeia de elementos pais para conter a rolagem 100% interna.

### Abordagem 2: Manter SyntaxHighlighter na Resposta (Descartada)
- Manteria código duplicado e dois estilos visuais diferentes no mesmo fluxo de trabalho. Descartada pelo usuário.
