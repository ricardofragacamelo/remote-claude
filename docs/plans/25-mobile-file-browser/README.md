# Plano 25 — Navegador de arquivos no app

**Objetivo:** pelo app, navegar pelos diretórios da pasta aberta (inclusive de dentro de uma sessão),
abrir os arquivos sem editar — texto com quebra de linha ligável, markdown com prévia e diagramas
`mermaid`, PDF e imagem, com zoom e arrasto — e baixá-los, sem nunca enviar nada.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full         # portões 1-11, sai com código 0
pnpm test:e2e:mobile     # o e2e do app, que o verify:full não roda (o portão 9 é só do web)
```

**Depende de:** [plano 07 — Explorer e editor](../07-explorer-and-editor/README.md) (as rotas
`/files/tree`, `/files/content`, `/files/raw` e `/files/limits`, com contenção de caminho e trilha),
[plano 10 — Layout do chat no app](../10-mobile-chat-layout/README.md) (o `AppScreen`, o painel de
sessões e a barra da sessão) e [plano 22 — Histórico ao vivo](../22-live-history/README.md) (a imagem
do prompt com zoom, que a [F3](F3-text-viewer.md) extrai). Os três estão concluídos.
Tem um ponto de contato com o [plano 21 — Rich previews](../21-rich-previews/README.md), ainda em
andamento: o Mermaid do web ([21 · B-16](../21-rich-previews/F3-markdown.md)) não começou, e a versão
do motor dos dois clientes é a [D-20](decisions.md#f4--markdown-e-mermaid).

**Insumo:** [discovery — Navegar e ler os arquivos da pasta pelo app](../../discovery/07-navegador-de-arquivos-no-app.md).
A discovery é o **porquê** e a medição do que existe; este plano é o contrato. Onde os dois divergem,
vale o plano, e a divergência está em [decisions.md](decisions.md).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Hoje o app mostra a conversa, mas não o que ela produz. Quando o Claude diz "atualizei o
`docs/plano.md`" ou "gerei o `relatorio.pdf`", quem está no celular não tem como abrir o arquivo. O
plano 07 deixou o explorer do app de fora, o 21 disse que "se o app ganhar prévia de arquivo, é outro
plano", e o [mobile/04](../../architecture/mobile/04-ui.md#o-que-o-app-não-tem-e-por-quê) lista o
explorer entre o que o app não tem. Este é esse outro plano, e só na metade **leitura**.

Conferido contra o código em 2026-10-08: nenhuma chamada a `/files/*` em `mobile/lib`; o `AppScreen`
só aceita `drawer`; o `session_header_test` afirma exatamente 3 `IconButton`s na barra; a
`SessionPage` só deixa de dizer ao nativo "esta sessão está na tela" no `dispose` ou no fundo; o único
`InteractiveViewer` é o da imagem do prompt; o `pubspec.yaml` não tem markdown, PDF, `url_launcher`
nem "salvar como".

Quatro escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **O backend muda numa coisa só** | a árvore, o conteúdo, os bytes com `Range`, o download e a trilha existem desde o plano 07, com contenção de caminho e symlink, e o app consome esse contrato: nenhum endpoint, evento WS ou código de erro novo. A única mudança é a da [D-12](decisions.md#f1--normas-e-a-sessão-encoberta): o backend só serve a pasta a um **aparelho aprovado**, reconhecendo o app pelo cliente do token (`azp`) — os códigos `DEVICE_NOT_REGISTERED` e `DEVICE_REVOKED` já existem. O web não muda |
| **Somente leitura, garantida por máquina** | o servidor não distingue leitura de escrita por cliente. A garantia é a **ausência** do código de escrita em `features/files/`, reprovada por teste de arquitetura ([ADR-015](../../architecture/shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web) mantida) |
| **Motor nativo atrás de porta** | PDF, Mermaid e "salvar como" dependem de código de plataforma que o `flutter test` não roda. Ficam atrás de `PdfEngine`, `DiagramEngine` e `FileSaver`, com fake, como o `PdfEngine` do web |
| **Um spike antes de qualquer código** | o motor do Mermaid (nativo por FFI ou WebView), o caminho dos bytes do PDF e o teto de texto no celular não se decidem lendo documentação. A [F0](F0-spike.md) mede, e as fases seguintes partem do número |

---

## Escopo

### Entra

| | |
|---|---|
| O spike dos motores: `pdfrx`, `flutter_markdown_plus`, `merman` × WebView com `mermaid.js`, texto de 1, 5 e 10 MB, tamanho do APK | F0 |
| As normas (mobile/04, mobile/02, backend/03, shared/08, as notas nos planos 07 e 21), as regras de `import_lint`, o teste de arquitetura de "nada de escrita", a correção da sessão encoberta por uma tela empilhada (já afeta o histórico), e o backend exigindo aparelho aprovado em `/files/*` para todo token que não é do web | F1 |
| O painel de arquivos: `endDrawer` no `AppScreen`, o botão na barra da sessão e na `FolderPage`, a navegação por nível com migalha, ocultos, symlink, `truncated` | F2 |
| O leitor: a rota, a regra que escolhe o leitor, o texto virtualizado com quebra ligável e pinça na fonte, a imagem com zoom, os estados "sem prévia", "grande demais" e "codificação", a recarga com `304` | F3 |
| O markdown: prévia ↔ fonte, links relativos e externos com confirmação, imagens relativas, tabela larga, e os blocos `mermaid` como diagrama, sob demanda, com tela cheia | F4 |
| O PDF: rolagem corrida, zoom, página N de M, links pela mesma regra, senha | F5 |
| O download: em stream para um temporário, o "salvar como" do sistema, progresso e cancelar | F6 |
| E2E no emulador com uma pasta de fixture, incluindo o pedido de permissão que chega com o leitor aberto | F7 |

### Não entra

- **Editar, criar, renomear, mover, apagar, enviar** — o pedido é leitura e download (R2, R8 da
  discovery). Nem botão, nem `POST /files/upload` no app.
- **`@` arquivo no prompt a partir do painel**, e **tocar num caminho citado na conversa para abrir o
  arquivo** — passos naturais seguintes, não pedidos. Ficam para outro plano.
- **Realce de sintaxe, busca dentro do arquivo e "reabrir com outra codificação".**
- **Índice e miniaturas do PDF**, que o plano 21 tem no web.
- **SVG desenhado** ([D-08](decisions.md#f3--leitor-de-texto-e-de-imagem)) e **links ou texto
  selecionável dentro do diagrama** ([D-18](decisions.md#f4--markdown-e-mermaid)).
- **Baixar pasta inteira** (o zip do `/files/archive`) ([D-13](decisions.md#f6--download)).
- **Compartilhar** pela folha do sistema — o pedido é baixar.
- **Diff contra a versão anterior** e o histórico local do plano 07 · F8.
- **Assistir a pasta por `workspace.watch`** ([D-15](decisions.md#f3--leitor-de-texto-e-de-imagem)): a
  recarga com `If-None-Match` cobre a primeira versão.
- **Markdown no chat.** O renderizador entra no app e pode ser reaproveitado, mas a decisão continua a
  [24 · D-21](../24-structured-questions/decisions.md#f4--mobile).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde. A exceção declarada: **F4, F5 e F6** dependem só da F3, e podem correr em qualquer ordem
entre si.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Spike dos motores](F0-spike.md) | os motores medidos no emulador; D-06, D-09, D-10 e D-22 decididas com número | B-01…B-04 | ✅ |
| F1 | [Normas e a sessão encoberta](F1-norms.md) | normas emendadas; `import_lint` e teste de "nada de escrita"; a sessão deixa de se dizer na tela sob uma rota empilhada; `/files/*` só para aparelho aprovado | B-05…B-08, B-32 | ✅ |
| F2 | [Painel de arquivos](F2-panel.md) | dados da árvore, `endDrawer`, botão, navegação por nível, ocultos, symlink, `truncated`, `FolderPage` | B-09…B-13 | ✅ |
| F3 | [Leitor de texto e de imagem](F3-text-viewer.md) | rota e regra do leitor, texto virtualizado com quebra e pinça, imagem, estados de erro, recarga com `304` | B-14…B-18 | ✅ |
| F4 | [Markdown e Mermaid](F4-markdown.md) | prévia ↔ fonte, links, imagens relativas, tabela larga, `DiagramEngine` e diagramas sob demanda com tela cheia | B-19…B-22 | ✅ |
| F5 | [PDF](F5-pdf.md) | `PdfEngine` com `pdfrx`, leitor com zoom e páginas, links, senha | B-23…B-25 | ✅ |
| F6 | [Download](F6-download.md) | `FileSaver` nativo, download em stream com progresso e cancelar, as duas entradas | B-26…B-28 | ✅ |
| F7 | [E2E](F7-e2e.md) | a pasta de fixture, o `files_test.dart` no emulador, os portões completos | B-29…B-31 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

Os requisitos `R1…R9` são os da [discovery §1](../../discovery/07-navegador-de-arquivos-no-app.md#1-o-pedido).

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Os motores escolhidos com medida, não com suposição | B-01…B-04 | [mobile/01](../../architecture/mobile/01-architecture.md) | S-01…S-07 |
| As normas dizem o que o app lê, como abre link e como dá zoom; a feature `files` existe na estrutura | B-05, B-06 | [mobile/04](../../architecture/mobile/04-ui.md) · [mobile/02](../../architecture/mobile/02-folder-structure.md) · [backend/03](../../architecture/backend/03-modules.md) · [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-08…S-10 |
| R2, R8 — somente leitura e sem envio, provado por máquina | B-07 | [mobile/01](../../architecture/mobile/01-architecture.md) · [ADR-015](../../architecture/shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web) | S-11…S-13 |
| A sessão não para: um pedido de permissão notifica, e se vê, com uma tela por cima | B-08, B-18 | [mobile/04](../../architecture/mobile/04-ui.md) | S-14…S-17, S-78, S-79 |
| A pasta só é lida por um aparelho aprovado; o pendente e o revogado ouvem o que fazer ([D-12](decisions.md#f1--normas-e-a-sessão-encoberta)) | B-32, B-11, B-30 | [shared/08-authentication](../../architecture/shared/08-authentication.md) · [shared/04-errors-and-http](../../architecture/shared/04-errors-and-http.md) · [backend/03](../../architecture/backend/03-modules.md) | S-143…S-153 |
| R1 — navegar nos diretórios da pasta, inclusive de dentro de uma sessão | B-09, B-11, B-13 | [mobile/03](../../architecture/mobile/03-state-and-data.md) · [mobile/04](../../architecture/mobile/04-ui.md) | S-18…S-23, S-30…S-41, S-44, S-45 |
| R6 — um botão no molde do das sessões, abrindo uma barra lateral | B-10 | [mobile/04](../../architecture/mobile/04-ui.md) | S-24…S-29 |
| Ações do item (copiar caminho) por toque longo e por `Semantics` | B-12 | [mobile/04](../../architecture/mobile/04-ui.md) | S-42, S-43 |
| R2 — abrir o arquivo no leitor certo, sem editar | B-14 | [mobile/04](../../architecture/mobile/04-ui.md) | S-46…S-53 |
| R4 — quebra de linha ligável nos arquivos de texto | B-15 | [mobile/04](../../architecture/mobile/04-ui.md) | S-54…S-62 |
| R5 — zoom e arrasto no texto | B-16 | [mobile/04](../../architecture/mobile/04-ui.md) | S-63…S-65 |
| R5 — zoom e arrasto na imagem | B-17 | [mobile/04](../../architecture/mobile/04-ui.md) | S-66…S-68 |
| Arquivo que não abre diz por quê; arquivo que mudou é recarregado sem perder a posição | B-18 | [shared/04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-69…S-77 |
| R3 — prévia de markdown, com o conteúdo tratado como não confiável | B-19, B-20 | [mobile/04](../../architecture/mobile/04-ui.md) · [07 · D-18](../07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia) | S-80…S-93 |
| R9 — blocos `mermaid` desenhados como diagrama | B-21, B-22 | [mobile/04](../../architecture/mobile/04-ui.md) | S-94…S-106 |
| R3, R5 — prévia de PDF com zoom e arrasto | B-23…B-25 | [mobile/04](../../architecture/mobile/04-ui.md) | S-107…S-118 |
| R7 — baixar arquivos | B-26…B-28 | [mobile/04](../../architecture/mobile/04-ui.md) · [07 · D-16](../07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos) | S-119…S-134 |
| Tudo pela porta do usuário, no emulador | B-29…B-31 | [shared/06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) · [mobile/06](../../architecture/mobile/06-testing.md) | S-135…S-142 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
backend/src/
├── application/auth/ports/access-token-verifier.port.ts   + o cliente do token (azp)
└── adapter/inbound/http/files/                             o guard de aparelho aprovado
mobile/lib/
├── core/widgets/
│   ├── app_screen.dart                       + endDrawer, aberto só pelo botão
│   └── zoomable_image.dart                   extraído do image_marker.dart
├── core/navigation/routes.dart               + /files/view, viewerRouteFor(folder, path)
├── app/router.dart                           + a rota do leitor; RouteObserver
└── features/files/
    ├── files.dart                            o barril
    ├── domain/
    │   ├── entities/                         FileEntry, FileListing, TextDocument, ViewerKind
    │   └── services/                         viewerFor, resolveRelativeLink, visibleEntries
    ├── data/
    │   ├── datasources/files_api_data_source.dart    tree, content, raw, limits, download — só GET
    │   ├── mappers/                          DTOs → entidades; 403, 404, 413, 415 → Failure
    │   ├── repositories/files_repository_impl.dart   ETag e 304
    │   └── ports/                            PdfEngine, DiagramEngine, FileSaver
    └── presentation/
        ├── widgets/files_panel.dart          FilesPanel e FilesPanel.button
        ├── pages/file_viewer_page.dart
        ├── widgets/viewers/                  text, markdown, mermaid_block, pdf, image, no_preview
        └── providers/                        árvore por pasta (keepAlive), documento, preferências
mobile/android/…/MainActivity.kt               canal remote_claude/save (ACTION_CREATE_DOCUMENT)
mobile/ios/Runner/                             o mesmo canal (UIDocumentPicker)
mobile/l10n/app_en.arb, app_pt.arb             as chaves novas
mobile/test/unit/features/files/, test/widget/features/files/
mobile/integration_test/files_test.dart
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Um pedido de permissão não notifica com o leitor aberto** — já acontece hoje com o histórico. Mitigação: [D-11](decisions.md#f1--normas-e-a-sessão-encoberta), B-08 na F1, cenário de e2e próprio (S-139) | **aberto** |
| R-02 | **Arquivo grande trava o app ou estoura a memória** (texto de 10 MB, PDF de 200 MB). Mitigação: linhas virtualizadas, download em stream, [D-09](decisions.md#f0--spike-dos-motores), PDF por intervalo se o spike confirmar ([D-22](decisions.md#f5--pdf)) | **aberto** |
| R-03 | **O APK cresce** com o PDFium e o motor do Mermaid. Mitigação: medir na B-01 e na B-02; o build já é por ABI | **aberto** |
| R-04 | **Markdown malicioso**: link `javascript:`, imagem remota de rastreio, HTML. Mitigação: só `http`, `https` e `mailto`, com confirmação; nada remoto carregado; HTML como texto (B-20) | **aberto** |
| R-05 | **A barra da sessão não comporta o quarto ícone** em 360 dp com fonte em 200 %. Mitigação: [D-02](decisions.md#f2--painel-de-arquivos), decidida com a captura | **aberto** |
| R-06 | **O `pdfrx` não roda no `flutter test`.** Mitigação: porta `PdfEngine` com fake; o motor de verdade só no e2e | **aberto** |
| R-07 | **O ícone novo confunde com o das sessões.** Mitigação: [D-03](decisions.md#f2--painel-de-arquivos), decidida na captura | **aberto** |
| R-08 | **O app passa a mostrar a pasta inteira** num aparelho que pode ser perdido. Mitigação: [D-12](decisions.md#f1--normas-e-a-sessão-encoberta) — só aparelho aprovado lê, e revogar no navegador corta no pedido seguinte (B-32); o bloqueio do app (`local_auth`) já existe | **aberto** |
| R-09 | **O token vence no meio de um download longo.** Mitigação: o interceptor renova uma vez e repete; o download retoma com `Range` do que já chegou (B-27) | **aberto** |
| R-10 | **Motor do Mermaid jovem (`merman`) ou pesado (WebView).** Mitigação: a B-02 compara os dois; a porta `DiagramEngine` deixa trocar sem mexer nas telas; versão fixada exata | **aberto** |
| R-11 | **Um markdown com muitos diagramas trava o app.** Mitigação: desenho sob demanda, fora da thread de UI, um por vez, com *timeout* e cache (B-21) | **aberto** |
| R-12 | **O diagrama sai diferente no web e no app.** Mitigação: com o WebView, o mesmo `mermaid.js` ([D-20](decisions.md#f4--markdown-e-mermaid)); com o `merman`, a B-02 compara lado a lado e o plano registra as diferenças aceitas | **aberto** |
| R-13 | **Outra sessão na mesma árvore** mexendo na `SessionPage`, no `router.dart` ou nos ARB (o plano 24 está aberto). Mitigação: antes de cada `pnpm verify`, conferir se outra sessão está rodando validação | **aberto** |
| R-15 | **O guard recusa o próprio web** se o token do web chegar sem `azp` ou com outro valor (D-24 fecha nesse caso). Mitigação: S-148 na integração e o e2e do web inteiro no `verify:full`; o realm conferido na B-32 | **aberto** |
| R-14 | **Um WebView no app contraria, à primeira leitura, a regra "WebView é proibida"** do [mobile/07](../../architecture/mobile/07-auth.md#webview-é-proibida), que é sobre login. Mitigação: se a [D-10](decisions.md#f0--spike-dos-motores) escolher o WebView, a B-04 abre uma ADR que delimita o uso (fora da tela, sem rede, sem navegação, só o asset local) e a norma do login aponta para ela | **aberto** |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar, e feche as
   decisões 🔲 de [decisions.md](decisions.md) que bloqueiam a fase.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. O e2e do app (`pnpm test:e2e:mobile`) não está no `verify:full`: a [F7](F7-e2e.md) o roda à parte.
