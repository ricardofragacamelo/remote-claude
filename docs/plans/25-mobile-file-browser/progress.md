# Plano 25 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano fechou em 2026-10-09, com a F7
**Última atualização:** 2026-10-09
**Bloqueios:** nenhum. D-06, D-09, D-10, D-20 e D-22 fecharam com o spike ([decisions.md](decisions.md)); a D-02 fecha com a captura da B-10

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
F7 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-spike.md) | B-01…B-04 | 4/4 | ✅ |
| [F1](F1-norms.md) | B-05…B-08, B-32 | 5/5 | ✅ |
| [F2](F2-panel.md) | B-09…B-13 | 5/5 | ✅ |
| [F3](F3-text-viewer.md) | B-14…B-18 | 5/5 | ✅ |
| [F4](F4-markdown.md) | B-19…B-22 | 4/4 | ✅ |
| [F5](F5-pdf.md) | B-23…B-25 | 3/3 | ✅ |
| [F6](F6-download.md) | B-26…B-28 | 3/3 | ✅ |
| [F7](F7-e2e.md) | B-29…B-31 | 3/3 | ✅ |
| **Total** | **B-01…B-32** | **32/32** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 153 | 0 | 0 | 153 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 34 | 0 | 0 | 34 | 0 |

---

## Medidas do spike (F0)

2026-10-09, emulador API 35 (`remote_claude_api35`, x86_64, 2 GB, 4 núcleos, `swiftshader_indirect` — as
flags do `run-e2e-local`), APK **release** de um app mínimo fora da árvore ([D-23](decisions.md#f0--spike-dos-motores)),
um processo por caso (o pico de memória é o `ProcessInfo.maxRss` daquele processo). O app parado tem
134 MB de RSS. Os bytes vieram de um servidor local que imita `/files/content` e `/files/raw` (`Range`,
`ETag`, Bearer obrigatório) e registra cada pedido — não o backend, porque o que se media era o
cliente: a contenção e o `Range` do `/files/raw` estão provados no plano 07.

**PDF** (S-01) — um PDF de 60 MB e 60 páginas (cada uma com uma imagem incompressível), e um de 500
páginas e 400 KB:

| Caminho | Primeira página | Pico de RSS | Pedidos | Observação |
|---|---|---|---|---|
| (a) memória: os bytes inteiros → `openData` | 4,1 s | 389 MB | 1 | inclui a cópia dos bytes |
| (b) `openUri` com `Authorization` e `preferRangeAccess` | 3,5 s | 253 MB | 61 × `Range` de 1 MB | grava o arquivo no cache em disco do app; fora dos nossos interceptors |
| (b′) `openCustom`, `Range` pelo nosso Dio, blocos de 256 KB | 5,1 s | 260 MB | 249 | — |
| (b′) `openCustom`, blocos de 1 MB | **3,8 s** | **302 MB** | **62** | a escolhida ([D-22](decisions.md#f5--pdf)) |
| 500 páginas, os três caminhos | 1,3–1,4 s | 178–179 MB | 1 | — |

Nesse PDF o PDFium leu o arquivo inteiro antes da primeira página (as páginas se intercalam com as
imagens): o `Range` não poupou transferência, poupou memória. Senha: o `passwordProvider` foi chamado
duas vezes (errada, certa) e abriu. Corrompido: `PdfException` (`FPDF_ERR_FORMAT`).

**Texto** (S-06) — o mesmo `/files/content`, `ListView.builder` por linha lógica, `Text` monoespaçado:

| Arquivo | Linhas | Quebra | Pronto (rede + JSON + linhas + quadro) | Primeiro quadro | Pico de RSS |
|---|---|---|---|---|---|
| 1 MB | 16 143 | ligada / desligada | 1,1 / 1,4 s | 28 / 19 ms | 163 / 169 MB |
| 5 MB | 80 677 | ligada / desligada | 1,5 / 1,4 s | 29 / 30 ms | 193 / 189 MB |
| 10 MB | 161 225 | ligada / desligada | 1,7 / 2,0 s | 32 / 20 ms | 218 / 216 MB |
| linha única de 1 MB | 1 | ligada / desligada | 1,9 / 1,8 s | **465 / 1 074 ms** | **423 / 549 MB** |
| linha única, em trechos ([D-25](decisions.md#f3--leitor-de-texto-e-de-imagem)) | 1 049 / 1 | ligada / desligada | 1,2 / 0,8 s | 25 / 28 ms | 164 / 166 MB |

**Mermaid** (S-04, S-05) — os oito tipos, um inválido, um pesado (2 200 arestas em 34 KB) e um acima do
teto (63 KB):

| Motor | Primeiro desenho | Seguintes | Inválido | Pesado / acima do teto | Fidelidade no app |
|---|---|---|---|---|---|
| `merman` 0.8.0 → SVG (`resvg-safe`) → `flutter_svg` → imagem, num `compute` | 347 + 309 ms | 8–22 ms de SVG + 54–261 ms de rasterização | erro com o *byte* (dá a linha) | o perfil `constrained` corta em 67–164 ms | **não passa**: o `flutter_svg` ignora o `<style>`, e os nós saem pretos |
| WebView fora da tela + `mermaid.min.js` 12.1.0 → `<canvas>` → PNG | 1,3–1,8 s (subir o WebView) + 290 ms | 35–135 ms ida e volta | erro com a linha ("Parse error on line 3") | "Edge limit exceeded" (500); o teto de texto é nosso, antes | **igual ao web**: é o mesmo motor |

Com um `while(true){}` no WebView, a UI do Flutter seguiu a 60 quadros por segundo (181 em 3 s); um
WebView novo não ficou pronto enquanto o primeiro estava preso — o Android usa um processo de
renderização por app ([ADR-024](../../architecture/shared/00-decisions.md#adr-024--o-app-desenha-mermaid-num-webview-fora-da-tela-sem-rede-e-sem-navegação)).

Capturas: [`mermaid.js` × SVG do `merman` no navegador](spike/mermaid-js-vs-merman-svg.png) (com
`theme: default`, praticamente iguais) · [o `merman` pelo `flutter_svg` no aparelho](spike/merman-flutter-svg-on-device.png)
(nós pretos) · [o WebView no aparelho](spike/webview-on-device.png) (igual ao web; o Gantt saiu com
largura 0, porque o WebView fora da tela não tem largura — a B-21 fixa `gantt.useWidth`).

**APK** (S-05) — arm64, release, `--split-per-abi`. Um app Flutter vazio tem 15,3 MB; o do spike, com
tudo, 42,5 MB. Por biblioteca: `libmerman_ffi.so` 17,5 MB, `libpdfium.so` 6,4 MB (as nativas ficam
descomprimidas no APK), `mermaid.min.js` 1,6 MB comprimido (5,5 MB cru). A pilha escolhida —
`pdfrx`, `flutter_markdown_plus`, `webview_flutter` e o `mermaid.min.js`, sem o `merman` — soma
**≈ 9 MB por ABI**.

---

## A barra da sessão com o quarto ícone (D-02)

2026-10-09, `flutter test` em 360×640 com fonte em 200 % (a fonte de teste desenha cada letra como um
quadrado de 1 em, o que mede a largura com folga para mais): com 4 ícones — sessões, arquivos, histórico,
`⋯` — o título ficou com 64 dp e o chip de status com 10 dp, só o ponto; já em fonte 100 % era a mesma
coisa. Com 3 ícones, os de antes da F2: título 88 dp, chip 34 dp (30 em 200 %). O histórico foi para o
`⋯` ([D-02](decisions.md#f2--painel-de-arquivos)) e a barra voltou aos números de antes.

![4 ícones](capture/bar-four-icons-360dp-200pc.png) ![3 ícones](capture/bar-three-icons-360dp-200pc.png)

---

## Chaves de texto desenhadas (B-06)

Como na [24 · D-33](../24-structured-questions/decisions.md#f0--normas-e-contrato), cada chave entra
**com o código que a usa**, na fase dele — chave sem uso é órfã, e o `i18n:check` a recusa. A F1 pôs as
de erro, que o `failure_messages.dart` já usa (`filesError*`, quatro delas com par no mapa compartilhado:
`notFound`, `invalidPath`, `notAFile`, `rangeNotSatisfiable`; as que falam de editar ou de alterar são do
app). As outras, por fase — com ⇄ as que têm par no web, cujo texto vence:

| Fase | Chaves |
|---|---|
| F2 — painel | `filesPanelOpen`, `filesPanelTitle`, `filesPanelMenu`, `filesPanelShowHidden`, `filesPanelRefresh`, `filesPanelUp`, `filesPanelRoot`, `filesPanelEmpty`, `filesPanelLoading`, `filesPanelTruncated`, `filesPanelOutsideLink` ⇄ `explorer.tree.outsideLink`, `filesPanelBrokenLink`, `filesPanelDevicePending`, `filesPanelDeviceRevoked`, `filesPanelBackToRoot`, `filesEntryCopyPath` ⇄ `explorer.action.copyPath`, `filesEntryPathCopied` |
| F3 — leitor | `fileViewerMenu`, `fileViewerWrap` ⇄ `editor.settings.wordWrap`, `fileViewerCopyAll`, `fileViewerCopied`, `fileViewerRefresh`, `fileViewerLarge`, `fileViewerEmpty`, `fileViewerChanged`, `fileViewerLineCut`, `fileViewerNoPreview`, `fileViewerEncoding`, `fileViewerTooLarge`, `fileViewerNotFound`, `fileViewerDenied`, `fileViewerClaudeWaiting`, `fileViewerBackToSession`, `fileViewerImage`, `fileViewerImageFailed` |
| F4 — markdown | `markdownPreview`, `markdownSource`, `markdownRemoteImage` ⇄ `markdown.image.remote`, `markdownLinkOutside`, `markdownLinkConfirm`, `markdownLinkOpen`, `markdownLinkRefused`, `diagramLabel` ⇄ `markdown.diagram.label`, `diagramDrawing` ⇄ `markdown.diagram.drawing`, `diagramInvalidLine` ⇄ `markdown.diagram.invalidLine`, `diagramInvalid` ⇄ `markdown.diagram.invalid`, `diagramTooLarge` ⇄ `markdown.diagram.tooLarge`, `diagramUnavailable`, `diagramClose` |
| F5 — PDF | `pdfPageOf`, `pdfGoTo`, `pdfGoToInvalid`, `pdfPasswordTitle`, `pdfPasswordWrong`, `pdfProtected`, `pdfEnterPassword`, `pdfCorrupt` |
| F6 — download | `filesDownload` ⇄ `explorer.action.download`, `filesDownloading`, `filesDownloadCancel`, `filesDownloaded` ⇄ `explorer.done.downloaded`, `filesDownloadFailed` ⇄ `explorer.outcome.downloadFailed`, `filesDownloadTooLarge` |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-09 | F0 | — | — | — | ✅ `pnpm verify` verde de primeira (portões 1-7); `pnpm docs:check` verde. A F0 não pôs código na árvore: o spike viveu no scratchpad (D-23) |
| 2 | 2026-10-09 | F1 | 7 — cobertura | `approved-device.guard.ts` com 50 % de branches: o ramo do log para um erro que não é de domínio (`errorCode` indefinido) nunca rodava | teste do guard com o caso de uso falhando por um erro qualquer: o erro passa intacto e o log sai sem código | reinício do portão 1 |
| 3 | 2026-10-09 | F1 | 7 — cobertura | sem defeito: o portão 7 tem teto de 15 min (`gates.mjs`), e foi morto no meio da cobertura do mobile enquanto a suíte inteira do app rodava ao mesmo tempo numa cópia, no scratchpad (carga da mesma máquina). Backend e web passaram | nenhuma no código; nada pesado roda junto com o portão | reinício do portão 1 |
| 4 | 2026-10-09 | F1 | — | — | — | ✅ `pnpm verify` verde (portões 1-7, cobertura em 713 s); `pnpm docs:check` e `pnpm i18n:check` verdes. A F1 fecha |
| 5 | 2026-10-09 | F2 | 5 — duplicação | o cabeçalho e a linha de estado do `files_panel.dart` repetiam a forma de `pong_list`, `image_marker` e `conversation_list_page` (`Padding` + `Column` e o começo do `build`) | o cabeçalho virou uma `Row` com o recuo dentro, e a linha de estado, um `ListTile` com a barra de progresso no subtítulo | reinício do portão 1 |
| 6 | 2026-10-09 | F2 | — | — | — | ✅ `pnpm verify` verde (portões 1-7); `docs:check`, `i18n:check` verdes. A cobertura levou 862 s, a 38 s do teto de 900 s do portão: virou a [D-28](decisions.md#f3--leitor-de-texto-e-de-imagem) |
| 7 | 2026-10-09 | F3 | 2 — lint (complexidade) | a rota do leitor, com três `??` no `builder`, levou o `buildRouter` a 12 | a rota virou a função `fileViewerPageRoute()`, fora do `buildRouter` | reinício do portão 1 |
| 8 | 2026-10-09 | F3 | — | — | — | ✅ `pnpm verify` verde (portões 1-7, cobertura 737 s); antes, a duplicação pegou sete trechos na cópia e virou o mixin `PageAware`, o `RefusalView` comum e o `TextStrip` existente nas faixas do leitor. S-62, S-69…S-71 esperam o **baixar** da F6 |
| 9 | 2026-10-09 | F4 | — | — | — | ✅ `pnpm verify` verde (portões 1-7, cobertura 738 s); `docs:check` e `i18n:check` verdes. Antes, na cópia: cinco trechos repetidos (a confirmação do link virou o `ConfirmDialog` do core; a fila ganhou um mapa de pedidos em voo) e a complexidade de `_relative` (13 → `_walk`). S-100 é do e2e (F7) |
| 10 | 2026-10-09 | F5 | 1 — formatação | `scripts/mobile.mjs` fora do Prettier depois que a lista de exclusões da cobertura saiu dele para `scripts/lib/coverage.mjs` (o `coverage-gaps.mjs` passou a ler o mobile, e as duas pontas leem a mesma lista) | `prettier --write` no arquivo | reinício do portão 1 |
| 11 | 2026-10-09 | F5 | 2 — lint | o `main` do `coverage-gaps.mjs` chegou a complexidade 15 com o `--from` e o `mobile` | a leitura dos argumentos virou `parseArgs`, e a dica de como medir, `howToMeasure` | reinício do portão 1 |
| 12 | 2026-10-09 | F5 | — | — | — | ✅ `pnpm verify` verde (portões 1-7, cobertura 697 s). Antes, na cópia: três trechos repetidos (o `bytesRange` e o `bytes` do `ApiClient` viraram um `_rawGet`; o construtor do `PdfFileViewer`; a folha da senha ganhou `_submit`) e o `ViewerKind.noPreview`, que nenhum caminho alcançava desde que o PDF ganhou leitor, saiu. S-108 e S-117 esperam o **baixar** da F6; S-114 é do e2e (F7) |
| 13 | 2026-10-09 | F6 | — | — | — | ✅ `pnpm verify` verde de primeira (portões 1-7, cobertura 732 s); `i18n:check` e `docs:check` verdes; o teste de JVM do `SaveRequest` (5/5) rodou na cópia. Antes, na cópia: dois trechos repetidos (a lista de parâmetros do download virou `RawDownload`; a faixa ganhou `_TaskStrip`), o `.delete` do temporário na regra "só lê" (virou `discard`, e a lista `phoneOnly` com o motivo) e o servidor de teste, que segurava os bytes de um corte sem `bufferOutput = false` |
| 14 | 2026-10-09 | F7 | e2e do app (`files`) | três falhas: o `.hidden-notes` não é nome que o servidor esconde; o fluxograma com `click … href` não virou imagem (o SVG com `xlink:href` sem namespace não carrega como imagem); e o card não estava ao alcance depois do "voltar à sessão" — o painel seguia aberto por cima | a fixture usa o `Thumbs.db`; a página do Mermaid troca cada `<a>` por `<g>` antes de rasterizar ([D-34](decisions.md#f7--e2e)); o painel se fecha quando um arquivo abre dele ([D-33](decisions.md#f7--e2e)), com teste de widget | nova execução do e2e |
| 15 | 2026-10-09 | F7 | — | — | — | ✅ `pnpm test:e2e:mobile files` verde (3/3), e o `folders` também (3/3) — ele voltou a criar pastas com a instalação do helper ([D-31](decisions.md#f7--e2e)) |
| 16 | 2026-10-09 | F7 | — | — | — | ✅ `pnpm verify:full` verde de primeira, os onze portões (cobertura 713 s, integração 451 s, e2e do web 455 s) |
| 17 | 2026-10-09 | F7 | — | — | — | ✅ `pnpm test:e2e:mobile` verde: 38 de 38 testes, todas as suítes do app — o 05·S-79, pendência aberta no plano 24 (D-39), passou nesta execução. O plano fecha |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-09 | o Mermaid é desenhado pelo **WebView** fora da tela, não pelo `merman` ([D-10](decisions.md#f0--spike-dos-motores)), delimitado pela [ADR-024](../../architecture/shared/00-decisions.md#adr-024--o-app-desenha-mermaid-num-webview-fora-da-tela-sem-rede-e-sem-navegação); a versão é a do `web/`, copiada por script ([D-20](decisions.md#f4--markdown-e-mermaid)) | o `flutter_svg` não desenha o SVG do `merman` | F4 · B-21: o adaptador é um `WebViewController` sem widget, com a página em `mobile/assets/mermaid/`; a fila descarta a resposta de pedido vencido, e um desenho preso deixa o motor indisponível até terminar (o processo de renderização é um só); `gantt.useWidth` fixo. A B-21 ganha o script que copia o `mermaid.min.js` e o liga aos três builds do app; `webview_flutter` entra no `pubspec.yaml` |
| 2026-10-09 | o PDF é lido **por intervalo, pelo nosso `ApiClient`** (`openCustom`), não pelo `openUri` ([D-22](decisions.md#f5--pdf)) | o `openUri` grava o arquivo no disco e passa por fora dos interceptors | F5 · B-23: o data source ganha a leitura de um intervalo (`Range`), e o tamanho vem do `Content-Range` do primeiro bloco, sem `HEAD`; o leitor (`RemoteByteReader`) mantém os últimos 8 blocos de 1 MB em memória; o S-107 prova o `Range` com Bearer contra o servidor local |
| 2026-10-09 | linha longa em trechos com a quebra ligada, cortada em 10 000 caracteres com ela desligada ([D-25](decisions.md#f3--leitor-de-texto-e-de-imagem)); sem teto de texto menor que o do servidor ([D-09](decisions.md#f0--spike-dos-motores)) | a linha única de 1 MB custa 0,5–1 s e +300–400 MB; 10 MB em várias linhas abrem bem | F3 · B-15: o modelo de linhas do leitor fatia a linha longa; o S-62 ("grande demais para abrir no celular") passa a ser o `413` do servidor, o único teto |
| 2026-10-09 | HTML **em bloco** do markdown precisa de uma sintaxe nossa para aparecer como texto ([D-06](decisions.md#f0--spike-dos-motores)) | o `flutter_markdown_plus` o descarta em silêncio | F4 · B-19 |
| 2026-10-09 | as portas dos motores moram onde o tipo delas deixa ([D-27](decisions.md#f4--markdown-e-mermaid)): Dart puro em `domain/ports/`, o `PdfEngine` (que devolve um widget) em `presentation/engines/` | a tela não importa `data/` | F4, F5, F6 |
| 2026-10-09 | o `mermaid.min.js` é copiado do `web/` por `scripts/lib/mermaid-asset.mjs` antes do `test:e2e:mobile`, do `dev:mobile` e do `mobile:install`, e recusa outra versão ([D-20](decisions.md#f4--markdown-e-mermaid)) | um asset de 5,5 MB versionado duplicaria a fonte da versão | README (Comandos), os três scripts |
| 2026-10-09 | o portão de cobertura ganha teto próprio de 30 min ([D-28](decisions.md#f3--leitor-de-texto-e-de-imagem)) | a 862 s, a cobertura dos quatro módulos estava a 38 s do teto comum de 900 s | `scripts/lib/gates.mjs` e o teste dele; nenhum limiar muda |
| 2026-10-09 | o download retoma **uma vez**, com `Range` e `If-Match`, sem `download=true` ([D-29](decisions.md#f6--download)); o Android devolve a escolha pelo `onActivityResult` ([D-30](decisions.md#f6--download)) | a trilha registraria cada pedido, e a retomada não pode costurar outra versão; a API de resultado pediria dependência nova | F6 · B-26, B-27: `ApiClient.download`, `DownloadFile`, `TemporaryFiles`; o `FILE_CHANGED` ganhou tradução no app |
| 2026-10-09 | o teste de arquitetura "o navegador só lê" ganhou uma lista de arquivos que apagam no disco do **celular** — hoje só `app_temporary_files.dart`, com o motivo —, e um teste que prova que esses arquivos não chegam ao servidor | o `.delete` do temporário de download casava com a regra textual de escrita | `test/unit/architecture/files_read_only_test.dart`; a porta chama `discard`, não `delete` |
| 2026-10-09 | `pdfrx` fixado em **2.4.8** ([D-06](decisions.md#f0--spike-dos-motores)) | a 2.5 em diante pede Flutter 3.47; o app está no 3.44.4 | F5 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-09 | o `Intent` de `ACTION_CREATE_DOCUMENT` e a cópia para a URI escolhida não têm teste automático no aparelho (S-120): o teste de JVM cobre o pedido (nome seguro, tipo) e a cópia; o `Intent` precisa do framework Android, que o teste de JVM não carrega | o projeto não usa Robolectric, e o e2e não abre o seletor do sistema | conferir à mão com `pnpm dev:mobile` (baixar um arquivo e salvar), como o login do app; fica para quem trouxer Robolectric |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Um pedido de permissão não notifica com o leitor aberto (já acontece com o histórico) | 🔄 mitigado | B-08: a `SessionPage` é `RouteAware` e diz "nenhuma sessão" sob uma página empilhada (S-14…S-17); falta a faixa do leitor (B-18) e o e2e (S-139) |
| R-02 | Arquivo grande trava o app ou estoura a memória | 🔄 mitigado no papel | medido no spike: 10 MB de texto abrem em ~2 s e 218 MB; a linha única é a D-25; o PDF por intervalo não segura o arquivo (D-22). Fecha com a B-15 e a B-23 |
| R-03 | O APK cresce com o PDFium e o motor do Mermaid | ✅ medido | ≈ 9 MB por ABI com a pilha escolhida; o `merman` (17,5 MB) ficou fora |
| R-04 | Markdown malicioso: `javascript:`, imagem remota, HTML | 🔲 aberto | — |
| R-05 | A barra da sessão não comporta o quarto ícone | 🔲 aberto | D-02, com a captura |
| R-06 | O `pdfrx` não roda no `flutter test` | ✅ conferido | S-03: com o pacote no `pubspec.yaml` e a porta fake, o `flutter test` passa sem PDFium |
| R-07 | O ícone novo confunde com o das sessões | 🔲 aberto | D-03, com a captura |
| R-08 | O app mostra a pasta inteira num aparelho que pode ser perdido | 🔄 mitigado | B-32: todo `/files/*` com token que não é do web exige aparelho aprovado (S-143…S-151); o `azp` do Keycloak real é provado no e2e (S-153) |
| R-09 | O token vence no meio de um download longo | 🔲 aberto | — |
| R-10 | Motor do Mermaid jovem ou pesado | 🔄 decidido | o WebView é o `mermaid.js` do web (D-10); o peso é a subida do WebView (~1,3 s, uma vez) e o processo de renderização único (ADR-024) |
| R-11 | Um markdown com muitos diagramas trava o app | 🔲 aberto | — |
| R-12 | O diagrama sai diferente no web e no app | 🔄 decidido | o mesmo `mermaid.js`, a mesma versão (D-20, verificada pelo script) e a mesma configuração, salvo o teto do código |
| R-13 | Outra sessão na mesma árvore mexendo nos mesmos arquivos | 🔲 aberto | o plano 24 está aberto |
| R-15 | O guard recusa o próprio web, se o token do web vier sem `azp` | 🔲 aberto | S-148 e o e2e do web |
| R-14 | Um WebView no app contra a regra "WebView é proibida" (que é de login) | ✅ resolvido | a D-10 escolheu o WebView: [ADR-024](../../architecture/shared/00-decisions.md#adr-024--o-app-desenha-mermaid-num-webview-fora-da-tela-sem-rede-e-sem-navegação) delimita o uso, e o [mobile/07](../../architecture/mobile/07-auth.md#webview-é-proibida) aponta para ela |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
