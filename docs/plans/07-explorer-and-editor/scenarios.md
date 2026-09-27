# Plano 07 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Três famílias de cenário pesam mais que as outras, e estão densas de propósito: **fuga de caminho**
(`..`, symlink, a corrida entre checar e abrir), **perda de trabalho** (o humano e o Claude no mesmo
arquivo, o save atômico, o reenvio depois de resposta perdida) e **vazamento de recurso** (watcher
que não é liberado). Códigos marcados **novo** entram no catálogo pela task indicada — B-03 os do
núcleo, B-47 e B-55 os das fases de prévia e de histórico.

---

## Contrato — B-01…B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `workspace.watch`, `workspace.unwatch`, `workspace.watching`, `workspace.filesChanged` e `workspace.watchStopped` existem no schema e nos tipos TS e Dart gerados → `contracts:check` verde | eq | unit | — | B-04 | ⬜ |
| S-02 | `workspace.filesChanged` sem `seq` é recusado pelo validador gerado, como todo `event` | fron | unit | — | B-04 | ⬜ |
| S-03 | `workspace.watch` sem `workspacePath`, ou com tipo errado → `error` com todos os campos em `details[]`, e o socket fica | err | integração | `INVALID_INPUT` | B-04 | ⬜ |
| S-04 | o app Flutter recebe `workspace.filesChanged` e `workspace.watchStopped` e os ignora sem quebrar o stream da sessão aberta | eq | e2e | — | B-05 | ⬜ |
| S-05 | cada código novo tem no `error-catalogue.ts` o status que o doc 04 declara, e chave en/pt-BR (`i18n:check`) | eq | unit | — | B-03 | ⬜ |
| S-06 | `FILE_CHANGED`, `FILE_NOT_TEXT`, `PRECONDITION_REQUIRED` e `STORAGE_FULL` saem como 412, 415, 428 e 507 — nenhum cai no 500 de código não catalogado | fron | unit | — | B-03 | ⬜ |
| S-07 | `WATCH_UNAVAILABLE` leva `params.retryAfterSeconds`, como todo 503 | eq | unit | — | B-03 | ⬜ |
| S-08 | a fronteira `files → workspace` passa só pelo barril, e `files` não importa `session` nem `transcript` — `lint:arch` | eq | unit | — | B-02 | ⬜ |
| S-09 | a ADR-015 diz que leitura humana não vai para a trilha e escrita vai, e o teste do log de escrita (S-61) a cita | eq | unit | — | B-01 | ⬜ |
| S-10 | `/workbench?folder=…&file=…` reproduz a aba de pasta com aquele arquivo ativo; colar o link noutro navegador abre o mesmo | eq | integração | — | B-06 | ⬜ |
| S-11 | `file=` que sobe acima da pasta (`../x`) → a aba abre com a árvore e um erro traduzido no lugar do editor | err | integração | `WORKSPACE_NOT_ALLOWED` | B-06 | ⬜ |
| S-12 | o estado de editor e de árvore é um por aba de pasta: abrir arquivo, expandir nó ou sujar buffer na aba A não aparece na aba B | conc | unit | — | B-06 | ⬜ |
| S-13 | as ações de arquivo registradas pelo plano entram no menu **Arquivo** e na command palette do plano 06 com rótulo traduzido | eq | integração | — | B-06 | ⬜ |

## Caminho e contenção — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-14 | caminho relativo dentro da pasta resolve para o absoluto certo | eq | unit | — | B-07 | ⬜ |
| S-15 | `''` é a própria pasta aberta | fron | unit | — | B-07 | ⬜ |
| S-16 | `..` que escapa (`../outro`, `a/../../x`) → recusado antes de qualquer I/O | err | unit | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-17 | `..` que fica dentro (`a/../b`) é normalizado e aceito | fron | unit | — | B-07 | ⬜ |
| S-18 | `path` absoluto, com NUL ou com `\` → recusado, todos os motivos em `details[]` | err | unit | `INVALID_INPUT` | B-07 | ⬜ |
| S-19 | `folder` fora da allowlist / raiz de outra pessoa | err | integração | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | B-07 | ⬜ |
| S-20 | `folder` numa subpasta e `path` que sobe até a raiz da allowlist (ainda dentro dela) → recusado: a fronteira é a pasta aberta (D-11) | fron | unit | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-21 | symlink cujo alvo fica dentro da pasta é seguido | eq | integração | — | B-07 | ⬜ |
| S-22 | symlink para fora da pasta — mesmo dentro da raiz — não é seguido em leitura nem em escrita | err | integração | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-23 | symlink num diretório intermediário que escapa (`link/arquivo`) | err | integração | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-24 | laço de symlinks (`a → b → a`) → recusado sem pendurar (`reason: symlinkLoop`) | err | integração | `FILE_OPERATION_INVALID` (novo) | B-07 | ⬜ |
| S-25 | diretório intermediário trocado por symlink para fora entre a checagem e a abertura → a verificação no descritor recusa, e nada é lido | conc | integração | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-26 | pasta aberta que saiu da allowlist numa recarga → a próxima operação é recusada | est | integração | `WORKSPACE_NOT_ALLOWED` | B-07 | ⬜ |
| S-27 | pasta aberta apagada do disco | est | integração | `WORKSPACE_NOT_FOUND` | B-07 | ⬜ |

## Árvore — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-28 | lista um nível: nome, kind, tamanho, mtime; diretórios antes, depois nome, sem diferenciar caixa | eq | integração | — | B-08 | ⬜ |
| S-29 | diretório vazio → `entries: []` | fron | integração | — | B-08 | ⬜ |
| S-30 | exatamente o teto → `truncated: false`; teto + 1 → `truncated: true` e só o teto | fron | integração | — | B-08 | ⬜ |
| S-31 | `path` que é arquivo | err | integração | `WORKSPACE_NOT_A_DIRECTORY` | B-08 | ⬜ |
| S-32 | diretório inexistente | err | integração | `FILE_NOT_FOUND` (novo) | B-08 | ⬜ |
| S-33 | diretório que o processo não pode ler | err | integração | `FORBIDDEN` | B-08 | ⬜ |
| S-34 | symlink para fora aparece como `symlink` com `outside: true`; o quebrado, com `targetKind: missing` | eq | integração | — | B-08 | ⬜ |
| S-35 | FIFO, socket e device aparecem como `other` e nunca são abertos | eq | integração | — | B-08 | ⬜ |
| S-36 | entrada apagada entre o `readdir` e o `lstat` é omitida, sem erro | conc | integração | — | B-08 | ⬜ |
| S-37 | nome com unicode e espaço volta intacto; nome que não é UTF-8 válido volta marcado (`unreadableName`) e não é operável | fron | integração | — | B-08 | ⬜ |
| S-38 | o que a D-10 esconde vem marcado `hidden`, não omitido — quem esconde é a web | eq | unit | — | B-08 | ⬜ |
| S-39 | a mesma listagem duas vezes, sem mudança no disco, devolve o mesmo corpo | idem | integração | — | B-08 | ⬜ |

## Leitura — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-40 | texto UTF-8 → conteúdo, `ETag` sha256 entre aspas, `encoding`, `bom`, `eol`, tamanho e mtime | eq | integração | — | B-09 | ⬜ |
| S-41 | arquivo vazio → `content: ''` e o `ETag` do vazio | fron | integração | — | B-09 | ⬜ |
| S-42 | tamanho no teto → 200; teto + 1 byte → recusado com `params.size` e `params.limit` | fron | integração | `FILE_TOO_LARGE` (novo) | B-09 | ⬜ |
| S-43 | entre o limiar de arquivo grande e o teto → 200 com `largeFile: true` | fron | integração | — | B-09 | ⬜ |
| S-44 | NUL nos primeiros 8 KB → recusado (`reason: binary`) | err | integração | `FILE_NOT_TEXT` (novo) | B-09 | ⬜ |
| S-45 | NUL só depois dos primeiros 8 KB não classifica como binário | fron | unit | — | B-09 | ⬜ |
| S-46 | UTF-8 inválido sem encoding pedido → recusado (`reason: encoding`), nunca um palpite | err | integração | `FILE_NOT_TEXT` | B-09 | ⬜ |
| S-47 | UTF-8 com BOM → BOM fora do `content`, `bom: true` | eq | unit | — | B-09 | ⬜ |
| S-48 | UTF-16 LE/BE com BOM → decodificado, `encoding: utf16le`/`utf16be` | eq | unit | — | B-09 | ⬜ |
| S-49 | `encoding=windows-1252` pedido → decodificado com ele (reabrir com encoding) | eq | integração | — | B-09 | ⬜ |
| S-50 | encoding pedido que não existe | err | integração | `INVALID_INPUT` | B-09 | ⬜ |
| S-51 | CRLF, LF e misto reportados em `eol` | eq | unit | — | B-09 | ⬜ |
| S-52 | `If-None-Match` com o `ETag` atual → 304 sem corpo; com outro → 200 | idem | integração | — | B-09 | ⬜ |
| S-53 | duas leituras sem mudança → o mesmo `ETag` | idem | unit | — | B-09 | ⬜ |
| S-54 | leitura durante o rename atômico de outro processo → uma versão inteira (antiga ou nova), e o `ETag` é do que voltou | conc | integração | — | B-09 | ⬜ |
| S-55 | arquivo que cresce além do teto entre abrir e ler → recusado, nunca conteúdo truncado | conc | integração | `FILE_TOO_LARGE` | B-09 | ⬜ |
| S-56 | `GET /files/content` num diretório | err | integração | `FILE_NOT_A_FILE` (novo) | B-09 | ⬜ |
| S-57 | FIFO → recusado sem bloquear a leitura | err | integração | `FILE_NOT_A_FILE` | B-09 | ⬜ |
| S-58 | arquivo que o processo não pode ler | err | integração | `FORBIDDEN` | B-09 | ⬜ |

## HTTP e log — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-59 | sem credencial, em qualquer rota do `files` | err | integração | `UNAUTHENTICATED` | B-10 | ⬜ |
| S-60 | query sem `folder` e com `path` de tipo errado → 400 com os dois campos em `details[]` | err | integração | `INVALID_INPUT` | B-10 | ⬜ |
| S-61 | o log `files.*` em debug carrega pasta, caminho e bytes, **nunca** conteúdo — o teste procura um marcador do conteúdo em todo o log da requisição | eq | integração | — | B-10 | ⬜ |

## Salvar — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-62 | `If-Match` certo → 200, `ETag` novo, disco com o conteúdo | eq | integração | — | B-11 | ⬜ |
| S-63 | sem `If-Match`, ou com `If-Match: *` → disco intocado | err | integração | `PRECONDITION_REQUIRED` (novo) | B-11 | ⬜ |
| S-64 | `If-Match` desatualizado (o Claude escreveu depois da leitura) → 412 com o `ETag` atual no cabeçalho e em `params.currentEtag`; disco com a versão do Claude | err | integração | `FILE_CHANGED` (novo) | B-11 | ⬜ |
| S-65 | `If-Match` fraco (`W/…`) nunca casa | fron | unit | `FILE_CHANGED` | B-11 | ⬜ |
| S-66 | reenvio do mesmo PUT depois de resposta perdida → 200 com o mesmo `ETag`, sem segunda escrita nem segundo fato na trilha | idem | integração | — | B-11 | ⬜ |
| S-67 | dois PUTs com o mesmo `If-Match` ao mesmo tempo → um 200, outro 412; o disco tem exatamente um dos dois conteúdos | conc | integração | `FILE_CHANGED` | B-11 | ⬜ |
| S-68 | arquivo apagado no disco → PUT com `If-Match` recusado, nunca recriado em silêncio | est | integração | `FILE_CHANGED` | B-11 | ⬜ |
| S-69 | disco cheio ao escrever o temporário → original intacto, temporário removido | err | integração | `STORAGE_FULL` (novo) | B-11 | ⬜ |
| S-70 | processo morre entre o temporário e o rename → original intacto; o temporário órfão (prefixo reconhecível) sai na próxima escrita no diretório | est | integração | — | B-11 | ⬜ |
| S-71 | modo do arquivo (ex.: `0755`) preservado | eq | integração | — | B-11 | ⬜ |
| S-72 | CRLF e BOM preservados — o servidor não normaliza fim de linha | eq | integração | — | B-11 | ⬜ |
| S-73 | salvar com `encoding: windows-1252` grava nesse encoding; caractere que ele não representa → recusado, disco intocado | err | integração | `FILE_NOT_ENCODABLE` (novo) | B-11 | ⬜ |
| S-74 | salvar através de symlink interno escreve no alvo e mantém o link | eq | integração | — | B-11 | ⬜ |
| S-75 | hard link (`nlink > 1`) não é quebrado em silêncio (D-05) | fron | integração | — | B-11 | ⬜ |
| S-76 | corpo acima do teto → disco intocado | fron | integração | `FILE_TOO_LARGE` | B-11 | ⬜ |
| S-77 | arquivo somente leitura, ou sistema de arquivos montado só leitura | err | integração | `FORBIDDEN` | B-11 | ⬜ |
| S-78 | alvo trocado por symlink para fora no instante da escrita → recusado, e o temporário não sai do diretório conferido | conc | integração | `WORKSPACE_NOT_ALLOWED` | B-11 | ⬜ |
| S-79 | `.claude/settings.json` sem `confirmSensitive` → recusado (`reason: sensitiveFile`); com ele, grava e o fato leva `sensitive: true` (D-15) | err | integração | `PRECONDITION_REQUIRED` | B-11 | ⬜ |

## Criar — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-80 | arquivo vazio → 201 com `Location` e `ETag` | eq | integração | — | B-12 | ⬜ |
| S-81 | arquivo com conteúdo inicial (modelo, "salvar como") → 201, o `ETag` é o do conteúdo | eq | integração | — | B-12 | ⬜ |
| S-82 | pasta → 201 | eq | integração | — | B-12 | ⬜ |
| S-83 | `a/b/c.ts` cria os pais que faltam | eq | integração | — | B-12 | ⬜ |
| S-84 | o que já existe → o existente fica intocado | err | integração | `FILE_EXISTS` (novo) | B-12 | ⬜ |
| S-85 | dois creates simultâneos do mesmo caminho → um 201, outro 409 | conc | integração | `FILE_EXISTS` | B-12 | ⬜ |
| S-86 | nome vazio, `.`, `..` ou com NUL → todos os campos em `details[]` | err | unit | `INVALID_INPUT` | B-12 | ⬜ |
| S-87 | segmento de 255 bytes aceito; 256 recusado | fron | unit | `INVALID_INPUT` | B-12 | ⬜ |
| S-88 | reenvio depois de resposta perdida → 409 com o `ETag` do existente; a web reconhece como sucesso quando é o `ETag` do que enviou | idem | integração | `FILE_EXISTS` | B-12 | ⬜ |

## Mover e renomear — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-89 | renomear arquivo → 200; o antigo some e o novo tem o mesmo `ETag` | eq | integração | — | B-13 | ⬜ |
| S-90 | mover pasta com conteúdo | eq | integração | — | B-13 | ⬜ |
| S-91 | destino existente → nada sobrescrito (D-12) | err | integração | `FILE_EXISTS` | B-13 | ⬜ |
| S-92 | pasta para dentro de si mesma | err | integração | `FILE_OPERATION_INVALID` | B-13 | ⬜ |
| S-93 | a própria pasta aberta (`path: ''`) como origem | fron | integração | `FILE_OPERATION_INVALID` | B-13 | ⬜ |
| S-94 | destino fora da pasta aberta | err | integração | `WORKSPACE_NOT_ALLOWED` | B-13 | ⬜ |
| S-95 | destino noutro sistema de arquivos (`EXDEV`) → origem intacta (`reason: crossDevice`) | err | integração | `FILE_OPERATION_INVALID` | B-13 | ⬜ |
| S-96 | dois moves para o mesmo destino ao mesmo tempo → um vence, o outro 409, nenhum conteúdo perdido | conc | integração | `FILE_EXISTS` | B-13 | ⬜ |
| S-97 | reenvio depois de sucesso → 404 na origem; a web trata como concluído quando o destino existe | idem | integração | `FILE_NOT_FOUND` | B-13 | ⬜ |
| S-98 | `If-Match` informado e desatualizado | err | integração | `FILE_CHANGED` | B-13 | ⬜ |
| S-99 | renomear só a caixa (`a.ts` → `A.ts`) | fron | integração | — | B-13 | ⬜ |

## Copiar e duplicar — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-100 | copiar arquivo → 201 com o `ETag` do original | eq | integração | — | B-14 | ⬜ |
| S-101 | copiar pasta recursivamente; symlink é copiado como link, nunca seguido para fora | eq | integração | — | B-14 | ⬜ |
| S-102 | destino existente | err | integração | `FILE_EXISTS` | B-14 | ⬜ |
| S-103 | duplicar escolhe `nome copy.ext`, `nome copy 2.ext`… sem colidir | fron | unit | — | B-14 | ⬜ |
| S-104 | pasta acima do teto de cópia (entradas ou bytes) → recusado antes de copiar | fron | integração | `FILE_TOO_LARGE` | B-14 | ⬜ |
| S-105 | cópia que falha no meio → o destino parcial é removido | err | integração | `STORAGE_FULL` | B-14 | ⬜ |
| S-106 | copiar pasta para dentro de si mesma | err | integração | `FILE_OPERATION_INVALID` | B-14 | ⬜ |

## Apagar — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-107 | arquivo → 204 | eq | integração | — | B-15 | ⬜ |
| S-108 | pasta vazia → 204 | fron | integração | — | B-15 | ⬜ |
| S-109 | pasta não vazia sem `recursive` → 409 com `params.entryCount` | err | integração | `DIRECTORY_NOT_EMPTY` (novo) | B-15 | ⬜ |
| S-110 | `recursive` com `expectedEntries`, e a contagem mudou no meio (o Claude criou um arquivo) → nada apagado | conc | integração | `FILE_CHANGED` | B-15 | ⬜ |
| S-111 | contagem acima do teto de contagem → `entryCount` capado e `entryCountCapped: true` | fron | integração | — | B-15 | ⬜ |
| S-112 | o que não existe → 404; a web trata o 404 do próprio reenvio como feito | idem | integração | `FILE_NOT_FOUND` | B-15 | ⬜ |
| S-113 | apagar symlink remove o link; o alvo — mesmo fora da pasta — fica | fron | integração | — | B-15 | ⬜ |
| S-114 | apagamento recursivo não atravessa symlink para diretório | eq | integração | — | B-15 | ⬜ |
| S-115 | a própria pasta aberta | err | integração | `FILE_OPERATION_INVALID` | B-15 | ⬜ |

## Trilha — B-16, B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-116 | criar, escrever, mover, copiar e apagar gravam `file.*` em `audit_events` **antes** do disco, com caminho, tamanho e hashes, sem conteúdo | eq | integração | — | B-16 | ⬜ |
| S-117 | trilha indisponível → 503 com `Retry-After`, e nada no disco | err | integração | `SERVICE_UNAVAILABLE` | B-16 | ⬜ |
| S-118 | o disco falha depois do registro → um `file.failed` aponta o primeiro fato | est | integração | — | B-16 | ⬜ |
| S-119 | a migration nova acrescenta os kinds ao CHECK sem editar a `0013` | eq | integração | — | B-16 | ⬜ |
| S-120 | `GET /audit-events?kind=file.` devolve os fatos do chamador, mais novos primeiro | eq | integração | — | B-17 | ⬜ |
| S-121 | quem não tem fatos recebe página vazia; fatos de outra pessoa nunca voltam | fron | integração | — | B-17 | ⬜ |
| S-122 | cursor malformado, ou `limit` fora dos limites | err | integração | `INVALID_INPUT` | B-17 | ⬜ |
| S-123 | escrita nova entre duas páginas não pula nem duplica fato | conc | integração | — | B-17 | ⬜ |

## Escrita humana × sessão viva — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-124 | o humano salva o arquivo que a sessão viva escreveu → o desfazer daquele turno o preserva (`modifiedOutside`) | est | integração | — | B-18 | ⬜ |
| S-125 | o humano salva enquanto um desfazer devolve o mesmo arquivo → as escritas são serializadas pela trava por caminho; o disco termina com uma inteira, e o `ETag` diz qual | conc | integração | — | B-18 | ⬜ |
| S-126 | o `PostToolUse` publica `session.fileStateRecorded`, e o `files` o recebe sem importar `session` | eq | unit | — | B-18 | ⬜ |
| S-127 | a trava por caminho é liberada também quando a escrita falha | err | unit | `STORAGE_FULL` | B-18 | ⬜ |

## Watcher — B-19, B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-128 | o adapter escolhido cobre este repositório com `node_modules` sem pôr watch em diretório não assistido — contagem medida e registrada na D-08 | fron | integração | — | B-19 | ⬜ |
| S-129 | criar, alterar e apagar → `created`, `changed`, `deleted` | eq | integração | — | B-20 | ⬜ |
| S-130 | rename vira `deleted` + `created` | eq | unit | — | B-20 | ⬜ |
| S-131 | 500 escritas no mesmo arquivo em 100 ms → um `changed` | fron | integração | — | B-20 | ⬜ |
| S-132 | criado e apagado dentro da janela → nada | fron | unit | — | B-20 | ⬜ |
| S-133 | mais mudanças que o teto por evento → `overflow: true` | fron | integração | — | B-20 | ⬜ |
| S-134 | mudança em `.git/` e nos diretórios não assistidos (D-10) não gera evento | eq | integração | — | B-20 | ⬜ |
| S-135 | limite de watches do sistema esgotado → erro explícito, nunca silêncio | err | integração | `WATCH_UNAVAILABLE` (novo) | B-20 | ⬜ |

## Assinaturas — B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-136 | pasta fora da allowlist / de outra pessoa | err | integração | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | B-21 | ⬜ |
| S-137 | duas connections na mesma pasta → um watcher; o unwatch de uma mantém a outra | conc | integração | — | B-21 | ⬜ |
| S-138 | subpasta de pasta já assistida reusa o watcher, e os caminhos chegam relativos à subpasta | eq | integração | — | B-21 | ⬜ |
| S-139 | watch repetido na mesma connection → mesmo `watchId`, e a contagem não sobe | idem | integração | — | B-21 | ⬜ |
| S-140 | unwatch de `watchId` desconhecido → `ack`, sem erro | idem | integração | — | B-21 | ⬜ |
| S-141 | acima do teto de assinaturas por connection (`params.limit`) | fron | integração | `WATCH_LIMIT_REACHED` (novo) | B-21 | ⬜ |
| S-142 | o socket cai sem unwatch → a assinatura sai; a última libera o watcher | est | integração | — | B-21 | ⬜ |
| S-143 | a pasta sai da allowlist na recarga → `watchStopped { reason: allowlistChanged }` e o watcher sai | est | integração | — | B-21 | ⬜ |
| S-144 | a pasta aberta é apagada → `watchStopped { reason: folderDeleted }` | est | integração | — | B-21 | ⬜ |
| S-145 | mil ciclos watch/unwatch → watchers, listeners e memória voltam ao inicial | est | integração | — | B-21 | ⬜ |
| S-146 | shutdown fecha todo watcher antes de sair | est | integração | — | B-21 | ⬜ |
| S-147 | usuário ou device revogado com o socket aberto → a connection fecha e as assinaturas dela saem | est | integração | — | B-21 | ⬜ |

## Origem — B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-148 | caminho e hash casam com um `session.fileStateRecorded` recente → `origin: claude` | eq | unit | — | B-22 | ⬜ |
| S-149 | casam com uma escrita nossa → `origin: user` | eq | unit | — | B-22 | ⬜ |
| S-150 | nada casa → `origin: external`; evento sem `origin` não quebra o cliente | eq | unit | — | B-22 | ⬜ |
| S-151 | o Claude e o humano escrevem o mesmo arquivo na mesma janela → a origem é a do hash final, nunca inventada | conc | unit | — | B-22 | ⬜ |

## Stream — B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-152 | `seq` começa em 1 e cresce por `watchId`, sem relação com o `seq` das sessões | eq | integração | — | B-23 | ⬜ |
| S-153 | duas connections em pastas diferentes → cada uma recebe só a sua | conc | integração | — | B-23 | ⬜ |
| S-154 | reconexão → novo `watch`, novo `watchId` com `seq` do 1, e nada reenviado | est | integração | — | B-23 | ⬜ |
| S-155 | connection lenta que estoura a fila → `overflow` para ela, sem segurar o watcher das outras | conc | integração | — | B-23 | ⬜ |
| S-156 | log `files.watch` em debug com pasta e contagem, nunca conteúdo | eq | integração | — | B-23 | ⬜ |

## Explorer — B-24, B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-157 | a view carrega a raiz com os quatro estados: skeleton, conteúdo, vazio que ensina e erro traduzido com `traceId` e tentar de novo | eq | integração | — | B-24 | ⬜ |
| S-158 | raiz recusada → erro traduzido com caminho de volta às boas-vindas | err | integração | `WORKSPACE_NOT_ALLOWED` | B-24 | ⬜ |
| S-159 | um filho só é pedido ao expandir; expandir de novo usa o cache | idem | integração | — | B-24 | ⬜ |
| S-160 | abas de pasta `/r/app` e `/r/app/pkg`: expandir `src` na primeira não expande na segunda | conc | integração | — | B-24 | ⬜ |
| S-161 | 10 000 entradas visíveis → só a janela renderiza, com `aria-setsize`/`aria-posinset` corretos | fron | integração | — | B-25 | ⬜ |
| S-162 | teclado do padrão ARIA tree: setas, Home/End, type-ahead, Enter abre, → expande, ← recolhe ou vai ao pai | eq | integração | — | B-25 | ⬜ |
| S-163 | `truncated` → aviso traduzido de que há mais entradas | fron | integração | — | B-25 | ⬜ |
| S-164 | pastas de um filho só aparecem compactadas (`a/b/c`), e a preferência desliga | eq | integração | — | B-25 | ⬜ |
| S-165 | ordenar por nome, tipo ou modificação; filtrar por nome dentro da árvore; recolher tudo | eq | integração | — | B-25 | ⬜ |
| S-166 | ocultos escondidos por padrão; o alternador os mostra | eq | integração | — | B-25 | ⬜ |
| S-167 | symlink para fora aparece marcado e não expande | eq | integração | — | B-25 | ⬜ |

## Ações de arquivo — B-26, B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-168 | novo arquivo inline → o nó aparece e abre no editor | eq | integração | — | B-26 | ⬜ |
| S-169 | novo a partir de modelo: escolher o modelo, o nome sugere a extensão, os marcadores (`${fileName}`, `${date}`) são resolvidos, e o arquivo nasce com o conteúdo | eq | integração | — | B-26 | ⬜ |
| S-170 | "novo a partir deste arquivo" usa o arquivo selecionado como modelo | eq | integração | — | B-26 | ⬜ |
| S-171 | renomear com F2; Esc cancela sem requisição; a validação inline recusa nome inválido antes de enviar | est | integração | — | B-26 | ⬜ |
| S-172 | nome que já existe (criar, modelo, renomear) → erro traduzido inline, e o texto digitado fica | err | integração | `FILE_EXISTS` | B-26 | ⬜ |
| S-173 | apagar pasta sem histórico possível → diálogo com a contagem do 409; o destrutivo não recebe o foco inicial; confirmar manda `expectedEntries` | est | integração | — | B-26 | ⬜ |
| S-174 | duplo clique no confirmar envia uma requisição | idem | integração | — | B-26 | ⬜ |
| S-175 | arrastar para mover, e a alternativa por teclado "Mover para…" | eq | integração | — | B-26 | ⬜ |
| S-176 | mover para dentro de si mesmo → erro traduzido | err | integração | `FILE_OPERATION_INVALID` | B-26 | ⬜ |
| S-177 | copiar, recortar, colar e duplicar, com a mesma validação | eq | integração | — | B-26 | ⬜ |
| S-178 | copiar caminho relativo e absoluto; "revelar no explorer" a partir do editor expande até o arquivo e o seleciona | eq | integração | — | B-26 | ⬜ |
| S-179 | "comparar selecionados" com dois arquivos abre a aba de diff | eq | integração | — | B-26 | ⬜ |
| S-180 | toda ação existe no menu de contexto, na command palette e por atalho | eq | integração | — | B-26 | ⬜ |
| S-181 | seleção múltipla com Shift/Ctrl e pelo teclado; apagar N itens pede uma confirmação com a contagem | eq | integração | — | B-27 | ⬜ |
| S-182 | lote em que parte falha → resultado por item: o que foi, o que não foi e por quê | err | integração | `FILE_EXISTS` | B-27 | ⬜ |
| S-183 | mover um lote para dentro de um dos próprios itens → recusado inteiro antes de começar | fron | integração | `FILE_OPERATION_INVALID` | B-27 | ⬜ |
| S-184 | Ctrl+Z no explorer desfaz a última operação de arquivo (renomear, mover, criar, copiar) pela operação inversa | est | integração | — | B-27 | ⬜ |
| S-185 | desfazer um renomear depois de o arquivo mudar → a inversa vai com `If-Match` e é recusada com explicação | err | integração | `FILE_CHANGED` | B-27 | ⬜ |
| S-186 | desfazer duas vezes a mesma operação → a segunda não faz nada | idem | integração | — | B-27 | ⬜ |
| S-187 | a pilha de desfazer é por aba de pasta: Ctrl+Z na aba B não desfaz o que se fez na A | conc | integração | — | B-27 | ⬜ |

## Atualização viva — B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-188 | `created` num diretório expandido → o nó aparece sem recarregar a página | eq | integração | — | B-28 | ⬜ |
| S-189 | `deleted` do nó selecionado → a seleção vai ao vizinho, sem perder o foco | est | integração | — | B-28 | ⬜ |
| S-190 | `overflow` → recarrega os diretórios expandidos | fron | integração | — | B-28 | ⬜ |
| S-191 | reconexão → novo watch e recarga da árvore | est | integração | — | B-28 | ⬜ |
| S-192 | aba de pasta inativa: assinatura suspensa (D-11 do plano 06); ao voltar, recarga, e o que mudou aparece | est | integração | — | B-28 | ⬜ |
| S-193 | mudança numa aba inativa não re-renderiza a ativa | conc | integração | — | B-28 | ⬜ |
| S-194 | watcher indisponível → aviso traduzido e botão de recarregar à mão | err | integração | `WATCH_UNAVAILABLE` | B-28 | ⬜ |
| S-195 | `watchStopped { folderDeleted }` → a aba vai ao estado de erro, sem derrubar as outras | est | integração | — | B-28 | ⬜ |

## Trilha na tela — B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-196 | a Auditoria mostra os fatos `file.*` com caminho, ato, quem e quando — sem conteúdo | eq | integração | — | B-29 | ⬜ |
| S-197 | falha ao carregar os fatos → erro traduzido ali; o resto da trilha continua | err | integração | `SERVICE_UNAVAILABLE` | B-29 | ⬜ |

## Usabilidade e ajuda do Explorer — B-30

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-198 | a ajuda da view abre, em en e pt-BR, e diz o que é a árvore, o que "ocultos" esconde, o que desfazer alcança e o que é definitivo | eq | integração | — | B-30 | ⬜ |
| S-199 | todo controle de ícone tem tooltip e `aria-label` traduzidos | eq | integração | — | B-30 | ⬜ |
| S-200 | pasta vazia ensina o próximo passo (criar arquivo, criar de modelo, arrastar do desktop) | fron | integração | — | B-30 | ⬜ |
| S-201 | os atalhos do explorer estão no registro do plano 06, aparecem na palette com a tecla e funcionam | eq | integração | — | B-30 | ⬜ |
| S-202 | axe sem violação na view, com menu de contexto e diálogo abertos | eq | integração | — | B-30 | ⬜ |
| S-203 | toda string das telas novas vem de chave en/pt-BR — `lint` e `i18n:check` verdes | eq | unit | — | B-30 | ⬜ |

## Editor — B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-204 | o chunk do editor não está no bundle inicial, e nada vem de CDN (teste sobre o build) | eq | integração | — | B-31 | ⬜ |
| S-205 | falha ao carregar o chunk → erro traduzido com tentar de novo; a árvore continua | err | integração | `NETWORK_UNREACHABLE` | B-31 | ⬜ |
| S-206 | abaixo de `md` → modo simplificado, sem scroll horizontal da página, alvos de 44 px | fron | integração | — | B-31 | ⬜ |
| S-207 | o editor segue o tema claro/escuro, inclusive ao trocar com a aba aberta | est | integração | — | B-31 | ⬜ |
| S-208 | o `CodeEditor` falso cumpre o mesmo contrato da porta que o adaptador real: conteúdo, sujo, cursor, desfazer | eq | unit | — | B-31 | ⬜ |

## Abas de editor — B-32

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-209 | clique simples abre em prévia (itálico); outro clique simples substitui; editar ou duplo clique fixa | est | integração | — | B-32 | ⬜ |
| S-210 | aba suja com indicador; fechar pede Salvar / Não salvar / Cancelar, com o descartar sem foco inicial | est | integração | — | B-32 | ⬜ |
| S-211 | aba limpa fecha sem perguntar | eq | integração | — | B-32 | ⬜ |
| S-212 | fechar outras, à direita, salvas e todas; reabrir a última fechada (Ctrl+Shift+T) | eq | integração | — | B-32 | ⬜ |
| S-213 | reordenar por arrastar e por teclado; fixar aba | eq | integração | — | B-32 | ⬜ |
| S-214 | abrir de novo o mesmo arquivo foca a aba existente | idem | integração | — | B-32 | ⬜ |
| S-215 | 50 abas → sem scroll horizontal da página, e a lista de abas alcança todas | fron | integração | — | B-32 | ⬜ |
| S-216 | arquivo ativo na URL; recarregar restaura abas e ativo pelo mecanismo de estado por aba do plano 06 | est | integração | — | B-32 | ⬜ |
| S-217 | `file=` inexistente → placeholder traduzido | err | integração | `FILE_NOT_FOUND` | B-32 | ⬜ |
| S-218 | "Editores abertos" no Explorer lista as abas de todos os grupos, com o sujo à vista | eq | integração | — | B-32 | ⬜ |
| S-219 | "Abrir recente" do menu Arquivo lista os arquivos abertos por último naquela aba de pasta | eq | integração | — | B-32 | ⬜ |
| S-220 | a trilha de caminho acima do editor navega pelos diretórios da pasta aberta | eq | integração | — | B-32 | ⬜ |

## Grupos lado a lado — B-33

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-221 | abrir ao lado cria o segundo grupo; arrastar aba entre grupos | eq | integração | — | B-33 | ⬜ |
| S-222 | o mesmo arquivo em dois grupos compartilha o buffer: editar num suja os dois | conc | integração | — | B-33 | ⬜ |
| S-223 | fechar a última aba de um grupo fecha o grupo | est | integração | — | B-33 | ⬜ |
| S-224 | grupos lado a lado viram um grupo com seletor abaixo de `md` | fron | integração | — | B-33 | ⬜ |

## Salvar e conflito — B-34

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-225 | Ctrl/Cmd+S salva com o `ETag` da leitura; sucesso limpa o sujo e troca o `ETag` | eq | integração | — | B-34 | ⬜ |
| S-226 | Ctrl+S sem mudança não envia nada | idem | integração | — | B-34 | ⬜ |
| S-227 | dois Ctrl+S com o primeiro em voo → um PUT por vez, o segundo com o `ETag` novo | conc | integração | — | B-34 | ⬜ |
| S-228 | 412 → diálogo Comparar (diff disco × buffer) / Sobrescrever (com o `ETag` atual) / Recarregar | err | integração | `FILE_CHANGED` | B-34 | ⬜ |
| S-229 | sobrescrever depois de o disco mudar de novo → novo 412, nunca às cegas | conc | integração | `FILE_CHANGED` | B-34 | ⬜ |
| S-230 | 403, 413 ou 507 ao salvar → o buffer continua sujo, e o erro traduzido diz o que fazer | err | integração | `STORAGE_FULL` | B-34 | ⬜ |
| S-231 | o service nunca envia PUT sem `If-Match` | eq | unit | — | B-34 | ⬜ |
| S-232 | arquivo sensível → segundo passo que diz o que o arquivo faz; cancelar não envia | est | integração | — | B-34 | ⬜ |
| S-233 | salvar como → novo caminho com o conteúdo do buffer; caminho existente oferece substituir (PUT com o `ETag` dele) | eq | integração | — | B-34 | ⬜ |
| S-234 | salvar todos (Ctrl+K S) salva só as abas sujas e relata cada uma | eq | integração | — | B-34 | ⬜ |
| S-235 | reverter arquivo descarta o buffer e relê do disco | est | integração | — | B-34 | ⬜ |
| S-236 | auto-save depois do atraso e ao perder o foco (preferência), respeitando o 412 | est | integração | — | B-34 | ⬜ |
| S-237 | remover espaço no fim da linha e inserir nova linha final, quando ligados, alteram só o que foi salvo | eq | unit | — | B-34 | ⬜ |

## Mudança externa — B-35

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-238 | `origin: claude` em aba limpa → recarrega mantendo cursor e rolagem | est | integração | — | B-35 | ⬜ |
| S-239 | aba suja → aviso não bloqueante Comparar / Recarregar / Manter; nada é perdido | est | integração | — | B-35 | ⬜ |
| S-240 | apagado no disco → aba marcada; salvar oferece recriar (POST), nunca um PUT silencioso | est | integração | — | B-35 | ⬜ |
| S-241 | o eco da nossa própria escrita (`origin: user` com o nosso `ETag`) não dispara aviso | conc | integração | — | B-35 | ⬜ |
| S-242 | sem `origin` → aviso genérico "alterado fora do editor" | eq | integração | — | B-35 | ⬜ |

## Localizar, ir para linha, desfazer — B-36

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-243 | localizar e substituir no arquivo com regex, caixa, palavra inteira e só na seleção | eq | e2e | — | B-36 | ⬜ |
| S-244 | regex inválida no localizar → aviso inline, nada substituído | fron | e2e | — | B-36 | ⬜ |
| S-245 | ir para linha (Ctrl+G) além do fim → vai à última | fron | e2e | — | B-36 | ⬜ |
| S-246 | desfazer e refazer atravessam um save sem perder passos, e a recarga por mudança externa limpa a pilha só da aba recarregada | est | e2e | — | B-36 | ⬜ |

## Status bar do editor — B-37

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-247 | mostra linha/coluna, seleção, indentação, encoding, fim de linha e linguagem da aba ativa | eq | integração | — | B-37 | ⬜ |
| S-248 | converter o fim de linha LF↔CRLF suja a aba, e o save grava o convertido | est | integração | — | B-37 | ⬜ |
| S-249 | "reabrir com encoding" relê com o escolhido; "salvar com encoding" grava nele | eq | integração | — | B-37 | ⬜ |
| S-250 | encoding que não representa o conteúdo → erro traduzido, nada gravado | err | integração | `FILE_NOT_ENCODABLE` | B-37 | ⬜ |
| S-251 | converter indentação (tabs↔espaços) e trocar a linguagem de realce da aba | eq | integração | — | B-37 | ⬜ |

## Placeholders, arquivo grande e diff — B-38

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-252 | binário → placeholder com "abrir em hexadecimal" | err | integração | `FILE_NOT_TEXT` | B-38 | ⬜ |
| S-253 | acima do teto → placeholder com tamanho e teto, e "abrir paginado" | fron | integração | `FILE_TOO_LARGE` | B-38 | ⬜ |
| S-254 | sem permissão → placeholder traduzido | err | integração | `FORBIDDEN` | B-38 | ⬜ |
| S-255 | entre o limiar e o teto abre no modo leve (sem minimap, sem folding, sem realce pesado) e diz isso | fron | integração | — | B-38 | ⬜ |
| S-256 | a aba de diff é somente leitura; "comparar com o salvo" mostra buffer × disco | eq | integração | — | B-38 | ⬜ |

## Preferências do editor — B-39

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-257 | fonte, tamanho da tab, espaços, quebra de linha, zoom, minimap e auto-save (desligado por padrão) vêm da seção Editor das Configurações do plano 06 e valem para todas as abas | eq | integração | — | B-39 | ⬜ |
| S-258 | armazenamento local indisponível → padrões, sem quebrar | fron | integração | — | B-39 | ⬜ |

## Duas abas de pasta e guarda de saída — B-40

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-259 | o mesmo arquivo em `/r/app` e `/r/app/pkg`: salvar numa → a outra, limpa, recarrega | conc | integração | — | B-40 | ⬜ |
| S-260 | as duas sujas → a segunda a salvar recebe o conflito | conc | integração | `FILE_CHANGED` | B-40 | ⬜ |
| S-261 | recarregar a página com buffer sujo → aviso do navegador; nenhum conteúdo vai para o armazenamento local (D-14) | est | integração | — | B-40 | ⬜ |
| S-262 | fechar a aba de pasta com buffers sujos → confirmação que lista os arquivos | est | integração | — | B-40 | ⬜ |
| S-263 | trocar de aba de pasta e voltar preserva abas, grupos, cursor e buffer sujo | est | integração | — | B-40 | ⬜ |

## Usabilidade e ajuda do editor — B-41

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-264 | a ajuda do editor lista os atalhos e explica prévia, sujo, conflito e mudança externa, em en e pt-BR | eq | integração | — | B-41 | ⬜ |
| S-265 | os atalhos do editor estão no registro do plano 06 e aparecem na palette com a tecla | eq | integração | — | B-41 | ⬜ |
| S-266 | a área de editor vazia ensina o próximo passo (abrir da árvore, criar, abrir recente) | fron | integração | — | B-41 | ⬜ |
| S-267 | axe sem violação no editor, nas abas e no diálogo de conflito | eq | integração | — | B-41 | ⬜ |
| S-268 | fechar um diálogo devolve o foco ao editor; mudar de grupo pelo teclado | est | integração | — | B-41 | ⬜ |

## Arrastar para o Claude e adicionar ao contexto — B-42

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-269 | arrastar um arquivo da árvore leva o payload tipado `{ folder, entries: [{ path, kind }] }` e, como alternativa, o texto com o caminho relativo | eq | unit | — | B-42 | ⬜ |
| S-270 | arrastar a seleção múltipla leva todas as entradas, na ordem da árvore | eq | integração | — | B-42 | ⬜ |
| S-271 | arrastar uma pasta leva `kind: directory`, sem expandir o conteúdo | fron | unit | — | B-42 | ⬜ |
| S-272 | arrastar a aba do editor leva o arquivo da aba | eq | integração | — | B-42 | ⬜ |
| S-273 | `scopeDragPayload` para outra aba de pasta: a pasta de destino contém o caminho → reescopado relativo a ela; não contém → recusado (`reason: outsideFolder`) | err | unit | `WORKSPACE_NOT_ALLOWED` | B-42 | ⬜ |
| S-274 | entrada não operável (`unreadableName`, symlink para fora) não entra no payload, e o item diz por quê | fron | unit | — | B-42 | ⬜ |
| S-275 | "Adicionar ao contexto do Claude" no menu da árvore e da aba, e "Adicionar seleção ao chat" no menu da seleção do editor, publicam o mesmo payload — com `range` na seleção | eq | integração | — | B-42 | ⬜ |
| S-276 | sem o painel do Claude registrado (plano 08 ainda não entregue), os itens não aparecem e o arraste só move dentro da árvore | est | integração | — | B-42 | ⬜ |
| S-277 | alternativa por teclado: com a seleção na árvore ou no editor, o atalho de "Adicionar ao contexto" funciona sem mouse e anuncia o resultado por `aria-live` | eq | integração | — | B-42 | ⬜ |
| S-278 | a mesma ação repetida publica o mesmo payload, uma vez por ação — descartar repetido é do consumidor | idem | unit | — | B-42 | ⬜ |
| S-279 | arraste cancelado (Esc, ou soltar fora de um alvo) não publica nada | est | integração | — | B-42 | ⬜ |

## E2E do núcleo — B-43…B-46

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-280 | abrir pasta → árvore → abrir → editar → Ctrl+S → o disco tem o conteúdo | eq | e2e | — | B-43 | ⬜ |
| S-281 | criar de modelo, renomear e apagar → três fatos na Auditoria | eq | e2e | — | B-43 | ⬜ |
| S-282 | apagar pasta pelo diálogo com a contagem | est | e2e | — | B-43 | ⬜ |
| S-283 | o Claude roteirizado escreve no arquivo aberto e limpo → o editor recarrega | est | e2e | — | B-44 | ⬜ |
| S-284 | o Claude roteirizado escreve no arquivo aberto e sujo → salvar dá conflito → comparar → sobrescrever | conc | e2e | `FILE_CHANGED` | B-44 | ⬜ |
| S-285 | depois de sobrescrever, desfazer o turno do Claude preserva a edição humana | est | e2e | — | B-44 | ⬜ |
| S-286 | duas abas de pasta: alternar sem perder estado, fechar uma sem afetar a outra, recarga restaura | est | e2e | — | B-45 | ⬜ |
| S-287 | dois grupos lado a lado com o mesmo arquivo | eq | e2e | — | B-45 | ⬜ |
| S-288 | viewport de celular: modo simplificado, sem scroll horizontal | fron | e2e | — | B-45 | ⬜ |
| S-289 | axe no explorer e no editor | eq | e2e | — | B-45 | ⬜ |
| S-290 | link com `file=../x` → erro traduzido | err | e2e | `WORKSPACE_NOT_ALLOWED` | B-45 | ⬜ |
| S-291 | `pnpm test:e2e:mobile` verde com o contrato novo | eq | e2e | — | B-46 | ⬜ |

## Contrato de prévia e transferência — B-47

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-292 | `RANGE_NOT_SATISFIABLE` (416) no catálogo, com chave en/pt-BR, e as três rotas novas documentadas no `backend/03` | eq | unit | — | B-47 | ⬜ |

## Conteúdo cru e arquivo compactado — B-48

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-293 | `GET /files/raw` inteiro → 200 com `Content-Type` pelo conteúdo, `nosniff` e `Content-Security-Policy: sandbox` | eq | integração | — | B-48 | ⬜ |
| S-294 | `Range` válido → 206 com `Content-Range` | eq | integração | — | B-48 | ⬜ |
| S-295 | `Range` além do fim | err | integração | `RANGE_NOT_SATISFIABLE` (novo) | B-48 | ⬜ |
| S-296 | HTML e SVG nunca saem como documento ativo: tipo fora da lista de prévia vai como `attachment` | eq | integração | — | B-48 | ⬜ |
| S-297 | `GET /files/archive` de uma pasta → zip em stream, sem symlink para fora e sem o que a D-10 esconde | eq | integração | — | B-48 | ⬜ |
| S-298 | pasta acima do teto de entradas ou de bytes → recusado antes do primeiro byte | fron | integração | `FILE_TOO_LARGE` | B-48 | ⬜ |
| S-299 | cliente aborta no meio → o stream para e os descritores fecham | conc | integração | — | B-48 | ⬜ |
| S-300 | baixar grava `file.downloaded` antes do primeiro byte; trilha indisponível → nada sai | err | integração | `SERVICE_UNAVAILABLE` | B-48 | ⬜ |

## Upload — B-49

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-301 | três arquivos → resultado por item, cada criado com `ETag` | eq | integração | — | B-49 | ⬜ |
| S-302 | um dos nomes existe → aquele 409, os outros criados | err | integração | `FILE_EXISTS` | B-49 | ⬜ |
| S-303 | `onConflict: replace` exige o `If-Match` do existente; `keepBoth` gera nome novo | est | integração | — | B-49 | ⬜ |
| S-304 | arquivo acima do teto de upload | fron | integração | `FILE_TOO_LARGE` | B-49 | ⬜ |
| S-305 | conexão cai no meio → nenhum arquivo parcial fica no destino | conc | integração | — | B-49 | ⬜ |
| S-306 | nome enviado com `../` ou `/` → recusado | err | integração | `WORKSPACE_NOT_ALLOWED` | B-49 | ⬜ |
| S-307 | o upload grava `file.created` com `source: upload` antes do disco | eq | integração | — | B-49 | ⬜ |

## Prévias — B-50

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-308 | markdown sanitizado: HTML cru não executa, link para arquivo da pasta abre no editor, imagem relativa carrega | eq | integração | — | B-50 | ⬜ |
| S-309 | imagem e SVG carregados como blob com o Bearer — nenhum token na URL | eq | integração | — | B-50 | ⬜ |
| S-310 | SVG com `<script>` renderizado como imagem: o script não roda | eq | integração | — | B-50 | ⬜ |
| S-311 | PDF renderizado pelo pdf.js servido localmente, paginado | eq | integração | — | B-50 | ⬜ |
| S-312 | prévia ao lado acompanha a edição do markdown sem salvar | est | integração | — | B-50 | ⬜ |
| S-313 | imagem corrompida → placeholder traduzido | fron | integração | — | B-50 | ⬜ |

## Hexadecimal e leitura paginada — B-51

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-314 | binário abre em hexadecimal somente leitura, paginado pelo `Range` | eq | integração | — | B-51 | ⬜ |
| S-315 | arquivo de 0 bytes e última página parcial | fron | integração | — | B-51 | ⬜ |
| S-316 | texto acima do teto abre paginado, somente leitura, e diz por quê | fron | integração | — | B-51 | ⬜ |
| S-317 | o arquivo muda durante a paginação → aviso e recarga (o `ETag` do `raw` mudou) | conc | integração | — | B-51 | ⬜ |

## Transferência na web — B-52

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-318 | arrastar do desktop para uma pasta da árvore envia, com progresso por arquivo | eq | integração | — | B-52 | ⬜ |
| S-319 | conflito → prévia com Substituir / Manter os dois / Pular por arquivo, **antes** de enviar | est | integração | — | B-52 | ⬜ |
| S-320 | baixar arquivo e pasta (zip) sem token na URL | eq | integração | — | B-52 | ⬜ |
| S-321 | download acima do teto do navegador (D-16) → erro traduzido que diz o teto | fron | integração | `FILE_TOO_LARGE` | B-52 | ⬜ |
| S-322 | cancelar o upload no meio | conc | integração | — | B-52 | ⬜ |
| S-356 | enviar uma pasta recria as subpastas e os arquivos no destino, com a mesma estrutura | eq | integração | — | B-49 | ⬜ |
| S-357 | caminho relativo de item de pasta enviada com `..`, absoluto ou NUL é recusado, e nada daquele item chega ao disco | err | integração | `INVALID_INPUT` | B-49 | ⬜ |
| S-358 | pasta enviada acima do teto de itens ou da soma é recusada antes do primeiro byte gravado | fron | integração | `FILE_TOO_LARGE` | B-49 | ⬜ |
| S-359 | baixar a seleção de dois arquivos e uma pasta entrega um zip com os três, e grava `file.downloaded` para cada um antes do primeiro byte | eq | integração | — | B-52 | ⬜ |
| S-360 | "Enviar arquivos aqui…" e "Baixar" existem no menu de contexto e na palette, e funcionam só com teclado | eq | e2e | — | B-52 | ⬜ |

## Usabilidade e ajuda de prévias e transferência — B-53

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-323 | a ajuda diz o que é pré-visualizado, por que HTML não roda e quais são os tetos, em en e pt-BR | eq | integração | — | B-53 | ⬜ |
| S-324 | tooltips, atalhos na palette (abrir prévia, prévia ao lado) e axe sem violação | eq | integração | — | B-53 | ⬜ |

## E2E de prévia e transferência — B-54

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-325 | markdown com imagem relativa em prévia ao lado, editado ao vivo | eq | e2e | — | B-54 | ⬜ |
| S-326 | arrastar arquivo do desktop, e baixar a pasta como zip | eq | e2e | — | B-54 | ⬜ |
| S-327 | binário em hexadecimal | eq | e2e | — | B-54 | ⬜ |

## Contrato do histórico local — B-55

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-328 | `HISTORY_ENTRY_NOT_FOUND` (404) no catálogo, com chave en/pt-BR, e as rotas do histórico documentadas | eq | unit | — | B-55 | ⬜ |

## Store do histórico — B-56

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-329 | salvar guarda a versão **anterior**: metadado na tabela, conteúdo em blob no disco, nunca no Postgres | eq | integração | — | B-56 | ⬜ |
| S-330 | o mesmo conteúdo guardado duas vezes → um blob (endereçado por hash) | idem | integração | — | B-56 | ⬜ |
| S-331 | teto por arquivo: sai a entrada mais antiga; teto total: a purga vai pela mais antiga sem apagar blob que outra entrada usa | fron | integração | — | B-56 | ⬜ |
| S-332 | retenção: o job purga o que passou da janela | est | integração | — | B-56 | ⬜ |
| S-333 | arquivo acima do teto de snapshot não entra, e a entrada diz por quê | fron | integração | — | B-56 | ⬜ |
| S-334 | duas purgas ao mesmo tempo (job e manual) não perdem nem duplicam | conc | integração | — | B-56 | ⬜ |

## Snapshot antes de sobrescrever — B-57

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-335 | apagar, mover por cima, restaurar e upload com substituição guardam o que vai ser perdido, antes | eq | integração | — | B-57 | ⬜ |
| S-336 | o histórico falha no save → o save continua, `warn` no log, e a aba diz "esta versão não entrou no histórico" | est | integração | — | B-57 | ⬜ |
| S-337 | o histórico falha num apagar → o apagar volta a pedir a confirmação definitiva (D-06) | est | integração | — | B-57 | ⬜ |

## Restaurar — B-58

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-338 | restaurar uma versão com o `If-Match` do atual → grava, e o atual vira entrada nova | eq | integração | — | B-58 | ⬜ |
| S-339 | restaurar com o atual mudado | err | integração | `FILE_CHANGED` | B-58 | ⬜ |
| S-340 | restaurar arquivo apagado recria no caminho; caminho já ocupado → recusado | err | integração | `FILE_EXISTS` | B-58 | ⬜ |
| S-341 | entrada inexistente, ou de pasta que o chamador não alcança mais | err | integração | `HISTORY_ENTRY_NOT_FOUND` (novo) | B-58 | ⬜ |
| S-342 | restaurar duas vezes a mesma entrada → a segunda não escreve (o hash já é esse) | idem | integração | — | B-58 | ⬜ |
| S-343 | restaurar grava `file.restored` antes do disco | eq | integração | — | B-58 | ⬜ |
| S-344 | "Desfazer" do aviso de apagar restaura todos os itens do lote | eq | integração | — | B-58 | ⬜ |

## Linha do tempo — B-59

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-345 | a Linha do tempo do arquivo ativo lista versões com motivo, quem e quando, mais novas primeiro, paginada | eq | integração | — | B-59 | ⬜ |
| S-346 | comparar uma versão com o atual abre o diff; restaurar pede confirmação só quando há buffer sujo | est | integração | — | B-59 | ⬜ |
| S-347 | filtro por motivo (salvar, apagar, restaurar, upload) | eq | integração | — | B-59 | ⬜ |
| S-348 | arquivo sem histórico → vazio que explica quando o histórico nasce | fron | integração | — | B-59 | ⬜ |
| S-349 | "apagados recentemente" da pasta alcança o histórico de arquivo que não existe mais | eq | integração | — | B-59 | ⬜ |
| S-350 | versão gravada por outra pessoa da mesma raiz aparece com o autor (D-17) | eq | integração | — | B-59 | ⬜ |

## Usabilidade e ajuda da Linha do tempo — B-60

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-351 | a ajuda diz o que é guardado, o teto, a retenção, e que isto não é git nem o desfazer do Claude, em en e pt-BR | eq | integração | — | B-60 | ⬜ |
| S-352 | axe, teclado e atalhos na palette | eq | integração | — | B-60 | ⬜ |

## E2E do histórico local — B-61

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-353 | salvar três vezes → três versões → comparar → restaurar | eq | e2e | — | B-61 | ⬜ |
| S-354 | apagar arquivo → aviso com Desfazer → o arquivo volta, e a Auditoria mostra os dois fatos | est | e2e | — | B-61 | ⬜ |
| S-355 | restaurar com o arquivo mudado pelo Claude roteirizado → conflito | conc | e2e | `FILE_CHANGED` | B-61 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato (B-01…B-06) | `est`, `idem` | são documentos e schema; o estado e a repetição do que eles descrevem são cenários das tasks que os implementam (B-21, B-23, B-11) |
| HTTP e log (B-10) | `fron`, `est`, `conc`, `idem` | a task só monta as rotas; fronteiras, estados e corridas de cada rota estão em B-07…B-09 |
| Escrita humana × sessão (B-18) | `fron`, `idem` | a fronteira é a de um arquivo e está no save (B-11); a idempotência do desfazer é do plano 04 (S-41 de lá) |
| Watcher (B-19, B-20) | `est`, `idem`, `conc` | o watcher é sem estado próprio além do debounce (coberto em `fron`); ciclo de vida, repetição e corrida entre assinantes são da B-21 |
| Origem (B-22) | `fron`, `err`, `est`, `idem` | é uma função pura de atribuição, sem entrada inválida possível (evento sem casamento vira `external`), e a origem não decide nada — só rotula |
| Stream (B-23) | `fron`, `err`, `idem` | tetos e erros do watch são da B-21; `seq` sem replay não tem repetição a provar |
| Explorer (B-24, B-25) | `est` | expandir/recolher é estado local de UI sem transição que o servidor observe; a transição que importa (reconexão, aba inativa) está na B-28 |
| Trilha na tela (B-29) | `fron`, `est`, `conc`, `idem` | é a leitura de B-17 mostrada; paginação e corrida estão lá |
| Usabilidade e ajuda (B-30, B-41, B-53, B-60) | `err`, `conc`, `idem` | ajuda, tooltip e atalho não têm caminho de erro nem corrida; o que eles acionam tem os seus cenários na task da ação |
| Editor (B-31) | `conc`, `idem` | o carregamento do chunk é único por página (o import dinâmico já deduplica); a concorrência de buffers está em B-33 e B-40 |
| Grupos (B-33) | `err`, `idem` | grupos não chamam o servidor; o erro de salvar num grupo é o da B-34 |
| Mudança externa (B-35) | `fron`, `err`, `idem` | o volume é tratado no `overflow` (B-28) e o erro no save (B-34); o mesmo evento duas vezes já é descartado por `seq` |
| Localizar e ir para linha (B-36) | `err`, `conc`, `idem` | é o comportamento nativo do editor escolhido, provado no e2e porque não roda em jsdom (D-09); não há servidor nem corrida |
| Status bar (B-37) | `fron`, `conc`, `idem` | converter é uma transformação local do buffer; o limite e a corrida do save são da B-34 |
| Placeholders e diff (B-38) | `est`, `conc`, `idem` | são telas de um resultado já recebido |
| Preferências (B-39) | `err`, `est`, `conc`, `idem` | a persistência é a do plano 06 (D-13 de lá) e a falha dela é a `fron` coberta |
| Arrastar para o Claude (B-42) | `conc` | um arraste é um gesto de uma pessoa numa aba; a relação entre abas de pasta é o reescopo (`err`), e a corrida no alvo é do plano 08, dono do chat |
| Duas abas e guarda de saída (B-40) | `fron`, `err`, `idem` | o erro é o 412 da B-34, repetido aqui como corrida entre abas |
| E2E do núcleo (B-43…B-46) | `idem` | a repetição que importa — reenvio de PUT, create, move e delete — é determinística e está em S-66, S-88, S-97 e S-112; pela porta do usuário só acrescentaria minutos |
| Prévias (B-50) | `err`, `conc`, `idem` | a falha de leitura é a do `raw` (B-48) e a da imagem vira placeholder (`fron`); prévia não escreve |
| Hexadecimal (B-51) | `err`, `est`, `idem` | o `416` é da B-48; paginar é leitura pura |
| Transferência na web (B-52) | `err`, `idem` | os erros por item são da B-49 e aparecem pela mesma tela de resultado de lote da B-27 |
| E2E de prévia e de histórico (B-54, B-61) | `fron`, `err`, `idem` | fronteiras e erros estão em integração (B-48, B-49, B-56, B-58), baratos e exatos |
| Contrato de prévia e de histórico (B-47, B-55) | todas menos `eq` | são documento e catálogo; cada rota tem as suas seis dimensões na task que a implementa |
| Snapshot (B-57) | `fron`, `conc`, `idem`, `err` | teto e corrida do store são da B-56; a falha do histórico **não** é erro para o cliente — vira transição de estado (a aba avisa, o apagar volta a confirmar) |
| Linha do tempo (B-59) | `err`, `conc`, `idem` | os erros e a corrida do restaurar estão na B-58 |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md); código
  marcado **novo** entra no catálogo pela task de contrato da fase (B-03, B-47, B-55) antes de
  existir no código.
