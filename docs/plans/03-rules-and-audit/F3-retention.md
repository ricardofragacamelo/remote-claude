# F3 — Retenção

Plano: [03 — Regras e trilha](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-audit-query.md).
**Entrega:** a trilha guarda no mínimo 90 dias, e o que passa disso é removido por uma purga
que ela mesma registra.

---

## A tensão desta fase

Auditoria é **append-only**; retenção **apaga**. As duas coisas precisam conviver sem que a
segunda vire uma porta para a primeira ser reescrita.

A saída é estreitar a porta: a purga apaga **por janela de tempo**, em lote, com papel próprio,
e é auditada — quantas linhas, de qual período, quando. Quem consegue apagar não consegue
escolher *o quê*.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-16 — Janela configurada, com piso 🔲

Retenção mínima de 90 dias ([backend/03](../../architecture/backend/03-modules.md#audit)).
Valor abaixo disso **impede o processo de subir** — piso que se pode baixar por variável de
ambiente não é piso.

### B-17 — Purga em lote 🔲

Apaga fora da janela, em lotes, sem bloquear a escrita da trilha: auditoria que para de gravar
durante a limpeza bloquearia a autorização (é a regra da
[F3 do plano 01](../01-live-session/F3-audit.md)), ou seja, a limpeza pararia o produto.

Idempotente: interrompida no meio e reexecutada, não apaga duas vezes nem perde lote.

### B-18 — Subcomando no `db.mjs` 🔲

A purga entra no script que já existe (`migrate` · `reset` · `seed`), com **código de saída
honesto** e saída dizendo o que apagou e o que não conseguiu apagar.

Entra na seção **Comandos** do [README.md](../../../README.md#comandos) e no
[catálogo de scripts](../00-bootstrap/README.md#catálogo-de-scripts) na mesma entrega.

### B-19 — A purga é auditada 🔲

Ela própria vira registro: janela, contagem e quem disparou. Operação que apaga trilha sem
deixar rastro é o buraco óbvio deste desenho.

---

## Cenários cobertos

S-33…S-40.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
