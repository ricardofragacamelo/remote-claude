# Plano 10 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F6 — Instalação por USB (F0…F2 concluídas em 2026-10-03; F3, F4 e F5 em 2026-10-04); depois F7…F9, e o E2E (F10) por último
**Última atualização:** 2026-10-04
**Bloqueios:** nenhum. A [D-15](decisions.md#f5--endereço-de-conexão) foi confirmada pelo spike da B-25; a D-19 (o `iss` no modo público) está aberta e não bloqueia a F10

```
F0  ████████████████████ 100%   ✅ concluída
F1  ████████████████████ 100%   ✅ concluída
F2  ████████████████████ 100%   ✅ concluída
F3  ████████████████████ 100%   ✅ concluída
F4  ████████████████████ 100%   ✅ concluída
F5  ████████████████████ 100%   ✅ concluída
F6  ████████████████████ 100%   ✅ concluída
F7  ████████████████████ 100%   ✅ concluída
F8  ████████████████████ 100%   ✅ concluída
F9  ████████████████████ 100%   ✅ concluída
F10 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-04 | 4/4 | ✅ |
| [F1](F1-session-frame.md) | B-05…B-09 | 5/5 | ✅ |
| [F2](F2-composer.md) | B-10…B-14 | 5/5 | ✅ |
| [F3](F3-header.md) | B-15…B-17 | 3/3 | ✅ |
| [F4](F4-inline.md) | B-18…B-24 | 7/7 | ✅ |
| [F5](F5-connection-address.md) | B-25…B-29 | 5/5 | ✅ |
| [F6](F6-usb-install.md) | B-34…B-37 | 4/4 | ✅ |
| [F7](F7-open-folders.md) | B-38…B-40 | 3/3 | ✅ |
| [F8](F8-folder-screen.md) | B-41…B-43 | 3/3 | ✅ |
| [F9](F9-open-sessions.md) | B-44…B-47 | 4/4 | ✅ |
| **Total** | **B-01…B-48** | **43/48** | 🔄 |
| [F10](F10-e2e.md) | B-30…B-33, B-48 | 0/5 | 🔲 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 178 | 16 | 0 | 162 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 29 | 1 | 0 | 28 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-03 | F2 | 2 (lint — complexidade) | `_ChatComposerState._actions` (13) e `_SessionPageState._composer` (12) passaram do limite de 10 | `_actions` dividido em parar, enviar e o texto de enviar (`sendLabel`); `_composer` tirou os chips de modelo, esforço e contexto para `_choices` | portões 1-5 verdes |
| 2 | 2026-10-03 | F1/F2 | 7 (cobertura) | `insight.dart` com 66,7 % de linhas: as igualdades por valor das entidades novas não tinham teste | `insight_test.dart` compara cada entidade por valor | 187 arquivos ≥ 90 %, 99,4 % de linhas |
| 3 | 2026-10-03 | F0 (B-04) | 9 (e2e do app) | `limits_test`: a S-42 procurava o motivo da sessão encerrada pelo texto exato, e a faixa nova junta motivo e aviso de retomada numa linha; a S-44 tocava no cartão de permissão, que agora fica recolhido na linha da fila (B-06) | o robô ganhou `endedBecause` e `answer` (abre a fila antes de tocar), e todos os testes que respondem um cartão passam por ele | as 15 suítes de antes verdes pelo robô; a S-26, nova, falhou (ciclo 6) |
| 4 | 2026-10-03 | F0 (B-03) | 2 (lint — complexidade, ESLint) | `compareShared` com complexidade 11 | o que está errado num par saiu para `sharedProblem` | lint dos scripts verde |
| 5 | 2026-10-03 | F1/F2 | 5 (duplicação, limiar 0) | 9 clones, todos de código novo: o esqueleto das duas telas com caixa, a abertura de folha repetida, o cabeçalho de folha, os dois fragmentos quase iguais, o começo de `build` igual ao de outras telas e um bloco de imports | a montagem do dock saiu da `SessionPage` (`SessionDock`), o cabeçalho e o corpo também (`session_body.dart`); `BoxOwner` para as telas com caixa; `showSheet` único; `SheetHeading` com tamanho e margem; `Fragment` como base de `MessageFragment` e `ThinkingFragment`; a ordem do começo de alguns `build` | 0 clones |
| 6 | 2026-10-03 | F1 (S-26) | 9 (e2e do app) | o robô procurou a caixa logo depois de a sessão abrir, com o rascunho ainda saindo na transição — duas caixas na tela | `startSession` do robô espera o rascunho sair antes de devolver a sessão | `pnpm test:e2e:mobile` verde: 16 de 16 |
| 7 | 2026-10-03 | F0…F2 | — | `pnpm verify:full` final, depois do e2e do app verde | — | **portões 1-11 verdes**, `exit 0` |
| 8 | 2026-10-04 | F3/F4 | 1 (formatação) e 2 (complexidade), na mesma rodada | `router.dart` sem `dart format`; `_ConversationViewState.didUpdateWidget` com complexidade 12 | formatado; o repasse do rastreador (`_rehome`) e "a lista cresceu" (`_grew`) saíram do `didUpdateWidget` | portões 1-4 verdes |
| 9 | 2026-10-04 | F3/F4 | 5 (duplicação, limiar 0) | 10 clones, todos de código novo: a faixa de tarefas e o thinking, o fork e a recusa, as ações da mensagem na semântica e na folha, o estado do fork igual ao da retomada, o começo de `build` igual a outros, o "estender" do card do plano | a faixa de tarefas virou `TextStrip`; `RefusalStrip` ganhou `action` (o fork recusado usa ela); `PromptActions.of` gera as três ações uma vez; o fork usa o `ResumeState`; `ExtendAction.forCard`; ordem do começo de dois `build` | 2 clones |
| 10 | 2026-10-04 | F3/F4 | 5 (duplicação) | o `_apply` do rascunho e o do fork, e o cabeçalho da faixa de tarefas igual ao da fila | `answerTo` em `session_updates.dart`; ordem dos argumentos da faixa | 1 clone |
| 11 | 2026-10-04 | F3/F4 | 5 (duplicação) | o seguir do próprio `session.start`, ainda igual nos dois controladores | o mixin `FollowsStart`, usado pelo rascunho e pelo fork | 0 clones; portões 1-7 do app verdes (1417 testes, 199 arquivos ≥ 90 %, 99,1 % de linhas) |
| 12 | 2026-10-04 | F5 | 2 (complexidade) | `BuildConfig.from` com 12 e `_ConnectionPageState.build` com 11 | a leitura dos defines saiu para `_Defines`; testar, a resposta e salvar saíram para `_Actions` | portões 1-5 do app verdes |
| 13 | 2026-10-04 | F3…F5 | 2 (lint — complexidade, ESLint), no `verify:full` | `localDefines` (`scripts/lib/mobile-local.mjs`) com complexidade 12 | a leitura do OIDC (`oidcDefines`) e a do caminho do realm (`realmPathOf`) saíram da função | lint verde |
| 14 | 2026-10-04 | F3…F5 | 6 (unit — `env-example.spec`) | `RC_INTERNAL_URL` e `RC_EXTERNAL_URL` sob um comentário só; a regra quer um comentário acima de cada variável | um comentário para cada uma | portões 1-6 verdes |
| 15 | 2026-10-04 | F3…F5 | 7 (cobertura — integração dos scripts) | `run-mobile-local.spec` descrevia a stack pela porta do backend, e o app agora passa pelo web (`/api/health` na porta do web) | o teste descreve a stack pela porta do web e afirma o `/api/health` dela | o spec verde |
| 16 | 2026-10-04 | F3…F5 | 7 (cobertura — integração do backend) | `chokidar-folder.watcher.spec` (S-131 do plano 07) estourou os 20 s com a máquina em carga 28 — um build Gradle de outro projeto a 155 % de CPU; código do vigia intocado desde o último commit, e o spec isolado passa (6/6) | nenhuma no código: esperar a carga baixar e reiniciar do portão 1 (os processos são de outra sessão, e não foram derrubados) | — |
| 17 | 2026-10-04 | F3…F5 | 7 (cobertura — `docs-check` na integração dos scripts) | ao registrar os ciclos 13-16, a edição gravou só o começo do `progress.md` e cortou as seções seguintes; a âncora `#decisões-tomadas-durante-a-execução` que a F1 cita sumiu | as seções restauradas da cópia lida no início da sessão, com as decisões e o escopo desta entrega reaplicados | `docs:check` verde |
| 18 | 2026-10-04 | F3…F5 | 7 (cobertura — integração do backend) | `session-changes.spec`, S-118 do plano 08 (vinte leituras de um arquivo reescrito por `rename`), falhou uma vez com a máquina de novo em carga 30; isolado passou 5/5 e o spec inteiro 7 de 9 vezes. A lista de issuers (B-26) só escolhe, pelo `iss`, o par discovery/JWKS que já existia — o compartilhamento das leituras em voo é o código de antes | nenhuma no código: esperar a carga baixar e reiniciar do portão 1 | — |
| 19 | 2026-10-04 | F3…F5 | 8 (integração do backend) | o mesmo S-118, de novo com a máquina em carga 36 (portões 1-7 verdes nesta rodada); não reproduz isolado nem com três cópias do spec em paralelo, instrumentado para dizer o status de cada leitura | nenhuma no código; um terceiro vermelho no mesmo teste para a execução e vai ao usuário | — |
| 20 | 2026-10-04 | F3…F5 | — | `pnpm verify:full`, com a máquina em carga 5 | — | **portões 1-11 verdes**, `exit 0` (o S-118 passou) |
| 21 | 2026-10-04 | F3…F5 | e2e do app (`pnpm test:e2e:mobile`) | 15 de 16 suítes verdes já pela origem única (login, API e socket pelo web); `rule_cycle` 03·S-44 esperou "aprovado por uma das suas regras" na tela e não achou: o pedido que a regra respondeu nunca chega como card, e o `permission.resolved` não dizia a tool | `toolUseId` opcional no `permission.resolved`, nas três pontas (decisão acima), com testes no backend, no web e no app | — |
| 22 | 2026-10-04 | F3…F5 | 1 (formatação) e e2e do app | o schema `permission-resolved` sem Prettier; e o `rule_cycle` 03·S-44 ainda sem achar a frase: a linha da tool do segundo turno fica acima do que a lista preguiçosa desenha (antes, a frase ficava fixa no topo) | schema formatado; o robô ganhou `seeInConversation` (rola a conversa até a linha, como uma pessoa faria) e o teste afirma antes que o desfecho chegou com a tool | — |
| 23 | 2026-10-04 | F3…F5 | 8 (integração do backend) | `push.flow.spec` S-51 do plano 05 estourou (46 s) com a máquina em carga; isolado, 3/3 verdes | nenhuma no código | — |
| 24 | 2026-10-04 | F3…F5 | e2e do app | `rule_cycle` 03·S-44: o celular tinha **uma** linha de tool só — a conversa parou de chegar logo depois de a tela abrir. **Defeito anterior a este plano, que a fila do topo escondia**: o data source da sessão segue uma sessão por vez, e o controlador do ping (`/`) chamava `unfollow()` ao ser descartado, mesmo sem ter seguido nada — sair de `/` para `/sessions/:id` com `go` desligava a sessão que a tela nova acabara de seguir. A fila de permissão tem assinatura própria, e por isso a frase do topo continuava aparecendo | `follow` passou a devolver o próprio "parar", que só age enquanto aquela assinatura é a atual; os dois controladores usam ele. Testes no data source e no controlador do ping provam a ordem; o teste e2e afirma a linha da tool na conversa e rola até ela | — |
| 25 | 2026-10-04 | F3…F5 | 1 (formatação) | a geração de código depois da correção do ciclo 24 deixou 31 `.g.dart` sem `dart format`; o e2e do app da mesma rodada, já com a correção: **16 de 16 verdes** (o `rule_cycle` e a S-74 inclusive) | `dart format` | — |
| 26 | 2026-10-04 | F3…F5 | 7 (cobertura) | `watch_session.dart` com 80 % de linhas: o `unfollow()` do caso de uso ficou sem uso depois do ciclo 24 | o código morto saiu (quem para é o "parar" que o `follow` devolve) | — |
| 27 | 2026-10-04 | F3…F5 | — | `pnpm verify:full` final; o `pnpm test:e2e:mobile` da rodada anterior, já com a correção do ciclo 24, deu 16 de 16 (o ciclo 26 só tirou código sem uso) | — | **portões 1-11 verdes**, `exit 0` |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-02 | O plano nasceu do 09: o usuário pôs o app no mesmo molde, com paridade com o painel web (lá, D-17), primeiro como tarefas em cada fase do 09 e, na revisão, como plano próprio, logo depois dele. Entrou como **10** pelo `pnpm plan new --at 10`, e os planos que eram 10…19 passaram a 11…20 | pedido do usuário | o índice, o progresso geral, os planos 11…20 e as referências a eles em docs e comentários de código |
| 2026-10-02 | Ao planejar: o `i18n:check` não compara o web com o app, então "os mesmos verbos nas duas pontas" virou a B-03 e a D-04 | a regra 9 do `AGENTS.md`: regra que não é verificada por máquina não existe | F0, S-03, S-04 |
| 2026-10-02 | Ao planejar: o esforço só se escolhe antes da sessão (08 · D-16), e o app abre a sessão no toque na pasta; paridade com o esforço pede o rascunho | o spike do 08 (`applyFlagSettings` no meio da sessão desliga o `PreToolUse`) | F1 (B-08), D-05 |
| 2026-10-03 | **As oito decisões em aberto (D-03…D-10) respondidas pelo usuário**, todas com a recomendação: o plano começa com o 09 fechado, mapa declarado de textos web → app, rascunho no toque na pasta, a regra de barra do 09 medida em 360 dp, `/` abre a mesma folha de comandos, id e custo na folha do status, pressionar e segurar para as ações da mensagem, e o push da sessão na tela suprimido. Nenhuma muda tarefa ou cenário | a D-10 fechou o gap: em primeiro plano quem mostra a notificação é o nativo, então a B-22 ganhou o caminho (o Dart diz ao nativo a sessão visível) | B-22, D-03…D-10 |
| 2026-10-03 | **O plano ganhou a F5 — Endereço de conexão, e o e2e passou a ser a F6**, por pedido do usuário: uma tela com três radios (interno, externo e outro, com campo de texto), a escolha guardada no aparelho. Seis tarefas (B-25…B-30), 29 cenários (S-85…S-113) e oito decisões (D-11…D-18), todas respondidas na mesma data; a D-15 (uma lista explícita de issuers no backend) é condicionada ao spike da B-25 | pedido do usuário; uma origem só de onde saem API, WS e login (D-13), e só `https` fora do `localhost` (D-14) | F5 nova, F5 → F6 (o e2e), README, scenarios, decisions, R-10…R-13; as tarefas e os cenários do e2e foram renumerados (B-25…B-27 → B-31…B-33, S-85…S-91 → S-114…S-120) antes de o plano começar, para seguirem a ordem das fases. A prova no emulador do endereço (B-30, S-110…S-113) é da F6, que prova as duas fases |
| 2026-10-03 | **F0, F1 e F2 implementadas juntas**, com os portões básicos do app (formato, análise e complexidade, arquitetura, unit, widget, cobertura) a cada passo e o `verify:full` uma vez, no fim | o pedido foi as três fases de uma vez; a preferência registrada do usuário é o portão inteiro só no fim do lote | o critério de conclusão de cada fase é provado pelo `verify:full` final e pelo `test:e2e:mobile` |
| 2026-10-03 | **A conversa não é mais `reverse: true`**: `ListView.builder` não invertido, com `ScrollController`, que acompanha o fim só quando a pessoa está a até 48 dp dele | com a lista invertida, a mensagem que cresce na cauda empurra o texto de quem rolou um pouco para cima — o contrário da S-12. A regra antiga de `mobile/04` foi trocada na B-01 | `mobile/04` (Transcript e stream), B-06, S-12 |
| 2026-10-03 | **`message.completed` soma o bloco que terminou**, em vez de substituir a mensagem | o CLI termina uma mensagem bloco a bloco sob o mesmo `messageId`; no app, o bloco `tool_use` que terminava depois do texto apagava a resposta (o web já corrigira isso no plano 08) | B-05, `mobile/03` (regra 3) |
| 2026-10-03 | **O thinking já é desenhado na F1** — "Pensando…" enquanto chega, "Pensou" / "Pensou por *n* s" (arredondado como o web) quando para, "Pensou — o modelo não mostrou" no redigido, recolhido e aberto num toque | a B-05 faz do thinking uma entrada da lista, e uma entrada que a lista não desenha seria uma linha vazia. A animação, o `liveRegion` e a S-60 em nível de integração continuam na B-19 | B-05, B-19 (parte puxada), S-61 |
| 2026-10-03 | **O `SessionStarterController` e a `SessionStartRefusal` saíram**: tocar na pasta abre o rascunho, e a recusa de um início (o teto) aparece acima da caixa do rascunho, com o texto preservado | D-05: nenhuma sessão abre no toque. Os cenários do plano 05 que provavam a recusa no toque (S-41, S-75, S-78) passaram a ser provados no rascunho, nos testes de widget e no `limits_test` | B-08, S-18, S-19 |
| 2026-10-03 | **O mapa de textos compartilhados (B-03) começa com os textos da F1 e da F2** — 68 pares: thinking, composer, chips, fila, contexto, compactação, sessão encerrada e três erros. Os verbos do indicador e a pílula entram na F4, junto com as chaves do app | chave do app que só nasce na F4 seria órfã agora, e o `i18n:check` reprova chave órfã; a S-04 está provada no teste da regra, com os vinte verbos | B-03, `scripts/i18n-shared.json`, `shared/02-i18n` (garantia 7) |
| 2026-10-03 | **O `command.accepted` passou a chegar aos observadores do socket** (`WsClient`), e o app o lê como `CommandAccepted` | a troca de modelo ou de modo não tem evento: só o aceite diz que ela deixou de estar pendente (S-35). O contrato não muda — o ack já existia e trazia o `correlationId` | `ws_client.dart`, B-11 |
| 2026-10-03 | **O catálogo, os modelos e o contexto nunca são pedidos de novo sozinhos** (`retry` desligado nos três providers) | o Riverpod tenta de novo por padrão; um catálogo recusado por falta de vaga seria perguntado de novo a uma máquina cheia, e cada pergunta abre uma query que conta no teto. A folha oferece "tentar de novo" | B-11, B-14, S-21, S-45 |
| 2026-10-03 | **As faixas de cada lado da conversa têm um teto de 20 % da altura**, e rolam entre si só quando muitas aparecem juntas | em 360×640 com fonte em 200 %, conexão segurada, sessão encerrada e o bloqueio somados empurravam a conversa e a caixa (S-24) | B-07, B-09 |
| 2026-10-03 | **O esforço de uma sessão viva só é conhecido quando foi este app que a abriu** (`FirstPrompts` guarda o escolhido no rascunho); aberta em outro lugar, o chip diz "O do início" | o servidor não devolve o esforço em lugar nenhum depois do `session.start` | B-11, S-34 |
| 2026-10-04 | **F3, F4 e F5 implementadas juntas**, com os portões básicos de cada uma e o `verify:full` uma vez, no fim | pedido do usuário (as três de uma vez) e a preferência registrada: o portão inteiro só no fim do lote | o critério de cada fase é provado pelo `verify:full` final |
| 2026-10-04 | **O backend da F5 (B-25, B-26) e o encaminhamento local do web (a parte não-app da B-27) foram feitos por um subagente**, em paralelo ao app, na mesma árvore, sem tocar no `mobile/` nem nestes arquivos; os portões dele foram os escopados (backend, web, scripts), sem e2e | três frentes independentes; o e2e não pode rodar duas vezes ao mesmo tempo | B-25…B-27; [ADR-021](../../architecture/shared/00-decisions.md); `shared/08`; `.env.example`; [19 · F1](../19-distribution/F1-exposure.md) (a infraestrutura de produção faz o mesmo encaminhamento) |
| 2026-10-04 | **"Dono" da sessão é o app que a abriu** (`OwnedSessions`): pelo rascunho, pela retomada ou pelo fork — como o web faz com o navegador | o servidor não diz quem abriu; só o dono encerra (contrato, multi-cliente) | B-16, S-49, S-50 |
| 2026-10-04 | **O chip de status diz uma palavra curta** (conectado, reconectando, rodando, esperando você, encerrada) **e a folha diz a frase do web** (`sessions.dot.*`, no mapa compartilhado) | a frase inteira não cabe na `AppBar` de 360 dp com o título, o histórico e o `⋯` | B-15, S-46, S-47 |
| 2026-10-04 | **A fila de permissão do topo (`PermissionQueueStrip`/`PermissionQueueView`) saiu do código**, e os cenários dos planos 02 e 03 que a suíte dela provava passaram, inteiros, para `permission_panel_test.dart` | o card vive na conversa (B-20); a `PermissionPage` monta o `PermissionPanel` direto. O S-13 do plano 10 (a fila numa linha) deu lugar ao S-69 | B-20, S-69 |
| 2026-10-04 | **O glifo do indicador anda um oitavo de volta por segundo** (`AnimatedRotation`), em vez de girar sem parar | a linha já se reconstrói uma vez por segundo pelo relógio; uma animação infinita mantém a tela inteira animando e impede o `pumpAndSettle` de todo teste com turno rodando. Com `disableAnimations`, fica parado | B-18, S-57 |
| 2026-10-04 | **A tela da notificação oferece "Abrir a sessão" também com o pedido aberto**, e a rota da sessão aceita `?request=` para abrir rolada até o card | a S-74 pede "Abrir sessão leva à conversa já rolada até o card"; antes o botão só existia com o pedido encerrado | B-22, S-74 |
| 2026-10-04 | **O desfazer "até aqui" escolhe o ponto pelo texto do prompt**, como o web | o ponto do desfazer não carrega o id da mensagem; o rótulo dele é o texto do prompt | B-24 |
| 2026-10-04 | **O `AppConfig` passou a ser derivado** (`buildConfigProvider` + a escolha guardada → `appConfigProvider`); o boot lê a escolha do armazenamento seguro antes do primeiro frame, e o socket se reconecta sozinho na origem nova (`keepConnected`) | trocar de origem precisa reconstruir o cliente HTTP, o socket e o OIDC sem deixar resto (R-12) | B-28, `mobile/03` (Uma origem), `mobile/07` |
| 2026-10-04 | **Os defines do app mudaram**: `RC_INTERNAL_URL`, `RC_EXTERNAL_URL` e `RC_OIDC_REALM_PATH` no lugar de `RC_API_URL`, `RC_WS_URL` e `RC_OIDC_ISSUER`; a suíte de limites aponta pela origem do web dos limites (`RC_LIMITS_ORIGIN`); o `adb reverse` do e2e passa a ser o do web, o do web dos limites e o do Keycloak (a administração dos limites) | D-13, D-16 | `scripts/lib/stack.mjs`, `scripts/lib/mobile-local.mjs`, `scripts/mobile.mjs`, `scripts/run-mobile-local.mjs`, `.env.example`, `mobile/README.md`, `integration_test/support/` |
| 2026-10-04 | **A D-19 foi aberta**: no modo público, o `KC_HOSTNAME` fixo faz o radio interno do app falhar no login | descoberta pelo spike da B-25 | só o modo público; não bloqueia a F6 |
| 2026-10-04 | **O `permission.resolved` ganhou `toolUseId` opcional**, nas três pontas (schema, TS e Dart gerados, backend, web e app) — campo opcional, sem mudar a versão | o e2e do app (03 · S-44) mostrou que um pedido respondido por regra nunca vira card no app, e sem o `toolUseId` a linha da tool não tinha como dizer "por uma das suas regras" (B-20); antes, a frase aparecia na fila do topo, que saiu. O web tinha a mesma lacuna. A [09 · D-02](../09-chat-layout/decisions.md#f0--normas) manda o dado faltante entrar nas três pontas de uma vez | `05-websocket-protocol`, B-20 |
| 2026-10-04 | **`follow` da sessão devolve o seu próprio "parar"** (`SessionRepository.follow`), e o `unfollow` geral fica só para quem quer parar qualquer uma | o ciclo 24: uma tela descartada depois da seguinte cortava a assinatura dela. Defeito do plano 01 que só apareceu quando a frase da regra passou a depender da conversa (B-20) | `session_repository.dart`, `session_ws_data_source.dart`, os dois controladores |
| 2026-10-04 | **O plano ganhou a F7 — Instalação por USB**, por pedido do usuário: `pnpm mobile:install` instala o APK de debug no celular do cabo, com o interno pelo IP da rede local e o externo do `pnpm dev:public`, e diz no console os endereços usados. Quatro tarefas (B-34…B-37), vinte cenários (S-121…S-140) e quatro decisões (D-20…D-23); a D-20 abre na [D-14](decisions.md#f5--endereço-de-conexão) a exceção da rede privada, só no debug. A F6, ainda não iniciada, passa a recusar `http://` para IP **público** na S-112 | pedido do usuário; a D-14 recusaria o interno pela rede | F7 nova, F6 (B-30, S-112), S-95, README, decisions, `mobile/03`, `mobile/04`, `shared/08`, README da raiz e do app, `.env.example` |
| 2026-10-04 | **O plano ganhou a F8, a F9 e a F10 — pastas e sessões no app**, por pedido do usuário: várias pastas abertas (as mesmas das abas do web), a tela da pasta com nova sessão, as abertas e o histórico, e várias sessões abertas com uma faixa que troca entre elas. Dez tarefas (B-38…B-47), mais a B-48 na F6 (o e2e delas), 38 cenários (S-141…S-178) e cinco decisões (D-24…D-28); a D-26 muda a D-01 (as abas de conversa entram, como a faixa) | pedido do usuário; o backend já tinha tudo (06 · open-folders e recent, 08 · `GET /sessions`) | F8…F10 novas, F6 (B-48), README (escopo e rastreio), decisions, scenarios |
| 2026-10-04 | **O E2E voltou a ser a última fase**: as fases que entraram depois dele foram renumeradas — Instalação por USB F7 → F6, Pastas abertas F8 → F7, A tela da pasta F9 → F8, Várias sessões F10 → F9 — e o E2E F6 → F10, com a B-48. As linhas acima, datadas, falam da numeração da época | regra do usuário: o e2e é sempre a última fase; fase nova entra antes dele | os arquivos das fases, README, decisions, scenarios; as âncoras `#f6--instalação-por-usb` e `#f7f9--pastas-e-sessões-no-app` no README da raiz, `mobile/03`, `mobile/04`, `shared/08` |
| 2026-10-04 | **O socket do app passou a seguir várias sessões ao mesmo tempo** (`SessionWsDataSource`: uma inscrição por sessão, cada uma com o seu ponto), e cada evento e cada gap chegam carimbados com a sessão do frame | descoberto ao implementar a F9: o `follow` soltava a sessão anterior ao seguir outra, então a segunda sessão aberta desanexava a primeira — o painel prometeria o que não entregava. O teste "seguir duas vezes deixa a primeira para trás" virou "seguir uma segunda mantém a primeira" | `session_ws_data_source.dart`, `SessionUpdate` (`EventReceived.sessionId`, `StreamGap.sessionId`), `LiveSessionController` (filtra pelo seu), `mobile/03`, S-172, S-173 |
| 2026-10-04 | **As três telas novas não tentam de novo sozinhas** (`retry` desligado em `FoldersHomeController`, `FolderSessionsController`, `DirectoryController`), e a leitura em paralelo das Pastas devolve a falha original | o retry automático do Riverpod deixava a falha escondida atrás de "carregando", e o `.wait` embrulhava a falha num `ParallelWaitError`, sem o trace — os testes da S-150 e da S-151 acharam os dois | F7, F8 |
| 2026-10-04 | **`pnpm dev:public` mostra no quadro os endereços públicos** (web, API, health, WebSocket e issuer), ao lado dos de rede | pedido do usuário | `scripts/lib/stack.mjs` (`boardRows`), F6 (B-35) |
| 2026-10-03 | **A S-42 do plano 05 mudou o que afirma num ponto**: depois da sessão ociosa, a caixa não fica mais desligada — ela só retoma (sem parar, com "Retomar e enviar") | 09 · D-05, que este plano herda: na sessão encerrada, enviar retoma. O resto do cenário (o motivo dito, traduzido) continua igual | `limits_test`, B-07 |
| 2026-10-04 | **O conteúdo das folhas de baixo fica acima da barra de navegação do sistema**: o `showSheet` envolve o que a folha contém em `SafeArea(top: false)`, e o `showSessionSheet` passa a abrir por ele | defeito achado pelo usuário num celular de verdade, antes da F10: na folha do status, o custo ficava sob os botões de voltar e início. O `useSafeArea` do `showModalBottomSheet` só desvia do topo e das laterais, e os testes de widget rodavam sem inset embaixo | `message_strip.dart`, `session_sheet.dart`, `mobile/04` (Responsividade); testes em `message_strip_test` e `session_sheet_test` com uma barra de 48 dp |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-04 | **A linha decidida da tool diz de onde veio a resposta, não o nome de quem respondeu** ("Allowed in the browser.") | o app não lê o `resolvedBy`; as frases do plano 02 já existiam e o card nunca mostrou o autor | se o usuário pedir, uma tarefa do plano 10 ou de outro |
| 2026-10-04 | **A lista de tarefas não diz "era *estado*"** de cada tarefa que mudou, e as chamadas do `TodoWrite`/`Task*` continuam como linhas de tool | a B-23 pede a linha recolhida e a lista; o web marca a transição e absorve as linhas, e a matriz não tem cenário para isso | idem |
| 2026-10-04 | **Editar e reenviar não oferece "devolver também os arquivos"**, como o web oferece | fora da B-24; o desfazer "até aqui" faz o mesmo em dois toques | idem |

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
| R-10 | mais de um issuer alarga a confiança | 🔲 aberto | lista explícita, spike B-25, ADR |
| R-11 | encaminhamento local muda o dev do web | 🔲 aberto | S-91 e o e2e do web |
| R-12 | troca de origem deixa resto | 🔲 aberto | S-101, S-102 |
| R-13 | endereço errado tranca o app | 🔲 aberto | tela sem login, testar antes (S-106, S-108) |

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
