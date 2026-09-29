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
| `workspace` | Diretórios: allowlist, validação, listagem, metadados de git | Rodar nada dentro deles |
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
                    │              │
                    ▼              ▼
                transcript       audit ◄──── (todos escrevem)
```

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
- **Erros:** `SESSION_NOT_FOUND`, `SESSION_LOCKED`,
  `SESSION_LIMIT_REACHED`, `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`, `INVALID_INPUT`
  (`session.error.unknownCommand`, `session.error.rewindTargetUnknown`), `INTERNAL_ERROR`
  (`session.error.rewindIncomplete`)
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
- **A listagem é por workspace da allowlist**, um `listSessions({ dir })` por vez — nunca
  `listSessions({})`. A mesma cerca que vale para executar vale para ler: o store tem
  transcript de todo projeto da máquina, inclusive os que ninguém liberou.
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
  `lastModified`. O cursor é keyset sobre `(lastModified, sessionId)` descendente: conversa escrita
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
  depois de um `gap` com um redutor só.
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
  (`session.resumed`, `session.forked`) —, tabela irmã com a mesma disciplina: `seq` que ordena enquanto `at` filtra, ULID
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
- **A leitura é um módulo Nest à parte** (`AuditQueryModule`), com porta própria
  (`AuditTrailReader`) e o controller: nenhum módulo que escreve na trilha recebe como lê-la, e o
  `AuditModule` continua exportando só os dois use cases de escrita.
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
