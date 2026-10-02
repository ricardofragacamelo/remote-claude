# Plano 10 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-02
**Bloqueios:** as oito decisões abertas de [decisions.md](decisions.md); a F0 espera D-03 e D-04, e a D-03 decide se o plano espera o 09 inteiro

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
| [F0](F0-norms.md) | B-01…B-04 | 0/4 | 🔲 |
| [F1](F1-session-frame.md) | B-05…B-09 | 0/5 | 🔲 |
| [F2](F2-composer.md) | B-10…B-14 | 0/5 | 🔲 |
| [F3](F3-header.md) | B-15…B-17 | 0/3 | 🔲 |
| [F4](F4-inline.md) | B-18…B-24 | 0/7 | 🔲 |
| [F5](F5-e2e.md) | B-25…B-27 | 0/3 | 🔲 |
| **Total** | **B-01…B-27** | **0/27** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 91 | 91 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 10 | 8 | 0 | 2 | 0 |

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
| 2026-10-02 | O plano nasceu do 09: o usuário pôs o app no mesmo molde, com paridade com o painel web (lá, D-17), primeiro como tarefas em cada fase do 09 e, na revisão, como plano próprio, logo depois dele. Entrou como **10** pelo `pnpm plan new --at 10`, e os planos que eram 10…19 passaram a 11…20 | pedido do usuário | o índice, o progresso geral, os planos 11…20 e as referências a eles em docs e comentários de código |
| 2026-10-02 | Ao planejar: o `i18n:check` não compara o web com o app, então "os mesmos verbos nas duas pontas" virou a B-03 e a D-04 | a regra 9 do `AGENTS.md`: regra que não é verificada por máquina não existe | F0, S-03, S-04 |
| 2026-10-02 | Ao planejar: o esforço só se escolhe antes da sessão (08 · D-16), e o app abre a sessão no toque na pasta; paridade com o esforço pede o rascunho | o spike do 08 (`applyFlagSettings` no meio da sessão desliga o `PreToolUse`) | F1 (B-08), D-05 |

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
| R-01 | testes de integração acoplados ao layout | 🔲 aberto | robô na B-04 |
| R-02 | teclado cobre o composer no Android | 🔲 aberto | B-06, S-11 |
| R-03 | card inline fora de vista | 🔲 aberto | pílula e `liveRegion` na B-22 |
| R-04 | pedido que fecha o teclado ou rouba o envio | 🔲 aberto | 09 · D-13, S-72, S-73 |
| R-05 | a lista ordenada quebra replay e `gap` | 🔲 aberto | B-05 migra os testes do stream |
| R-06 | relógio do indicador re-renderiza a lista | 🔲 aberto | relógio isolado, S-56 |
| R-07 | e2e do app lento e disputando a máquina | 🔲 aberto | um e2e de cada vez |
| R-08 | pressionar e segurar invisível ao TalkBack | 🔲 aberto | custom actions, S-84 |
| R-09 | decisões do 09 pensadas para mouse | 🔲 aberto | cada uma com o gesto do celular na F0 |

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
