# Módulos de domínio

Um módulo = um domínio. Ele **não** é uma pasta única: é uma fatia vertical que atravessa as
quatro camadas — `domain/<x>/`, `application/<x>/`, `adapter/*/<x>/`,
`infrastructure/modules/<x>.module.ts`. Ver
[02-folder-structure.md](02-folder-structure.md).

Voltar para o [índice do backend](README.md).

---

## O catálogo

| Módulo | Responsabilidade | Não é responsável por |
|---|---|---|
| `auth` | Identidade: validação de token OIDC, usuário local, device | Emitir credencial (quem emite é o provedor) · autorizar tool (é `permission`) |
| `workspace` | Diretórios: allowlist, validação, listagem, metadados de git | Rodar nada dentro deles · ler ou escrever arquivo (é `files`) |
| `files` | Os arquivos da pasta aberta: árvore, conteúdo com `ETag`, e a escrita da pessoa — salvar, criar, mover, copiar, apagar —, na trilha antes do disco | Decidir a fronteira (pergunta ao `workspace`) · a escrita do Claude (é `session`, sob `canUseTool`) |
| `session` | Ciclo de vida da sessão do Claude: start, prompt, interrupt, close, streaming | Persistir transcript histórico |
| `permission` | Requests de permissão, regras persistidas, resolução, timeout | Executar a tool · registrar a trilha (é `audit`) |
| `transcript` | Histórico: listar sessões, carregar mensagens, retomar | Sessão viva |
| `notification` | Push para device quando ninguém está online | Decidir se algo merece notificação (quem decide é `permission`) |
| `diag` | O ping de ponta a ponta (`diag.ping`) e as versões da instalação para a tela "Sobre" | Saúde para o balanceador (é `GET /health`, sem autenticação) |
| `audit` | Trilha imutável de **toda** invocação de tool, via hook `PreToolUse`, e dos fatos de conta do mesmo peso (registro, aprovação e revogação de device) | Autorizar |

### Por que `permission` é módulo separado de `session`

Tentador juntar — a permissão nasce dentro de uma sessão. Mas:

- O ciclo de vida é diferente: uma **regra** de permissão sobrevive à sessão, e vale para
  todas as sessões futuras daquele projeto.
- A resolução vem de **outro canal** (push no celular), não do canal da sessão.
- É a fronteira de segurança do sistema. Fronteira de segurança misturada com orquestração
  é onde bug de segurança nasce.

### Por que `audit` é separado

Auditoria precisa ser **append-only e independente**. Se morasse dentro de `session`, um bug
na sessão poderia impedir o registro do que foi autorizado. Dado que o sistema executa
comando arbitrário na máquina do usuário, a trilha precisa sobreviver à falha do resto.

---

## Fronteiras — quem pode falar com quem

```
   auth ◄──────────── (todos consultam identidade)
     │
     ▼
 workspace ◄──── session ────► permission ────► notification
     ▲              │              │
     │              ▼              ▼
   files        transcript       audit ◄──── (todos escrevem)
     ▲                                ▲
     └─ session.fileStateRecorded     └──── files escreve
        workspace.allowlistReloaded
        (barramento, sem import)
```

`files` **não tem seta para `session`** nem para `transcript` — a regra `files-never-reaches-session`
do `dependency-cruiser` a recusa: o que o Claude escreveu chega pelo barramento interno, e a trava
por caminho que os dois usam vem da plataforma por porta (`PATH_LOCK`).

Regras:

1. **Comunicação entre módulos é por porta**, declarada em `application/<consumidor>/ports/`,
   implementada por um adapter que chama o módulo dono.
2. **Nunca importe o interior de outro módulo.** Só o barril: `@domain/x` ou `@application/x`.
3. **Sem ciclo.** Se A precisa de B e B precisa de A, ou falta um módulo, ou são um só.
4. `audit` é **write-only** para os outros: todo mundo escreve, ninguém lê de dentro do fluxo.

### Comunicação assíncrona

Quando A precisa reagir a um fato de B sem acoplar, use evento de domínio interno
(`EventEmitter2` do Nest), não chamada direta:

```
permission.resolved  ──► audit grava
                     ──► notification cancela push pendente
                     ──► session destrava o loop do Agent SDK
```

Evento de domínio é `<módulo>.<fato no passado>`, igual ao evento WS. Ver
[nomenclatura](../shared/01-language-and-naming.md).

---

## Detalhe de cada módulo

### `auth`

O backend é **Resource Server** OIDC: valida token, nunca emite. Não existe senha aqui.

- **Entidades:** `User` (ancorado no `sub` do provedor), `Device`
- **Regras:**
  - identidade local é provisionada just-in-time no primeiro login, a partir das claims
  - **`sub` é a chave**, nunca o e-mail — e-mail muda e pode ser reusado
  - `email_verified: false` não entra
  - device precisa de **aprovação explícita** antes do primeiro uso; token prova *quem*,
    registro de device prova *de onde*
  - revogar device fecha as connections WS dele **na hora** e invalida seus refresh tokens
  - autorização é **nossa**, local — não usamos role vinda do provedor
- **Erros:** `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `DEVICE_NOT_REGISTERED`, `DEVICE_REVOKED`,
  `INSUFFICIENT_SCOPE`
- **Nota:** `Device.locale` é o que decide o idioma do push. Ver [i18n](../shared/02-i18n.md).
- **O adapter do provedor** (discovery, cache de JWKS, validação) mora em
  `adapter/outbound/identity/`. É o único lugar do backend que conhece OIDC — e nem ele
  conhece "Auth0". Ver [autenticação](../shared/08-authentication.md).

### `workspace`

- **Entidades:** `Workspace`, `WorkspacePath` (VO)
- **Regras:** **allowlist de raízes permitidas** — o caminho é normalizado e precisa estar
  dentro de uma raiz configurada. Bloqueia `..`, symlink que escapa, e caminho relativo.
  - A allowlist vem de **arquivo de configuração**, não de variável de ambiente nem de tabela
    administrável pela UI: mudá-la exige acesso ao disco da máquina, e a lista fica legível e
    comentável quando crescer. Arquivo ausente, ilegível ou fora do schema **derruba o boot**, e
    a recarga é **explícita** — nunca um watch silencioso, porque allowlist que encolhe debaixo
    de uma sessão aberta move a fronteira de segurança sem ninguém decidir isso.
  - **Cada raiz declara quem a usa** (o `sub` do OIDC). Com multiusuário, allowlist global
    significaria que qualquer pessoa autenticada alcança toda raiz — o escopo existiria na
    trilha e na permissão, mas não no acesso, que é onde importa.
  - Raiz que **existe e não é do usuário** responde `FORBIDDEN` (403): o requisitante é quem diz
    ser, e ainda assim não pode. `404` fica para o caminho que **não existe**
    ([01 · D-17](../../plans/01-live-session/decisions.md#d-17--usar-o-código-http-que-cada-coisa-é)).
- **O seletor "Abrir pasta" navega só dentro das raízes**
  ([06 · D-03](../../plans/06-workbench/decisions.md#d-03--alcance-do-seletor-dentro-das-raízes-ou-a-máquina-inteira),
  decisão do usuário de 2026-09-26). Liberar "a máquina toda" é declarar o `$HOME` como raiz no
  arquivo — nunca um seletor que sobe acima dela.
- **Listar subpastas é ler o disco — e só nestes termos.** `GET /workspaces` lê a allowlist e não
  toca o disco; `resolve` toca um caminho só. A listagem do seletor
  ([ADR-014](../shared/00-decisions.md#adr-014--o-web-vira-um-workbench-construído-em-react)) é a
  primeira rota que lê um diretório, e a regra "não varre disco" passa a valer **com esta exceção,
  e só com ela**:
  - **um nível**, **sob demanda** — um pedido, um diretório. Nunca recursivo, nunca a árvore;
  - **só diretórios** — arquivo, socket, fifo e dispositivo ficam fora;
  - **dentro da allowlist**, na mesma ordem do `ResolveWorkspaceUseCase`: regra pura → existência →
    contenção **de novo no realpath** → é diretório → lista. A allowlist é lida a cada uso;
  - **symlink** para diretório dentro da **mesma raiz** é listado e marcado; para fora, quebrado ou em
    ciclo é **omitido** — marcar o que escapa já diria o que existe fora da fronteira
    ([06 · D-04](../../plans/06-workbench/decisions.md#d-04--ocultas-pastas-pesadas-e-symlinks-no-seletor));
  - **ocultas** (nome começado por `.`) só com `hidden=true`; nenhuma lista mágica de pastas
    "pesadas" — o teto é o que protege o custo;
  - **teto de 1000 entradas** por pedido, com `truncated` e o filtro `prefix=` para alcançar o que
    o teto cortou ([06 · D-05](../../plans/06-workbench/decisions.md#d-05--teto-de-entradas-por-listagem));
    o adapter **para de ler em teto + 1**, e o custo não cresce com o tamanho do diretório;
  - o log de I/O diz caminho, contagem, `truncated` e duração — **nunca** os nomes listados.
- **Raízes locais de desenvolvimento.** O default versionado (`infra/workspace-allowlist.yaml`)
  continua **sem caminho da máquina de ninguém** — só a raiz de rascunho. Liberar uma pasta de
  verdade é `pnpm allowlist add <caminho>`, que escreve numa cópia **ignorada pelo git**
  (`infra/workspace-allowlist.local.yaml`), validada **pelo mesmo schema** do boot (que passa a morar
  em `packages/config`), recusando `/` e pedindo confirmação para o `$HOME`. O `pnpm dev` usa a
  cópia quando ela existe e `RC_WORKSPACE_ALLOWLIST_FILE` não foi definido à mão; e2e e teste nunca
  a leem ([06 · D-09](../../plans/06-workbench/decisions.md#d-09--onde-mora-a-cópia-local-da-allowlist-e-como-o-boot-a-escolhe)).
  A recarga explícita ganha o gatilho que faltava: **`SIGHUP` chama `reload()`**, sem reiniciar o
  processo e sem watch do arquivo; recarga que falha mantém a lista anterior
  ([06 · D-15](../../plans/06-workbench/decisions.md#d-15--como-o-backend-em-execução-recebe-a-allowlist-nova)).
  O handler (`AllowlistReloadSignal`) vive na infraestrutura e loga em `info` o arquivo e as raízes
  que entraram e saíram; o `enableShutdownHooks` do Nest **não** escuta `SIGHUP` (`SHUTDOWN_SIGNALS`
  em `bootstrap.ts`), ou o sinal fecharia a aplicação. O boot loga qual arquivo carregou
  (`allowlist.loaded`). O `pnpm allowlist` acha o processo pelo pid que o **próprio app** grava em
  `RC_PID_FILE` — sob o `pnpm dev` o backend roda debaixo de um watcher, e o pid que o script
  disparou é o do watcher ([06 · D-20](../../plans/06-workbench/decisions.md#d-20--como-o-pnpm-allowlist-acha-o-processo-do-app)).
- **Pastas recentes e pastas abertas** são uma tabela **por pasta** (não por raiz — a `workspaces`
  não muda): `user_id`, `path` real, `root_path`, `last_opened_at`, `pinned` e `tab_position`, nula
  quando a aba está fechada ([06 · D-14](../../plans/06-workbench/decisions.md#d-14--onde-gravar-recentes-e-pastas-abertas)).
  O conjunto e a ordem das abas seguem o usuário, no servidor
  ([06 · D-10](../../plans/06-workbench/decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)).
  Fechar uma pasta **não** encerra sessão: este módulo nem a conhece. O teto de abas é **8**
  (`OPEN_FOLDERS_LIMIT`) e o de recentes **não fixados** é **20** (`RECENT_FOLDERS_LIMIT`), podados
  ao abrir; fixada e aberta nunca saem pelo teto
  ([06 · D-21](../../plans/06-workbench/decisions.md#d-21--o-teto-de-recentes-e-o-recente-de-uma-aba-aberta)).
  Tirar dos recentes uma pasta com a aba aberta mantém a aba e a tira da lista; fechar a aba de uma
  pasta que já saiu da lista a esquece de vez.
- **Uma subpasta aberta é uma fronteira mais estreita que a raiz.** Aberta numa aba, ela é o limite
  de tudo o que o `files` lê e escreve ali: um caminho que sobe acima dela é recusado com `403`,
  mesmo que caia dentro da mesma raiz da allowlist ([07 · D-11](../../plans/07-explorer-and-editor/decisions.md#d-11--a-raiz-do-explorer-é-a-pasta-aberta)).
  O `workspace` resolve a pasta; quem aplica a fronteira mais estreita é o `files`.
- **Erros:** `WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`,
  `WORKSPACE_DIRECTORY_UNREADABLE`, `OPEN_FOLDERS_LIMIT_REACHED`, `FORBIDDEN`, `CONFLICT`
- **Nota:** esta é a primeira linha de defesa do sistema. A regra é pura, sem I/O, e tem
  cobertura mínima de 90 %. Ver [01-clean-architecture.md](01-clean-architecture.md).

#### As rotas HTTP do `workspace`

O contrato, espelhado nos DTOs Zod do controller (`adapter/inbound/http/workspace/workspace.dto.ts`)
e nos tipos do web (`features/workspace/types/`). Todo caminho viaja como **search ou corpo, nunca
como segmento de path** — um proxy que normaliza `%2F` mudaria o valor que a allowlist vai checar —
e é recusado com `400` `INVALID_INPUT` **antes** do caso de uso quando ausente, vazio, relativo, com
NUL ou com um segmento `..`: o seletor sobe pelo `parent` que a listagem devolve, nunca editando o
caminho.

| Rota | Resposta | Recusas |
|---|---|---|
| `GET /workspaces` | `{ workspaces[{ path, label, lastUsedAt }] }` — as raízes do chamador | `401` |
| `GET /workspaces/resolve?path=` | `{ path, root }` | `400`, `401`, `403` `WORKSPACE_NOT_ALLOWED`/`FORBIDDEN`, `404` `WORKSPACE_NOT_FOUND`, `422` `WORKSPACE_NOT_A_DIRECTORY` |
| `GET /workspaces/directories?path=&hidden=&prefix=` | `{ path, root, parent, entries[{ name, path, hidden, symlink }], truncated }` — `parent` é `null` na raiz; `entries[].path` é o caminho **listado** (do link, num symlink); `hidden` é `true`/`false` literal, e `prefix` é um nome, nunca um caminho | as de `resolve`, mais `422` `WORKSPACE_DIRECTORY_UNREADABLE` |
| `GET /workspaces/recent` | `{ folders[{ path, rootLabel, lastOpenedAt, pinned, available }] }` — fixadas primeiro, depois por `lastOpenedAt` desc; `available: false` para a que saiu da allowlist ou sumiu, **em vez de sumir** da lista; `rootLabel` é `null` quando ela não vive mais sob raiz nenhuma do usuário, como na aba | `401` |
| `PUT /workspaces/recent/pin` `{ path, pinned }` | `204`; fixar o que já está fixado não muda nada | `400`, `401` |
| `DELETE /workspaces/recent?path=` | `204`, **também** quando não existia | `400`, `401` |
| `GET /workspaces/open-folders` | `{ folders[{ path, rootLabel, state }] }`, em ordem; `state` é `available`, `notAllowed` ou `missing`, revalidado na leitura | `401` |
| `POST /workspaces/open-folders` `{ path }` | `201` com a aba ao abrir; `200` com a existente se já aberta — idempotente. Abrir **grava o recente** | as de `resolve` (e então **nada** é gravado), `409` `OPEN_FOLDERS_LIMIT_REACHED` (`params.limit`) |
| `DELETE /workspaces/open-folders?path=` | `204`, também quando não estava aberta | `400`, `401` |
| `PUT /workspaces/open-folders/order` `{ paths }` | `204` | `400`, `401`, `409` `CONFLICT` se o conjunto não é o aberto |

`WORKSPACE_DIRECTORY_UNREADABLE` é `422` e não `403`: a autorização do usuário passou, e é o sistema
de arquivos que torna o pedido impossível. `OPEN_FOLDERS_LIMIT_REACHED` é `409`: conflito com o
estado atual, que fechar uma aba resolve. Os endpoints novos entram sob os limites HTTP do
[plano 05](../../plans/05-hardening-operations/README.md) quando ele os estender ao HTTP.

### `files`

O explorer e o editor do [plano 07](../../plans/07-explorer-and-editor/README.md), e o ator novo que
eles trazem: **a pessoa escrevendo no disco pela web** ([ADR-015](../shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web)).
Módulo próprio, e não extensão do `workspace`: conteúdo, versão, escrita atômica, criar, remover e
observar são linguagem e invariantes próprias, e a primeira linha de defesa continua pequena e pura
([07 · D-01](../../plans/07-explorer-and-editor/decisions.md#d-01--módulo-novo-ou-extensão-do-workspace)).

- **Valor:** `FilePath` — a pasta aberta (já resolvida pelo `workspace`) e um caminho relativo
  POSIX; `''` é a própria pasta. Recusa **antes de qualquer I/O** caminho absoluto, NUL e `\`
  (`400`, todos os motivos em `details[]`) e `..` que escapa (`403`). `Etag` — sha256 dos bytes,
  forte; `If-Match` compara forte (`W/…` nunca casa), `If-None-Match` compara fraco.
- **A fronteira no disco, a cada operação:** a pasta passa pelo `ResolveWorkspaceUseCase` a cada
  pedido (porta `FolderResolver`), nunca em cache; o `realpath` do que se toca — ou da pasta
  existente mais próxima, para o que ainda não existe — precisa ficar dentro da pasta aberta; o que
  se abre é aberto com `O_NOFOLLOW` e conferido **no descritor** (`/proc/self/fd/<fd>`), o que pega a
  troca de um diretório intermediário por symlink entre checar e abrir. Symlink só é seguido quando
  o alvo fica dentro; laço é `422` `symlinkLoop`. A conferência no descritor é Linux-only; sem `/proc`
  resta a do `realpath` (gap do [plano 19](../../plans/19-distribution/README.md)).
- **Leitura:** do **mesmo descritor**, até o teto mais um byte — nunca `stat` e depois leitura;
  binário por NUL nos primeiros 8 KB; encoding só pelo que é certo (BOM, UTF-8 válido) ou pelo que o
  cliente pede ("reabrir com encoding"), nunca um palpite; FIFO aberto com `O_NONBLOCK` e recusado.
- **Escrita atômica:** temporário `.<nome>.rc-<ulid>.tmp` no **mesmo diretório** do alvo real,
  `fsync`, modo do original preservado, descritor do temporário conferido, versão conferida de novo
  logo antes do `rename`. Temporário órfão sai na próxima escrita naquele diretório. Arquivo com
  hard link (`nlink > 1`) é escrito **no lugar**, de uma cópia ao lado, para não quebrar o link em
  silêncio. O servidor não normaliza fim de linha.
- **Mover sem sobrescrever:** arquivo por `link` + `unlink` (o `link` falha se o nome existe,
  atomicamente); pasta por conferência + `rename` sob a trava dos dois caminhos; `EXDEV` é `422`
  `crossDevice`, nunca cópia + remoção implícita ([07 · D-12](../../plans/07-explorer-and-editor/decisions.md#d-12--mover-sem-sobrescrever)).
- **A trilha antes do disco** (`FileTrail`): `file.created`, `file.written`, `file.moved`,
  `file.copied`, `file.deleted` em `audit_events`, com caminho real (sujeito) e relativo (rótulo),
  tamanhos, hashes, origem e destino, contagem, `sensitive` — nunca conteúdo. Trilha fora → `503`
  com `Retry-After` e nada no disco; disco que recusa depois → `file.failed` apontando o fato.
  Leitura fica fora da trilha e dentro do log.
- **A trava por caminho real** (`PathLock`, da plataforma): o salvar, o criar, o mover, o copiar e o
  apagar da pessoa e a restauração do desfazer de uma sessão escrevem sob ela, e se serializam.
- **A origem `claude`:** o hook `PostToolUse` publica `session.fileStateRecorded { path, hash, at }`
  no barramento, e o `files` guarda as escritas recentes (`ClaudeWrites`) para o watcher rotular a
  mudança — sem importar `session`.
- **A pasta assistida** ([07 · F3](../../plans/07-explorer-and-editor/F3-file-watch.md)): porta
  `FolderWatcher`, adapter sobre `chokidar` ([07 · D-08](../../plans/07-explorer-and-editor/decisions.md#d-08--a-implementação-do-watcher),
  escolhido pela medida). `.git` e os não assistidos da D-10 (`UNWATCHED_PATHS`, constante do
  domínio) ficam de fora **antes** de gastar watch, e os arquivos laterais do save atômico não são
  mudança. O limite do sistema é dito: na subida, `WATCH_UNAVAILABLE` com `retryAfterSeconds` e nada
  retido; depois dela, `workspace.watchStopped { reason: systemLimit }`.
  - **`FolderWatches`** (o registro): **um watcher por `realpath`** com contagem de assinaturas; uma
    subpasta de pasta já assistida pega carona no watcher dela, com os caminhos relativos a si — a
    não ser que esteja sob um não assistido da mãe (`node_modules/x` aberto como aba), que ganha o
    seu. Autoriza pelo `FolderResolver`; teto por connection (`WATCH_LIMIT_REACHED`); `watch`
    repetido na mesma connection devolve o mesmo `watchId`; `unwatch` desconhecido é `ack`.
  - **Liberar é por toda saída**, na mesma rotina que fecha o watcher com a última assinatura:
    `unwatch`; a connection que sai do `ConnectionRegistry` por qualquer motivo — queda, heartbeat,
    revogação do device (`4401`), envio que falhou (`onRemoved`, ouvido por `ConnectionWatchRelease`,
    sem ramo no gateway); o shutdown (`GracefulShutdown`, junto dos sockets); a recarga da allowlist
    (`workspace.allowlistReloaded` no barramento → `revalidate()` pelo `FolderResolver` →
    `allowlistChanged`); a pasta apagada (`folderDeleted`). `openWatchers` é a contagem que a tela de
    saúde do [plano 18](../../plans/18-logs-and-diagnostics/README.md) lê.
  - **A janela** (`RC_FILES_WATCH_WINDOW_MS`): as mudanças cruas se dobram no domínio
    (`foldInto`) — rajada num arquivo é um `changed`, criado e apagado é nada, apagado e recriado é
    `changed`, rename é `deleted` + `created` — e saem por assinatura, cortadas no teto por evento
    (`RC_FILES_WATCH_MAX_CHANGES`, `overflow: true`). Uma janela entrega depois da anterior.
  - **Quem mudou** (`ChangeOrigins`, regra pura `originOf`): o caminho casa com uma marca recente de
    `ClaudeWrites` ou de `UserWrites` — alimentada pelos use cases de escrita da pessoa depois do
    disco (salvar, criar, mover, copiar, apagar, com o que cada um deixou) — e vale o **hash final**,
    lido só quando há marca com conteúdo para comparar; nada casa → `external`. Rótulo, nunca decisão.
- **Exporta** o `SaveFileUseCase` — o substituir em lote do [plano 11](../../plans/11-search/README.md)
  e a edição de `CLAUDE.md` do [plano 13](../../plans/13-claude-settings/README.md) escrevem por ele,
  e herdam `ETag`, trilha e atomicidade — e o `FolderWatches`, que o gateway (`workspace.watch` e
  `workspace.unwatch`, em `adapter/inbound/ws/files/`) e o shutdown usam.
- **Tetos configurados** (`RC_FILES_*`): entradas por nível da árvore (5 000), limiar do modo leve
  (1 MB), teto de edição (10 MB), entradas e bytes de uma cópia, e até onde a contagem de um apagar
  vai; do watcher, a janela (200 ms), mudanças por evento (500), pastas por connection (16) e quantos
  bytes um socket acumula antes de as mudanças virarem um `overflow` devido (1 MB). O corpo das rotas `/files` tem parser próprio, com o dobro do teto de edição — o resto da API
  continua no limite global. O `multipart` do upload não passa por parser nenhum: é lido em stream.
- **Prévia e transferência** ([07 · F7](../../plans/07-explorer-and-editor/F7-previews-and-transfer.md),
  [D-16](../../plans/07-explorer-and-editor/decisions.md#d-16--download-sem-token-na-url-e-os-tetos),
  [D-18](../../plans/07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)):
  - **`raw`** passa pela mesma contenção da leitura (realpath + descritor). O `ETag` é o mesmo sha256
    do `content`, do que o descritor tem — guardado num cache em memória pela identidade do arquivo
    (`dev`, `ino`, tamanho, `mtime` e `ctime` em nanossegundos), para a paginação não reler o
    arquivo inteiro a cada página — limitado (o menos usado sai primeiro), e sem guardar o hash de
    um arquivo cujo `ctime` tem menos de 2 s, porque duas escritas no mesmo tique do relógio do
    sistema de arquivos deixam a mesma identidade com bytes diferentes (o "racy git"). O `Content-Type` vem **do conteúdo**, nunca da extensão: assinatura
    dos primeiros bytes (PNG, JPEG, GIF, WebP, BMP, ICO, PDF), `<svg` num texto, texto UTF-8 sem NUL
    → `text/plain; charset=utf-8`, o resto `application/octet-stream` — **nunca** `text/html`.
    `X-Content-Type-Options: nosniff` e `Content-Security-Policy: sandbox` **sempre**;
    `Content-Disposition: inline` só para a lista de prévia (imagem raster, SVG, PDF, texto), e
    `attachment` para o resto e para todo `download=true`. Um intervalo em `Range` → `206`; mais de
    um é ignorado (RFC 9110 permite) e vale o corpo inteiro; o que começa depois do fim → `416` com
    `Content-Range: bytes */<tamanho>`; `If-Match` que não casa → `412` — é como a paginação percebe
    o arquivo mudando entre páginas. Corpo sem `Range`, ou intervalo, acima do teto de download →
    `413`. Prévia e página são **leitura**: fora da trilha, no log. `download=true` é **baixar**:
    `file.downloaded` antes do primeiro byte (`details`: bytes, hash, o intervalo, `archive: false`),
    e trilha fora → `503`, nada sai.
  - **`archive`** é um zip em stream de um ou mais `path` (a seleção), com os nomes relativos à pasta
    comum mais funda deles. O percurso nunca segue link para pasta, deixa de fora link para fora da
    pasta ou quebrado, FIFO, socket, device, nome que não é UTF-8 e, abaixo do que foi selecionado,
    os escondidos da [D-10](../../plans/07-explorer-and-editor/decisions.md#d-10--exclusões-padrão-e-teto-da-árvore);
    link para arquivo dentro da pasta entra com o conteúdo do alvo. Entradas e bytes são medidos
    **antes do primeiro byte** (`413`, `params.measure`), e cada item selecionado grava o seu
    `file.downloaded` antes dele. Cliente que aborta destrói o stream e fecha os descritores; falha
    depois do primeiro byte corta a conexão — o zip fica inválido, nunca um zip válido incompleto.
  - **`upload`** é `multipart` lido em stream (`busboy`), nunca o corpo inteiro em memória: primeiro os
    campos (`folder`, `directory`, `manifest`, `confirmSensitive`), depois as partes `file` na ordem
    do manifesto. O manifesto (`[{ path, size, onConflict, ifMatch? }]`, `path` relativo a
    `directory`) é validado **inteiro antes do primeiro byte gravado**: cada segmento pela regra do
    nome (`FilePath.naming`, e mais o nome reservado do Windows — `CON`, `PRN`, `AUX`, `NUL`,
    `COM1`…`COM9`, `LPT1`…`LPT9` —, `400` com todos os motivos de todos os itens), e os tetos por
    arquivo, por itens e pela soma (`413`). Cada arquivo vai por um temporário e `link` (`O_EXCL`),
    como o criar: conexão que cai no meio não deixa arquivo parcial; parte com mais bytes que os
    declarados é cortada e recusada. O conflito é por item — `fail` (aquele `409`, os outros
    seguem), `replace` com o `If-Match` do existente (`428` sem, `412` diferente; pela escrita
    atômica), `keepBoth` (`nome copy.ext`, `nome copy 2.ext`…, cada tentativa com `O_EXCL`). As
    subpastas de uma pasta enviada são criadas pela fronteira, uma a uma. Cada item grava
    `file.created` (ou `file.written`, no `replace`) com `source: upload` antes do disco: os bytes
    esperam num temporário nosso — ao lado do destino, ou na pasta existente mais próxima acima dele,
    para as subpastas só nascerem depois da trilha —, e o fato leva o hash deles. Trilha fora antes
    de qualquer item gravado → `503` inteiro; depois, os itens que faltam falham com ela, sem
    tentar. Parte que não traz os bytes declarados — a mais, cortada; a menos, a conexão que caiu —
    é `400` `INVALID_INPUT` daquele item (`files.error.uploadSizeMismatch`, `params.declared`,
    `params.received`), e nada dela fica. Os `path` da resposta (e do `preflight`) são relativos à
    pasta aberta, como em toda rota, e vêm na ordem do manifesto. Um symlink não chega pelo
    navegador: o que chega é arquivo comum.
  - **`limits`** diz ao cliente os tetos antes de ele começar: editar, baixar, compactar, enviar e
    guardar no histórico.
- **Histórico local** ([07 · F8](../../plans/07-explorer-and-editor/F8-local-history.md),
  [D-17](../../plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local),
  [ADR-015](../shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web)):
  - **O que entra:** a versão que uma escrita da pessoa vai perder, **antes** dela — salvar (`save`),
    apagar com `keepInHistory` (`delete`: cada arquivo e cada pasta de um apagamento, sob o mesmo
    `batchId`), restaurar (`restore`) e upload com substituição (`upload`). Escrita do Claude não
    entra: ela tem o store do desfazer da sessão. Mover nunca sobrescreve
    ([D-12](../../plans/07-explorer-and-editor/decisions.md#d-12--mover-sem-sobrescrever)), então não
    há versão perdida por mover; o histórico é **por caminho**, e não segue um arquivo renomeado.
  - **Onde:** metadado em `file_history_entries` ([backend/05](05-persistence.md#o-histórico-local)),
    conteúdo em blob **endereçado por sha256** no disco do backend (`RC_FILES_HISTORY_DIR`,
    `<2 primeiros hex>/<sha256>`, escrito por temporário + `rename` e nunca reescrito) — o mesmo
    conteúdo guardado dez vezes é um blob. Acima do teto de snapshot a entrada existe, com
    `kept: tooLarge` e sem blob, e diz por quê.
  - **Teto e purga:** por arquivo (entradas), total (bytes dos blobs distintos) e por idade, por um
    job no molde do `SnapshotPurgeJob`, sob advisory lock **exclusivo** — duas purgas não perdem
    nem duplicam; guardar toma o mesmo lock **compartilhado** enquanto grava o blob e a linha, para a
    varredura nunca apagar um blob recém-escrito que a linha ainda vai citar.
  - **Falha** do histórico não impede salvar (`warn` no log, e a resposta diz
    `history.kept: false`), mas impede o apagar com `keepInHistory`: nada é apagado, e o cliente
    volta ao segundo passo definitivo da [D-06](../../plans/07-explorer-and-editor/decisions.md#d-06--apagar-definitivo-ou-lixeira).
  - **Quem vê:** quem alcança, **agora**, a pasta em que a entrada está — revalidada a cada pedido. A
    entrada de fora da pasta pedida é `404` `HISTORY_ENTRY_NOT_FOUND`, igual à que não existe. O
    autor vai com a entrada (`author.self`, `author.id`): o servidor só conhece o `sub` de quem
    escreveu.
  - **Restaurar** é uma escrita comum: com `If-Match` substitui o atual (`412` se ele mudou —
    inclusive pelo Claude), sem ele recria o apagado (`409` se o caminho foi ocupado); guarda antes
    o atual; `file.restored` antes do disco; restaurar o que o disco já tem é `200` sem escrita.
  - **Detalhes da implementação** (B-56…B-58): o cursor das páginas é o `seq` da tabela; `GET
    /files/history` sem `path` lista tudo sob a pasta; o `hash` de cada entrada vai na forma de
    `ETag` (`"<sha256>"`), para o cliente comparar direto com o do arquivo atual. O apagar com
    `keepInHistory` percorre a pasta pelo `FolderDisk` (nunca por link) e **não guarda** — logo não
    apaga — o que não saberia recriar: link, FIFO/device, nome que não é UTF-8 ou com `\`
    (`notKept: unavailable`; num link apagado sozinho, `428` com `why: unavailable`); depois de
    guardar, confere de novo (o hash do arquivo, ou tipo·caminho·tamanho·`mtime` de cada entrada da
    pasta) e, se mudou, esquece o lote e responde `412`; trilha fora (`503`) também esquece o lote.
    O `file.deleted` desse apagar leva `keptBatchId`; o `file.restored` leva `entryId`, `entryKind`,
    `reason`, `sizeBytes`, `hashBefore`, `hashAfter`, `replaced` e `sensitive`. Na restauração,
    `If-Match: *` vale como ausente (nunca sobrescreve às cegas), uma entrada de pasta ignora o
    `If-Match` e responde `etag` e `size` `null`. A purga (`FileHistoryPurgeJob`) roda um minuto
    depois da subida e a cada dez, na ordem idade → por caminho → total → varredura dos blobs que
    nenhuma linha nomeia (e dos temporários que sobraram).

#### As rotas HTTP do `files`

Toda rota nomeia a **pasta da aba** (`folder`, absoluta, mesma regra das rotas do `workspace`) e um
caminho **relativo** a ela; caminho viaja em search ou corpo, nunca como segmento. Bearer em todas.

| Rota | Resposta | Recusas |
|---|---|---|
| `GET /files/tree?folder=&path=` | `{ folder, path, entries[{ name, path, kind, size, mtime, hidden, unreadableName, outside, targetKind }], truncated }` — um nível; pastas primeiro, depois nome sem caixa e com números em ordem natural; `kind` é `file`·`directory`·`symlink`·`other`; `hidden` **marca** o que a [D-10](../../plans/07-explorer-and-editor/decisions.md#d-10--exclusões-padrão-e-teto-da-árvore) esconde, não omite; `outside: true` no link que sai da pasta (e `targetKind: null`), `targetKind: missing` no quebrado | `400`, `401`, `403`, `404` `FILE_NOT_FOUND`/`WORKSPACE_NOT_FOUND`, `422` `WORKSPACE_NOT_A_DIRECTORY`/`WORKSPACE_DIRECTORY_UNREADABLE`/`FILE_OPERATION_INVALID` |
| `GET /files/content?folder=&path=&encoding=` | `{ path, content, etag, encoding, bom, eol, size, mtime, largeFile }` e o `ETag` no cabeçalho; `If-None-Match` com a versão atual → `304` sem corpo | `400`, `401`, `403`, `404`, `413` `FILE_TOO_LARGE`, `415` `FILE_NOT_TEXT`, `422` `FILE_NOT_A_FILE`/`FILE_ACCESS_DENIED`/`FILE_OPERATION_INVALID` |
| `PUT /files/content` `{ folder, path, content, encoding?, bom?, confirmSensitive? }` + `If-Match` | `200` `{ path, etag, size, history }` e o `ETag`; `history` é `{ kept: true, entryId }`, `{ kept: false, reason: tooLarge·unavailable }`, ou `null` quando nada foi escrito — o reenvio do que o disco já tem é `200` sem escrita | `400`, `401`, `403`, `412` `FILE_CHANGED` (com o `ETag` atual), `413` `FILE_TOO_LARGE`/`PAYLOAD_TOO_LARGE`, `422` `FILE_NOT_A_FILE`/`FILE_NOT_ENCODABLE`/`FILE_ACCESS_DENIED`, `428` `PRECONDITION_REQUIRED`, `503`, `507` |
| `POST /files` `{ folder, path, kind, content?, encoding?, bom?, confirmSensitive? }` | `201` `{ path, etag }` com `Location` e, num arquivo, o `ETag`; cria as pastas acima que faltam | `400`, `401`, `403`, `409` `FILE_EXISTS` (com o `ETag` do existente), `413`, `422`, `428`, `503`, `507` |
| `POST /files/move` `{ folder, from, to, ifMatch?, confirmSensitive? }` | `200` `{ path, etag }` | `400`, `401`, `403`, `404`, `409` `FILE_EXISTS`, `412`, `422` `FILE_OPERATION_INVALID` (`intoItself`·`openFolder`·`crossDevice`), `428`, `503` |
| `POST /files/copy` `{ folder, from, to }` | `201` `{ path, etag }` com `Location`; link copiado como link | as de mover, e `413` acima do teto de cópia (`params.measure`: `entries`·`bytes`), `507` |
| `DELETE /files?folder=&path=&recursive=&expectedEntries=&confirmSensitive=` + `If-Match` opcional | `204` | `400`, `401`, `403`, `404`, `409` `DIRECTORY_NOT_EMPTY` (`params.entryCount`, `params.entryCountCapped`), `412` (contagem mudou, ou `If-Match`), `422` `openFolder`, `428` (`expectedEntriesMissing`, `sensitiveFile`), `503` |
| `DELETE /files?…&keepInHistory=true` | `200` `{ kept: { batchId, entries[{ id, path, entryKind }] } }` — o que saiu está no histórico, e o cliente oferece **Desfazer** em vez de confirmar; a pasta inteira vai sem a contagem | as de cima, e: o que não cabe no histórico não é apagado — arquivo `428` (`params.reason: notKept`, `params.why: tooLarge·unavailable`), pasta `409` `DIRECTORY_NOT_EMPTY` com a contagem **e** `params.notKept` (`tooMany`·`tooLarge`·`unavailable`); o cliente volta ao segundo passo definitivo (a rota de cima) |
| `GET /files/limits` | `{ maxEditBytes, largeFileBytes, downloadMaxBytes, archiveMaxEntries, uploadMaxBytes, uploadMaxEntries, uploadMaxTotalBytes, historyMaxFileBytes }` | `401` |
| `GET /files/raw?folder=&path=&download=` + `Range` e `If-Match` opcionais | `200` com os bytes, ou `206` com `Content-Range`; `ETag`, `Accept-Ranges: bytes`, `Content-Type` pelo conteúdo, `nosniff`, `CSP: sandbox`, `Content-Disposition` | `400`, `401`, `403`, `404`, `412` `FILE_CHANGED` (a versão mudou entre páginas), `413` `FILE_TOO_LARGE` (acima do teto de download), `416` `RANGE_NOT_SATISFIABLE`, `422` `FILE_NOT_A_FILE`/`FILE_ACCESS_DENIED`, `503` (só com `download=true`) |
| `GET /files/archive?folder=&path=…` (`path` repetido: a seleção) | `200` `application/zip` em stream, `Content-Disposition: attachment` | `400`, `401`, `403`, `404`, `413` `FILE_TOO_LARGE` (`params.measure`: `entries`·`bytes`, antes do primeiro byte), `422`, `503` |
| `POST /files/upload/preflight` `{ folder, directory, items[{ path, size }] }` | `200` `{ items[{ path, existing: { kind, etag } \| null }] }` — o conflito de cada item **antes** de enviar | `400` (todos os motivos de todos os itens), `401`, `403`, `404`, `413`, `422` |
| `POST /files/upload` `multipart`: `folder`, `directory`, `manifest`, `confirmSensitive`, e as partes `file` | `200` `{ items[{ path, status: created·replaced·renamed, etag }] }` — o `replaced` leva também `history`, como o salvar (`{ kept: true, entryId }` ou `{ kept: false, reason: tooLarge·unavailable }`): a versão substituída vai para o histórico local antes da trilha, e a falha dele não impede a substituição; **`207`** quando algum item falhou — aquele com `{ path, status: failed, error: { code, messageKey, params } }`, os outros como acima | `400` (manifesto, nome), `401`, `403`, `404`, `413` (por arquivo, por itens, pela soma — antes do primeiro byte), `422`, `428` (`sensitiveFile`), `503` |
| `GET /files/history?folder=&path=&reason=&cursor=&limit=` | `{ entries[{ id, path, entryKind, reason, kept, sizeBytes, hash, author: { self, id }, at, batchId }], nextCursor }`, mais novas primeiro; sem `path`, tudo sob a pasta; `path` relativo à pasta pedida e `hash` na forma de `ETag`; `reason`: `save`·`delete`·`restore`·`upload`; `kept`: `yes`·`tooLarge` | `400`, `401`, `403`, `404` `WORKSPACE_NOT_FOUND` |
| `GET /files/history?folder=&deleted=true&cursor=&limit=` | as mesmas entradas: a última `delete` de cada caminho da pasta que **não existe mais** — os apagados recentemente | as mesmas |
| `GET /files/history/:entryId/content?folder=&encoding=` | o corpo de `GET /files/content`, com a versão guardada | `401`, `403`, `404` `HISTORY_ENTRY_NOT_FOUND`, `415` `FILE_NOT_TEXT`, `422` `FILE_NOT_A_FILE` (entrada de pasta) |
| `POST /files/history/:entryId/restore` `{ folder, confirmSensitive? }` + `If-Match` opcional | `200` `{ path, etag, size, written, history }` — `etag` `null` numa pasta | `400`, `401`, `403`, `404` `HISTORY_ENTRY_NOT_FOUND`, `409` `FILE_EXISTS` (sem `If-Match`, caminho ocupado), `412` `FILE_CHANGED`, `428` (`sensitiveFile`), `503`, `507` |

O `If-Match` é **obrigatório** só no salvar; mover e apagar o aceitam opcional, porque a árvore não
carrega hash ([07 · D-03](../../plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência)).
No `raw` ele é o que a paginação manda a partir da segunda página; no restaurar, a presença dele
diz se o atual é substituído ou se o apagado é recriado.
Os limites de taxa do [plano 05](../../plans/05-hardening-operations/README.md) valem quando ele os
estender ao HTTP.

- **Erros:** `FILE_NOT_FOUND`, `FILE_EXISTS`, `DIRECTORY_NOT_EMPTY`, `FILE_CHANGED`,
  `PRECONDITION_REQUIRED`, `FILE_TOO_LARGE`, `FILE_NOT_TEXT`, `FILE_NOT_A_FILE`,
  `FILE_OPERATION_INVALID`, `FILE_NOT_ENCODABLE`, `FILE_ACCESS_DENIED`, `STORAGE_FULL`,
  `WATCH_LIMIT_REACHED`, `WATCH_UNAVAILABLE`, `RANGE_NOT_SATISFIABLE`, `HISTORY_ENTRY_NOT_FOUND`, e os reusados `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`,
  `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`, `WORKSPACE_DIRECTORY_UNREADABLE`,
  `INVALID_INPUT`, `SERVICE_UNAVAILABLE` — ver o [catálogo](../shared/04-errors-and-http.md#catálogo-de-erros-de-domínio).

### `session`

- **Entidades:** `Session`, `Turn`
- **Estados:** `starting → idle → thinking → running → waitingPermission → idle → closed`
- **Regras:** limite de sessões simultâneas **configurado, com default de 10** (~222 MB por
  sessão e exatamente 1 processo por sessão, medidos em spike — o default assume máquina alvo
  folgada). Derivar o limite da RAM disponível é trabalho posterior; enquanto não existe, o
  número é explícito e não teórico, e a **recusa da sessão além do teto** é caminho obrigatório:
  `SESSION_LIMIT_REACHED` traduzido, e **nenhum subprocesso órfão**.
  `close()` sempre executa, mesmo em erro — subprocesso vazado é vazamento de recurso real
- **Prompt concorrente — enfileira**
  ([R-02, decidido](../../plans/00-bootstrap/progress.md#decisões-tomadas-durante-a-execução)):
  um prompt que chega durante um turno entra na fila e roda em seguida, como turno próprio. É o
  que o SDK já faz nativamente, medido em spike, e é o comportamento da UI do Claude Code —
  rejeitar com `409` era política nossa, e era a errada. Ver
  [descoberta §8.6](../../discovery/01-descoberta-claude-agent-sdk.md#86--segundo-prompt-durante-um-turno-é-enfileirado-pelo-sdk)
- **Retomada** (`session.start` com `resumeSessionId`,
  [plano 04 · F2](../../plans/04-transcript-and-resume/F2-resume.md)): a conversa é procurada
  **dentro** do workspace pedido, que passa pela allowlist antes de qualquer pergunta ao store. A
  origem decide como (`resumeStrategyFor`, domínio puro): nossa → `resume` in-place; nunca aberta
  aqui → `resume` + `forkSession` num id nosso, gravado antes do `query()`; aberta aqui por outra
  pessoa, sem `cwd` ou de outro `cwd` → `SESSION_NOT_FOUND`. A conversa **já viva para o chamador**
  — aberta ou retomada por ele, pelo id dela ou pelo que ela continua — é **juntada**, nunca
  aberta de novo, e duas retomadas simultâneas são uma só. Toda retomada entra em `audit_events`
  (`session.resumed` / `session.forked`) antes do subprocesso; trilha indisponível não retoma.
  Cada sessão viva guarda a sua conversa (`claudeSessionId`, `resumedFrom`), que o
  `session.started` e o `session.attached` levam ao cliente
- **Slash commands** ([plano 04 · F3](../../plans/04-transcript-and-resume/F3-commands.md)): o menu
  vem do `supportedCommands()` da sessão viva, filtrado por metadado no domínio (`menuOf`: sem
  `__`, sem `(removed)`/`Renamed to`, sugeridos primeiro) e cacheado pelo `CommandCatalog`, um por
  processo, chaveado por **versão do CLI e workspace** — duas sessões juntas fazem uma chamada;
  versão desconhecida e falha nunca ficam no cache. Prompt que invoca comando que a instalação não
  tem (nem como alias) é recusado com `INVALID_INPUT`; lista indisponível não recusa nada. Os
  prompts de uma sessão chegam à fila na ordem em que chegaram, mesmo quando um deles espera a lista
- **Desfazer** ([plano 04 · F4](../../plans/04-transcript-and-resume/F4-checkpoint.md)): o
  `UndoPlanner` monta os pontos (um por turno que tocou arquivo) e o que cada um faria **agora** a
  cada arquivo — o mesmo cálculo para a prévia e para o desfazer, então os dois não divergem.
  `RewindFilesUseCase` recusa com `SESSION_LOCKED` fora de `idle` ou com outro desfazer da sessão em
  curso, grava `session.filesRewound` na trilha **antes** de tocar o disco e devolve revertidos,
  preservados (com motivo), inalterados e falhos. O disco é o `NodeUndoDisk`: nunca através de
  link, restauração atômica (temporário + `rename`) e snapshot conferido pelo hash
- **HTTP — `GET /sessions/:sessionId/commands`** e **`GET /sessions/:sessionId/checkpoints`**
  (Bearer): o menu e a prévia do desfazer. `400` para id malformado, `403`/`404` para sessão de
  outra pessoa / que não está viva, e — só no menu — `502`/`504` quando o CLI falha ou não responde.
  Formato em [05-websocket-protocol](../shared/05-websocket-protocol.md#slash-commands)
- **HTTP do painel do Claude** ([plano 08 · B-03](../../plans/08-claude-panel/F0-contract.md#b-03--os-endpoints-de-leitura-documentados-)).
  Tudo leitura, tudo Bearer, e as recusas comuns a todo `/sessions/:sessionId/…` são as de cima:
  `400` para id malformado, `403`/`404` para sessão viva de outra pessoa / que não está viva. Os limites
  do [plano 05](../../plans/05-hardening-operations/README.md) valem para cada um (nota para ele).

  **`GET /sessions?workspacePath=`** — as sessões **vivas** do chamador na pasta e nas subpastas (F1).
  O registro é filtrado por **dono** (sessão de outra pessoa não aparece, nem como contagem) e por
  **contenção**: o `cwd` da sessão está na pasta pedida ou abaixo dela, comparado no realpath e por
  segmento (`/repo-old` não está em `/repo`) — regra pura de domínio (`live-session-listing`). A pasta
  passa antes pelo `ResolveWorkspaceUseCase`, com a mesma ordem de recusas do resto do módulo.

  | Status | Quando |
  |---|---|
  | `200` `{ sessions: [...] }` | cada sessão com `sessionId`, `claudeSessionId`, `resumedFrom`, `workspacePath`, `status`, `model`, `permissionMode`, `startedAt`, `openedFrom` (`web`·`mobile`) e `pendingPermissions`; lista vazia é resposta |
  | `400` `INVALID_INPUT` | `workspacePath` ausente ou relativo |
  | `403` `WORKSPACE_NOT_ALLOWED` / `FORBIDDEN` | fora de toda raiz / raiz de outra pessoa |
  | `404` `WORKSPACE_NOT_FOUND` · `422` `WORKSPACE_NOT_A_DIRECTORY` | a pasta não existe / é arquivo |

  **`GET /sessions/:sessionId/tools/:toolUseId/diff`** — antes e depois de um `Edit`, `MultiEdit` ou
  `Write` (F3), do input da tool e do snapshot que o desfazer já guarda
  ([08 · D-03](../../plans/08-claude-panel/decisions.md#d-03--de-onde-vem-o-diff)). O input vem da
  `SessionChangeMemory` — o que o `PreToolUse` gravou na trilha, guardado em memória com a sessão viva,
  porque a trilha é só de escrita para os outros módulos —, com teto de invocações e de tamanho; a que
  saiu do teto responde como a que nunca existiu. `before.state` diz o que se sabe do lado anterior:
  `content`, `absent` (arquivo novo), `unavailable` (com `reason`: `laterTouch` — segundo toque no mesmo
  turno, sem snapshot intermediário —, `noSnapshot`) ou `notRestorable` (`tooLarge`·`unreadable`).
  `after.state` é `content` — o `content` de um `Write`; de uma edição, o disco **só** enquanto ele ainda
  é o que a sessão deixou e nenhuma escrita posterior da sessão tocou o arquivo — ou `unavailable`
  (`laterWrite`·`changedSince`). `scope` diz de que são os trechos: `file` (antes contra depois, os dois
  conhecidos) ou `edit` (as strings que a edição trocou, um trecho por edição, na ordem). A regra é
  domínio puro (`toolDiffOf`, `line-diff`).

  | Status | Quando |
  |---|---|
  | `200` `{ path, toolName, scope, before: { state, content?, reason? }, after: { state, content?, reason? }, hunks: [{ id, oldStart, oldLines, newStart, newLines, lines: [{ kind, text }] }] }` | o diff; `path` absoluto, como o desfazer nomeia |
  | `404` `TOOL_USE_NOT_FOUND` | `toolUseId` que a sessão não tem |
  | `422` `DIFF_NOT_APPLICABLE` | tool que não escreve arquivo (`Bash`, `Read`), ou cujo input não nomeia caminho absoluto |
  | `415` `FILE_NOT_TEXT` | um lado binário ou fora de UTF-8 |

  **`GET /sessions/:sessionId/changes`** — os arquivos que a sessão (e a conversa continuada in-place)
  criou, modificou ou apagou, contra **antes da sessão** — o snapshot do primeiro turno que tocou cada
  caminho (F3): `{ promptId, files: [{ path, kind, promptId, modifiedOutside, added, removed, revision }] }`.
  `path` é absoluto; `kind` é `created`·`modified`·`deleted`; o `promptId` do arquivo é o turno que o
  tocou primeiro — o que rejeitá-lo inteiro manda —, e o de cima é o do primeiro turno de todos — o que
  "rejeitar tudo" manda (`null` sem alteração); `added`/`removed` são `null` quando um lado não é texto;
  `revision` é o hash do disco ao listar (`absent` para arquivo apagado), do que a marca de revisão do
  cliente é. Arquivo que voltou a ser o que era antes da sessão não é alteração e não aparece. `200` com
  lista vazia quando a sessão não mudou nada.

  **`GET /sessions/:sessionId/changes/file?path=`** — um arquivo dessas alterações: `{ path, kind,
  promptId, modifiedOutside, before, now, revision, hunks }` — o antes da sessão, o agora (disco), os
  trechos com `id` e a `revision` (o hash do disco no cálculo, `absent` sem arquivo) que o
  `session.rejectChange` confere (F3). `kind` `null` para o arquivo que voltou a ser o que era (sem
  trechos). Lido de uma vez: uma escrita atômica no meio é vista antes ou depois, nunca pela metade.
  `400` para `path` relativo; `404` `NOT_FOUND` (`session.error.changeNotFound`) para caminho que não é da
  sessão; `403` `WORKSPACE_NOT_ALLOWED` para caminho que virou symlink para fora, recusado **sem ler**;
  `415` `FILE_NOT_TEXT`.

  **`GET /sessions/:sessionId/models`** — o `supportedModels()` da instalação (F4):
  `{ current, models: [{ value, resolvedModel, displayName, description, supportsEffort,
  supportedEffortLevels }] }`, `current` o modelo com que a sessão roda. Guardado pelo `ModelCatalog`
  (o `InstallationCache` do plano 04), por versão do CLI e workspace: duas sessões juntas fazem **uma**
  chamada, e versão nova do CLI lê de novo. O mesmo cache é o que o `session.start` consulta para recusar
  um `effort` que o modelo não aceita. `502`/`504` quando o CLI falha ou não responde — o seletor
  continua mostrando o modelo atual.

  **`GET /sessions/:sessionId/mcp-servers`** — o `mcpServerStatus()` **reduzido** a
  `{ servers: [{ name, status, toolCount }] }`, `status` `connected`·`failed`·`needs-auth`·`pending`·
  `disabled` (F4). **Nunca** `config` nem `error` cru: podem carregar segredo e caminho. `502`/`504` como
  acima.

  **`GET /sessions/:sessionId/context`** — o `getContextUsage({ detail: 'summary' })` reduzido a
  `{ model, totalTokens, maxTokens, percentage, categories: [{ id, name, tokens, kind }] }`, `kind`
  `used`·`free`·`buffer`·`deferred` e `id` o nome da categoria em camelCase (F4). O cliente relê a cada
  `turn.completed` — é quando ele muda, `/compact` incluído. `502`/`504` como acima.

  As três perguntam à sessão viva por uma control request com prazo; a sessão que acabou é
  `404` `SESSION_NOT_FOUND`, como os outros recursos dela.

  **`GET /sessions/:sessionId/commands`** ganha `origin` por item — `builtin`·`project`·`user`·`system`
  —, `label` (o nome sem o prefixo do plugin) e `shadowed` (a regra de colisão do SDK: entre um `builtin`
  e um sem marcador, `/nome` roda o `builtin` qualquer que seja a ordem) (F5); **`GET /catalog?workspacePath=`**
  (`ReadCatalogUseCase`) responde comandos, skills, modelos e os tetos do composer **sem sessão viva**, do
  catálogo por versão do CLI e pasta, e sem cache abre uma `query()` efêmera que só pergunta — pela mesma
  porta `ClaudeSessionPort`, logo com `settingSources: ['project']` e o `PreToolUse` —, conta no teto
  enquanto dura, uma por vez por pasta, e fecha
  ([08 · D-13](../../plans/08-claude-panel/decisions.md#d-13--o-catálogo-antes-da-sessão)) (F5).

  **O contexto do prompt** (F5, B-44): o `PromptContextResolver` confere cada item do
  `session.prompt.attachments` — arquivo e pasta pela porta `ReferenceInspector`, que o
  `FilesModuleReferenceInspector` implementa com o `FilePath` e o `FolderDisk` do módulo `files` contra a
  pasta **da sessão** —, tudo ou nada, e compõe o texto (`composePrompt`, no domínio). O prompt entra na
  fila com o contexto composto e as imagens (`PromptExtras`).

  **`POST /sessions/:sessionId/attachments`** — o anexo do prompt, imagem ou texto (F5,
  [08 · D-02](../../plans/08-claude-panel/decisions.md#d-02--imagem-no-prompt) e D-22): `201`
  `{ attachmentId, kind, mediaType, name, size }`; `413` `PAYLOAD_TOO_LARGE` acima do teto
  (`RC_ATTACHMENT_MAX_BYTES`, até 5 MiB); `415` `ATTACHMENT_TYPE_UNSUPPORTED` fora de PNG/JPEG/GIF/WebP e
  texto UTF-8, pelo tipo dos bytes. Vive no `AttachmentStore`, em memória — fora do workspace, da trilha e
  do log (só tipo, tamanho e hash) —, e morre quando a sessão sai do registro (`SessionRegistry.onRemoved`),
  no TTL ou, passada a memória de todos, do mais antigo para o mais novo.
- **Erros:** `SESSION_NOT_FOUND`, `SESSION_LOCKED`,
  `SESSION_LIMIT_REACHED`, `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`, `INVALID_INPUT`
  (`session.error.unknownCommand`, `session.error.rewindTargetUnknown`,
  `session.error.rewindPathUnknown`, `session.error.forkPointUnknown`,
  `session.error.effortUnsupported`, `session.error.referenceKind`), `NOT_FOUND`
  (`session.error.changeNotFound`), `PAYLOAD_TOO_LARGE` (`session.error.attachmentTooLarge`), `INTERNAL_ERROR`
  (`session.error.rewindIncomplete`), `CONFLICT` (`session.error.queuedPromptStarted`),
  `SESSION_CHANGE_STALE`, `SESSION_FORK_REJECTED`, `QUEUED_PROMPT_NOT_FOUND`, `TOOL_USE_NOT_FOUND`,
  `DIFF_NOT_APPLICABLE`, `ATTACHMENT_NOT_FOUND`, `ATTACHMENT_TYPE_UNSUPPORTED`
- Ver [04-claude-integration.md](04-claude-integration.md).

### `permission`

- **Entidades:** `PermissionRequest`, `PermissionRule`
- **Regras:**
  - `requestId` é a chave de idempotência — o SDK reentrega após gap de transporte
  - primeira resolução vence; as seguintes são no-op com `ack`
  - timeout (default 120 s) **nega**; silêncio nunca autoriza
  - `deny` exige `reason`
  - regra persistida (`scope: session|project|always`) auto-resolve requests futuros **antes**
    de notificar alguém
  - **a regra é de um usuário**, nunca da máquina: `userId` entra no casamento, não só na
    criação. Regra de um jamais resolve o pedido de outro
  - o padrão de input usa a **gramática das settings do Claude Code** — `Bash(git status)` casa
    exato, `Bash(git status:*)` casa o prefixo, `Bash` casa a tool inteira. Sem glob, sem regex:
    é a gramática do `PermissionUpdate` do SDK — hoje não devolvido, pela D-09 do plano 03 —, e
    sintaxe própria faria as duas metades casarem conjuntos diferentes de comando no dia em que for
    ([a ponte](04-claude-integration.md#a-ponte-de-permissão))
  - **padrão fora da gramática é recusado na criação**, não guardado como regra que nunca casa —
    e o prefixo respeita fronteira de token: `git status:*` não cobre `git statusx`
  - **toda regra expira.** `expiresAt` é obrigatório; valor default e teto vêm de configuração, e
    pedido acima do teto é recusado, nunca truncado em silêncio. Regra expirada não resolve nada
    e **continua na lista**, marcada — "sumiu" e "deixou de valer" são coisas diferentes para
    quem procura o que autorizou
  - o casamento é **regra pura do domínio**: é dele que a UI tira o texto de alcance
  - `riskHint` é **derivado no backend** — as duas pontas não podem divergir —, por lista fixa
    por tool **mais** heurística sobre o input, e **falha fechado**: comando que a heurística não
    reconhece é marcado como destrutivo, nunca como seguro. Falso positivo incomoda; falso
    negativo é o acidente. É essa garantia que sustenta a confirmação em dois passos do app valer
    só para `destructive` ([mobile/04-ui](../mobile/04-ui.md#a-tela-de-permissão))
  - o prazo do pedido pode ser **estendido** pela UI, com incremento e teto vindos da
    configuração — o cliente manda o comando, não escolhe o número
    ([contrato WS](../shared/05-websocket-protocol.md#estender-o-prazo-é-mexer-na-única-proteção-que-existe))
- **HTTP — `GET /sessions/:sessionId/permissions/:requestId`** (Bearer). A consulta que o deep
  link do push faz **antes** de renderizar: o push pode chegar atrasado, e o pedido pode já ter
  sido respondido noutra tela ou negado pelo prazo. O `session.attach` republica os pendentes,
  mas sem marcador de fim — "não veio em *n* ms" é palpite, não resposta —, então a revalidação é
  **perguntar**, lendo o mesmo registro em memória de onde o attach reentrega
  ([02 · D-22](../../plans/02-mobile-approval/decisions.md#d-22--revalidar-é-perguntar-não-esperar)).
  Só lê: responder continua sendo pelo socket, que é quem dá o `correlationId`.

  | Status | Corpo | Quando |
  |---|---|---|
  | `200` | `{ "status": "pending", "request": <payload de permission.requested>, "remainingExtensions": n }` | o pedido ainda bloqueia o loop; `request` é **exatamente** o payload do frame, e `n` é o teto configurado menos as extensões gastas |
  | `200` | `{ "status": "resolved", "requestId", "decision", "auto", "resolvedBy"?, "resolvedFrom"? }` | alguém respondeu, ou uma regra respondeu; os campos são os de `permission.resolved`, ausentes (nunca `null`) quando não há o que dizer |
  | `410` | `PERMISSION_REQUEST_EXPIRED` | o prazo negou — "chegou tarde" não é "já foi decidido" |
  | `404` | `PERMISSION_REQUEST_NOT_FOUND` | `requestId` que este processo não conhece (inclusive o de sessão já encerrada), **ou** pedido que não é daquele `sessionId` |
  | `403` | `PERMISSION_NOT_OWNED` | pedido de outro usuário |
  | `401` | `UNAUTHENTICATED` | sem credencial válida |

  A ordem das recusas é fixa — desconhecido, outro usuário, outra sessão, expirado — para que a
  resposta a um estranho não dependa de ele ter acertado a sessão.
- **Precedência** ([D-11 do plano 03](../../plans/03-rules-and-audit/decisions.md#d-11--o-mais-restritivo-até-onde-o-canusetool-alcança)):
  qualquer `deny` que case nega, ao lado de qualquer `allow`; em `permissionMode: plan`, nenhum
  `allow` auto-aprova — o pedido vai ao humano. Regra que resolve publica `permission.resolved` com
  `auto: true` e **não** publica `permission.requested` nem dispara push. As regras são lidas a cada
  pedido, sem cache: falha ao lê-las pergunta ao humano, nunca autoriza.
- **HTTP — `/permission-rules`** (Bearer). As regras que sobrevivem à sessão (`project`, `always`);
  a de `session` nasce do card e morre com a sessão
  ([D-10 do plano 03](../../plans/03-rules-and-audit/decisions.md#d-10--dois-caminhos-para-nascer-uma-rotina)).
  Escolher `project`/`always` no `permission.resolve` passa pela **mesma** rotina, com o padrão mais
  estreito que cobre a invocação e a validade default. O `permission.requested` oferece os dois
  **com** esse padrão e essa validade (`pattern`, `lifetimeMs`), e só quando a invocação tem padrão
  possível — `project`, só quando o pedido tem workspace
  ([D-12 do plano 03](../../plans/03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta)).

  | Rota | Status | Quando |
  |---|---|---|
  | `GET /permission-rules` | `200` `{ rules: [...] }` | as do chamador, mais novas primeiro; expirada vem marcada (`status: expired`), revogada não vem |
  | `POST /permission-rules` `{ pattern, decision, scope, projectPath?, expiresAt? }` | `201` com a regra | concedida — ou a equivalente que já estava ativa (idempotente) |
  | | `400` `PERMISSION_RULE_PATTERN_INVALID` | padrão fora da gramática |
  | | `422` `PERMISSION_RULE_EXPIRY_TOO_LONG` | validade acima do teto configurado |
  | | `400` `INVALID_INPUT` | validade no passado, ou `project` sem `projectPath` |
  | `GET /permission-rules/:ruleId` | `200` com a regra | em **qualquer** estado, inclusive `revoked` — é por onde a trilha leva à regra que respondeu ([D-18 do plano 03](../../plans/03-rules-and-audit/decisions.md#d-18--a-regra-revogada-tem-endereço)) |
  | | `404` `PERMISSION_RULE_NOT_FOUND` | não existe |
  | | `403` `PERMISSION_NOT_OWNED` | é de outra pessoa |
  | `DELETE /permission-rules/:ruleId` | `200` com a regra revogada | revogada agora — ou já estava (idempotente). Duas revogações **ao mesmo tempo** também são uma: a que o banco guarda é a registrada na trilha, e as duas respostas trazem o `revokedAt` dela (S-46 do plano 03) |
  | | `404` `PERMISSION_RULE_NOT_FOUND` | não existe |
  | | `403` `PERMISSION_NOT_OWNED` | é de outra pessoa, e continua valendo para ela |

  A regra tem `id`, `scope`, `toolName`, `pattern` (a gramática, como escrita), `decision`,
  `projectPath`, `grantedBy`, `grantedAt`, `expiresAt`, `status` (`active`/`expired`/`revoked`) e
  `revokedAt`. Conceder e revogar entram na trilha (`permission.ruleGranted`,
  `permission.ruleRevoked`), só quando algo mudou.
- **Erros:** `PERMISSION_REQUEST_NOT_FOUND`, `PERMISSION_REQUEST_EXPIRED`, `PERMISSION_NOT_OWNED`,
  `PERMISSION_RULE_PATTERN_INVALID`, `PERMISSION_RULE_EXPIRY_TOO_LONG`, `PERMISSION_RULE_NOT_FOUND`
- Ver [contrato WS](../shared/05-websocket-protocol.md#o-fluxo-de-permissão).

### `transcript`

- **Regras:** o transcript vive no JSONL do Claude (`~/.claude/projects/`), **não** no
  Postgres. O backend lê via funções do SDK (`listSessions`, `getSessionMessages`) — não
  faça parser do JSONL na mão; o formato é interno do Claude Code.
- **Consequência importante:** as sessões criadas fora aparecem aqui. É feature, e precisa ser
  tratada como tal na UI (mostrar a origem).
- **A listagem é por workspace da allowlist**, um `listSessions({ dir })` por vez. A mesma cerca que
  vale para executar vale para ler: o store tem transcript de todo projeto da máquina, inclusive os
  que ninguém liberou. **A única exceção é o filtro "incluir subpastas"** da view de sessões
  ([08 · D-05](../../plans/08-claude-panel/decisions.md#d-05--a-lista-casa-subpastas)): o SDK não desce
  a subdiretórios, então `includeSubfolders=true` pede `listSessions({})` — o store inteiro, 281 ms
  medidos para 298 sessões —, com cache curto chaveado pelo `lastModified` máximo, e **filtra pelo
  `cwd` dentro da pasta aberta**, que já passou pela allowlist. A cerca continua sendo o `cwd`, como
  em todo o resto: o que mudou é de onde a lista vem, não o que ela admite. Sem o filtro, nunca
  `listSessions({})`.
- **`includeWorktrees: false`, e o filtro é sobre o `cwd` devolvido.** O default do SDK é
  `true`, e o worktree de um repositório liberado é outro caminho em disco — fora da entrada da
  allowlist. Sessão **sem `cwd` é excluída**, por falha fechada: não há como provar de onde é.
- **A origem não vem do SDK.** `SDKSessionInfo` não tem campo de procedência, e
  `includeProgrammatic` não separa o que é nosso. A origem sai do **nosso** banco — é nossa se
  temos linha dela —, e o rótulo é "externa", não "VSCode": pode ter vindo do terminal.
- **`[]` não é "não existe".** `getSessionMessages` devolve lista vazia tanto para sessão vazia
  quanto para id inexistente; quem distingue é `getSessionInfo`, que devolve `undefined`. Sem
  isso não há como responder `NOT_FOUND` com honestidade.
- **A leitura é cacheada, não só paginada.** `limit`/`offset` cortam o que vai para o cliente e
  **não** reduzem o trabalho do SDK — medido, ~30 MB de heap por chamada, com ou sem limite.
  Cache por `sessionId` + `lastModified`, e limite de leituras concorrentes. Ver
  [descoberta §9.2](../../discovery/01-descoberta-claude-agent-sdk.md#92--limitoffset-não-reduzem-o-trabalho-do-servidor).
  Os números estão em `adapter/outbound/claude/transcript-reads.ts`: **16** conversas em cache
  (descarta a lida há mais tempo), **2** leituras simultâneas (as demais esperam a vez; a mesma
  leitura pedida junto é **uma** chamada) e prazo de **10 s** por leitura.
- **A procedência nasce com a sessão, antes do subprocesso.** O id da conversa no store do
  Claude é um UUID **cunhado por nós** e passado ao SDK como `sessionId`; a linha em
  `session_origins` é gravada antes do `query()`. Falha ao gravar **não abre a sessão** — uma
  conversa nossa sem registro leria como de outra pessoa para sempre. A tabela é do `session`;
  o `transcript` pergunta por uma porta própria (`TranscriptOriginSource`). O repositório mora
  num módulo Nest próprio (`SessionOriginModule`), importado pelos dois: o `session` precisa do
  store do `transcript` para retomar, e com o repositório dentro do `session` os dois se
  importariam — o ciclo que a regra 3 das fronteiras proíbe. É fiação, não dono novo.
- **O `session` pergunta ao `transcript` onde uma conversa rodou**, antes de retomá-la — pela porta
  `ResumableConversationSource`, declarada no `session` e implementada por um adapter que usa o
  store (`TRANSCRIPT_STORE`, o único export do módulo) e a procedência. Nenhuma mensagem é lida
  para decidir.
- **Quem vê o quê** é regra pura de domínio (`transcriptOriginFor`): sem `cwd` → oculta;
  `cwd` fora das raízes do chamador → oculta; aberta aqui por outra pessoa → oculta; aberta aqui
  pelo chamador → `ours`; o resto → `external`. Ler o que não se lista responde `404`, igual ao
  que não existe.
- **Nenhum arquivo é aberto por esta fatia.** `pnpm lint:arch` reprova `fs`/`readline` em
  qualquer camada do `transcript` (`transcript-reads-through-the-sdk`) e leitor de linhas em
  qualquer lugar do backend (`no-line-reader`).
- **HTTP — `GET /transcripts`** (Bearer). `workspacePath` (obrigatório: uma raiz da allowlist ou
  um caminho dentro dela), `cursor` opaco e `limit` de 1 a 100 (default 25). Lista **um**
  diretório, exatamente: `listSessions({ dir, includeWorktrees: false })` não desce a
  subdiretórios, então a conversa aberta em `/raiz/app` aparece em `workspacePath=/raiz/app`, e
  não em `workspacePath=/raiz`.

  | Status | Quando |
  |---|---|
  | `200` `{ sessions: [...], nextCursor }` | uma página, escrita mais recente primeiro; `nextCursor: null` na última |
  | `400` `INVALID_INPUT` | caminho relativo, cursor que não foi emitido aqui, `limit` fora dos limites |
  | `403` `WORKSPACE_NOT_ALLOWED` / `FORBIDDEN` | fora de toda raiz / raiz de outra pessoa — **antes** de chamar o SDK |
  | `502` `CLAUDE_UNAVAILABLE` · `504` `CLAUDE_TIMEOUT` | o SDK falhou / não respondeu no prazo |

  A sessão tem `sessionId` (o id da conversa no store do Claude — o que `session.start` aceita como
  `resumeSessionId`), `summary`, `origin` (`ours`/`external`), `cwd`, `gitBranch`, `createdAt` e
  `lastModified`.

  O [plano 08](../../plans/08-claude-panel/F1-sessions.md) acrescenta, por conversa, a **`activity`** —
  `liveHere` (tem sessão viva **do chamador**: aberta, retomada ou o fork que a continua, com
  `liveSessionId`), `activeElsewhere` (conversa **externa** cujo `lastModified` está dentro da janela
  configurada, padrão 120 s — calculada com o relógio do backend, nunca "aberta no VS Code"; a nossa
  nunca é, porque sabemos se está viva) ou `idle` — e `writtenAgoSeconds`. E o parâmetro
  `includeSubfolders` (padrão `false`), pela exceção acima. O que é vivo pergunta-se pela porta que o
  `session` oferece; o `transcript` não importa o registro. O cursor é keyset sobre `(lastModified, sessionId)` descendente: conversa escrita
  entre duas páginas sobe, acima da janela já lida — não repete, e não faz pular nenhuma.
- **HTTP — `GET /transcripts/:sessionId/messages`** (Bearer). `cursor` (id de mensagem) e `limit`
  de 1 a 100 (default 25), **pela cauda**.

  | Status | Quando |
  |---|---|
  | `200` `{ session, events: [...], nextCursor }` | as mensagens mais recentes, em ordem cronológica; a próxima página é o que veio **antes** |
  | `400` `INVALID_INPUT` | id que não é UUID, cursor malformado, `limit` fora dos limites — ou cursor cuja mensagem sumiu (`transcript.error.cursorStale`: a conversa foi compactada; recomeça-se pela cauda) |
  | `404` `NOT_FOUND` | id que não nomeia conversa, **ou** conversa que o chamador não pode ler — a mesma resposta |
  | `502` `CLAUDE_UNAVAILABLE` · `504` `CLAUDE_TIMEOUT` | o SDK falhou / não respondeu no prazo |

  `events` são frames do contrato vivo **sem o envelope** — `{ type, payload }` de
  `message.completed`, `tool.started` e `tool.completed`, produzidos pelas **mesmas** funções do
  `sdk-message.mapper` que servem o stream, e com os mesmos ids. É o que deixa o cliente recarregar
  depois de um `gap` com um redutor só — e o que faz thinking e subagent aparecerem iguais vivos e
  recarregados (plano 08).
- **HTTP — `GET /transcripts/:sessionId/subagents/:agentId/messages`** (Bearer,
  [plano 08 · B-21](../../plans/08-claude-panel/F2-rendering.md)). O transcript de um subagent da
  conversa, pela cauda, pelas funções do SDK (`listSubagents`/`getSubagentMessages`), com as mesmas
  regras de leitura da conversa: a mesma cerca, a mesma paginação, o mesmo cache, e `404` `NOT_FOUND`
  para conversa ou subagent que o chamador não lê — igual ao que não existe. `400` para ids
  malformados; `502`/`504` como acima.
- **Erros:** `NOT_FOUND` (`transcript.error.notFound`), `INVALID_INPUT`
  (`transcript.error.invalidSessionId`, `transcript.error.cursorStale`), `CLAUDE_UNAVAILABLE`
  (`transcript.error.claudeUnavailable`), `CLAUDE_TIMEOUT` (`transcript.error.claudeTimeout`).

### `notification`

- **O histórico do centro de notificações** do web mora aqui
  ([06 · D-17](../../plans/06-workbench/decisions.md#d-17--o-que-vira-notificação-e-onde-vive-o-histórico)):
  por usuário, **30 dias** de retenção por um job de limpeza, **teto de 200** aplicado na mesma
  transação da gravação, e "lida" **no servidor** — marcar no desktop apaga o badge no celular. A
  mesma regra do push: guarda só `severity`, `messageKey` e `params`, validados contra o catálogo de
  chaves e o schema, **nunca** conteúdo de conversa nem comando. O log de I/O diz severidade, chave e
  contagem, nunca os `params`. O contrato WebSocket não muda: as janelas convergem relendo o
  histórico ao ganhar foco e ao reconectar.

  | Rota | Resposta |
  |---|---|
  | `GET /notifications?cursor=` | `{ items[{ id, severity, messageKey, params, count, createdAt, readAt }], unread, nextCursor }`, a mais nova primeiro |
  | `POST /notifications` `{ clientId, severity, messageKey, params, count }` | `201` ao gravar; `200` com a existente para o mesmo `clientId` — o reenvio não duplica |
  | `PUT /notifications/read` `{ ids }` · `PUT /notifications/read-all` | `204`, também para id que não existe |
  | `DELETE /notifications/:id` · `DELETE /notifications` | `204` sempre |

  `messageKey` fora do catálogo de chaves ou `params` fora do schema → `400` `INVALID_INPUT`.
  O **catálogo de chaves** é uma lista fechada no domínio (`NOTIFICATION_CATALOGUE`), com os
  parâmetros que cada chave interpola: chave desconhecida, parâmetro a mais (onde conteúdo se
  esconderia) ou a menos são recusados, com cada problema em `details[]` (`notification.error.rejected`).
  Toda chave do catálogo é uma que o web tem de traduzir — e o `pnpm i18n:check` prova que traduz.
  Notificação nova de um plano seguinte entra no catálogo na mesma mudança que a traduz
  ([06 · D-19](../../plans/06-workbench/decisions.md#d-19--o-catálogo-de-chaves-das-notificações)).
  Os `params` ficam fora do log de I/O também na borda HTTP: a rota os marca com `@OmitFromLog`.
- **Regras:** só notifica quando **nenhuma** connection do usuário está observando a sessão;
  push de permissão traz `expiresAt` e é cancelado quando a permissão resolve; payload já
  vai **traduzido**, no `Device.locale` — é a única exceção da regra de i18n
- **Nunca** coloque conteúdo de arquivo ou output de comando no push.
- **O aparelho aprovado fica sabendo** ([17 · F3](../../plans/17-devices/F3-approval-push.md)): o
  `auth` publica o fato pela porta `DeviceEvents` (o `notification` já depende do `auth`, então a
  seta não volta), e um listener do `notification` manda o push `deviceApproved` — `{ kind, deviceId }`,
  com a frase no idioma do aparelho, tag `device:<id>` e o canal `device_status` do Android. **Uma**
  tentativa, só para o aparelho aprovado, e só numa aprovação de verdade; token recusado é esquecido.
  A falha nunca desfaz nem atrasa a aprovação.
- **Vai para todos os aparelhos aprovados** do usuário, não só para o último ativo: notificar só
  o mais recente falha exatamente quando o aparelho ficou para trás, e permissão que ninguém vê
  é sessão parada até o timeout negar sozinho.
- **Uma notificação por pedido**, não uma agrupada: é o que preserva o deep link por `requestId`
  e faz o toque abrir no card certo. O agrupamento nativo do SO cuida da aparência, e o
  cancelamento continua sendo por `requestId`.
- **Falha do provedor é tentada de novo, e depois é `warn` — sem segundo canal.** Falha que pode
  passar (rede, `401`, `408`, `429`, `5xx`) ganha até 3 tentativas, 1 s → 4 s com jitter, com o
  `Retry-After` do provedor mandando no recuo e **nunca** depois do `expiresAt` do pedido; recusa
  definitiva (`rejected`, os demais `4xx`) não. Só a primeira tentativa é aguardada: a nova
  tentativa nunca segura o pedido. A retirada **para** o aviso antes de sair — cancela o que está
  agendado e espera o que está no fio —, então nenhum aviso chega depois da retirada. Esgotou → um
  `warn` só, com o número de tentativas ([05 · D-09](../../plans/05-hardening-operations/decisions.md)).
  O pedido continua válido no web e o timeout continua decidindo no silêncio. O preço está dito:
  push que falha com ninguém no navegador deixa a permissão esperar o prazo inteiro sem ninguém
  saber.
- **Token recusado pelo provedor é apagado, e o device continua aprovado** — ele volta a receber
  quando o app abrir. Revogar o device cobraria nova aprovação pelo web a cada rotação de token
  do SO. O app reenvia o token a cada renovação, e reenviar o mesmo token não duplica linha.
- O nome do provedor **não sai da configuração** — nem em log, nem em tipo, nem em nome de
  classe. O que o código conhece são três valores: o endpoint, o arquivo de credencial e o escopo
  que a troca pede. A regra é verificada por máquina, em `pnpm scan:security`, sobre as três
  pontas ([02 · S-26](../../plans/02-mobile-approval/scenarios.md)).
- **A credencial é arquivo, e a falta dela não derruba o boot.** Chave privada em variável de
  ambiente é chave privada em todo `ps` e em todo crash dump — o mesmo argumento da allowlist. O
  que difere da allowlist é a consequência: ela é a fronteira de segurança e um backend no ar com
  ela quebrada é pior que fora do ar; push é melhor esforço ao lado de um prazo que não é, e um
  backend que não subisse porque ninguém configurou notificação trocaria o produto por uma das
  suas conveniências ([02 · D-20](../../plans/02-mobile-approval/decisions.md#d-20--onde-vive-o-segredo-e-o-que-ele-não-pode-derrubar)).

### `diag`

- **O ping** (`diag.ping`, pelo WebSocket) prova o caminho de ponta a ponta; ver
  [05-websocket-protocol](../shared/05-websocket-protocol.md).
- **As versões** para a tela "Sobre" ([06 · B-12](../../plans/06-workbench/F1-directory-browse.md#b-12--versões-para-a-tela-sobre-)):
  `GET /diag/versions`, autenticada, → `{ backend, web?, agentSdk, claudeCli, node }`, cada campo
  `{ version, reason }`, com `version: null` e o motivo para o que não se pôde ler — **nunca** `500`
  porque o CLI não respondeu: a tela existe justamente para quando algo está errado. A versão do CLI
  vem do mesmo `cli-version` do [plano 04 · F3](../../plans/04-transcript-and-resume/F3-commands.md),
  com o cache por versão — pedir o "Sobre" não sobe um subprocesso. `web` é opcional: a tela mostra a
  versão do próprio bundle, e o campo só vem quando o backend a conhece.

### `audit`

- **Duas tabelas, não uma.** `audit_entries` é moldada em torno de **uma invocação** — uma sessão,
  um nome de tool, um input exato —, e nenhuma das três colunas tem valor honesto para "este
  celular foi aprovado". Os fatos de conta que o
  [08-authentication](../shared/08-authentication.md#logging) manda registrar moram em
  `audit_events` — e com eles conceder e revogar uma regra de permissão (`permission.ruleGranted`,
  `permission.ruleRevoked`), que é autorização antecipada do mesmo peso — e retomar uma conversa
  (`session.resumed`, `session.forked`), desfazer arquivos (`session.filesRewound`) e a escrita da
  pessoa nos arquivos (`file.created`, `file.written`, `file.moved`, `file.copied`, `file.deleted`,
  `file.failed` — [ADR-015](../shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web)) —, tabela irmã com a mesma disciplina: `seq` que ordena enquanto `at` filtra, ULID
  cunhado pelo domínio, e trigger que recusa `UPDATE` sempre e `DELETE` dentro do piso de 90 dias.
  Alargar a primeira com colunas anuláveis transformaria cada `NOT NULL` dela em talvez, justo na
  tabela cuja razão de existir é poder ser confiada.
- **Falha ao escrever um fato de conta não é graduada.** Ela propaga, e a operação que a causou
  falha junto. O tratamento graduado existe para que um soluço do banco não custe a sessão de
  ninguém; aprovar um device é **um** clique deliberado, e responder "feito" para uma aprovação
  que ninguém consegue prestar contas depois é o pior dos dois resultados.
- **Fonte dos eventos de tool:** o hook **`PreToolUse`**, não o `canUseTool`. O hook dispara para
  **toda** invocação de tool; o `canUseTool` só para o que exige humano. Medido em spike: 6
  tool calls → 6 hooks → 2 `canUseTool`. Ancorar aqui é o que impede a trilha de perder toda
  leitura de arquivo. Ver [ADR-011](../shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse).
- **Regras:** append-only, sem update, sem delete; registra `who`, `what`, `when`, `where`
  (device/IP), `input` exato da tool e a `decision`; falha de escrita de auditoria é `error`
  e **bloqueia** a autorização — sem trilha, não autoriza
- **Falha de escrita não derruba a sessão na primeira vez.** A primeira nega a tool, loga `error`
  e emite evento de erro na UI, com a sessão viva — um blip de rede ou um restart de container
  não pode custar o trabalho de ninguém. A **segunda falha consecutiva** encerra a sessão, com
  motivo explícito; uma escrita bem-sucedida zera o contador. Evita os dois extremos: a sessão
  zumbi, em que nada passa e o usuário fica tentando, e a morte por soluço.
- **Escopo de leitura:** cada usuário lê a própria trilha. Trilha de outro responde `403`: existe,
  e não é sua ([01 · D-17](../../plans/01-live-session/decisions.md#d-17--usar-o-código-http-que-cada-coisa-é)).
  Como a consulta é sempre escopada por quem pergunta, "trilha de outro" é o **filtro pela sessão de
  outra pessoa** — a sessão cujas entradas são todas de outro usuário. Sessão sem nenhuma entrada é
  página vazia: nada diz de quem ela é ([03 · D-17](../../plans/03-rules-and-audit/decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro)).
- **A leitura é um módulo Nest à parte** (`AuditQueryModule`), com portas próprias
  (`AuditTrailReader`, `AuditEventReader`) e os controllers: nenhum módulo que escreve na trilha
  recebe como lê-la, e o `AuditModule` continua exportando só os dois use cases de escrita.
- **HTTP — `GET /audit-events`** (Bearer) — os fatos de conta, e entre eles a escrita da pessoa nos
  arquivos (`file.*`, [07 · D-13](../../plans/07-explorer-and-editor/decisions.md#d-13--onde-os-fatos-de-arquivo-aparecem-na-trilha)).
  Filtrado **sempre** por quem pergunta — não há pedido que aponte para os fatos de outro, e por isso
  não há `403`: quem não tem fatos recebe página vazia. `kind` é prefixo (`file.` são todos os de
  arquivo; `file.written`, só os salvamentos), letras e pontos apenas; `cursor` opaco e `limit` de 1 a
  100 (default 50); keyset descendente sobre `seq`, no índice `(user_id, seq DESC)` que a tabela já
  tem. `200` `{ events[{ id, kind, subjectId, subjectLabel, details, at }], nextCursor }`, `400`
  `INVALID_INPUT` para cursor, `limit` ou `kind` fora do formato. O redesenho da tela é do
  [plano 14](../../plans/14-audit-explained/README.md), que absorve esta leitura em vez de escrever
  outra.
- **HTTP — `GET /audit-entries`** (Bearer). Filtros opcionais `sessionId`, `toolName`, `decision`
  (`recorded`/`allowed`/`denied`), `from` (incluído) e `to` (excluído), em ISO 8601 com offset;
  `cursor` opaco e `limit` de 1 a 100 (default 50).

  | Status | Quando |
  |---|---|
  | `200` `{ entries: [...], nextCursor }` | uma página, mais nova primeiro; `nextCursor: null` na última |
  | `400` `INVALID_INPUT` | período que termina antes de começar, cursor malformado, `limit` fora dos limites, `sessionId` que não é um |
  | `403` `FORBIDDEN` (`audit.error.forbidden`) | a sessão filtrada é de outra pessoa |

  A entrada tem `id`, `sessionId`, `toolUseId`, `toolName`, `input`, `decision`, `at`, `traceId` e
  `verdict` — `null` numa `recorded`, e `{ requestId, auto, ruleId, scope, resolvedBy, resolvedFrom }`
  numa decisão. O veredito é **gravado com a entrada**, não juntado de `permission_requests` na
  leitura ([03 · D-15](../../plans/03-rules-and-audit/decisions.md#d-15--a-correlação-nasce-com-a-entrada)).
  O `traceId` é o do turno, para o hook e para a regra, e o da resposta, para a decisão humana
  ([03 · D-16](../../plans/03-rules-and-audit/decisions.md#d-16--o-traceid-é-o-do-turno)).
- **Ordenação e paginação:** cursor **keyset descendente** sobre `seq`, o sequencial próprio da
  tabela; `at` é coluna de **filtro**, nunca de ordenação. Timestamp ordena mal por dois motivos
  independentes — empate no mesmo milissegundo e relógio da máquina ajustado para trás —, e o
  sentido descendente é o que fecha o terceiro: escrita nova só entra **acima** da janela já
  lida, nunca dentro dela. Ascendente pularia linha, porque transação com `seq` menor pode
  commitar depois de uma maior. Os índices seguem a ordenação: `(user_id, seq DESC)` e
  `(session_id, seq DESC)`.
- **A consulta nunca devolve conteúdo de arquivo** lido pela tool `Read` — a trilha guarda
  `path` e tamanho, e é isso que sai. É uma lista de permissão, não de negação: de uma `Read` saem
  só `file_path`, `offset`, `limit` e `pages`, os campos do `FileReadInput` do SDK. Toda outra tool sai
  com o `input` exato.
- **Retenção:** piso de **90 dias**, e o piso vive na trigger da tabela, não na intenção do
  código — ver [persistência](05-persistence.md#a-trilha-de-auditoria). A janela efetiva vem de
  configuração e só pode ser ≥ piso; valor abaixo **impede o processo de subir**.
- **Purga:** um job interno do backend, em intervalo configurado, apagando **por janela de
  tempo** e em lote — sem bloquear a escrita da trilha, que bloquearia a autorização. O
  subcomando manual chama a **mesma rotina de aplicação**, não uma segunda implementação, e a
  rotina roda sob advisory lock: duas purgas simultâneas sobre a mesma janela perdem lote. A
  purga é **ela mesma auditada** — janela, contagem e quem disparou (`job` ou `cli`). Operação
  que apaga trilha sem deixar rastro é o buraco óbvio do desenho.
- O job é desligável **por configuração, nunca por acidente**: desligado, o backend loga em
  `warn` no boot que a retenção passou a depender de alguém rodar o comando. Ligado, roda um minuto
  depois do boot e daí a cada intervalo ([03 · D-22](../../plans/03-rules-and-audit/decisions.md#d-22--o-job-o-botão-de-desligar-e-o-que-o-comando-lê)).
- **O que a purga varre:** as duas trilhas, `audit_entries` e `audit_events`, com a mesma janela e
  independentes — um lote recusado numa não impede a outra
  ([03 · D-20](../../plans/03-rules-and-audit/decisions.md#d-20--a-trilha-são-as-duas-tabelas)).
- **Como a purga se registra:** em `audit_purges`, uma linha por lote — execução, quem disparou,
  trilha, janela e contagem —, **gravada na mesma instrução que apaga o lote**: ou as linhas saem e o
  registro entra, ou nenhum dos dois. Lote que não apaga nada não deixa linha
  ([03 · D-19](../../plans/03-rules-and-audit/decisions.md#d-19--a-purga-se-registra-na-mesma-instrução-que-apaga)).
- **A porta própria:** `AuditRetentionStore`, ligada à purga e a nada mais — nem o repositório de
  escrita nem o leitor da trilha ganham como apagar. O job vive no `AuditModule`, que continua
  exportando só os dois use cases de escrita; `pnpm db purge` monta a mesma rotina pela mesma função
  (`createAuditPurge`).

---

## Criando um módulo novo

1. Ele tem **linguagem própria** e invariantes próprias? Se não, é submódulo de um existente.
2. Crie a fatia nas quatro camadas, mesmo que `domain/<x>/` comece pequeno.
3. Declare os barris `domain/<x>/index.ts` e `application/<x>/index.ts` com a superfície mínima.
4. Registre aqui, no catálogo e no diagrama de fronteiras.
5. Cadastre os erros no [catálogo de erros](../shared/04-errors-and-http.md).
6. Confira que não criou ciclo — `pnpm lint` reprova.

Módulo que nasce só com pasta em `adapter/` e nada em `domain/` provavelmente não é módulo:
é um adapter de um módulo existente.
