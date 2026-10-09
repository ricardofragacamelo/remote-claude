# F0 — Normas

Plano: [21 — Rich previews](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:** as regras do leitor de PDF, das tabelas e dos diagramas escritas em `web/03` antes das telas; a
ADR-020; as chaves i18n nos dois idiomas; o desenho cancelado (já entregue); e os PDFs de teste.

**Decisões que precisam estar fechadas para começar:** D-01, D-02, D-03 ([decisions.md](decisions.md#f0--normas)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — As normas em `web/03` e a ADR-020 ✅

Em [web/03-ui-system](../../architecture/web/03-ui-system.md), uma seção **Prévias** com:

- **o leitor de PDF**: o do pdf.js, desenhado no nosso build ([07 · D-18](../07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia));
  rolagem corrida; zoom e ajustes ([D-05](decisions.md#f1--leitor-de-pdf), [D-09](decisions.md#f1--leitor-de-pdf));
  sem script nem formulário; links pela regra do `Markdown` ([D-08](decisions.md#f1--leitor-de-pdf)); senha
  só em memória ([D-07](decisions.md#f1--leitor-de-pdf)); o que se lembra por aba ([D-06](decisions.md#f1--leitor-de-pdf));
  `Ctrl+F` só com o foco nele ([D-10](decisions.md#f2--navegação-no-pdf));
- **as tabelas** no molde da [D-12](decisions.md#f3--markdown);
- **os diagramas**: só pelo `Markdown`, só a cerca fechada, o teto da [D-13](decisions.md#f3--markdown), e as
  três camadas da [D-02](decisions.md#f0--normas).

Na lista "Markdown do modelo é conteúdo não confiável", um item para o diagrama, apontando para a ADR-020.

Em [00-decisions](../../architecture/shared/00-decisions.md), a **ADR-020 — Diagrama Mermaid é SVG inline,
sanitizado em três camadas**: o contexto (D-18 do 07 manda SVG por `<img>`), a escolha do usuário, as três
camadas, as alternativas (imagem isolada, `iframe` sandbox) e o que a revoga (CVE do Mermaid sem correção, ou
script que escape do S-56).

### B-02 — As chaves i18n ✅

`editor.pdf.*` (barra, zoom, ajustes, ir para a página, painel, índice, miniaturas, busca, senha,
protegido, sem índice, sem resultado) e `markdown.diagram.*` (nome acessível, ver código, ver diagrama, copiar,
inválido com a linha, grande demais, não carregou), em `en` e `pt-BR`. Saem `pdfPrevious` e `pdfNext` quando o
leitor da F1 substituir a página única. Ver [shared/02-i18n](../../architecture/shared/02-i18n.md).

> **Na execução ([D-16](decisions.md#f0--normas)):** as chaves do leitor são `editor.pdf.*` (o catálogo
> aceita três níveis), e cada uma entra com a fase que a usa — o `i18n:check` do portão 7 reprova chave
> órfã. A F0 entrega as da ajuda do editor (`editor.help.pdfReader`, `editor.help.diagrams`).

### B-03 — Uma página deixada para trás não diz que falhou ✅

Entregue em 2026-10-03, antes do plano, ao investigar o "Page 1 could not be drawn.". O `renderPage` da porta
recebe um `AbortSignal`: o adapter não desenha se o sinal abortou enquanto a página era buscada, e cancela o
`RenderTask` do pdf.js se abortar no meio. O pdf.js solta o canvas na hora, e a falha própria continua
repassada. O efeito do `PdfPreview` aborta no cleanup e não diz "falhou" por um desenho abandonado. É o mesmo
`renderPage` que as miniaturas da [B-13](F2-pdf-navigation.md) usam.

### B-04 — Os PDFs de teste ✅

`scripts/pdf-fixtures.mjs` ([D-03](decisions.md#f0--normas)) escreve em `e2e/fixtures/files/`:

- `reader.pdf`: 12 páginas, com texto conhecido em cada uma, índice de 3 níveis, links internos (destino nomeado
  e explícito) e externos (`https`, `mailto`, `javascript:`, `file:`), uma página sem texto;
- `scripted.pdf`: uma ação JavaScript de abertura e um campo de formulário;
- `locked.pdf`: o `reader.pdf` com senha de usuário.

`--check` regenera num diretório temporário e compara. Entra no catálogo de comandos do README.

---

## Cenários cobertos

S-01…S-05.

---

## Critério de conclusão

```bash
pnpm verify
```
