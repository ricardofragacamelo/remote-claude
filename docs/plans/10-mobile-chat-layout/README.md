# Plano 10 — Layout do chat no app

**Objetivo:** a tela de sessão do app Flutter se lê e se opera como o painel do Claude do web depois do
[plano 09](../09-chat-layout/README.md). Só a conversa rola, o composer fica sempre à vista, acima do
teclado, com os controles da sessão. O processamento, o thinking, a permissão e o plano para aprovar
aparecem **inline**, na ordem em que aconteceram.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm test:e2e:mobile   # o app no emulador, contra o backend roteirizado — um e2e de cada vez
pnpm verify:full       # portões 1-11, sai com código 0
```

**Depende de:** [plano 09 — Layout do chat](../09-chat-layout/README.md), pelas normas da F0 dele (o
molde, o lugar de cada controle, o foco, o indicador) e pelas decisões que ele fechou. A
[D-03](decisions.md#f0--normas) decide se este plano espera o 09 inteiro ou só a F0 dele. Do
[plano 08](../08-claude-panel/README.md) vêm os comandos, os eventos e as rotas HTTP que o app passa a
consumir.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Em 2026-10-02, ao decidir o plano 09, o usuário pôs o app no mesmo molde e pediu **paridade com o painel
web** ([D-01](decisions.md#f0--normas)). Primeiro, como tarefas dentro de cada fase do 09. Na revisão,
como um plano próprio, este, logo depois do 09.

O que se vê hoje na tela de sessão do app, e por que acontece:

| O que o usuário vê | Causa no código | O que este plano faz |
|---|---|---|
| As respostas e as tools fora de ordem: todas as mensagens, depois todas as tools | `ConversationView` monta a lista com `messages` e depois `tools`, que o `Conversation` guarda em listas separadas | a conversa vira uma lista ordenada de entradas, a mesma do web (F1) |
| Nenhum sinal de raciocínio: o thinking some | o `session_event_mapper` descarta todo fragmento com `blockType` diferente de `text` | thinking vivo ("Pensando…") e encerrado ("Pensou por *n* s"), na ordem (F4) |
| Os pedidos de permissão em cima, ocupando até metade da tela, e rolando separado da conversa | `SessionPage` põe `DeviceStatusBanner`, `PushReachBanner` e `PermissionQueueView` num `ConstrainedBox` de meia altura acima da conversa | o card no lugar da tool, e as faixas de aparelho e push em uma linha (F1, F4) |
| Interromper, desfazer e encerrar como ícones soltos na `AppBar`, e encerrar sem confirmação | `actions` da `AppBar` | parar na barra da caixa, desfazer e encerrar no menu `⋯`, encerrar confirmado (F2, F3) |
| Sem modo, modelo, esforço, fila nem contexto da janela | o app nunca usou `session.setModel`, `session.setPermissionMode`, a fila nem `GET /sessions/:id/context`, que o contrato já tem | a barra da caixa com os chips do web, a fila acima da caixa e o anel do contexto (F2) |
| A sessão abre ao tocar na pasta, antes de qualquer prompt | `SessionStarterController` manda `session.start` no toque | o rascunho: a sessão nasce no primeiro prompt, com o modelo, o modo e o esforço escolhidos (F1) |
| Um texto "Pensando"/"Rodando" no topo, longe da resposta | o `_Header` da `SessionPage` | o indicador vivo na cauda da conversa (F4) |

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **O app espelha o que o 09 fixou, com as formas do celular** | as decisões de lugar (D-04…D-16 do 09) valem aqui. Onde o web usa hover, tooltip ou atalho de teclado, o app usa pressionar e segurar, folha de baixo (`showModalBottomSheet`) e `Semantics`. A regra é a mesma; muda o gesto |
| **Nenhum controle do app nasce fora do contrato que existe** | tudo o que o app passa a fazer já tem comando, evento ou rota (08 · F0). Se faltar algum dado, vale a [09 · D-02](../09-chat-layout/decisions.md#f0--normas): a mudança entra nas três pontas de uma vez |
| **As regras da tela de permissão do app ficam inteiras no card inline** | comando exato sem truncar, dois passos para destrutivo e para escopo que persiste, estender prazo, aprovar que não é o alvo mais fácil com `defaultToNo` ([mobile/04](../../architecture/mobile/04-ui.md#a-tela-de-permissão)). Muda só o lugar. O toque acidental no bolso é o risco que o web não tem |

Este plano **não** abre ADR, porque não muda escolha de arquitetura. Muda padrão de UI do app, e isso é a
[F0](F0-norms.md) em [mobile/04-ui](../../architecture/mobile/04-ui.md).

---

## Escopo

### Entra

| | |
|---|---|
| As normas da tela de sessão em `mobile/04` e `mobile/03`, as chaves ARB, os verbos iguais aos do web por checagem de máquina, e o robô do `integration_test` | F0 |
| A moldura: a conversa na ordem real, só ela rola, o composer acima do teclado, os estados em faixas, a sessão encerrada que retoma, o rascunho, tela pequena e fonte grande | F1 |
| O composer: a barra com `/`, modo, modelo, esforço, contexto e enviar/parar; a fila, a edição, a recusa e o motivo de não enviar | F2 |
| O cabeçalho: a `AppBar` com status e histórico, o menu `⋯` (encerrar confirmado, desfazer, regras, ajuda, copiar id) e a ajuda da tela | F3 |
| Inline: o indicador, o thinking, a permissão e o plano no lugar da tool, a pílula, o teclado que não fecha, a tela da notificação, as tarefas, as ações da mensagem e as linhas de sistema | F4 |
| E2E: os testes de integração de hoje no layout novo, o composer que nunca sai da tela, o ciclo inline, acessibilidade e fonte grande | F5 |

### Não entra

O que o painel web tem e o app **não** ganha ([D-01](decisions.md#f0--normas)):

- **O contexto do prompt:** `@` arquivo ou pasta, anexo do computador, seleção do editor. O app não tem
  explorer nem editor para escolher de onde.
- **Os diffs e a view "Alterações"**, com rejeitar por trecho e por arquivo. O desfazer por prompt (o que
  o app já tem) fica, agora também pela mensagem.
- **As abas de conversa**, o subagent aninhado, exportar e a busca na conversa (`Ctrl/Cmd+F`).
- **O atalho de alternar o modo** (09 · D-09): o celular não tem teclado de atalho. Fica o chip.
- **A tela de sessão no tablet em duas colunas.** O layout responde à largura (`LayoutBuilder`), mas não
  ganha um modo de duas colunas. Se o usuário pedir, é outro plano.
- **Tema, cores e tipografia.** Ficam os do [mobile/04](../../architecture/mobile/04-ui.md#material-3).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério de
conclusão. A ordem é dependência, não preferência. Uma fase só começa com a anterior verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Normas](F0-norms.md) | as regras da tela de sessão em `mobile/04` e `mobile/03`, as chaves ARB, os verbos verificados contra o web e o robô do e2e | B-01…B-04 | 🔲 |
| F1 | [Moldura da sessão](F1-session-frame.md) | a conversa na ordem real, só ela rola, o composer acima do teclado, estados, retomada e rascunho | B-05…B-09 | 🔲 |
| F2 | [Composer](F2-composer.md) | a barra com `/`, modo, modelo, esforço, contexto e enviar/parar; fila, edição e recusa | B-10…B-14 | 🔲 |
| F3 | [Cabeçalho](F3-header.md) | a `AppBar` com status e histórico, o menu `⋯` e a ajuda | B-15…B-17 | 🔲 |
| F4 | [Inline](F4-inline.md) | processamento, thinking, permissão, plano, pílula, tarefas e ações da mensagem dentro da conversa | B-18…B-24 | 🔲 |
| F5 | [E2E](F5-e2e.md) | o layout provado no emulador, em tela pequena, com teclado e com fonte grande | B-25…B-27 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md). Esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| As regras da tela de sessão escritas antes das telas | B-01 | [mobile/04-ui](../../architecture/mobile/04-ui.md#transcript-e-stream) | S-01 |
| As chaves nos dois ARB, sem órfã, e a ajuda da tela | B-02 | [shared/02-i18n](../../architecture/shared/02-i18n.md#garantias-automatizadas) | S-02 |
| Os verbos e os textos compartilhados iguais no web e no app, verificados por máquina | B-03 | [shared/02-i18n](../../architecture/shared/02-i18n.md#garantias-automatizadas) | S-03, S-04 |
| Os testes de integração acham a tela por semântica, num lugar só | B-04 | [mobile/06-testing](../../architecture/mobile/06-testing.md#e2e) | S-05 |
| A conversa na ordem real, sem duplicar no replay, com o thinking como entrada própria | B-05 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#as-três-regras-do-stream) | S-06…S-09 |
| Só a conversa rola; o composer fica acima do teclado | B-06 | [mobile/04-ui](../../architecture/mobile/04-ui.md#responsividade) | S-10…S-13 |
| Desconectado, histórico, encerrada e aparelho como faixas; a sessão encerrada retoma pelo envio | B-07 | [mobile/04-ui](../../architecture/mobile/04-ui.md#estados-de-tela--os-quatro-sempre) | S-14…S-18 |
| O rascunho: a sessão nasce no primeiro prompt, com os chips escolhidos | B-08 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#onde-cada-estado-mora) | S-19…S-22 |
| Tela pequena, fonte grande, rotação e app em background sem perder a caixa | B-09 | [mobile/04-ui](../../architecture/mobile/04-ui.md#responsividade) | S-23…S-26 |
| A barra da caixa, e enviar e parar no mesmo lugar | B-10 | [mobile/04-ui](../../architecture/mobile/04-ui.md#acessibilidade) | S-27…S-31 |
| Modo, modelo e esforço pela barra, com a recusa que volta o chip | B-11 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor) | S-32…S-35 |
| `/` abre os comandos | B-12 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#menu-de-comandos-e-desfazer) | S-36, S-37 |
| Fila, edição, recusa e o motivo de não enviar acima da caixa | B-13 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#a-fila-de-prompts) | S-38…S-42 |
| O contexto da janela à vista, com Compactar | B-14 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) | S-43…S-45 |
| A `AppBar` com status e histórico | B-15 | [mobile/04-ui](../../architecture/mobile/04-ui.md#navegação--go_router) | S-46…S-48 |
| O menu `⋯`: encerrar (do dono, confirmado), desfazer, regras, ajuda, copiar id | B-16 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#multi-cliente-na-mesma-sessão) | S-49…S-52 |
| A ajuda da tela descreve os lugares novos | B-17 | [shared/02-i18n](../../architecture/shared/02-i18n.md#garantias-automatizadas) | S-53 |
| O processamento à vista, na cauda, com verbo, tempo e `disableAnimations` | B-18 | [mobile/04-ui](../../architecture/mobile/04-ui.md#transcript-e-stream) | S-54…S-58 |
| Thinking vivo e encerrado, na ordem | B-19 | [mobile/04-ui](../../architecture/mobile/04-ui.md#transcript-e-stream) | S-59…S-61 |
| A permissão inline, com as regras inteiras da tela de permissão | B-20 | [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) | S-62…S-69 |
| O plano para aprovar, inline | B-21 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) | S-70 |
| A permissão nunca fora de vista, o teclado que não fecha, e a tela que a notificação abre | B-22 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#push-notification--o-canal-que-torna-o-app-útil) | S-71…S-76 |
| A lista de tarefas sobre a caixa e as linhas de sistema compactas | B-23 | [mobile/04-ui](../../architecture/mobile/04-ui.md#transcript-e-stream) | S-77…S-79 |
| Editar, bifurcar e desfazer a partir da mensagem | B-24 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#desfazer-arquivos) | S-80…S-84 |
| O layout provado no emulador, com teclado, tela pequena e fonte grande | B-25…B-27 | [mobile/06-testing](../../architecture/mobile/06-testing.md#e2e) | S-85…S-91 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
mobile/lib/features/session/
├── domain/entities/
│   ├── conversation.dart          a lista ordenada de entradas: mensagem, thinking, tool, sistema
│   └── draft.dart                 o rascunho: pasta, modelo, modo, esforço — sem sessão
├── data/mappers/
│   └── session_event_mapper.dart  o thinking deixa de ser descartado; o TodoWrite vira lista
└── presentation/
    ├── pages/
    │   ├── session_page.dart      três faixas: SessionAppBar · ConversationView · ComposerDock
    │   └── draft_page.dart        o rascunho na mesma moldura
    └── widgets/
        ├── session_app_bar.dart   título, StatusChip, histórico, SessionMenu
        ├── session_menu.dart      encerrar (confirmado), desfazer, regras, ajuda, copiar id
        ├── state_strip.dart       desconectado, histórico, encerrada, aparelho, push — uma linha cada
        ├── chat_composer.dart     a caixa e a barra: / · modo · modelo · esforço · contexto · enviar/parar
        ├── queue_strip.dart       a fila, a edição e a recusa acima da caixa
        ├── task_strip.dart        a lista de tarefas, recolhida numa linha
        ├── working_indicator.dart o asterisco animado, o verbo, o tempo
        ├── thinking_line.dart     "Pensando…" e "Pensou por n s"
        ├── inline_permission.dart o card do 02/03 no lugar da linha da tool
        ├── pending_pill.dart      "Claude espera sua resposta (n)" sobre a caixa
        └── message_actions.dart   editar · bifurcar · desfazer até aqui

removidos da SessionPage: o _Header de status · os IconButton da AppBar · o ConstrainedBox da fila
mobile/integration_test/support/session_robot.dart   o robô da tela de sessão
mobile/integration_test/chat_layout_test.dart        o layout, inline, no teclado e em fonte grande
scripts/lib/i18n.mjs                                 os verbos iguais nas duas famílias
```

Os nomes são indicativos. A fase decide o arquivo pela
[estrutura normativa do app](../../architecture/mobile/02-folder-structure.md).

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | Os testes de integração de hoje (`vertical_slice`, `permission_flow`, `rule_cycle`, `limits`, `history`) acham a tela pelo texto e pelo lugar atuais, e quebram em cascata a cada fase | **aberto** — o robô da [B-04](F0-norms.md) concentra os seletores; cada fase muda o robô, e a F5 fecha |
| R-02 | No Android, o teclado cobre o composer ancorado, ou empurra a `AppBar` para fora | **aberto** — `viewInsets` e `resizeToAvoidBottomInset` na [B-06](F1-session-frame.md), medidos em 360×400 (S-11) |
| R-03 | Inline, o card de permissão pode rolar para fora da tela, e a tela pequena torna isso mais fácil que no web | **aberto** — a pílula sobre a caixa e o `liveRegion` ([B-22](F4-inline.md)) |
| R-04 | O pedido que chega fecha o teclado ou tira o foco da caixa, e um toque de envio vira uma resposta | **aberto** — o foco fica na caixa (09 · D-13), e o card só responde a toque no próprio card (S-73) |
| R-05 | Mudar o modelo da conversa para uma lista ordenada quebra o replay, o `gap` e os cenários do stream (`mobile/03`, S-28…S-31) | **aberto** — a [B-05](F1-session-frame.md) migra os testes do stream junto, e nenhum cenário antigo sai sem ir para outro |
| R-06 | O relógio do indicador re-renderiza a lista inteira a cada segundo | **aberto** — o relógio vive no `WorkingIndicator`, e o `liveRegion` anuncia só a troca de estado (S-56) |
| R-07 | O e2e do app é lento e disputa a máquina: emulador, Gradle, a stack do backend | **aberto** — uma execução de e2e por vez, e `pnpm test:e2e:mobile` derruba o emulador e o Gradle no fim |
| R-08 | Pressionar e segurar não é descoberto por quem usa TalkBack | **aberto** — as ações da mensagem também são `Semantics` custom actions ([B-24](F4-inline.md), S-84) |
| R-09 | Paridade puxa para o app decisões que o 09 tomou pensando em mouse e teclado | **aberto** — cada decisão do 09 que este plano herda diz o gesto do celular ([F0](F0-norms.md)); a que não couber vira decisão aqui |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. A fase só começa com as decisões que a bloqueiam fechadas. Ver
   [decisions.md](decisions.md).
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md) e rode `pnpm plan progress 10-mobile-chat-layout` a
   cada task concluída.
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. Ao fim da F5: `pnpm test:e2e:mobile` e depois `pnpm verify:full`, um e2e de cada vez.
