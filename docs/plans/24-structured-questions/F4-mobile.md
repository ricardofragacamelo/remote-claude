# F4 — Mobile

Plano: [24 — Perguntas estruturadas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-backend.md), e das decisões [D-11](decisions.md#f4--mobile) e
[D-15](decisions.md#f3--web).
**Entrega:** o app mostra a pergunta em passos, inline e pela chegada do push, envia as respostas,
mostra a pergunta respondida na linha da tool e avisa "aguardando sua resposta".

Leia antes: [mobile/01](../../architecture/mobile/README.md), [mobile/04](../../architecture/mobile/04-ui.md)
e [shared/02-i18n](../../architecture/shared/02-i18n.md).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-17 — Dados 🔲

- `domain/entities/permission_request.dart`: `interaction` e `QuestionAnswer`.
- `data/mappers/permission_mapper.dart`: lê `interaction` e `answers`.
- `data/datasources/permission_ws_data_source.dart` e o repositório: `answer(..., answers)`.
- `presentation/providers/permission_queue_controller.dart`: `answerQuestion` e o rascunho por
  `requestId`. Responder não passa pelo `approvalLock` ([D-11](decisions.md#f4--mobile)), e o
  `riskHint: 'read'` já tira a confirmação em dois passos.

### B-18 — O card de pergunta 🔲

`presentation/widgets/question_card.dart`, no desvio de `permission_panel.dart`, ao lado do
`plan_approval_card.dart`. Uma pergunta por passo — "Pergunta 2 de 3", Voltar e Próxima —, porque
abas não cabem numa tela estreita. Radio e checkbox, "Outro" com campo, avanço automático com o
Voltar sempre à vista ([D-24](decisions.md#f3--web)), destaque do "(Recommended)", "Ver prévia" que
abre uma folha com o preview em `SelectableText` monoespaçado ([D-21](decisions.md#f4--mobile)),
"Enviar respostas" e "Não responder", contagem e "Estender" como no card de permissão, e o card só
de recusa quando `malformed`.

A tela de chegada do push (`/sessions/:sessionId/permissions/:requestId`) mostra o card de pergunta
em tela cheia quando o `GET` traz `interaction`, e as respostas quando já foi resolvida.
`permission_card_view.dart` (`toolLabel`) ganha a chave nova.

### B-19 — A pergunta respondida 🔲

`presentation/widgets/answered_questions.dart`, somente leitura, usado na tela de chegada e no
`session/.../tool_card.dart`, que ganha um ramo para `AskUserQuestion` no card recolhível do plano
22, no lugar do mapa cru. O rótulo da tool: "Perguntou: {header}" ou "Fez {n} perguntas".

### B-20 — Avisos 🔲

O indicador da sessão diz "Aguardando sua resposta" para pergunta.

---

## Cenários cobertos

S-82…S-97.

---

## Critério de conclusão

```bash
pnpm verify
```
