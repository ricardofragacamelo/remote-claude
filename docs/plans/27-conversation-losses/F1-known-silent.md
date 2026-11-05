# F1 — Conhecidos e calados

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-spike.md).
**Entrega:** a lista dos eventos do servidor que **não** são conversa, numa fonte só do contrato,
gerada para TS e Dart e adotada pelos dois clientes. O comportamento não muda: o que é desconhecido
continua ignorado até a F6.

---

## Por quê

A F6 troca "cliente ignora o que não conhece" por "mostra uma linha, se for da conversa"
([D-02](decisions.md#normas)). Sem saber quais eventos não são conversa, a regra nova desenharia uma
linha a cada `session.mcpStatusChanged`, que hoje cai no caminho do desconhecido nas duas pontas
([discovery §7.4](../../discovery/09-perdas-do-backend-na-conversa.md#74-evento-ws-desconhecido-cliente)).

A lista vem **antes**, e em fase própria, porque o app da loja fica atrás do backend: uma versão do app
que já conhece a lista é o que permite à regra nova sair depois sem quebrá-lo (R-05).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-03 — A classificação dos eventos no contrato ✅

Todo evento servidor → cliente do schema de `packages/contracts` ganha uma classe: **conversa** (muda a
linha do tempo) ou **calado** (estado de tela, `workspace.*`, `transcript.*`, `diag.*`,
`session.mcpStatusChanged`…). A geração emite a lista para o `protocol.ts` e para o `protocol.g.dart`,
e os dois clientes leem a mesma, nunca uma cópia à mão.

O `contracts:check` (portão 11) reprova evento sem classe e evento nas duas. A classificação entra
no [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente),
na tabela de eventos. Cenários S-05…S-07.

**Como ficou:** 8 eventos conversa (`message.delta`, `message.completed`, `tool.started`,
`tool.progress`, `tool.completed`, `turn.completed`, `session.compacted`, `session.rewound` — todos os
que hoje mudam `Conversation.timeline` no web) e 15 calados (os demais — `session.started`,
`session.statusChanged`, `session.tasksChanged` e `session.closed` incluídos: têm leitor próprio no
reducer, mas mudam `status`/`taskList`/`ending`, nunca a linha do tempo). `error` e
`permission.requested` não são `x-kind: event` — não carregam `x-timeline`, e o gerador recusa se
carregarem. `x-timeline` entrou no `METADATA` e na validação de `scripts/lib/contracts-model.mjs`
(`TIMELINE_CLASSES`), com `SILENT_EVENT_TYPES`/`silentEventTypes` emitidos ao fim do `protocol.ts` e
do `protocol.g.dart`.

### B-04 — Os dois clientes adotam a lista ✅

O web (`readEvent` do [conversation-reducer.ts](../../../web/src/features/session/services/conversation-reducer.ts))
e o app (`_eventOf` do [session_event_mapper.dart](../../../mobile/lib/features/session/data/mappers/session_event_mapper.dart))
passam a separar três casos: evento com leitor, evento calado da lista, e o resto. Os dois primeiros
fazem o que fazem hoje. O terceiro também, por ora (o `seq` avança, nada na tela): a F6 é que o
desenha. O caminho separado existe para a F6 só trocar o terceiro ramo. Log `debug` em cada ramo.
Cenários S-08, S-09.

**Como ficou:** o web guarda `SILENT_EVENT_TYPES` num `Set` e separa os três ramos dentro de
`readEvent`, cada um com seu próprio `logger.debug`. O app ganhou uma terceira variante de
`SessionEvent`, `SilentEvent` — ao lado de `UnreadEvent` — para não confundir "calado por decisão do
contrato" com "este build não sabe ler" (os dois já eram tratados como `UnreadEvent`, e `F6` precisa
distingui-los). `diag.pong` é ao mesmo tempo calado **e** o único tipo sem entrada em `_readers` que
ainda é lido de verdade — `_eventOf` tenta `_pongOr` antes de olhar a lista de calados, para a
classificação nunca esconder o pong. `historyEventFrom` descarta `SilentEvent` do histórico, do mesmo
jeito que já descartava `UnreadEvent`. `_onFrame` (`session_ws_data_source.dart`) loga os três
desfechos em `session.event.read`, ao lado do log já existente de fragmento não desenhado.

---

## Cenários cobertos

S-05…S-09.

---

## Critério de conclusão

```bash
pnpm verify
```
