# F4 — E2E

Plano: [03 — Regras e trilha](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-retention.md).
**Entrega:** o ciclo completo da regra provado pela porta do usuário — conceder, deixar de
perguntar, consultar o que foi feito, revogar, voltar a perguntar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-20 — Cenários compartilhados ✅

Os fluxos novos em `e2e/scenarios/`, lidos pelas duas pontas — o de S-44 existe justamente para
provar que a regra criada no celular vale para a sessão aberta no navegador.

### B-21 — O ciclo da regra ✅

Aprovar com `always` → o pedido seguinte **não** pergunta e a tool executa → revogar → o pedido
seguinte pergunta de novo.

É o cenário que prova que a revogação alcança sessão viva (S-42), e não só a próxima.

### B-22 — A trilha responde pela regra ✅

A execução auto-resolvida aparece na consulta, marcada com `auto: true` e ligada à regra que a
resolveu. Sem esta linha, a F0 seria uma autorização silenciosa.

### B-23 — Retenção e isolamento ✅

A purga não afeta a trilha da sessão corrente (S-92), e a trilha de outro usuário devolve `403`
pela porta do usuário (S-45) — a [D-05](decisions.md#d-05--de-quem-é-a-trilha) e a
[D-17](decisions.md#d-17--a-trilha-de-outro-é-a-sessão-de-outro) já tinham revertido o `404` que
este texto dizia.

---

## Cenários cobertos

S-41…S-46, S-92.

---

## Critério de conclusão

```bash
pnpm verify:full
```
