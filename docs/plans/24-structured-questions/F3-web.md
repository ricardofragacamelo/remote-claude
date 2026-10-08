# F3 — Web

Plano: [24 — Perguntas estruturadas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-backend.md), e da [D-15](decisions.md#f3--web).
**Entrega:** o painel mostra a pergunta num card próprio, envia as respostas, mostra a pergunta
respondida na linha da tool e avisa "aguardando sua resposta".

Leia antes: [web/01](../../architecture/web/README.md), [web/03](../../architecture/web/03-ui-system.md)
e [shared/02-i18n](../../architecture/shared/02-i18n.md). Componente chama hook, hook chama service
(regra 6 do AGENTS.md).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-13 — Dados ✅

- `features/permission/types`: `PermissionRequest.interaction`, `QuestionAnswer`,
  `PermissionOutcome.answers`.
- `services/permission.service.ts`: `toRequest` lê a `interaction`; `sendAnswer` aceita
  `answers`; `toOutcome` lê `answers`.
- `hooks/usePermissionQueue.ts`: `answerQuestion(request, answers)` e o rascunho por `requestId`,
  que sobrevive à queda do socket e ao replay do `attach` (R-06), e é descartado quando o pedido é
  resolvido em outro lugar.

### B-14 — O card de pergunta ✅

`components/QuestionCard.tsx`, no desvio de `PermissionRequestCard.tsx`, ao lado do
`PlanApprovalCard`. O comportamento é o da norma escrita na B-01 (web/03); em resumo:

- abas com o `header` e marca de respondida; uma pergunta por vez;
- radio na escolha única, com avanço automático quando não é a última
  ([D-24](decisions.md#f3--web)); checkbox na múltipla; inputs nativos estilizados
  ([D-20](decisions.md#f3--web));
- "Outro" como última opção, com campo e foco;
- destaque da opção "(Recommended)", sem pré-seleção ([D-23](decisions.md#f3--web));
- painel de preview só na escolha única com algum preview, com o `ChatMarkdown` seguro em caixa
  monoespaçada; empilhado em tela estreita;
- "Enviar respostas" desabilitado até tudo respondido ([D-04](decisions.md#f1--backend));
  "Não responder" e Esc com motivo opcional ([D-15](decisions.md#f3--web));
- `PermissionCountdown` e `ExtendAction` reaproveitados; estado "enviando"; card só de recusa
  quando `malformed`;
- teclado e ARIA como na norma; o foco chega na primeira opção.

A pergunta de subagente cai na cauda (`TailRequests`) como qualquer pedido, sem tratamento
especial; S-76 prova.

### B-15 — A pergunta respondida ✅

`components/AnsweredQuestions.tsx`, somente leitura: cada pergunta com a escolhida marcada, as
outras esmaecidas e o texto do "Outro". Usado no card resolvido em outro lugar e na linha da tool:
`session/components/conversation/ToolRow.tsx` ganha um ramo para `AskUserQuestion`, no mesmo
padrão dos ramos que já existem, no lugar do IN/OUT genérico do plano 22. Recusada mostra o motivo;
sem `answers` (sessão de outro cliente), as perguntas e o `summary`.

`session/lib/tool-labels.ts`: "Perguntou: {header}" ou "Fez {n} perguntas".

### B-16 — Avisos ✅

`WorkingIndicator`, `PendingPill`, `usePermissionNotices` e `useBrowserNotifications` ganham a
variante de pergunta — "Aguardando sua resposta" —, sem o texto dela.

---

## Cenários cobertos

S-60…S-81.

---

## Critério de conclusão

```bash
pnpm verify
```
