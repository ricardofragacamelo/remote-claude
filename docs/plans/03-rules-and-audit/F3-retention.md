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

Quem dispara é um **job interno do backend**, em intervalo configurado
([D-07](decisions.md#d-07--quem-varre-a-trilha)) — a purga não depende de como o produto foi
instalado, e por isso esta fase não espera o [plano 06](../06-distribution/README.md). A rotina
roda sob **advisory lock**: job e comando manual podem cair no mesmo minuto, e duas purgas sobre
a mesma janela é a receita para o lote perdido que o S-37 proíbe — a segunda sai com 0 sem
apagar nada, e diz por quê (S-51).

O job é desligável **por configuração, nunca por acidente**: desligado, o backend loga em `warn`
no boot que a retenção de 90 dias passou a depender de alguém rodar o comando.

A trigger append-only do plano 01 barra `DELETE` **dentro** do piso de 90 dias e libera fora dele
([D-08](decisions.md#d-08--quem-pode-apagar-a-trilha-append-only)): o piso é invariante do banco,
a janela configurada é o que a purga tenta apagar. `DELETE` direto dentro da janela é recusado
pelo banco, com o papel da aplicação (S-52).

### B-18 — Subcomando no `db.mjs` 🔲

A purga entra no script que já existe (`migrate` · `reset` · `seed`), chamando **a mesma rotina
de aplicação** que o job — não uma segunda implementação que envelhece diferente —, com **código
de saída honesto** e saída dizendo o que apagou e o que não conseguiu apagar.

Entra na seção **Comandos** do [README.md](../../../README.md#comandos) e no
[catálogo de scripts](../00-bootstrap/README.md#catálogo-de-scripts) na mesma entrega.

### B-19 — A purga é auditada 🔲

Ela própria vira registro: janela, contagem e **quem disparou** — `job` ou `cli`. Operação que
apaga trilha sem deixar rastro é o buraco óbvio deste desenho, e "não sei quem mandou" é meio
rastro.

---

## Cenários cobertos

S-33…S-40, S-51, S-52.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
