# Plano 01 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-16
**Bloqueios:** nenhum ainda. **R-01 é bloqueante por desenho**: a B-42 precisa rodar antes de
qualquer sessão real contra um diretório confiado.

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-06, B-45 | 0/7 | 🔲 |
| [F1](F1-workspace.md) | B-07…B-11 | 0/5 | 🔲 |
| [F2](F2-session-runtime.md) | B-12…B-20, B-44 | 0/10 | 🔲 |
| [F3](F3-audit.md) | B-21…B-24, B-46, B-47 | 0/6 | 🔲 |
| [F4](F4-permission.md) | B-25…B-31 | 0/7 | 🔲 |
| [F5](F5-web-session.md) | B-32…B-38 | 0/7 | 🔲 |
| [F6](F6-e2e.md) | B-39…B-43 | 0/5 | 🔲 |
| **Total** | **B-01…B-47** | **0/47** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 108 | 108 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 13 | 0 | 1 | 12 | 0 |

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

## Dívida herdada do plano 00

O que o [bootstrap](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado) adiou e **este**
plano assume. Item herdado sem dono vira item esquecido.

| Herdado | Onde fecha |
|---|---|
| S-119 — `session.detach` não existe no contrato nem no backend | B-01 |
| Redutor de `message.delta` acumulado por `messageId` | B-32 |
| `e2e/smoke-live/` vazio desde a F6 do bootstrap | B-41 |
| R-01 — `allow` de projeto em diretório confiado pode furar o `canUseTool` | B-42 |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Diretório confiado pode dispensar o `canUseTool` | 🔲 aberto | herdado do bootstrap; **bloqueia** a F6 até B-42 responder |
| R-02 | O fake do Agent SDK pode divergir do SDK real | 🔲 aberto | mitigação prevista: B-41 |
| R-03 | Cobrir o mapper de ~38 variantes com 90 % de `branches` | 🔲 aberto | — |
| R-04 | `~222 MB` por sessão medido em uma máquina só | 🔲 aberto | limite configurado aqui; derivado no plano 05 |
| R-05 | Auditoria que bloqueia transforma falha de banco em sessão parada | 🔲 aberto | exigência: a falha precisa ser visível na UI |

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
