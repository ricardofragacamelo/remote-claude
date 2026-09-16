# Plano 06 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-16
**Bloqueios:** **R-01 e R-03 bloqueiam a F1** — como o backend é alcançado de fora, e quais
sistemas operacionais entram no escopo inicial.

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
| [F0](F0-packaging.md) | B-01…B-06 | 0/6 | 🔲 |
| [F1](F1-exposure.md) | B-07…B-11 | 0/5 | 🔲 |
| [F2](F2-updates.md) | B-12…B-15 | 0/4 | 🔲 |
| [F3](F3-e2e.md) | B-16…B-19 | 0/4 | 🔲 |
| **Total** | **B-01…B-19** | **0/19** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 38 | 38 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 7 | 7 | 0 | 0 | 0 |

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
| — | — | — | — |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Como o usuário alcança o backend de fora — túnel, VPN ou porta com TLS | 🔲 **aberto** | bloqueia a F1; o default continua loopback |
| R-02 | O serviço precisa herdar o login do Claude | 🔲 aberto | instalação por usuário; primeiro cenário a provar (S-02) |
| R-03 | systemd, launchd e Windows são três mecanismos | 🔲 **aberto** | escopo declarado; o não suportado é dito, não fingido |
| R-04 | Atualização que roda migration e falha no meio | 🔲 aberto | backup obrigatório antes (B-14); migration aplicada não se edita (S-26) |
| R-05 | `dist:verify` precisa de máquina limpa de verdade | 🔲 aberto | container descartável; custo assumido |

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
