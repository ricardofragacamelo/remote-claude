# F5 — Histórico

Plano: [24 — Perguntas estruturadas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-backend.md), [F3](F3-web.md), [F4](F4-mobile.md), e do
[plano 22](../22-live-history/README.md) fechado (R-10).
**Entrega:** uma sessão reaberta, ou seguida ao vivo noutro cliente, mostra a pergunta respondida
na linha da tool, igual à que se viu ao vivo.

**Por quê separada:** a leitura de volta do SDK não traz o `tool_use_result` estruturado; sobra só
o texto. As respostas vêm do nosso banco ([D-13](decisions.md#f0--normas-e-contrato)), e isso toca
os mesmos arquivos que o plano 22 está fechando.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-21 — Enriquecer pelo `toolUseId` ✅

Um enriquecedor na aplicação (`application/transcript`), atrás de uma porta para
`permission_requests`: para cada linha de `AskUserQuestion` do transcript, busca o pedido pelo
`toolUseId` e junta `answers` e o desfecho (respondida, recusada com motivo, vencida). Vale para a
leitura do transcript e para o seguidor do plano 22 ([D-27](decisions.md#f5--histórico)), pelo mesmo
caminho. Sem linha nossa, a linha segue como hoje: perguntas e `summary`.

O resultado vai no campo `question` do `tool.completed`, previsto no contrato pela
[B-02](F0-norms.md#b-02--schemas-e-tipos-gerados-).

### B-22 — As duas pontas leem ✅

O web e o app desenham a linha respondida a partir do histórico com o mesmo `AnsweredQuestions` /
`answered_questions` das F3 e F4.

---

## Cenários cobertos

S-98…S-103.

---

## Critério de conclusão

```bash
pnpm verify
```
