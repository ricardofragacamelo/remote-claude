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

### B-14 — Os anexos do `tool_result` ✅

Dentro do `tool_result`:

- `image` vira `attachments[]` `kind: 'image'`, com um `blockId` de três níveis
  (`<uuid>:<índice>:<sub-índice>`), porque a imagem está aninhada no bloco;
- `resource` de texto entra no resumo e na saída inteira, com o URI como cabeçalho;
- `resource_link` vira `kind: 'link'`, com `uri` e `title`. O backend não julga o esquema do URI: quem
  decide se vira link é o cliente (F6);
- bloco de tipo que o adapter não conhece vira `kind: 'unknown'` com o `type`, e uma linha de `warn`.

O `tool_use_result` estruturado do MCP continua ignorado ([README · Não entra](README.md#não-entra)).
Cenários S-53…S-58.

**Como ficou:** a B-01 (sonda da F0) já tinha medido, com a fixture real `mcp-media-result-turn`, que
o CLI **achata** `resource` e `resource_link` em blocos de **texto** antes de a mensagem chegar ao
adapter (`[Resource from fixture at …] …`, `[Resource link: …] …`) — nenhum dos dois chega como bloco
estruturado. Essa é a confirmação que faltava para o `tool_result`'s `ToolResultBlockParam` do SDK
(`TextBlockParam | ImageBlockParam | SearchResultBlockParam | DocumentBlockParam |
ToolReferenceBlockParam | BrowserStateBlockParam`) também não lista `resource`/`resource_link` como
tipo próprio. Então:

- a S-54 já vale **sem** código novo — o texto achatado já entra no resumo e na saída pela leitura de
  texto que já existia; um teste prova isso contra a fixture real;
- a S-55 muda de "vira anexo `link`" para "**não** vira anexo — o texto basta", e o `scenarios.md` foi
  ajustado para registrar essa mudança, não para escondê-la;
- `image` é o único bloco que de fato precisava de um anexo novo, e os tipos que o SDK permite num
  `tool_result` e não são `text`/`image` (`search_result`, `document`, `tool_reference`,
  `browser_state`) caem todos na regra de sobrevivência — `kind: 'unknown'` com o `type`, nunca
  silenciosos (D-03). A fixture real tem um `tool_reference` (a busca de ferramenta diferida) e prova
  esse caminho sem precisar de um bloco inventado.

O `warn` não está na mensagem já existente de "variante não mapeada" (`MappedMessage.unknown`, da
B-13): aquele campo é especificamente "a mensagem inteira não foi mapeada", e aqui a mensagem **é**
mapeada — só um bloco dela não. Um campo novo, `unknownAttachment`, carrega esse aviso à parte, com a
própria linha de log (`'unknown tool_result block'`), para não confundir os dois.

### B-15 — A rota serve a imagem aninhada ✅

`GET /transcripts/:engine/:id/images/:blockId` (a rota por `engine` e `id` da conversa, desde a
[F1 do plano 28](../28-agent-neutral-core/F1-engine-port.md)) aceita o `blockId` de três níveis, e o
índice do `transcript-contents.ts` (em `adapter/outbound/engines/claude/`) passa a olhar dentro do
`tool_result`, também na cadeia de subagent. Os erros são os que a rota já tem
([04-errors-and-http](../../architecture/shared/04-errors-and-http.md)): `NOT_FOUND`,
`UNSUPPORTED_MEDIA_TYPE` e `PAYLOAD_TOO_LARGE`. A rota é descrita em
[05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) e em
[backend/03-modules](../../architecture/backend/03-modules.md), que mudam na mesma entrega.
Cenários S-59…S-62.

**Como ficou:** a imagem da cadeia principal entra no mesmo índice de sempre
(`TranscriptContents.images`, por `sessionId` + `lastModified`, até 2 conversas) — só ganhou um
terceiro nível de busca dentro do bloco de resultado. A de um subagent **não** entra nesse índice: o
`promptImage` só procura nos subagents quando a cadeia principal não tem o `blockId`, listando e lendo
os subagents da conversa (o mesmo custo de abrir o card do subagent) sem cache própria — uma
conversa com muitos subagents paga uma busca linear a cada imagem nunca vista antes. Aceitável porque
o caminho só roda uma vez por imagem nova (depois o card já leu as mensagens e a próxima pergunta pelo
mesmo id, se houver, é sobre um bloco já visitado); se um dia pesar, cabe uma cache por subagent igual
à que `subagentMessages` já tem. A mesma busca (listar + ler cada subagent) já existia em
`subagentMessages`; foi fatorada para `findInSubagents` para não duplicar — o portão de duplicação
(limiar zero) pegou a primeira versão com as duas cópias lado a lado.

O `blockIdSchema` (zod) ganhou um terceiro segmento opcional; o de dois segmentos (imagem de prompt)
continua igual, sem mudança de comportamento (S-62).

---

## Cenários cobertos

S-53…S-62.

---

## Critério de conclusão

```bash
pnpm verify
```
