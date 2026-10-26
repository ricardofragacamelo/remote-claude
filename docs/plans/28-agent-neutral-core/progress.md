# Plano 28 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano está **concluído** (F0…F7). A F7 fechou em 2026-10-17, com o `pnpm verify` verde no ciclo 37 (a F6, no ciclo 31; a F5, no 22; a F4, no 19; a F3, no 17; a F2, no 14; a F1, no 10; a F0, no 2). O plano foi fechado em 2026-10-18 com `pnpm verify` verde, mas **sem** um `pnpm verify:full` limpo — ver D-51 e o ciclo 38: cinco tentativas, cada uma falhando num portão diferente por pressão de recursos da máquina (processos órfãos, swap quase saturada), nunca por um achado da B-47. Decisão explícita do usuário; pendência de rodar o `verify:full` completo numa máquina sem essa pressão.
**Última atualização:** 2026-10-26
**Bloqueios:** nenhum. Este plano **bloqueava** o 26 (F2…F7), o 13 (F2…F4), o 27, o 14, o 15, o 16 e o 18 ([índice dos planos](../README.md#ordem-de-execução)) — todos liberados com a conclusão. Nenhuma decisão aberta: as 18 da criação foram decididas em 2026-10-10, três contra a recomendação (D-09, D-10, D-11); três achadas na execução (D-47…D-49), uma na F7 (D-50) e uma no fechamento do plano (D-51) — ver [decisions.md](decisions.md)

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
F7 ████████████████████ 100%   ✅ concluída
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-norms.md) | B-01…B-07 | 7/7 | ✅ |
| [F1](F1-engine-port.md) | B-08…B-13 | 6/6 | ✅ |
| [F2](F2-canonical-tools.md) | B-14…B-19 | 6/6 | ✅ |
| [F3](F3-interactions.md) | B-20…B-25 | 6/6 | ✅ |
| [F4](F4-modes-and-usage.md) | B-26…B-30 | 5/5 | ✅ |
| [F5](F5-permission-dialect.md) | B-31…B-35 | 5/5 | ✅ |
| [F6](F6-engine-extensions.md) | B-36…B-42, B-48 | 8/8 | ✅ |
| [F7](F7-e2e.md) | B-43…B-47 | 5/5 | ✅ |
| **Total** | **B-01…B-48** | **48/48** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 136 | 17 | 1 | 118 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 51 | 0 | 0 | 51 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-10 | F0 | 3 — tipos | os objetos de termo dos testes do portão saíam com `match: string`, e o bloco do ESLint gerado por motor (`WEB_ENGINES.map`) com a regra como `(string \| objeto)[]` | os termos dos testes passam por um `termOf` tipado como `VocabularyTerm`, e o bloco gerado é anotado como `Linter.Config` | reinício do portão 1 |
| 2 | 2026-10-10 | F0 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 885 s), com o `docs:check` e o `neutral:check` verdes; o teste de integração do S-21 (`mobile.mjs arch` com uma feature importando `engines/`) rodado à parte — **F0 concluída** |
| 3 | 2026-10-10 | F1 | 1 — formatação | dois arquivos novos da F1 fora do Prettier (o teste de tipo do S-29 e o `contracts-model.mjs` do `x-protocol-version`) | `prettier --write` nos dois | reinício do portão 1 |
| 4 | 2026-10-10 | F1 | 3 — tipos | o Prettier quebrou a linha do teste de tipo do S-29, e o `@ts-expect-error` deixou de ficar logo acima do erro que marcava | o payload errado vai para uma constante antes, e cada declaração cabe numa linha | reinício do portão 1 |
| 5 | 2026-10-10 | F1 | 5 — duplicação | 7 clones da F1: as rotas da `v1` e da `v2` do controller do histórico repetiam os parâmetros, blocos de `import` iguais em três use cases e em dois hooks do web, duas descrições iguais nos schemas `subagent-page` e `transcript-page`, e a guarda da conversa repetida na página da sessão do app | as rotas da `v1` leem um objeto de parâmetros validado (`previousToolSchema`, `previousImageSchema`), os `import` foram reordenados, as descrições dos schemas diferem, e o app ganhou o `_inConversation` | reinício do portão 1 |
| 6 | 2026-10-10 | F1 | 1 — formatação | a troca do `blockIdSchema` por `sed` veio depois do Prettier | `prettier --write`; o `format:check` passa a rodar antes de cada verify | reinício do portão 1 |
| 7 | 2026-10-10 | F1 | 6 — unit | os testes do pacote `contracts` (`test/unit/contracts-guards.spec.mjs`) ainda esperavam a `v1` (versão 1, `resumeSessionId`, `conversationId`), e o `.env.example` declarava duas variáveis sob um comentário só | os testes passam a afirmar a `v2` e a janela (o envelope aceita 1 e 2, recusa 0 e texto), e cada variável ganhou o seu comentário | reinício do portão 1 |
| 8 | 2026-10-10 | F1 | 7 — cobertura | três arquivos novos da F1 abaixo de 90%: o DTO de `GET /sessions` (o ramo da retomada), o controller do histórico (as rotas da `v1` e a listagem, que só a integração cobria) e o `agent-sdk.adapter` (o id de conversa que não é UUID) | testes unitários do DTO e do controller, e o caso do id inválido no adapter | reinício do portão 1 |
| 9 | 2026-10-10 | F1 | 7 — cobertura | `push.flow.spec.ts` · S-50 ("cancels the retry waiting when somebody answers first") falhou sob a carga da suíte; o arquivo não foi tocado pela F1 | nenhuma no código: rodado sozinho três vezes, 15/15 em cada — o mesmo padrão dos testes de push instáveis sob carga já conhecidos (S-51) | reinício do portão 1 |
| 10 | 2026-10-10 | F1 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 726 s), com o `docs:check`, o `contracts:check`, o `i18n:check` e o `neutral:check` verdes, e a integração do backend tocada pela F1 rodada à parte (a janela, as rotas, a migration 0021, `GET /engines`) — **F1 concluída** |
| 11 | 2026-10-10 | F2 | 3 — tipos | o teste novo do modo `access` do portão de neutralidade passava `vocabulary.terms[0]` (`VocabularyTerm \| undefined`) ao `hitsIn` | o termo vira uma constante tipada, usada pelo vocabulário e pelo teste | reinício do portão 1 |
| 12 | 2026-10-10 | F2 | 6 — unit | os testes dos guards do pacote `contracts` (`test/unit/contracts-guards.spec.mjs`) montavam `tool.started` e `permission.requested` com `toolName` e `input` | os payloads passam pela forma canônica (`shellCall`), e um caso afirma que a forma antiga não passa mais no guard | reinício do portão 1 |
| 13 | 2026-10-10 | F2 | 3 — tipos | o helper `shellCall` do mesmo teste sem o tipo do parâmetro | `@param {string}` no JSDoc; o `typecheck` da raiz passa a rodar antes do verify, ao lado do `format:check` | reinício do portão 1 |
| 14 | 2026-10-10 | F2 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 1123 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check` e o `neutral:check` verdes (nenhuma entrada da F2 no baseline), a suíte inteira do backend com integração (5260 testes) e a do app (2169) rodadas à parte — **F2 concluída** |
| 15 | 2026-10-10 | F3 | 6 — unit | a lista de tipos de frame do teste do pacote `contracts` não tinha o `session.compact` e o `session.tasksChanged` | os dois tipos na lista; a suíte unit da raiz (`vitest run test/unit`) passa a rodar antes do verify | reinício do portão 1 |
| 16 | 2026-10-10 | F3 | 7 — cobertura | `transcript-api.spec.ts` · S-38 comparava duas respostas inteiras, e o `writtenAgoSeconds` (lido do relógio a cada pedido) mudou de um segundo entre elas | a comparação aceita qualquer número nesse campo; o teste é da F1 e o defeito, de relógio, não da F3 | reinício do portão 1 |
| 17 | 2026-10-10 | F3 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 828 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check` e o `neutral:check` verdes (nenhuma entrada da F3 no baseline), a suíte inteira do backend com integração (5390 testes) e a do app (2189) rodadas à parte — **F3 concluída** |
| 18 | 2026-10-10 | F4 | 2 — lint | o parêntese do item de array de enum no gerador (`contracts-typescript.mjs`) subiu a complexidade do `typeExpression` para 11 | o ramo do array virou a função `arrayExpression` | reinício do portão 1 |
| 19 | 2026-10-10 | F4 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 728 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check` e o `neutral:check` verdes (nenhuma entrada da F4 no baseline; as quatro da recusa do `bypassPermissions` nos padrões foram para a F6, D-40), a suíte inteira do backend com integração (5548 testes) e a do app (2234) rodadas à parte — **F4 concluída**, com o S-90 🟡 nos clientes (adiado para o plano 27) |
| 20 | 2026-10-10 | F5 | 7 — cobertura | `push.flow.spec.ts` · S-51 falhou sob a carga da suíte; o arquivo só mudou de caminho de import na F1 | nenhuma no código: rodado sozinho três vezes, 15/15 em cada — instabilidade sob carga já conhecida | reinício do portão 1 |
| 21 | 2026-10-10 | F5 | 7 — cobertura | `session-changes.spec.ts` · S-118 falhou sob carga (load 18 na máquina, fora do verify); sozinho, falhou 1 de 3 vezes e passou as outras duas | nenhuma no código: o teste é de antes do plano 28 e está na lista dos instáveis sob carga; o ciclo seguinte esperou a carga baixar | reinício do portão 1 |
| 22 | 2026-10-10 | F5 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 726 s), com o `docs:check`, o `contracts:check`, o `i18n:check`, o `render:check`, o `neutral:check` (nenhuma entrada da F5) e o `jscpd` verdes, a suíte inteira do backend com integração (5809 testes) e a do app (2242) rodadas à parte — **F5 concluída** |
| 23 | 2026-10-15 | F6 | 1 — formatação | a F6 havia parado no meio numa sessão anterior (B-36, B-37, B-39 parciais, B-40 pronta, sem `pnpm verify` rodado); retomada: ~40 arquivos novos ou movidos (backend e web) nunca tinham passado pelo Prettier | `prettier --write .` na raiz | reinício do portão 1 |
| 24 | 2026-10-15 | F6 | 5 — duplicação | 13 clones entre o núcleo (`agent-settings`) e a extensão (`engines/claude`), nascidos do split do B-36 e dos renomes de log do B-41: imports repetidos, o `withFolder` dos dois serviços web, a navegação de seções do app e a do motor, a view da definição da coluna `engine-owner` nas duas tabelas, e o envelope do `agentSettings.defaultsChanged` repetido em `defaults.use-cases.ts` e `output-style.use-cases.ts` | extraído cada bloco para uma função ou constante só: `withFolder` foi para `shared/api`, `SectionTabs` virou um componente só em `shared/components`, `engineOwnerColumns` e `defaultsChangedEvent`/`exactOverride` para o núcleo, e dois pares de import foram reordenados onde não havia lógica nenhuma para extrair | reinício do portão 1 |
| 25 | 2026-10-15 | F6 | 7 — cobertura | 5 arquivos abaixo de 90%: `diag.controller.ts` e `legacy-defaults.use-cases.ts` (backend, sem teste dos ramos de motor ausente/sem versão), `engines/claude/register.ts` (sem teste algum do registro em si), `about.service.ts` e `ModelsSection.tsx` (web, sem o ramo de campo extra ausente e de razão/estado desconhecidos) | um `diag.controller.spec.ts` novo, um `legacy-defaults.use-cases.spec.ts` novo, um `register.spec.ts` novo para o motor, e dois casos novos em cada spec já existente dos outros dois | reinício do portão 1 |
| 26 | 2026-10-15 | F6 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura: backend 868 s dentro da rodada, web e app dentro do mesmo portão), com o `docs:check`, o `i18n:check` e o `neutral:check` rodados à parte e verdes (21 ocorrências restantes no baseline, todas exceções já conhecidas — citação de caminho de documento, `CLAUDE_CONFIG_DIR` real, o import da composição, o `.claude/md` de verdade, o atalho de nome antigo); a suíte inteira do backend com integração (5865 testes) e a do web com integração (1304 testes) rodadas à parte — **B-36…B-41 concluídas**. Faltam B-42 (documentos na forma real) e B-48 (resto do REST no pacote `contracts`) para fechar a F6 |
| 27 | 2026-10-15/16 | F6 | 5 — duplicação | a B-48 deu schema a ~39 rotas REST; 4 delas (`device`, `notification`, `permission-rule`, `open-folder-entry`) duplicavam por inteiro a forma de uma `definitions/` só porque o gerador não aceitava um schema de mensagem ser só um `$ref`, e mais 3 campos nullable duplicavam uma forma compartilhada porque `$ref` recusava qualquer `x-nullable` ao lado — 22 clones ao todo, 2 deles incidentais (imports de controller, um mapeador do web e um do backend) | o gerador (`contracts-model.mjs`) ganhou suporte a um schema de mensagem que é só `$ref` (vira um alias — `export type XPayload = Y`/`typedef XPayload = Y` —, sem interface nova) e a `x-nullable` ao lado de `$ref`; aplicado nos 4 schemas e em 3 campos, mais um `model-check-outcome.schema.json` novo em `definitions/` partilhado por duas rotas; os 2 clones incidentais foram reordenados/removida uma função identidade morta; os 9 clones genuinamente irredutíveis (mesma forma, regra diferente — `EffectiveValue` por tipo, `permissionModes`, o `reason` aberto vs. fechado) ganharam exceção nomeada no `.jscpd.json`, documentada em [09-code-quality.md](../../architecture/shared/09-code-quality.md#duplicação-que-é-permitida) | reinício do portão 1 |
| 28 | 2026-10-16 | F6 | 7 — cobertura (teste de integração do `neutral:check`) | o `model-check-outcome.schema.json` novo citava "claude" na descrição (duas vezes), fora de `engines/` — o teste de idempotência do `engine-neutrality.mjs` (rodar duas vezes, mesma saída) falhou porque a primeira rodada já saía com código 1 | descrição reescrita de forma neutra (o motor que usa o schema, não o nome dele) | reinício do portão 1 |
| 29 | 2026-10-16 | F6 | 7 — cobertura | `claude.controller.ts` em 87.5% de branches: o ramo `costUsd === null` de `toModelCheckDto` nunca era exercitado (todo teste de integração via um resultado `ok`, com custo real) | um teste unitário novo, instanciando o controller com um `CheckModelUseCase` falso que devolve `costUsd: null` | reinício do portão 1 |
| 30 | 2026-10-16 | F6 | 7 — cobertura (`docs-check.mjs`, dentro da suíte de integração de scripts) | `docs/discovery/11-postura-de-seguranca.md` (arquivo solto, não rastreado, de fora da F6) tinha um link relativo errado para `04a-claude.md` — um `../../` a mais | caminho corrigido para `../architecture/backend/04a-claude.md` | reinício do portão 1 |
| 31 | 2026-10-16 | F6 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura: backend 846 s), com `docs:check`, `contracts:check` (rota↔schema incluído) e `neutral:check` verdes — **B-42 e B-48 concluídas, F6 completa** |
| 32 | 2026-10-16 | F7 | 7 — cobertura (teste de integração do `neutral:check`), achado ao verificar a B-43 | marcar a F6 ✅ no `pnpm plan progress` fez o portão acusar 14 entradas do baseline marcadas `"phase": "F6"` que a F6 nunca removeu — citação de caminho de documento (`04a-claude.md`, a discovery do SDK, o plano 08 `claude-panel`), `CLAUDE_CONFIG_DIR` real, o import da composição (backend e web) e o atalho de nome antigo (`former-ids.ts`); nenhuma delas é removível por código, nenhuma é da B-43 | as 14 entradas foram para `"phase": "F7"` — a última fase que falta, que é quem de fato decide o destino de cada uma ao esvaziar o baseline (B-47) | reinício do portão 1 |
| 33 | 2026-10-16 | F7 | 7 — cobertura (teste de integração do `neutral:check`), achado ao verificar a B-44 | a B-44 deixou 4 violações novas: três comentários do núcleo citavam "Claude" como exemplo do que a tela nunca deveria dizer (`ChatComposer.tsx`, `useEngines.ts` ×2, `SecondarySideBar.tsx`), e o rótulo novo do seletor de motor (`"label": "Agent"`, em `en.json`) colide, letra por letra, com `Agent`, o nome de uma ferramenta nativa do Claude já no vocabulário — a mesma palavra que o produto escolheu para o `{{agent}}` neutro, por coincidência igual à do SDK | os três comentários reescritos sem citar o nome do motor; o rótulo "Agent" — a palavra certa, já estabelecida (`engine.name.fallback` é "The agent") — ficou, com uma entrada nova no baseline, fase F7 (mesma colisão de forma, sentido diferente — como `component-version`/`read-version`) | reinício do portão 1 |
| 34 | 2026-10-16 | F7 | 1 — formatação, achado ao verificar a B-45 | `draft_controller_test.dart` (teste novo da B-45) fora do `dart format`: um `test(...)` com o nome em duas strings concatenadas e o `() {` na mesma linha da segunda, quando o formatador quer cada um na sua própria linha. `node scripts/mobile.mjs format:check` reportava "1 changed" a cada rodada sem nunca escrever (é só checagem) — a sessão a princípio leu isso como um ruído cosmético do formatador (o MD5 do arquivo não mudava entre duas rodadas do *check*, porque nenhuma delas escreve), e teve que se corrigir ao ver o `pnpm verify` cair de verdade no portão 1: rodar `dart format` (sem `--output=show`) no arquivo mostrou a diferença real | `dart format` aplicado de verdade no arquivo; os 8 testes da suíte continuam passando | reinício do portão 1 |
| 35 | 2026-10-16/17 | F7 | — (B-46, regressão fora do `pnpm verify`) | `pnpm --filter backend test:unit`/`test:integration` — 318/98 arquivos, 4496/1405 testes, todos verdes, exercitando todas as fixtures de `backend/test/fakes/agent-sdk/fixtures/` (22, 24 e 26) contra o mapper de hoje. `pnpm test:e2e` (web) rodado duas vezes: 115 e 116 passados de 141, as mesmas ~25 falhas estáveis nas duas rodadas (`chat-layout`, `rule-cycle`, `structured-questions`, `trail-isolation`, `workbench*` — todas por timeout no fixture compartilhado `openedSessionOf`, com a máquina em `load average` ~7–8/12 núcleos e 4,4 GB de swap em uso por um stack de e2e de outro projeto rodando ao lado); achado consistente com a instabilidade sob carga já registrada nos ciclos 20 e 21, não uma regressão nova. `pnpm test:e2e:mobile`: 38/39 na primeira rodada — `04·S-48` quebrou com `Null check operator used on a null value`; rastreado até `mobile/integration_test/support/e2e_environment.dart`: o `BrowserSocket` (o "navegador" que os testes do app usam para abrir sessão por fora) mandava `'v': 1` fixo em cada frame, de antes da janela de protocolo da F1 — a conexão virava uma cliente de `v-1`, e o `protocol-window.ts` troca `conversation`/`engine`/`capabilities` por `claudeSessionId` para essa versão (`previousSessionConversation`), que é exatamente a tradução documentada (D-08); o teste, porém, já lia o campo novo. `pnpm test:e2e:live` (achado principal do ciclo, autorizado pelo usuário): os três specs falharam. Dois por arnês não migrado — `readsOf()` em `claude-panel.spec.ts` lê `entry.input.file_path`, que o `disclosedInput()` do B-16 trocou por `{ paths, window }` para `kind: 'file.read'`; e `commands-and-init.spec.ts` não viu nenhum `permission.requested` (e nenhum `tool.started` de `Write`/`Edit`/`MultiEdit`) durante os 26 s do turno real do `/init` — o modelo só leu arquivos e rodou shell antes de terminar com sucesso, o que pode ser variação do próprio modelo (o comentário do spec já avisa que o texto varia; desta vez a própria forma do turno variou) e não foi confirmado com uma segunda rodada paga. O terceiro, `sdk-contract.spec.ts` · S-83, achou drift real: duas mensagens `system:commands_changed` caíram no ramo de sobrevivência do mapper (`unmapped sdk message variant — dropped`) durante a sessão do `claude-panel.spec.ts` — um variant que o `sdk-message.mapper.ts` de hoje não conhece | o `BrowserSocket` corrigido: `v: 1` fixo trocado por `protocolVersion` (importado de `core/network/contracts/protocol.g.dart`, hoje `2`) nos três pontos que montavam frame (`open`, `_send`, `respond`); `dart format`/`dart analyze` limpos; `pnpm test:e2e:mobile` re-rodado, 39/39. Nenhuma mudança em código de produção — o `smoke-live` não é portão (README dele), e os três achados são para decidir, não para abafar; os dois arneses desatualizados de `e2e/smoke-live/` ficam como pendência explícita, e o `system:commands_changed` como achado novo a avaliar (talvez mapear como um evento de sessão, já que sinaliza o menu de comandos mudando — possivelmente ligado ao skill do projeto que o próprio spec cria) | S-127 ✅; B-46 fica 🔄 — S-128 não fecha enquanto o `smoke-live` não rodar limpo (ou o achado do `commands_changed` for endereçado e os dois arneses, migrados) |
| 36 | 2026-10-17 | F7 | — (B-46, regressão fora do `pnpm verify`) | continuação do ciclo 35: por decisão explícita do usuário, o `system:commands_changed` foi mapeado de verdade, não só documentado — novo evento canônico `session.commandsChanged` (`events/session-commands-changed.schema.json`, `x-type: "session.commandsChanged"`), espelhando o padrão "lista inteira, toda vez" do `session.mcpStatusChanged`; o `sdk-message.mapper.ts` ganhou o case `commands_changed`, reusando `toSlashCommand`/`menuOf`/`CLAUDE_COMMAND_MENU`; `session.commandsChanged` entrou na lista `FRAME_TYPES` de `test/unit/contracts-guards.spec.mjs` e na tabela do [05-websocket-protocol.md](../../architecture/shared/05-websocket-protocol.md); 2 testes unitários novos no mapper (lista ordenada alfabeticamente, lista vazia). O `readsOf()` de `claude-panel.spec.ts` corrigido para ler `entry.input.paths` em vez de `entry.input.file_path`. `pnpm test:e2e:live` rodado de novo (autorizado pelo usuário): os três specs verdes — `claude-panel.spec.ts` (17.8s), `commands-and-init.spec.ts` (24.8s), `sdk-contract.spec.ts` · S-83 (2.4s), `3 passed (49.3s)`, nenhum variant caindo no ramo de sobrevivência do mapper. O achado do `commands-and-init.spec.ts` no ciclo 35 se confirma como variação do próprio modelo, não regressão: desta vez o turno do `/init` fez o `Write` esperado | nenhuma correção pendente — achado endereçado de ponta a ponta | S-128 ✅ — **B-46 concluída** |
| 37 | 2026-10-17 | F7 | 1, 6, 7 (sequência) | A implementação da B-47 (ver D-50): baseline vazio, janela da v-1 fechada de ponta a ponta. A varredura achou bem mais que o enunciado citava — `GET /diag/versions`'s `agentSdk`/`claudeCli` de nível raiz, o `ClaudeLegacyController` inteiro, a rota dupla de `ClaudeController`, o `name` de `GET /sessions/:id/context` e o `taskId` de `tool.completed` — e cada achado veio com o código, o schema, a migration e os testes corrigidos juntos, nunca só documentado. Quatro reinícios por gate vermelho, cada um um achado novo, nunca o mesmo: (1) `prettier --write` em dois arquivos de teste editados à mão; (2) `test/unit/scripts/http-routes.spec.mjs` ainda esperava a rota dupla de `/claude/account`, removida da B-47 — ajustado para provar a ausência do alias em vez da sua presença; (3) uma corrida real, pré-existente e sem relação com a B-47, entre `mobile/test/unit/architecture/import_rules_test.dart` (escreve sondas `_arch_*` na árvore real) e `mobile/test/unit/app/engines_test.dart` (varre a mesma árvore) quando o `flutter test` roda os dois arquivos em paralelo — corrigido filtrando `_arch_*` da varredura do segundo, com o nome do primeiro citado no comentário; (4) `test/integration/scripts/cli.spec.mjs` ainda esperava a mensagem antiga do `engine-neutrality.mjs` ("beyond the baseline"), e `backend/test/integration/adapter/inbound/ws/session-defaults.spec.ts` — não pego pela varredura inicial por chamar `/claude/models`/`/claude/defaults` sem citar `account`/`installation`/`model-check` — ainda usava as rotas antigas, incluindo a escrita atômica de `outputStyle` junto dos padrões centrais que só a rota legada oferecia (a rota canônica sempre exigiu as duas chamadas separadas, como o próprio `useOutputStyle.ts` do web já fazia). Ruído do ambiente, limpo no caminho e não corrigido no código: dois processos de e2e órfãos de ~16h (`scripted-main.ts`, `vite preview`) de uma tentativa muito anterior desta sessão, e dois containers Docker órfãos de 44h e 2 dias (`remote-claude-spec-*`, de outra sessão) — nenhum dos dois é causa de nada que o código tivesse que corrigir | `pnpm verify` verde, portões 1–7 (cobertura em 967s, 307 arquivos ≥ 90% em todas as dimensões), `pnpm neutral:check` com `1776 files read` e zero violações, `node scripts/plan.mjs progress 28` com 48/48 tarefas | S-129 ✅, S-130 ✅ — **B-47 concluída** |
| 38 | 2026-10-18 | — (fechamento do plano, fora do `pnpm verify`) | — (ver D-51) | Cinco tentativas de `pnpm verify:full`, nenhuma limpa — cada uma falhou num portão diferente: concorrência em `concurrent-engines.spec.ts` (gate 8), ~23 timeouts de e2e web no fixture `openedSessionOf` (gate 9, padrão do ciclo 35), colisão de porta do Docker (gate 7), e, após liberar recursos da máquina por instrução do usuário (encerrado o emulador Android de 226h e 27 processos `fake-tunnel` órfãos), uma cascata nova: `ERR_PNPM_NO_SCRIPT` em `test:unit` do app, porta 5173 ocupada por um `vite preview` órfão, e a conexão do Postgres caindo durante a migração — com `load average` 7,94 e 4,1 GiB de swap em uso. Nenhuma falha tocou arquivo da B-47 nem se repetiu entre tentativas | nenhuma no código: por instrução explícita do usuário ("pode parar com execução e marcar como fechado"), a execução foi interrompida e o plano fechado com `pnpm verify` verde (ciclo 37) como suficiente, registrado em D-51 | **plano 28 fechado**, com a rodada completa de `verify:full` como pendência explícita numa máquina sem essa pressão de recursos |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-10 | As decisões D-02, D-04…D-11 e D-13…D-17 respondidas, e a D-18 nova | revisão dos gaps pelo usuário, em perguntas; três escolhas contra a recomendação: todo o REST no pacote (D-09), nenhum kind de auditoria com nome de motor (D-10), gramática canônica de regra já (D-11), com a migração de todas as regras (D-18) | nascem a B-48 (F6), os S-131…S-136 e o R-09; mudam a B-31, a B-33, a B-36, a B-01 e a B-12; os planos 13, 14, 15 e 18 ajustados na mesma data |
| 2026-10-10 | Plano criado a partir da [discovery 10](../../discovery/10-nucleo-canonico-e-agentes-isolados.md), com a ordem da D-01 e a D-12 decididas | pedido do usuário: "gerar o plano e gravar as dependências", e "alterar outros planos que não foram executados com as novas diretivas" | os planos 12, 13, 14, 15, 16, 18, 19, 26 e 27 ajustados na mesma data, cada um com a sua decisão ✅; a B-07 confere os ajustes contra as normas da F0 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-10 | No app, o "Compactar" num motor com `compaction` e **sem** `contextUse` | o botão mora na folha do medidor de contexto, que some sem `contextUse`; com o Claude, os dois existem | [plano 26](../26-mobile-conversation-parity/README.md), que redesenha a sessão do app; o web já o oferece fora do medidor |
| 2026-10-10 | S-90 nos clientes: um bloco de tipo desconhecido ainda some no web e no app | o backend o deixa passar com o nome do motor, mas o desenho genérico de bloco desconhecido não existe nas pontas; criá-lo pede chaves novas e o par do app | [plano 27](../27-conversation-losses/README.md), B-20 (U-05), que é dono dessa regra; o cenário fica 🟡 até lá |
| 2026-10-10 | O texto do motivo de um motor indisponível (`engine.error.securityUnmet`, e o `notInstalled` do `GET /engines`) | o backend já manda o motivo como `messageKey`, mas nenhuma tela desenha um motor indisponível hoje, e uma chave sem uso reprova o `i18n:check` | F7, B-45: o seletor de motor do motor de teste é a primeira tela que mostra um motor fora do ar |
| 2026-10-10 | Capacidade desconhecida (`capabilities` nulo): o web mantém o controle e deixa o servidor recusar, o app o esconde | as duas leituras cabem no "declarada, nunca suposta"; com o Claude, a sessão sempre declara | F7, B-45: o e2e do motor de teste fixa uma regra única nas duas pontas |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | A classificação canônica erra, e uma ferramenta que escreve sai como leitura | 🟡 mitigado | B-14, B-16: tabela exaustiva (um nome novo sem classificação não compila), `other` sempre `destructive`, e o risco de cada nome comparado com o de antes num teste de paridade (D-29); fica aberto até a F7 provar com o motor de teste |
| R-02 | A neutralização muda o comportamento com o Claude | 🔲 aberto | B-46 |
| R-03 | O app publicado quebra com o `v+1` | 🔲 aberto | D-08 |
| R-04 | O plano atrasa a paridade do app (26) e o 13 | ✅ aceito | D-01 |
| R-05 | O baseline vira esconderijo de violação | 🔲 aberto | B-05 |
| R-06 | A F6 conflita com outra sessão no mesmo working tree | 🔲 aberto | F6 roda sem outro plano em andamento no tree |
| R-07 | A migração da conversa perde a ligação com checkpoint ou origem | 🔲 aberto | B-11 |
| R-08 | As telas supõem a capacidade presente | 🔲 aberto | B-43…B-45 |
| R-09 | A migração das regras desliga ou muda o alcance de uma regra em uso | 🔲 aberto | D-18, B-33 |

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
