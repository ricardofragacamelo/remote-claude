# Plano 09 — Layout do chat

**Objetivo:** o painel do Claude se lê e se opera como o plugin do VS Code. Só a conversa rola, e o
composer, com os controles da sessão, fica sempre à vista. O processamento, a permissão e o plano para
aprovar aparecem **inline**, na própria conversa.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

A [D-02](decisions.md#f0--normas) deixou o contrato aberto: se uma fase achar um dado que o stream não
manda, a mudança entra nas três pontas, e `pnpm test:e2e:mobile` entra no critério daquela fase, pela
regra do [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md). Conferido em
2026-10-02: hoje nada pede.

**Depende de:** [plano 08 — Painel do Claude](../08-claude-panel/README.md), **F0…F6**: o painel, a
renderização, os diffs, o composer e o contexto que este plano rearranja, e o e2e do painel, que fecha
antes, no layout de hoje ([D-01](decisions.md#f0--normas)). Os specs dele migram para o layout novo aqui.

**Quem depende deste:** o [plano 10 — Layout do chat no app](../10-mobile-chat-layout/README.md), que
leva o mesmo molde ao app Flutter e lê as normas da [F0](F0-norms.md).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Em 2026-10-02 o usuário viu o painel do plano 08 rodando e reprovou o layout: "tem que ser mais igual ao
plugin do VS Code; o controle de prompt sempre tem que estar visível; o que rola é só a conversa". E
acrescentou: "Claude is thinking" inline no chat; as perguntas sobre execução de tool inline no chat;
os controles da sessão (parar, trocar o modelo) como no plugin; e mensagens de thinking e "thought" que
deem retorno visual de que há processamento. O plano 08 entregou **o que** o painel faz. Este plano muda
**onde** cada coisa fica.

O que se vê hoje, e por que acontece:

| O que o usuário vê | Causa no código | O que este plano faz |
|---|---|---|
| A barra lateral inteira rola, e o composer sai da tela | `SecondarySideBar` põe `overflow-y-auto` no contêiner de tudo, e o painel é uma pilha de blocos sem altura fixa | três faixas: cabeçalho fixo, conversa rolável, composer ancorado (F1) |
| Dois cards grandes ("Waiting for you", "Session") antes da conversa | `PermissionQueuePanel` e `SessionScreen` são `<Panel>` (card com título e descrição) | sem cards: a fila some do topo e a sessão vira a própria conversa (F1, F4) |
| "Nothing to decide" ocupa espaço sem pedido nenhum | o estado vazio da fila é desenhado sempre | sem pedido, nada aparece; com pedido, o card fica inline (F4) |
| "Claude is thinking…" e o rótulo `THINKING` no topo, longe da resposta | `TurnStatus` e `SessionControls` ficam acima da conversa | um indicador vivo na **cauda** da conversa, com thinking e "pensou por *n* s" na ordem (F4) |
| Interrupt, End session, Sonnet, Ask me, contexto, MCP e exportar em duas linhas de botões | `SessionControls` e `SessionHeader` empilhados | modo, modelo, esforço, contexto e enviar/parar na **barra da caixa**; o resto no cabeçalho e no menu da sessão (F2, F3) |
| "Undo file changes" e "Commands" como botões soltos que abrem regiões | `UndoPanel` e `CommandMenu` são `Disclosure` | o desfazer passa para a mensagem do prompt e para o menu; o `/` da barra substitui "Commands" (F2, F4) |
| "Write a prompt or add context to send." sempre visível | `SendRow` desenha o motivo do botão desligado | caixa vazia diz o motivo no nome acessível e no tooltip; bloqueio de verdade aparece na tela (F2) |
| O auto-scroll não acompanha a conversa | `useFollowTail` observa a `div` da conversa, que não é o elemento que rola | o follow tail passa para o scroller real (F1) |

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **A disposição muda; o contrato só muda se faltar dado** ([D-02](decisions.md#f0--normas)) | `permission.requested` já traz `toolUseId`, o status do turno já vem no stream, e thinking e subagent já chegam desde o 08 · F0. O contrato ficou aberto por decisão do usuário, mas a mudança precisa de um dado que falte, e entra nas três pontas de uma vez |
| **A permissão fica inline, inteira, e nunca fora de vista** | a regra que o 08 herdou do 03 continua: comando exato, risco, contagem, escopo e segundo passo. Muda só o lugar. O risco novo é o card rolar para fora da tela, e a pílula ancorada ([B-25](F4-inline.md)) responde a isso |
| **Um componente de composer para tudo** — rascunho, sessão e edição | hoje o rascunho e a sessão montam os seletores em lugares diferentes. Uma caixa com uma barra só deixa os dois iguais ao plugin e tira código repetido |

Este plano **não** abre ADR, porque não muda escolha de arquitetura. Muda padrão de UI, e isso é a
[F0](F0-norms.md) em [web/03-ui-system](../../architecture/web/03-ui-system.md).

---

## Escopo

### Entra

| | |
|---|---|
| As normas de UI do painel reescritas antes do código: três faixas, inline, foco, onde fica cada controle; chaves i18n; page object do e2e | F0 |
| A moldura: só a conversa rola, o composer ancorado, estados compactos, rascunho na mesma moldura, painel estreito, celular e teclado virtual | F1 |
| O composer como o do plugin: barra com `+`, `/`, modo, modelo, esforço, contexto e enviar/parar; fila, edição e recusa acima da caixa | F2 |
| O cabeçalho numa faixa: abas, nova conversa, histórico, alterações, status, e o menu da sessão (encerrar, exportar, desfazer, notificações, regras, ajuda) | F3 |
| Inline: o indicador de processamento, thinking e "pensou por *n* s", a permissão e o plano no lugar da tool, a pílula "esperando você", a lista de tarefas sobre a caixa e as ações da mensagem | F4 |
| E2E: os specs de hoje no layout novo, o composer que nunca sai da tela, o ciclo inline, acessibilidade e celular | F5 |

### Não entra

- **O app Flutter.** É o [plano 10](../10-mobile-chat-layout/README.md), logo depois deste
  ([D-03](decisions.md#f0--normas)), com paridade com o painel web. Ele lê as normas da F0 deste plano.
- **Funcionalidade nova do painel.** O que cada controle faz é o do plano 08. Aqui ele só muda de lugar.
  As exceções são a confirmação ao encerrar ([D-10](decisions.md#f3--cabeçalho)), que é consequência de
  esconder o botão num menu, e a retomada pelo Enter na sessão encerrada
  ([D-05](decisions.md#f1--moldura-do-painel)), que é o comportamento do plugin.
- **Tema, cores e tipografia.** Ficam os tokens de [web/03](../../architecture/web/03-ui-system.md#o-sistema-visual).
- **As outras views do workbench** (explorer, editor, busca, terminal). Só a secondary side bar muda, e só
  na forma de rolar.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério de
conclusão. A ordem é dependência, não preferência. Uma fase só começa com a anterior verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Normas](F0-norms.md) | as regras do painel novo em `web/03`, as chaves i18n e o page object do e2e | B-01…B-03 | ✅ |
| F1 | [Moldura do painel](F1-panel-frame.md) | só a conversa rola, e o composer fica ancorado em qualquer tamanho | B-04…B-08 | ✅ |
| F2 | [Composer](F2-composer.md) | a caixa com a barra do plugin: contexto, comandos, modo, modelo, esforço, contexto e enviar/parar | B-09…B-15 | ✅ |
| F3 | [Cabeçalho](F3-header.md) | uma faixa com abas, histórico, alterações, status e o menu da sessão | B-16…B-20 | ✅ |
| F4 | [Inline](F4-inline.md) | processamento, thinking, permissão, plano, tarefas e desfazer dentro da conversa | B-21…B-28 | ✅ |
| F5 | [E2E](F5-e2e.md) | o layout provado pela porta do usuário, no desktop e no celular | B-29…B-32 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md). Esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| As regras do painel novo escritas antes das telas, sem chave órfã nem literal | B-01, B-02 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-01, S-02 |
| Os e2e acham os controles por papel e nome, num lugar só | B-03 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-03 |
| O contrato só muda com as três pontas, e hoje nada pede | B-01 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-04 |
| Só a conversa rola; a página e a barra lateral não | B-04, B-05 | [web/03-ui-system](../../architecture/web/03-ui-system.md#anatomia-do-workbench) | S-05, S-06 |
| O fim da conversa acompanha o que chega, e a leitura rolada para cima é respeitada | B-05 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-07 |
| "Alterações" troca a conversa, e o composer fica | B-05 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) | S-08 |
| Encerrada, desconectada, parcial e histórico como faixas compactas | B-06 | [web/03-ui-system](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-09…S-11 |
| Na sessão encerrada, a caixa continua ativa e enviar retoma, uma vez só | B-06, B-10 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#retomada) | S-87…S-89 |
| Rascunho e sessão na mesma moldura | B-07 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-12 |
| Painel estreito, caixa alta, celular e teclado virtual sem perder o composer | B-08 | [web/03-ui-system](../../architecture/web/03-ui-system.md#o-workbench-abaixo-de-md) | S-13…S-17 |
| A barra da caixa com os controles do plugin; o esforço só se escolhe no rascunho | B-09, B-11, B-12 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-18, S-23…S-27, S-90 |
| Enviar e parar no mesmo lugar, uma vez só | B-10 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor) | S-19…S-22 |
| O contexto da janela à vista, com `/compact` | B-13 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) | S-33, S-34 |
| Fila, edição e recusa acima da caixa; o motivo de não enviar sem poluir | B-14 | [shared/04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-28…S-32 |
| O composer por teclado, com os atalhos de antes | B-15 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-35, S-36 |
| O cabeçalho numa faixa, com status e histórico | B-16, B-18, B-19 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-37, S-38, S-43…S-46, S-91 |
| O menu da sessão: encerrar (do dono, confirmado), exportar, desfazer, notificações, regras, ajuda | B-17 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#multi-cliente-na-mesma-sessão) | S-39…S-42 |
| A ajuda descreve os lugares novos | B-20 | [shared/02-i18n](../../architecture/shared/02-i18n.md#garantias-automatizadas) | S-47 |
| O processamento à vista, na cauda, com verbo, tempo e movimento que respeita `prefers-reduced-motion` | B-21 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-48…S-53 |
| Thinking vivo ("Pensando…") e encerrado ("Pensou por *n* s"), na ordem da conversa | B-22 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-54…S-57 |
| A permissão inline, inteira, no lugar da tool | B-23 | [web/03-ui-system](../../architecture/web/03-ui-system.md#permissão--a-tela-mais-importante) | S-58…S-65 |
| A aprovação do plano inline | B-24 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) | S-66 |
| A permissão nunca fora de vista, e sem roubar o foco de quem escreve | B-25 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#a-fila-de-permissão) | S-67…S-72 |
| A lista de tarefas sobre a caixa | B-26 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-73, S-74 |
| Editar, bifurcar e desfazer a partir da mensagem | B-27 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#desfazer-arquivos) | S-75…S-78 |
| Busca fixa no topo e linhas de sistema compactas | B-28 | [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens) | S-79, S-80 |
| O layout provado pela porta do usuário, no desktop e no celular | B-29…B-32 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-81…S-86 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
web/src/features/session/components/
├── panel/
│   ├── ClaudePanel.tsx        três faixas: PanelHeader · scroller · ComposerDock
│   ├── PanelHeader.tsx        abas, nova conversa, histórico, alterações, status, SessionMenu
│   ├── SessionMenu.tsx        encerrar (confirmado), exportar, desfazer, notificações, regras, ajuda
│   ├── StatusDot.tsx          conexão e estado, id da sessão e custo no tooltip
│   └── PendingPill.tsx        "Claude espera sua resposta (n)" sobre a caixa
├── frame/
│   ├── ChatFrame.tsx          a grade header / scroller / dock, e o único overflow
│   └── StateStrip.tsx         encerrada, desconectada, parcial, histórico — uma linha cada
├── composer/
│   ├── ChatComposer.tsx       a caixa única: rascunho, sessão e edição
│   ├── ComposerToolbar.tsx    + · / · modo · modelo · esforço · contexto · enviar/parar
│   ├── AddContextMenu.tsx     arquivo (@), anexo do computador, seleção do editor
│   └── TaskStrip.tsx          a lista de tarefas, recolhida numa linha
└── conversation/
    ├── WorkingIndicator.tsx   o asterisco animado, o verbo, o tempo
    ├── InlinePermission.tsx   o card do 03 no lugar da linha da tool
    └── MessageActions.tsx     editar · bifurcar · desfazer até aqui

removidos: SessionScreen (o <Panel>) · SessionControls · TurnStatus · SessionHeader
           o uso de PermissionQueuePanel no painel · UndoPanel/CommandMenu como Disclosure

web/src/features/workbench/components/SecondarySideBar.tsx   o filho controla a rolagem
e2e/fixtures/claude-panel.ts                                 page object do painel
e2e/specs/chat-layout.spec.ts                                o layout, inline e no celular
```

Os nomes são indicativos. A fase decide o arquivo pela
[estrutura normativa do web](../../architecture/web/01-architecture.md).

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | Os e2e de hoje (`commands-and-undo`, `limits`, `live-session`, `session-stream`, `rule-cycle`, `mobile-approval`) acham os controles pelo texto e pelo lugar atuais, e quebram em cascata a cada fase | **aberto** — o page object da [B-03](F0-norms.md) concentra os seletores; cada fase atualiza o que mexeu, e a F5 fecha |
| R-02 | Inline, o card de permissão pode rolar para fora da tela: é a "permissão fora de vista" que a norma proíbe | **aberto** — pílula ancorada sobre a caixa, badge da aba (08 · B-42) e anúncio `aria-live` ([B-25](F4-inline.md)) |
| R-03 | O card que chega pode roubar o foco de quem está escrevendo, e um Enter de prompt vira uma resposta ao pedido | **aberto** — [D-13](decisions.md#f4--inline): o card não tira o foco da caixa |
| R-04 | No celular, o teclado virtual cobre o composer ancorado | **aberto** — `dvh` e `visualViewport` na [B-08](F1-panel-frame.md), medidos num viewport baixo (S-15) |
| R-05 | A F6 do 08 escreve e2e contra o layout de hoje, e eles seriam reescritos aqui | **aceito** — [D-01](decisions.md#f0--normas): o 09 roda depois, e os specs da F6 do 08 migram pelo page object da B-03 |
| R-06 | Mover componentes mexe em muitos arquivos de teste, e a cobertura de 90 % é por arquivo | **aberto** — cada componente que muda de lugar leva o teste junto; nenhum teste é apagado sem o cenário ir para outro |
| R-07 | O indicador animado e a contagem de tempo re-renderizam a conversa a cada segundo | **aberto** — o relógio fica isolado no `WorkingIndicator`, e o `aria-live` anuncia só a troca de estado (S-52) |
| R-08 | Outra sessão do agente trabalha no plano 08 na mesma árvore | **aberto** — conferir `ps` e o `git status` antes de cada fase e antes de rodar `pnpm verify`, para um portão não reprovar pelo trabalho do outro |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. A fase só começa com as decisões que a bloqueiam fechadas. Ver
   [decisions.md](decisions.md).
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md) e rode `pnpm plan progress 09-chat-layout` a cada
   task concluída.
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. `pnpm verify:full` uma vez, ao fim da F5, com um e2e de cada vez.
