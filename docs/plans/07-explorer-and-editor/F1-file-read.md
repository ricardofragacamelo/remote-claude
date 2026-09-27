# F1 — Leitura de arquivos

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md).
**Entrega:** o backend lista a árvore e lê arquivo da pasta aberta — com a contenção conferida a cada
operação no `realpath` e no descritor, teto de tamanho, detecção de binário e de encoding, e `ETag`
forte —, pelas rotas `GET /files/tree` e `GET /files/content`.

## Por quê

Ler vem antes de escrever porque a regra de caminho é a mesma para as duas, e é a parte que mais
importa acertar: toda a F2 herda o `FilePath` desta fase. Um erro aqui é um caminho para ler — e
depois escrever — fora da pasta que o usuário abriu.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-07 — `FilePath`: o caminho dentro da pasta aberta 🔲

Value object em `domain/files/`, puro, com a mesma exigência de cobertura da regra do `workspace`
([backend/03](../../architecture/backend/03-modules.md#workspace)): recebe a pasta (já resolvida pela
porta `FolderResolver`, implementada sobre o `ResolveWorkspaceUseCase`) e um `path` relativo POSIX, e
recusa **antes de qualquer I/O** `..` que escapa, caminho absoluto, NUL e `\`; `''` é a própria
pasta ([D-11](decisions.md#d-11--a-raiz-do-explorer-é-a-pasta-aberta)).

A contenção de verdade é no adapter, **a cada operação**:

1. `realpath` do alvo (ou do pai, para o que ainda não existe) e conferência de que fica **dentro da
   pasta aberta** — symlink só é seguido quando fica ([D-05](decisions.md#d-05--symlinks-e-hard-links));
2. abrir com `O_NOFOLLOW` e, **depois de aberto**, conferir o caminho real do descritor
   (`/proc/self/fd/<fd>`): a troca de um diretório intermediário por symlink entre o passo 1 e o
   `open` é pega aqui (S-25), e nada é lido;
3. laço de symlinks (`ELOOP`) é `422` `FILE_OPERATION_INVALID`, sem pendurar.

Pasta que saiu da allowlist numa recarga, ou que sumiu do disco, é recusada na próxima operação —
não existe cache de "já conferi esta pasta".

### B-08 — A árvore, um nível por vez 🔲

Port `FileTreeReader` em `application/files/ports/` e adapter sobre `fs.opendir` + `lstat` em
`adapter/outbound/filesystem/`. Um nível: nome, `kind` (`file`, `directory`, `symlink` com
`targetKind` e `outside`, `other` para FIFO/socket/device, que nunca é aberto), tamanho, mtime, e
`hidden` para o que a [D-10](decisions.md#d-10--exclusões-padrão-e-teto-da-árvore) esconde — marcado,
não omitido: quem esconde é a web, e o alternador "mostrar ocultos" não pede outra rota. Diretórios
primeiro, depois nome sem diferenciar caixa. Teto de entradas configurado, com `truncated`.

Entrada que some entre o `readdir` e o `lstat` é omitida sem erro — o Claude apaga arquivos o tempo
todo. Nome que não é UTF-8 válido (Linux aceita bytes) volta marcado `unreadableName` e não é
operável: o Node não o devolve de forma que dê para reenviar.

### B-09 — A leitura do conteúdo 🔲

Pela [D-04](decisions.md#d-04--teto-de-tamanho-e-encoding): lê **do mesmo descritor** com limite de
`teto + 1` bytes (nunca `stat` e depois leitura); binário por NUL nos primeiros 8 KB; encoding por BOM
(UTF-8, UTF-16 LE/BE) ou UTF-8 válido, e o `encoding` pedido pelo cliente ("reabrir com encoding", via
`iconv-lite`); UTF-8 inválido sem pedido é `415`, nunca palpite. Devolve `content` (sem BOM), `bom`,
`encoding`, `eol` (`lf`, `crlf`, `mixed`), tamanho, mtime e `largeFile` quando passa do limiar do modo
leve.

`ETag` forte = sha256 **dos bytes lidos**, entre aspas, no cabeçalho e no corpo
([D-03](decisions.md#d-03--a-semântica-de-concorrência)) — o hash é do que voltou, então leitura
durante o rename atômico de outro processo nunca mistura versão e hash. `If-None-Match` com o `ETag`
atual → `304` sem corpo: é o que torna barato revalidar as abas ao reativar uma aba de pasta.

### B-10 — As rotas e o log 🔲

Controller em `adapter/inbound/http/files/`: validação da query com todos os campos inválidos em
`details[]`, Bearer obrigatório, mapeamento pelo filtro de exceção existente. Log de I/O em `debug`
([03-logging](../../architecture/shared/03-logging.md#a-regra-do-io-em-debug)) com `op: files.*`,
pasta, caminho, bytes e `durationMs` — **nunca conteúdo** ([redação](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log)):
o teste de integração escreve um marcador no arquivo e procura por ele em todo o log da requisição
(S-61). Os limites de taxa por rota são os do [plano 05](../05-hardening-operations/README.md), que
este plano não espera.

---

## Cenários cobertos

S-14…S-61.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
