# Plano 02 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-09-16
**Bloqueios:** nenhum. As decisões em aberto foram fechadas em 2026-09-15; só
[D-17](decisions.md) segue ⛔, travada pelo [plano 06](../06-distribution/decisions.md), e ela
não impede fase nenhuma deste plano.

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
| [F0](F0-device.md) | B-01…B-07, B-30 | 0/8 | 🔲 |
| [F1](F1-push.md) | B-08…B-13, B-31, B-32 | 0/8 | 🔲 |
| [F2](F2-mobile-session.md) | B-14…B-19 | 0/6 | 🔲 |
| [F3](F3-mobile-permission.md) | B-20…B-25, B-33 | 0/7 | 🔲 |
| [F4](F4-e2e.md) | B-26…B-29, B-34 | 0/5 | 🔲 |
| **Total** | **B-01…B-34** | **0/34** | 🔲 |

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
| [Decisões](decisions.md) | 17 | 0 | 0 | 16 | 1 |

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
| 2026-09-15 | As 16 decisões do plano fechadas ([decisions.md](decisions.md)) | quatro já estavam respondidas em fase, cenário ou documento normativo e continuavam abertas; oito gaps não tinham registro nenhum | R-01 fechado; tarefas novas em F0, F1, F3 e F4, ainda fora das fases e da matriz |

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
| Tela de gerenciamento de device | B-06 |
| Cenários de autenticação do mobile, que entram com o registro de device | B-07, S-01…S-14 |
| Logout no `end_session_endpoint` do provedor | B-25 |
| `-Xmx8G` default do template Flutter | B-29 |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Qual provedor de push | ✅ fechado | **FCM direto**, Android só ([D-03](decisions.md), [D-12](decisions.md)); o nome não sai da configuração |
| R-02 | Push é um terceiro no caminho de uma decisão de segurança | 🔲 aberto | mitigado: payload sem conteúdo, e a tela revalida no servidor |
| R-03 | Biometria não é confiável em emulador de CI | 🔲 aberto | regra testada por widget com autenticador fakeado |
| R-04 | Notificação entregue depois do `expiresAt` | 🔲 aberto | tratado como caso normal — S-57 |
| R-05 | O e2e do app é caro e já derrubou uma máquina | 🔲 aberto | cgroup da F6 do bootstrap + teto do Gradle (B-29) |

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
