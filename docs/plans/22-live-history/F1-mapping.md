# F1 — Mapeamento e leituras

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md).
**Entrega:** o backend envia, ao vivo e no histórico, cada bloco com identidade, o instante de cada entrada, o
título da ferramenta, o resumo da saída pela cauda e em texto, e a imagem do prompt como marcador; a página diz
até onde vai; duas rotas novas entregam a saída completa e a imagem, sob demanda; e as duas pontas deduplicam
por `blockId`.

**Decisões que precisam estar fechadas para começar:** D-05…D-10 ([decisions.md](decisions.md#f1--mapeamento-e-leituras)).

**Por que antes do seguidor:** o que o seguidor envia é o mesmo evento do histórico. Sem o `blockId`, juntar a
página com os envios perde blocos (dois pensamentos omitidos "iguais") ou os duplica
([proposta §5.5](../../propostas/historico-ao-vivo-e-fiel.md#55-o-que-o-cliente-faz-com-o-que-chega)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-06 — `blockId` em cada bloco, e `at` no histórico ✅

Em `backend/src/adapter/outbound/claude/sdk-message.mapper.ts` (`toContentBlock`, `assistantEvents`,
`historicalEvents`): o `blockId` da [D-06](decisions.md#f1--mapeamento-e-leituras), e o `at` = o `timestamp` da
entrada nos eventos do histórico. No `transcript.dto.ts`, os campos novos. O buffer de replay da sessão viva
leva o `blockId` como os outros campos.

### B-07 — O título da ferramenta ✅

No ponto do `tool.started` do mapper: `title` = `input.description` quando é texto não vazio
([D-05](decisions.md#f1--mapeamento-e-leituras)). Ao vivo e no histórico, pelo mesmo caminho.

### B-08 — O resumo da saída, em texto e pela cauda ✅

`summarise` passa a usar o `resultText` que o mapper já tem (junta os textos de um `tool_result` em lista) e a
guardar as últimas linhas, com o tamanho da [D-07](decisions.md#f1--mapeamento-e-leituras). Vale ao vivo, no
histórico e no buffer de replay; o `summary` continua curto.

### B-09 — O bloco de imagem como marcador ✅

`toContentBlock` envia, para `image`, o `mediaType` e o `size` (bytes decodificados do base64), e **nunca** os
dados. Imagem por URL sai sem `size`. É o que a B-12 serve sob demanda ([D-09](decisions.md#f1--mapeamento-e-leituras)).

### B-10 — `lastMessageId` na página ✅

`ReadTranscriptUseCase` e `transcript.dto.ts`: a página de `GET /transcripts/:sessionId/messages` diz qual é a
última entrada da cadeia — é o `afterMessageId` do `transcript.follow`. A ordem continua a do SDK (S-21).

### B-11 — A saída completa de uma ferramenta ✅

`TranscriptStore.toolResult(session, toolUseId)` (porta + `transcript.adapter.ts`) acha o `tool_result` na
lista que o `TranscriptCache` já tem — nada de arquivo. `ReadToolResultUseCase` aplica o cercado do
`ReadTranscriptUseCase` (`audience.shown`) e o teto da [D-08](decisions.md#f1--mapeamento-e-leituras), e o
controller em `adapter/inbound/http/transcript` expõe a rota. Log `debug` com id, tamanho e `truncated`, nunca
o conteúdo, como o `Read` já faz.

### B-12 — A imagem de um prompt ✅

`TranscriptStore.promptImage(session, blockId)` acha o bloco na lista em cache; `ReadPromptImageUseCase` aplica
o mesmo cercado, o teto e a lista de tipos da [D-10](decisions.md#f1--mapeamento-e-leituras); a rota devolve o
binário com os cabeçalhos da decisão. A variável `RC_TRANSCRIPT_IMAGE_MAX_BYTES` (e a
`RC_TRANSCRIPT_TOOL_RESULT_MAX_BYTES` da B-11) entram na config e no `.env.example`.

### B-13 — Deduplicação por `blockId`, nas duas pontas ✅

No redutor do web ([conversation-reducer.ts](../../../web/src/features/session/services/conversation-reducer.ts))
e na `Conversation` do app ([conversation.dart](../../../mobile/lib/features/session/domain/entities/conversation.dart)):
um bloco é descartado só se o mesmo `blockId` já foi visto; sem `blockId`, a regra de hoje. A junção do
histórico com a sessão viva (`withHistory`) continua por `messageId` (R-07, S-38).

---

## Cenários cobertos

S-08…S-39.

---

## Critério de conclusão

```bash
pnpm verify
```
