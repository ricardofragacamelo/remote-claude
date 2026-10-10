# Plano 28 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-10
**Bloqueios:** a F0 começa quando a F1 do [plano 26](../26-mobile-conversation-parity/README.md) fechar (as tasks estão escritas; falta o `pnpm verify`), pela ordem da [D-01](decisions.md#f0--normas). Nenhuma decisão aberta: as 18 foram decididas em 2026-10-10, três contra a recomendação (D-09, D-10, D-11) — ver [decisions.md](decisions.md). Este plano **bloqueia** o 26 (F2…F7), o 13 (F2…F4), o 27, o 14, o 15, o 16 e o 18 ([índice dos planos](../README.md#ordem-de-execução))

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F7 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-07 | 0/7 | 🔲 |
| [F1](F1-engine-port.md) | B-08…B-13 | 0/6 | 🔲 |
| [F2](F2-canonical-tools.md) | B-14…B-19 | 0/6 | 🔲 |
| [F3](F3-interactions.md) | B-20…B-25 | 0/6 | 🔲 |
| [F4](F4-modes-and-usage.md) | B-26…B-30 | 0/5 | 🔲 |
| [F5](F5-permission-dialect.md) | B-31…B-35 | 0/5 | 🔲 |
| [F6](F6-engine-extensions.md) | B-36…B-42, B-48 | 0/8 | 🔲 |
| [F7](F7-e2e.md) | B-43…B-47 | 0/5 | 🔲 |
| **Total** | **B-01…B-48** | **0/48** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 136 | 136 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 18 | 0 | 0 | 18 | 0 |

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
| 2026-10-10 | As decisões D-02, D-04…D-11 e D-13…D-17 respondidas, e a D-18 nova | revisão dos gaps pelo usuário, em perguntas; três escolhas contra a recomendação: todo o REST no pacote (D-09), nenhum kind de auditoria com nome de motor (D-10), gramática canônica de regra já (D-11), com a migração de todas as regras (D-18) | nascem a B-48 (F6), os S-131…S-136 e o R-09; mudam a B-31, a B-33, a B-36, a B-01 e a B-12; os planos 13, 14, 15 e 18 ajustados na mesma data |
| 2026-10-10 | Plano criado a partir da [discovery 10](../../discovery/10-nucleo-canonico-e-agentes-isolados.md), com a ordem da D-01 e a D-12 decididas | pedido do usuário: "gerar o plano e gravar as dependências", e "alterar outros planos que não foram executados com as novas diretivas" | os planos 12, 13, 14, 15, 16, 18, 19, 26 e 27 ajustados na mesma data, cada um com a sua decisão ✅; a B-07 confere os ajustes contra as normas da F0 |

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
| R-01 | A classificação canônica erra, e uma ferramenta que escreve sai como leitura | 🔲 aberto | B-14, B-16 |
| R-02 | A neutralização muda o comportamento com o Claude | 🔲 aberto | B-46 |
| R-03 | O app publicado quebra com o `v+1` | 🔲 aberto | D-08 |
| R-04 | O plano atrasa a paridade do app (26) e o 13 | ✅ aceito | D-01 |
| R-05 | O baseline vira esconderijo de violação | 🔲 aberto | B-05 |
| R-06 | A F6 conflita com outra sessão no mesmo working tree | 🔲 aberto | F6 roda sem outro plano em andamento no tree |
| R-07 | A migração da conversa perde a ligação com checkpoint ou origem | 🔲 aberto | B-11 |
| R-08 | As telas supõem a capacidade presente | 🔲 aberto | B-43…B-45 |
| R-09 | A migração das regras desliga ou muda o alcance de uma regra em uso | 🔲 aberto | D-18, B-33 |

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
