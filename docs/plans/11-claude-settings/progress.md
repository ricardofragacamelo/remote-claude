# Plano 11 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-27
**Bloqueios:** nenhum em execução. Para a F0 começar, D-01, D-02, D-03 e D-19 precisam de resposta — as três primeiras dependem da medição da B-01, que é a primeira task ([decisões](decisions.md))

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
| [F0](F0-contract.md) | B-01…B-09 | 0/9 | 🔲 |
| [F1](F1-models-and-modes.md) | B-10…B-17 | 0/8 | 🔲 |
| [F2](F2-mcp-servers.md) | B-18…B-30 | 0/13 | 🔲 |
| [F3](F3-project-config.md) | B-31…B-40 | 0/10 | 🔲 |
| [F4](F4-e2e.md) | B-41…B-46 | 0/6 | 🔲 |
| **Total** | **B-01…B-46** | **0/46** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 199 | 199 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 22 | 21 | 0 | 1 | 0 |

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
| 2026-09-26 | [D-20](decisions.md#d-20--skills-de-projeto-usuário-e-sistema) — carregar skills do projeto, do usuário e do sistema, pelo plugin local sintético, sem ampliar `settingSources` | decisão do usuário, tomada ao planejar | B-02 (emenda à ADR-011), B-34, B-35, S-154…S-174, S-194, S-197; abriu a D-21 e a D-22 |

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
| R-01 | Servidor MCP e plugin são código arbitrário, subindo com a sessão | 🔲 aberto | mitigação por desenho na F2 |
| R-02 | Segredo de MCP vazando pelo argv, log, trilha, resposta ou erro do servidor | 🔲 aberto | o argv foi lido no `sdk.mjs` ao planejar; a B-01 confirma no `/proc` |
| R-03 | Hooks de projeto e `permissionMode` de subagent de projeto agindo sem aprovação | 🔲 aberto | depende da medição da B-01 |
| R-04 | Shell inline (`!`) de skill e slash command fora da aprovação | 🔲 aberto | D-21 bloqueia a B-35 |
| R-05 | Superfície do SDK `0.3.x` mudando sem aviso | 🔲 aberto | `smoke-live` na B-46 |
| R-06 | Sonda efêmera disputando a capacidade de sessões | 🔲 aberto | D-05 |
| R-07 | Regra `allow` de `mcp__<nome>` autorizando outro programa | 🔲 aberto | D-12 |
| R-08 | Subprocesso do CLI com o ambiente inteiro do backend | 🔲 aberto | B-20; mesma função que o plano 10 precisa |
| R-09 | Divergir dos planos 06 e 08 | 🔲 aberto | D-09, D-14 |

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
