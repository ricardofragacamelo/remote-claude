# F6 — E2E

Plano: [24 — Perguntas estruturadas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** todas as fases anteriores.
**Entrega:** a pergunta respondida, recusada e vencida pela porta do usuário, no web e no app, e o
plano fechado com os portões completos.

Leia antes: [06-testing-strategy §E2E](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-23 — Web 🔲

Um cenário novo em `e2e/scenarios/` com o `question-turn` da B-11, e um spec Playwright: escolha
única, múltipla e "Outro" respondidas pelo card; recusa com motivo; vencimento com um
`RC_QUESTION_TIMEOUT_MS` curto de teste; dois contextos do mesmo usuário, um respondendo e o outro
vendo a linha respondida.

O [claude-panel-changes.spec.ts](../../../e2e/specs/claude-panel-changes.spec.ts) e o
`planAsksBefore` do `e2e/scenarios/panel-changes.json` passam a responder o `AskUserQuestion` pelo
card de pergunta, e não mais por "Permitir uma vez" (R-09).

### B-24 — App 🔲

Um `integration_test` com o mesmo cenário: responder pelos passos, recusar, e ver respondida no app
a pergunta respondida pelo web. O login é o do e2e de hoje; a chegada pelo push fica no widget
(S-94).

### B-25 — Os portões completos 🔲

`pnpm verify:full` e `pnpm test:e2e:mobile` — o gate 9 só roda o e2e do web. Antes, conferir se
outra sessão está rodando validação na mesma árvore (R-10).

---

## Cenários cobertos

S-104…S-111.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
