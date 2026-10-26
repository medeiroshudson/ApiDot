# Design Técnico: Padronização do RequestEditor com CodeMirror 6 e Abas na Coleção

**Data:** 2026-10-26  
**Status:** Aprovado para Planejamento  
**Autor:** Hudson Medeiros & Orchestrator  
**Escopo:** Frontend (Next.js 15 / React 19 / CodeMirror 6 / Tailwind CSS)

---

## 1. Intenção e Motivação (The Why)

Atualmente, o painel de requisições (`RequestEditor`) apresenta problemas de consistência visual, ausência de ferramentas de código modernas e poluição no fluxo de edição:
1. **Desproporção de Escala:** Os botões e campos de entrada na barra de URL usam alturas exageradas (`h-11 sm:h-12` -> 44px–48px) em forte contraste com a barra lateral e o cabeçalho (`h-8`/`h-9`, 32px–36px).
2. **Poluição do Fluxo de Edição:** O seletor estático de "Alvo" e o botão "Vincular" ocupavam espaço fixo na barra de abas da requisição. O alvo pertence hierarquicamente à **Coleção**, e os vínculos pertencem à inspeção da coleção.
3. **Escrevabilidade e Ausência de Linting:** Os campos de Headers e Body utilizavam `<textarea>` simples, sem destaque de sintaxe, sem validação visual de erros em JSON e sem suporte à tecla <kbd>Tab</kbd> para indentar.
4. **Intellisense Deslocado:** O menu de autocomplete de variáveis (`{{`) e de response chaining (`{{$request[`) abria fixo abaixo do textarea em vez de flutuar na coordenada exata do cursor.

---

## 2. Decisões de Design e UX

### 2.1. Escala Compacta (Design System)
- Barra de URL padronizada para altura `h-9` (36px):
  - Seletor de método HTTP compacto: `h-9 text-xs font-bold px-2.5 rounded-md`.
  - Input de URL: `h-9 text-xs sm:text-sm font-mono px-3 rounded-md`.
  - Botão de envio dividido (*split button*): `h-9 rounded-md`.
- Barra de título da requisição mantida em `h-9` com nome e botão "Salvar".
- Abas da requisição simplificadas: apenas `Headers`, `Body`, `Auth`.

### 2.2. Botão de Envio Dividido com Alvo Rápido (Split Button `[ Enviar | ▾ ]`)
- **Regra de Priorização:**
  - Se nenhum override manual for selecionado e o Agent estiver online: prioriza execução via **Agent Local**.
  - Se a coleção estiver configurada como Server (ou agent offline): prioriza **Servidor Nuvem**.
- **Comportamento do Dropdown (Chevron ▾):**
  - Permite disparar pontualmente pelo alvo alternativo sem precisar reconfigurar a coleção:
    - Quando o alvo principal for Agent: opção no menu é **"Executar no Servidor Nuvem"**.
    - Quando o alvo principal for Servidor: opção no menu é **"Executar no Agent Local"** (desabilitada e identificada como indisponível se o Agent estiver offline).

### 2.3. CodeMirror 6 nos Campos de Headers e Body
- Biblioteca consolidada `@uiw/react-codemirror` com extensões `@codemirror/lang-json` e `@codemirror/lint`:
  - **Headers e Body em JSON Estrito:** Ambos os campos utilizam validação estrita JSON com marcação visual de erros de sintaxe (linhas onduladas vermelhas e mensagens de lint).
  - **Identação Nativa:** Pressionar <kbd>Tab</kbd> insere 2 espaços de indentação; <kbd>Shift+Tab</kbd> recua.
  - **Cursor e Intellisense:** Cálculo de coordenadas em pixels do cursor (`view.coordsAtPos(pos)`) para renderizar o popover de sugestões (`RequestAutocomplete`) flutuando na posição exata de digitação.

### 2.4. Abas Dedicadas no `CollectionSettingsModal`
Organizado em 3 abas no cabeçalho do modal:
1. **Geral & Alvo:**
   - Edição do Nome da Coleção.
   - Seletor de Alvo de Execução padrão (`Inherit`, `Server`, `Agent`).
2. **OpenAPI / Sync:**
   - URL e conteúdo da especificação OpenAPI.
   - Botão para sincronização e cards de auditoria estatística.
3. **Vínculos & Dependências:**
   - Lista/grafo das requisições da coleção que utilizam response chaining (`{{$request[...]}}`).
   - Botão para copiar tokens prontos de dependência para a área de transferência.
- **Rodapé Unificado:** Um único botão **"Salvar Alterações"** persiste nome, alvo e especificação da coleção.
