# F5 — E2E

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-checkpoint.md).
**Entrega:** o ciclo completo pela porta do usuário, e a confirmação de que os comandos reais
da instalação continuam sendo o que achamos.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-22 — Cenários compartilhados 🔲

Em `e2e/scenarios/`, lidos pelas duas pontas — inclusive o de abrir no celular a sessão que
começou no navegador.

### B-23 — Retomada e recarga 🔲

Retomar uma sessão encerrada e continuar a conversa; e o caminho do `gap: true`, agora
recarregando o transcript de verdade.

### B-24 — Desfazer e recusa durante turno 🔲

Desfazer pela UI devolve o arquivo; desfazer com um turno em execução é recusado, e a tela
explica por quê.

### B-25 — `smoke-live` dos comandos e do `/init` 🔲

Contra o Claude real: `supportedCommands()` devolve a lista da instalação, e `/init` termina em
sucesso passando pelo pedido de `Write`.

É o único teste que pega uma mudança de comportamento do CLI antes do usuário.

---

## Cenários cobertos

S-46…S-53.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:live
```
