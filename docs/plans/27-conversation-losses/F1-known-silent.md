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

### B-03 — A classificação dos eventos no contrato 🔲

Todo evento servidor → cliente do schema de `packages/contracts` ganha uma classe: **conversa** (muda a
linha do tempo) ou **calado** (estado de tela, `workspace.*`, `transcript.*`, `diag.*`,
`session.mcpStatusChanged`…). A geração emite a lista para o `protocol.ts` e para o `protocol.g.dart`,
e os dois clientes leem a mesma, nunca uma cópia à mão.

O `contracts:check` (portão 11) reprova evento sem classe e evento nas duas. A classificação entra
no [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente),
na tabela de eventos. Cenários S-05…S-07.

### B-04 — Os dois clientes adotam a lista 🔲

O web (`readEvent` do [conversation-reducer.ts](../../../web/src/features/session/services/conversation-reducer.ts))
e o app (`_pongOr` do [session_event_mapper.dart](../../../mobile/lib/features/session/data/mappers/session_event_mapper.dart))
passam a separar três casos: evento com leitor, evento calado da lista, e o resto. Os dois primeiros
fazem o que fazem hoje. O terceiro também, por ora (o `seq` avança, nada na tela): a F6 é que o
desenha. O caminho separado existe para a F6 só trocar o terceiro ramo. Log `debug` em cada ramo.
Cenários S-08, S-09.

---

## Cenários cobertos

S-05…S-09.

---

## Critério de conclusão

```bash
pnpm verify
```
