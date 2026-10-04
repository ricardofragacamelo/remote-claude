# Plano 21 — Rich previews

**Objetivo:** o PDF se lê como num leitor de verdade (rolagem corrida, zoom, ajuste à largura, índice,
miniaturas, busca, texto selecionável e links), e o markdown desenha tabelas largas sem quebrar o layout
e blocos `mermaid` como diagramas, em todo lugar onde markdown aparece.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

**Depende de:** [plano 07 — Explorer e editor](../07-explorer-and-editor/README.md) (a prévia de PDF e de
markdown da B-50, a [D-18](../07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia))
e [plano 08 — Painel do Claude](../08-claude-panel/README.md) (o `Markdown` único e o markdown do modelo
como conteúdo não confiável). **Não depende** dos planos 10…20, e nenhum deles depende deste
([D-01](decisions.md#f0--normas)).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Em 2026-10-03 o usuário abriu um PDF no workbench e leu "Page 1 could not be drawn." sobre a página que
estava desenhada. Na mesma conversa pediu mais três coisas: um leitor de PDF com zoom, ajuste à largura,
leitura corrida e índice; tabelas de markdown que não quebrem; e diagramas `mermaid` desenhados.

| O que o usuário vê | Causa no código | O que este plano faz |
|---|---|---|
| "Page 1 could not be drawn." sobre a página desenhada | o efeito do `PdfPreview` roda duas vezes no `StrictMode` e manda dois `render()` ao mesmo canvas; o pdf.js recusa o segundo. Em produção, o mesmo acontece ao trocar de página antes do fim do desenho | o desenho de uma página deixada para trás é cancelado (B-03, **já entregue**, antes do plano) |
| Uma página por vez, sem zoom, sem índice | o `PdfPreview` desenha **um** canvas com "anterior / próxima" | o leitor do pdf.js (`PDFViewer`): rolagem corrida, zoom, ajustes, camada de texto e de links (F1); índice, miniaturas e busca (F2) |
| Tabela larga empurra a prévia para fora da coluna, células coladas | `<table>` sem contêiner que role, sem padding vertical, sem alinhamento ao topo | tabela no molde do GitHub, que rola na própria caixa (F3) |
| Bloco `mermaid` aparece como código | o `Markdown` não conhece diagramas | o bloco `mermaid` vira SVG, em todo `Markdown`: prévia, resposta do Claude e plano para aprovar (F3) |

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **O leitor é o do pdf.js, não um nosso** ([D-04](decisions.md#f1--leitor-de-pdf)) | o `pdfjs-dist` já traz `PDFViewer`, `PDFLinkService` e `PDFFindController`: rolagem virtualizada (só desenha o que está perto da vista), zoom, ajustes, camada de texto, links e busca. Reescrever isso é meses de bug que o Firefox já corrigiu. Miniaturas não vêm no pacote e são nossas ([D-11](decisions.md#f2--navegação-no-pdf)) |
| **Diagrama é SVG inline, sanitizado por nós** ([D-02](decisions.md#f0--normas), [ADR-020](../../architecture/shared/00-decisions.md)) | escolha do usuário: texto selecionável e links do diagrama funcionando. O preço é superfície de XSS sobre conteúdo não confiável, e por isso são três camadas: `securityLevel: 'strict'` do Mermaid, um passe do DOMPurify nosso sobre o SVG, e a regra de link do produto (`http`, `https`, `mailto`, nova aba) |
| **Motores atrás de porta, carregados sob demanda** | pdf.js e Mermaid não rodam no jsdom (sem layout, sem canvas). O padrão do 07 (`PdfEngine` + fake) se estende: o leitor e o Mermaid ficam atrás de portas, testados por fake na integração e de verdade no e2e. Os dois só entram em chunks que um `import()` alcança (o `editor-bundle` reprova o contrário) |

---

## Escopo

### Entra

| | |
|---|---|
| As normas do leitor de PDF e dos diagramas em `web/03`, a ADR-020, as chaves i18n, o conserto do desenho cancelado e os PDFs de fixture | F0 |
| O leitor: rolagem corrida, indicador e "ir para a página", zoom e ajustes, texto selecionável, links, PDF com senha, posição e zoom lembrados por aba | F1 |
| A navegação: painel lateral com índice (outline) e miniaturas, e a busca (Ctrl+F) | F2 |
| Tabelas que não quebram, o bloco `mermaid` como diagrama em todo `Markdown`, com streaming e tema | F3 |
| E2E: o leitor, a navegação, as tabelas e os diagramas pela porta do usuário, com acessibilidade | F4 |

### Não entra

- **Formulários e JavaScript do PDF.** O leitor desenha e lê, não preenche nem executa
  ([07 · D-18](../07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)): XFA
  desligado, scripting desligado, campos sem interação.
- **Anotar, assinar ou imprimir PDF.** Baixar já existe (07 · F7); imprimir é do navegador, pelo arquivo
  baixado.
- **Destacar no índice a seção em que se está.** O pdf.js não dá isso pronto; fica para quando alguém pedir.
- **O app Flutter.** O app não tem prévia de arquivo hoje; se ganhar, é outro plano.
- **Editar o diagrama com prévia ao lado.** A prévia de markdown já segue o buffer (07 · S-312); o diagrama
  vem junto, sem tela própria.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Normas](F0-norms.md) | normas em `web/03`, ADR-020, chaves i18n, o desenho cancelado, os PDFs de fixture | B-01…B-04 | 🔲 |
| F1 | [Leitor de PDF](F1-pdf-reader.md) | rolagem corrida, zoom e ajustes, texto, links, senha, estado por aba | B-05…B-10 | 🔲 |
| F2 | [Navegação no PDF](F2-pdf-navigation.md) | painel lateral com índice e miniaturas, e a busca | B-11…B-14 | 🔲 |
| F3 | [Markdown](F3-markdown.md) | tabelas que não quebram e diagramas Mermaid | B-15…B-19 | 🔲 |
| F4 | [E2E](F4-e2e.md) | tudo acima provado no navegador de verdade, com acessibilidade | B-20…B-23 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| As regras do leitor e dos diagramas escritas antes das telas, sem chave órfã | B-01, B-02 | [web/03-ui-system](../../architecture/web/03-ui-system.md) · [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-01, S-02 |
| Uma página deixada para trás não diz que falhou | B-03 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-03, S-04 |
| PDFs de fixture reproduzíveis | B-04 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-05 |
| O leitor do pdf.js atrás de uma porta, sem script nem formulário do PDF | B-05 | [07 · D-18](../07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia) | S-06, S-07, S-20, S-29, S-30 |
| Leitura corrida, com indicador e "ir para a página" | B-06 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-08…S-11 |
| Zoom, ajuste à largura e à página, pelo mouse e pelo teclado | B-07 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-12…S-16 |
| Texto selecionável e links com a regra do produto | B-08 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-17…S-19 |
| PDF com senha, que nunca sai da memória | B-09 | [shared/03-logging](../../architecture/shared/03-logging.md) | S-21…S-24 |
| Posição, zoom e painel lembrados por aba | B-10 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#estado-de-aba-de-pasta) | S-25…S-28 |
| Painel lateral do PDF | B-11 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-31, S-32 |
| Índice (outline) navegável, também pelo teclado | B-12 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-33…S-37 |
| Miniaturas desenhadas só perto da vista | B-13 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-38…S-42 |
| Busca no PDF | B-14 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-43…S-49 |
| Tabelas que não quebram | B-15 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-50…S-53 |
| O Mermaid sob demanda, em fila, sanitizado | B-16 | ADR-020 | S-54…S-56 |
| O bloco `mermaid` como diagrama em todo `Markdown` | B-17 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-57…S-61, S-65, S-66 |
| Diagrama no streaming e no tema | B-18 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-62…S-64 |
| Mermaid fora do primeiro chunk, sem aviso de segurança novo | B-19 | [09-code-quality](../../architecture/shared/09-code-quality.md) | S-67, S-68 |
| Tudo pela porta do usuário, com acessibilidade | B-20…B-23 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-69…S-74 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
web/src/features/editor/
├── components/pdf/
│   ├── PdfReader.tsx          a moldura: barra, painel lateral, o leitor
│   ├── PdfToolbar.tsx         página, zoom, ajustes, painel, busca
│   ├── PdfSidebar.tsx         abas índice / miniaturas
│   ├── PdfOutline.tsx         a árvore do índice (role=tree)
│   ├── PdfThumbnails.tsx      miniaturas sob demanda
│   ├── PdfFindBar.tsx         a busca
│   └── PdfPassword.tsx        o pedido de senha
├── hooks/usePdfReader.ts      o estado do leitor por aba, sobre a porta
├── lib/pdfjs-viewer.ts        o adapter: PDFViewer, EventBus, PDFLinkService, PDFFindController
└── types/pdf.ts               as portas (documento, leitor)

web/src/shared/components/markdown/
├── Markdown.tsx               tabela em caixa que rola; `mermaid` → MermaidDiagram
├── MermaidDiagram.tsx         o diagrama, "ver código", copiar, erro
├── mermaid-loader.ts          o Mermaid sob demanda, uma vez, em fila
└── mermaid-engine.ts          o adapter: strict, DOMPurify, regra de link, tema

scripts/pdf-fixtures.mjs       os PDFs de teste, gerados e conferidos
e2e/fixtures/files/*.pdf       os PDFs de teste
e2e/specs/rich-previews.spec.ts
```

Os nomes são indicativos. A fase decide o arquivo pela
[estrutura normativa do web](../../architecture/web/02-folder-structure.md).

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | O Mermaid é grande (vários MB com d3): entrar no primeiro chunk pesaria toda abertura | **aberto** — `import()` sob demanda, e `mermaid` entra em `PREVIEW_LIBRARIES` do `editor-bundle` (S-67) |
| R-02 | SVG inline de conteúdo não confiável é superfície de XSS, e o Mermaid tem histórico de CVE | **aberto** — escolha do usuário ([D-02](decisions.md#f0--normas)); três camadas e ADR-020; S-56 prova cada uma |
| R-03 | O CSS do `pdf_viewer.css` é global e pode brigar com o Tailwind e o tema | **aberto** — importado só no chunk do leitor e escopado pelo contêiner; o e2e (S-73) confere contraste e layout |
| R-04 | jsdom não roda o leitor do pdf.js nem o layout do Mermaid | **aceito** — portas com fake na integração, adapters por mock no unit (90 % por arquivo), comportamento real no e2e |
| R-05 | Efeito duplo do `StrictMode` só aparece em dev, e o e2e roda o build de produção — foi assim que o bug da B-03 passou | **aberto** — os testes de integração dos componentes novos renderizam dentro de `<StrictMode>` |
| R-06 | Dependência nova traz aviso de segurança sem versão corrigida (portão 10) | **aberto** — S-68; se acontecer, é ADR datada como a [ADR-019](../../architecture/shared/00-decisions.md#adr-019--aviso-de-dependência-sem-versão-corrigida-exceção-datada-por-adr), nunca supressão |
| R-07 | Outras sessões do agente trabalham na mesma árvore (planos 12, 15 e 20) | **aberto** — conferir `ps` e `git status` antes de cada `pnpm verify` |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
