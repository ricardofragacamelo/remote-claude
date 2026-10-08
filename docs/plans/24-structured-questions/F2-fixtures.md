# F2 — Fixtures

Plano: [24 — Perguntas estruturadas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-backend.md).
**Entrega:** as fixtures do fake SDK mostram perguntas respondidas, e um teste de integração lê o
que o `canUseTool` devolveu.

**Por quê agora:** a fixture `plan-turn` foi gravada com o bug — o gravador responde `canUseTool`
com o próprio input, e o `tool_result` gravado é "The user did not answer the questions." Os e2e da
F6 precisam de uma conversa em que a pergunta foi respondida, e de uma com várias perguntas.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-11 — O gravador responde 🔲

[record-agent-sdk-fixtures.mjs](../../../scripts/record-agent-sdk-fixtures.mjs): quando a tool é
`AskUserQuestion`, devolve `answers` com a primeira opção de cada pergunta. Regravar o
`plan-turn`. Gravar o `question-turn` novo, com um prompt que leve o Claude a fazer duas ou mais
perguntas, uma de escolha múltipla e uma com preview; o gravador confere essa forma e **falha
alto** se o modelo não cooperar (R-04), em vez de gravar algo menos útil.

A gravação usa o Claude de verdade: rodar uma vez, conferir a fixture, versionar.

### B-12 — O fake registra o veredito 🔲

`backend/test/fakes/agent-sdk/scripted-query.ts` continua emitindo o `tool_result` gravado,
qualquer que seja a resposta ([D-19](decisions.md#f2--fixtures)), e passa a **registrar** o que o
`canUseTool` devolveu. A integração do fluxo de pergunta lê esse registro e confere
`updatedInput.answers`.

Ajustar `recorded-fixtures.spec`, `sdk-message.mapper.spec`, `session-runner.spec` e
`permission-bridge.spec` às fixtures e ao veredito novos. O cenário `e2e/scenarios/panel-changes.json`
(`planAsksBefore`) fica para a B-23, junto do spec que o usa.

---

## Cenários cobertos

S-56…S-59.

---

## Critério de conclusão

```bash
pnpm verify
```
