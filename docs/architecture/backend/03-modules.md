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
| `audit` | Trilha imutável de **toda** invocação de tool, via hook `PreToolUse` | Autorizar |

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
  - Raiz que **existe e não é do usuário** responde `WORKSPACE_NOT_FOUND` (404), nunca 403:
    403 confirma a existência de um caminho que o usuário não deveria saber que existe.
- **Erros:** `WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`
- **Nota:** esta é a primeira linha de defesa do sistema. A regra é pura, sem I/O, e tem
  cobertura mínima de 90 %. Ver [01-clean-architecture.md](01-clean-architecture.md).

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
- **Erros:** `SESSION_NOT_FOUND`, `SESSION_LOCKED`,
  `SESSION_LIMIT_REACHED`, `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`
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
    é a mesma gramática que volta ao SDK em `updatedPermissions`, e sintaxe própria faria as duas
    metades casarem conjuntos diferentes de comando
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
- **Erros:** `PERMISSION_REQUEST_NOT_FOUND`, `PERMISSION_REQUEST_EXPIRED`, `PERMISSION_NOT_OWNED`,
  `PERMISSION_RULE_PATTERN_INVALID`, `PERMISSION_RULE_EXPIRY_TOO_LONG`
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

### `notification`

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
- **Falha do provedor é `warn`, sem segundo canal.** O pedido continua válido no web e o timeout
  continua decidindo no silêncio. O preço está dito: push que falha com ninguém no navegador
  deixa a permissão esperar o prazo inteiro sem ninguém saber.
- **Token recusado pelo provedor é apagado, e o device continua aprovado** — ele volta a receber
  quando o app abrir. Revogar o device cobraria nova aprovação pelo web a cada rotação de token
  do SO. O app reenvia o token a cada renovação, e reenviar o mesmo token não duplica linha.
- O nome do provedor **não sai da configuração** — nem em log, nem em tipo, nem em nome de
  classe.

### `audit`

- **Fonte dos eventos:** o hook **`PreToolUse`**, não o `canUseTool`. O hook dispara para
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
- **Escopo de leitura:** cada usuário lê a própria trilha. Trilha de outro responde `404`, não
  `403` — 403 confirma a existência do que o requisitante não deveria saber que existe.
- **Ordenação e paginação:** cursor **keyset descendente** sobre `seq`, o sequencial próprio da
  tabela; `at` é coluna de **filtro**, nunca de ordenação. Timestamp ordena mal por dois motivos
  independentes — empate no mesmo milissegundo e relógio da máquina ajustado para trás —, e o
  sentido descendente é o que fecha o terceiro: escrita nova só entra **acima** da janela já
  lida, nunca dentro dela. Ascendente pularia linha, porque transação com `seq` menor pode
  commitar depois de uma maior. Os índices seguem a ordenação: `(user_id, seq DESC)` e
  `(session_id, seq DESC)`.
- **A consulta nunca devolve conteúdo de arquivo** lido pela tool `Read` — a trilha guarda
  `path` e tamanho, e é isso que sai.
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
  `warn` no boot que a retenção passou a depender de alguém rodar o comando.

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
