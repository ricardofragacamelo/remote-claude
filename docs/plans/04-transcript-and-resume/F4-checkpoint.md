# F4 — Desfazer

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-commands.md).
**Entrega:** desfazer o que uma sessão escreveu em disco, com alcance explícito e registro.

---

## Por que isso existe

`enableFileCheckpointing: true` está ligado desde o [plano 01](../01-live-session/F2-session-runtime.md)
justamente por isto: **"desfazer" é rede de segurança quando se aprova de longe**
([04-claude-integration](../../architecture/backend/04-claude-integration.md#options--o-que-amarramos)).

Aprovar um `Write` pelo celular, no ônibus, é uma decisão tomada com menos contexto do que a
mesma decisão no desktop. O desfazer é o que torna esse risco aceitável.

E é, ele próprio, uma operação que **mexe no disco do usuário** — logo: alcance visível,
recusa durante turno, e auditoria.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-18 — Comando de rewind no contrato 🔲

`rewindFiles()` exposto como comando WS, com o evento de resultado. Contrato muda nas três
pontas na mesma entrega — é a regra dos
[gatilhos específicos](../../../AGENTS.md).

### B-19 — UI com alcance explícito 🔲

Antes de desfazer, a tela diz **quais arquivos** voltam e **para qual ponto**. Confirmação sem
lista é confirmação sem informação.

### B-20 — Rewind é auditado 🔲

Entra em `audit` com a lista de arquivos e o ponto de destino. Alteração em disco que não
deixa rastro é exatamente o que a trilha existe para impedir.

### B-21 — Limites do rewind 🔲

Só alcança o que **aquela sessão** tocou; sessão fechada não desfaz; durante um turno em
execução é recusado com `SESSION_LOCKED`. Falha no meio não deixa estado parcial silencioso —
erro claro, com o que foi e o que não foi revertido.

---

## Cenários cobertos

S-37…S-45.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
