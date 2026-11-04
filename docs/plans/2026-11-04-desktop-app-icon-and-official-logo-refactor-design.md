# Design Document: Refatoração do Ícone Desktop e Alinhamento da Logo Oficial

**Data:** 2026-11-04  
**Status:** Proposto para aprovação  
**Branch:** `refactor/app-icon`

---

## 1. Contexto e Motivação

O ícone do aplicativo desktop ApiDot (`desktop/app-icon.svg`) foi gerado originalmente com preenchimento de 100% do canvas (512×512 px) e cor azul (`#3b82f6`). Isso violava as diretrizes de design do macOS (Apple Human Interface Guidelines), fazendo com que o ícone ficasse desproporcionalmente grande no Dock do macOS por não possuir a margem de respiro e a sombra nativa esperadas pelo sistema. Além disso, o tom azul e o traço genérico não representavam a identidade oficial do ApiDot, cujos arquivos em `assets/` trazem tipografia de arestas retas/sharp e um ponto verde característico (`#86BC25`).

Durante o alinhamento visual, foi identificado também que a logo oficial se beneficia de um ponto verde mais robusto (~28% da altura da tipografia) com efeito de *overlapping* sobre a letra "I" utilizando recorte negativo (*knockout notch* com respiro de 4 px).

---

## 2. Metas, Não-Metas e Anti-Metas

### Metas (Goals)
- Refatorar a logo oficial em `assets/api-dot-black.svg` e `assets/api-dot-white.svg` aumentando o raio do ponto verde para `r = 22` (diâmetro de 44 px em relação à altura de 160 px da letra) e aplicando sobreposição com recorte negativo de 4 px na base direita da letra "I".
- Criar o SVG master `desktop/app-icon.svg` em 1024×1024 px, estritamente em conformidade com as diretrizes do macOS HIG: squircle de 824×824 px centralizado em `(100, 100)`, margens de respiro de 100 px em todos os lados, curvatura contínua Apple (`rx=185`), sombra de contato nativa e aro perimetral sutil.
- Aplicar a estética **Dark Obsidian** no ícone desktop (gradiente de `#1c1d21` para `#0b0c0e`, letras em branco puro `#FFFFFF` e o ponto verde oficial `#86BC25`).
- Implementar pipeline automatizada no `desktop/package.json` utilizando `@tauri-apps/cli icon` para regerar os pacotes nativos `icon.icns` (macOS), `icon.ico` (Windows) e a grade de PNGs (Linux e Windows Store).
- Adicionar validação automatizada de integridade dos ícones nos testes do desktop (`npm test`).

### Não-Metas (Non-Goals)
- Alterar telas internas do frontend web ou componentes React fora do escopo de identidade e ícones.
- Modificar lógicas de runtime ou comunicação do Tauri com o sidecar .NET.

### Anti-Metas (Anti-Goals)
- Manter qualquer traço azul ou geometria genérica anterior.
- Sangrar o ícone até as bordas (0 px de margem) ou depender de comandos manuais dependentes do host (como scripts shell com `iconutil` do macOS).

---

## 3. Restrições e Padrões de Plataforma

1. **macOS Human Interface Guidelines (macOS 15/16/Sequoia/Tahoe):**
   - Canvas master: 1024×1024 px transparente.
   - Área útil do corpo (squircle): 824×824 px centralizada em `(100, 100)`.
   - Margens perimetrais: 100 px nos quatro lados.
   - Curvatura: Superelipse contínua (`rx=185`).
   - Sombra nativa integrada: `feDropShadow` com `dx="0"`, `dy="24"`, `stdDeviation="28"`, `flood-opacity="0.45"`.
2. **Identidade Visual Oficial ApiDot:**
   - Tipografia: "API." com arestas retas/vivas (*sharp edges* e *tight tracking*).
   - Cores: Fundo Dark Obsidian (`#1c1d21` / `#0b0c0e`), tipografia branca (`#FFFFFF`) na versão escura e preta (`#111111`) na versão clara. Ponto verde característico `#86BC25`.
   - Proporção do ponto: Diâmetro 44 px (`r = 22`) sobre altura de 160 px da letra.
   - Interseção: O ponto invade 10 px na base direita da letra "I", com máscara de recorte (*knockout mask*) de 4 px de respiro ao redor da sua circunferência (`r = 26`).

---

## 4. Abordagens Avaliadas

### Abordagem 1: Pipeline Nativa com `@tauri-apps/cli` e Script NPM (Escolhida)
- SVG master 1024×1024 px em `desktop/app-icon.svg` contendo a geometria precisa, squircle e efeitos de sombra.
- Script `"icon": "tauri icon app-icon.svg"` adicionado em `desktop/package.json`.
- Geração atômica de `desktop/src-tauri/icons/` com `npx @tauri-apps/cli icon desktop/app-icon.svg`.
- *Motivo da escolha:* Multiplataforma, 100% reproduzível, sem ferramentas externas legadas e totalmente integrado à CLI do Tauri.

### Abordagem 2: Scripts Shell com Utilitários Proprietários do macOS (`iconutil` / `sips`)
- *Descartada:* Dependente de ferramentas nativas do macOS, incompatível com ambientes Linux/CI e sujeita a quebras de pipeline.

---

## 5. Especificação Técnica Detalhada

### 5.1. Logo Oficial (`assets/api-dot-white.svg` e `assets/api-dot-black.svg`)
- **ViewBox:** `0 0 356 160`
- **Letras A, P, I:** Preservadas com suas arestas retas originais.
- **Máscara de Recorte no "I":**
  ```xml
  <defs>
    <mask id="cutout-mask">
      <rect x="0" y="0" width="356" height="160" fill="#fff" />
      <circle cx="312" cy="138" r="26" fill="#000" />
    </mask>
  </defs>
  <g fill="#FFFFFF" mask="url(#cutout-mask)">
    <!-- Letra A -->
    <!-- Letra P -->
    <!-- Letra I: <rect x="268" y="0" width="32" height="160" /> -->
  </g>
  <circle cx="312" cy="138" r="22" fill="#86BC25" />
  ```
- No arquivo `api-dot-black.svg`, a cor do grupo de letras é `#111111` mantendo a mesma máscara e o ponto `#86BC25`.

### 5.2. Ícone Master do Desktop (`desktop/app-icon.svg`)
- **Canvas:** `1024×1024 px`
- **Defs:**
  - `linearGradient id="grad-obsidian"`: `#1c1d21` -> `#0b0c0e` (vertical).
  - `linearGradient id="border-obsidian"`: `rgba(255,255,255,0.18)` -> `rgba(255,255,255,0.02)`.
  - `filter id="shadow-mac"`: `feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000000" flood-opacity="0.45"`.
- **Estrutura:**
  1. Base de sombra: `<rect x="100" y="100" width="824" height="824" rx="185" fill="#000" filter="url(#shadow-mac)"/>`
  2. Corpo do squircle: `<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#grad-obsidian)"/>`
  3. Aro perimetral: `<rect x="101" y="101" width="822" height="822" rx="184" fill="none" stroke="url(#border-obsidian)" stroke-width="2"/>`
  4. Logo Oficial centralizada:
     - Escala ~1.5x aplicada via `transform="translate(245, 392) scale(1.5)"`.
     - Logo vetorial completa com a máscara de recorte e o ponto verde `#86BC25`.

### 5.3. Pipeline e Artefatos Tauri
- Comando: `npx @tauri-apps/cli icon desktop/app-icon.svg -o desktop/src-tauri/icons`
- Arquivos atualizados em `desktop/src-tauri/icons/`:
  - `icon.icns`
  - `icon.ico`
  - `icon.png` (512×512)
  - `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`
  - `Square30x30Logo.png`, `Square44x44Logo.png`, `Square71x71Logo.png`, `Square89x89Logo.png`, `Square107x107Logo.png`, `Square142x142Logo.png`, `Square150x150Logo.png`, `Square284x284Logo.png`, `Square310x310Logo.png`, `StoreLogo.png`
- Script no `desktop/package.json`:
  - `"icon": "tauri icon app-icon.svg"`

### 5.4. Validação Automatizada (`desktop/validate-icons.js`)
- Novo script de teste adicionado à suíte (`npm test` no `desktop/`):
  - Valida a existência de `desktop/app-icon.svg` com `width="1024"` e `height="1024"`.
  - Valida a existência e não-vacuidade de `icon.icns`, `icon.ico` e `icon.png`.
  - Valida ausência da cor antiga `#3b82f6` e presença da cor `#86BC25`.

---

## 6. O que Fica a Cargo do Construtor (Implementation Steps)

1. Atualizar `assets/api-dot-white.svg` e `assets/api-dot-black.svg` com a nova calibração do ponto e o recorte negativo de 4 px.
2. Copiar os arquivos atualizados de `assets/` para a worktree caso ainda não estejam rastreados pelo git.
3. Construir `desktop/app-icon.svg` com as métricas de 1024×1024 px do macOS HIG.
4. Adicionar o script `"icon": "tauri icon app-icon.svg"` em `desktop/package.json`.
5. Executar a geração de ícones via Tauri CLI.
6. Criar `desktop/validate-icons.js` e adicioná-lo ao `npm test` do `desktop/package.json`.
7. Executar a suíte de testes do desktop para garantir passagem limpa (`npm test`).
