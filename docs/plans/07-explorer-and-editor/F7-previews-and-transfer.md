# F7 — Prévias e transferência

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F6](F6-e2e.md).
**Entrega:** ver o que não é texto editável — prévia de markdown, imagem, SVG e PDF, hexadecimal para
binário, leitura paginada para o que passa do teto — e levar arquivos para dentro e para fora da
máquina: upload por arrastar do desktop, download de arquivo e de pasta (zip).

## Por quê

É paridade de arquivos com o VS Code que o núcleo não precisa para funcionar, e é a fase com a
superfície de segurança mais sutil do plano: servir conteúdo do usuário pela origem do produto. Por
isso vem depois do núcleo verde, com contrato e decisões próprios
([D-16](decisions.md#d-16--download-sem-token-na-url-e-os-tetos),
[D-18](decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-47 — O contrato de prévia e transferência 🔲

No `backend/03` (seção `files`), com os status: `GET /files/raw?folder=&path=` (bytes crus, `Range`
→ `206`, `416` fora do arquivo, `ETag`, cabeçalhos de segurança da D-18, `attachment` fora da lista de
prévia), `GET /files/archive?folder=&path=` (zip em stream, teto de entradas e de bytes conhecido
antes do primeiro byte) e `POST /files/upload` (multipart, resultado por item, `onConflict`:
`fail`·`replace` com `If-Match`·`keepBoth`). Código novo `RANGE_NOT_SATISFIABLE` (416) no catálogo e
na tabela de status, com chaves; `file.downloaded` no CHECK da trilha (migration versionada nova) e
`source: upload` no `file.created`.

### B-48 — Conteúdo cru e arquivo compactado 🔲

`raw` sobre a mesma contenção da F1 (realpath + descritor), `Content-Type` pelo conteúdo,
`X-Content-Type-Options: nosniff` e `Content-Security-Policy: sandbox` **sempre**; HTML e SVG nunca
saem como documento ativo. `archive` em stream, sem symlink para fora e sem o que a D-10 esconde,
recusando antes do primeiro byte o que passa do teto; cliente que aborta para o stream e fecha os
descritores. Baixar é leitura, mas tira conteúdo da máquina: `file.downloaded` antes do primeiro
byte, e trilha indisponível → nada sai ([D-02](decisions.md#d-02--a-escrita-humana-na-trilha)).

### B-49 — Upload 🔲

Multipart em stream (nunca o corpo inteiro em memória), cada arquivo por um temporário e `O_EXCL`
como o criar da B-12: conexão que cai no meio não deixa arquivo parcial; nome com `../` ou `/` é
recusado; teto por arquivo ([D-16](decisions.md#d-16--download-sem-token-na-url-e-os-tetos)).
Conflito por item: `fail` (409 daquele, os outros seguem), `replace` com o `If-Match` do existente,
`keepBoth` com nome novo. Cada criado grava `file.created` com `source: upload` antes do disco.

**Pasta inteira**, com a estrutura: cada item traz o caminho relativo dentro da pasta enviada, e cada
segmento passa pela mesma validação do nome (nada de `..`, absoluto, NUL nem nome reservado do
Windows); as subpastas são criadas no destino, e o teto conta a soma e o número de itens, não só cada
arquivo. Symlink vindo do navegador não existe como tal — chega como arquivo comum, e é tratado assim.

### B-50 — Prévias 🔲

"Abrir prévia" e "prévia ao lado" (palette, menu e atalho), e a alternância editor/prévia na aba:

- **markdown** pelo mesmo sanitizador do [plano 08](../08-claude-panel/README.md) — HTML cru nunca
  vira DOM; link para arquivo da pasta abre no editor; imagem relativa carrega pelo `raw`; a prévia ao
  lado acompanha a edição sem salvar;
- **imagem e SVG** por `fetch` com Bearer → blob → `<img src=blob:>`: nenhum token na URL, e script em
  SVG não roda dentro de `<img>`;
- **PDF** pelo pdf.js servido pelo nosso build, paginado — nunca o visualizador embutido do navegador;
- imagem corrompida → placeholder traduzido.

### B-51 — Hexadecimal e leitura paginada 🔲

Binário abre em hexadecimal **somente leitura**, paginado pelo `Range` do `raw`; texto acima do teto
de edição abre paginado, somente leitura, dizendo por quê — é o terceiro degrau do modo arquivo
grande da [D-04](decisions.md#d-04--teto-de-tamanho-e-encoding). Arquivo que muda durante a paginação
(o `ETag` do `raw` mudou) → aviso e recarga, nunca páginas de duas versões.

### B-52 — Upload e download na web 🔲

Arrastar do desktop para uma pasta da árvore (e o botão "Enviar arquivos…", que é a alternativa por
teclado) com progresso por arquivo e cancelar; conflito mostrado **antes** de enviar, com Substituir
/ Manter os dois / Pular por arquivo — a prévia antes do efeito amplo. Baixar arquivo e pasta pelo
caminho da D-16 (blob com Bearer, `showSaveFilePicker` onde existir), com o teto dito antes de começar.
O resultado de lote é a mesma tela da B-27.

Três entradas a mais, pedidas pelo usuário em 2026-09-26: **enviar uma pasta** (arrastar a pasta do
desktop, ou "Enviar pasta…" com o seletor de diretório do navegador), com a estrutura mantida;
**baixar a seleção** — vários arquivos e pastas marcados no explorer num zip só; e **Enviar arquivos
aqui…** / **Baixar** no menu de contexto da árvore e na palette, sobre a pasta ou o item clicado.

### B-53 — Usabilidade e ajuda de prévias e transferência 🔲

Na ajuda do explorer e do editor, em en e pt-BR: o que é pré-visualizado, por que HTML não roda na
prévia, quais são os tetos de upload e download e o que acontece acima deles. Tooltips, atalhos na
palette, e axe sem violação nas prévias, no hexadecimal e no diálogo de conflito de upload.

### B-54 — E2e de prévia e transferência 🔲

Markdown com imagem relativa em prévia ao lado, editado ao vivo; arrastar arquivo do desktop e baixar
a pasta como zip (o conteúdo do zip conferido pela fixture); binário em hexadecimal.

---

## Cenários cobertos

S-292…S-327, S-356…S-360.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
pnpm test:e2e
```
