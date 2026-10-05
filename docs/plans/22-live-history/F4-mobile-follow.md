# F4 — Acompanhar no mobile

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-follower.md). Pode correr antes, depois ou junto da [F3](F3-web-follow.md).
**Entrega:** o leitor do app (`ConversationHistoryPage`) cresce enquanto a conversa é conduzida em outro
cliente, avisa que ela está ativa, confirma antes do fork e diz se o Claude está trabalhando — o mesmo
comportamento do web.

**Decisões que precisam estar fechadas para começar:** nenhuma desta fase ([decisions.md](decisions.md#f4--acompanhar-no-mobile)).

Ver [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) e [mobile/04-ui](../../architecture/mobile/04-ui.md).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-24 — Os dados: página com `activity`, comandos e eventos novos 🔲

A entidade [history_page.dart](../../../mobile/lib/features/session/domain/entities/history_page.dart) ganha
`activity` e `lastMessageId`, e o [history_mapper.dart](../../../mobile/lib/features/session/data/mappers/history_mapper.dart)
os lê (ausentes viram `null`). O data source do WS manda `transcript.follow` e `transcript.unfollow` e entrega
`appended` e `reset`, pelos tipos do `protocol.g.dart`. Log em `debug` pelo `logging` com formatter JSON.

### B-25 — O controller acompanha 🔲

[conversation_history_controller.dart](../../../mobile/lib/features/session/presentation/providers/conversation_history_controller.dart):
assina depois da primeira página; junta os anexados à `Conversation`; `reset` relê e reassina;
`AppLifecycleState.paused` solta e `resumed` reassina; o WS que volta reassina; o provider descartado solta.

### B-26 — A página: aviso, confirmação de fork e "trabalhando" 🔲

[conversation_history_page.dart](../../../mobile/lib/features/session/presentation/pages/conversation_history_page.dart):
o aviso "ativa em outro cliente" vivo; a confirmação antes do fork de uma conversa ativa, como o web
([ConversationReader.tsx](../../../web/src/features/session/components/ConversationReader.tsx)); "Trabalhando em
outro cliente…" com a ajuda e `Semantics(liveRegion: true)`; seguir o fim e "N novas"; a mensagem de
`TRANSCRIPT_FOLLOW_LIMIT`.

---

## Cenários cobertos

S-89…S-100.

---

## Critério de conclusão

```bash
pnpm verify
```
