# Plano 04 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-16
**Bloqueios:** nenhum

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-transcript.md) | B-01…B-05 | 0/5 | 🔲 |
| [F1](F1-transcript-ui.md) | B-06…B-09 | 0/4 | 🔲 |
| [F2](F2-resume.md) | B-10…B-13 | 0/4 | 🔲 |
| [F3](F3-commands.md) | B-14…B-17 | 0/4 | 🔲 |
| [F4](F4-checkpoint.md) | B-18…B-21 | 0/4 | 🔲 |
| [F5](F5-e2e.md) | B-22…B-25 | 0/4 | 🔲 |
| **Total** | **B-01…B-25** | **0/25** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 67 | 67 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 7 | 0 | 0 | 7 | 0 |

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
| R-01 | O formato do JSONL é interno do Claude e muda sem aviso | 🔲 aberto | só funções do SDK (B-01); `smoke-live` cobre esta ponta (B-25) |
| R-02 | Sessão criada fora aparecendo pode confundir | 🔲 aberto | feature declarada, restrita à allowlist (D-01); origem vem do nosso banco — o SDK não a informa (S-11) |
| R-03 | O desfazer mexe no disco do usuário | 🔄 medido | spike confirmou que o `rewindFiles()` sobrescreve em silêncio, que o `dryRun` não avisa e que não há filtro por arquivo; por isso o mecanismo é nosso (D-06), e herdamos segurança de link e restauração atômica |
| R-04 | Transcript longo estoura memória a cada leitura | 🔄 medido | `limit`/`offset` não reduzem o trabalho do SDK (~30 MB por chamada); mitigação é cache por `lastModified` e limite de leituras concorrentes (D-02) |
| R-05 | Retomar sessão viva abriria um segundo subprocesso | 🔲 aberto | retomada de sessão viva é `attach` (S-24) |

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
