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
  "seq": 1421,                // só em event: sequência monotônica por sessão
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
  → envia  command  connection.authenticate  { token, locale, client: { kind, version } }
  ← recebe ack      connection.ready         { connectionId, serverVersion, limits }
```

Regras:

- `token` é o **access token OIDC**, no corpo do frame. **Nunca** em query string — query
  string vaza em log de proxy. Ver [autenticação](08-authentication.md).
- Sem `connection.authenticate` em **5 segundos**, o servidor fecha com `4401`.
- Token inválido → fecha com `4401`. Não mande erro e mantenha o socket.
- **Expiração com o socket aberto não derruba a conexão.** O cliente renova e envia
  `connection.reauthenticate { token }`. Sem token válido até o fim do período de graça
  (60 s), fecha com `4401`.
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
| `4429` | Rate limit de conexão | reconectar após `Retry-After` |

---

## Comandos (cliente → servidor)

| `type` | Payload | Efeito |
|---|---|---|
| `connection.authenticate` | `{ token, locale, client }` | handshake |
| `connection.reauthenticate` | `{ token }` | renova a credencial sem reabrir o socket |
| `diag.ping` | `{ sessionId?, nonce }` | diagnóstico do gateway: atravessa as camadas sem tocar no Agent SDK. Sem `sessionId`, abre uma sessão |
| `session.start` | `{ workspacePath, model?, permissionMode?, resumeSessionId? }` | abre sessão |
| `session.attach` | `{ sessionId }` | observa sessão existente |
| `session.detach` | `{ sessionId }` | para de observar |
| `session.prompt` | `{ sessionId, text, attachments? }` | envia um turno |
| `session.interrupt` | `{ sessionId }` | `query.interrupt()` |
| `session.setPermissionMode` | `{ sessionId, mode }` | troca o modo em execução |
| `session.setModel` | `{ sessionId, model }` | troca o modelo em execução |
| `session.close` | `{ sessionId }` | encerra e libera o subprocesso |
| `session.setLocale` | `{ locale }` | muda o idioma da connection |
| `permission.extend` | `{ requestId }` | estende o prazo do pedido pendente. O cliente **não** escolha o número: incremento e teto vêm da configuração do backend |
| `permission.resolve` | *(é `response`, não command — ver abaixo)* | |

Todo comando recebe `ack` ou `error`. `ack` significa **aceito**, não **concluído** — o
resultado chega como `event`. O ack genérico é `command.accepted { command }`; `session.attach`
responde `session.attached { sessionId, replayed, oldestAvailableSeq, gap }`.

**Ordem garantida:** o `ack` sai antes de qualquer frame causado pelo comando. Um cliente nunca vê
o resultado antes de saber que o comando foi aceito.

---

## Eventos (servidor → cliente)

Normalizados a partir do `SDKMessage` do Agent SDK. **Nunca emita `SDKMessage` cru** — ver
[ADR-006](00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru).

| `type` | Payload | Origem no SDK |
|---|---|---|
| `session.started` | `{ sessionId, workspacePath, model, permissionMode }` | `system:init` |
| `session.statusChanged` | `{ status }` — `idle`·`thinking`·`running`·`waitingPermission`·`closed` | derivado |
| `message.delta` | `{ messageId, delta }` | `stream_event` |
| `message.completed` | `{ messageId, role, content[], promptedBy? }` | `assistant` / `user` |
| `tool.started` | `{ toolUseId, toolName, input, title? }` | `assistant` (tool_use) |
| `tool.progress` | `{ toolUseId, chunk }` | `tool_progress` |
| `tool.completed` | `{ toolUseId, status, summary? }` — `succeeded`·`failed`·`denied` | `user` (tool_result) |
| `permission.requested` | ver abaixo | `canUseTool` |
| `permission.resolved` | `{ requestId, decision, auto, resolvedBy?, resolvedFrom? }` | derivado |
| `turn.completed` | `{ turnId, usage, costUsd, durationMs, promptedBy? }` | `result` |
| `session.closed` | `{ sessionId, reason }` — `closedByUser`·`completed`·`failed`·`auditUnavailable`·`shutdown` | fim do generator |
| `diag.pong` | `{ sessionId, pingedAt, pingCount, nonce }` | resposta do `diag.ping` |
| `permission.extended` | `{ requestId, expiresAt, remainingExtensions }` | derivado do `permission.extend` |
| `error` | envelope de erro | qualquer falha |

**`seq` é obrigatório em todo `event`**, monotônico por sessão. É o que viabiliza o replay.

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
  "suggestions": [ { "scope": "session", "labelKey": "permission.scope.session" } ],
  "expiresAt": "2026-09-13T12:02:00.000Z"
}
```

`labelKey` e não `label`: o servidor **nunca** manda prosa, nem dentro de uma sugestão. Ver
[i18n](02-i18n.md).

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

---

## Reconexão e replay

O backend mantém um **ring buffer dos últimos 1000 eventos por sessão**.

```
Cliente reconecta
  → command  session.attach  { sessionId, resumeFromSeq: 1420 }
  ← ack      { replayed: 12, oldestAvailableSeq: 900, gap: false }
  ← event    seq 1421, 1422, …
```

- `resumeFromSeq` menor que `oldestAvailableSeq` → `gap: true`. O cliente **descarta o
  estado local e recarrega o transcript por HTTP**. Não tente costurar buraco.
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

---

## Multi-cliente na mesma sessão

N connections podem observar 1 sessão. Todas recebem **todos** os eventos.

| Ação | Quem pode |
|---|---|
| Observar eventos | toda connection com `session.attach` |
| Enviar prompt | qualquer uma — um prompt que chega durante um turno é **enfileirado** e roda em seguida, como faz a UI do Claude Code ([R-02](../../plans/00-bootstrap/progress.md#decisões-tomadas-durante-a-execução)) |
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

Elas vivem **no schema**, na extensão `x-required-when`, e o gerador as emite nos dois alvos — em
TypeScript como uma cláusula dentro do guard, em Dart como um predicado ao lado da classe:

```jsonc
"x-required-when": [
  { "field": "reason",
    "when": { "field": "decision", "equals": "deny" },
    "because": "a razão vai para a auditoria e volta ao Claude como mensagem" }
]
```

O `because` é obrigatório: regra que ninguém consegue revisar é regra que ninguém mantém.

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
