# Plano 00 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Atualizado a cada ciclo de trabalho.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-13
**Bloqueios:** nenhum

```
F0 ████████████████████  0%   🔲 não iniciada
F1 ████████████████████  0%   🔲
F2 ████████████████████  0%   🔲
F3 ████████████████████  0%   🔲
F4 ████████████████████  0%   🔲
F5 ████████████████████  0%   🔲
F6 ████████████████████  0%   🔲
F7 ████████████████████  0%   🔲
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-foundation.md) | B-01…B-06, B-48, B-49, B-52 | 0/9 | 🔲 |
| [F1](F1-infrastructure.md) | B-07…B-10, B-50 | 0/5 | 🔲 |
| [F2](F2-contracts.md) | B-11…B-14 | 0/4 | 🔲 |
| [F3](F3-backend.md) | B-15…B-23, B-51 | 0/10 | 🔲 |
| [F4](F4-web.md) | B-24…B-30 | 0/7 | 🔲 |
| [F5](F5-mobile.md) | B-31…B-36 | 0/6 | 🔲 |
| [F6](F6-scripts-e2e.md) | B-37…B-40 | 0/4 | 🔲 |
| [F7](F7-gates-ci.md) | B-41…B-47 | 0/7 | 🔲 |
| **Total** | **B-01…B-52** | **0/52** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 79 | 79 | 0 | 0 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).
Registrar o vermelho é o que permite ver padrão — três ciclos seguidos caindo no mesmo portão
é sinal de problema de desenho, não de descuido.

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | *(sem ciclos ainda)* |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente. Decisão
registrada só aqui é decisão que se perde.

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
| R-01 | `allow` de projeto em diretório confiado | 🔲 aberto | verificar antes de produção |
| R-02 | `409` vs enfileirar prompt | 🔲 aberto | **decidir antes da F3** |
| R-03 | 90 % desde o primeiro commit | 🔲 monitorar | vigiar teste de fachada em review |
| R-04 | Dart gerado fora de sincronia | 🔲 aberto | mitigado por B-14 |
| R-05 | Docker obrigatório | ✅ aceito | sem alternativa |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: atualize a contagem e marque os cenários cobertos.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso.
