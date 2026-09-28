# Plano 08 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-28
**Bloqueios:** a F0 só começa com as decisões dela fechadas (D-01, D-02, D-03, D-05, D-06, D-14, D-15,
D-16, D-19, D-22), seis delas com spike contra o Claude real — ver [decisions.md](decisions.md#f0--contrato)

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
| [F0](F0-contract.md) | B-01…B-06 | 0/6 | 🔲 |
| [F1](F1-sessions.md) | B-07…B-13 | 0/7 | 🔲 |
| [F2](F2-rendering.md) | B-14…B-24 | 0/11 | 🔲 |
| [F3](F3-diffs.md) | B-25…B-31 | 0/7 | 🔲 |
| [F4](F4-chat-panel.md) | B-32…B-43 | 0/12 | 🔲 |
| [F5](F5-composer-and-context.md) | B-44…B-52 | 0/9 | 🔲 |
| [F6](F6-e2e.md) | B-53…B-58 | 0/6 | 🔲 |
| **Total** | **B-01…B-58** | **0/58** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 272 | 272 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 24 | 23 | 0 | 1 | 0 |

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
| 2026-09-28 | D-11 fechada pela D-11 do plano 06 (sessões das abas inativas continuam anexadas); B-12 reescrita e D-24 aberta, porque o 06 removeu `/sessions/$id` e `/history…` sem deep link (06 · D-07); a B-12 e a B-56 recebem de volta os cenários de e2e de histórico e retomada que o 06 tirou do web | decisões do usuário no plano 06, em 2026-09-28 | [decisions.md](decisions.md) D-11, D-24; B-12, B-56; S-52…S-54, S-266 |
| 2026-09-26 | O composer e o contexto viraram fase própria (F5), e o e2e passou a F6 (`F5-e2e.md` → `F6-e2e.md`) | pedido explícito do usuário: escolher o contexto do prompt como no plugin do Claude (`@`, arrastar, `/` para comando ou skill, autocomplete) — uma fase é a unidade de validação, e o composer é uma fronteira de segurança | as fases F5 e F6, as tasks B-44…B-58 e os cenários S-197…S-272 |
| 2026-09-26 | Skills carregam de projeto, usuário e sistema; as de usuário e sistema pelo plugin local do plano 11 | decisão do usuário; mantém o `settingSources: ['project']` do ADR-011 | B-50, S-241…S-243, S-272 |
| 2026-09-26 | O `@problemas` saiu, e nada aqui depende de inteligência de linguagem, depuração ou git | decisão do usuário: esses planos foram removidos | B-48, "Não entra" |

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
| R-01 | Markdown do modelo como vetor de exfiltração (imagem remota, link perigoso) | 🔲 aberto | mitigado por desenho na B-14 |
| R-02 | "Ativa em outro lugar" é heurística | 🔲 aberto | D-06 mede o intervalo real de escrita |
| R-03 | Subpastas no histórico custam a varredura do store inteiro | 🔲 aberto | D-05 |
| R-04 | Teto de 10 sessões da instalação esgotado por abas e conversas | 🔲 aberto | D-07, D-09, D-13 |
| R-05 | A referência lê o disco, não o buffer sujo | 🔲 aberto | aviso no chip (B-51) |
| R-06 | A prévia do diff na permissão pode ficar velha | 🔲 aberto | relida ao focar (B-29) |
| R-07 | Interfaces dos planos 06, 07 e 09 ainda não existem em código | 🔲 aberto | divergência vira decisão registrada |
| R-08 | Imagem pelo streaming input não medida; frame de 64 KB | 🔲 aberto | D-02 |
| R-09 | Peso de markdown, realce, ANSI e composer no bundle | 🔲 aberto | medir na B-14 |
| R-10 | `@caminho` expandido pelo CLI sem `PreToolUse` | 🔲 aberto | D-01, `smoke-live` S-271 |
| R-11 | Rejeitar trecho escreve no disco com três versões em jogo | 🔲 aberto | D-08 |
| R-12 | Subagents encaminhados enchem o ring buffer | 🔲 aberto | D-15 |

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
