# Plano 16 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-10
**Bloqueios:** nenhum para planejar; o plano espera o [28 — Núcleo neutro de agente](../28-agent-neutral-core/README.md) concluído e o `outcome` do [27](../27-conversation-losses/README.md) ([D-16](decisions.md#d-16--ajuste-às-diretivas-do-plano-28)); F0 começa depois de D-01, D-03 e D-05, e F2/F3 dependem do plano 06 entregue

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-05 | 0/5 | 🔲 |
| [F1](F1-usage-backend.md) | B-06…B-13 | 0/8 | 🔲 |
| [F2](F2-usage-screen.md) | B-14…B-22 | 0/9 | 🔲 |
| [F3](F3-budgets.md) | B-23…B-29 | 0/7 | 🔲 |
| [F4](F4-e2e.md) | B-30…B-33 | 0/4 | 🔲 |
| **Total** | **B-01…B-33** | **0/33** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 123 | 123 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 16 | 15 | 0 | 1 | 0 |

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
| 2026-10-10 | [D-16](decisions.md#d-16--ajuste-às-diretivas-do-plano-28): o plano nasce sobre o núcleo neutro do 28 — conversa `{ engine, id }`, `usage` canônico, `outcome` do 27, limites da conta e assinatura na extensão `engines/claude/`, orçamento em US$ só com `cost: 'usd'` | pedido do usuário: ajustar os planos não executados às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico) | README (dependências, árvore), B-02…B-07, B-11, B-15, B-19, B-21…B-23, B-26; D-01, D-02, D-09 (texto); S-15, S-23, S-43, S-54, S-70, S-83, S-92. 2026-10-10 (revisão dos gaps do 28): `reasoningTokens?` e `webSearches?` no `usage` canônico (28 · D-17), o corte condicional não vale; rotas com tipo em `packages/contracts/schema/http/` (28 · D-09) — README (árvore), D-16, B-03, B-04, B-06 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-10 | tokens de pensamento e buscas web por turno (condicional: só saem se o `usage` canônico do 28 · F4 não os tiver) | o núcleo grava só as categorias do `usage` canônico ([D-16](decisions.md#d-16--ajuste-às-diretivas-do-plano-28)) | voltam como colunas anuláveis quando o `usage` canônico ganhar a categoria. 2026-10-10: não vale — o 28 · D-17 pôs `reasoningTokens?` e `webSearches?` no `usage` canônico |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Custo publicado hoje a partir do segundo turno é o acumulado | 🔲 aberto | corrigido na B-07; o plano 08 recebe nota (ver abaixo) |
| R-02 | Semântica de `modelUsage`/`total_cost_usd` muda entre versões do SDK | 🔲 aberto | fixtures reais na B-02; S-07 quebra primeiro |
| R-03 | Orçamento é limite suave e pode surpreender quem espera teto rígido | 🔲 aberto | ajuda e recusa explicam; teto por sessão continua ([D-12](decisions.md#d-12--o-que-acontece-quando-o-orçamento-estoura)) |
| R-04 | Agregação na leitura fica lenta com o volume | 🔲 aberto | medir na B-09 (S-44) |
| R-05 | Uso por pasta revela atividade de outra pessoa | 🔲 aberto | S-40…S-43, S-119 |
| R-06 | Falha ao gravar uso faz o orçamento contar menos | 🔲 aberto | admissão fecha com orçamento bloqueante (S-104) |
| R-07 | Primeiro turno após fork de conversa externa sem custo separável | 🔲 aberto | gravado como custo desconhecido (S-22) |
| R-08 | F2 e F3 dependem da moldura, navegação, notificações e status bar do plano 06 | 🔲 aberto | F0 e F1 podem andar antes |

### Notas a outros planos (registradas aqui, não editadas lá)

- **Plano 08:** o `turn.completed.costUsd` que ele soma para o custo da sessão passa a ser o do turno
  (B-07). Antes da B-07, somar os `costUsd` de uma sessão conta os turnos anteriores de novo.
- **Plano 05:** a exposição do `rate_limit_event`, atribuída a ele no ciclo 26 do plano 01, é feita
  por este plano na B-11, sem evento WS novo.

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
