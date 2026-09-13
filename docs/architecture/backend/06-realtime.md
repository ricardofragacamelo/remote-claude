# Tempo real — gateway WebSocket

Implementa, do lado do servidor, o
[contrato WebSocket](../shared/05-websocket-protocol.md). **Leia o contrato primeiro** —
aqui está só como o backend o cumpre.

Voltar para o [índice do backend](README.md).

---

## Peças

```
src/infrastructure/websocket/
├── app.gateway.ts             @WebSocketGateway — conexão, handshake, roteamento
├── connection-registry.ts     connectionId → socket, user, sessões observadas
├── session-hub.ts             fan-out: 1 sessão → N connections
├── event-buffer.ts            ring buffer de 1000 eventos por sessão (replay)
├── frame-codec.ts             parse/serialize + validação contra o schema
└── heartbeat.service.ts       ping/pong, 30 s / 10 s

src/adapter/inbound/ws/<domínio>/
└── <domínio>.gateway-handler.ts   traduz comando → use case
```

**O gateway não contém regra.** Ele autentica, valida o frame, encontra o handler e chama o
use case. Se apareceu `if` de negócio no gateway, ele pertence a `application/` ou `domain/`.

---

## Handshake

```
conexão aberta
   → 5 s para receber  command connection.authenticate
   → valida token (módulo auth) · resolve locale · registra no ConnectionRegistry
   ← ack  connection.ready  { connectionId, serverVersion, limits }
```

Sem autenticação no prazo, ou token inválido: fecha com `4401`. **Não** mantenha socket
não autenticado vivo esperando.

Versão de protocolo incompatível: fecha com `4426` e `supportedVersions` no payload.

---

## Fan-out

Uma sessão do Claude tem **um** loop `for await` produzindo eventos, e **N** connections
consumindo (web no desktop, app no celular, outra aba).

```
SessionRunner (for await do Agent SDK)
        │
        ▼  mapper: SDKMessage → evento do contrato
   SessionHub.publish(sessionId, event)
        │
        ├─► atribui seq (monotônico por sessão)
        ├─► grava no EventBuffer (ring de 1000)
        └─► emite para toda connection inscrita naquela sessão
```

Regras:

- **`seq` é atribuído no hub**, em um ponto só. Duas fontes numerando = replay quebrado.
- Publicação é **fire-and-forget** por connection: socket lento ou morto **não** pode
  segurar o loop do Agent SDK. Falha de envio → remove a connection e loga `warn`.
- Backpressure: se a fila de uma connection passa do limite, ela é desconectada com `1013`.
  O cliente reconecta e faz replay. É preferível a estourar memória do servidor.

---

## Ring buffer e replay

`EventBuffer` guarda os últimos **1000** eventos por sessão, em memória.

```
session.attach { sessionId, resumeFromSeq: 1420 }
  │
  ├─ resumeFromSeq >= oldestAvailableSeq → replay de 1421 em diante  → gap: false
  └─ resumeFromSeq <  oldestAvailableSeq → ack com gap: true
                                            (cliente recarrega o transcript por HTTP)
```

- O buffer é **volátil**: morre com o processo. Reinício do backend = `gap: true` para todos.
  É aceitável — o transcript persistente é a fonte de verdade.
- Não tente costurar buraco parcial. `gap: true` e o cliente recarrega do zero.

---

## Comandos

```ts
@SubscribeMessage('session.prompt')
async handlePrompt(client: Socket, frame: Frame<SessionPromptPayload>) {
  // 1. frame validado contra o JSON Schema de packages/contracts (pipe)
  // 2. autorização: esta connection pode agir nesta sessão?
  // 3. chama o use case
  // 4. ack — aceito, NÃO concluído
}
```

`ack` significa **aceito**. O resultado chega como `event`. Nunca faça o cliente esperar o
`ack` para saber o resultado — isso reintroduz request/response onde escolhemos stream.

Erro de comando responde `error` com `correlationId` e **não derruba o socket**. Só fecha o
que torna a conexão inútil: `4401` (auth) e `4400` (violação de protocolo).

---

## O round-trip de permissão

É o único caso em que o **servidor** manda `request` e espera `response`.

```
canUseTool bloqueia o loop
   │
   ▼  PermissionRequest criado (módulo permission)
   ├─► hub emite  event  permission.requested  (todas as connections da sessão)
   ├─► se nenhuma connection online → módulo notification dispara push
   │
   ▼  aguarda: primeira response vence · timeout 120 s nega · signal cancela
   │
   ├─► hub emite  event  permission.resolved   (todas, inclusive quem respondeu)
   └─► canUseTool retorna e o loop destrava
```

Detalhes de idempotência e das regras não negociáveis:
[04-claude-integration.md](04-claude-integration.md#a-ponte-de-permissão) e
[o contrato](../shared/05-websocket-protocol.md#o-fluxo-de-permissão).

---

## Autorização por connection

Estar conectado não basta. Cada comando verifica:

| Ação | Quem pode |
|---|---|
| `session.attach` | connection cujo usuário tem acesso à sessão |
| `session.prompt` | qualquer connection anexada (serializado — concorrente vira `409`) |
| `permission.resolve` | qualquer connection anexada — vale a primeira |
| `session.close` | apenas o dono da sessão |

Toda ação carrega o autor (`promptedBy`, `resolvedBy`) no evento resultante, para a UI
mostrar "aprovado no celular há 2 min" — e para a auditoria.

---

## Heartbeat e limites

- Servidor pinga a cada **30 s**; sem pong em **10 s**, fecha com `4408`.
- Limites por connection, configuráveis: frames/segundo, tamanho de frame, sessões anexadas.
  Estourou → `error` com `RATE_LIMITED`; reincidência → `4429`.
- Mobile em background perde o socket. **Isso é esperado** — é a razão de existir o push.

---

## Shutdown

`onModuleDestroy` precisa ser ordeiro, porque cada sessão é um subprocesso real:

1. Para de aceitar conexão nova.
2. Emite `session.closed { reason: 'serverShutdown' }` para todas as sessões.
3. Fecha os sockets com `1001` (cliente reconecta com backoff).
4. `query.close()` em **toda** sessão viva.
5. Drena o pool do banco.

Pular o passo 4 deixa processo do CLI órfão na máquina do usuário.

---

## Logging

Todo frame, nos dois sentidos, em `debug` — ver [logging](../shared/03-logging.md):

| `op` | Campos obrigatórios |
|---|---|
| `ws.inbound` | `connectionId`, `kind`, `type`, `traceId`, payload truncado |
| `ws.outbound` | idem + `seq` quando for `event` |
| `ws.connection` | `connectionId`, `userId`, `deviceId`, `closeCode` |

Nunca logue o token do handshake. Ver a lista de redação em
[logging](../shared/03-logging.md#redação-o-que-nunca-vai-para-o-log).
