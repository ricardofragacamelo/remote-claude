# F1 — Moldura do painel

Plano: [09 — Layout do chat](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md).
**Entrega:** o painel em três faixas, com cabeçalho fixo, conversa rolável e composer ancorado, em
qualquer largura de painel, no desktop e no celular. Nesta fase o conteúdo de cada faixa ainda é o de
hoje (os seletores e os botões mudam de lugar na F2 e na F3). Muda a moldura e somem os cards.

**Decisões que precisam estar fechadas para começar:** D-04 e D-05
([decisions.md](decisions.md#f1--moldura-do-painel)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-04 — A secondary side bar deixa a rolagem para o filho ✅

Hoje o [SecondarySideBar](../../../web/src/features/workbench/components/SecondarySideBar.tsx) rola tudo
(`overflow-y-auto` no contêiner), e a view Claude do celular, no `FolderShell`, também. Os dois passam a
dar ao filho **altura definida** (`min-h-0 flex-1`, sem overflow), e o painel decide o que rola. A side
bar só tem o Claude como filho. Se outro plano registrar outra coisa ali, a regra é a mesma: o filho
rola por conta própria.

### B-05 — `ChatFrame`: as três faixas e o único scroller ✅

Uma grade `auto · 1fr · auto` com `h-full`. O scroller do meio é o **único** `overflow-y-auto` do painel,
com `overscroll-contain` para a rolagem não vazar para a página. O `useFollowTail` passa a observar esse
scroller. Hoje ele observa a `div` da conversa, que não rola, e por isso o fim não acompanha o que chega
(S-07). O pane "Alterações" troca **só** o conteúdo do scroller: o composer, o texto escrito e o
contexto ficam (S-08).

### B-06 — A sessão sem card, e os estados em faixas ✅

A `SessionScreen` deixa de ser um `<Panel>`: somem o título "Session", o id da sessão em texto e a linha
"Connected". Os estados viram **faixas de uma linha** (`StateStrip`):

- desconectado ou reconectando: faixa fina no topo do scroller, que some sem mexer no composer;
- replay parcial, histórico carregando e histórico que falhou ("tentar de novo"): no topo do scroller;
- encerrada: faixa acima da caixa, com o motivo. A caixa **continua ativa**
  ([D-05](decisions.md#f1--moldura-do-painel)): enviar retoma a conversa pelo fluxo de retomada do 04/08
  e manda o prompt, como no plugin. A faixa diz isso ("enviar retoma a sessão"), porque retomar abre um
  subprocesso novo, que conta no teto. Com o teto cheio, a recusa aparece acima da caixa, e o texto e o
  contexto ficam.

O id da sessão vai para o tooltip do status ([B-18](F3-header.md)).

### B-07 — O rascunho na mesma moldura ✅

A `DraftView` usa o `ChatFrame`: as dicas (`@`, `/`, arrastar, o atalho) ficam no scroller vazio, como o
estado vazio do plugin, e a caixa fica ancorada embaixo. Os seletores de modelo, modo e esforço ficam
onde estão até a [B-11](F2-composer.md) levá-los para a barra da caixa.

### B-08 — Painel estreito, caixa alta, celular e teclado virtual ✅

- **Painel estreito:** na largura mínima da [D-04](decisions.md#f1--moldura-do-painel), nada rola na
  horizontal. As abas do cabeçalho rolam na própria faixa.
- **Caixa alta:** a caixa cresce até o teto da D-04 e depois rola por dentro. A conversa sempre fica com
  área visível.
- **Celular:** abaixo de `md`, a view Claude ocupa o espaço entre o seletor de abas e a barra de views,
  com altura em `dvh`.
- **Teclado virtual:** a altura acompanha o `visualViewport`, e o composer fica acima do teclado.
- **Redimensionar:** cruzar `md` nos dois sentidos não perde texto, rolagem nem aba
  ([web/03 · O workbench abaixo de `md`](../../architecture/web/03-ui-system.md#o-workbench-abaixo-de-md)).

---

## Cenários cobertos

S-05…S-17, S-87.

---

## Critério de conclusão

```bash
pnpm verify
```
