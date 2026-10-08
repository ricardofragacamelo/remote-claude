# F3 — Acompanhar no web

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-follower.md). Pode correr antes, depois ou junto da [F4](F4-mobile-follow.md).
**Entrega:** o leitor do web (`ConversationReader`) cresce enquanto a conversa é conduzida em outro cliente,
acompanha o fim ou conta as novas, e diz se a conversa está ativa e se o Claude está trabalhando.

**Decisões que precisam estar fechadas para começar:** nenhuma desta fase ([decisions.md](decisions.md#f3--acompanhar-no-web)).

O fluxo é Component → Hook → Service → ws/api ([web/01](../../architecture/web/README.md)): nenhum componente
fala com o `ws-client`.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-20 — O serviço de acompanhamento ✅

`features/session/services/transcript-follow.service.ts`, sobre o [ws-client](../../../web/src/shared/api/ws-client.ts):
manda `follow` e `unfollow`, filtra por `followId`, confere o `seq` (buraco → pede reset) e entrega `appended`
e `reset` a quem assinou.

### B-21 — O hook `useConversationFollow` ✅

Em `features/session/hooks/`: assina com o `lastMessageId` da página; junta os anexados pelo mesmo redutor;
`reset` relê a página 1 e reassina; aba escondida (`visibilitychange`) solta e, ao voltar, reassina; o WS que
volta reassina; `TRANSCRIPT_FOLLOW_LIMIT` vira um estado com a mensagem traduzida, e o leitor continua legível.

### B-22 — `useConversationHistory` com os anexados ✅

[useConversationHistory.ts](../../../web/src/features/session/hooks/useConversationHistory.ts) expõe
`lastMessageId` e aceita os anexados; a `activity` deixa de vir só da primeira página e passa a ser a do envio
mais recente. Carregar página antiga durante um envio não perde nem duplica nada (o `blockId` da B-13).

### B-23 — O leitor que acompanha ✅

Em [ConversationReader.tsx](../../../web/src/features/session/components/ConversationReader.tsx): no fim,
acompanha o fim; rolado para cima, a pílula "N novas" (N mensagens) leva ao fim; o aviso "ativa em outro
cliente" vivo; "Trabalhando em outro cliente…" com a ajuda e `aria-live="polite"`; "Continuar esta conversa"
solta a assinatura antes de virar sessão viva, e continua confirmando quando a conversa está ativa.

---

## Cenários cobertos

S-74…S-88.

---

## Critério de conclusão

```bash
pnpm verify
```
