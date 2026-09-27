# Plano 09 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-27
**Bloqueios:** nenhum para planejar; para **começar**, a F0 espera as decisões D-01…D-03 e a F0 dos planos 06 e 07 ([decisões](decisions.md))

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-05 | 0/5 | 🔲 |
| [F1](F1-search.md) | B-06…B-12 | 0/7 | 🔲 |
| [F2](F2-search-ui.md) | B-13…B-20 | 0/8 | 🔲 |
| [F3](F3-e2e.md) | B-21…B-24 | 0/4 | 🔲 |
| **Total** | **B-01…B-24** | **0/24** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 162 | 162 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 8 | 8 | 0 | 0 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | *(sem ciclos ainda)* |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| — | — | — | — |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-26 | **Controle de versão (git)** inteiro — status, diff, stage, commit, branch, histórico, blame, stash, merge, remotos e PRs; o plano deixou de ser "Busca e controle de versão" e as fases F3 `scm` e F4 `scm-ui` foram apagadas antes de qualquer publicação (a numeração de tasks, cenários e decisões recomeçou sem buracos, porque nada tinha sido citado) | decisão do usuário: o produto precisa de abrir, criar, operar e editar arquivos, não de tudo do VS Code | fora do roteiro — nenhum plano o recebe; ver o [Não entra](README.md#não-entra) |
| 2026-09-26 | "Ir para linha" (Ctrl+G) e localizar/substituir no arquivo | são funções do editor | [plano 07](../07-explorer-and-editor/README.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Injeção de comando ou de argumento pela entrada do usuário | 🔲 aberto | ADR-016 e regras estáticas na F0; sentinela nos cenários |
| R-02 | Uma busca comer a máquina (regex, pasta gigante, paralelismo) | 🔲 aberto | tetos e prazos a medir na D-06 |
| R-03 | O substituir destruir trabalho feito depois da prévia | 🔲 aberto | depende da D-05 e da escrita humana do 07 |
| R-04 | Binário ausente ou diferente por máquina | 🔲 aberto | medido: sem `rg` nesta máquina — D-01 |
| R-05 | `onlyBuiltDependencies` aberto para o `@vscode/ripgrep` | 🔲 aberto | D-01 |
| R-06 | A busca enxergar fora da fronteira | 🔲 aberto | realpath, sem symlink, cache depois da validação |
| R-07 | Supressão do semgrep virar hábito | 🔲 aberto | adapter único, supressão na linha (B-05) |
| R-08 | O log vazar o que se procurou | 🔲 aberto | S-12, S-104 |
| R-09 | O `@` do 08 lento em pasta grande | 🔲 aberto | D-07, S-61 |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
