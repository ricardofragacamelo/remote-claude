# Plano 17 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F0 ainda por começar; a F3 — o celular fica sabendo que foi aprovado — foi feita antes dela, em 2026-10-04, por pedido do usuário ([D-13](decisions.md#f3--o-celular-fica-sabendo-que-foi-aprovado))
**Última atualização:** 2026-10-05
**Bloqueios:** nenhum em execução — as decisões D-01…D-07 precisam fechar antes de a F0 começar, e a F2 depende do [plano 06](../06-workbench/README.md) entregue

```
F0 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F1 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ████████████████████ 100%   ✅ concluída
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-contract.md) | B-01…B-04 | 0/4 | 🔲 |
| [F1](F1-devices-backend.md) | B-05…B-15 | 0/11 | 🔲 |
| [F2](F2-devices-screen.md) | B-16…B-23 | 0/8 | 🔲 |
| [F3](F3-approval-push.md) | B-29…B-31 | 3/3 | ✅ |
| [F4](F4-e2e.md) | B-24…B-28, B-32 | 0/6 | 🔲 |
| **Total** | **B-01…B-32** | **3/32** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 132 | 119 | 0 | 13 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 16 | 12 | 0 | 4 | 0 |

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
| 2026-10-04 | **O plano ganhou a F4 — o celular fica sabendo que foi aprovado**, antes da F0 (D-13): o push `deviceApproved` e o app que se atualiza ao ser aprovado. Quatro tarefas (B-29…B-32), 14 cenários (S-119…S-132), quatro decisões (D-13…D-16) | pedido do usuário: aprovou o celular no navegador e o celular não ficou sabendo | F4 nova, README (fases e rastreio), decisions, scenarios |
| 2026-10-04 | **O E2E voltou a ser a última fase**: a fase do aviso de aprovação virou a F3, e o E2E, a F4, com a B-32 (o e2e do aviso) dentro dele | regra do usuário: o e2e é sempre a última fase; fase nova entra antes dele | F3-approval-push.md, F4-e2e.md, README, decisions, F1 (a referência ao caminho real) |

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
| R-01 | A revogação pode ser desfeita por corrida (`save()` reescreve `status`) | 🔲 aberto | encontrado na leitura do código em 2026-09-26; B-05 é a primeira task da F1 |
| R-02 | Último acesso é dado de rastreamento | 🔲 aberto | depende da [D-02](decisions.md#d-02--último-acesso) |
| R-03 | Push de teste como spam ou custo no provedor | 🔲 aberto | depende da [D-06](decisions.md#d-06--push-de-teste) |
| R-04 | Código de verificação lido como senha ou prova | 🔲 aberto | depende da [D-04](decisions.md#d-04--código-de-verificação) |
| R-05 | Revogar em lote o aparelho errado | 🔲 aberto | mitigado por B-20 (confirmação nominal, foco na saída) |
| R-06 | App antigo recebendo o kind `test` | 🔲 aberto | conferir o lado Android em B-15 |
| R-07 | Plano 06 atrasar a navegação, o screen frame ou o centro de notificações | 🔲 aberto | a F2 não começa sem o 06 |
| R-08 | Respostas antigas sem aparelho no histórico | ✅ aceito | ficam como "aparelho não registrado nesta versão" (S-63) |

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
