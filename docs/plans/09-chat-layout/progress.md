# Plano 09 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F0…F5 concluídas — o plano está pronto
**Validação:** F0+F1: `pnpm verify:full` de 2026-10-03 verde (ciclos 1–8). F2+F3: `pnpm verify` de 2026-10-03 verde (ciclos 9–12). F4+F5: `pnpm verify:full` de 2026-10-03 verde, portões 1–11, e2e 122/122, depois dos ciclos 13–16; o `chat-layout.spec` rodado duas vezes seguidas, 36/36 (S-86)
**Última atualização:** 2026-10-03
**Bloqueios:** nenhum. O aviso externo do `braces` (GHSA-vfj7-8cjw-p6xm, sem versão corrigida) que parou o portão 10 em 2026-10-03 virou exceção datada pela [ADR-019](../../architecture/shared/00-decisions.md#adr-019--aviso-de-dependência-sem-versão-corrigida-exceção-datada-por-adr), que **vence em 2026-11-02**

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-03 | 3/3 | ✅ |
| [F1](F1-panel-frame.md) | B-04…B-08 | 5/5 | ✅ |
| [F2](F2-composer.md) | B-09…B-15 | 7/7 | ✅ |
| [F3](F3-header.md) | B-16…B-20 | 5/5 | ✅ |
| [F4](F4-inline.md) | B-21…B-28 | 8/8 | ✅ |
| [F5](F5-e2e.md) | B-29…B-32 | 4/4 | ✅ |
| **Total** | **B-01…B-32** | **32/32** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 92 | 0 | 0 | 92 | 0 |

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
| 1 | 2026-10-02 | F0+F1 | 1 — formatação | `web/index.html` editado (o `interactive-widget` da B-08) sem passar pelo Prettier | `prettier --write` no arquivo | reinício do portão 1 |
| 2 | 2026-10-02 | F0+F1 | 3 — tipos | o fixture novo `e2e/fixtures/chat-layout.ts` usava `document` e `window`, e o e2e compila sem os tipos do DOM | ler a página pelo `ownerDocument` do elemento, como o `page-checks.ts` faz; e a complexidade do teste do painel estreito, que o lint pegou junto, numa função própria | reinício do portão 1 |
| 3 | 2026-10-02 | F0+F1 | 9 — e2e (`verify:full`; 1–8 verdes) | `chat-layout` (S-05, S-13, S-15) achou a caixa fora da tela, e os specs do 08 (`claude-panel-*`, `commands-and-undo`) clicavam em botões tapados pelo dock: o cabeçalho da sessão e o card vazio "Waiting for you" tomavam a altura toda, o scroller ficava com 0 px e o dock vazava para baixo | a fila sem pedido não ocupa espaço, a do pedido tem teto; a grade dá prioridade à caixa e o cabeçalho tem teto e rola por dentro (decisões da F1, abaixo) | reinício do portão 1 |
| 4 | 2026-10-02 | F0+F1 | 9 — e2e (só os specs que falharam, para diagnóstico) | `chat-layout` e os specs do 08 ainda clicavam em botões tapados: medido por um spec temporário, o scroller tinha 0 px a 1280×720 — cabeçalho do painel (abas, ícones e a nota de notificações recusadas em várias linhas), cabeçalho da sessão e dock somavam a altura toda. E a S-16 voltou a 128 px em vez de 120: o layout do celular, mais estreito, move a rolagem em alguns pixels | as três compactações antecipadas (decisões da F1), o teto do cabeçalho da sessão a 25 %, e a S-16 com a folga de uma linha (24 px) do cenário; o `useVisualViewport` também lê o `resize` da janela | reinício do portão 1 depois dos specs |
| 5 | 2026-10-02 | F0+F1 | 9 — e2e (os specs do painel; 19 de 21 verdes — os do 08 todos) | a S-15 a 360×400 não cabe com o cabeçalho e o composer de hoje (ver o escopo adiado), e a S-16 voltou a 36 px de onde estava — o reflow do layout estreito e o *scroll anchoring* do navegador | a S-15 fica a 360×640 e o 360×400 vai para a F3 (S-91), por decisão do usuário; a S-16 afirma o que o cenário pede — nem o topo, nem o fim, e a até duas linhas (48 px) de onde estava. E, a 360×640, o documento rolava 10 px: os itens da status bar têm altura de toque (44 px) abaixo de `md`, e a barra não — ela passou a ter a altura de toque lá | reinício do portão 1 |
| 6 | 2026-10-02 | F0+F1 | 9 — e2e (`verify:full`; 1–8 verdes, 102 de 106 no e2e) | o axe do `workbench-a11y` e do `explorer-editor` (tema claro e escuro) achou `scrollable-region-focusable` no scroller da moldura: numa tela baixa, as dicas do rascunho rolam e não há nada focável dentro | o scroller passa a ser focável (`tabIndex={0}`, com anel de foco), com a supressão local de `jsx-a11y/no-noninteractive-tabindex` justificada na linha — o mesmo caso e o mesmo padrão do `DiffHunks` (08 · S-268); teste de integração afirma o `tabindex` | reinício do portão 1 |
| 7 | 2026-10-02 | F0+F1 | 7 — cobertura (do backend, que a F0/F1 não tocam) | `drizzle-audit-trail.reader.spec` estourou o *statement timeout* do Postgres ao inserir 40 mil linhas, com a carga da máquina em 27; o coverage do web da mesma rodada ficou órfão depois que o verify parou | nenhuma mudança de código: o teste passa sozinho (20/20). O órfão foi encerrado antes da rodada seguinte | reinício do portão 1 |
| 8 | 2026-10-03 | F0+F1 | 10 — segurança (1–9 verdes; e2e 106/106; o 11 rodado à mão, verde) | `pnpm audit` e `osv-scanner` acham o GHSA-vfj7-8cjw-p6xm, `braces` 3.0.3 (*stack exhaustion* por padrão aninhado), **sem versão corrigida**; o único caminho é `jscpd` 4.3.0 → `@jscpd/finder` → `fast-glob` → `micromatch` → `braces`, dependência de desenvolvimento do portão de duplicação | nenhuma — não há versão para atualizar, e ignorar o id é proibido pelo script. Escalado ao usuário, que escolheu atualizar o `jscpd` para a 5.x. **Tentado e revertido:** a 5.4.0 é outro motor — com o mesmo `.jscpd.json` acha 131 clones (em `web/src`, `backend/src`, `mobile/lib` e no `pnpm-lock.yaml`) onde a 4.3.0 acha 0, e adotá-la pediria refatorar tudo isso ou recalibrar o limiar do portão 5, o que o protocolo proíbe. `package.json` e `pnpm-lock.yaml` voltaram ao commit. De passagem, a 4.3.0 achou 1 clone no `chat-layout.spec` (as asserções de página repetidas), extraído num helper | o usuário escolheu a exceção datada: [ADR-019](../../architecture/shared/00-decisions.md#adr-019--aviso-de-dependência-sem-versão-corrigida-exceção-datada-por-adr), `scripts/accepted-advisories.json` (só este id, `braces` 3.0.3, só por `.>jscpd>`, até 2026-11-02) e `scripts/lib/accepted-advisories.mjs`, com teste; o `scan-security` passa a julgar o `pnpm audit --json` e o osv por ela e diz a exceção a cada execução | reinício do portão 1 |
| 9 | 2026-10-03 | F2+F3 | 5 — duplicação (lint, tipos e arquitetura verdes) | 10 clones: os imports e o gatilho "menu com tooltip" repetidos no `McpIndicator`, no `SessionMenu` e no `AddContextMenu` (e iguais aos do `ExplorerToolbar` e do `EditorStatus`), a moldura de diálogo do `ExportDialog`/`UndoDialog`/encerrar (igual ao `ExplorerDialog` e ao `RestoreDialog`), a sessão ativa calculada no `ClaudePanel` e no `PanelHeader`, a face do chip repetida no `ChoiceMenu`, e dois preâmbulos repetidos no `chat-layout.spec` | reuso de verdade, sem mexer no limiar: `MenuTrigger` em `shared/components` (usado também pelo explorer e pelo editor), o `ExplorerDialog` promovido a `shared/components/DialogFrame` com o `ActionDialog` do painel em cima dele (o `PathList` duplicado dentro dele trocado pelo de `shared`), `sessionShownIn`, `ChipFace` e os ajudantes `aPhoneSession`, `aConversationReadHalfway` e `stillWhereLeft` no spec | reinício do portão 1 |
| 10 | 2026-10-03 | F2+F3 | 9 — e2e (rodado antes do `verify` para os cenários de e2e da fase; 105 de 110) | (a) a S-05, a S-13 e a S-46 acharam o painel rolando: o texto só para leitor de tela (`sr-only`, absoluto) das mensagens escapava do scroller, que não era posicionado, e esticava a aside; e na moldura estreita o chip de modo não encolhia; (b) o `04·S-50` e o `07·S-285` procuravam "Last undo" dentro do painel, e o desfazer virou diálogo; (c) os chips e as faixas saíam no tamanho padrão do navegador: o token `text-ui-xs`, usado em 27 arquivos desde o plano 08, **nunca foi definido** em `globals.css` | (a) o scroller da `ChatFrame` passou a `relative`, medido por um diagnóstico temporário (já removido), e o chip encolhe e corta o valor; (b) o page object acha o relatório no diálogo; (c) `--text-ui-xs` definido nas duas densidades e citado em web/03 | e2e 110/110; reinício do portão 1 |
| 11 | 2026-10-03 | F2+F3 | 7 — cobertura (1–6 verdes) | o `public-dev-server.spec` não sobe o Vite: a porta 5173 está tomada por um `pnpm --filter ./web dev` iniciado às 11:21 fora desta execução. Toda a outra suíte do portão passou (web: nenhum arquivo abaixo de 90 %) | nenhuma mudança de código; o processo não foi encerrado sem o dono pedir | reinício do portão 1 com a porta livre |
| 12 | 2026-10-03 | F2+F3 | 7 — cobertura (1–6 verdes; porta 5173 livre) | dois testes de integração do **backend**, que a F2/F3 não toca, estouraram o tempo com a carga da máquina em 18: o `drizzle-audit-trail.reader.spec` (o *statement timeout* ao inserir 40 mil linhas, o mesmo do ciclo 7) e o `push.flow.spec` (S-51, "no frame arrived") | nenhuma mudança de código: a carga era do próprio portão | reinício do portão 1 — `pnpm verify` verde (1–7) |
| 13 | 2026-10-03 | F4+F5 | 9 — e2e (só os specs que a fase tocou, antes do `verify`; 20 de 29) | os 9 testes novos que esperavam o card **no lugar** da `Write` do `tool-turn` não o acharam: o fake dispara todos os hooks do turno na primeira tool, e o pedido da `Write` chega antes da linha dela — o caso da cauda da D-12, que a UI trata certo. Sem resposta, o prazo recusou cada pedido | o page object separa o card **na conversa** (no lugar ou na cauda, `inlineCardFor`) do card **no lugar** (`cardInPlaceOf`); os casos no lugar usam o `long-tool-turn`, cuja primeira tool é a que pede; a S-83 segue com o `tool-turn` pelo pensamento | e2e dos três specs de novo |
| 14 | 2026-10-03 | F4+F5 | 9 — e2e (os três specs de novo; 21 de 26) | (a) o `tool-turn` só manda o pensamento **depois** da resposta (os hooks vêm antes do resto do turno), e esperar o "Pensou" antes de aprovar deixava o prazo de 15 s do e2e recusar o card; (b) `Mod+Alt+P` não disparava com o foco na caixa — atalho do workbench não dispara em campo de texto sem `allowInInput`; (c) a 360×400 o clique no card caía sobre o dock (ver o escopo); (d) o teste de axe encerrava a sessão pelo menu e o `afterEach` tentava encerrá-la de novo | (a) a S-83 afirma o pensamento depois da resposta, e a ordem na conversa (pensamento antes da tool decidida); (b) o atalho ganha `allowInInput` — é para quem escreve (D-13), e o acorde não digita nada; teste de unidade afirma; (c) o teste do teclado aberto afirma a caixa e a pílula, e responde com o teclado fechado; (d) o teste não registra a sessão para o `afterEach` | e2e dos três specs de novo |
| 15 | 2026-10-03 | F5 | 9 — e2e (`chat-layout` duas vezes seguidas, a S-86; 34 de 36) | o teste do teclado aberto esperava a pílula, mas com ~20 px de conversa uma fatia do card às vezes fica à vista — e card em parte à vista conta como à vista. Os outros três specs passaram 26/26 | o teste afirma o que é sempre verdade: o pedido anunciado na região viva acima da caixa, e a caixa inteira | `chat-layout` duas vezes seguidas: 36/36 |
| 16 | 2026-10-03 | F4+F5 | 5 — duplicação (`verify:full`; 1–4 verdes) | 6 clones: a linha de sistema repetida no `TurnRow`, o estado vazio do store repetindo o `SILENT` do reducer (com o `turnSince` novo), o relógio de um segundo no `usePermissionQueue` e no `useElapsed`, um bloco de imports igual ao do `useDraft`, e o preâmbulo de três testes do `chat-layout.spec` | reuso de verdade, sem mexer no limiar: `SystemRow`, o `EMPTY` do store feito do `SILENT`, `useClock` em `shared/hooks` (com teste), os imports reordenados e o ajudante `aSessionOpened` | reinício do portão 1 |
| 17 | 2026-10-03 | F4+F5 | — | `pnpm verify:full` verde: 1–11, e2e 122/122; o portão 10 diz a exceção da ADR-019 (`braces`, vence em 2026-11-02) | — | **pronto** |

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

### F0 — o que a fase conferiu e inventariou

**O contrato (B-01, [D-02](decisions.md#f0--normas)).** Conferido de novo em 2026-10-02, contra
`packages/contracts/schema`: o `toolUseId` vem em `permission.requested`, `tool.started`,
`tool.completed` e `tool.progress`; o status do turno, em `session.status.changed`; o `blockType` do
thinking, em `message.delta`; a fila, em `prompt.queued` e `prompt.dequeued`, com
`session.cancelQueuedPrompt`; o modelo e o modo, em `session.setModel` e `session.setPermissionMode`; o
catálogo, em `GET /catalog`. **Nenhum schema muda** na F0 nem na F1, e por isso o `test:e2e:mobile`
não entra no critério delas.

**As chaves i18n (B-02).** Cada uma sai na fase que tira o uso, nunca antes — chave órfã reprova o
`i18n:check`.

| Chave | Muda em | O que acontece |
|---|---|---|
| `session.screen.title` | F1 | **saiu**: a sessão deixou de ser um card com título |
| `session.screen.sessionLabel` | F1 | fica, como o nome acessível da moldura da sessão; o id em texto volta no tooltip do status (B-18) |
| `session.ended.resumes`, `session.ended.resumeAndSend` | F1 | **entraram**: a faixa da sessão encerrada e o botão que retoma ([D-05](decisions.md#f1--moldura-do-painel)) |
| `session.composer.label` | F2 | sai com o rótulo "PROMPT" visível (S-18); o nome acessível da caixa passa a outra chave |
| `commands.menu.toggle` | F2 | sai com o botão "Commands" ([D-08](decisions.md#f2--composer)) |
| `permission.queue.emptyTitle`, `permission.queue.emptyDescription` | F4 | saem com a fila do topo (S-65) |
| `undo.panel.toggle` | F3/F4 | sai quando o desfazer for para o menu e para a mensagem ([D-15](decisions.md#f4--inline)) |
| `session.history.open` | — | fica: o `onOpenHistory` da `SessionScreen` continua, e o teste dele também |
| verbos do indicador (`sessions.working.verbs.*`), pílula, menu da sessão, confirmação de encerrar | F3/F4 | entram nas fases que os desenham |

Os tópicos da `PanelHelp` que mudam de texto ficam para a [B-20](F3-header.md), como a F0 manda.

**O page object (B-03).** `e2e/fixtures/claude-panel.ts` concentra os controles do painel por papel e
nome: a caixa, enviar, enviar de novo, pôr na fila, retomar e enviar, interromper, encerrar, comandos,
desfazer, o chip de modo, alterações, a fila, o card de permissão de uma tool (com aprovar e recusar),
a conversa, o rascunho, a moldura da sessão e o seu scroller, o resumo dos turnos e a linha
"Conectado". `cardFor`, `send`, `messagesOn`, `conversationOf`, `draftOf`, `turnsEnded`,
`sessionLabelOf` e `openedSessionOf` saíram de `history.ts` e `workbench.ts` para ele, sem ciclo de
import. `live-session`, `session-stream`, `rule-cycle` e `mobile-approval` não acham nada do painel por
localizador (falam pelo socket ou pela tela de regras) e não precisaram mudar. O indicador e a pílula
entram no page object na F4, que os desenha.

### F1 — decisões da execução

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-02 | Até a F4, a fila de permissão fica **no topo do dock**, acima da caixa, e não no topo do scroller; **sem pedido, ela não ocupa espaço** (só a linha de como o último foi decidido), e com pedido ela tem um teto de 45 % da moldura e rola por dentro | com o follow tail funcionando, o card no topo da conversa sairia de vista a cada delta — a "permissão fora de vista" do R-02. No dock ele nunca rola para fora. O card vazio "Nothing to decide" no dock comia a altura inteira do painel (ciclo 3), por isso o modo silencioso (`quietWhenEmpty`) entrou já aqui; a remoção das chaves do estado vazio continua na F4 (S-65), quando a fila sai do painel | `ClaudePanel` (`SessionPane`), `PermissionQueuePanel`, R-02 |
| 2026-10-02 | Quando a moldura é baixa, **a caixa é o que fica inteiro**: as linhas da grade são `minmax(0,auto) · minmax(0,1fr) · auto`, o cabeçalho da sessão tem teto de 25 % e rola por dentro, e a nota de notificações recusadas fica em duas linhas na tela (o leitor de tela lê tudo) | o ciclo 3 mostrou o cabeçalho (custo, interromper, encerrar, modelo, modo, contexto) e a nota longa empurrando a caixa para fora da tela. A F2 e a F3 encolhem esse cabeçalho para uma faixa; até lá o teto garante a caixa | `ChatFrame`, `ClaudePanel` |
| 2026-10-02 | Três compactações **antecipadas** da F2 e da F3: o rótulo "PROMPT" deixa de ser visível (fica como nome acessível — parte da S-18), o motivo de não enviar com a caixa vazia vai para a descrição acessível e o tooltip (a D-07, parte da S-28; bloqueio real continua na tela), e a nota de notificações recusadas vai para o nome e o tooltip do sino (parte da S-42) | medido no navegador (ciclo 4): a 1280×720, a moldura tinha 439 px, o cabeçalho levava 126 e o dock 313, e o scroller ficava com **0 px**. Com as três, a conversa ganha a área que a F1 promete; a F2 e a F3 terminam o resto (barra da caixa, cabeçalho numa faixa) | `PromptComposer`, `ClaudePanel`; S-18, S-28 e S-42 continuam ⬜ até as fases delas |
| 2026-10-02 | O id da sessão é o **nome acessível da moldura** (`region` "Session *id*"), e não mais texto | a B-06 tira o id em texto, e o tooltip do status só vem na B-18; o nome da região mantém a sessão achável pelo leitor de tela e pelos testes | `SessionScreen`, page object (`sessionLabelOf`), specs de integração |
| 2026-10-02 | O follow tail mora na **moldura**, observa o scroller e o tamanho do conteúdo (`ResizeObserver`), e a posição de cada aba fica no store do painel da pasta | o observar por render deixava de fora o que cresce sem render (bloco lazy, a caixa que cresce); e a rolagem tinha de sobreviver à troca de pane e ao cruzar `md` (S-08, S-16) sem vazar entre abas de pasta (S-17) | `useFollowTail`, `useScrollKeeper`, `claude-panel.store` (`scrolls`), web/04 |
| 2026-10-02 | A retomada pelo Enter (D-05) reusa o primeiro prompt do rascunho (`firstPrompt`): a aba da sessão encerrada é promovida à da retomada, com o contexto | é o mesmo caminho — sessão nova, depois o prompt com os anexos —, e a recusa dele já é vigiada pelo composer da aba nova | `useResumeAndSend`, `useDraft`, `useResumer` (o `resume` diz se saiu) |
| 2026-10-02 | A S-88 e a S-89, da B-10 (F2), ficaram cobertas aqui | saem do mesmo hook da B-06; a F2 só confere o nome do botão (S-22) | scenarios.md |
| 2026-10-02 | O teste do follow tail do 08 (S-81) saiu do `ConversationStreaming.spec` e foi para o `ChatFrame.spec` (S-07) | o `Conversation` não segue mais o fim; quem segue é a moldura. O cenário continua, no componente que o faz | testes de integração |
| 2026-10-02 | A altura da moldura do app no celular acompanha o `visualViewport` (`--app-height`), sem a escala do zoom, e o `viewport` ganhou `interactive-widget=resizes-content` | o Chrome do Android redimensiona o layout com isso; o Safari não, e o `visualViewport` cobre os dois. Um zoom de pinça não pode encolher o layout | `useVisualViewport`, `AppFrame`, `index.html`, web/03 |

### F2 e F3 — decisões da execução

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-03 | O `/` da barra escreve `/` **no início** do prompt (uma vez só) e põe o cursor depois dele, e não no cursor | o `/` só é comando no começo do prompt (08 · B-50): escrito no meio, a completion não abriria. Com a caixa vazia é o mesmo que a S-26 pede | `ChatComposer` (`startCommand`), S-26 |
| 2026-10-03 | O esforço da sessão viva vem de um registro **por sessão** no store do painel (`efforts`), gravado quando o rascunho vira sessão; sessão aberta noutro lugar mostra "O do início" | o contrato não manda o esforço da sessão, e a S-90 pede o chip só de leitura. Inventar "Padrão" seria mentir; mudar o contrato por um rótulo, não (D-02 pede dado que **falte** para a função) | `claude-panel.store`, `useSessionSettings`, web/04 |
| 2026-10-03 | Trocar modo ou modelo mostra o chip na hora e **volta com a recusa**, com o erro traduzido acima da caixa | a S-23 pede, e o código do 08 não voltava: o chip ficava no valor recusado. `setSessionModel`/`setSessionPermissionMode` passam a devolver o id do comando (`issue`), e o `useSessionSettings` vigia a recusa dele | `live-session.service`, `useSessionSettings`, `live-session.store` (`noteModel`/`noteMode` aceitam `null`), web/04 |
| 2026-10-03 | Cancelar o mesmo prompt da fila duas vezes manda **um** cancelamento; a recusa libera pedir de novo | achado pelo teste da S-31: o 08 mandava dois | `useQueue` |
| 2026-10-03 | **Defeito do 08 corrigido:** "Focar o prompt" (`Mod+Alt+L`) e o item do Claude na status bar procuravam `#prompt`, que nenhum elemento tinha — o foco não ia a lugar nenhum. A caixa leva `data-composer` com a pasta da aba, e o foco vai à caixa do painel daquela pasta | a B-15 manda o atalho continuar; o teste novo mostrou que ele nunca funcionou | `usePanelCommands` (`focusComposerOf`), `ClaudeStatusItem` |
| 2026-10-03 | "Alternar modo" (D-09) é `Mod+Shift+M`, na palette e na ajuda; vale no rascunho e na sessão, não numa conversa do histórico | a recomendação da D-09, conferida contra os atalhos do workbench (nenhum usa a combinação) | `usePanelCommands`, `PanelHelp`, web/03 |
| 2026-10-03 | Abaixo de 24 rem de barra, modelo e esforço vão para o `…` da barra (submenus); `+`, `/`, modo, contexto e enviar/parar ficam | a norma da F0 (web/03, painel estreito) | `ComposerToolbar`, `ChoiceMenu` (`sub`), primitivo `DropdownMenuSub` |
| 2026-10-03 | Na sessão encerrada a barra não tem escolhas (nem modo, nem modelo, nem contexto): enviar retoma (D-05), e a sessão nova parte do que o servidor decide | não há sessão viva para receber `setModel`/`setPermissionMode`, e o anel leria uma sessão que não existe | `SessionScreen` |
| 2026-10-03 | O desfazer virou **diálogo**, aberto pelo menu `⋯` e por um botão na view de alterações, que antes tinha o `UndoPanel` no pé | a B-17 tira o `Disclosure`; a view de alterações perderia a entrada sem o botão | `UndoDialog`, `ChangesView` |
| 2026-10-03 | Exportar virou diálogo do menu; o menu da sessão é **não modal** | um item que abre diálogo num menu modal deixa o foco preso entre os dois | `ExportDialog`, `SessionMenu` |
| 2026-10-03 | "Copiar o id" confirma num `status` para o leitor de tela, e a recusa do navegador diz o id para copiar à mão | a notificação do workbench só aceita chaves do catálogo do servidor (06 · D-19), e um id copiado não é notificação | `SessionMenu` |
| 2026-10-03 | Os tópicos de ajuda do indicador, do card inline, da pílula e das ações da mensagem foram para a **F4** (S-92); a B-20 entregou a barra e o menu (S-47 restrita a eles) | ajuda de um lugar que ainda não existe ensinaria errado | scenarios.md (S-47, S-92), F4 |
| 2026-10-03 | Com o `TurnStatus` fora do topo (B-18), "Claude está pensando…" sai da tela até o indicador da F4; o pedido aberto continua no dock, sempre à vista. O teste do 08 · S-96 (o link "esperando você" do topo) saiu com o componente | a B-18 tira o estado do turno do topo; até a F4, o ponto de status diz "trabalhando" por cor e texto | `ConversationPanel.spec`, chaves `sessions.status.thinking/running/waitingPermission` removidas |
| 2026-10-03 | O `CommandMenu` e o `useCommandMenu` saíram (D-08). Os cenários do 04 que o menu cobria: listar e buscar estão na completion do `/` (08 · S-241…S-248) e no `command.service`; a recusa de comando desconhecido (04 · S-34) foi para o `ComposerBar.spec`; o "tentar de novo" e a versão do CLI saíram com o menu | D-08 | testes de integração; chaves `commands.menu.*` removidas |
| 2026-10-03 | Chaves novas com três segmentos: `composer.send.stop`, `composer.chip.choice` | o teste do catálogo exige exatamente três | i18n |

### F4 e F5 — decisões da execução

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-03 | As chaves dos verbos são `sessions.workingVerb.*`, e não `sessions.working.verbs.*` (D-16) | o teste do catálogo reprova chave com mais de três segmentos | i18n, D-16, web/03 |
| 2026-10-03 | O instante em que o turno começou (`turnSince`) entra no estado da conversa, pelo relógio do **servidor** (o `ts` do primeiro `session.statusChanged` que sai do repouso), e cai quando o turno acaba | o tempo do indicador sobrevive a trocar de aba e a reconectar; o histórico não traz instante e não liga relógio. Nenhum schema muda | `conversation-reducer`, `live-session.store` |
| 2026-10-03 | O verbo é sorteado do **nome do turno** (`sessão:turnos encerrados`), por hash, nunca do relógio | a S-53 pede o mesmo verbo com re-render e reconexão; o próximo turno tem outro nome | `lib/working-verbs` |
| 2026-10-03 | O resultado de um pedido (`PermissionOutcome`) guarda a tool do card que fechou (`toolUseId`), de onde veio a resposta (`resolvedFrom`, que o contrato já mandava) e se a vencedora foi desta tela (`answeredHere`) | a linha da decisão precisa do lugar (a tool) e de quem ("por você", "num celular por *X*"). O `permission.resolved` não traz `toolUseId`: o store o tira do card que fecha | `permission.store`, `permission.service`, web/04 |
| 2026-10-03 | Pedido que **uma regra** decidiu antes de perguntar a alguém não ganha linha de decisão na tool | ele nunca esteve na fila, e o `permission.resolved` não diz a tool; mudar o contrato por isso não pede dado que **falte** à função (D-02) — a linha da tool já diz que ela rodou | `useInlineRequests`, web/04 |
| 2026-10-03 | O pedido de uma tool **de subagent** fica na cauda, e não no lugar da tool | a linha dela está recolhida sob o `Task`: no lugar, o card ficaria escondido | `TailRequests`, web/03 |
| 2026-10-03 | O `respond` do `wsClient` devolve o id do frame (era `boolean`), e o `usePermissionQueue` vigia a recusa da resposta (`refusal`) | a S-61 pede a resposta atrasada recusada e traduzida; o `error` nomeia o frame da resposta, que ninguém guardava | `ws-client`, `usePermissionQueue`, `SessionScreen` |
| 2026-10-03 | O card toma o foco só **na chegada** e só se o foco não está num campo ou no editor (`isContentEditable`), não só "na caixa" | um card que toma o foco do editor no meio de uma digitação faz o mesmo estrago que o da caixa; redesenhado (movido para o lugar da tool, de volta com a aba), não toma de novo | `PermissionCard` (`claimArrival`), web/03 |
| 2026-10-03 | A norma do 03 (foco inicial no negar com `defaultToNo`) **nunca tinha sido implementada** no web | achado ao escrever a S-70; entrou com a regra da D-13 | `PermissionCard` |
| 2026-10-03 | O `PermissionQueuePanel` saiu inteiro; o feature `permission` exporta o card (`PermissionRequestCard`) e a linha da decisão (`PermissionOutcomeLine`). O teste da âncora `#permission-queue-none` saiu: a âncora era do link do `TurnStatus`, que saiu na F3 | S-65; nada mais usava o painel | `PermissionQueue.spec` reescrito sobre as peças |
| 2026-10-03 | O desfazer pela mensagem abre o `UndoDialog` **no ponto daquele prompt** (o ponto cujo rótulo é o texto do prompt, como a edição do 08 · B-35 já achava) | a D-15 pede o mesmo diálogo; achar o ponto pelo rótulo é o que o produto já faz | `UndoDialog` (`prompt`) |
| 2026-10-03 | O resultado do desfazer vira **entrada da linha do tempo** (`rewound`, com quantos voltaram, ficaram e falharam), lida do `session.rewound` pelo próprio reducer | a B-28 pede a linha na ordem em que aconteceu; o detalhe arquivo a arquivo continua no diálogo | `conversation-reducer`, `TurnRow` (`RewoundRow`) |
| 2026-10-03 | "Ir para a pergunta que espera você" é `Mod+Alt+P`; sem pergunta, o rótulo diz que nada espera e o comando põe o foco na caixa | a S-71 pede "diz que não há"; a notificação do workbench só aceita chaves do catálogo do servidor (06 · D-19) | `usePanelCommands`, `PanelHelp` |
| 2026-10-03 | A lista de tarefas aparece também no leitor do histórico, sobre o "continuar" | antes ela vinha no topo da conversa, também no histórico; sair de lá não podia sumir com ela | `ConversationReader` |
| 2026-10-03 | Com um pedido aberto, a tela da sessão re-renderiza a cada segundo (a contagem do `usePermissionQueue`) | antes só o card re-renderizava; as mensagens são `memo`, e o turno está parado esperando a pessoa. O relógio do indicador fica isolado nele (R-07) | `SessionScreen` |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-02 | A S-15 a **360×400** (o celular com o teclado virtual aberto) saiu da F1; a F1 prova a 360×640 — **feita na F3** (S-91, `chat-layout.spec`) | medido no navegador (ciclo 5): a 360×400, barra do topo, seletor de pasta, "CLAUDE", abas, linha de ícones, barra de views e status bar somam ~300 px e deixam ~100 px para um dock que precisa de mais de 180 — com o cabeçalho e o composer de hoje, não cabe. Quem os encolhe é a F2 (a barra da caixa, sem "Commands" nem a linha de enviar) e a F3 (o cabeçalho numa faixa). Decisão do usuário | **F3**, como a [S-91](scenarios.md#cabeçalho--b-16b-20), no critério da B-16; o `useVisualViewport` que a sustenta já entrou na F1 |
| 2026-10-03 | A conversa longa da B-30 **não** é uma fixture nova gravada: é a de hoje, feita de turnos gravados repetidos (`text-turn`) até passar de duas telas | gravar uma fixture exige o Claude de verdade (custa e depende do login da máquina) e não acrescenta nada ao que o layout mede — a altura da conversa | fica assim; uma fixture longa só entra se um cenário pedir conteúdo que os turnos repetidos não dão |
| 2026-10-03 | "Pensando…" ao vivo não é afirmado no e2e (S-83) | o replay do fake entrega o bloco de thinking em milissegundos; o estado vivo é provado na integração (S-54), e o e2e afirma o "Pensou" recolhido antes do card | integração |
| 2026-10-03 | A 360×400 (o teclado aberto), o ciclo da B-32 não responde o card **com o teclado aberto**: a conversa fica com quase nenhuma altura (barra do topo, seletor de pasta, abas, caixa, barra de views e status bar), e os botões do card ficam sob a caixa. O e2e prova, a 360×400, a caixa inteira e a pergunta anunciada pela pílula; fechado o teclado (360×640), o card é respondido no lugar | medido no e2e (ciclo 14): o clique em "Allow once" caía sobre o dock. Quem escreve com o teclado aberto fecha o teclado para ler o pedido; tirar altura da caixa para a conversa iria contra a norma de que a caixa nunca sai da tela | `chat-layout.spec` (S-85); se o usuário quiser responder com o teclado aberto, é uma decisão nova de layout |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | e2e de hoje acoplados ao layout | ✅ mitigado | os specs de antes verdes no layout novo pelo page object (S-81, `verify:full` de 2026-10-03) |
| R-02 | card inline fora de vista | ✅ mitigado | card inline, pílula sobre a caixa, comando `Mod+Alt+P` e `aria-live` (B-25; S-67, S-68, S-71) |
| R-03 | card que rouba o foco de quem escreve | ✅ mitigado | D-13: o card não tira o foco de quem escreve, numa caixa ou no editor (S-69, S-85) |
| R-04 | teclado virtual cobre o composer | ✅ mitigado | `visualViewport` (B-08); a caixa inteira a 360×400 (S-91), e o pedido anunciado acima dela com o teclado aberto (S-85) |
| R-05 | F6 do 08 escrita no layout antigo | ✅ aceito | D-01: o 09 roda depois; os e2e da F6 do 08 são reescritos aqui pelo page object da B-03 |
| R-06 | cobertura de 90 % por arquivo ao mover componentes | ✅ mitigado | cada componente que mudou levou o teste; nenhum arquivo abaixo de 90 % (portão 7) |
| R-07 | relógio do indicador re-renderiza a conversa | ✅ mitigado | relógio isolado no indicador (`useClock`); o `aria-live` anuncia só a troca (S-52) |
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
