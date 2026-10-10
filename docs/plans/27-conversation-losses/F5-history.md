# F5 — Histórico

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-tool-media.md), com o que a B-01 mediu do JSONL.
**Entrega:** o histórico mostra o mesmo que o ao vivo mostrou: as entradas `system` são lidas e
passam pelas mesmas funções do ao vivo, e compactação e aviso têm id estável, sem duplicar nem
sobrescrever.

---

## Por quê

O histórico perde por dois motivos, não um
([discovery §6](../../discovery/09-perdas-do-backend-na-conversa.md#6-perdas-do-histórico)): o adapter
chama `getSessionMessages` sem `includeSystemMessages`, e o `historicalEvents` devolve `[]` para todo
`system`. Corrigir só o segundo não muda nada na tela.

Vem depois das F3 e F4 porque reaproveita as funções delas: o histórico passa pelo `fromSystem`, como o
plano 22 fez com `assistant` e `user` (princípio 4).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-16 — Ler as mensagens de sistema 🔲

O `transcript.adapter.ts` do adapter do Claude (em `adapter/outbound/engines/claude/`, desde a
[F1 do plano 28](../28-agent-neutral-core/F1-engine-port.md)) chama `getSessionMessages` com
`includeSystemMessages: true`. O custo que a B-01 mediu fica como teto num teste de integração, e o
cache por versão do plano 22 (o `transcript-reads.ts`, no mesmo lugar) continua valendo (R-03). Cenários S-63, S-64.

### B-17 — O histórico pelas funções do ao vivo 🔲

O `historicalEvents` deixa de devolver `[]` para `system`: cada subtipo do JSONL que a B-01 achou é
mapeado para o **mesmo** evento do ao vivo. O que não tiver par vai para a linha `unknown` da B-13, e
deixa de sumir sem log (U-03). Para cada fixture da F0, a sequência de eventos do histórico é igual à
do ao vivo, conferida pelo `scripted-transcripts`. Cenários S-65…S-67.

### B-18 — Ids estáveis 🔲

O `session.compacted` sai com o `compactionId` (o `uuid` do `compact_boundary`), e o aviso com o
`noticeId`, ao vivo, no replay e no `transcript.appended`. A linha de compactação cai no lugar da
cadeia que o SDK reconstrói depois do `/compact` (o `compactedChain` do
[scripted-transcripts.ts](../../../backend/test/fakes/agent-sdk/scripted-transcripts.ts)), o mesmo em
que caiu ao vivo. Cenários S-68…S-71.

---

## Cenários cobertos

S-63…S-71.

---

## Critério de conclusão

```bash
pnpm verify
```
