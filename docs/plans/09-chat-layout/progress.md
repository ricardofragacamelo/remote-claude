# Plano 09 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano não iniciado
**Última atualização:** 2026-10-02
**Bloqueios:** a F0 espera a F6 do plano 08 fechar ([D-01](decisions.md#f0--normas)). As 16 decisões estão fechadas, e o plano já foi revisado para as três que divergem da recomendação

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
| [F0](F0-norms.md) | B-01…B-03 | 0/3 | 🔲 |
| [F1](F1-panel-frame.md) | B-04…B-08 | 0/5 | 🔲 |
| [F2](F2-composer.md) | B-09…B-15 | 0/7 | 🔲 |
| [F3](F3-header.md) | B-16…B-20 | 0/5 | 🔲 |
| [F4](F4-inline.md) | B-21…B-28 | 0/8 | 🔲 |
| [F5](F5-e2e.md) | B-29…B-32 | 0/4 | 🔲 |
| **Total** | **B-01…B-32** | **0/32** | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 90 | 90 | 0 | 0 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 19 | 0 | 0 | 19 | 0 |

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
| 2026-10-02 | O plano nasceu como 19 e passou a **09**, logo depois do 08; os planos 09…19 viraram 10…19, com pastas, títulos, links, âncoras e referências corrigidos | pedido do usuário: o layout do chat vem logo depois do painel que ele rearranja | o índice, o progresso geral e os planos 11…20 |
| 2026-10-02 | O indicador de processamento ("Pensando…", "Pensou por *n* s", o glifo animado com verbo) entrou na F4 (B-21, B-22) | pedido do usuário durante o planejamento: retorno visual de que há processamento | F4, S-48…S-57, D-16 |
| 2026-10-02 | As 16 decisões foram respondidas pelo usuário. **Três divergem da recomendação e mudam o plano:** o 09 roda **depois** da F6 do 08 (D-01), o contrato WS/HTTP **pode mudar** (D-02), e na sessão encerrada a **caixa fica ativa e o Enter retoma** (D-05) | resposta do usuário | README (dependências, "o contrato fica", R-05), F0 (B-01, B-03), F1 (B-06), F2 (B-10), F5, scenarios.md (S-04, S-09, S-22, S-81 reescritos; S-87…S-89 novos). **Revisado na mesma data** |
| 2026-10-02 | O app saiu deste plano e ganhou o seu, o [10 — Layout do chat no app](../10-mobile-chat-layout/README.md). A D-03 tinha sido respondida "entra" e abriu as D-17…D-19; na revisão o usuário pôs o app num plano próprio. A D-17 e a D-19 foram para o 10, a D-18 foi descartada, e a D-03 passou a seguir a recomendação. Os planos que eram 10…19 passaram a 11…20, pelo `pnpm plan new --at 10` | pedido do usuário | decisions.md (D-03, D-17…D-19), F0 (sem tarefas do app) |
| 2026-10-02 | Na revisão, a B-11 ganhou o que faltava: **o esforço só se escolhe no rascunho**. Na sessão viva o chip é só leitura, com o motivo no tooltip | o plano dizia que "o rascunho e a sessão usam os mesmos chips", mas trocar o esforço com a sessão viva reinicia a query e desliga o `PreToolUse` (08 · D-16, spike de 2026-10-01) | F2 (B-11), S-90 |

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
| R-01 | e2e de hoje acoplados ao layout | 🔲 aberto | page object na B-03 |
| R-02 | card inline fora de vista | 🔲 aberto | pílula, badge e `aria-live` na B-25 |
| R-03 | card que rouba o foco de quem escreve | 🔲 aberto | D-13 |
| R-04 | teclado virtual cobre o composer | 🔲 aberto | B-08, S-15 |
| R-05 | F6 do 08 escrita no layout antigo | ✅ aceito | D-01: o 09 roda depois; os e2e da F6 do 08 são reescritos aqui pelo page object da B-03 |
| R-06 | cobertura de 90 % por arquivo ao mover componentes | 🔲 aberto | o teste acompanha o componente |
| R-07 | relógio do indicador re-renderiza a conversa | 🔲 aberto | relógio isolado, S-52 |
| R-08 | outra sessão do agente na mesma árvore | 🔲 aberto | conferir `ps` e `git status` antes de cada fase |

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
