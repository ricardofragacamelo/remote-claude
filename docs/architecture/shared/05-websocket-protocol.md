# Protocolo WebSocket — o contrato

**Este é o documento mais importante do repositório.** É o contrato entre backend, web e
mobile. Mudança aqui é mudança nas três pontas, na mesma entrega.

Voltar para o [índice transversal](README.md).

---

## Por quê WebSocket

O fluxo central é **iniciado pelo servidor e bloqueante**: o Claude pergunta "posso executar
`rm -rf build/`?" e o loop do agente **para** até um humano responder. Isso é um round-trip
servidor → cliente → servidor, que SSE não faz.

HTTP continua existindo para o que é genuinamente request/response: autenticar, listar
workspaces, listar sessões, buscar transcript histórico. Ver
[ADR-005](00-decisions.md#adr-005--websocket-como-transporte-principal).

---

## Envelope

Todo frame, nos dois sentidos, tem esta forma:

```jsonc
{
  "v": 1,                     // versão do protocolo — obrigatório
  "id": "01J...",             // ULID único deste frame
  "kind": "command",          // command | event | request | response | error | ack
  "type": "session.start",    // o que é, dentro do kind
  "ts": "2026-09-13T12:00:00.000Z",
  "traceId": "9f2c1e5a-...",
  "sessionId": "sess_...",    // quando aplicável
  "correlationId": "01J...",  // id do frame que originou este
  "seq": 1421,                // só em event: monotônica por stream — sessão ou assinatura
  "payload": { }
}
```

### Os seis `kind`

| `kind` | Sentido | Espera resposta? | Uso |
|---|---|---|---|
| `command` | cliente → servidor | não (só `ack` ou `error`) | "inicie a sessão", "interrompa" |
| `event` | servidor → cliente | não | stream do que está acontecendo |
| `request` | **servidor → cliente** | **sim, obrigatório** | "posso usar esta tool?" |
| `response` | cliente → servidor | — | resposta a um `request` |
| `ack` | qualquer sentido | — | recebi e aceitei |
| `error` | qualquer sentido | — | ver [04-errors-and-http.md](04-errors-and-http.md) |

O `request` servidor→cliente é o que justifica todo o desenho. Trate-o como cidadão de
primeira classe, não como caso especial.

---

## Handshake

```
Cliente conecta em  wss://<host>/ws?v=1
  → envia  command  connection.authenticate  { token, locale, client: { kind, version, installId? } }
  ← recebe ack      connection.ready         { connectionId, serverVersion, limits }
```

`limits` diz o que o servidor aceita, para o cliente não descobrir apanhando:
`{ maxFrameBytes, maxFramesPerSecond, maxAttachedSessions, replayBufferSize }` — os três primeiros
vêm da configuração da instalação (`RC_WS_MAX_*`). Ver [Limites por connection](#limites-por-connection).

Regras:

- `token` é o **access token OIDC**, no corpo do frame. **Nunca** em query string — query
  string vaza em log de proxy. Ver [autenticação](08-authentication.md).
- Sem `connection.authenticate` em **5 segundos**, o servidor fecha com `4401`.
- Token inválido → fecha com `4401`. Não mande erro e mantenha o socket.
- **Expiração com o socket aberto não derruba a conexão.** O cliente renova e envia
  `connection.reauthenticate { token }`. Sem token válido até o fim do período de graça
  (60 s), fecha com `4401`.
- **`connection.reauthenticate` renova, não troca de usuário.** Token de outro `sub` → fecha com
  `4401`. Antes do `connection.authenticate` → `error` `UNAUTHENTICATED`, e o socket segue com a
  janela de handshake que tinha: aceitá-lo ali seria um handshake sem device, sem `installId` e sem
  locale.
- **`client.installId` identifica o aparelho daquele socket.** Ausente no navegador, que não é
  device; presente no app. É o que permite à revogação fechar **aquele** socket na hora — sem ele,
  um celular revogado continuaria respondendo permissão até o token expirar, ou seja, por até
  quinze minutos a revogação não revogaria nada.
- **O handshake recusa o device que não pode existir.** `installId` que não tem registro, ou que
  está **revogado**, fecha com `4401`. Device **pendente** conecta: observar sessão é permitido a
  quem ainda não decide, e esconder o stream dele transformaria "espere a aprovação" em "o app
  está quebrado". Ver [08-authentication](08-authentication.md#device-e-o-canal-mobile).
- **Revogação alcança socket aberto:** revogar device ou usuário fecha as connections dele
  imediatamente, com `4401`.
- `v` incompatível → fecha com `4426` e `payload.supportedVersions`.
- `locale` define o idioma **daquela connection** (não do usuário).

### Códigos de fechamento

| Código | Significa | Cliente deve |
|---|---|---|
| `1000` | Fechamento normal | não reconectar |
| `1001` | Servidor em shutdown | reconectar com backoff |
| `4400` | Violação de protocolo | **não** reconectar; é bug do cliente |
| `4401` | Falha de autenticação | renovar token e reconectar |
| `4408` | Idle timeout | reconectar |
| `4426` | Versão não suportada | avisar o usuário para atualizar o app |
| `4429` | Rate limit de conexão | reconectar, **não antes** do `retryAfterSeconds` do último `RATE_LIMITED` |

---

## Comandos (cliente → servidor)

| `type` | Payload | Efeito |
|---|---|---|
| `connection.authenticate` | `{ token, locale, client }` | handshake |
| `connection.reauthenticate` | `{ token }` | renova a credencial sem reabrir o socket |
| `diag.ping` | `{ sessionId?, nonce }` | diagnóstico do gateway: atravessa as camadas sem tocar no Agent SDK. Sem `sessionId`, abre uma sessão |
| `session.start` | `{ workspacePath, model?, permissionMode?, effort?, resumeSessionId?, forkAt? }` | abre sessão — ou continua uma conversa do histórico, com `resumeSessionId` (ver [Retomada](#retomada)); com `forkAt`, continua a partir de **antes** daquele prompt, sempre num id novo — o editar e reenviar ([08 · D-19](../../plans/08-claude-panel/decisions.md#d-19--editar-e-reenviar)) |
| `session.attach` | `{ sessionId }` | observa sessão existente |
| `session.detach` | `{ sessionId }` | para de observar |
| `session.prompt` | `{ sessionId, text, attachments? }` | envia um turno — ver [O contexto do prompt](#o-contexto-do-prompt--attachments) |
| `session.cancelQueuedPrompt` | `{ sessionId, queueId }` | tira da fila um prompt que ainda não começou — ver [A fila de prompts](#a-fila-de-prompts) |
| `session.interrupt` | `{ sessionId }` | `query.interrupt()` |
| `session.setPermissionMode` | `{ sessionId, mode }` | troca o modo em execução |
| `session.setModel` | `{ sessionId, model }` | troca o modelo em execução |
| `session.close` | `{ sessionId }` | encerra e libera o subprocesso |
| `session.setLocale` | `{ locale }` | muda o idioma da connection |
| `session.rewindFiles` | `{ sessionId, promptId, paths? }` | devolve os arquivos que a sessão escreveu ao estado de **antes** de um turno — com `paths`, só esses (rejeitar um arquivo) — ver [Desfazer arquivos](#desfazer-arquivos) |
| `session.rejectChange` | `{ sessionId, path, hunkId, revision }` | devolve **um trecho** do que a sessão mudou num arquivo ao estado de antes da sessão — ver [Desfazer arquivos](#desfazer-arquivos) |
| `session.restoreChange` | `{ sessionId, path }` | desfaz a última rejeição de um arquivo (de um trecho ou do arquivo inteiro), enquanto o arquivo ainda é o que a rejeição deixou — ver [Desfazer arquivos](#desfazer-arquivos) |
| `workspace.watch` | `{ workspacePath }` | passa a acompanhar as mudanças no disco de uma pasta aberta — ver [A pasta assistida](#a-pasta-assistida--workspace) |
| `workspace.unwatch` | `{ watchId }` | para de acompanhar; idempotente |
| `permission.extend` | `{ requestId }` | estende o prazo do pedido pendente. O cliente **não** escolha o número: incremento e teto vêm da configuração do backend |
| `permission.resolve` | *(é `response`, não command — ver abaixo)* | |

Todo comando recebe `ack` ou `error`. `ack` significa **aceito**, não **concluído** — o
resultado chega como `event`. O ack genérico é `command.accepted { command }`; `session.attach`
responde `session.attached { sessionId, replayed, oldestAvailableSeq, gap, claudeSessionId?, resumedFrom? }`
— e `session.start` também, quando retoma uma conversa que **já está viva** para o chamador
(ver [Retomada](#retomada)); `workspace.watch` responde `workspace.watching { watchId, workspacePath }`.

**Ordem garantida:** o `ack` sai antes de qualquer frame causado pelo comando. Um cliente nunca vê
o resultado antes de saber que o comando foi aceito.

---

## Eventos (servidor → cliente)

Normalizados a partir do `SDKMessage` do Agent SDK. **Nunca emita `SDKMessage` cru** — ver
[ADR-006](00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru).

| `type` | Payload | Origem no SDK |
|---|---|---|
| `session.started` | `{ sessionId, workspacePath, model, permissionMode, claudeSessionId, resumedFrom? }` | `system:init` |
| `session.statusChanged` | `{ status }` — `idle`·`thinking`·`running`·`waitingPermission`·`closed` | derivado |
| `message.delta` | `{ messageId, delta, blockType?, parentToolUseId? }` — `blockType`: `text`·`thinking` | `stream_event` |
| `message.completed` | `{ messageId, role, content[], promptedBy?, parentToolUseId? }` | `assistant` / `user` |
| `tool.started` | `{ toolUseId, toolName, input, title?, parentToolUseId? }` | `assistant` (tool_use) |
| `tool.progress` | `{ toolUseId, chunk, parentToolUseId? }` | `tool_progress` |
| `tool.completed` | `{ toolUseId, status, summary?, parentToolUseId?, taskId? }` — `succeeded`·`failed`·`denied`; `taskId` só de `TaskCreate`/`TaskUpdate` (a lista de tarefas, plano 08) | `user` (tool_result) |
| `permission.requested` | ver abaixo | `canUseTool` |
| `permission.resolved` | `{ requestId, decision, auto, resolvedBy?, resolvedFrom? }` | derivado |
| `turn.completed` | `{ turnId, usage, costUsd, durationMs, promptedBy? }` | `result` |
| `session.closed` | `{ sessionId, reason }` — `closedByUser`·`completed`·`failed`·`auditUnavailable`·`shutdown`·`idleTimeout` | fim do generator · TTL de ociosa (`idleTimeout`) · shutdown |
| `diag.pong` | `{ sessionId, pingedAt, pingCount, nonce }` | resposta do `diag.ping` |
| `permission.extended` | `{ requestId, expiresAt, remainingExtensions }` | derivado do `permission.extend` |
| `session.rewound` | `{ promptId, reverted[], preserved[], unchanged[], failed[], hunkId? }` | derivado do `session.rewindFiles`, do `session.rejectChange` (com `hunkId`) e do `session.restoreChange` |
| `session.compacted` | `{ trigger, preTokens? }` — `trigger`: `manual`·`auto` | `system:compact_boundary` |
| `prompt.queued` | `{ queueId, position, promptedBy, preview }` | a fila do backend |
| `prompt.dequeued` | `{ queueId, reason }` — `started`·`cancelled` | a fila do backend |
| `workspace.filesChanged` | `{ watchId, changes[{ path, kind, origin? }], overflow? }` — `kind`: `created`·`changed`·`deleted`; `origin`: `claude`·`user`·`external` | o watcher da pasta assistida |
| `workspace.watchStopped` | `{ watchId, reason }` — `allowlistChanged`·`folderDeleted`·`systemLimit` | o watcher da pasta assistida |
| `error` | envelope de erro | qualquer falha |

**`seq` é obrigatório em todo `event`**, monotônico **por stream** — uma sessão, ou uma assinatura
(a pasta assistida; o terminal do [plano 10](../../plans/10-integrated-terminal/README.md) reusa a
regra). Numa sessão é o que viabiliza o replay; numa assinatura **não há replay**. Um cliente nunca
mistura dois streams: o `seq` de uma assinatura não move o ponto de retomada de sessão nenhuma
([07 · D-07](../../plans/07-explorer-and-editor/decisions.md#d-07--o-transporte-da-mudança-e-o-seq-do-stream)).

### Dois ids: a sessão viva e a conversa

`sessionId` nomeia a **sessão viva** — um subprocesso e um stream, que morrem com ela.
`claudeSessionId` nomeia a **conversa** no store do Claude, que sobrevive a toda sessão que a
continuou: é por ela que o histórico é lido (`GET /transcripts/:claudeSessionId/messages`) e é ela
que uma retomada aceita como `resumeSessionId`. `resumedFrom` diz qual conversa a sessão continua,
quando é uma retomada — igual a `claudeSessionId` quando uma conversa **nossa** continua no mesmo
arquivo, diferente quando uma conversa começada fora é **bifurcada** num id novo. Ver
[backend/04 — Retomada](../backend/04-claude-integration.md#retomada--fork-fora-in-place-dentro).

`session.attached` repete os dois campos porque um `gap` é justamente quando o buffer já não guarda
o `session.started` que os disse. Ausentes para um stream que não é conversa (o `diag.*`).

### `diag.*` é diagnóstico, não sessão

O par nasceu como fatia vertical do bootstrap e **fica**: é o smoke mais barato do gateway
inteiro, e o único que não exige subprocesso do Claude. Vive fora do namespace de sessão de
propósito — `diag` diz que é diagnóstico, e o nome é o que impede a fatia de virar API pública
sem dono.

O bootstrap entregou o par como `session.ping`/`session.pong`; a renomeação foi feita na
[B-01 do plano 01](../../plans/01-live-session/F0-contract.md), nas três pontas na mesma entrega.
O nome antigo **não existe mais** no contrato — não há período de convivência, porque nada havia
sido construído em cima dele.

### Estender o prazo é mexer na única proteção que existe

O CLI **não** impõe timeout próprio: medido, uma permissão ficou 150 s pendurada sem que nada
desistisse ([descoberta §8.4](../../discovery/01-descoberta-claude-agent-sdk.md#84--o-cli-não-impõe-timeout-próprio-no-canusetool)).
O nosso é o único que existe, e por isso o contrato carrega **só o comando**:

- **valor e teto vêm da configuração** do backend, nunca do cliente. Web e app mandam
  `permission.extend` e recebem o novo `expiresAt`;
- extensão que chega depois de o pedido ter sido resolvido ou expirado é `error`, não no-op
  silencioso — `PERMISSION_REQUEST_NOT_FOUND` ou `PERMISSION_REQUEST_EXPIRED`;
- teto atingido responde `error`, e a UI mostra que não há mais extensão;
- as duas pontas podem estender o mesmo pedido: a operação é idempotente por `requestId`, e o
  `remainingExtensions` é o que a UI usa para não prometer o que não existe.

### Thinking e subagents

Dois campos opcionais, e nenhum muda o que um cliente antigo entende do resto
([08 · B-02](../../plans/08-claude-panel/F0-contract.md)):

- **`blockType: 'thinking'`** num `message.delta` diz que o fragmento é o raciocínio do modelo, não a
  resposta; ausente é `text`. No `message.completed`, o bloco é `{ type: 'thinking', thinking }` — o
  texto num campo **próprio**, nunca em `text`, para que um cliente que junta o `text` de cada bloco
  nunca o mostre como resposta — e `{ type: 'redacted_thinking' }` diz que houve raciocínio sem dizer
  qual. O web o mostra recolhido ([08 · D-17](../../plans/08-claude-panel/decisions.md#d-17--thinking));
  o app o descarta, e o `seq` dele anda do mesmo jeito. No log, só o tamanho.
- **`parentToolUseId`** em `message.*` e `tool.*` diz que o evento vem de um **subagent**: o
  `toolUseId` do `Task`/`Agent` que o abriu. O cliente o aninha ali; ausente é a conversa principal
  ([08 · D-15](../../plans/08-claude-panel/decisions.md#d-15--subagents-o-que-encaminhar)).

Um build anterior a estes campos mostraria o fragmento de thinking como texto enquanto ele chega — o
`message.completed` o corrige. Nenhum build publicado é anterior a eles (o
[plano 17](../../plans/17-distribution/README.md) não começou), e os dois clientes deste repositório
passam a lê-los na mesma entrega.

### A lista de tarefas — `TodoWrite` e `Task*`

Não há evento de lista: ela é **lida das tools** que o Claude chama, pelo nome — nunca pelo modelo
([plano 08 · D-25](../../plans/08-claude-panel/decisions.md#d-25--a-lista-de-tarefas-todowrite-ou-task)).
O backend abre o SDK com `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, e o CLI oferece uma de duas formas:

- `TodoWrite` — cada `tool.started` traz a lista **inteira** no `input.todos`;
- `TaskCreate`/`TaskUpdate` — incrementais. O `id` de uma tarefa nova só existe no resultado, e por
  isso o `tool.completed` delas leva o **`taskId`**: ao vivo, do resultado estruturado do SDK; no
  histórico, que o SDK devolve sem ele, do texto completo do resultado. `TaskGet` e `TaskList` só leem.

O cliente reduz as chamadas em ordem; uma chamada fora do formato, ou um `TaskUpdate` de um `taskId`
que a lista não tem, é uma tool como outra qualquer.

### O contexto do prompt — `attachments`

`session.prompt.attachments` é uma união por `kind`, com até **20** itens (`maxItems` do schema):

| `kind` | Campos | O que é |
|---|---|---|
| `file` — ou ausente, como era antes | `path`, `range?` `{ startLine, endLine }` | um arquivo, ou linhas dele, **dentro da pasta da sessão** |
| `folder` | `path` | uma pasta dentro da pasta da sessão |
| `upload` | `attachmentId` | o que `POST /sessions/:sessionId/attachments` respondeu: imagem, ou texto arrastado do desktop |
| `text` | `source` (`terminal`), `label` (≤ 200), `content` (≤ 16 384) | o que um provedor do cliente tem e a pessoa já vê — o terminal do [plano 10](../../plans/10-integrated-terminal/README.md) |

- **Arquivo e pasta são referência, nunca conteúdo.** O backend os confere na pasta da sessão — tudo
  ou nada — e compõe a referência num formato delimitado; o Claude os lê pelo `Read`, que o hook
  `PreToolUse` grava na trilha. Conteúdo colado no prompt seria leitura de arquivo que a trilha nunca
  viu ([08 · D-01](../../plans/08-claude-panel/decisions.md#d-01--como-a-menção-chega-ao-claude)).
- **`text` é a exceção declarada**: vai delimitado e rotulado pela origem, com teto — nunca como se a
  pessoa tivesse digitado.
- `range` conta linhas a partir de 1 (`minimum` do schema); `endLine` antes de `startLine` é recusado
  pelo backend com `INVALID_INPUT` — ordem entre dois campos não é limite de um.
- A imagem **não** viaja no frame: o frame tem 64 KB, e um print de tela não cabe
  ([08 · D-02](../../plans/08-claude-panel/decisions.md#d-02--imagem-no-prompt)).

### A fila de prompts

O prompt que chega durante um turno fica **no backend** até o turno terminar, e só então vai ao SDK —
um prompt entregue ao SDK não se tira mais ([08 · D-14](../../plans/08-claude-panel/decisions.md#d-14--a-fila-de-prompts)):

```
→ command  session.prompt         { sessionId, text: "e os testes?" }
← ack      command.accepted
← event    prompt.queued          { queueId: "q_01J…", position: 1, promptedBy, preview: "e os testes?" }
   … o turno em curso termina …
← event    prompt.dequeued        { queueId: "q_01J…", reason: "started" }
```

- Todo observador vê a mesma fila, e qualquer um tira um prompt dela com `session.cancelQueuedPrompt`
  (`prompt.dequeued` com `reason: cancelled`). O que já começou é `CONFLICT`
  (`session.error.queuedPromptStarted`); o que a fila não tem é `QUEUED_PROMPT_NOT_FOUND`.
- A ordem é a de chegada; tirar um prompt sobe os de trás uma posição.
- `preview` é o começo do texto (120 caracteres), cortado no backend — o prompt inteiro é do turno,
  quando ele roda. `promptedBy` é o **tipo** de cliente que mandou (`web`·`mobile`), nunca quem: a fila é
  de uma sessão de um dono só.
- Cancelar de novo o que já saiu por cancelamento é `ack` sem efeito; a sessão que fecha leva a fila
  junto, sem `prompt.dequeued`.

---

## O fluxo de permissão

O coração do sistema.

```
Claude quer usar Bash
   │
   ▼
Backend: canUseTool() é chamado — o loop do agente BLOQUEIA
   │
   ├─► event   permission.requested   (para TODAS as connections que observam)
   │
   ├─► push    (para os devices registrados, se ninguém estiver online)
   │
   ▼
Backend aguarda  ─────────► timeout (default 120 s) ──► deny automático
   │
   ◄── response  permission.resolve  { requestId, decision, scope? }
   │
   ├─► event   permission.resolved   (para TODAS as connections — inclusive quem respondeu)
   │
   ▼
canUseTool() retorna { behavior: 'allow' | 'deny' } — o loop destrava
```

Payload de `permission.requested`:

```jsonc
{
  "requestId": "req_...",        // idempotência é por ESTE campo
  "toolUseId": "toolu_...",
  "toolName": "Bash",
  "title": "Run shell command",
  "description": "rm -rf build/",
  "input": { "command": "rm -rf build/" },
  "riskHint": "destructive",      // read | write | destructive — derivado no backend
  "defaultToNo": true,
  "suggestions": [
    { "scope": "once",    "labelKey": "permission.scope.once" },
    { "scope": "session", "labelKey": "permission.scope.session" },
    { "scope": "project", "labelKey": "permission.scope.project",
      "pattern": "Bash(rm -rf build/)", "lifetimeMs": 7776000000 },
    { "scope": "always",  "labelKey": "permission.scope.always",
      "pattern": "Bash(rm -rf build/)", "lifetimeMs": 7776000000 }
  ],
  "expiresAt": "2026-09-13T12:02:00.000Z"
}
```

`labelKey` e não `label`: o servidor **nunca** manda prosa, nem dentro de uma sugestão. Ver
[i18n](02-i18n.md).

**`project` e `always` chegam com a regra que deixariam** — `pattern`, o padrão mais estreito que
cobre esta invocação e o mesmo que a resposta grava, e `lifetimeMs`, a validade default da
instalação, contada a partir da resposta. É o que deixa a tela dizer o alcance por extenso antes de
alguém escolher, sem um segundo matcher no cliente nem um "90 dias" escrito à mão
([03 · D-12](../../plans/03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta)).
Invocação sem padrão possível não recebe as duas sugestões, e `project` exige workspace. O cliente
que recebe um escopo persistido sem um dos dois campos **não** o oferece.

Resposta:

```jsonc
{ "kind": "response", "type": "permission.resolve", "correlationId": "<id do request>",
  "payload": { "requestId": "req_...", "decision": "allow",
               "scope": "once",         // once | session | project | always
               "reason": "..." } }      // obrigatório quando decision = deny
```

A obrigatoriedade condicional do `reason` é **do schema**, não de validação espalhada pelo
código — ver [campo obrigatório por condição](#campo-obrigatório-por-condição).

### Regras não negociáveis

1. **Idempotência por `requestId`.** Múltiplos clientes observam a mesma sessão, e o cliente
   pode reenviar após reconectar. Segunda resolução do mesmo `requestId` é `ack` silencioso,
   nunca erro, nunca dupla execução.
2. **Primeira resposta vence.** Web e mobile podem responder ao mesmo tempo. A segunda
   recebe `ack` e o evento `permission.resolved` com o `resolvedBy` real.
3. **Timeout nega.** Expirou → `deny` com `PERMISSION_REQUEST_EXPIRED`. Silêncio nunca
   autoriza.
4. **`deny` exige `reason`.** Vai para a auditoria e volta ao Claude como mensagem.
5. **Toda decisão é auditada** — quem, quando, de qual device, qual foi o input exato.

**Saber o estado de um pedido é HTTP, não socket.** Quem chega por um push não espera o replay do
`session.attach` para descobrir se o pedido ainda existe: pergunta em
`GET /sessions/:sessionId/permissions/:requestId`, que responde pendente (com o payload acima),
resolvido (com os campos de `permission.resolved`), `410`, `404` ou `403`. Responder continua
sendo o `permission.resolve` deste contrato. Ver
[backend/03](../backend/03-modules.md#permission) e
[02 · D-22](../../plans/02-mobile-approval/decisions.md#d-22--revalidar-é-perguntar-não-esperar).

---

## Retomada

`session.start` com `resumeSessionId` continua uma conversa do histórico. `workspacePath` é o `cwd`
da conversa — ela é procurada **dentro** desse workspace, e é por ele que o SDK acha o arquivo.

| Situação | Resposta |
|---|---|
| a conversa pode ser continuada | `command.accepted` e depois `session.started` de uma sessão **nova** — `seq` recomeça em 1 —, com `claudeSessionId` e `resumedFrom` |
| `forkAt` que não é prompt da conversa | `error` `INVALID_INPUT` (`session.error.forkPointUnknown`) |
| o CLI recusou o ponto de fork | `error` `SESSION_FORK_REJECTED` (`409`) — a tela oferece a retomada simples, sem repetir o fork |
| a conversa já está **viva para o chamador** (em sessão aberta ou retomada por ele) | `session.attached { sessionId, replayed: 0, gap: false, claudeSessionId, resumedFrom? }` da sessão viva — **retomar o que está vivo é attach**, nunca um segundo subprocesso. A conexão já fica anexada; a tela que segue faz o próprio `session.attach` para o replay |
| duas retomadas da mesma conversa chegam juntas | uma `query()` só: a primeira abre, a segunda recebe o `session.attached` |
| workspace fora da allowlist | `error` `WORKSPACE_NOT_ALLOWED` (`403`) |
| conversa inexistente, de outro workspace, sem `cwd`, ou aberta aqui por outra pessoa | `error` `SESSION_NOT_FOUND` (`404`) — a mesma resposta, de propósito |
| id que não é UUID | `error` `INVALID_INPUT` (`transcript.error.invalidSessionId`) |
| instalação no limite | `error` `SESSION_LIMIT_REACHED` (`params.limit`, `params.retryAfterSeconds`) |

O cliente reconhece a resposta à **sua** retomada por um de três frames: `session.started` ou
`session.attached` cujo `claudeSessionId` ou `resumedFrom` é a conversa pedida, ou `error` cujo
`correlationId` é o `id` do comando. O histórico anterior à retomada vem do transcript (HTTP), nunca
do ring buffer — que só guarda o que esta sessão disse.

**O cliente tem prazo para a resposta: 30 s.** O backend sempre responde — sessão, junção ou
recusa —, então silêncio é resposta perdida com o socket. Passado o prazo, a tela para de esperar,
mostra `RESUME_TIMEOUT` (chave `session.error.resumeTimeout`, gerada no cliente) e deixa tentar de
novo; resposta antes do prazo o cancela ([plano 05 · B-26](../../plans/05-hardening-operations/F0-limits.md)).

---

## Slash commands

O menu vem da **instalação**, nunca de uma lista nossa: `GET /sessions/:sessionId/commands`
(Bearer) pergunta ao `supportedCommands()` da sessão viva. É HTTP e não comando, pela mesma razão
do estado de um pedido de permissão — é uma pergunta com resposta, não um fato do stream.

```jsonc
{ "cliVersion": "2.1.277",          // do binário que o SDK spawnou; null antes do primeiro turno
  "commands": [
    { "name": "init", "description": "…", "argumentHint": "", "aliases": [], "suggested": true }
  ] }
```

| Status | Quando |
|---|---|
| `200` | a lista, **sem** os internos (`__`) e os mortos (`(removed)`, `Renamed to`) — filtrados por metadado, no backend, uma vez; os sugeridos primeiro, na ordem do ranking, e os demais por nome |
| `400` `INVALID_INPUT` | `sessionId` que não é um |
| `403` / `404` | sessão de outra pessoa / sessão que não está viva |
| `502` `CLAUDE_UNAVAILABLE` / `504` `CLAUDE_TIMEOUT` | o SDK falhou ou não respondeu no prazo — **a caixa de prompt continua utilizável**: o menu é descoberta, não fronteira |

Disparar o comando é mandar o texto como prompt (`session.prompt { text: "/init" }`), e ele passa
pelo fluxo normal de permissão. Comando que **não existe** na instalação — nem como nome nem como
alias, incluídos os que o menu esconde — é recusado antes de chegar ao Claude:
`error` `INVALID_INPUT` (`session.error.unknownCommand`, `params.command`), com `correlationId` do
`session.prompt`. Lista indisponível não recusa nada: o prompt segue. Ver
[backend/04 — Slash commands](../backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd).

---

## Desfazer arquivos

Dois passos, porque confirmação sem lista é confirmação sem informação.

**1. O alcance — `GET /sessions/:sessionId/checkpoints`** (Bearer). Os pontos de desfazer da
sessão viva (e, numa retomada in-place, das sessões anteriores da mesma conversa), mais novo
primeiro, cada um com o que aconteceria **agora** a cada arquivo — diff nosso entre o snapshot, o
que a sessão deixou e o que está no disco:

```jsonc
{ "checkpoints": [
  { "promptId": "…", "label": "refatore o parser",   // o prompt do turno; null se não houve
    "at": "2026-09-26T12:00:00.000Z",
    "files": [
      { "path": "/…/a.ts", "outcome": "revert",   "action": "restore" },   // ou "delete"
      { "path": "/…/b.ts", "outcome": "preserve", "reason": "modifiedOutside" },
      { "path": "/…/c.ts", "outcome": "unchanged" }
    ] } ] }
```

`400` para id malformado, `403`/`404` como acima.

**2. O desfazer — `session.rewindFiles { sessionId, promptId }`.** Os arquivos voltam ao estado
de **antes** do turno `promptId`: todo caminho que esse turno **ou um posterior** tocou, cada um
ao snapshot do primeiro desses turnos que o tocou.

| Situação | Resposta |
|---|---|
| desfez | `command.accepted` e depois `session.rewound` para todos que observam, com `reverted`, `preserved` (com motivo), `unchanged` e `failed` |
| algum arquivo não pôde ser restaurado | o mesmo `session.rewound`, com o caminho em `failed`, seguido de `error` `INTERNAL_ERROR` (`session.error.rewindIncomplete`, `params.failed`) — nenhum arquivo fica pela metade |
| um turno está em execução, ou outro desfazer da mesma sessão está em curso | `error` `SESSION_LOCKED` (`session.error.locked`, `params.reason`: `turnRunning`·`rewindRunning`) |
| sessão encerrada ou inexistente | `error` `SESSION_NOT_FOUND` |
| `promptId` que não é ponto de desfazer desta sessão | `error` `INVALID_INPUT` (`session.error.rewindTargetUnknown`) |
| trilha indisponível | `error` `INTERNAL_ERROR` — **nada** foi tocado: desfazer sem rastro não acontece |

**A trava vale nos dois sentidos.** Enquanto um desfazer devolve os arquivos, `session.prompt` é
recusado com `SESSION_LOCKED` (`reason: rewindRunning`) — um turno que começasse ali leria um disco
pela metade ([plano 05 · B-27](../../plans/05-hardening-operations/F0-limits.md)).

**Rejeitar um arquivo é o desfazer com `paths`.** `session.rewindFiles { sessionId, promptId, paths }`
faz o mesmo cálculo, só para os caminhos pedidos — o `UndoPlanner` já decide cada um sozinho, então
filtrar é reusar o mesmo cálculo, com as mesmas garantias; caminho que o desfazer não alcança
simplesmente não é tocado ([08 · D-08](../../plans/08-claude-panel/decisions.md#d-08--rejeitar-por-arquivo-e-por-trecho)).

**Rejeitar um trecho é `session.rejectChange { sessionId, path, hunkId, revision }`.** Os trechos são
calculados no backend entre o snapshot de antes da sessão e o disco **agora**
(`GET /sessions/:sessionId/changes/file`), e só quando o disco ainda tem o que a sessão deixou — senão o
arquivo é `modifiedOutside` e só se rejeita inteiro, preservando-o. `revision` é o hash do disco no
cálculo: mudou, `SESSION_CHANGE_STALE` (`409`). O resultado é o mesmo `session.rewound`, com `hunkId`,
e as mesmas travas (`SESSION_LOCKED`) e a mesma trilha antes do disco. O mesmo trecho reenviado com a
mesma `revision`, já aplicado, responde `unchanged` e não escreve de novo. Rejeitar o último trecho de um
arquivo que a sessão criou o apaga. A rejeição passa a ser a linha de base da sessão — o arquivo continua
"como a sessão deixou", e outros trechos dele ainda se rejeitam.

**Desfazer uma rejeição é `session.restoreChange { sessionId, path }`** — o "desfazer em vez de
confirmar" da [08 · D-08](../../plans/08-claude-panel/decisions.md#d-08--rejeitar-por-arquivo-e-por-trecho).
A rejeição (de trecho ou de arquivo, pelo `session.rewindFiles` com `paths`) guarda em memória, com a
sessão viva, o conteúdo que substituiu; desfazer o devolve, byte a byte, enquanto o arquivo ainda tem o
hash que a rejeição deixou — senão `SESSION_CHANGE_STALE`; sem rejeição a desfazer, `NOT_FOUND`
(`session.error.changeNotFound`). Mesmas travas, trilha antes do disco (`session.filesRewound` com
`details.restoredRejection`), e o resultado é um `session.rewound` com o arquivo em `reverted`.

Os caminhos das alterações são **absolutos**, como os do desfazer: é o que o `session.rewindFiles` com
`paths`, o `session.rejectChange` e o `session.restoreChange` recebem, e o que
`GET /sessions/:sessionId/changes` devolve. Caminho de `paths` que o ponto não alcança é recusado com
`INVALID_INPUT` (`session.error.rewindPathUnknown`) — nunca ignorado em silêncio.

Motivos de `preserved`: `modifiedOutside` (alguém alterou depois da sessão), `notRestorable`
(grande demais ou ilegível para snapshot), `unsafePath` (virou link, deixou de ser arquivo regular,
ou o diretório deixou de resolver) e `noBaseline` (nada registra como a sessão o deixou). Ver
[backend/04 — Desfazer arquivos](../backend/04-claude-integration.md#desfazer-arquivos--o-store-é-nosso).

---

## A pasta assistida — `workspace.*`

O explorer e o editor precisam saber quando o disco muda — o Claude escreve o tempo todo. A mudança
chega por **assinatura** no socket que já existe ([07 · D-07](../../plans/07-explorer-and-editor/decisions.md#d-07--o-transporte-da-mudança-e-o-seq-do-stream)):

```
→ command  workspace.watch     { workspacePath: "/srv/projects/app" }
← ack      workspace.watching  { watchId: "w_01J…", workspacePath: "/srv/projects/app" }
← event    workspace.filesChanged  seq 1  { watchId, changes: [{ path: "src/a.ts", kind: "changed", origin: "claude" }] }
← event    workspace.filesChanged  seq 2  { … }
```

- **`seq` é do `watchId`**, começa em 1 e não tem relação com sessão nenhuma. O frame não leva
  `sessionId`. O `workspace.watchStopped` é o último frame do stream e leva o `seq` seguinte.
- **O `ack` vem antes de tudo.** Nada do `watchId` chega antes do `workspace.watching`; o que mudou
  antes dele o cliente vê ao carregar a árvore.
- **Mesmo cliente, mesma pasta:** um segundo `workspace.watch` da mesma connection para a mesma pasta
  (pelo caminho real) devolve o **mesmo** `watchId` — um único `unwatch` o encerra.
- **Sem replay.** O que importa depois de uma queda é o disco **agora**, que uma recarga dá melhor
  que mil eventos reencaminhados: a reconexão refaz o `workspace.watch` (novo `watchId`, `seq` do 1)
  e recarrega a árvore por HTTP.
- **`origin` rotula, não decide**: é o que o servidor consegue dizer de quem mudou — uma escrita do
  Claude (ouvida pelo barramento interno, `session.fileStateRecorded`), da pessoa pelas rotas de
  `files`, ou outra coisa. Ausente quando não sabe.
- **`overflow: true`** é "mudou mais do que o evento carrega": o cliente recarrega em vez de remendar.
  Também é o que recebe uma connection que ficou para trás (o socket acumulou demais): as mudanças
  que não couberam viram um `overflow` só, quando ela alcança.
- **Cliente que nunca pede, ignora.** O app Flutter não tem explorer nem editor; recebe os tipos
  gerados e, se um frame `workspace.*` chegar, o descarta sem deixar o `seq` dele tocar o ponto de
  retomada da sessão aberta (plano 07, B-05).
- Os limites do [plano 05](../../plans/05-hardening-operations/README.md) valem para os comandos
  novos; o teto de assinaturas por connection é `WATCH_LIMIT_REACHED`, e o sistema que recusa mais
  watches é `WATCH_UNAVAILABLE` com `retryAfterSeconds`.

O comportamento do watcher — o que é assistido, a coalescência, a liberação garantida — é da
[F3 do plano 07](../../plans/07-explorer-and-editor/F3-file-watch.md); este é o contrato.

---

## Reconexão e replay

O backend mantém um **ring buffer dos últimos 1000 eventos por sessão**.

```
Cliente reconecta
  → command  session.attach  { sessionId, resumeFromSeq: 1420 }
  ← ack      { replayed: 12, oldestAvailableSeq: 900, gap: false }
  ← event    seq 1421, 1422, …
```

- **A tela que abre uma sessão manda `resumeFromSeq: 0`**, nunca o campo ausente: é o maior `seq`
  que ela tem, e zero traz tudo o que o buffer guarda — ou o `gap` que a manda ao transcript, quando
  o buffer já perdeu o começo. **Sem o campo, o backend não reenvia nada**: é observar daqui em
  diante. Uma tela que omitisse o zero abriria a sessão começada no navegador mostrando só o que
  veio depois (plano 04, S-88).
- `resumeFromSeq` menor que `oldestAvailableSeq` → `gap: true`. O cliente **descarta o
  estado local e recarrega o transcript por HTTP** — da conversa que o ack nomeia em
  `claudeSessionId`. Não tente costurar buraco. A página recarregada é **posta por baixo** do que o
  stream trouxer enquanto ela carrega, casando por `messageId` e `toolUseId`, com o stream por
  cima: recarregar com o stream chegando não duplica mensagem, e o histórico não entra na
  numeração de `seq`.
- Ao reatar, o backend republica os permission requests ainda pendentes a partir do registro
  do módulo `permission` — a `Promise` do `canUseTool` nunca foi perdida, só ficou sem quem
  respondesse. Ver [ADR-012](00-decisions.md#adr-012--reconexão-não-usa-reinitialize-o-registro-de-pendentes-é-nosso).
- Backoff de reconexão: exponencial com jitter, de 1 s a 30 s. Nunca reconecte em loop apertado.
- **O buffer sobrevive ao encerramento da sessão** — até o restart do processo, ou até o ring
  reciclar. Abrir uma sessão já encerrada mostra o estado terminal (motivo, hora) **e** o replay
  do que ainda houver, que o cliente **rotula como parcial**. Sem o rótulo, ausência de conteúdo
  é lida como ausência de atividade, o que é pior do que não mostrar nada. Os dois ramos são
  reais: buffer presente e buffer perdido — o segundo é o que acontece depois de todo restart do
  backend. Histórico de verdade é transcript, não replay.

---

## Heartbeat

- Servidor envia `ping` a cada **30 s**; sem `pong` em **10 s**, fecha com `4408`.
- O cliente **não** implementa ping próprio — usa o do protocolo WebSocket.
- Mobile em background: o socket cai, e é esperado. É por isso que existe push notification.
- O heartbeat se mantém com o cliente mandando frames sem parar — heartbeat que atrasa sob carga
  derruba conexão saudável ([plano 05 · S-60](../../plans/05-hardening-operations/scenarios.md)).

## Limites por connection

Anunciados no `connection.ready.limits`; configurados por instalação.

| Limite | Estourou | Reincidiu |
|---|---|---|
| `maxFramesPerSecond` — frames que o cliente manda por segundo, contados antes de decodificar | `error` `RATE_LIMITED`, `params: { scope: 'frames', limit, retryAfterSeconds }`; o socket fica | outro frame dentro de `retryAfterSeconds` → fecha com `4429` |
| `maxFrameBytes` — tamanho do frame | `error` `PAYLOAD_TOO_LARGE`; o socket fica | — |
| `maxAttachedSessions` — sessões que a connection observa | `session.attach`/`session.start` recusado com `error` `RATE_LIMITED` (`scope: 'attachedSessions'`) **antes** de qualquer subprocesso; reanexar uma sessão já anexada passa | — |

`retryAfterSeconds` viaja nos `params` porque frame WebSocket não tem cabeçalho — é o `Retry-After`
do WebSocket. Os clientes o guardam e, fechados com `4429`, não voltam antes dele — e, enquanto
esperam, a conexão fica num estado próprio, **`throttled`**, com o motivo dito na tela: "a rede
caiu" e "isto foi mandado rápido demais" são coisas diferentes para quem olha
([plano 05 · S-43, S-81](../../plans/05-hardening-operations/scenarios.md)).

---

## Multi-cliente na mesma sessão

N connections podem observar 1 sessão. Todas recebem **todos** os eventos.

| Ação | Quem pode |
|---|---|
| Observar eventos | toda connection com `session.attach` |
| Enviar prompt | qualquer uma — um prompt que chega durante um turno é **enfileirado** e roda em seguida, como faz a UI do Claude Code ([R-02](../../plans/00-bootstrap/progress.md#decisões-tomadas-durante-a-execução)); a fila é do backend, e todas veem a mesma ([A fila de prompts](#a-fila-de-prompts)) |
| Tirar prompt da fila | qualquer uma — `session.cancelQueuedPrompt` |
| Responder permissão | qualquer uma — vale a primeira |
| Interromper | qualquer uma |
| Fechar sessão | apenas o dono da sessão |

`resolvedBy` e `promptedBy` identificam o autor, para a UI mostrar "aprovado no celular por você
há 2 min". Eles viajam **no evento resultante**, não no comando: `promptedBy` em
`message.completed` (papel `user`) e em `turn.completed`; `resolvedBy` em `permission.resolved`,
ao lado de `resolvedFrom`, que diz de qual cliente veio a resposta.

A exceção é a decisão automática — prazo vencido, ou regra de escopo `session` que já valia.
Nela não há autor, e é por isso que `resolvedBy` é obrigatório **apenas quando `auto` é
`false`**. Turno sem autor visível é pior do que turno com autor "sistema": some a informação de
que ninguém decidiu aquilo.

---

## Versionamento e geração de tipos

- `v` é **inteiro**. Muda quando quebra compatibilidade.
- Adicionar campo opcional ou evento novo **não** incrementa `v`. Cliente ignora o que não
  conhece — nunca quebre por campo desconhecido.
- Remover campo, renomear `type` ou mudar semântica **incrementa `v`**.
- O servidor suporta `v` atual e `v-1` durante uma janela de depreciação (o app publicado na
  loja não atualiza sozinho).

### Campo obrigatório por condição

Duas regras do contrato não são "este campo é obrigatório", e sim "este campo é obrigatório
**quando**":

| Onde | Regra | Por quê |
|---|---|---|
| envelope | `seq` é obrigatório quando `kind` é `event` | replay é construído sobre `seq`; evento sem ele é um buraco que ninguém detecta depois |
| `permission.resolve` | `reason` é obrigatório quando `decision` é `deny` | a razão vai para a auditoria e volta ao Claude como mensagem |
| `permission.resolved` | `resolvedBy` é obrigatório quando `auto` é `false` | decisão que um humano tomou tem autor; só a negação automática não tem |
| `session.prompt.attachments[]` | `path` quando `kind` é `file`, `folder` **ou ausente**; `attachmentId` quando é `upload`; `source`, `label` e `content` quando é `text` | cada tipo de contexto se nomeia de um jeito; o ausente é o anexo de arquivo que existia antes dos tipos |
| `session.start` | `resumeSessionId` é obrigatório quando `forkAt` está **presente** | um ponto de fork é uma mensagem de uma conversa, e só a retomada tem uma |

Elas vivem **no schema**, na extensão `x-required-when`, e o gerador as emite nos dois alvos — em
TypeScript como uma cláusula dentro do guard, em Dart como um predicado ao lado da classe:

```jsonc
"x-required-when": [
  { "field": "reason",
    "when": { "field": "decision", "equals": "deny" },
    "because": "a razão vai para a auditoria e volta ao Claude como mensagem" }
]
```

O gatilho é `equals` (um valor), `absent: true` (o campo que decide está ausente) ou
`present: true` (está presente) — um dos três, nunca dois. O `because` é obrigatório: regra que
ninguém consegue revisar é regra que ninguém mantém.

### Limites de campo

Três limites também vivem no schema, pelo mesmo motivo — `maxItems` (lista), `maxLength` (texto) e
`minimum` (inteiro) — e o gerador recusa um limite que o tipo não honraria (`maxLength` num inteiro) ou
que nenhum guard conferiria (um limite nos itens de uma lista de escalares). Em TypeScript, cada um é
uma cláusula do guard (`withinMaxItems`, `withinMaxLength`, `atLeast`) e uma constante exportada
(`SESSION_PROMPT_PAYLOAD_LIMITS`, …) que o validador do backend lê em vez de repetir o número; em Dart,
um predicado `…LimitsHold` ao lado da classe. Campo ausente passa: se ele pode faltar é pergunta do
obrigatório e do condicional.

**Por que não validar isso em cada ponta.** Uma regra escrita à mão em três linguagens é uma
regra que vale em duas delas — e a que fica para trás é sempre a que ninguém compila junto. O
gerador recusa uma condição sobre campo não declarado, sobre campo já obrigatório (nunca
dispararia) e sem `because`.

---

**Fonte da verdade:** `packages/contracts/`, em JSON Schema.
TypeScript (backend + web) importa o pacote; **Dart é gerado** a partir do mesmo schema.
Ver [ADR-007](00-decisions.md#adr-007--pnpm-workspaces-com-o-flutter-fora) e
[07-repository-layout.md](07-repository-layout.md).

Contrato alterado sem regenerar o Dart = build do mobile quebrado no CI. Por desenho.
