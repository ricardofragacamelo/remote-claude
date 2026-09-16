# F4 — E2E

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-gates.md).
**Entrega:** os limites e a expiração de credencial provados pela porta do usuário — porque é
lá que eles aparecem como "o app travou".

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-21 — Cenários compartilhados dos limites 🔲

Em `e2e/scenarios/`. O comportamento sob limite precisa ser o mesmo nas duas pontas: a
diferença entre "o app travou" e "atingi o limite" é a mensagem.

### B-22 — Limite, TTL e rate limit na tela 🔲

Abrir sessões até o teto; deixar uma sessão ociosa expirar; martelar o servidor. Em todos, a UI
mostra **o que aconteceu**, traduzido, e respeita o `Retry-After` em vez de tentar de novo na
hora.

### B-23 — Credencial expirando com o socket aberto 🔲

O token expira no meio de um turno: o socket não cai, a sessão continua, e o usuário não vê
nada. Esse "não ver nada" é o resultado esperado — e é o mais fácil de quebrar sem perceber.

### B-24 — O log do cliente chega 🔲

Um erro provocado no front aparece no backend com o **mesmo** `traceId` — é o que torna possível
alguém reportar um problema e outra pessoa achá-lo.

---

## Cenários cobertos

S-41…S-46.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:live
```
