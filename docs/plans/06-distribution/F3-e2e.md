# F3 — E2E

Plano: [06 — Distribuição](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-updates.md).
**Entrega:** `pnpm dist:verify` — instalar, subir, verificar e desinstalar numa máquina limpa,
com código de saída honesto.

---

## Por que uma máquina limpa

Porque instalação testada na máquina de quem a escreveu passa por acidente: as dependências já
estão lá, a configuração já existe, a porta já está livre. O único teste que prova o produto
instalado é o que parte do zero.

O custo — um container descartável por execução — está assumido no
[R-05](README.md#riscos-e-decisões-em-aberto).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-16 — Cenários compartilhados de instalação 🔲

Em `e2e/scenarios/`, para que o smoke pós-instalação e o `dist:verify` cobrem a mesma
expectativa — e para que ela mude num lugar só.

### B-17 — `pnpm dist:verify` 🔲

Instala num container limpo, sobe, roda o smoke pós-instalação, desinstala e confere que nada
ficou para trás. Falha em qualquer etapa sai ≠ 0 dizendo **qual** — e o cleanup roda mesmo em
erro.

Entra no catálogo de scripts e na seção **Comandos** do [README.md](../../../README.md#comandos).

### B-18 — Atualizar de uma versão para a seguinte 🔲

Instala a anterior, atualiza, e confere que sessões, regras e trilha continuam lá.

### B-19 — Restaurar backup 🔲

Depois da atualização, restaurar um backup devolve o sistema coerente. É o cenário que prova
que o caminho de volta do B-13 existe de verdade, e não só no documento.

---

## Cenários cobertos

S-33…S-38.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm dist:verify
```
