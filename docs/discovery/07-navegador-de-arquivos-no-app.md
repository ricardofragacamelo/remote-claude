# Proposta — Navegar e ler os arquivos da pasta pelo app

**Estado:** virou o [plano 25 — Navegador de arquivos no app](../plans/25-mobile-file-browser/README.md) em 2026-10-08. As decisões do §16 estão lá ([decisions.md](../plans/25-mobile-file-browser/decisions.md)), com os mesmos IDs, mais D-19…D-24. Nenhum código escrito.
**Criada em:** 2026-10-08, a partir de um pedido do usuário: no app, navegar pelos diretórios da pasta
aberta, inclusive de dentro de uma sessão; abrir os arquivos sem editar; prévia de markdown e de PDF;
na sequência, "no markdown eu quero que renderize mermaid"; quebra de linha ligável nos arquivos de texto; zoom e arrasto no conteúdo; um botão no molde do das
sessões que abra uma barra lateral; baixar arquivos, mas não enviar.
**Destino:** servir de insumo para um plano em [docs/plans/](../plans/README.md). Esta proposta
**não** é um plano: não tem tarefas com ID nem critério de conclusão por comando. Ela fixa o **quê** e
o **porquê**, mede o que já existe nas três pontas e lista o que falta decidir.
**Relação com outros documentos:** reabre uma exclusão. O [plano 07](../plans/07-explorer-and-editor/README.md)
deixou "explorer e editor no app Flutter" fora, o [plano 21](../plans/21-rich-previews/README.md) diz
que "se o app ganhar prévia de arquivo, é outro plano", e o
[mobile/04-ui](../architecture/mobile/04-ui.md#o-que-o-app-não-tem-e-por-quê) lista o explorer entre o
que o app não tem. Este é esse outro plano, e só na metade **leitura**: o editor continua fora (§3).

---

## Sumário

1. [O pedido](#1-o-pedido)
2. [Vocabulário](#2-vocabulário)
3. [Princípios](#3-princípios)
4. [Estado atual](#4-estado-atual)
5. [Arquitetura alvo](#5-arquitetura-alvo)
6. [O painel de arquivos](#6-o-painel-de-arquivos)
7. [O leitor](#7-o-leitor)
8. [Zoom e arrasto](#8-zoom-e-arrasto)
9. [Download](#9-download)
10. [Mudanças no disco enquanto se lê](#10-mudanças-no-disco-enquanto-se-lê)
11. [Contrato](#11-contrato)
12. [Mudanças por ponta](#12-mudanças-por-ponta)
13. [Dependências novas](#13-dependências-novas)
14. [Testes](#14-testes)
15. [Fora do escopo](#15-fora-do-escopo)
16. [Decisões em aberto](#16-decisões-em-aberto)
17. [Riscos](#17-riscos)
18. [Matriz de cenários (semente)](#18-matriz-de-cenários-semente)
19. [Fatiamento sugerido](#19-fatiamento-sugerido)
20. [Referências](#20-referências)

---

## 1. O pedido

Hoje o app mostra a conversa, mas não o que ela produz. Quando o Claude diz "atualizei o
`docs/plano.md`" ou "gerei o `relatorio.pdf`", quem está no celular não tem como abrir o arquivo.
O pedido, item a item:

| # | Requisito | Onde é tratado |
|---|---|---|
| R1 | navegar nos diretórios da pasta aberta, **inclusive de dentro de uma sessão** | §6 |
| R2 | abrir arquivos, **sem edição direta** | §7, §3 (princípio 2) |
| R3 | prévia renderizada de **markdown** e de **PDF** | §7.3, §7.5 |
| R9 | no markdown, blocos **`mermaid` desenhados** como diagrama | §7.4 |
| R4 | nos arquivos de texto, **ligar e desligar a quebra de linha** | §7.2 |
| R5 | **zoom** e **mover** pelo conteúdo | §8 |
| R6 | um **botão no mesmo estilo** do das sessões, abrindo uma **barra lateral** | §6.1 |
| R7 | **baixar** arquivos | §9 |
| R8 | **não** enviar arquivos | §3 (princípio 2), §15 |

## 2. Vocabulário

| Termo | Sentido aqui |
|---|---|
| **Pasta** | a pasta aberta (`workspacePath` no WS, `folder` no HTTP; são o mesmo valor, [07 · D-11](../plans/07-explorer-and-editor/decisions.md)). É a raiz do painel. |
| **Painel de arquivos** | a barra lateral nova, com a árvore da pasta. |
| **Painel de sessões** | a barra lateral que já existe ([folder_sessions_panel.dart](../../mobile/lib/features/session/presentation/widgets/folder_sessions_panel.dart)), aberta pelo `folder_copy_outlined`. |
| **Leitor** | a tela que mostra um arquivo: texto, markdown, PDF ou imagem. |
| **Fonte** | o texto cru de um markdown, em oposição à prévia. |

## 3. Princípios

1. **O backend já sabe fazer isso.** A árvore, o conteúdo, os bytes crus com `Range` e o download
   existem desde o plano 07, com contenção de caminho, symlink e trilha de auditoria (§4.1). O app
   **consome** esse contrato. Nenhum endpoint novo, nenhum evento WS novo (§11).
2. **Somente leitura, no app.** O app não ganha criar, renomear, mover, apagar, salvar nem enviar. É a
   [ADR-015](../architecture/shared/00-decisions.md) ("o humano escreve no disco pelo web") mantida. O
   servidor não distingue leitura de escrita por cliente (§4.3, achado 2), então a garantia é a
   **ausência** do código de escrita no app, verificada por teste de arquitetura (§14).
3. **A sessão não para.** Abrir o painel ou o leitor não interrompe o stream, não move o ponto de
   retomada e não esconde um pedido de permissão (§4.3, achado 1).
4. **Conteúdo do usuário é não confiável.** É a mesma regra da
   [07 · D-18](../plans/07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)
   no web: nada é executado, HTML e SVG não viram documento ativo, e link externo nunca abre sem a
   pessoa ver para onde vai.
5. **Token só em cabeçalho.** Bytes chegam pelo `ApiClient` com Bearer, nunca por URL com token
   ([07 · D-16](../plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos),
   [22 · D-10](../plans/22-live-history/decisions.md)).
6. **Motor nativo atrás de porta.** PDF e "salvar como" dependem de código de plataforma que o
   `flutter test` não roda. Ficam atrás de porta com fake, como o `PdfEngine` do web (§14).

## 4. Estado atual

### 4.1 Backend: pronto

Levantado em [files.controller.ts](../../backend/src/adapter/inbound/http/files/files.controller.ts) e
[file-transfer.controller.ts](../../backend/src/adapter/inbound/http/files/file-transfer.controller.ts).
A tabela completa está no [backend/03-modules](../architecture/backend/03-modules.md).

| Rota | O que o app usa dela |
|---|---|
| `GET /files/tree?folder=&path=` | um nível por vez, carregado sob demanda. Pastas primeiro, ordem natural. Cada entrada traz `kind` (`file`, `directory`, `symlink`, `other`), `size`, `mtime`, `hidden`, `outside` (symlink para fora da pasta) e `targetKind`. Teto de 5 000 por nível, com `truncated: true` ([07 · D-10](../plans/07-explorer-and-editor/decisions.md)). |
| `GET /files/content?folder=&path=` | o texto já decodificado, com `encoding`, `eol`, `size`, `largeFile` (acima de 1 MB) e `ETag`. `If-None-Match` igual → `304`. `413` acima de 10 MB, `415 FILE_NOT_TEXT` para binário (NUL nos primeiros 8 KB) ou codificação desconhecida. |
| `GET /files/raw?folder=&path=&download=` | os bytes, com `Content-Type` **pelo conteúdo** (PDF, PNG, JPEG, GIF, WebP, BMP, ICO, SVG, texto; nunca `text/html`), `Range` → `206`, `ETag`, `nosniff` e `CSP: sandbox` sempre. Com `download=true`, sai como `attachment` e grava `file.downloaded` na trilha. Teto de 200 MB por resposta. |
| `GET /files/limits` | os tetos acima, para o app dizer o limite antes de tentar. |

A contenção vale para qualquer cliente: o `folder` passa pelas quatro verificações do `cwd` de sessão
(regra pura, existe, `realpath` dentro de uma raiz da allowlist do usuário, é diretório). `path` que sobe
acima da pasta dá `403`, mesmo dentro da mesma raiz. Symlink só é seguido se o `realpath` ficar dentro
da pasta, com `O_NOFOLLOW` e conferência pelo `/proc/self/fd`.

### 4.2 App: nada de arquivos, e as peças que ajudam

| Peça | Situação |
|---|---|
| Explorer, leitor, download | **não existem**. Nenhuma chamada a `/files/*` em `mobile/lib`. |
| A pasta da sessão | `SessionFacts.workspacePath` ([conversation.dart](../../mobile/lib/features/session/domain/entities/conversation.dart)), preenchido pelo `session.opened`, **nulo até ele chegar**. O botão de sessões já se esconde enquanto é nulo. |
| Botão e painel de sessões | `IconButton` com `Badge`, primeiro item das `actions` da `SessionPage`, que abre um `Drawer` **à esquerda** por `Scaffold.of(context).openDrawer()`. O deslizar da borda não é usado, porque as duas bordas são o "voltar" do Android ([10 · D-26](../plans/10-mobile-chat-layout/decisions.md)). O `AppScreen` só aceita `drawer`, não `endDrawer`. |
| Bytes com Bearer | `ApiClient.bytes(path)` devolve `Uint8List` + `contentType` e nunca loga os bytes. Usado pelas imagens do prompt. |
| Zoom | um único `InteractiveViewer`, na tela cheia da imagem do prompt ([image_marker.dart](../../mobile/lib/features/session/presentation/widgets/image_marker.dart)). |
| Markdown | **nenhum**. O chat é `Text` puro; markdown no app foi adiado duas vezes ([22](../plans/22-live-history/README.md), [24 · D-21](../plans/24-structured-questions/decisions.md)). |
| Pacotes | sem markdown, PDF, `url_launcher`, salvar arquivo ou compartilhar. `path_provider` só transitivo. |
| A barra da sessão | voltar + título + `StatusChip` + 3 ícones (sessões, histórico, `⋯`). O [session_header_test.dart](../../mobile/test/widget/features/session/session_header_test.dart) afirma **exatamente 3** `IconButton`s, com o comentário "the loose icons are gone". |
| Seletor de pasta | o `FolderBrowsePage` (`/workspaces/browse`) lista só diretórios, por `/workspaces/directories`. Não serve de base: é para escolher raiz, não para ler. |

### 4.3 Achados colaterais

1. **Um pedido de permissão fica sem aviso quando há uma tela por cima da sessão.** A `SessionPage` diz
   ao nativo "esta sessão está na tela" no `initState` e só desfaz no `dispose` ou quando o app vai para
   o fundo ([session_page.dart](../../mobile/lib/features/session/presentation/pages/session_page.dart),
   `_showing`). Uma rota empilhada por cima não a descarta. **Isso já acontece hoje com o histórico**,
   que é empilhado (`context.push(historyRouteFor(folder))`): um pedido que chega nesse momento não
   notifica, e o card está atrás da tela. O leitor, empilhado da mesma forma, herdaria o problema.
   O conserto natural é um `RouteObserver` com `RouteAware` (`didPushNext` → nenhuma sessão,
   `didPopNext` → esta). Ele vale também para o histórico e é pré-requisito do princípio 3. Ver D-11.
2. **O servidor não tem "somente leitura" por cliente.** Todo `/files/*` só exige o Bearer. Um token do
   app, mesmo de um aparelho ainda pendente, pode escrever. A aprovação de aparelho só vale para
   decisões de permissão ([shared/08](../architecture/shared/08-authentication.md)). Hoje isso não
   importa, porque o app não chama `/files`. Depois desta mudança, o app passa a ler o conteúdo da
   pasta inteira. Ver D-12.
3. **O app ignora `workspace.*` de propósito**, para que um evento do watcher não mova o ponto de
   retomada da sessão ([session_event_mapper.dart](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart),
   S-04 do plano 07). Ver §10.

## 5. Arquitetura alvo

```
SessionPage (e FolderPage)                                       backend (sem mudança)
 ├─ barra: [sessões] [ARQUIVOS] [histórico] [⋯]
 ├─ drawer    → painel de sessões (existe)
 └─ endDrawer → painel de arquivos ───── GET /files/tree ──────────▶ files.controller
                 │ toque num arquivo
                 ▼
          push /files/view?folder=&path=          (a sessão fica viva embaixo)
          Leitor
           ├─ texto     ── GET /files/content ─────────────────────▶ files.controller
           ├─ markdown  ── GET /files/content (+ /raw das imagens relativas)
           ├─ PDF       ── GET /files/raw (Bearer; Range se o motor pedir) ▶ file-transfer.controller
           ├─ imagem    ── GET /files/raw
           └─ ⤓ baixar  ── GET /files/raw?download=true → arquivo temporário → "salvar como" do SO
```

Uma feature nova, `lib/features/files/`, nas camadas de sempre ([mobile/01](../architecture/mobile/01-architecture.md)):

| Camada | Conteúdo |
|---|---|
| `domain/` | `FileEntry`, `FileListing` (com `truncated`), `TextDocument`, `ViewerKind` e a regra pura que escolhe o leitor (§7.1). Sem Flutter. |
| `data/` | `FilesApiDataSource` (tree, content, raw, limits), mappers dos DTOs, `FilesRepository`, `FileSaver` (porta do "salvar como", §9), e os erros `413`, `415`, `403` e `404` mapeados para `Failure`. |
| `presentation/` | `FilesPanel` (com o botão estático `FilesPanel.button`, como o das sessões), `FileViewerPage`, um widget por leitor, os providers da árvore (por pasta, `keepAlive`, para o painel reabrir onde estava) e do documento. |

A `session` importa o barril de `files`, nunca o contrário. A regra entra no `import_lint` do
[analysis_options.yaml](../../mobile/analysis_options.yaml) e é provada no `import_rules_test.dart`
plantando a violação, como as outras.

## 6. O painel de arquivos

### 6.1 O botão e a barra lateral

- Um `IconButton` com o mesmo molde do `FolderSessionsPanel.button`: ícone *outlined* de 24 dp, tooltip
  traduzido, alvo de 48 dp. Só aparece com `workspacePath` conhecido, como o das sessões. O ícone é a
  D-03.
- Abre um **`endDrawer`, à direita** (D-01). O `Scaffold` tem um slot de cada lado, e os dois painéis
  ficam independentes: cada um guarda o seu estado, e nenhum troca de conteúdo. O `AppScreen` ganha o
  parâmetro `endDrawer`, com a mesma regra do `drawer`: abre pelo botão, nunca pelo deslizar.
- Largura: a do `Drawer` padrão (304 dp) é estreita para caminho e nome longo. Proposta: até 85 % da
  tela, no máximo 400 dp, medida em 360×640 com fonte em 200 %.
- **A barra passa a ter 4 ícones.** Isso contraria o enxugamento do plano 10, e o
  `session_header_test` muda de 3 para 4. Em 360 dp, voltar + 4 × 48 dp deixam ~110 dp para título e
  chip, que já cedem antes das ações (`AppScreen.titleEnd`). Medir, e decidir se o histórico vai para o
  `⋯` (D-02).

### 6.2 Navegação dentro do painel

O painel tem 300 a 400 dp. Uma árvore com recuo por nível perde a largura em três ou quatro níveis.
Proposta (D-04): **um nível por vez**, como os gerenciadores de arquivo do celular.

```
┌──────────────────────────────┐
│ Arquivos                 ⋮   │  ⋮ = mostrar ocultos · atualizar
│ remote-claude › docs › plans │  migalha: cada trecho é tocável
├──────────────────────────────┤
│ ↑  ..                        │
│ 📁 21-rich-previews          │
│ 📁 24-structured-questions   │
│ 📄 README.md        12 KB    │
│ 📄 progress.md       9 KB    │
│ 🔗 link-externo  (fora)      │  outside: não abre
└──────────────────────────────┘
```

- **Raiz é a pasta da sessão.** Não dá para subir acima dela. O servidor já recusa com `403`, e o
  painel nem oferece.
- Pastas primeiro, na ordem do servidor. A linha mostra nome, tamanho e ícone por tipo. Toque na pasta
  entra; toque no arquivo abre o leitor (§7). Toque longo abre uma folha (`showSheet`) com **baixar** e
  **copiar caminho relativo**, e as duas também são ações de `Semantics`
  ([mobile/04](../architecture/mobile/04-ui.md)).
- **Ocultos:** o servidor marca `hidden` (`.git`, `.svn`, `.hg`, `.DS_Store`, `Thumbs.db`) e o cliente
  filtra. Escondidos por padrão, com "mostrar ocultos" no `⋮`, como no web. `node_modules`, `dist` e
  similares aparecem: o servidor só deixa de assisti-los.
- **Symlink para fora** (`outside: true`): aparece, marcado, e não abre. Quebrado (`targetKind:
  missing`): idem.
- **`truncated`:** uma faixa no fim, "mostrando os primeiros 5 000 itens".
- **Os quatro estados** de toda tela (carregando, erro, vazio, conteúdo), cada um numa linha.
- **Puxar para atualizar** recarrega o nível. Reabrir o painel mostra o nível onde se estava e recarrega
  em segundo plano (§10).

### 6.3 Onde mais o painel aparece

"Mesmo estando dentro de uma sessão" pede o painel na `SessionPage`, mas ele também cabe na
`FolderPage` (a lista de sessões da pasta), onde a pasta é conhecida e nenhuma sessão precisa estar
aberta. O widget é o mesmo (D-05).

## 7. O leitor

Uma rota empilhada, `/files/view?folder=&path=`. A pasta e o caminho vão na query, como manda o
[router](../../mobile/lib/app/router.dart) (proxies normalizam `%2F` no path). "Voltar" retorna à
sessão com a rolagem e a caixa de texto intactas, como o histórico já faz. Barra do leitor: nome do
arquivo (o caminho relativo no subtítulo), **baixar**, e um `⋯` com as opções do tipo.

### 7.1 Qual leitor abre

Regra pura, no domínio:

| Caso | Leitor | Como os bytes chegam |
|---|---|---|
| `.md`, `.markdown`, `.mdx` | markdown, com alternância **prévia ↔ fonte** | `/files/content` |
| `.pdf` | PDF | `/files/raw`, confirmando `application/pdf` no `Content-Type` |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp` | imagem | `/files/raw`, confirmando `image/*` |
| qualquer outro | texto | `/files/content` |
| `/files/content` respondeu `415 binary` | "sem prévia", com **baixar** | — |
| `415 encoding` | "codificação não reconhecida", com **baixar** | — |
| `413` (acima de 10 MB) | "grande demais para abrir no celular", com o tamanho e **baixar** | — |

A extensão escolhe o leitor, e o `Content-Type` do servidor (que vem dos bytes) confirma. Um `.pdf` que
não é PDF cai no "sem prévia", e o motor de PDF nunca recebe lixo. SVG abre como **texto** (D-08).

### 7.2 Texto

- **Quebra de linha** ligável no `⋯` (R4). A escolha é lembrada no aparelho, para todos os arquivos
  (D-07). Com a quebra desligada, a rolagem é nas duas direções (§8).
- Fonte monoespaçada, **números de linha** na margem (alinhados à linha lógica quando a quebra está
  ligada).
- **Linhas virtualizadas**: só se desenha o que está perto da vista. Um arquivo de 1 MB tem dezenas de
  milhares de linhas, e um único `Text` com tudo trava o celular. É isto que descarta "um
  `InteractiveViewer` sobre o texto inteiro" (§8).
- **Copiar**: seleção nativa onde a virtualização permitir (`SelectionArea`), e "copiar tudo" no `⋯`
  como garantia.
- O que **não** entra agora: realce de sintaxe e busca no arquivo (§15).
- `largeFile` (acima de 1 MB) abre do mesmo jeito, com uma faixa avisando o tamanho. O teto do celular
  pode ser menor que os 10 MB do servidor (D-09).

### 7.3 Markdown

- Renderizador: **`flutter_markdown_plus`**. O `flutter_markdown` do Google foi descontinuado em
  2025-04-30, e o `_plus` é a continuação mantida pela Foresight Mobile (D-06).
- **Prévia ↔ fonte**: um alternador na barra. A fonte é o leitor de texto do §7.2.
- **Conteúdo não confiável** (princípio 4), como o `Markdown` do web
  ([08](../plans/08-claude-panel/README.md), [07 · D-18](../plans/07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)):
  - HTML embutido **não** é renderizado. Aparece como texto.
  - **Link relativo** para outro arquivo da pasta (`[plano](../plans/x.md)`) abre o leitor desse
    arquivo, resolvido contra o diretório do atual. Se sair da pasta, o servidor recusa.
  - **Link externo** (`http`, `https`, `mailto`) abre no navegador do sistema **depois de uma
    confirmação que mostra o endereço**. Outros esquemas não abrem. Isso pede `url_launcher`, que o
    `pdfrx` já traz como dependência transitiva.
  - **Imagem relativa** é carregada por `/files/raw` com Bearer. **Imagem remota não é carregada**
    (rastreio e rede), e no lugar dela fica o texto alternativo com o endereço.
- **Tabela larga** rola na própria caixa, sem empurrar a tela (o problema que o plano 21 resolveu no
  web).
- Bloco `mermaid` vira **diagrama** (§7.4).

### 7.4 Diagramas Mermaid

Um bloco ` ```mermaid ` na prévia vira o diagrama desenhado (R9). Na fonte, continua código. O web
também vai ter isso, no [plano 21 · F3](../plans/21-rich-previews/F3-markdown.md), ainda não feito: lá,
o `mermaid` (JS) gera SVG inline sanitizado ([21 · D-02](../plans/21-rich-previews/decisions.md#f0--normas)).

**Não existe Mermaid nativo em Flutter maduro.** O Mermaid de referência é JavaScript e precisa de DOM
para medir texto. As saídas:

| Opção | Como | A favor | Contra |
|---|---|---|---|
| **(a) WebView com o `mermaid.js` embutido** | um `webview_flutter` fora da tela, que carrega uma página local com o `mermaid.min.js` como asset, recebe o código, devolve o SVG ou um PNG | **o mesmo motor do web**: o diagrama sai igual nos dois clientes, com todos os tipos | WebView, JavaScript ligado, ~3 MB de asset, primeiro desenho lento (subir o webview). Isolar exige CSP `default-src 'none'`, navegação bloqueada e um único canal de resposta |
| **(b) `merman`** | motor headless em Rust, por FFI (Android API 24+, iOS 13+), que devolve SVG, **PNG**, PDF ou JSON | sem JS, sem WebView, sem rede. Tetos de recurso e *timeout* embutidos. Declara compatibilidade com o Mermaid 12.1 | **jovem**: a 0.8.0 saiu em 2026-10, depois de uma série de alphas. Fidelidade ao Mermaid real a medir. Biblioteca nativa por ABI no APK |
| **(c) `flutter_mermaid`** | Dart puro, desenha widgets | sem nativo, sem JS | 0.1.0, publicador não verificado, só uma parte dos tipos (fluxograma, sequência, pizza, Gantt, linha do tempo, Kanban, radar, XY). Falta classe, estado, ER e mindmap |
| (d) renderizar no backend | `mermaid-cli` com Chromium headless | o app só recebe imagem | um navegador headless no backend, e um endpoint novo. Desproporcional |
| (e) serviço externo (mermaid.ink, Kroki) | — | — | **descartada**: o conteúdo da pasta sairia da máquina |

**Recomendação (D-10):** decidir entre (a) e (b) no spike S1, com o mesmo conjunto de diagramas nos
dois. **(b) se a fidelidade passar**, porque a superfície é menor e o app não ganha um navegador. Senão,
(a). Nos dois casos o motor fica atrás de uma porta `DiagramEngine` (princípio 6).

Como fica, em qualquer motor:

- **Imagem na prévia, ajustada à largura.** O motor devolve PNG (ou o SVG rasterizado) na densidade da
  tela. Desenhar SVG no Flutter com `flutter_svg` é arriscado, porque o SVG do Mermaid usa `<style>`
  com classes e `<foreignObject>` nos rótulos, e o `flutter_svg` cobre pouco dos dois. Isso fica para
  medir, não para supor.
- **Toque abre o diagrama em tela cheia**, com `InteractiveViewer` (pinça e arrasto), redesenhado numa
  resolução maior para não borrar no zoom. É o R5 aplicado ao diagrama: um fluxograma grande não cabe
  legível em 360 dp.
- **Tema:** o claro ou o escuro do Mermaid, conforme o tema do app. Trocar o tema redesenha.
- **Erro de sintaxe** não quebra a prévia: aparece o bloco como código e, acima dele, "não foi possível
  desenhar o diagrama", com a linha do erro quando o motor informar.
- **Tetos:** tamanho do código (o `maxTextSize` do Mermaid é 50 000 caracteres por padrão), número de
  arestas e um *timeout* (p. ex. 5 s). Passou do teto, vira código com aviso. Um markdown com 30
  diagramas não pode travar o app, então o desenho é **sob demanda**: quando o bloco se aproxima da
  vista, fora da thread de UI, um por vez.
- **Cache** em memória por hash do código, do tema e da largura. Rolar para cima e para baixo não
  redesenha.
- **Conteúdo não confiável** (princípio 4): `securityLevel: 'strict'` no (a), e nenhuma rede nos dois
  casos. Diretivas `click` e links do diagrama **não** funcionam, porque o diagrama é imagem. Texto do
  diagrama também não se seleciona. **Isso diverge do web**, que escolheu SVG inline justamente por
  isso (21 · D-02). Ver D-18.
- **Versão:** se for (a), o `mermaid.min.js` do app vem da mesma versão que o `web/` instalar no
  plano 21, copiado por script no build, e não baixado à mão. Os dois clientes sobem de versão juntos.

### 7.5 PDF

- Motor: **`pdfrx`** (PDFium, MIT, Android/iOS/desktop). Ele traz pronto o que o pedido exige: rolagem
  corrida, pinça para zoom, arrasto, duplo toque, texto selecionável e links. Fica atrás da porta
  `PdfEngine` (princípio 6) (D-06).
- **Bytes:** o caminho simples é `ApiClient.bytes` → documento em memória. O `pdfrx` também abre por
  URI com cabeçalhos e leitura por intervalo, o que casaria com o `Range` do `/files/raw` sem carregar
  tudo. **A confirmar no spike S1**, com o Bearer no cabeçalho e o `If-Match` entre páginas.
- **PDF com senha:** pede a senha numa folha. A senha não é guardada nem logada.
- **Links do PDF:** a mesma regra do markdown (confirmação, só `http`, `https` e `mailto`). Formulários
  e JavaScript do PDF ficam desligados, como no web (plano 21, "Não entra").
- Indicador "página N de M" e "ir para a página". Índice e miniaturas ficam para depois (§15).
- **Tamanho do APK:** o PDFium soma alguns MB por ABI. A medir no S1.

### 7.6 Imagem

Fora do pedido literal, mas barato e útil para o que o Claude gera (capturas, gráficos). Reaproveita o
molde da imagem do prompt: `InteractiveViewer` sobre `Image.memory`, com carregando, erro e "tentar
de novo". O widget é extraído para `core/widgets`, para não duplicar (o portão de duplicação reprova o
contrário).

## 8. Zoom e arrasto

"Dar zoom e mover pelo conteúdo" (R5) tem um gesto só, a pinça e o arrasto, mas uma implementação por
tipo de conteúdo. Uma transformação gráfica sobre um texto longo não funciona: obriga a desenhar tudo
de uma vez e não deixa a quebra de linha se refazer.

| Leitor | Zoom | Mover | Por quê |
|---|---|---|---|
| Texto | a **pinça muda o tamanho da fonte** (de 50 % a 300 %), e as linhas se refazem | rolagem vertical; com a quebra desligada, rolagem nas **duas direções** | mantém a virtualização e a quebra de linha. É o "zoom de texto" do navegador |
| Markdown (prévia) | a pinça muda a escala do texto (`textScaler`), com a mesma faixa | rolagem vertical; tabela e bloco de código rolam na horizontal dentro da própria caixa | a prévia continua refluindo para a largura da tela |
| PDF | o zoom do `pdfrx`, com pinça e duplo toque | arrasto livre | o motor já faz, com nitidez por página |
| Imagem | `InteractiveViewer` | arrasto livre | é uma imagem, e a transformação é o certo aqui |
| Diagrama Mermaid | na prévia, segue a escala do markdown; **tocando, tela cheia com `InteractiveViewer`**, redesenhado em resolução maior | arrasto livre na tela cheia | o diagrama é imagem, e um fluxograma grande precisa de zoom próprio (§7.4) |

O zoom do texto e do markdown é lembrado enquanto o leitor está aberto, e não por arquivo. Alternativa:
`InteractiveViewer` em todos os leitores, pelo gesto idêntico. Fica descartada pelo motivo acima, e
volta como D-07 se o usuário preferir.

## 9. Download

- **De onde:** o botão do leitor e o toque longo no painel. **Só arquivo.** Pasta inteira (o zip do
  `/files/archive`) é a D-13.
- **Fluxo:** `GET /files/raw?download=true` com Bearer, gravado **em stream** num arquivo temporário do
  app (`Dio.download`, com progresso e cancelar), e depois o **"salvar como" do sistema**: no Android,
  `ACTION_CREATE_DOCUMENT` (Storage Access Framework); no iOS, o seletor de documentos. A pessoa escolhe
  a pasta e o nome. O temporário é apagado em seguida, tanto no sucesso quanto no cancelamento.
- **Por que o seletor do sistema:** não pede permissão de armazenamento em nenhuma versão do Android, a
  pessoa vê onde o arquivo foi parar, e é o mesmo gesto do `showSaveFilePicker` do web. Gravar direto em
  "Downloads" pelo MediaStore é a alternativa (sem pergunta, mas só Android) (D-14).
- **Teto:** os 200 MB do servidor (`/files/limits`), conhecidos antes. O stream para o temporário evita
  segurar o arquivo inteiro na memória, que é o risco que a D-16 do 07 deixou para medir "no celular".
- **Trilha:** `download=true` já grava `file.downloaded` no backend, sem mudança.
- **Upload:** não existe no app (R8). Nem botão, nem `POST /files/upload` no `FilesApiDataSource`.

## 10. Mudanças no disco enquanto se lê

O Claude pode mudar um arquivo enquanto ele está aberto no celular. O web assiste a pasta por
`workspace.watch`, mas o app descarta `workspace.*` (§4.3, achado 3).

Proposta para a primeira versão (D-15): **sem watch**.

- O painel recarrega o nível ao abrir e ao puxar para atualizar.
- O leitor recarrega ao voltar ao primeiro plano, ao voltar de outra tela e pelo "atualizar" do `⋯`,
  sempre com `If-None-Match`. O `304` deixa isso barato.
- Quando o `ETag` muda, o leitor troca o conteúdo **mantendo a posição** e diz "o arquivo mudou" numa
  faixa.

Assinar `workspace.watch` no app exige rotear `workspace.*` no `WsClient` sem tocar no `seq` da sessão.
É viável, mas é mudança no caminho mais sensível do app, e o ganho sobre o `304` é pequeno.

## 11. Contrato

**Nada muda.** Nenhum endpoint, evento WS ou código de erro novo, e o web e o backend não são tocados.

O que muda é a **documentação de quem consome**:

- [backend/03-modules](../architecture/backend/03-modules.md): o app passa a ser cliente de `tree`,
  `content`, `raw` e `limits`.
- [mobile/04-ui](../architecture/mobile/04-ui.md#o-que-o-app-não-tem-e-por-quê): o explorer **somente
  leitura** sai da lista do que o app não tem. O `@` arquivo no prompt **continua** fora (§15), e o
  motivo da linha muda de "não tem explorer" para "escopo decidido".
- [plano 07](../plans/07-explorer-and-editor/README.md) e [plano 21](../plans/21-rich-previews/README.md),
  "Não entra": uma nota apontando para o plano novo.

Os erros que o app precisa traduzir já estão no [catálogo](../architecture/shared/04-errors-and-http.md)
e têm chave no web: `FILE_TOO_LARGE`, `FILE_NOT_TEXT`, `FILE_NOT_A_FILE`, `FILE_ACCESS_DENIED`, `WORKSPACE_NOT_ALLOWED`,
`FILE_NOT_FOUND`, `RANGE_NOT_SATISFIABLE`. O `scripts/i18n-check.mjs` já confere a paridade de texto
com o web.

## 12. Mudanças por ponta

### 12.1 Backend

Nenhuma no código. Só a nota de consumidor no `backend/03`. Se a D-12 for "exigir aparelho aprovado",
aí sim: um guard nas rotas de leitura de `files`, com teste e contrato.

### 12.2 Web

Nenhuma.

### 12.3 Mobile

| Onde | O quê |
|---|---|
| `lib/features/files/` | a feature nova (§5) |
| `core/widgets/app_screen.dart` | parâmetro `endDrawer`, com a mesma regra do `drawer` |
| `core/widgets/` | o leitor de imagem com zoom, extraído do `image_marker.dart` |
| `features/session/presentation/pages/session_page.dart` | o botão e o `endDrawer`. O `RouteAware` do achado 1 (D-11) |
| `features/workspace/presentation/pages/folder_page.dart` | o mesmo painel, se a D-05 for sim |
| `app/router.dart`, `core/navigation/routes.dart` | `/files/view?folder=&path=`, com builder `viewerRouteFor(folder, path)` |
| `android/`, `ios/` | o "salvar como" (canal próprio ou pacote, D-14) |
| `l10n/app_en.arb`, `app_pt.arb` | as chaves novas, em `en` e `pt-BR` |
| `analysis_options.yaml` | as regras do `import_lint` para `files` |
| `test/widget/.../session_header_test.dart` | de 3 para 4 `IconButton`s (ou 3, se a D-02 tirar o histórico) |

## 13. Dependências novas

| Pacote | Para quê | Observação |
|---|---|---|
| `flutter_markdown_plus` | prévia de markdown | continuação mantida do `flutter_markdown` (descontinuado). Traz o `markdown` (parser) |
| `pdfrx` | leitor de PDF | PDFium, MIT, *verified publisher*. Traz `path_provider` e `url_launcher` |
| motor do Mermaid | §7.4 | D-10: `merman` (nativo por ABI) ou `webview_flutter` + `mermaid.min.js` como asset |
| `url_launcher` | link externo, depois da confirmação | direto, porque o código o usa, apesar de já vir pelo `pdfrx` |
| `path_provider` | o temporário do download | hoje só transitivo; passa a direto |
| "salvar como" | §9 | D-14: canal próprio (~50 linhas de Kotlin e Swift, como o `remote_claude/push`) ou um pacote (`file_picker`, `flutter_file_dialog`) |

Cada uma entra pelo portão de licença e de segurança do `verify:full`. O tamanho do APK antes e depois
é medido no S1.

## 14. Testes

| Nível | O que cobre |
|---|---|
| Unit | a regra que escolhe o leitor (§7.1); a resolução de link relativo do markdown, incluindo `../` que sai da pasta; o filtro de ocultos; os mappers; o mapeamento de `413`, `415`, `403` e `404` para `Failure`; o repositório com `304`. Um teste de arquitetura que reprova qualquer chamada de escrita (`put`, `post`, `delete`) em `features/files/data/` (princípio 2) |
| Widget | o botão e o `endDrawer` (abrir, voltar, os dois painéis sem interferência); navegação por nível, migalha, ocultos, `truncated`, `outside`; os quatro estados; o leitor de texto com quebra ligada e desligada e a pinça mudando a fonte; markdown com HTML, link relativo, externo e imagem remota; Mermaid desenhado, com erro de sintaxe, acima do teto, em tela cheia e com troca de tema; "sem prévia", "grande demais" e "codificação"; 360×640 e 360×400 com fonte em 200 %; os `meetsGuideline` de alvo, contraste e rótulo. PDF, Mermaid e "salvar como" **por fake** da porta |
| Integração | o `FilesApiDataSource` contra um servidor HTTP fake, com `Range`, `ETag`, `304` e cancelamento do download |
| E2E (emulador) | pela pilha real do `run-e2e-local`: uma pasta de fixture com markdown (com tabela larga e blocos `mermaid` de vários tipos, um deles inválido), texto longo, PDF e binário. A sessão roda, abre o painel, navega, abre cada tipo, alterna a quebra, volta, e um pedido de permissão que chega com o leitor aberto **notifica** (achado 1). O download no seletor do sistema é a D-16 |

Duas observações de ambiente:

- o `makeFolder` do e2e cria arquivo por `POST /files`, que é texto. O PDF da fixture precisa do
  `/files/upload` no helper (é o "navegador" do teste, não o app) ou de uma pasta preparada pelo script;
- o `verify:full` não roda o e2e do Flutter. O plano precisa dizer que o `pnpm test:e2e:mobile` faz
  parte do critério de conclusão dele.

## 15. Fora do escopo

- **Editar, criar, renomear, mover, apagar, enviar** (R2, R8).
- **`@` arquivo no prompt** a partir do painel. Seria o próximo passo natural (o painel resolve o "não
  tem de onde escolher" do [10 · D-01](../plans/10-mobile-chat-layout/decisions.md)), mas não foi
  pedido.
- **Tocar num caminho citado pelo Claude na conversa para abrir o arquivo.** Mesma observação.
- **Realce de sintaxe e busca dentro do arquivo.**
- **Índice e miniaturas do PDF**, que o plano 21 tem no web.
- **SVG desenhado** (D-08).
- **Links e texto selecionável dentro do diagrama Mermaid** (D-18).
- **"Reabrir com outra codificação"**, que o web tem.
- **Compartilhar** (a folha de compartilhamento do sistema). O pedido é baixar.
- **Diff** do arquivo contra a versão anterior e o histórico local do plano 07 · F8.
- **Markdown no chat.** O renderizador entra no app e pode ser reaproveitado, mas a decisão de usar no
  chat continua a [24 · D-21](../plans/24-structured-questions/decisions.md).

## 16. Decisões em aberto

| ID | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-01 | **Lado da barra lateral** | (a) `endDrawer`, à direita; (b) à esquerda, trocando o conteúdo do `drawer` conforme o botão | **(a)**. Dois slots, dois estados independentes, e o lado diz qual painel é. (b) mantém o lado do VS Code, mas obriga a trocar o widget do slot e perde o estado do outro |
| D-02 | **4 ícones na barra da sessão** | (a) 4 ícones; (b) o histórico vai para o `⋯`, ficam 3 | medir em 360 dp com fonte em 200 % e decidir com a captura. Se o título e o chip sumirem, **(b)** |
| D-03 | **Ícone do botão** | (a) `account_tree_outlined` (árvore); (b) `file_copy_outlined` (o desenho do Explorer do VS Code); (c) `source_outlined` (pasta com `<>`) | **(a)**: é o que mais se distingue do `folder_copy_outlined` das sessões em 24 dp. Confirmar na captura |
| D-04 | **Navegação no painel** | (a) um nível por vez, com migalha; (b) árvore expansível com recuo | **(a)**: a largura do painel não comporta recuo além de três níveis |
| D-05 | **O painel também na `FolderPage`** | sim; não | **sim**: o mesmo widget, e permite ler arquivos sem abrir sessão |
| D-06 | **Motores de markdown e PDF** | markdown: `flutter_markdown_plus`, `gpt_markdown`, `markdown_widget`; PDF: `pdfrx`, `syncfusion_flutter_pdfviewer` (licença comercial), `flutter_pdfview` (nativo, sem seleção de texto) | **`flutter_markdown_plus` + `pdfrx`**, ambos de licença livre e mantidos. Confirmar no S1 |
| D-07 | **Modelo de zoom** (§8) | (a) fonte no texto, transformação em PDF e imagem; (b) `InteractiveViewer` em tudo | **(a)**. (b) não virtualiza e não refaz a quebra |
| D-08 | **SVG** | (a) texto; (b) desenhado com `flutter_svg` | **(a)** agora: SVG é conteúdo ativo, e o pedido não o cita |
| D-09 | **Teto de texto no celular** | (a) os 10 MB do servidor; (b) um teto menor do app (p. ex. 2 MB), acima disso "baixar" | medir memória e tempo de abertura de 1, 5 e 10 MB no emulador (S1) |
| D-10 | **Motor do Mermaid** (§7.4) | (a) WebView com o `mermaid.js` embutido; (b) `merman` (Rust por FFI); (c) `flutter_mermaid` (Dart puro) | decidir no **S1**, com o mesmo conjunto de diagramas. **(b) se a fidelidade passar**, porque não tem JS nem WebView; senão (a). (c) não desenha classe, estado, ER nem mindmap |
| D-11 | **O pedido escondido sob uma tela empilhada** (§4.3, achado 1) | (a) `RouteAware` na `SessionPage`, que conserta também o histórico; (b) faixa "o Claude está esperando" no leitor; (c) as duas | **(c)**. (a) é o conserto, (b) é o que a pessoa vê sem sair do arquivo. (a) pode entrar antes, como correção, já que o histórico já tem o problema |
| D-12 | **Ler a pasta de um aparelho pendente** (§4.3, achado 2) | (a) como hoje: o Bearer basta; (b) exigir aparelho aprovado nas rotas de leitura de `files` | decisão do usuário. (b) é mais seguro para celular perdido, mas cria uma regra por aparelho num módulo que hoje não conhece aparelho |
| D-13 | **Baixar pasta** (zip) | sim; não | **não** agora: o pedido fala de arquivos, e o `/files/archive` já existe se vier |
| D-14 | **Como salvar** | (a) "salvar como" do sistema (SAF / seletor do iOS), por canal próprio; (b) o mesmo, por pacote; (c) direto em Downloads pelo MediaStore | **(a)**: sem permissão, a pessoa escolhe o lugar, sem dependência para algo de ~50 linhas, e com o mesmo padrão de canal que o app já tem |
| D-15 | **Mudanças no disco** (§10) | (a) recarregar com `304`; (b) `workspace.watch` no app | **(a)** na primeira versão |
| D-16 | **Como o e2e passa pelo "salvar como"** | (a) fake da porta no e2e, com o diálogo nativo coberto pelo teste de integração (como o web na [07 · D-26](../plans/07-explorer-and-editor/decisions.md)); (b) Patrol dirigindo o diálogo do sistema | **(a)**. O Patrol já existe para o push, mas o diálogo do DocumentsUI muda entre versões do Android |
| D-17 | **Onde lembrar a quebra de linha** | (a) global no aparelho; (b) por arquivo; (c) por extensão | **(a)**, que é o que o VS Code faz |
| D-18 | **Diagrama como imagem** no app, enquanto o web terá SVG inline com texto selecionável e links (21 · D-02) | (a) imagem, sem links nem seleção; (b) diagrama num WebView visível, com links pela regra do markdown | **(a)**: um WebView por diagrama dentro de uma lista rolável pesa e briga com o gesto de rolagem. Links de diagrama são raros |

## 17. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-01 | Um pedido de permissão não notifica enquanto o leitor está aberto (achado 1) | D-11, com cenário de e2e próprio |
| R-02 | Arquivo grande trava o app ou estoura a memória (texto de 10 MB, PDF de 200 MB) | linhas virtualizadas; download em stream; D-09; PDF por intervalo se o S1 confirmar |
| R-03 | O APK cresce com o PDFium | medir no S1; o build já é por ABI |
| R-04 | Markdown malicioso: link `javascript:`, imagem remota de rastreio, HTML | só `http`, `https` e `mailto`, com confirmação; nada remoto carregado; HTML como texto (§7.3) |
| R-05 | A barra da sessão não comporta o quarto ícone em 360 dp com fonte grande | D-02, medida na captura |
| R-06 | O `pdfrx` não roda no `flutter test` | porta `PdfEngine` com fake; o motor de verdade só no e2e |
| R-07 | O ícone novo confunde com o das sessões | D-03, decidida na captura |
| R-08 | O app passa a mostrar o conteúdo da pasta inteira num aparelho que pode ser perdido | D-12; o bloqueio do app (`local_auth`) já existe |
| R-10 | Motor do Mermaid jovem (`merman`) ou pesado (WebView) | S1 compara os dois; porta `DiagramEngine` deixa trocar sem mexer nas telas; versão fixada exata |
| R-11 | Um markdown com muitos diagramas trava o app | desenho sob demanda, fora da thread de UI, um por vez, com *timeout* e cache (§7.4) |
| R-12 | O diagrama sai diferente no web e no app | (a) usa o mesmo `mermaid.js`; com (b), o S1 compara lado a lado e o plano registra as diferenças aceitas |
| R-09 | Leitor e sessão disputando a mesma conexão: `ApiClient` com 401 no meio de um download longo | o interceptor já renova uma vez e repete; o download repete com `Range` a partir do que já chegou |

## 18. Matriz de cenários (semente)

Para o plano, enumerar por completo pelas seis dimensões do
[Estágio 0](../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
Semente:

| Dimensão | Cenários |
|---|---|
| Equivalência | abrir markdown (prévia e fonte), texto, PDF, imagem e binário; Mermaid de fluxograma, sequência, classe, estado, ER, Gantt, pizza e mindmap; navegar a partir da sessão e da `FolderPage`; baixar pelo leitor e pelo toque longo |
| Fronteira | pasta vazia; nível com 5 000 itens (`truncated`); nome com acento, espaço, emoji e 255 bytes; arquivo de 0 byte; texto exatamente em 1 MB e em 10 MB; linha única de 1 MB sem quebra; PDF de uma página e de 500; zoom no mínimo e no máximo; Mermaid no teto de tamanho e logo acima; markdown com 30 diagramas; 360×400 com fonte em 200 % |
| Erro | `413`, `415 binary`, `415 encoding`, `403` (link que sai da pasta), `404` (arquivo apagado entre listar e abrir); PDF corrompido; Mermaid com sintaxe inválida; Mermaid que estoura o *timeout*; PDF com senha errada; rede cai no meio do download; a pessoa cancela o "salvar como"; disco do celular cheio |
| Transição de estado | sessão sem `workspacePath` (botão escondido) → `session.opened` (botão aparece); arquivo muda com o leitor aberto (`ETag` novo, posição mantida); pedido de permissão com o leitor aberto (notifica, D-11); app vai ao fundo e volta (recarrega com `304`); troca de tema com diagramas na tela; diagrama em tela cheia → voltar; token vence no meio do download |
| Concorrência | os dois painéis abertos em sequência, sem perder estado; o Claude escrevendo no arquivo enquanto ele é lido; dois downloads ao mesmo tempo; o stream da sessão seguindo com o leitor aberto |
| Idempotência | reabrir o painel volta ao mesmo nível; abrir o mesmo arquivo duas vezes não duplica rota; baixar o mesmo arquivo duas vezes; atualizar sem mudança dá `304` e não pisca a tela; rolar de volta a um diagrama não o redesenha (cache) |

## 19. Fatiamento sugerido

1. **S1 — spike dos motores** (horas, descartável): `pdfrx`, `flutter_markdown_plus` e os dois motores
   de Mermaid (`merman` e WebView + `mermaid.js`) num app mínimo no emulador API 35. Para o Mermaid: os
   mesmos oito diagramas nos dois, comparados com o `mermaid.js` no navegador, mais tempo do primeiro
   desenho e tamanho somado ao APK. Medir o APK antes e depois, abrir um PDF de 50 MB em memória e por URI com cabeçalho
   e `Range`, abrir texto de 1, 5 e 10 MB, conferir o `flutter test` com e sem o motor. Fecha D-06, D-09,
   D-10 e R-02/R-03/R-10.
2. **F0 — normas:** `mobile/04` (o explorer somente leitura, a regra de link, o modelo de zoom), as
   chaves i18n, as regras do `import_lint`, as notas nos planos 07 e 21 e no `backend/03`. O
   `RouteAware` da D-11 pode entrar aqui como correção, porque já afeta o histórico.
3. **F1 — painel:** `endDrawer` no `AppScreen`, o botão, a navegação por nível, os ocultos, a
   `FolderPage`.
4. **F2 — leitor de texto e de imagem:** a rota, a regra de escolha, a quebra, a pinça na fonte, a
   virtualização, os estados de erro.
5. **F3 — markdown, Mermaid e PDF:** os motores atrás de porta, links, imagens relativas, diagramas sob
   demanda com tela cheia, senha.
6. **F4 — download:** o temporário em stream, o "salvar como" nativo, o progresso e o cancelamento.
7. **F5 — E2E no emulador**, incluindo o pedido de permissão com o leitor aberto, e o
   `pnpm test:e2e:mobile` como parte do critério de conclusão.

## 20. Referências

- [Plano 07 — Explorer e editor](../plans/07-explorer-and-editor/README.md) e as suas
  [decisões](../plans/07-explorer-and-editor/decisions.md) (D-04, D-10, D-11, D-16, D-18, D-26)
- [Plano 21 — Rich previews](../plans/21-rich-previews/README.md): o que o leitor de PDF e o markdown
  fazem no web
- [Plano 10 — Layout de chat no app](../plans/10-mobile-chat-layout/README.md): D-01, D-06, D-26
- [mobile/04-ui](../architecture/mobile/04-ui.md), [mobile/01-architecture](../architecture/mobile/01-architecture.md),
  [backend/03-modules](../architecture/backend/03-modules.md)
- flutter_markdown, descontinuado em 2025-04-30: <https://pub.dev/packages/flutter_markdown>
- flutter_markdown_plus: <https://pub.dev/packages/flutter_markdown_plus> e a passagem da manutenção:
  <https://foresightmobile.com/blog/flutter-markdown-plus-google-handover>
- pdfrx: <https://pub.dev/packages/pdfrx>
- merman (Mermaid headless em Rust, FFI): <https://pub.dev/packages/merman>
- flutter_mermaid (Dart puro): <https://pub.dev/packages/flutter_mermaid>
- Android, Storage Access Framework (`ACTION_CREATE_DOCUMENT`):
  <https://developer.android.com/training/data-storage/shared/documents-files>
