# Plano 27 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — plano concluído. F0…F8 feitas, e o critério de conclusão também:
`pnpm verify:full` sai com os onze portões verdes, `pnpm test:e2e:mobile` e `pnpm test:e2e:live`
(contra o Claude real, os seis casos — incluindo o `smoke-live` das S-105/S-106 deste próprio plano)
também.
**Última atualização:** 2026-11-05
**Bloqueios:** nenhum. O que travava o `pnpm verify:full` já foi corrigido — ver as correções #31
(o `{{agent}}` do gate 9) e #33 (a mesma causa, achada de novo na rota de settings do agente, que
parecia um bug de autenticação e não era) — e o achado novo de dependências do gate 10 (#34…#36,
decisão do usuário de corrigir agora). A R-08 (o balão fantasma da compactação, achada pela B-26) foi confirmada e
corrigida — causa raiz num gap de fidelidade do **fake de e2e** (`asStored()`, `scripted-query.ts`),
que descartava mensagens `system` e as marcas `isSynthetic`/`isReplay` ao persistir uma sessão ainda
viva; confirmado por um experimento controlado (reverter a correção traz o balão de volta, duas
vezes). No mesmo ciclo, a B-26 achou uma **segunda** lacuna — os avisos de hook do
`hook-message-turn` somem da tela ao reabrir a conversa pelo histórico —, root-caused: **não era
bug**, era o que a F5 já media (B-17) — nenhum `system` de hook deixa rastro no transcript do Claude.
Decisão do usuário (D-15): persistência própria, não redução de escopo — a **F7**
([F7-notice-persistence.md](F7-notice-persistence.md), B-29…B-31) deu ao backend um armazém próprio
para o `session.notice`, fora do transcript, mesclado na leitura do histórico. Com a F7 pronta, a
B-26 foi re-executada contra o emulador real (o cenário isolado e a suíte inteira) e confirmou os
dois avisos certos nas duas vezes — R-10 fechada, S-104 ✅. Os planos
[26](../26-mobile-conversation-parity/README.md), [13](../13-claude-settings/README.md)
e [28](../28-agent-neutral-core/README.md) estão concluídos ([D-01](decisions.md#normas),
[D-14](decisions.md#normas)), e as 14 decisões do plano foram tomadas pelo usuário em 2026-11-01
([decisions.md](decisions.md)) — inclusive a D-02, que escolheu mostrar o evento desconhecido (o
[05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)
muda na B-24, não antes), e a D-08, que trouxe o zoom da imagem do web de volta ao escopo

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
F7 ████████████████████ 100%   ✅ concluída
F8 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-spike.md) | B-01, B-02 | 2/2 | ✅ |
| [F1](F1-known-silent.md) | B-03, B-04 | 2/2 | ✅ |
| [F2](F2-contract.md) | B-05…B-07 | 3/3 | ✅ |
| [F3](F3-backend-notices.md) | B-08…B-13 | 6/6 | ✅ |
| [F4](F4-tool-media.md) | B-14, B-15 | 2/2 | ✅ |
| [F5](F5-history.md) | B-16…B-18 | 3/3 | ✅ |
| [F6](F6-clients.md) | B-19…B-24 | 6/6 | ✅ |
| [F7](F7-notice-persistence.md) | B-29…B-31 | 3/3 | ✅ |
| [F8](F8-e2e.md) | B-25…B-28 | 4/4 | ✅ |
| **Total** | **B-01…B-31** | **31/31** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 124 | 1 | 0 | 119 | 4 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 15 | 0 | 0 | 15 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-11-02 | F2 | 7 — coverage | `cli.spec.mjs` ("in sync with the committed schema") falhou com porta 5173 ocupada e conexão de banco derrubada; processos órfãos de uma execução anterior interrompida (`backend start:scripted`, `web preview`, `scripted-main.ts`, ~1 dia de idade) ainda vivos, disputando porta e conexão | processos órfãos encerrados (autorizado pelo usuário); `node scripts/contracts.mjs --check` confirmado em sincronia manualmente antes de reiniciar | reiniciado do portão 1 |
| 2 | 2026-11-02 | F2 | 7 — coverage | `push.flow.spec.ts` S-51 ("withdraws only after the retry...") estourou timeout de frame sob `load average` ~20 (Gradle daemon, VS Code, Docker e outra sessão de agente concorrentes na mesma máquina) — já catalogado como teste instável sob carga | nenhuma correção de código; reiniciado do portão 1 sem mudança | gates 1-7 verdes |
| 3 | 2026-11-02 | F3 | 1 — formatting | os cinco arquivos novos/alterados da B-08…B-13 não estavam no estilo do Prettier | `prettier --write` nos cinco; `tsc` conferido depois | reiniciado do portão 1 |
| 4 | 2026-11-02 | F3 | 4 — architecture | `depcruise` reprovou `sdk-message-classification.ts` por `no-orphans`: nada em `src/` o importava, só o teste | `QUIET_TYPES` do mapper passou a ser derivado de `SDK_VARIANT_CLASSIFICATION` (os `type` de nível de cima classificados `quiet` e fora do `HANDLERS`), uma dependência real em vez de um `import` cosmético | reiniciado do portão 1 |
| 5 | 2026-11-02 | F3 | 7 — coverage | `test/integration/scripts/gates.spec.mjs` ("i18n-check.mjs: passes over the catalogues as they stand") reprovou: as seis `messageKey` novas da B-09 (`sessions.notice.*`) não tinham tradução no catálogo do web — essa checagem roda dentro do portão 7, não só do 11 | as seis chaves entraram em `web/src/shared/i18n/locales/{en,pt-BR}.json`, com texto mínimo; nenhum componente as lê ainda (fica para a F6) | reiniciado do portão 1 |
| 6 | 2026-11-02 | F5 | 1 — formatting | três arquivos de teste novos/alterados da B-16…B-18 não estavam no estilo do Prettier | `prettier --write` nos três; `tsc` conferido depois | reiniciado do portão 1 |
| 7 | 2026-11-02 | F5 | 7 — coverage | `docs-check.mjs` (dentro de `cli.spec.mjs`) reprovou: a nota "como ficou" da B-18 em F5-history.md linkava `05-websocket-protocol.md#eventos`, âncora que não existe — o cabeçalho real é "Eventos (servidor → cliente)", de slug `#eventos-servidor--cliente` | o link corrigido para o slug certo; `node scripts/docs-check.mjs` conferido isolado antes de reiniciar | reiniciado do portão 1 |
| 8 | 2026-11-02 | F6 | 1 — formatting | os arquivos novos/alterados da B-19…B-23 (web e app) não estavam no estilo do Prettier/`dart format` | `prettier --write` e `dart format` nos arquivos afetados | reiniciado do portão 1 |
| 9 | 2026-11-02 | F6 | 2 — lint | violações de lint nos arquivos novos da B-19…B-23 | corrigidas as violações apontadas | reiniciado do portão 1 |
| 10 | 2026-11-02 | F6 | 5 — duplication | `jscpd` achou 6 clones reais: repetição de estilo em `conversation_lines.dart` (título/`trailing` do `FoldLine`); o construtor/campos de `NoticeLine` batendo com os de `SessionNotice`; `_withGenericOnce` repetindo o guard de dedupe de `_withNotice`; e duas vezes o padrão `final AppLocalizations l10n = …; final ColorScheme scheme = …` de `_UnknownBlockView`/`_UnknownAttachmentView` colidindo com arquivos pré-existentes diferentes a cada tentativa de reordenar | extraído `_quietLineStyle` (app); campos de `NoticeLine` reordenados (classes diferentes, ordem sem significado semântico); `_withGenericOnce` simplificado para `_withEntry`; extraído `mutedBodyStyle(BuildContext)` em `app_theme.dart`, reusado pelos dois widgets — a correção robusta, não mais uma reordenação cosmética | reiniciado do portão 1 |
| 11 | 2026-11-02 | F6 | 7 — coverage | `engine-neutrality.mjs` apontou vocabulário do motor fora de `engines/`: os nomes `tool_use`/`tool_result`/`redacted_thinking` (snake_case da API Anthropic) em `SILENT_BLOCK_TYPES` (web) e `_silentBlockTypes` (app), introduzidos por mim como compatibilidade com um formato que o adapter já canonicaliza antes de qualquer coisa chegar ao cliente (`blockKindOf`/`BLOCK_KINDS` do `sdk-message.mapper.ts`) | os 3 nomes snake_case removidos dos dois conjuntos (mantido só o canônico `toolUse`/`toolResult`); os testes de compatibilidade B-30/S-88 passaram a esperar que essa entrada (hoje impossível) leia como `unknown` (U-05), nunca mais como descartada em silêncio | reiniciado do portão 1 |
| 12 | 2026-11-02 | F6 | 7 — coverage | `session-changes.spec.ts` (S-118) estourou sob `load average` ~15-17 (outras sessões/processos concorrentes na mesma máquina) — já catalogado como instável sob carga, sem relação com a F6 | nenhuma correção de código; reiniciado do portão 1 sem mudança | gates 1-7 verdes até este ponto |
| 13 | 2026-11-02 | F6 | 7 — coverage | 4 arquivos do web abaixo de 90 % por arquivo: `MessageItem.tsx`, `ZoomableImage.tsx`, `TurnRow.tsx`, `ToolRow.tsx` — os caminhos de render dos componentes novos da B-21…B-22 só tinham cobertura indireta, pelos testes do redutor | 29 testes novos de componente, em 4 arquivos (`ToolAttachments.spec.tsx`, `TurnRow.spec.tsx`, `MessageItemUnknownBlock.spec.tsx`, `ZoomableImage.spec.tsx` ampliado) | reiniciado do portão 1 |
| 14 | 2026-11-03 | F6 | 7 — coverage | 2 arquivos do app abaixo de 90 % por arquivo: `conversation_entry.dart` (82,8 %) — os `props`/construtores de `ToolAttachment`/`ImageAttachment`/`LinkAttachment`/`UnknownAttachment` e de `NoticeLine`/`InjectedLine`/`CompactionLine.withSummary` nunca eram comparados por valor, só usados como literais `const` num teste de widget — e `conversation_lines.dart` (85,0 %) — a maioria dos `messageKey` de `_bodyOfMessageKey`, dois `GenericReason` (`unknownValue`, `malformed`), três `kind` do mapa de rótulos, o `TurnOutcome.cancelled`/`budgetExceeded` e o ramo `failed > 0` de `RewoundRow`/o `ReplayGapRow` nunca tinham teste | testes de igualdade/`props` novos em `conversation_entry_test.dart`; testes de widget novos para cada `messageKey`/`GenericReason`/`kind` restante em `notice_row_test.dart`, para os outcomes restantes em `conversation_view_test.dart`, e um `conversation_lines_test.dart` novo para `RewoundRow`/`ReplayGapRow` | reiniciado do portão 1 |
| 15 | 2026-11-03 | F6 | 1 — formatting | os 3 arquivos novos de teste do web da correção #13 (`ToolAttachments.spec.tsx`, `TurnRow.spec.tsx`, `ZoomableImage.spec.tsx`) não estavam no estilo do Prettier | `prettier --write` nos três | reiniciado do portão 1 |
| 16 | 2026-11-03 | F6 | 1 — formatting | `conversation_entry_test.dart` (novo teste unitário da correção #14, no app) não estava no estilo do `dart format` — `format:check` roda com `--output=none` (só relata, nunca escreve); um reinício sem rodar o `format` de verdade repetiu a mesma falha num segundo ciclo | `dart format` (sem `--output=none`) rodado de fato no arquivo; conferido com `--output=none --set-exit-if-changed` (0 changed) antes de reiniciar | reiniciado do portão 1, duas vezes seguidas pela mesma causa antes da correção pegar |
| 17 | 2026-11-03 | F6 | 7 — coverage | `push.flow.spec.ts` S-51 ("withdraws only after the retry...") estourou timeout de frame sob `load average` ~29,6 (VS Code, Gradle daemon, `rea` MCP e processos concorrentes na mesma máquina) — já catalogado como teste instável sob carga, sem relação com a F6 | nenhuma correção de código; reiniciado do portão 1 sem mudança | reiniciado do portão 1 |
| 18 | 2026-11-03 | F6 | 7 — coverage | mesmo S-51, de novo, sob `load average` ~15-22 — rodado isolado (`vitest run … -t "withdraws only after the retry"`) para confirmar: passa sozinho em 10,6 s, sem relação com código algum da F6; é a mesma instabilidade sob carga da correção #17, não uma causa nova | nenhuma correção de código; reiniciado do portão 1 sem mudança | gates 1-7 verdes na tentativa seguinte, com a carga já menor (~11-20) |
| 19 | 2026-11-03 | F7 | `pnpm test:e2e` (B-25) | o seletor da tool negada (`toolRow`) só tinha o rótulo curto (`Shell: touch forbidden.txt`); a linha real soma o `title` que o modelo deu (`Shell · Create an empty file (Shell: touch forbidden.txt)`) | seletor corrigido para o texto inteiro, achado direto contra o stack real, não um palpite | `pnpm test:e2e` verde (154 casos) |
| 20 | 2026-11-03 | F7 | `pnpm test:e2e` (B-25) | a linha do `unknown` só mostra o `detail` fechada; o teste conferia o `text` (B-13) sem abrir a linha primeiro | a asserção passou a abrir a linha (`opens(unknown)`) antes de conferir o `text` | `pnpm test:e2e` verde (mesma rodada da #19) |
| 21 | 2026-11-03 | F7 | `pnpm test:e2e:mobile` (B-26) | `e2e/scenarios/conversation-losses.json` não compilava no app: `scripts/mobile.mjs`'s `SHARED_BY_NAME` só inclui cenários cujo nome começa com `mobile-`/`limits-` ou está numa lista fixa — `conversation-losses` não estava nela | `'conversation-losses'` entrou em `SHARED_BY_NAME` | o cenário passou a compilar; a suíte seguiu e achou o bloqueio registrado em F7-e2e.md (B-26) e no risco R-08 abaixo |
| 22 | 2026-11-03 | F7 | `pnpm test:e2e:mobile` (B-26, R-08) | causa raiz confirmada: `asStored()` (`scripted-query.ts`, o fake de e2e) descartava `system` e nunca traduzia `isSynthetic`/`isReplay` ao persistir uma sessão ainda viva — uma releitura de histórico no meio dela (só o app faz isso) nunca via o `compact_boundary` nem a sintética | `asStored()` passou a guardar um `compact_boundary` sem `subtype` (a forma "nua" medida na F5) e a traduzir `isSynthetic`/`isReplay` para `isCompactSummary`/`isCompletedLocalCommand`; prova nova em `scripted-conversations.spec.ts` | confirmado por experimento controlado: reverter traz o balão de volta (duas rodadas do emulador); com a correção, a compactação some do balão e aparece certa nas duas rodadas seguintes — backend inteiro (494 arquivos, 6901 casos) e app inteiro (2569 casos) verdes depois da correção |
| 23 | 2026-11-03 | F7 | `pnpm test:e2e:mobile` (B-26) | achado novo, não o R-08: os dois avisos do `hook-message-turn` somem da conversa ao vivo do app, reproduzido nas duas rodadas que confirmaram a correção #22 | nenhuma correção ainda — descartado histórico/gap (`"gap":false` nos logs), a lógica do domínio (replay isolado produz os dois `NoticeLine`) e a correção #22 em si (revertê-la nem chega a esse ponto); registrado como risco novo R-10, sem causa raiz | B-26/F7 seguem ⛔ por este achado — não cabia mais um ciclo de emulador neste ciclo (protocolo de três ciclos) |
| 24 | 2026-11-03 | F7 | `pnpm verify:full` | gate 1 (formatting): `scripted-conversations.spec.ts` (teste novo da correção #22) fora do estilo do Prettier | `prettier --write` no arquivo | reiniciado do portão 1 |
| 25 | 2026-11-03 | F7 | `pnpm verify:full` | gate 8 (integration) travou em `node scripts/mobile.mjs test:widget`, no meio de `workspace_list_page_test.dart` — um teste de widget sem relação nenhuma com este plano (lista de workspaces) — com a máquina em `swap` quase cheio (7,9/8,0 GiB) e três daemons do Gradle (9.1.0 ×2, 9.6.0) mais dois do Kotlin ainda vivos de rodadas anteriores do emulador | nenhuma correção de código — ambiental: a MESMA suíte (`flutter test` inteiro, 2569 casos) já tinha passado limpa, isolada, horas antes nesta mesma sessão (ver a correção #22 acima); não reiniciado de novo por falta de orçamento de tempo/ciclos nesta sessão | gates 1-7 verdes; gate 8 não confirmado — ver a nota em F7-e2e.md e o relato final |
| 26 | 2026-11-04 | F8 | `pnpm verify` (B-29) | `src/adapter/outbound/persistence/notice/persisted-notice.mapper.ts` em 50 % de branches (precisa 90 %): só o ramo "`at` ausente, preenche com `recordedAt`" de `toPayload` tinha teste, nunca o ramo "`at` já presente, mantém" | teste de unidade novo (`persisted-notice.mapper.spec.ts`) cobrindo os dois ramos | reiniciado do portão 1 |
| 27 | 2026-11-04 | F8 | `pnpm verify` (B-30) | gate 4 (`lint:arch`, `no-outward-dependency-application`): `start-session.use-case.ts` importava `@shared/logging/logger` para logar a falha de gravação do aviso ali mesmo — nenhum outro caso de uso de `application/` faz isso, medido | a responsabilidade de logar e engolir a falha moveu inteira para `DrizzleNoticeStoreRepository` (que já tem logger, por ser adapter); o contrato de `NoticeStore.record` passou a dizer explicitamente que nunca rejeita; `persistNotice()` no caso de uso voltou a ser uma chamada `void`, sem `catch` | reiniciado do portão 1 |
| 28 | 2026-11-04 | F8 | `pnpm verify` (B-29, B-31) | `pnpm neutral:check`: "Claude" e "hook_response" em comentários de `notice-store.port.ts`, `start-session.use-case.ts` e `persisted-notices.schema.ts` — fora de `engines/claude/` | reescritos em linguagem neutra ("an agent hook's own warning", "one engine's own id alone"), sem mudar comportamento | reiniciado do portão 1 |
| 29 | 2026-11-04 | F7+F8 | `pnpm verify` | gate 7 (coverage): backend e web, cada um numa rodada — a #26 já tinha pego a do backend; a do web era pré-existente, não causada pela F8: `web/src/shared/components/markdown/Markdown.tsx` em 81,25 % de branches — o `<pre>` liso sem `renderCode` (linha 178) e o nome de uma imagem remota pelo próprio `alt` (linha 221) nunca tinham teste | dois testes novos em `Markdown.spec.tsx` cobrindo os dois ramos — `Markdown.tsx` a 100 % | reiniciado do portão 1; `pnpm verify` saiu verde (gates 1-7) na tentativa seguinte |
| 30 | 2026-11-04 | F7 (B-26) | `pnpm test:e2e:mobile` (confirmação final da R-10) | suíte inteira (17 arquivos): `conversation_losses_test.dart` passou — R-10 confirmada fechada —, mas 2 falhas em arquivos que este plano nunca tocou (`chat_layout_test.dart` S-120, `live_history_test.dart` S-128/S-129) | investigado antes de descartar: `live_history_test.dart` é a **R-12 já catalogada no plano 13** (determinística, 4/4 em 2026-11-01, confirmada alheia a qualquer mudança de produto, aceita como pendência pelo usuário); reproduzida de novo aqui, isolada, falha idêntica — confirma o mesmo padrão, não uma regressão da F8 (o texto que falha é calculado no cliente, sem relação com `session.notice`). `chat_layout_test.dart` S-120 falhou em `ensureVisible`/timing de widget, numa tela de permissão sem relação com histórico — consistente com a instabilidade sob carga já catalogada (B-25), e a máquina estava com `swap` 8,0/8,0 GiB e `load average` 11-12 por testes do Gradle de **outra sessão**, não tocados (trabalho legítimo concorrente, não daemons órfãos) | nenhuma correção — nenhuma das duas falhas usa `session.notice`/`NoticeStore`/o caminho que a F8 tocou, confirmado lendo o que cada teste de fato verifica |
| 31 | 2026-11-04 | F7 | `pnpm verify:full` → gate 9 (web e2e) | `chat-layout.spec.ts`, `claude-panel-phone.spec.ts`/`claude-panel-sessions.spec.ts` e `live-history.spec.ts` — de três planos diferentes (08, 09, 22) — estouravam o teto de 120 s em `locator.click`, sempre em specs que conferem texto estático logo após o carregamento da página, nunca as mesmas exatas, sob carga variável; três rodadas (uma dentro do `verify:full`, duas isoladas) nunca fecharam 154/154. O trace do Playwright mostrou a causa real: um botão preso no texto de reserva do i18n ("the agent"), nunca "Claude Code" — a variável que guarda o `GET /engines` resolvido (`web/src/shared/i18n/agent-names.ts`) não é reativa por si (nada no React assina um módulo-nível), então um componente que já renderizou antes dela chegar fica preso até algum outro re-render incidental acontecer, o que a maioria das telas tem de sobra — por isso só specs "caladas" logo após o load a pegavam | `nameAgents()` passou a chamar um `watcher` registrado por `watchAgentNames()`; `createI18n` o registra reemitindo o próprio `languageChanged` do i18next — o mesmo evento que `useTranslation` já assina, então todo texto montado some o "the agent" assim que o diretório chega, sem depender de um re-render alheio. Teste de unidade novo em `i18n.spec.ts` prova a atualização sem nenhum outro re-render. Nota em [06-testing-strategy.md](../../architecture/shared/06-testing-strategy.md) sobre o padrão "timeout intermitente em specs sem relação é pista, não ruído" | confirmado: as 4 specs antes instáveis, isoladas, 25/25 passando; suíte do web inteira (2642 casos, 282 arquivos) verde. A suíte `pnpm test:e2e` inteira (154 casos), rodada depois, achou um problema **novo e não relacionado** (ver abaixo) antes de fechar 154/154 — o gate 9 desta causa está resolvido, mas o portão como um todo segue vermelho por outro motivo |
| 32 | 2026-11-04 | F7 | `pnpm test:e2e` (154 casos) | 11 falhas, todas em `claude-settings-a11y.spec.ts`, `claude-settings-mcp.spec.ts`, `claude-settings-project-mcp.spec.ts`, `claude-settings-project.spec.ts` e `claude-settings.spec.ts` (plano 13) — nenhuma relação com este plano (confirmado: nenhum arquivo de autenticação está no `git status` deste plano). A tela trava em `status "Finishing sign-in…"` por 120 s, com o menu global já carregado (a sessão existe), e o backend loga `UNAUTHENTICATED: no refresh token on the request` em `/auth/refresh` no instante exato de cada timeout — reproduzido de novo, isolado (só os 5 arquivos, stack nova do zero): falha idêntica, nenhum container de Keycloak órfão, nenhuma sessão concorrente de outro processo | causa raiz achada num ciclo seguinte (ver #33): não era auth — era o mesmo tipo de laço de render da #31, só que na rota de settings do agente | corrigida na #33; não ficou bloqueada |
| 33 | 2026-11-04 | F7 | `pnpm test:e2e` (as 5 specs de `claude-settings-*`) | causa raiz: `AgentSettingsRoute.tsx` (plano 13, B-30) chama `nameAgents(useEngines().directory)` direto no corpo do render, de propósito, para não perder um render mostrando "the agent" — mas a correção da #31 fez `nameAgents()` forçar um re-render toda vez que é chamada (via o `watcher`), e esse componente também assina `useTranslation()`: render → chama `nameAgents` → força re-render → chama de novo → nunca para. O laço consome a thread JS a ponto da renovação de token real não rodar a tempo, e o "no refresh token" do backend era só o sintoma, não a causa | `nameAgents()` virou no-op quando chamada com o mesmo `directory` já guardado (comparação por referência) — mantém a correção síncrona da B-30 (a primeira chamada real ainda atualiza no mesmo render) e corta o laço (chamadas repetidas com o mesmo diretório não disparam o `watcher` de novo). Achado também: 4 testes de integração do web (`claude-shortcuts.spec.tsx` ×3, `SettingsRoute.spec.tsx` ×1) computavam o nome esperado do link (`t('settings.links.agentSettings', …)`) cedo demais, antes do diretório carregar — congelando no id cru ("claude", não "Claude"); isso nunca apareceu porque o bug antigo também travava o texto real no mesmo valor errado, para sempre — dois errados batendo. Corrigidos para reavaliar `t()` a cada `waitFor` | confirmado: as 5 specs de `claude-settings-*` + as 4 de integração web, isoladas e na suíte inteira (duas vezes), verdes; `pnpm test:e2e` (154 casos) verde; `pnpm verify` (gates 1-7) verde |
| 34 | 2026-11-04 | — | `pnpm verify:full` → gate 10 (security) | achado novo, sem relação com este plano: `pnpm audit`/`osv-scanner` reportaram 9 pacotes vulneráveis pré-existentes no repositório inteiro — `zod@4.6.5`, `body-parser@2.3.0`, `multer@2.4.0`, `undici@8.10.2`, `seroval@1.6.7`, `fast-uri@3.1.8`, `glob@10.5.0`, `minimatch@9.0.9`/`10.2.6`, `qs@6.16.0` — todos transitivos (exceto `zod`, direto). Decisão do usuário: corrigir agora, aceitando bumps menores/maiores, em vez de tratar como débito separado | ver #35 e #36 | corrigido — ver as duas entradas seguintes |
| 35 | 2026-11-04 | — | dependências — lote A (patch) | `zod` (bump direto, `^4.6.5` já permitia `4.6.7`), e `pnpm.overrides` novos para `body-parser` (≥2.4.0), `undici` (≥8.12.2), `seroval` (≥1.6.8), `fast-uri` (≥3.1.9), `qs` (≥6.16.1); o override de `multer` já existente subiu de `≥2.4.0` para `≥2.5.0` | nenhuma — todos patch, nenhum atravessa major | confirmado: `pnpm audit` caiu de 24 para 4 achados (restando só glob/minimatch); backend (498 arquivos/6922 casos, só a já catalogada S-118 flakeou sob carga) e web (384/4105) inteiros, verdes |
| 36 | 2026-11-04 | — | dependências — lote B (glob/minimatch, major) | primeira tentativa: override cego `"minimatch": ">=11.0.1"` — `pnpm lint` quebrou (`TypeError: (0, _minimatch.default) is not a function`) porque `eslint-plugin-jsx-a11y@6.10.2` (a mais nova; nenhuma versão resolve isso) declara `minimatch: ^3.1.2` por conta própria — uma versão **fora** da faixa vulnerável (`>=7.0.0 <11.0.1`) que nunca tinha aparecido no achado original. O override cego forçou essa resolução, já segura, para uma versão que o pacote não sabe usar — pedido do usuário foi investigar um plugin alternativo antes de aceitar a troca; a investigação (dist-tags do jsx-a11y, flat-config nativo, forks) não achou nenhuma alternativa madura, mas achou a causa real: 4 caminhos distintos resolviam minimatch de pacotes **diferentes** (`glob`, `@eslint/config-array`, o próprio `eslint`, `@typescript-eslint/typescript-estree`), e o `jsx-a11y` nunca precisava estar nessa lista | override trocado de cego para por-caminho: `"@eslint/config-array>minimatch"`, `"eslint>minimatch"` e `"@typescript-eslint/typescript-estree>minimatch"`, todos `>=11.0.1`; `glob` (`>=14.0.2`) já traz `minimatch ^11.0.0` dele mesmo, sem precisar de override próprio. O caminho do `jsx-a11y` nunca foi tocado — continua em `minimatch@3.1.5`, fora da faixa vulnerável, do jeito que já estava antes de qualquer mudança | `pnpm audit`: 0 achados. `pnpm lint`: verde. Prova de que o a11y lint continua funcionando de verdade (não só "não quebra mais"): um `<img>` sem `alt` plantado num arquivo descartável foi pego pelo `jsx-a11y/alt-text`, depois removido. Backend (498/6922) e web (384/4105) inteiros, de novo, verdes |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-11-05 | **A E2E voltou a ser a última fase**: a Persistência de avisos, que tinha nascido como F8 (depois da E2E, então F7), foi renumerada para **F7**, e a E2E, renumerada para **F8** | regra do [índice de planos](../README.md#as-quatro-regras-estruturais): a E2E é sempre a última fase do plano; fase nova entra antes dela, nunca depois — a Persistência de avisos nasceu durante a execução da E2E (D-15) e ficou, por engano, depois dela | arquivos das fases ([F7-notice-persistence.md](F7-notice-persistence.md) ← F8-notice-persistence.md; [F8-e2e.md](F8-e2e.md) ← F7-e2e.md), README (Fases, Entra, Árvore), decisions (cabeçalhos F7/F8, D-15), scenarios (âncora da D-15, S-123), progress (esta tabela, Tarefas, Riscos) e os comentários `plan 27, F7/F8` no código do backend, web, mobile e e2e que citam a fase. O **Histórico de validação** abaixo não foi reescrito — cada linha é datada e fala da numeração da época (a mesma prática do [plano 10](../10-mobile-chat-layout/progress.md)) |
| 2026-11-03 | D-15: a R-10 (avisos de hook somem ao reabrir pelo histórico) vira a **F8** (B-29…B-31) — o backend passa a persistir o `session.notice` por conta própria, fora do transcript do Claude, em vez de reduzir o escopo da S-104/B-26 | causa raiz medida, não é bug: o `system:informational`/`system:hook_response` do hook nunca deixa rastro no transcript (mesma medição da F5/B-17, estendida); sem fonte própria, a S-104 não pode ser provada como escrita | README (Fases, Rastreio, Árvore), F8-notice-persistence.md (novo), decisions (D-15), scenarios (S-109…S-124) |
| 2026-11-01 | Todas as 14 decisões do plano tomadas pelo usuário, de uma vez, antes da F0: D-02 mostra o evento desconhecido (05 muda na B-24); D-05 as dez sondas como escritas; D-09 fixture da recusa escrita à mão e marcada; D-04 tabela da discovery ajustada pela B-01; D-06 retirada condicional à medição da sonda 8; D-10 tabela §8.2 + portão de capacidade do 28; D-13 teto de **4 000** caracteres (acima da recomendação de 2 000); D-03 nome da variante + campo conhecido cortado; D-07 mostra **os dois** avisos (eco e `local_command_output`), contra a recomendação de um só; D-12 contador no cliente; D-08 zoom da imagem do web **entra no escopo** (reverte a exclusão de 2026-10-10 abaixo) | nenhuma fase podia começar com decisão em aberto; o usuário preferiu decidir tudo de uma vez, por pergunta interativa, em vez de uma por fase | decisions.md (D-02…D-13), README (Entra/Não entra), F6-clients.md (B-22) |
| 2026-10-10 | D-14: o plano espera também o [plano 28](../28-agent-neutral-core/README.md); a B-07 é absorvida pelo portão de neutralidade de lá e fica só com as entradas e os testes dos `kind` novos; a B-21 desenha pelo `injected.kind`; caminhos do adapter em `engines/claude/` e rotas por `engine`; a D-10 ganha a nota do critério de capacidade | as diretivas de isolamento, de regras e de canonicidade do plano 28, pedido do usuário | README, F0, F2 (B-05, B-07), F3 (B-08, B-09), F4 (B-15), F5 (B-16), F6 (B-19, B-21, B-24), decisions (D-10), scenarios (S-16, S-17, S-59, S-91, justificativas) |
| 2026-10-10 | Plano criado a partir da [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md), com as D-01…D-11 de lá e as D-12 (contador no cliente) e D-13 (teto do texto) novas | o usuário pediu o plano da discovery; a ordem 26 → 13 → 27 é a D-01 | discovery 09 (cabeçalho) e o índice das discoveries |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-10 | As features que algumas variantes sugerem (lista de slash commands, elicitação MCP, Files API, sugestões de prompt, `SessionStore`), o `tool_use_result` estruturado do MCP e, até 2026-11-01, o zoom do web (D-08) | a discovery as deixou fora ([§11](../../discovery/09-perdas-do-backend-na-conversa.md#11-fora-do-escopo)): as variantes ficam quietas com o motivo escrito. O zoom voltou ao escopo em 2026-11-01 (D-08), por decisão do usuário — ver a tabela de decisões acima | nenhum plano; voltam se a feature entrar. O zoom já voltou, para a B-22/F6 |
| 2026-11-01 | `message.retracted` (D-06) | a B-01 (sonda 8) não conseguiu confirmar nem refutar que os `retracted_message_uuids` do SDK batem com o `blockId`/`messageId` dos clientes — a recusa com modelo de reserva não se provoca de propósito. Sem confirmação, vale o ramo conservador: nenhum mapeamento de id às cegas (risco R-06) | fica para quando uma retirada real for observada (`smoke-live` da B-27, ou produção) e a D-06 puder ser revista. B-06 entra sem o evento; B-12 fica sem o campo que o dispara; B-23 fica sem a retirada (só o turno com erro) |
| 2026-11-01 | Os quatro `kind` do §8.2 que traziam conceito só do Claude — `memory.recalled`, `conversation.reset`, `hook.failed`, `extension.failed` (D-10) | nenhum tinha uma capacidade declarada em `EngineCapabilities`, e abrir uma capacidade nova é comportamento, fora do escopo "sem comportamento" da F2 | caem em `agent.info`, nunca em `unknown` — o texto e o `subject` continuam dizendo do que se trata |
| 2026-11-02 | `subject.command` do `command.output` fica sempre ausente (B-09) | nem o `system:local_command_output` nem o eco `<local-command-stdout>` carregam o nome do comando — medido nas duas fontes; não há de onde tirar o dado sem adivinhar | fica para quando o SDK passar a identificar o comando nessas mensagens; o texto do aviso continua dizendo o que o comando produziu, só não qual foi |
| 2026-11-02 | A expansão de `/comando` de projeto (`<command-name>`/`<command-args>`) não tem nenhum tratamento ao vivo na B-11 | medido (B-01/B-02): um `/comando` de projeto não produz eco nenhum ao vivo — nem `local_command_output`, nem mensagem `user` alguma; a tag só existe no histórico (`getSessionMessages`) | a leitura do histórico (F5) é quem vai precisar tratar essa tag; a B-11 fica só com o que o vivo realmente emite |
| 2026-11-02 | `resource_link` do MCP não vira anexo `kind: 'link'` — a S-55 original (B-14) | medido contra a fixture real `mcp-media-result-turn` (F0) e contra o tipo do SDK (`ToolResultBlockParam` não lista `resource`/`resource_link` entre os blocos possíveis de um `tool_result`): o CLI já achata os dois em texto antes do adapter ver a mensagem — nenhum chega como bloco estruturado | nenhum lugar: o texto achatado já basta, e a S-55 foi reescrita no `scenarios.md` para registrar a medição em vez de manter um cenário que não pode ser provado como escrito |
| 2026-11-02 | `status: 'denied'` de uma tool negada por regra não é recuperável do histórico (B-10 segue valendo só ao vivo) | medido ao vivo (F5): nenhum `system/permission_denied` deixa rastro no histórico, nem vazio — o único sinal é o próprio `tool_result` (`is_error: true` + um texto do motor dizendo "has been denied"), e a D-03 proíbe decidir por esse texto | fica para quando o SDK passar a persistir o motivo da negação no histórico; até lá, a tool negada lida de volta mostra `status: 'failed'`, igual a qualquer outra falha |
| 2026-11-02 | O `trigger` (`manual`/`auto`) de um `session.compacted` reconstruído do histórico é sempre `manual` | medido (F5): o marcador que o `compact_boundary` deixa no histórico não tem `subtype` nem `compact_metadata` — nenhum campo diz qual foi o gatilho. `manual` é o melhor esforço documentado, não uma garantia: uma compactação automática lida do histórico mostraria o gatilho errado | fica para quando o SDK persistir o `trigger` no histórico; a lacuna está registrada no `05-websocket-protocol.md` e no "como ficou" da F5-history |
| 2026-11-02 | `message.delta` de `blockType` desconhecido (U-08) não ganha linha genérica **ao vivo** — só o bloco, quando o `message.completed` fecha (U-05) | uma linha por delta de um tipo que o SDK repete em cada fragmento encheria a conversa; o bloco genérico, que já aparece uma vez por mensagem, é onde a pessoa vê o conteúdo mesmo | nenhum; comportamento deliberado, documentado na B-20/F6-clients.md |
| 2026-11-02 | S-98, S-99 e S-100 (retirada da resposta recusada) ficam ⛔ na F6, mesmo motivo da D-06/F2: o evento nunca foi emitido | consistência com a B-12/F3, que já havia excluído o campo que dispara a retirada | mesmo destino da D-06: quando uma retirada real for observada (`smoke-live`, B-27) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | A linha `unknown` vira ruído | 🔲 aberto | contador (B-20, D-12) e o `never` da B-08 |
| R-02 | Texto de hook ou de comando com conteúdo sensível no replay e no celular | 🔲 aberto | corte e nunca o JSON (B-09, B-13, D-03); revisão de segurança no fim |
| R-03 | `includeSystemMessages` deixa o histórico lento | 🔲 aberto | medido na B-01: poucos ms numa conversa de 2 turnos (1 linha extra, sem payload); não mede uma conversa longa — a B-16 (F5) pôs um teto só no **próprio** código de mapeamento (1.500 entradas sintéticas, < 2 s), não uma repetição da medição real do SDK, que segue sem cobrir uma conversa longa |
| R-04 | A forma das mensagens muda numa versão do CLI | 🔲 aberto | fixtures gravadas (B-02, 9 novas + a reaproveitada do 13) e `smoke-live` (B-27) |
| R-05 | Mudar "cliente ignora" quebra o app da loja | 🔲 aberto | a lista de calados na F1, antes da regra nova (D-02) |
| R-06 | A retirada remove a mensagem errada | 🔲 aberto | ids medidos: não provocável ao vivo (B-01, sonda 8); o `sdk.d.ts` documenta uuid por bloco, sem uma retirada real para confirmar. A `refusal-fallback-turn` (B-02, escrita à mão) dá a forma para a B-12/B-23 testarem a idempotência mesmo assim |
| R-07 | Sessões com MCP, skill, hook e comando rodam com as perdas entre o 13 e este plano | ✅ aceito | pela ordem (D-01); a D-11 já tirou da B-46 do 13 o que só este plano corrige |
| R-08 | No app (não no web), o resumo sintético da compactação aparecia como balão comum do usuário — o fantasma que a B-21 existe para evitar — ao vivo contra o stack real (`pnpm test:e2e:mobile`, B-26) | ✅ corrigido | causa raiz confirmada: `asStored()` (`backend/test/fakes/agent-sdk/scripted-query.ts`, o **fake de e2e**, não o produto) descartava toda mensagem `system` e nunca traduzia `isSynthetic`/`isReplay` (campos só do SDK ao vivo) para `isCompactSummary`/`isCompletedLocalCommand` (os nomes que o histórico usa, medidos na F5) — então uma leitura de histórico no meio de uma sessão ainda viva (o que só o app faz, via `LiveSessionController._readHistory()`/`withHistory()`; o `reloaded()` do web na B-25 é uma reconexão pelo buffer de replay, nunca uma leitura pelo transcript) nunca via o `compact_boundary` nem a marca da sintética. Corrigido nas duas partes; prova permanente em `scripted-conversations.spec.ts` (novo). Confirmado por experimento controlado: reverter a correção (`git stash`) traz o balão de volta contra o emulador real, duas vezes seguidas; com a correção, duas rodadas seguidas do emulador mostram a compactação certa, sem balão. Ver a nota "como ficou" da B-26 em [F8-e2e.md](F8-e2e.md) |
| R-09 | `/cost` (e comando local parecido) sai como `local_command_source`/`local_command_run` numa mensagem `assistant` sintética (`model: '<synthetic>'`) — uma forma que B-09/B-11 não tratam; o texto aparece, mas nunca como aviso | 🔲 aberto | medido ao rodar a B-25 contra `local-command-turn` (F0): o `<local-command-stdout>` que a B-11 trata é uma forma diferente (tag num texto de mensagem `user`), a `/compact` a usa e funciona; `/cost` usa a forma nova, não tratada. Fica para quando essa forma entrar no escopo de uma B-09/B-11 revisada |
| R-10 | No app, os dois avisos `agent.info` do `hook-message-turn` somem da conversa **ao reabrir pelo histórico** (nunca ao vivo) | ✅ corrigido | causa raiz medida, não um bug: o `system:informational`/`system:hook_response` do hook não deixa rastro nenhum no transcript do Claude, a mesma medição da F5/B-17 (`historicalSystemEvents`) estendida a esses dois subtypes — confirmado ao vivo contra o emulador real (29 eventos reconstruídos do histórico, nenhum dos dois avisos entre eles). Descartado antes disso: histórico/gap (`"gap":false` em toda a rodada), a lógica do domínio (replay isolado produz os dois `NoticeLine` certinhos) e a correção da R-08. Decisão do usuário (D-15): persistência própria em vez de reduzir o escopo — a **F7** (B-29…B-31) deu ao backend um armazém próprio para o `session.notice`, fora do transcript, mesclado na leitura do histórico. Confirmado por experimento real, não só por leitura de código: com a F7 pronta, a B-26 rodou contra o emulador de novo (o cenário isolado e a suíte inteira de 17 arquivos) e os dois avisos aparecem certos nas duas vezes, ao vivo e ao reabrir pelo histórico. Ver a nota "como ficou" da B-26 em [F8-e2e.md](F8-e2e.md) e [F7-notice-persistence.md](F7-notice-persistence.md) |

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
