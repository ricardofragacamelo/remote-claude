# F5 — E2E

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-inline.md).
**Entrega:** o layout provado no emulador, contra o backend roteirizado:

- os testes de integração de antes, verdes no layout novo;
- o composer que nunca sai da tela, com e sem teclado;
- o ciclo inline do rascunho à resposta;
- a acessibilidade da tela em cada estado e em fonte grande.

**Decisões que precisam estar fechadas para começar:** nenhuma ([decisions.md](decisions.md#f5--e2e)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-25 — Os testes de antes, no layout novo 🔲

`vertical_slice`, `permission_flow`, `rule_cycle`, `limits` e `history` verdes pelo robô da
[B-04](F0-norms.md), sem `skip` e sem afrouxar o que afirmam. O teste que afirmava a fila no topo passa a
afirmar o card inline. O que afirmava o ícone de encerrar passa a afirmar o menu `⋯` com a confirmação.

### B-26 — O composer nunca sai da tela, e o ciclo inline 🔲

`integration_test/chat_layout_test.dart`, com uma conversa longa roteirizada (a fixture de muitos turnos
do 09 · B-30):

- em 360×640 e com o teclado aberto, a caixa fica dentro da tela depois de rolar até o topo e até o fim,
  e só a conversa rola;
- o rascunho: escolher modelo, modo e esforço, enviar, e a sessão nasce com eles;
- o ciclo: prompt → indicador → "Pensando…" → "Pensou por *n* s" → tool → card inline → aprovar (com o
  segundo passo, se destrutivo) → linha decidida → resumo. A caixa fica visível o tempo todo;
- rolar para cima com o pedido aberto mostra a pílula, e a pílula leva ao card;
- um pedido respondido no navegador (o segundo cliente do e2e) vira a linha com quem respondeu;
- o app vai para background no meio do pedido e volta: replay, o card no lugar, nada duplicado.

### B-27 — Acessibilidade, fonte grande e repetição 🔲

`meetsGuideline` (`androidTapTargetGuideline`, `textContrastGuideline`, `labeledTapTargetGuideline`) na
tela de sessão em rascunho, rodando, pedindo permissão e encerrada. O ciclo da B-26 com a fonte em 200 %,
sem cortar o comando do card. Rodar o `chat_layout_test` duas vezes seguidas dá o mesmo resultado.

---

## Cenários cobertos

S-85…S-91.

---

## Critério de conclusão

```bash
pnpm test:e2e:mobile
pnpm verify:full
```
