# Plano 04 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano fechou com a F5 em 2026-09-26: o ciclo pela porta do usuário (`pnpm verify:full` verde, e2e 45/45) e o `smoke-live` dos comandos reais e do `/init` (`pnpm test:e2e:live` 2/2)
**Última atualização:** 2026-09-26
**Bloqueios:** nenhum

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
| [F0](F0-transcript.md) | B-01…B-05 | 5/5 | ✅ |
| [F1](F1-transcript-ui.md) | B-06…B-09 | 4/4 | ✅ |
| [F2](F2-resume.md) | B-10…B-13 | 4/4 | ✅ |
| [F3](F3-commands.md) | B-14…B-17 | 4/4 | ✅ |
| [F4](F4-checkpoint.md) | B-18…B-21 | 4/4 | ✅ |
| [F5](F5-e2e.md) | B-22…B-25 | 4/4 | ✅ |
| **Total** | **B-01…B-25** | **25/25** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 88 | 0 | 0 | 88 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 7 | 0 | 0 | 7 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-25 | F0 | 7 — cobertura | `transcript-sdk.ts` com 0 % de funções: a ligação real com o SDK era substituída em todo teste | teste de integração que chama o **SDK real** contra um `CLAUDE_CONFIG_DIR` vazio da suíte — prova também, no SDK de verdade, o "`[]` não é inexistente" da S-56 | reinício do portão 1 |
| 2 | 2026-09-25 | F0 (commit) | hook de pre-commit — segredos | `push-credentials.spec.ts` (plano 02, ainda sem commit) usava um PEM falso como fixture; o gitleaks do hook varre o *stage*, e o `scan:secrets` do `verify:full` não o via antes do commit | fixture trocada por um marcador que não tem forma de chave; as asserções de que a mensagem nunca cita o arquivo foram mantidas, e a da chave passou a checar o próprio valor | backend 1–7 de novo, e o hook |
| 3 | 2026-09-25 | F1/F2 (web) | 7 — cobertura | `useResumeSession.ts` com 87,5 % de branches: as guardas de segundo clique e de conversa ainda desconhecida não são alcançáveis pela tela, porque o botão já está desabilitado | teste unit do hook, com as duas guardas e o frame que chega sem retomada em voo | reinício do portão 1 |
| 4 | 2026-09-25 | F1/F2 | 5 — duplicação | 13 clones (limiar 0 %): a paginação por cursor escrita duas vezes, o "carregar mais" do `AuditTrail` repetido, dois callbacks de navegação e três trechos Dart | `usePagedQuery` e `LoadMore` em `shared/`, `app/navigation.ts`; no app, `listenToUpdates` e o `HistoryBoard` sobre a `HistoryPage` | reinício do portão 1 |
| 5 | 2026-09-25 | F2 (backend) | 7 — cobertura | `session-conversation.ts` sem o ramo `null` (stream que não é conversa, o `diag.*`) | teste unit de `conversationFields` | reinício do portão 1 |
| 6 | 2026-09-25 | F1/F2 (mobile) | 2 — lint | `unnecessary_import` num teste de widget | import removido | reinício do portão 1 |
| 7 | 2026-09-25 | F1/F2 | — | `pnpm verify:full` limpo: portões 1–11 verdes | — | ✅ |
| 8 | 2026-09-26 | F3/F4 | 1 — formatação | `commands.json` regravada depois do Prettier: o gravador escrevia `JSON.stringify` cru, que expande arrays curtos | o gravador passa a formatar o que escreve (`prettier.format` com a config do repositório) | reinício do portão 1 |
| 9 | 2026-09-26 | F3/F4 | 6 — unit | `contracts-guards.spec.mjs` lista a superfície inteira do contrato e não conhecia `session.rewindFiles` e `session.rewound` | lista atualizada e asserção própria para as duas entradas (S-45) — a superfície mudou de propósito | reinício do portão 1 |
| 10 | 2026-09-26 | F3/F4 | — | `pnpm verify:full` limpo: portões 1–11 verdes | — | ✅ |
| 11 | 2026-09-26 | pendências (S-89/S-90) | 9 — e2e | o S-80 do plano 01 estourou a memória do worker: com a checagem de comando o prompt era entregue ao CLI **antes** do ack, os eventos do turno ultrapassavam o `command.accepted`, e o helper, que lia o `seq` do **último** frame, via zero e mandava lotes sem fim. Os portões 1–8 não pegaram: nenhum teste afirmava a ordem ack → eventos para `session.prompt` | o prompt é checado antes do ack e entregue **depois** dele (`AfterAck` no `ContractCommandHandler`); teste de integração da ordem numa rajada; o helper lê o **maior** `seq`, como sua documentação dizia | reinício do portão 1 |
| 12 | 2026-09-26 | pendências (S-89/S-90) | — | `pnpm verify:full` limpo: portões 1–11 verdes (e2e 38/38) | — | ✅ |
| 13 | 2026-09-26 | F5 | 5 — duplicação | dois clones: o `timeline` do S-48 copiado do `mobile-approval.spec.ts`, e o bloco de imports das duas specs novas de comandos | `timelineOf` em `fixtures/live-session.ts`, usado pelas duas; a spec do `smoke-live` tipa o socket como a irmã `sdk-contract.spec.ts` já tipava | reinício do portão 1 |
| 14 | 2026-09-26 | F5 | 7 — cobertura | `import_rules_test.dart` (o que roda o analyzer) estourou 3 min no meio da cobertura do app; sozinho passou em 8 s. Máquina carregada, com um daemon do Gradle de 4 h do `test:native` de pé | nenhuma no código: daemon parado (`gradlew --stop`) | reinício do portão 1 |
| 15 | 2026-09-26 | F5 | — | `pnpm verify:full` limpo: portões 1–11 verdes (e2e 45/45, os sete novos incluídos) | — | ✅ |
| 16 | 2026-09-26 | F5 (critério) | `pnpm test:e2e:live` | as duas specs reais responderam "Not logged in · Please run /login" com custo zero. O `.env` declara `CLAUDE_CONFIG_DIR=` vazio (como o `.env.example` manda, "para usar o padrão"), o `loadDotEnv` o carrega como string vazia, e o CLI filho a toma por diretório — sem login nele. O backend já lia vazio como ausente, então as duas metades discordavam também sobre qual `.claude.json` recebia a limpeza da marca de confiança. Regressão desde o plano 01, que o smoke-live não rodava desde então | `forgetEmptyClaudeConfigDir` no `bootstrap.ts`, chamado por `loadDotEnv` em toda entrada (arquivo carregado ou exportado pelo `pnpm dev`), com teste unit | `pnpm test:e2e:live` 2/2; reinício do portão 1 |
| 17 | 2026-09-26 | F5 (app, fora dos portões) | `pnpm test:e2e:mobile` | o S-48 achou duas vezes a resposta "pong" na tela de histórico: a tela da sessão que se deixava ainda estava na árvore durante a transição, com a mesma resposta — 8/9 | a asserção passou a procurar **dentro** da `ConversationHistoryPage`; a resposta está lá uma vez só | `pnpm test:e2e:mobile` 9/9 (API 35) |
| 18 | 2026-09-26 | F5 | 2 — lint | o VS Code caiu no meio do `pnpm verify:full` final, durante a cobertura, e o `gates.spec.mjs` não chegou a apagar o arquivo que planta para provar que o portão de arquitetura do app morde (`_arch_gate_probe.dart`, um import de `dio` no `domain/`); o analyzer o achou | nenhuma no código: o arquivo temporário do teste foi removido | reinício do portão 1 |
| 19 | 2026-09-26 | F5 | 7 — cobertura | S-58 do plano 00 (`run-e2e-local` não deixa nada para trás) achou a pilha e2e `remote-claude-e2e-34327`, órfã da mesma queda — o teste prova a limpeza de uma execução, não de todas as anteriores | nenhuma no código: contêineres, volumes e rede da pilha órfã removidos | reinício do portão 1 |
| 20 | 2026-09-26 | F5 | — | `pnpm verify:full` limpo: portões 1–11 verdes (e2e 45/45) | — | ✅ |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-25 | O id da conversa no store do Claude é **cunhado por nós** (UUID) e passado ao SDK como `sessionId`; a procedência (`session_origins`) é gravada **antes** do `query()` | gravar depois — lendo o `system:init` — deixa uma janela em que um transcript nosso está no disco e lê como de outra pessoa; e o D-04 fez da origem invariante de correção | B-02, `session` (plano 01), [backend/05](../../architecture/backend/05-persistence.md), migration `0011` |
| 2026-09-25 | Falha ao gravar a procedência **não abre a sessão** | conversa nossa sem registro seria `external` para sempre: visível a quem mais alcança a raiz, e retomável como de outro | B-02, S-71 |
| 2026-09-25 | Cache (16 conversas), concorrência (2 leituras) e prazo (10 s) são **constantes** em `transcript-reads.ts`, não configuração | nada neles depende da máquina ainda; o D-02 pedia teto e limite, não um botão | B-04, S-70, S-74 |
| 2026-09-25 | Prazo estourado é `CLAUDE_TIMEOUT` (504), distinto de `CLAUDE_UNAVAILABLE` (502) | toda chamada externa tem prazo ([04-errors](../../architecture/shared/04-errors-and-http.md)), e "não respondeu" é alarme diferente de "respondeu com falha" | B-05, S-68 |
| 2026-09-25 | Cursor das mensagens é o **id da mensagem**; cursor cuja mensagem sumiu (compactação) é `400` com `transcript.error.cursorStale` | posição crua apontaria, depois da compactação, para a mensagem errada em silêncio; e sessão viva só acrescenta no fim | B-04, S-69 |
| 2026-09-25 | A listagem pagina com o mesmo 25/100 das mensagens, keyset `(lastModified, sessionId)` descendente | o D-03 exige paginação própria (154 sessões num workspace) e não fixou números; o keyset é o do D-02 | B-04, S-57 |
| 2026-09-25 | `GET /transcripts?workspacePath=` lista **um** diretório exatamente; conversa aberta em subdiretório de uma raiz aparece no `workspacePath` do subdiretório | `listSessions({ dir })` não desce a subdiretórios, e `listSessions({})` está proibido pelo D-01 — é o custo da cerca, dito em [backend/03](../../architecture/backend/03-modules.md#transcript) | B-02, F1 (B-06) |
| 2026-09-25 | "Parser próprio de JSONL" é verificado por duas regras de `dependency-cruiser`: `transcript-reads-through-the-sdk` (sem `fs`/`readline` na fatia) e `no-line-reader` (sem `readline` no backend) | é o que a S-09 exige de `lint:arch`; regra sobre import é verificável, "não escreva parser" não é | B-01, S-09 |
| 2026-09-25 | O contrato ganhou o id da **conversa**: `session.started` leva `claudeSessionId` (obrigatório) e `resumedFrom?`; `session.attached` leva os dois, opcionais | o `sessionId` vivo não é o id do transcript — e a recarga do `gap` precisa saber de onde recarregar justo quando o buffer já perdeu o `session.started` | B-07, B-11, [05-websocket](../../architecture/shared/05-websocket-protocol.md#dois-ids-a-sessão-viva-e-a-conversa), backend, web e app |
| 2026-09-25 | Retomar o que já está vivo para o chamador responde **`session.attached`** (ack de `session.start`, `replayed: 0`), sem segundo `query()`; duas retomadas simultâneas da mesma conversa são uma | "retomar sessão viva é attach" (S-24) precisava de uma resposta no fio que o cliente reconheça; um segundo `session.started` seria um segundo começo no buffer de uma sessão que começou uma vez | B-13, S-24, S-25, [05-websocket §Retomada](../../architecture/shared/05-websocket-protocol.md#retomada) |
| 2026-09-25 | "Viva" vale pelo id da conversa **e** pelo que ela continua, e só para o mesmo usuário | retomar a conversa do editor duas vezes é o mesmo pedido — um segundo fork seria um segundo escritor da mesma continuação; a continuação de outra pessoa é dela, e o chamador ganha o próprio fork | B-13, S-75 |
| 2026-09-25 | A conversa é procurada **dentro** do `workspacePath` do comando: `cwd` diferente, ausente, ou conversa aberta aqui por outra pessoa → `SESSION_NOT_FOUND` | o SDK acha o arquivo pelo `cwd`, e a allowlist é perguntada sobre o caminho que vai rodar; "não existe" e "não é sua" são a mesma resposta, como no F0 | B-10, B-13, S-77 |
| 2026-09-25 | O fork recebe um id **cunhado por nós** (`resume` + `forkSession` + `sessionId`), com a procedência gravada antes do subprocesso | é a mesma invariante da sessão nova (F0): conversa nossa sem registro leria como de outro | B-12, S-58 |
| 2026-09-25 | Retomar entra em `audit_events` como `session.resumed` / `session.forked` (migration `0012`), sujeito = conversa continuada, rótulo = workspace; trilha indisponível **não retoma** | é fato de conta do mesmo peso de aprovar; o resumo é o primeiro prompt e não pode ir ao banco (S-28) | B-10, S-27, S-76, [backend/05](../../architecture/backend/05-persistence.md) |
| 2026-09-25 | `SessionOriginModule` (Nest) com o repositório de procedência; `TranscriptModule` exporta só `TRANSCRIPT_STORE` | o `session` passa a perguntar ao `transcript` onde a conversa rodou; com o repositório dentro do `session`, os dois módulos se importariam | B-10, [backend/03](../../architecture/backend/03-modules.md#transcript) |
| 2026-09-25 | S-28 é a regra `transcript-is-never-persisted` do `dependency-cruiser`: persistência não alcança casos de uso/store do `transcript`, adapters sobre o SDK nem o tipo da mensagem | regra sobre import é verificável; nomear a conversa pelo id continua permitido | B-11, S-28 |
| 2026-09-25 | Web: a recarga do `gap` e o histórico de uma sessão retomada carregam **a última página** (25), sempre da rede, **por baixo** do stream (`withHistory`); a conversa inteira fica em `/history/:conversationId`, via TanStack Query com cache | recarga responde a estado não confiável, então não usa cache; a tela de histórico é dado do servidor e usa (S-16) | B-07, S-14…S-16, [web/04](../../architecture/web/04-state-and-data.md) |
| 2026-09-25 | Web: `wsClient.issue()` devolve o id do comando, e `error` e `session.attached` sem assinante vão aos observadores | a retomada precisa reconhecer a recusa **dela** (por `correlationId`) e o attach de uma sessão que ninguém observa ainda | B-13 |
| 2026-09-25 | Web: rotas `/history?workspacePath=` e `/history/$conversationId`; o primeiro nível do D-03 é a allowlist da tela inicial, com um botão "Histórico" por workspace | o workspace na URL faz da lista um link; reaproveitar a lista de workspaces mantém a cerca visível | B-06 |
| 2026-09-25 | `session.error.limitReached` entrou no catálogo web (faltava desde o plano 01) | a recusa de retomada acima do limite precisa ser traduzida (S-26); o teste que a mostrou passava em falso porque as duas pontas renderizavam a chave crua | B-13 |
| 2026-09-26 | O menu é **HTTP** (`GET /sessions/:sessionId/commands`), não o comando WS `session.listCommands` que a árvore do plano previa | é pergunta com resposta, como o estado de um pedido de permissão (02 · D-22); ninguém mais que observa a sessão precisa ouvi-la, e um ack com dados seria request/response no socket | B-14, [05-websocket §Slash commands](../../architecture/shared/05-websocket-protocol.md#slash-commands), [backend/03](../../architecture/backend/03-modules.md#session) |
| 2026-09-26 | Filtro de internos/mortos e o grupo de sugeridos vivem **no backend** (`menuOf`), e o menu chega pronto | uma regra escrita em TS e em Dart é uma regra que vale numa delas; o ranking é de nomes (`init`, `code-review`, `security-review`, `compact`, `context`, `usage`) — nome ausente não aparece | B-15, D-05 |
| 2026-09-26 | `workflow-launch-exec` **fica** no menu | remedido: não tem prefixo `__` nem outro metadado de interno — a nota do D-05 estava errada, e filtrar por nome seria a lista fixa de volta | B-15, S-60, [descoberta §9.6](../../discovery/01-descoberta-claude-agent-sdk.md#96--supportedcommands-traz-comando-morto-e-interno) |
| 2026-09-26 | O cache é chaveado por **versão do CLI e workspace**; a versão vem do `manifest.json` do SDK até o `system:init` dizer a dele | medido: o `system:init` só chega com o primeiro prompt, e o menu é aberto antes; o `.claude/` do projeto muda a lista | B-17, S-35, S-81, [backend/04](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) |
| 2026-09-26 | Prompt `/nome` cujo `nome` a instalação não tem (nem alias, contando os escondidos) é `INVALID_INPUT` (`session.error.unknownCommand`); lista indisponível não recusa nada; os prompts de uma sessão chegam à fila em ordem | é a S-34; e esperar a lista não pode deixar um prompt comum passar à frente do comando enviado antes | B-15, S-34, S-31, S-82 |
| 2026-09-26 | A prévia do desfazer é **HTTP** (`GET /sessions/:sessionId/checkpoints`); o desfazer é o comando WS `session.rewindFiles`, com o evento `session.rewound` | a prévia é pergunta; o desfazer muda o disco de todos que observam | B-18, B-19 |
| 2026-09-26 | O ponto de desfazer é **um momento**: voltar para antes do turno `T` alcança o que `T` **ou um posterior** tocou, cada caminho no snapshot mais antigo do intervalo | "para cada caminho que aquele turno tocou" deixaria para trás o que um turno posterior escreveu — os arquivos não voltariam ao ponto escolhido (S-37) | B-18, S-85, [backend/04](../../architecture/backend/04-claude-integration.md#desfazer-arquivos--o-store-é-nosso) |
| 2026-09-26 | O alcance do desfazer é a sessão viva **mais a conversa** que ela é: `claude_session_id` nas duas tabelas do journal (migration `0013`) | é a metade da S-59 que a F2 adiou para cá; um fork é conversa nova e não alcança a origem | B-21, S-59, S-86, [backend/05](../../architecture/backend/05-persistence.md) |
| 2026-09-26 | O desfazer grava **como deixou** cada caminho (linha de base), com `hash` `NULL` para arquivo que ele apagou | sem isso, um segundo desfazer para ponto anterior leria o arquivo restaurado como edição de outra pessoa, e o preservaria | B-21, S-41 |
| 2026-09-26 | `session.filesRewound` entra em `audit_events` **antes** de tocar o disco, com o plano em `details` (jsonb, migration `0013`); trilha indisponível não desfaz | alteração em disco sem rastro é o que a trilha existe para impedir; o resultado final (inclusive falhas) vai no evento e no log | B-20, S-42, S-87 |
| 2026-09-26 | Falha parcial: `session.rewound` com o caminho em `failed`, seguido de `error` `INTERNAL_ERROR` (`session.error.rewindIncomplete`) para todos que observam | o evento diz o que aconteceu; o erro diz que não é o que foi pedido — o mesmo par que um crash tem (`CLAUDE_UNAVAILABLE` + `session.closed`) | B-21, S-44, S-62 |
| 2026-09-26 | `SESSION_LOCKED` fora de `idle` **e** com outro desfazer da mesma sessão em curso | o segundo planejaria contra um disco que o primeiro está reescrevendo | B-21, S-43, S-83 |
| 2026-09-26 | A purga do store de snapshots é um job interno (`SnapshotPurgeJob`), a cada 10 min, com constantes e não configuração | o teto e a purga existiam desde o plano 01 sem nada que os rodasse; o teto já é configurado, a cadência não depende da máquina | B-21, S-67 |
| 2026-09-26 | O fake do SDK cunha um `prompt_id` **por turno** e pode executar os `Write` gravados (`performWritesIn`) | o real cunha um por prompt; a constante fazia todo turno ser o mesmo ponto, e sem escrita real o desfazer não teria o que restaurar | B-18…B-21 |
| 2026-09-26 | Fixtures novas do SDK real: `commands` (sem prompt, sem cota) e `init-turn` (o `/init` de verdade) | a regra do D-04 do plano 01: o fake replica gravação, nunca memória | B-14, B-16 |
| 2026-09-26 | S-89/S-90 do plano 01 reescritos como testáveis, e dois defeitos corrigidos: o fake consulta o `canUseTool` pela **gravação** (tool e input do `tool_use`), não pelo nome da tool; e o gravador normaliza também o slug do workspace e o home da máquina (`pnpm fixtures:record --normalise` reaplica às fixtures commitadas, sem SDK) | a dívida era deste plano, que voltou a mexer em fixture; o replay do `/init` fazia 4 perguntas onde o CLI real fez 2, e as gravações carregavam `/home/<usuário>` | S-89, S-90 do [plano 01](../01-live-session/scenarios.md), fake e gravador |
| 2026-09-26 | O backend roteirizado é **um** Claude: o replay grava no store de conversas o que reproduz — o prompt e cada mensagem, sob a conversa que as opções nomeiam (nova, `resume` in-place, fork) — e escreve os `Write` da gravação no `cwd` da sessão (`performWritesIn: 'cwd'`) | o store do e2e era vazio: não havia o que listar, recarregar depois do `gap` nem continuar; e sem escrita o desfazer não teria o que devolver. O conteúdo continua vindo da gravação (regra do D-04 do plano 01) | B-22…B-24, `scripted-query.ts`, `scripted-transcripts.ts`, `scripted-main.ts`, [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) |
| 2026-09-26 | Com store, o replay cunha **ids próprios a cada turno** — uuid (no formato uuid, porque o cursor do histórico é ele), id da mensagem da API e `tool_use_id` —, iguais no stream e no transcript; sem store, o primeiro turno continua a gravação byte a byte | o CLI nunca escreve o mesmo id duas vezes numa conversa; repetir os da gravação fundia os turnos de uma conversa continuada numa só mensagem na tela, e ids diferentes entre stream e transcript quebrariam a dedupe da recarga (S-15) | B-23, `scripted-conversations.spec.ts` |
| 2026-09-26 | Os clientes passam a mandar `resumeFromSeq: 0` no primeiro `session.attach`; o backend **mantém** "campo ausente = não reenviar nada" | escrever o S-48 mostrou que web e app abriam uma sessão já em andamento sem replay nenhum — o backend lê o ausente como "observar daqui em diante" (regra fixada no próprio teste do `EventBuffer`), e os clientes o omitiam. O contrato já dizia "o maior `seq` que o cliente tem"; zero é esse número. Fecha o item adiado da F2 (histórico de retomada juntada depois que o buffer perdeu o `session.started`) | S-88, B-22, B-23, web `ws-client.ts`, app `ws_client.dart`, [05-websocket §Reconexão](../../architecture/shared/05-websocket-protocol.md#reconexão-e-replay), descrição de `session-attach.schema.json` |
| 2026-09-26 | S-53 prova os dois sentidos de "workspace removido": a pasta **apagada** (`WORKSPACE_NOT_FOUND`) e a pasta que voltou como **link para fora** da raiz (`WORKSPACE_NOT_ALLOWED`) | a allowlist só muda com recarga explícita, e nenhuma porta do produto a encolhe; o que alguém pode fazer com a tela aberta é apagar ou mover a pasta. As duas recusas chegam traduzidas, e nada é aberto | S-53 |
| 2026-09-26 | O `gap` pela porta do usuário passa o socket da página pelo teste (`page.routeWebSocket`): derruba, recusa reconexões enquanto o buffer recicla, deixa voltar, e lê o `session.attached` que a página recebeu | a emulação de rede do Playwright não fecha um WebSocket já aberto; e sem ler o ack, "recarregou" poderia ser qualquer outra requisição | S-47, `SwitchableSocket` |
| 2026-09-26 | O `/init` **pelo menu** (S-49) roda na suíte roteirizada, com a gravação real do `/init` pedida como argumento do comando; o `/init` real é o `smoke-live` (S-52) | o menu é tela, e tela não precisa do modelo; o que só o CLI real pode dizer — a lista da instalação e o `/init` terminando — fica onde o CLI real está | B-24, B-25 |
| 2026-09-26 | Os testes da F5 trabalham numa pasta própria dentro da raiz da allowlist (`scratchFolders`), apagada ao fim; o `smoke-live` cria a sua com `git init` na hora | eles escrevem em disco, e dois testes escrevendo `summary.md` na mesma raiz se testariam um ao outro; a raiz é lida da API e só a subpasta é criada — o backend aceita qualquer diretório dentro de uma raiz | B-22…B-25, [D-07](decisions.md#d-07--onde-o-init-pode-escrever) |
| 2026-09-26 | No `smoke-live`, das perguntas do `/init` real só a escrita dentro da fixture é permitida; o resto é recusado | é o que uma pessoa cuidadosa faria, e mantém o comando do modelo real longe de qualquer coisa fora da pasta descartável | B-25 |
| 2026-09-26 | `CLAUDE_CONFIG_DIR` vazio é **removido** do ambiente na partida do backend, antes de qualquer subprocesso | o CLI toma a string vazia por diretório e responde "Not logged in" como um turno comum; o `.env.example` promete que vazio é o padrão, e agora é, nas duas metades | ciclo 16, `backend/src/bootstrap.ts` |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-25 | E2E **autenticado** das rotas de histórico — a F0 leva ao e2e só as recusas `401` das duas rotas (S-19) e o backend roteirizado passa a trocar também o store de transcripts | o cenário e2e é compartilhado com o app Flutter e tem fase própria; e a F0 não tem tela para a porta do usuário | [F5](F5-e2e.md) — B-22, B-23 · **entregue na F5**: o histórico é lido autenticado pela tela (S-46, S-53) e pelo app pelo contrato (S-48) |
| 2026-09-25 | Chaves `transcript.error.*` no app Flutter (entraram só no web) | o catálogo do app reprova chave sem uso em Dart, e a tela que as usa é da F1 | [F1](F1-transcript-ui.md) — B-08, B-09 |
| 2026-09-25 | Alcançar, pela **conversa**, os checkpoints do nosso store que sessões vivas anteriores gravaram (a outra metade da S-59) | o store é chaveado pela sessão viva (`session_id`), e a retomada in-place abre uma sessão viva nova; o que a F2 garante é o mesmo id de conversa e o mesmo arquivo — o que preserva o histórico de undo do próprio SDK | [F4](F4-checkpoint.md) — B-18, B-21 |
| 2026-09-25 | E2E do histórico e da retomada pela porta do usuário | o plano já os põe na F5, com o cenário compartilhado com o app | [F5](F5-e2e.md) — B-22, B-23 · **entregue na F5**: S-46, S-47, S-48, S-53 |
| 2026-09-25 | "Carregar anteriores" **na tela da sessão viva** | a tela viva mostra a última página do histórico e leva à conversa inteira (`/history/:id`), onde a paginação existe; duas paginações da mesma conversa seriam dois estados para divergir | — (decisão de UI; a tela de histórico cobre) |
| 2026-09-25 | Carregar o histórico quando uma sessão retomada é **juntada** depois que o buffer perdeu o `session.started` e o `attach` não relata `gap` | o `session.attached` já leva `resumedFrom`, mas os clientes só carregam o histórico pelo `session.started` ou pelo `gap`; o caso exige buffer reciclado (1000 eventos) numa sessão viva | [F5](F5-e2e.md) — B-23, ao provar a retomada pela porta do usuário · **entregue na F5**: o primeiro `attach` pede `resumeFromSeq: 0`, e um buffer que perdeu o começo responde `gap` com a conversa a recarregar (S-88) |
| 2026-09-25 | Prazo no cliente para uma retomada sem resposta | o backend responde sempre (evento, ack ou `error`); sem socket, o comando nem sai e a tela diz | [plano 05](../05-hardening-operations/README.md) |
| 2026-09-26 | Prompt que chega **durante** um desfazer | a trava recusa desfazer durante turno, mas um prompt enviado no meio de um desfazer entra na fila e o turno pode ler um arquivo a meio da lista (cada arquivo em si é atômico); o desfazer leva milissegundos | [plano 05](../05-hardening-operations/README.md) |
| 2026-09-26 | Desfazer em workspace cujo caminho passa por symlink | o `NodeUndoDisk` exige que o diretório resolva para si mesmo, então um caminho gravado através de link é sempre `unsafePath` (conservador, e dito na UI) | — (decisão de segurança; revisitar se aparecer caso real) |
| 2026-09-26 | Timeout real (10 s) de `supportedCommands()` em integração | o prazo é provado em unit com o scheduler manual; em integração custaria 10 s por execução para provar o mesmo | — (unit cobre: S-31) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | O formato do JSONL é interno do Claude e muda sem aviso | 🔄 vigiado | só funções do SDK (B-01); o `smoke-live` agora cobre os comandos reais e o `/init` (S-52), e na primeira execução já pegou uma regressão de ambiente — o `CLAUDE_CONFIG_DIR` vazio. Continua aberto: é risco de fornecedor, e o `smoke-live` só roda sob demanda |
| R-02 | Sessão criada fora aparecendo pode confundir | 🔲 aberto | feature declarada, restrita à allowlist (D-01); origem vem do nosso banco — o SDK não a informa (S-11) |
| R-03 | O desfazer mexe no disco do usuário | ✅ mitigado em 2026-09-26 | spike confirmou que o `rewindFiles()` sobrescreve em silêncio, que o `dryRun` não avisa e que não há filtro por arquivo; por isso o mecanismo é nosso (D-06). A F4 entregou: arquivo alterado fora preservado (S-63), nunca através de link (S-65), restauração atômica (S-66), trilha antes do disco (S-42, S-87) e recusa durante turno (S-43) — provados contra filesystem e Postgres reais. Resta o prompt que chega **durante** um desfazer, movido para o plano 05 |
| R-04 | Transcript longo estoura memória a cada leitura | 🔄 medido | `limit`/`offset` não reduzem o trabalho do SDK (~30 MB por chamada); mitigação é cache por `lastModified` e limite de leituras concorrentes (D-02) |
| R-05 | Retomar sessão viva abriria um segundo subprocesso | ✅ mitigado em 2026-09-25 | retomada de sessão viva é `attach` (S-24), e duas retomadas simultâneas são uma `query()` só (S-25) — F2 |

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
