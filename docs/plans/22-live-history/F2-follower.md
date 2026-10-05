# F2 — Seguidor no backend

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-mapping.md).
**Entrega:** um cliente assina uma conversa que este backend não opera e recebe, por push, as entradas que o
transcript ganhou depois da última que ele tem, com a `activity` e o `working` inferido; reset quando a cadeia é
reescrita; uma sondagem por conversa, compartilhada e adaptativa; tetos; e o custo medido.

**Decisões que precisam estar fechadas para começar:** D-11…D-13 ([decisions.md](decisions.md#f2--seguidor-no-backend)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-14 — `transcriptTail` 🔲

Função pura em `domain/transcript/services`: dadas as entradas da cadeia e um `afterMessageId` (ou `null`),
devolve a cauda depois dele, ou "fora da cadeia" — que vira `transcript.reset { reason: 'rewritten' }`.
Sem framework, sem I/O ([backend/01](../../architecture/backend/01-clean-architecture.md)).

### B-15 — `inferWorking` 🔲

Função pura ao lado da `transcript-activity.ts`: a regra da
[proposta §5.6](../../propostas/historico-ao-vivo-e-fiel.md#56-trabalhando-em-outro-cliente). `true` só com
`activeElsewhere` e última entrada que deixa o turno aberto (`tool_use` sem resultado, `thinking`, prompt sem
resposta); `false` em qualquer outro caso ([D-12](decisions.md#f2--seguidor-no-backend)).

### B-16 — `TranscriptFollower` 🔲

Em `application/transcript` (`FollowTranscriptUseCase`): o registro de assinaturas **por conversa**; o tick
pelo `Scheduler` (porta que já existe), com o intervalo da [D-11](decisions.md#f2--seguidor-no-backend)
conforme a `activity`; a cada tick, `getSessionInfo` e, só se o `lastModified` mudou, a releitura pelo
`TranscriptCache` e pelo `ReadLimiter` ([transcript-reads.ts](../../../backend/src/adapter/outbound/claude/transcript-reads.ts));
a cauda de cada assinante pela B-14, com o `working` da B-15; `seq` por `followId`.

Regras: o primeiro envio é tudo depois do `afterMessageId` (sem lacuna); o mesmo cercado do
`ReadTranscriptUseCase` (resposta igual à de id inexistente); `liveHere` é recusado com
`TRANSCRIPT_FOLLOW_LIVE_HERE`; conversa que some é `reset: 'gone'`; os tetos de conexão e total com
`TRANSCRIPT_FOLLOW_LIMIT`; conversa sem assinante para o tick; falha de um tick é logada e o seguinte tenta de
novo. Só a cadeia principal ([D-13](decisions.md#f2--seguidor-no-backend)).

### B-17 — O handler WS 🔲

`adapter/inbound/ws/transcript`: valida `transcript.follow` e `transcript.unfollow` pelos schemas, chama o caso
de uso, responde o ack **antes** de qualquer envio, e solta todas as assinaturas da conexão no `disconnect`.
`unfollow` é idempotente. Ver [backend/06-realtime](../../architecture/backend/06-realtime.md).

### B-18 — Configuração e log 🔲

As variáveis da [D-11](decisions.md#f2--seguidor-no-backend) em `infrastructure/config`, com padrão e
validação, e no `.env.example`. Log `debug` em toda borda: assinatura, tick (hit/miss do cache), envio
(contagem de eventos, nunca o conteúdo), reset e soltura ([shared/03-logging](../../architecture/shared/03-logging.md)).

### B-19 — A medição 🔲

`scripts/transcript-follow-bench.mjs`: pelo Agent SDK, só leitura, mede `getSessionInfo` e
`getSessionMessages` no maior transcript do store de quem roda e com 4 conversas acompanhadas ao mesmo tempo;
imprime tempo e heap, nunca conteúdo. O resultado (e qualquer mudança nos valores) entra na
[D-11](decisions.md#f2--seguidor-no-backend) e no `progress.md`. Entra no catálogo de comandos do README.

---

## Cenários cobertos

S-40…S-73.

---

## Critério de conclusão

```bash
pnpm verify
```
