# F2 — Retomada

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-transcript-ui.md).
**Entrega:** continuar uma conversa encerrada — inclusive uma que começou no VSCode.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-10 — `session.start` com `resumeSessionId` 🔲

O campo já existe no contrato desde a [F0 do plano 01](../01-live-session/F0-contract.md); o
que nasce aqui é o comportamento. A opção `resume` do SDK é montada pela
`sdk-options.factory`.

### B-11 — Continuidade de `seq` e do buffer 🔲

A sessão retomada é uma sessão **viva nova**: `seq` recomeça, e o cliente precisa saber disso
para não misturar o que veio do histórico com o que está chegando.

O contrato do replay não muda; o que muda é de onde o cliente pega a parte antiga — do
transcript (F0), não do ring buffer.

### B-12 — Retomar a sessão do VSCode 🔲

É a promessa que justifica `persistSession: true`: começar no editor e continuar do celular.
Ela precisa funcionar de verdade, não só listar.

### B-13 — Os erros da retomada 🔲

Sessão inexistente → `SESSION_NOT_FOUND`. Workspace que saiu da allowlist →
`WORKSPACE_NOT_ALLOWED`. Acima do limite → `SESSION_LIMIT_REACHED`.

E a regra que evita o pior defeito possível aqui: retomar uma sessão **que já está viva** é
`attach`, não um segundo `start` — senão abre-se um segundo subprocesso para a mesma conversa.

---

## Cenários cobertos

S-19…S-28.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
