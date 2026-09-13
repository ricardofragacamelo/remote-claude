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
| `session.start` | `{ workspacePath, model?, permissionMode?, resumeSessionId? }` | abre sessão |
| `session.attach` | `{ sessionId }` | observa sessão existente |
| `session.detach` | `{ sessionId }` | para de observar |
| `session.prompt` | `{ sessionId, text, attachments? }` | envia um turno |
| `session.interrupt` | `{ sessionId }` | `query.interrupt()` |
| `session.setPermissionMode` | `{ sessionId, mode }` | troca o modo em execução |
| `session.setModel` | `{ sessionId, model }` | troca o modelo em execução |
| `session.close` | `{ sessionId }` | encerra e libera o subprocesso |
| `session.setLocale` | `{ locale }` | muda o idioma da connection |
| `permission.resolve` | *(é `response`, não command — ver abaixo)* | |

Todo comando recebe `ack` ou `error`. `ack` significa **aceito**, não **concluído** — o
resultado chega como `event`.

---

## Eventos (servidor → cliente)

Normalizados a partir do `SDKMessage` do Agent SDK. **Nunca emita `SDKMessage` cru** — ver
[ADR-006](00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru).

| `type` | Payload | Origem no SDK |
|---|---|---|
| `session.started` | `{ sessionId, workspacePath, model, permissionMode }` | `system:init` |
| `session.statusChanged` | `{ status }` — `idle`·`thinking`·`running`·`waitingPermission`·`closed` | derivado |
| `message.delta` | `{ messageId, delta }` | `stream_event` |
| `message.completed` | `{ messageId, role, content[] }` | `assistant` / `user` |
| `tool.started` | `{ toolUseId, toolName, input, title? }` | `assistant` (tool_use) |
| `tool.progress` | `{ toolUseId, chunk }` | `tool_progress` |
| `tool.completed` | `{ toolUseId, status, summary? }` | `user` (tool_result) |
| `permission.requested` | ver abaixo | `canUseTool` |
| `permission.resolved` | `{ requestId, decision, resolvedBy, auto }` | derivado |
| `turn.completed` | `{ turnId, usage, costUsd, durationMs }` | `result` |
| `session.closed` | `{ sessionId, reason }` | fim do generator |
| `error` | envelope de erro | qualquer falha |

**`seq` é obrigatório em todo `event`**, monotônico por sessão. É o que viabiliza o replay.

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
  "riskHint": "destructive",      // derivado no backend, para a UI decidir o destaque
  "defaultToNo": true,
  "suggestions": [ { "scope": "session", "label": "…" } ],
  "expiresAt": "2026-09-13T12:02:00.000Z"
}
```

Resposta:

```jsonc
{ "kind": "response", "type": "permission.resolve", "correlationId": "<id do request>",
  "payload": { "requestId": "req_...", "decision": "allow",
               "scope": "once",         // once | session | project | always
               "reason": "..." } }      // obrigatório quando decision = deny
```

### Regras não negociáveis

1. **Idempotência por `requestId`.** O SDK pode reentregar o mesmo request após um gap de
   transporte (`query.reinitialize()`). Segunda resolução do mesmo `requestId` é `ack`
   silencioso, nunca erro, nunca dupla execução.
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
- Ao reatar, o backend chama `query.reinitialize()` para recuperar permission requests
  órfãos — o SDK reentrega os que ficaram travados. Ver
  [descoberta §3.3](../../discovery/01-descoberta-claude-agent-sdk.md).
- Backoff de reconexão: exponencial com jitter, de 1 s a 30 s. Nunca reconecte em loop apertado.

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
| Enviar prompt | qualquer uma (serializado pelo backend; concorrente vira `409`) |
| Responder permissão | qualquer uma — vale a primeira |
| Interromper | qualquer uma |
| Fechar sessão | apenas o dono da sessão |

`resolvedBy` e `promptedBy` sempre identificam o autor, para a UI mostrar "aprovado no
celular por você há 2 min".

---

## Versionamento e geração de tipos

- `v` é **inteiro**. Muda quando quebra compatibilidade.
- Adicionar campo opcional ou evento novo **não** incrementa `v`. Cliente ignora o que não
  conhece — nunca quebre por campo desconhecido.
- Remover campo, renomear `type` ou mudar semântica **incrementa `v`**.
- O servidor suporta `v` atual e `v-1` durante uma janela de depreciação (o app publicado na
  loja não atualiza sozinho).

**Fonte da verdade:** `packages/contracts/`, em JSON Schema.
TypeScript (backend + web) importa o pacote; **Dart é gerado** a partir do mesmo schema.
Ver [ADR-007](00-decisions.md#adr-007--pnpm-workspaces-com-o-flutter-fora) e
[07-repository-layout.md](07-repository-layout.md).

Contrato alterado sem regenerar o Dart = build do mobile quebrado no CI. Por desenho.
