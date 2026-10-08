# Plano 24 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado; a F1 espera as decisões D-04, D-07 e D-08, a F3 a D-15, a F4 a D-11, e a F5 o plano 22 fechado
**Última atualização:** 2026-10-08
**Bloqueios:** nenhum para a F0

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
| [F0](F0-norms.md) | B-01…B-03 | 0/3 | 🔲 |
| [F1](F1-backend.md) | B-04…B-10 | 0/7 | 🔲 |
| [F2](F2-fixtures.md) | B-11, B-12 | 0/2 | 🔲 |
| [F3](F3-web.md) | B-13…B-16 | 0/4 | 🔲 |
| [F4](F4-mobile.md) | B-17…B-20 | 0/4 | 🔲 |
| [F5](F5-history.md) | B-21, B-22 | 0/2 | 🔲 |
| [F6](F6-e2e.md) | B-23…B-25 | 0/3 | 🔲 |
| **Total** | **B-01…B-25** | **0/25** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 111 | 111 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 27 | 5 | 0 | 22 | 0 |

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
| R-01 | o SDK muda o formato de `answers` ou o texto do `tool_result` | 🔲 aberto | — |
| R-02 | o modo estendido vira padrão e chegam perguntas sem opções | 🔲 aberto | — |
| R-03 | o gerador de contratos não tem `oneOf` | 🔲 aceito | fora deste plano; volta quando a `interaction` `plan` entrar |
| R-04 | a regravação das fixtures depende do modelo cooperar | 🔲 aberto | — |
| R-05 | um app desatualizado mostra o card genérico | 🔲 aberto | falha fechada (S-23) |
| R-06 | rascunho perdido por reconexão ou replay | 🔲 aberto | — |
| R-07 | regras de allow para `AskUserQuestion` já gravadas | 🔲 aberto | — |
| R-08 | texto da pergunta enorme ou com marcação estranha | 🔲 aberto | — |
| R-09 | o spec e a fixture atuais quebram na mesma mudança | 🔲 aberto | — |
| R-10 | o plano 22 ainda aberto mexe nos mesmos arquivos | 🔲 aberto | — |

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
