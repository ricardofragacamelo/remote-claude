# F4 — Mídia no resultado de tool

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-backend-notices.md), com a fixture `mcp-media-result-turn` da [F0](F0-spike.md).
**Entrega:** a imagem, o `resource` e o `resource_link` do resultado de tool chegam às duas pontas
pelo `tool.completed.attachments[]`, sem bytes no WS, e a rota de imagem do histórico serve a imagem
aninhada no resultado.

---

## Por quê

Hoje o `resultText` só lê texto
([discovery §5](../../discovery/09-perdas-do-backend-na-conversa.md#5-perdas-dentro-da-mensagem-de-usuário)):
a imagem que uma tool MCP devolve some, sem log (U-04). Bytes nunca trafegam no WS (princípio 6): a
imagem vai como marcador e é buscada pela rota, como a imagem do prompt
([plano 22 · D-09](../22-live-history/decisions.md)).

Vem depois da F3 porque mexe no mesmo `fromUser`, e separada dela porque também mexe na rota HTTP e
no índice do histórico.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-14 — Os anexos do `tool_result` 🔲

Dentro do `tool_result`:

- `image` vira `attachments[]` `kind: 'image'`, com um `blockId` de três níveis
  (`<uuid>:<índice>:<sub-índice>`), porque a imagem está aninhada no bloco;
- `resource` de texto entra no resumo e na saída inteira, com o URI como cabeçalho;
- `resource_link` vira `kind: 'link'`, com `uri` e `title`. O backend não julga o esquema do URI: quem
  decide se vira link é o cliente (F6);
- bloco de tipo que o adapter não conhece vira `kind: 'unknown'` com o `type`, e uma linha de `warn`.

O `tool_use_result` estruturado do MCP continua ignorado ([README · Não entra](README.md#não-entra)).
Cenários S-53…S-58.

### B-15 — A rota serve a imagem aninhada 🔲

`GET /transcripts/:engine/:id/images/:blockId` (a rota por `engine` e `id` da conversa, desde a
[F1 do plano 28](../28-agent-neutral-core/F1-engine-port.md)) aceita o `blockId` de três níveis, e o
índice do `transcript-contents.ts` (em `adapter/outbound/engines/claude/`) passa a olhar dentro do
`tool_result`, também na cadeia de subagent. Os erros são os que a rota já tem
([04-errors-and-http](../../architecture/shared/04-errors-and-http.md)): `NOT_FOUND`,
`UNSUPPORTED_MEDIA_TYPE` e `PAYLOAD_TOO_LARGE`. A rota é descrita em
[05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) e em
[backend/03-modules](../../architecture/backend/03-modules.md), que mudam na mesma entrega.
Cenários S-59…S-62.

---

## Cenários cobertos

S-53…S-62.

---

## Critério de conclusão

```bash
pnpm verify
```
