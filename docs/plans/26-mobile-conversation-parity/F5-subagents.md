# F5 — Subagents

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-tool-cards.md).
**Entrega:**

- nenhuma mensagem de subagent se perde no app;
- o texto, o pensamento e as tools do subagent aparecem aninhados sob o card do subagent (a tool de
  `kind` `agent`), ao vivo e no histórico, como no web;
- a permissão de uma tool de subagent diz de quem é.

---

## Por quê

É a única perda de **mensagem inteira** do app. O mapper devolve `UnreadEvent` para todo frame com
`parentToolUseId`
([session_event_mapper.dart](../../../mobile/lib/features/session/data/mappers/session_event_mapper.dart)),
porque o app não tinha onde pôr o texto sem misturá-lo com a resposta. O
[plano 10 · D-01](../10-mobile-chat-layout/decisions.md#f0--normas) deixou o aninhamento fora. O usuário
reviu isso em 2026-10-09 ([D-03](decisions.md#normas)). Com o plano 13, os subagents do projeto passam
a ser comuns e a pedir permissão ([13 · D-23](../13-claude-settings/decisions.md#d-23--modo-próprio-de-subagent-volta-a-perguntar)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-18 — O mapper guarda o dono 🔲

`message.delta`, `message.completed`, `tool.started`, `tool.progress` e `tool.completed` com
`parentToolUseId` deixam de ser `UnreadEvent`. Os eventos de domínio ganham o `parentToolUseId`, e o
`isSubagent` da tool passa a ser derivado dele.

Um frame de subagent cujo card (`kind` `agent`) ainda não chegou fica guardado e é anexado quando o
card chegar, como faz o redutor do web. O `seq` continua avançando por todo frame. Cenários S-63…S-65.

### B-19 — O aninhamento na conversa 🔲

A `Conversation` guarda os filhos de cada tool de `kind` `agent`: mensagens, pensamento e tools, na
ordem. O que abre um subagent é o `kind`, que o [plano 28](../28-agent-neutral-core/F3-interactions.md)
pôs no lugar do `opensSubagent` por nome (`Agent`/`Task`); nenhum ramo do app lê o nome da tool. O card
do subagent desenha os filhos com o mesmo `EntryView`, recuados, com:

- o mesmo estado padrão (dobrado ou aberto) e o mesmo limite de profundidade do `SubagentChildren`
  do web (R-05);
- o resumo final do subagent, quando houver.

Uma tool de subagent nunca aparece solta na lista principal. Cenários S-66…S-68.

### B-20 — O subagent no histórico 🔲

Ao abrir o card de um subagent (`kind` `agent`) do histórico, o app lê
`GET /transcripts/:engine/:id/subagents/:toolUseId/messages` ([04 · rotas](../../architecture/backend/03-modules.md)),
com o `conversation { engine, id }` da sessão, que o [plano 28](../28-agent-neutral-core/F1-engine-port.md)
pôs no lugar do `claudeSessionId`. É como o `SubagentChildren` do web: sob demanda, com os quatro
estados e tentar de novo. A resposta passa pelo `historyEventFrom` e entra como filhos do card.
Cenários S-69, S-70.

### B-21 — A permissão com o dono 🔲

O card de permissão inline de uma tool de subagent aparece **dentro** do subagent, como no web, e o
título diz o subagent ("Subagent *writer* quer escrever `x`"); o resto do título é o `label` do
`permission.requested` (B-13). A notificação push não muda. O `permission.requested` já carrega o
`toolUseId`, e o dono sai da conversa. Cenário S-71.

---

## Cenários cobertos

S-63…S-71.

---

## Critério de conclusão

```bash
pnpm verify
pnpm render:check     # SubagentChildren deixa de ser `pending`
```
