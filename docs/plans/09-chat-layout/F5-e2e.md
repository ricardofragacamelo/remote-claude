# F5 — E2E

Plano: [09 — Layout do chat](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-inline.md).
**Entrega:** o layout provado pela porta do usuário, no desktop e no celular: os specs de antes verdes
no layout novo, o composer que nunca sai da tela, o ciclo inline do prompt à resposta e a
acessibilidade do painel em cada estado.

**Decisões que precisam estar fechadas para começar:** nenhuma ([decisions.md](decisions.md#f5--e2e)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-29 — Os specs de antes, no layout novo 🔲

`commands-and-undo`, `limits`, `live-session`, `session-stream`, `rule-cycle` e `mobile-approval` (a
ponta web), e os specs da F6 do 08 (B-53…B-56), que fecharam antes deste plano
([D-01](decisions.md#f0--normas)), verdes pelo page object da [B-03](F0-norms.md), sem `skip` e sem
afrouxar o que afirmam. Um
spec que afirmava o lugar antigo de um controle passa a afirmar o novo.

### B-30 — O composer nunca sai da tela 🔲

`e2e/specs/chat-layout.spec.ts`, com uma conversa longa roteirizada no fake (uma fixture nova de muitos
turnos, gravada como as do 08 · B-06), em 1280×800, 1024×600 e 360×640:

- o `boundingBox` da caixa fica dentro do viewport depois de rolar até o topo e até o fim;
- o documento e a side bar não rolam (`scrollHeight === clientHeight`); só o scroller rola;
- com o painel na largura mínima, nada rola na horizontal.

### B-31 — O ciclo inline pela porta do usuário 🔲

Prompt → o indicador na cauda → "Pensando…" e depois "Pensou por *n* s" → a tool → o card no lugar dela →
aprovar → a linha com a decisão → o resumo do turno. O composer fica visível em todos os passos.
Variações: rolar para cima com o pedido aberto mostra a pílula, e a pílula leva ao card; um pedido
respondido "no celular" (o segundo cliente do e2e) vira a linha com quem respondeu; parar pelo botão da
barra interrompe uma vez.

### B-32 — Acessibilidade e celular 🔲

`axe` sem violação no painel em rascunho, rodando, pedindo permissão e encerrada (no
`workbench-a11y`). O ciclo da B-31 só por teclado. No celular (360×640 e 360×400, que aproxima o teclado
aberto), o mesmo ciclo na view Claude, com o composer acima da barra de views. Rodar o spec duas vezes
seguidas dá o mesmo resultado.

---

## Cenários cobertos

S-81…S-86.

---

## Critério de conclusão

```bash
pnpm verify:full
```
