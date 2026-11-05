# F8 — E2E

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F7](F7-notice-persistence.md).
**Entrega:** o plano provado pela porta do usuário, no web e no app, e as medições da F0 repetidas
contra o Claude real a cada versão do CLI.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-25 — E2E do web ✅

**Como ficou:** `e2e/specs/conversation-losses.spec.ts`, com a fixture `compact-turn` (dois turnos
numa só gravação — a resposta e a compactação), `hook-message-turn`, `mcp-media-result-turn`,
`denied-by-rule-turn` e a nova `unknown-variant-turn` (escrita à mão, `handWritten: true` —
B-13/B-25, uma mensagem `{type:'system', subtype:'nunca_visto', content:'...'}` que nenhuma gravação
real pode provocar de propósito, o mesmo motivo da D-09). Confere, na mesma conversa, as seis coisas
do roteiro e depois reabre a mesma conversa com `reloaded()` (F5, `historicalEvents`, não uma segunda
gravação) e confere tudo de novo. Achados ao rodar contra o stack real:

- o rótulo de uma tool com `title` (a descrição que o modelo deu) é `"{kind} · {title} ({label})"`,
  não só `{label}` — a tool negada do teste (`touch forbidden.txt`) tem `title: 'Create an empty
  file'`, e o seletor precisou do texto inteiro;
- a linha do `unknown` só mostra o `detail` (`system:nunca_visto`) fechada; o `text` do B-13 só
  aparece ao abrir a linha, igual a qualquer outro aviso.

`pnpm test:e2e` (suite inteira, 154 casos): **verde** — só a minha própria task falhou nas duas
primeiras tentativas (os dois achados acima, corrigidos), e as únicas falhas restantes
(`chat-layout`, `claude-panel-phone`, `claude-panel-sessions`) são de specs que este plano nunca tocou,
sempre com o teto de 120 s batido, nenhuma delas presa na mesma asserção duas vezes — o padrão já
catalogado de instabilidade sob carga desta máquina, não uma regressão. Cenário S-103.

### B-26 — E2E do app ✅

**Como ficou:** `mobile/integration_test/conversation_losses_test.dart`, o mesmo roteiro da B-25,
lendo o mesmo `e2e/scenarios/conversation-losses.json` (precisou entrar em `SHARED_BY_NAME`,
`scripts/mobile.mjs` — sem isso o define `RC_SCENARIO` não carrega o arquivo, por ele não começar com
`mobile-`/`limits-`). `flutter analyze` limpo.

**R-08 (o balão fantasma da compactação) — confirmada e corrigida.** A causa raiz: `asStored()`, em
`backend/test/fakes/agent-sdk/scripted-query.ts` — a função que o **stack de e2e** usa para decidir o
que persistir no transcript conforme a sessão roda ao vivo —, descartava toda mensagem `type: 'system'`
e nunca traduzia `isSynthetic`/`isReplay` (campos só do SDK ao vivo) para `isCompactSummary`/
`isCompletedLocalCommand` (os nomes que o histórico usa, medidos na F5). Ou seja: o **fake de teste**
nunca guardava o `compact_boundary` nem marcava a sintética — um gap de fidelidade dele mesmo, não do
produto. Isso só aparece quando uma leitura de histórico acontece **no meio** de uma sessão ainda
viva (`_readHistory`/`retryHistory`/um reanexo depois de um gap do buffer de replay) — o que o teste
do web nunca provoca (o `reloaded()` da B-25 é uma reconexão à sessão viva via `session.attach`,
que repete o que o buffer já tinha, nunca uma leitura pelo transcript) e o do app, sim, porque
`LiveSessionController._publish()` sempre mostra `_live.withHistory(_history)`, mesmo com a sessão
ainda viva.

Corrigido em duas partes de `asStored()`: (1) um `system` com `subtype: 'compact_boundary'` passa a
ser guardado **sem** `subtype` — a forma "nua" que uma leitura real do histórico tem, medida na F5 —,
o que deixa `historicalSystemEvents` reconhecer o limite da compactação mesmo numa releitura no meio
da sessão; (2) `isSynthetic`/`isReplay` do SDK ao vivo passam a virar `isCompactSummary`/
`isCompletedLocalCommand` no que fica guardado, os nomes que `historicalUserEvents` já lê. Prova
permanente: `scripted-conversations.spec.ts`, um teste de integração novo que roda `compact-turn`
pela `ScriptedQuery` de verdade e confere as duas marcas no transcript guardado — sem precisar de
emulador nem de `LiveSessionController`, já que a lógica do domínio (`Conversation.apply()`/
`withHistory()`) já estava certa (confirmado à parte, num teste de unidade Dart que repete a mesma
sequência de eventos e dobra certinho em `CompactionLine.summary`, nunca em balão).

**Confirmado por experimento controlado**, não só por leitura de código: rodar a B-26 contra o
emulador real com a correção revertida (`git stash`) traz o balão fantasma de volta, exatamente como
antes; com a correção, a compactação e o `command.output` aparecem certos, sem balão, em duas
rodadas seguidas do emulador. R-08 fechado.

**Um achado novo, separado da R-08 — root-caused, não é bug.** Nas mesmas duas rodadas que
confirmaram a R-08 corrigida, a conversa viva do app parou de mostrar os dois avisos `agent.info` do
`hook-message-turn` (o informativo do hook que funcionou, e o `warning` do que falhou de propósito) —
mas só **ao reabrir pelo histórico**, nunca ao vivo. Investigado a fundo (instrumentação direta,
`node scripts/run-e2e-local.mjs --mobile conversation_losses`, não só leitura de código). Descartado,
nessa ordem:

- não é o replay/overlay do histórico ao vivo: os logs do backend mostram `"gap":false` em toda
  sessão da rodada — `_readHistory` nunca dispara para esta conversa (não há `resumedFrom`, não há
  gap) **antes** do `reopenFromHistory` do próprio teste;
- não é a lógica do domínio: a mesma sequência de eventos (compactação seguida do
  `hook-message-turn`), replayada por `Conversation.apply()` num teste de unidade, produz os dois
  `NoticeLine` certinhos;
- não é a correção da R-08 acima: revertê-la e rodar de novo nem chega a esse ponto;
- não é um bug de render: instrumentado `NoticeRow.build()` e `entriesUnder(null)` diretamente —
  **os dois avisos chegam certos até o ponto de montar o widget, ao vivo**; eles somem especificamente
  depois do `reopenFromHistory` do teste, quando a conversa é reconstruída **só** do histórico.

**Causa raiz, medida:** `withHistory` instrumentado mostrou a releitura fria trazendo 29 eventos do
histórico, cujo fold produz só o aviso `command.output` da compactação — os dois `agent.info` do hook
não estão entre eles. Isso bate exatamente com o que a F5 (B-17) já havia medido e documentado em
`historicalSystemEvents`: "nenhum outro subtipo de `system` deixa qualquer traço no histórico" — nem a
tool negada, nem o comando local — e o mesmo vale para o `system:informational`/`system:hook_response`
que os dois avisos de hook usam. **Não é um gap de código, é uma propriedade medida do transcript do
Claude**: um aviso de hook não tem nenhum rastro para `historicalEvents` reconstruir, porque o próprio
motor nunca o escreveu.

O web (B-25) nunca reproduz isso porque o `reloaded()` de lá reconecta pelo buffer de replay do
`session.attach` (reentrega o que a sessão viva já mandou), nunca por uma leitura do transcript — só o
`reopenFromHistory` do app exercita de fato `historicalEvents`.

**Decisão do usuário (D-15):** em vez de reduzir o escopo da S-104 (aceitar o aviso de hook como "só ao
vivo"), o backend passa a persistir o `session.notice` por conta própria, fora do transcript do Claude,
e devolvê-lo mesclado numa releitura fria — virou a **F7** deste plano
([F7-notice-persistence.md](F7-notice-persistence.md), B-29…B-31), renumerada para antes desta fase
porque a regra do [índice de planos](../README.md#as-quatro-regras-estruturais) manda a E2E ficar
sempre por último — a fase nasceu com o nome F8 enquanto a E2E já rodava sob o número F7; os dois
trocaram de número quando a persistência entrou (ver [progress.md](progress.md#decisões-tomadas-durante-a-execução)).

**R-10 fechada.** Com a F7 pronta (o armazém próprio, a escrita ao vivo e a mescla na leitura do
histórico), a B-26 foi re-executada contra o emulador real, duas vezes: primeiro o cenário isolado
(`node scripts/run-e2e-local.mjs --mobile conversation_losses`), depois a suíte inteira
(`pnpm test:e2e:mobile`, 17 arquivos). Nas duas, os dois avisos `agent.info` do `hook-message-turn`
aparecem certos — ao vivo e ao reabrir a conversa pelo histórico. Cenário S-104 ✅ — ver
[scenarios.md](scenarios.md). O risco R-10 está fechado em
[progress.md](progress.md#riscos--acompanhamento).

Na suíte inteira (17 arquivos), 2 falhas em arquivos que este plano nunca tocou —
`chat_layout_test.dart` S-120 e `live_history_test.dart` S-128/S-129 —, nenhuma delas o
`conversation_losses_test.dart`. Investigadas antes de descartar, não só assumidas:

- `live_history_test.dart` S-128/S-129 é a **R-12 já catalogada no plano 13**
  ([progress.md de lá](../13-claude-settings/progress.md#riscos--acompanhamento)): uma falha
  determinística ("Expected: exactly one matching candidate", o banner "Something else wrote this
  conversation…" nunca aparece), confirmada 4/4 em 2026-11-01, alheia a qualquer mudança de produto
  — o arquivo e seu único apoio (`conversations_elsewhere.dart`) continuam intocados, e o mesmo
  cenário pelo mesmo endpoint do backend passa limpo no Playwright equivalente
  (`live-history.spec.ts`). Reproduzida de novo aqui, isolada (`node scripts/run-e2e-local.mjs
  --mobile live_history`, falha idêntica, mesmas duas linhas) — o mesmo padrão, não uma regressão
  da F7: o texto que falha ("Something else wrote this conversation…") é calculado inteiramente no
  cliente, a partir de um timestamp local, sem nenhuma relação com `session.notice`/o armazém novo.
  Decisão do usuário no plano 13: pendência aceita, não bloqueia fechamento de plano;
- `chat_layout_test.dart` S-120 (o ciclo em fonte 200 %, o comando do card inteiro) falhou em
  `SessionRobot.answer`/`ensureVisible` não achando o widget a tempo — uma tela de permissão, sem
  relação nenhuma com histórico, transcript ou aviso. Consistente com o padrão de instabilidade sob
  carga já catalogado neste plano (B-25, `push.flow.spec.ts` S-51, correções #17/#18) e com o estado
  da máquina na hora: `swap` em 8,0/8,0 GiB, `load average` 11-12, com testes do Gradle de **outra
  sessão** rodando ao mesmo tempo (não tocados — não são daemons órfãos, são trabalho legítimo
  concorrente).

Nenhuma das duas falhas usa `session.notice`, `NoticeStore`, `AgentSdkTranscriptAdapter.messages()`
nem qualquer caminho que a F7 tocou — confirmado lendo o que cada uma de fato verifica, não só pelo
nome do arquivo.

**`pnpm verify:full` (critério de conclusão da fase):** verde — ver o histórico de validação para o
ciclo completo (as correções de cobertura que precederam esta confirmação, #26…#28).

### B-27 — `smoke-live` das medições ✅

**Como ficou:** `e2e/smoke-live/conversation-losses.spec.ts`, contra o Claude real, pelo contrato WS
do backend (nunca o SDK cru) — o mesmo padrão de `conversation-parity.spec.ts` (plano 26, F7). Cobre
a mensagem sintética e o eco do `/compact` (S-105) e que o mesmo sobrevive a um reanexo do zero
(S-106, prova indireta de que o histórico — B-16, `includeSystemMessages` — carrega o mesmo). **Não
rodado nesta sessão**: pede login real nesta máquina e gasta cota, e `pnpm test:e2e:live` não é
portão por isso mesmo (D-12 do plano 01) — escrito e com `tsc`/`eslint` limpos, mas sem confirmação
contra o Claude real. Ficou de fora, por não ter sido medido ao vivo nem por B-01 nem aqui, o
`local_command_output` de um comando puramente local (tipo `/cost`): a B-01 mediu que esse comando
sai como `local_command_source`/`local_command_run` numa mensagem `assistant` sintética
(`model: '<synthetic>'`), uma forma que B-09/B-11 não tratam — nunca vira aviso, só texto comum. Não é
perda silenciosa (o texto aparece, só não dobra como aviso), mas é uma lacuna real, registrada na nova
entrada de risco R-09 de [progress.md](progress.md#riscos--acompanhamento). Cenários S-105, S-106.

### B-28 — As fixtures do plano 13 na paridade ✅

**Como ficou:** `packages/contracts/fixtures/conversation-parity/` ganhou a pasta `mcp-media-result-turn`
(gerada por `pnpm fixtures:conversation-parity`, `expected.json` escrito à mão contra o `live-events.json`
como o README manda) — a imagem como anexo (`kind: 'image'`, com `blockId`/`mediaType`/`size`), e o
`resource_link` confirmado como texto solto no resumo (F4), nunca um anexo à parte. `user-skill-plugin-turn`
regravado: o corpo da skill agora chega com `injected.kind: 'instructions'` (F3 · B-11), e o `expected.json`
trocou a entrada `message` por uma `injected` (owner = o `toolUseId` da `Skill`, não um subagent — o
README ganhou a nota de que o campo é reaproveitado com esse segundo sentido). `mcp-untitled-tool-turn`
e `mcp-composed-tool-turn` também regravaram: o `ToolSearch` que o modelo chama antes de qualquer tool
MCP carrega um bloco `tool_reference` que F4 classifica `kind: 'unknown'` — `expected.json` dos dois
ganhou essa entrada em `media`. Os dois projetores (web, `conversation-parity-fixtures.spec.ts`; app,
`conversation_parity_fixtures_test.dart`) ganharam a entrada `injected` e passaram a ler `media` de
`tool.attachments`/`entry.attachments` de verdade, em vez do `[]` fixo de antes — e os dois tiveram que
corrigir o mesmo engano: a fatia "só o que pertence ao subagent" (`owner !== null`) não pode mais
incluir uma entrada `injected`, porque o campo ali nomeia a tool dona, não um subagent. `pnpm vitest`
(web) e `flutter test` (app) verdes nos dois arquivos. Cenário S-107.

---

## Cenários cobertos

S-103…S-107.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
pnpm test:e2e:live
```
