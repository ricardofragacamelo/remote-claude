# Plano 25 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Níveis:** `unit` (`test/unit/`, Dart VM), `widget` (`test/widget/`, Dart VM), `integração` (o
`FilesApiDataSource` e o fluxo de download contra um `HttpServer` local do `dart:io`, em `test/unit/`),
`jvm` (o teste de JVM do Android, no portão de unit), `e2e` (`integration_test/`, no emulador, pela
pilha real do `run-e2e-local`), `spike` (medição no emulador, registrada no `progress.md`, sem código
que fica).

Semente: a [matriz da discovery §18](../../discovery/07-navegador-de-arquivos-no-app.md#18-matriz-de-cenários-semente),
completada e atribuída a tasks. PDF, Mermaid e "salvar como" são provados **por fake da porta** nos
níveis unit e widget; o motor de verdade só roda no spike e no e2e (R-06).

---

## Spike dos motores — B-01…B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | o `pdfrx` abre um PDF de 50 MB **da memória** e **por URI com `Authorization` no cabeçalho e `Range`**, no emulador API 35; tempo até a primeira página e pico de memória medidos nos dois caminhos | fron | spike | — | B-01 | ⬜ |
| S-02 | o `flutter_markdown_plus` não transforma HTML embutido em elemento, entrega o `href` de todo link a um callback e o `src` de toda imagem a um builder nosso | eq | spike | — | B-01 | ⬜ |
| S-03 | `flutter test` passa com `pdfrx` e `flutter_markdown_plus` no `pubspec.yaml`, e um widget que usa a porta com fake não carrega o PDFium | eq | spike | — | B-01 | ⬜ |
| S-04 | os mesmos oito diagramas (fluxograma, sequência, classe, estado, ER, Gantt, pizza, mindmap) desenhados pelo `merman` e pelo WebView com `mermaid.js`, comparados com o `mermaid.js` no navegador; as diferenças listadas | eq | spike | — | B-02 | ⬜ |
| S-05 | primeiro desenho e desenho seguinte, em cada motor; um diagrama acima do teto e um que estoura o *timeout* não travam a UI; o APK por ABI antes e depois de cada motor | fron | spike | — | B-02 | ⬜ |
| S-06 | texto de 1, 5 e 10 MB, e uma linha única de 1 MB, abertos com linhas virtualizadas: tempo de abertura e pico de memória, quebra ligada e desligada | fron | spike | — | B-03 | ⬜ |
| S-07 | as D-06, D-09, D-10 e D-22 viram ✅ com o número que as decidiu; a tabela de medidas está no `progress.md`; a ADR existe se a D-10 escolher o WebView (R-14) | eq | unit | — | B-04 | ⬜ |

## Normas — B-05, B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-08 | as normas emendadas (mobile/04, mobile/02, backend/03, a nota nos planos 07 e 21) existem, e todo link novo resolve (`pnpm docs:check`) | eq | unit | — | B-05 | ⬜ |
| S-09 | o explorer **somente leitura** saiu da lista do que o app não tem; o `@` arquivo no prompt continua nela, com o motivo "escopo decidido" | eq | unit | — | B-05 | ⬜ |
| S-10 | as chaves novas existem em `en` e `pt-BR` no app, com par no mapa compartilhado, e os códigos `FILE_TOO_LARGE`, `FILE_NOT_TEXT`, `FILE_NOT_A_FILE`, `FILE_ACCESS_DENIED`, `FILE_NOT_FOUND`, `WORKSPACE_NOT_ALLOWED` e `RANGE_NOT_SATISFIABLE` têm texto no catálogo do app (`pnpm i18n:check`) | eq | unit | — | B-06 | ⬜ |

## Somente leitura, por máquina — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-11 | uma importação plantada de `features/session/…` interno dentro de `features/files/`, ou de `features/files/data/…` dentro de `features/session/`, é reprovada pelo `import_lint` (`import_rules_test.dart`) | err | unit | — | B-07 | ⬜ |
| S-12 | uma chamada plantada de `post`, `put`, `patch`, `delete` ou `/files/upload` em `features/files/` é reprovada pelo teste de arquitetura | err | unit | — | B-07 | ⬜ |
| S-13 | a árvore real passa: o `FilesApiDataSource` só faz `GET` | eq | unit | — | B-07 | ⬜ |

## A sessão encoberta — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-14 | com uma rota empilhada sobre a `SessionPage` (o histórico, hoje), o nativo ouve "nenhuma sessão na tela"; ao voltar, "esta sessão" | est | widget | — | B-08 | ⬜ |
| S-15 | o app vai ao fundo e volta com a rota empilhada ainda por cima: continua "nenhuma sessão" | est | widget | — | B-08 | ⬜ |
| S-16 | duas rotas empilhadas e dois "voltar": o nativo termina em "esta sessão", sem chamada repetida no meio | idem | widget | — | B-08 | ⬜ |
| S-17 | a sessão é descartada com uma rota por cima: nenhuma chamada depois do `dispose` | conc | widget | — | B-08 | ⬜ |

## Aparelho aprovado para ler a pasta — B-32

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-143 | token do app com o `x-install-id` de um aparelho aprovado lê `tree`, `content`, `raw` e `limits` | eq | integração | — | B-32 | ⬜ |
| S-144 | token do app com o `x-install-id` de um aparelho pendente é recusado em toda rota de `files` | err | integração | `DEVICE_NOT_REGISTERED` | B-32 | ⬜ |
| S-145 | token do app **sem** `x-install-id` é recusado — tirar o cabeçalho não contorna | err | integração | `DEVICE_NOT_REGISTERED` | B-32 | ⬜ |
| S-146 | token do app com o `x-install-id` de um aparelho revogado, ou de outro usuário | err | integração | `DEVICE_REVOKED`, `DEVICE_NOT_REGISTERED` | B-32 | ⬜ |
| S-147 | token sem `azp`, ou com um `azp` que não é o do web, exige aparelho aprovado ([D-24](decisions.md#f1--normas-e-a-sessão-encoberta)) | fron | unit | `DEVICE_NOT_REGISTERED` | B-32 | ⬜ |
| S-148 | token do web, sem `x-install-id`, lê e escreve em `files` como hoje; o e2e do web segue verde sem mudança | eq | integração | — | B-32 | ⬜ |
| S-149 | o aparelho é aprovado pelo navegador: o pedido seguinte do app já passa, sem reiniciar | est | integração | — | B-32 | ⬜ |
| S-150 | o aparelho é revogado no meio da leitura: o pedido seguinte é recusado | est | integração | `DEVICE_REVOKED` | B-32 | ⬜ |
| S-151 | a recusa sai em log `debug` com o `installId` e a rota, nunca com o token | eq | unit | — | B-32 | ⬜ |

## Os dados da árvore — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-18 | o mapper lê `kind` (`file`, `directory`, `symlink`, `other`), `size`, `mtime`, `hidden`, `outside`, `targetKind` e `truncated` | eq | unit | — | B-09 | ⬜ |
| S-19 | `visibleEntries` esconde os `hidden` por padrão e os mostra com a opção ligada, sem mudar a ordem do servidor | eq | unit | — | B-09 | ⬜ |
| S-20 | `403`, `404` e o `403` de pasta fora da allowlist viram `Failure` com o `code` do catálogo | err | unit | `FILE_ACCESS_DENIED`, `FILE_NOT_FOUND`, `WORKSPACE_NOT_ALLOWED` | B-09 | ⬜ |
| S-21 | nome com acento, espaço, emoji e 255 bytes vai e volta intacto na query (`folder` e `path` codificados, nunca no caminho da URL) | fron | integração | — | B-09 | ⬜ |
| S-22 | o `tree` contra o servidor local: Bearer no cabeçalho, nunca na URL; um log `debug` na entrada e na saída, sem conteúdo | eq | integração | — | B-09 | ⬜ |
| S-23 | `/files/limits` é lido uma vez por conexão e reaproveitado | idem | unit | — | B-09 | ⬜ |

## O botão e a barra lateral — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-24 | o botão de arquivos fica escondido enquanto `workspacePath` é nulo, e aparece com o `session.opened` | est | widget | — | B-10 | ⬜ |
| S-25 | o botão abre o `endDrawer` à direita ([D-01](decisions.md#f2--painel-de-arquivos)); deslizar da borda não abre nenhum dos dois painéis | eq | widget | — | B-10 | ⬜ |
| S-26 | abrir o painel de sessões e depois o de arquivos, e vice-versa: cada um mantém o seu estado | conc | widget | — | B-10 | ⬜ |
| S-27 | a barra tem o número de `IconButton`s que a [D-02](decisions.md#f2--painel-de-arquivos) fixar, e o título e o chip continuam legíveis em 360 dp com fonte em 200 % | fron | widget | — | B-10 | ⬜ |
| S-28 | "voltar" com o painel aberto fecha o painel, e só o segundo "voltar" sai da sessão | est | widget | — | B-10 | ⬜ |
| S-29 | o botão tem tooltip e rótulo traduzidos, alvo de 48 dp e passa nos `meetsGuideline` | eq | widget | — | B-10 | ⬜ |

## O painel — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-30 | o painel abre na raiz da pasta, pastas primeiro; tocar numa pasta entra nela e a migalha mostra o caminho | eq | widget | — | B-11 | ⬜ |
| S-31 | tocar num trecho da migalha volta àquele nível; na raiz não há "..", nem trecho acima da pasta | fron | widget | — | B-11 | ⬜ |
| S-32 | ".." sobe um nível | eq | widget | — | B-11 | ⬜ |
| S-33 | pasta vazia mostra o estado vazio | fron | widget | — | B-11 | ⬜ |
| S-34 | carregando, erro com "tentar de novo" e conteúdo — os quatro estados, cada um numa linha | est | widget | — | B-11 | ⬜ |
| S-35 | `truncated: true` mostra a faixa "mostrando os primeiros 5 000 itens" | fron | widget | — | B-11 | ⬜ |
| S-36 | symlink para fora (`outside`) e symlink quebrado (`targetKind: missing`) aparecem marcados, e tocar neles não abre nada e diz por quê | err | widget | — | B-11 | ⬜ |
| S-37 | "mostrar ocultos" no `⋮` liga e desliga os ocultos no nível atual | eq | widget | — | B-11 | ⬜ |
| S-38 | puxar para atualizar recarrega o nível | est | widget | — | B-11 | ⬜ |
| S-39 | fechar e reabrir o painel volta ao mesmo nível e recarrega em segundo plano, sem piscar quando nada mudou | idem | widget | — | B-11 | ⬜ |
| S-40 | a pasta é apagada entre listar e entrar: `404` vira o estado de erro com "voltar à raiz" | err | widget | `FILE_NOT_FOUND` | B-11 | ⬜ |
| S-152 | aparelho pendente: o painel diz "aprove este aparelho no navegador"; revogado: "este aparelho foi revogado" — nenhum dos dois como erro genérico | err | widget | `DEVICE_NOT_REGISTERED`, `DEVICE_REVOKED` | B-11 | ⬜ |
| S-41 | 360×640 e 360×400 com fonte em 200 %: nome longo com reticências, nenhum *overflow*; largura de até 85 % da tela, no máximo 400 dp; `meetsGuideline` de alvo, contraste e rótulo | fron | widget | — | B-11 | ⬜ |

## Ações do item — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-42 | toque longo num arquivo abre a folha com "copiar caminho relativo", que copia o caminho relativo à pasta | eq | widget | — | B-12 | ⬜ |
| S-43 | as ações da folha também são ações de `Semantics` da linha | eq | widget | — | B-12 | ⬜ |

## O painel na `FolderPage` — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-44 | a `FolderPage` mostra o mesmo botão, que abre o mesmo painel, sem sessão aberta ([D-05](decisions.md#f2--painel-de-arquivos)) | eq | widget | — | B-13 | ⬜ |
| S-45 | o estado do painel é por pasta: abrir na `FolderPage` e depois numa sessão da mesma pasta mostra o mesmo nível | idem | widget | — | B-13 | ⬜ |

## A rota e a regra do leitor — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | `viewerFor`: `.md`, `.markdown`, `.mdx` → markdown; `.pdf` → PDF; `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp` → imagem; o resto → texto; extensão sem distinção de caixa | eq | unit | — | B-14 | ⬜ |
| S-47 | `.svg` → texto ([D-08](decisions.md#f3--leitor-de-texto-e-de-imagem)); arquivo sem extensão e `.env` → texto | fron | unit | — | B-14 | ⬜ |
| S-48 | o `Content-Type` confirma: `.pdf` que não vem como `application/pdf` e `.png` que não vem como `image/*` caem em "sem prévia", e o motor nunca recebe os bytes | err | unit | — | B-14 | ⬜ |
| S-49 | `viewerRouteFor(folder, path)` põe os dois na query, e a rota lê de volta o mesmo par, com acento e espaço | eq | unit | — | B-14 | ⬜ |
| S-50 | o mapper do conteúdo lê `encoding`, `eol`, `size`, `largeFile` e o `ETag` | eq | unit | — | B-14 | ⬜ |
| S-51 | abrir o leitor e voltar devolve a sessão com a rolagem e o texto da caixa intactos | est | widget | — | B-14 | ⬜ |
| S-52 | dois toques rápidos no mesmo arquivo empilham uma rota só | idem | widget | — | B-14 | ⬜ |
| S-53 | a barra do leitor mostra o nome, o caminho relativo no subtítulo e o `⋯`; nome longo com reticências em 360 dp com fonte em 200 % | fron | widget | — | B-14 | ⬜ |

## O texto — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-54 | quebra ligada: a linha longa quebra, e o número da linha fica na primeira linha visual da linha lógica | eq | widget | — | B-15 | ⬜ |
| S-55 | quebra desligada: a rolagem é nas duas direções | eq | widget | — | B-15 | ⬜ |
| S-56 | a escolha da quebra vale para todos os arquivos e sobrevive ao reinício do app ([D-17](decisions.md#f3--leitor-de-texto-e-de-imagem)) | idem | unit | — | B-15 | ⬜ |
| S-57 | arquivo de 50 000 linhas: só as linhas perto da vista são construídas | fron | widget | — | B-15 | ⬜ |
| S-58 | uma linha única de 1 MB, com a quebra ligada e desligada, não constrói o texto inteiro de uma vez | fron | widget | — | B-15 | ⬜ |
| S-59 | arquivo de 0 byte abre como texto vazio, com o estado vazio | fron | widget | — | B-15 | ⬜ |
| S-60 | "copiar tudo" no `⋯` copia o conteúdo exato, e a seleção nativa funciona no que está na tela | eq | widget | — | B-15 | ⬜ |
| S-61 | `largeFile` (acima de 1 MB) abre com a faixa do tamanho | fron | widget | — | B-15 | ⬜ |
| S-62 | acima do teto do app ([D-09](decisions.md#f0--spike-dos-motores)) o leitor diz "grande demais para abrir no celular", com o tamanho e **baixar** | fron | widget | — | B-15 | ⬜ |

## A pinça no texto — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-63 | a pinça muda o tamanho da fonte e as linhas se refazem; o tamanho vale enquanto o leitor está aberto, não por arquivo | eq | widget | — | B-16 | ⬜ |
| S-64 | a escala para em 50 % e em 300 % | fron | unit | — | B-16 | ⬜ |
| S-65 | com a quebra desligada, depois da pinça, a rolagem continua nas duas direções | est | widget | — | B-16 | ⬜ |

## A imagem — B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-66 | a imagem chega por `/files/raw` com Bearer e abre no `InteractiveViewer`, com pinça e arrasto | eq | widget | — | B-17 | ⬜ |
| S-67 | bytes que não decodificam mostram o erro com "tentar de novo", sem quebrar a tela | err | widget | — | B-17 | ⬜ |
| S-68 | a imagem do prompt (`image_marker.dart`) continua abrindo em tela cheia, agora pelo widget extraído para `core/widgets` | eq | widget | — | B-17 | ⬜ |

## Erros e recarga — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-69 | `415` de binário mostra "sem prévia" com **baixar** | err | widget | `FILE_NOT_TEXT` | B-18 | ⬜ |
| S-70 | `415` de codificação mostra "codificação não reconhecida" com **baixar** | err | widget | `FILE_NOT_TEXT` | B-18 | ⬜ |
| S-71 | `413` mostra "grande demais", com o tamanho e **baixar** | err | widget | `FILE_TOO_LARGE` | B-18 | ⬜ |
| S-72 | o arquivo foi apagado entre listar e abrir: `404` diz isso e oferece voltar | err | widget | `FILE_NOT_FOUND` | B-18 | ⬜ |
| S-73 | `403` diz que o acesso foi negado | err | widget | `FILE_ACCESS_DENIED` | B-18 | ⬜ |
| S-74 | voltar do fundo ou de outra tela recarrega com `If-None-Match`; `304` não reconstrói nem pisca | idem | widget | — | B-18 | ⬜ |
| S-75 | o `ETag` mudou: o conteúdo é trocado **mantendo a posição**, e a faixa diz "o arquivo mudou" | est | widget | — | B-18 | ⬜ |
| S-76 | "atualizar" no `⋯` faz a mesma recarga | eq | widget | — | B-18 | ⬜ |
| S-77 | o Claude escreve no arquivo enquanto ele é lido: duas recargas seguidas com `ETag`s diferentes, e vale a última a chegar pelo pedido mais novo | conc | unit | — | B-18 | ⬜ |
| S-78 | um pedido de permissão chega com o leitor aberto: a faixa "o Claude está esperando" aparece, e "voltar à sessão" mostra o card ([D-11](decisions.md#f1--normas-e-a-sessão-encoberta)) | est | widget | — | B-18 | ⬜ |
| S-79 | o stream da sessão segue com o leitor aberto: ao voltar, a conversa tem o que chegou nesse meio-tempo | conc | widget | — | B-18 | ⬜ |

## A prévia de markdown — B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-80 | a prévia desenha títulos, listas, código e tabela | eq | widget | — | B-19 | ⬜ |
| S-81 | o alternador troca prévia ↔ fonte; a fonte é o leitor de texto, com a quebra e a pinça | eq | widget | — | B-19 | ⬜ |
| S-82 | HTML embutido (`<script>`, `<img onerror>`, `<a href>`) aparece como texto, e nenhum elemento sai dele | err | widget | — | B-19 | ⬜ |
| S-83 | uma tabela larga rola na horizontal dentro da própria caixa, e a página não | fron | widget | — | B-19 | ⬜ |
| S-84 | a pinça muda o `textScaler` da prévia, de 50 % a 300 % | fron | widget | — | B-19 | ⬜ |
| S-85 | markdown vazio mostra o estado vazio | fron | widget | — | B-19 | ⬜ |

## Links e imagens do markdown — B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-86 | `resolveRelativeLink` resolve `../plans/x.md`, `./a%20b.md` e `x.md#secao` contra o diretório do arquivo atual | eq | unit | — | B-20 | ⬜ |
| S-87 | um link relativo que sai da pasta (`../../..`) não abre e diz por quê, sem perguntar ao servidor | err | unit | — | B-20 | ⬜ |
| S-88 | tocar num link relativo abre o leitor daquele arquivo | eq | widget | — | B-20 | ⬜ |
| S-89 | link `http`, `https` ou `mailto` abre uma confirmação que mostra o endereço; confirmar chama o navegador do sistema, cancelar não | eq | widget | — | B-20 | ⬜ |
| S-90 | `javascript:`, `file:`, `data:`, `intent:` e esquema desconhecido não abrem | err | unit | — | B-20 | ⬜ |
| S-91 | imagem relativa chega por `/files/raw` com Bearer | eq | widget | — | B-20 | ⬜ |
| S-92 | imagem remota **não** é carregada: no lugar fica o texto alternativo com o endereço | err | widget | — | B-20 | ⬜ |
| S-93 | imagem relativa que não existe mostra o texto alternativo | err | widget | — | B-20 | ⬜ |

## O motor de diagramas — B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-94 | a porta `DiagramEngine` devolve a imagem de um código válido, no tema e na largura pedidos | eq | unit | — | B-21 | ⬜ |
| S-95 | sintaxe inválida vira falha com a linha, quando o motor a informa | err | unit | — | B-21 | ⬜ |
| S-96 | código acima do teto (50 000 caracteres) nunca chega ao motor | fron | unit | — | B-21 | ⬜ |
| S-97 | o motor que passa do *timeout* (5 s) vira falha de tempo, e a fila segue | err | unit | — | B-21 | ⬜ |
| S-98 | 30 diagramas num markdown: só os perto da vista são pedidos, um por vez | conc | unit | — | B-21 | ⬜ |
| S-99 | o cache por código, tema e largura: rolar de volta a um diagrama não o redesenha | idem | unit | — | B-21 | ⬜ |
| S-100 | o motor real não faz rede, e uma diretiva `click` ou um `href` no diagrama não navega | err | e2e | — | B-21 | ⬜ |

## O bloco `mermaid` — B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-101 | um bloco `mermaid` válido vira imagem ajustada à largura; na fonte, continua código | eq | widget | — | B-22 | ⬜ |
| S-102 | enquanto desenha, um espaço reservado com rótulo de `Semantics`; depois, a imagem com o rótulo "diagrama" | est | widget | — | B-22 | ⬜ |
| S-103 | sintaxe inválida mostra o código e, acima, "não foi possível desenhar o diagrama", com a linha | err | widget | — | B-22 | ⬜ |
| S-104 | acima do teto, o código com o aviso | fron | widget | — | B-22 | ⬜ |
| S-105 | tocar no diagrama abre a tela cheia com `InteractiveViewer`, redesenhado em resolução maior; voltar devolve a prévia na mesma posição | est | widget | — | B-22 | ⬜ |
| S-106 | trocar o tema do app redesenha os diagramas na tela com o tema do Mermaid correspondente | est | widget | — | B-22 | ⬜ |

## O motor de PDF — B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-107 | os bytes chegam pelo caminho que a [D-22](decisions.md#f5--pdf) fixar, com Bearer no cabeçalho e nunca na URL | eq | integração | — | B-23 | ⬜ |
| S-108 | PDF corrompido mostra o erro com **baixar** | err | widget | — | B-23 | ⬜ |
| S-109 | o adaptador abre o documento com formulários e JavaScript desligados | eq | unit | — | B-23 | ⬜ |

## O leitor de PDF — B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-110 | "página N de M" acompanha a rolagem | eq | widget | — | B-24 | ⬜ |
| S-111 | "ir para a página" aceita 1 e M, e recusa 0, M+1 e texto | fron | widget | — | B-24 | ⬜ |
| S-112 | pinça e duplo toque chegam ao motor | eq | widget | — | B-24 | ⬜ |
| S-113 | link do PDF segue a regra do markdown: `http` com confirmação, `javascript:` recusado | err | widget | — | B-24 | ⬜ |
| S-114 | PDF de uma página e de 500 páginas abrem e rolam | fron | e2e | — | B-24 | ⬜ |

## A senha do PDF — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-115 | PDF com senha pede a senha numa folha; a certa abre | eq | widget | — | B-25 | ⬜ |
| S-116 | senha errada diz isso e pede de novo | err | widget | — | B-25 | ⬜ |
| S-117 | cancelar deixa o estado "protegido por senha", com **baixar** e "digitar a senha" | est | widget | — | B-25 | ⬜ |
| S-118 | a senha não é guardada nem aparece em log | eq | unit | — | B-25 | ⬜ |

## O "salvar como" — B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-119 | o canal entrega o temporário, o nome sugerido e o tipo, e devolve salvo ou cancelado | eq | unit | — | B-26 | ⬜ |
| S-120 | o Android monta o `ACTION_CREATE_DOCUMENT` com o nome e o tipo, e copia o temporário para a URI escolhida | eq | jvm | — | B-26 | ⬜ |
| S-121 | erro do nativo (disco cheio, URI recusada) vira `Failure` traduzida | err | unit | — | B-26 | ⬜ |

## O download — B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-122 | `GET /files/raw?download=true` grava **em stream** num temporário, com progresso, Bearer no cabeçalho | eq | integração | — | B-27 | ⬜ |
| S-123 | cancelar no meio apaga o temporário e não abre o "salvar como" | est | integração | — | B-27 | ⬜ |
| S-124 | a pessoa cancela o "salvar como": o temporário é apagado, e nada é dito como erro | est | unit | — | B-27 | ⬜ |
| S-125 | a rede cai no meio: erro com "tentar de novo", temporário apagado | err | integração | — | B-27 | ⬜ |
| S-126 | o token vence no meio: renova uma vez e retoma com `Range` do que já chegou (R-09) | est | integração | — | B-27 | ⬜ |
| S-127 | arquivo acima do teto de `/files/limits` (200 MB) é recusado antes de começar, com o teto na mensagem | fron | unit | `FILE_TOO_LARGE` | B-27 | ⬜ |
| S-128 | arquivo de 0 byte baixa | fron | integração | — | B-27 | ⬜ |
| S-129 | dois downloads ao mesmo tempo, com progresso e temporário próprios | conc | integração | — | B-27 | ⬜ |
| S-130 | baixar o mesmo arquivo duas vezes gera dois "salvar como", sem um temporário pisar no outro | idem | integração | — | B-27 | ⬜ |

## As entradas do download — B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-131 | **baixar** na barra do leitor e nos estados "sem prévia", "codificação" e "grande demais" | eq | widget | — | B-28 | ⬜ |
| S-132 | **baixar** na folha do toque longo e nas ações de `Semantics` da linha | eq | widget | — | B-28 | ⬜ |
| S-133 | o progresso aparece com "cancelar" e é anunciado ao leitor de tela | est | widget | — | B-28 | ⬜ |
| S-134 | pasta não tem **baixar** ([D-13](decisions.md#f6--download)) | fron | widget | — | B-28 | ⬜ |

## E2E — B-29…B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-135 | a pasta de fixture existe: markdown com tabela larga, os oito tipos de `mermaid` e um inválido, texto longo, PDF ([D-21](decisions.md#f7--e2e)), imagem, binário e um oculto | eq | e2e | — | B-29 | ⬜ |
| S-136 | de dentro de uma sessão: abre o painel, navega por dois níveis, volta pela migalha e abre texto, markdown, PDF, imagem e binário, cada um no leitor certo | eq | e2e | — | B-30 | ⬜ |
| S-137 | no texto, alterna a quebra; no markdown, alterna prévia ↔ fonte e vê os diagramas desenhados pelo motor real, e o inválido com a mensagem | eq | e2e | — | B-30 | ⬜ |
| S-138 | "voltar" do leitor devolve a sessão intacta, com o stream seguindo | conc | e2e | — | B-30 | ⬜ |
| S-139 | um pedido de permissão chega com o leitor aberto: a faixa aparece, e "voltar à sessão" mostra o card (R-01) | est | e2e | — | B-30 | ⬜ |
| S-140 | baixar pelo leitor com o `FileSaver` fake ([D-16](decisions.md#f7--e2e)) sobre o HTTP real: o arquivo chega inteiro, e a trilha tem `file.downloaded` | eq | e2e | — | B-30 | ⬜ |
| S-141 | o painel na `FolderPage`, sem sessão aberta, abre o mesmo arquivo | eq | e2e | — | B-30 | ⬜ |
| S-153 | com o aparelho do e2e ainda pendente, o painel pede a aprovação; o helper aprova pelo navegador, e "atualizar" mostra a árvore — o `azp` do Keycloak de verdade | est | e2e | `DEVICE_NOT_REGISTERED` | B-30 | ⬜ |
| S-142 | `pnpm verify:full` e `pnpm test:e2e:mobile` saem com código 0 | eq | e2e | — | B-31 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la. Por agrupamento, onde falta dimensão:

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Spike (B-01…B-04) | err, est, conc, idem | o spike mede e decide; não deixa código. Os erros dos motores (PDF corrompido, senha, sintaxe, *timeout*) são cenários das fases que os usam |
| Normas (B-05, B-06) | err, est, conc, idem | documento e catálogo não têm estado nem concorrência; o erro de chave órfã ou faltante é o próprio `i18n:check` |
| Somente leitura (B-07) | est, conc, idem, fron | regra estática sobre a árvore: o que existe é passar (eq) ou reprovar o plantado (err) |
| Ações do item (B-12) | err, est, conc, idem, fron | copiar para a área de transferência não falha de modo observável no app; o caminho com acento e emoji é o S-21 |
| `FolderPage` (B-13) | err, est, conc, fron | o widget é o mesmo da sessão, e esses casos estão nos cenários da B-10 e da B-11 |
| Imagem (B-17) | est, conc, idem, fron | o widget é o da imagem do prompt, já provado no plano 22; o que muda é a origem dos bytes |
| Motor de PDF (B-23) | est, conc, idem, fron | as fronteiras de tamanho são do spike (S-01) e do leitor (S-114) |
| Senha do PDF (B-25) | conc, idem, fron | uma senha por vez, numa folha modal; não há fronteira de tamanho que o PDFium não trate |
| "Salvar como" (B-26) | est, conc, idem, fron | o canal é um pedido e uma resposta; o cancelamento e a concorrência são do fluxo (B-27) |
| E2E (B-29…B-31) | err, fron, idem | o erro, a fronteira e a idempotência de cada parte estão provados nos níveis unit e widget; o e2e prova o caminho inteiro pela porta do usuário e os dois cenários que só existem com a pilha real (o motor real e a permissão com o leitor aberto) |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md) quando o erro
  vem do servidor; o erro que nasce no app (link recusado, motor que falhou) não tem `code`, e a
  mensagem é chave do ARB.
