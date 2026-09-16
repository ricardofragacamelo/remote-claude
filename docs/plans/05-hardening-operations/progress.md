# Plano 05 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-15
**Bloqueios:** **R-01 bloqueia a F2** — qual provedor OIDC real, com qual tenant e audience,
e quem o administra.

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
| [F0](F0-limits.md) | B-01…B-07 | 0/7 | 🔲 |
| [F1](F1-client-logs.md) | B-08…B-11 | 0/4 | 🔲 |
| [F2](F2-identity.md) | B-12…B-15 | 0/4 | 🔲 |
| [F3](F3-gates.md) | B-16…B-20 | 0/5 | 🔲 |
| [F4](F4-e2e.md) | B-21…B-24 | 0/4 | 🔲 |
| **Total** | **B-01…B-24** | **0/24** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 46 | 46 | 0 | 0 | 0 |

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
| — | — | — | — |

---

## Dívida herdada do plano 00

O que o [bootstrap](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado) adiou e **este**
plano assume. Item herdado sem dono vira item esquecido.

| Herdado | Onde fecha |
|---|---|
| `LogBuffer` e `beaconShipper` do web sem endpoint que os receba | B-08, B-09 |
| `LogBuffer` do app sem endpoint que o receba | B-08, B-10 |
| Tela de diagnóstico que liga `debug` em release | B-11 |
| Logout no `end_session_endpoint` (a metade do web) | B-15 |
| `osv-scanner` e o quality gate do SonarQube | B-16, B-17 |
| Job de e2e mobile no CI | B-18 |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Qual provedor OIDC real, e quem administra | 🔲 **aberto** | bloqueia a F2; o teste continua no Keycloak local |
| R-02 | Limite derivado da RAM pode ficar otimista | 🔲 aberto | piso e teto configuráveis; fórmula pura e testada (S-01) |
| R-03 | Varredura de órfã pode matar processo alheio | 🔲 aberto | casa por marca própria; S-07 existe para provar |
| R-04 | Ingestão de log aceita texto do cliente | 🔲 aberto | limite, rate limit e redação (S-17…S-19) |
| R-05 | Sonar e runner de e2e mobile exigem infraestrutura | 🔲 aberto | enquanto não existir, fica declarado ausente — nunca fingido verde |

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
