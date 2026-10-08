# Plano 22 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — o plano está **concluído** em 2026-10-08: `pnpm verify:full` com os onze portões verdes (ciclo 18) e `pnpm test:e2e:mobile` 32/32; F7 (E2E) em 2026-10-08, F3…F6 em 2026-10-07, F0…F2 em 2026-10-07
**Última atualização:** 2026-10-08
**Bloqueios:** nenhum

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
| [F0](F0-norms.md) | B-01…B-05 | 5/5 | ✅ |
| [F1](F1-mapping.md) | B-06…B-13 | 8/8 | ✅ |
| [F2](F2-follower.md) | B-14…B-19 | 6/6 | ✅ |
| [F3](F3-web-follow.md) | B-20…B-23 | 4/4 | ✅ |
| [F4](F4-mobile-follow.md) | B-24…B-26 | 3/3 | ✅ |
| [F5](F5-web-fidelity.md) | B-27…B-30 | 4/4 | ✅ |
| [F6](F6-mobile-fidelity.md) | B-31…B-33 | 3/3 | ✅ |
| [F7](F7-e2e.md) | B-34…B-37 | 4/4 | ✅ |
| **Total** | **B-01…B-37** | **37/37** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 130 | 0 | 0 | 130 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 18 | 0 | 0 | 18 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-07 | F0…F2 (`verify:full`) | 1 · formatação | os dois catálogos de locale do web estavam sendo escritos pela sessão do plano 23 no meio do portão | nenhuma no código: já estavam formatados quando conferidos; reiniciado do portão 1 | ✗ |
| 2 | 2026-10-07 | F0…F2 (`verify:full`) | 2 · lint | o `pnpm test:coverage` de outra sessão plantou `e2e/specs/deliberately-broken.spec.ts` (o teste do `run-e2e-local`) e o apagou enquanto o ESLint lia | esperar a outra execução sair; reiniciado do portão 1 | ✗ |
| 3 | 2026-10-07 | F0…F2 (`verify:full`) | 2 · lint | `no-unused-vars` no teste novo dos guards (`contracts-guards.spec.mjs`), e — conferindo — `translateFailure` do app com complexidade 11 pelo `??` acrescentado | os exemplos viraram objetos tipados; o encadeamento foi para `_groupedMessage` | interrompido pela ADR-023 — o fechamento passa a ser o `pnpm verify` |
| 4 | 2026-10-07 | F0…F2 (`verify`) | 6 · unit | `.env.example`: `RC_TRANSCRIPT_FOLLOW_IDLE_MS` e `RC_TRANSCRIPT_FOLLOW_MAX` dividiam o comentário da variável de cima (`env-example.spec`) | um comentário por variável | ✗ |
| 5 | 2026-10-07 | F0…F2 (`verify`) | 2 · lint | o `test:integration` de outra sessão plantou `_arch_complexity_probe.dart` (o teste do portão de complexidade do app) no meio do lint | esperar as execuções da outra sessão saírem; reiniciado do portão 1 | ✗ |
| 6 | 2026-10-07 | F0…F2 (`verify`) | 7 · cobertura | `scripts/lib/follow-bench.mjs` com 65 % de branches: `?? 0` atrás de guardas que já excluem o `undefined` | as leituras sem o ramo morto; o arquivo foi a 100 % nas quatro dimensões | ✗ |
| 7 | 2026-10-07 | F0…F2 (`verify`) | 7 · cobertura | no backend, `rule-reach.gateway.spec` (novo, do plano 23, não versionado) falhou: uma regra de um caso anterior vaza para o seguinte, e o caso que falha muda de execução para execução. No web, três testes de renderização pesada passaram de 15 s com carga ~20; sozinhos, passam | nada no código deste plano: o vazamento é da outra sessão; os de carga, reexecutados na hora — web 2991/2991, app ≥ 90 % por arquivo, backend 4492/4492 com todo arquivo ≥ 90 % | ✗ |
| 8 | 2026-10-07 | F0…F2 (`verify`) | 7 · cobertura | o mesmo `rule-reach.gateway.spec` do plano 23, agora no caso S-65; portões 1-6 verdes | **parado e escalado**: terceiro ciclo seguido no portão 7, e a causa está fora deste plano | ⛔ |
| 9 | 2026-10-07 | F0…F2 (`verify`) | 6 · unit | o `rule-reach.gateway.spec` instável era um **bug de concorrência do plano 23** (duas respostas ao mesmo pedido gravavam cada uma a sua regra); corrigido no `ResolvePermissionUseCase`, a serialização expôs a janela da `PermissionBridge` (S-50 do `permission-bridge.spec` em timeout: o loop esperava uma resposta que já tinha passado) | a ponte escuta antes de perguntar; registrado no histórico do plano 23 (ciclo 6) | ✗ |
| 10 | 2026-10-07 | F0…F2 (`verify`) | 2 · lint | `ask` da ponte com complexidade 12 | a chamada ao use case foi para `asked()` | ✗ |
| 11 | 2026-10-07 | F0…F2 (`verify`) | — | — | — | ✅ portões 1-7 verdes; `docs:check`, `contracts:check`, `i18n:check` verdes |
| 12 | 2026-10-07 | F3…F6 (`verify`) | — | — | — | ✅ portões 1-7 verdes na primeira execução; `docs:check`, `contracts:check`, `i18n:check` verdes |
| 13 | 2026-10-08 | F7 · B-37 (`verify:full`) | 10 · segurança | portões 1-9 verdes; três avisos em dependências transitivas que o plano 23 já tinha visto: `proxy-addr` 2.0.7 (express), `source-map-js` 1.2.1 (`@vitest/coverage-v8`), `@modelcontextprotocol/sdk` 1.30.0 (par do Agent SDK) | `pnpm update` das duas primeiras dentro das faixas (2.0.8, 1.2.2; com elas subiram `rolldown`, `hono`, `postcss` e outras em patch); o par do Agent SDK declarado no `backend/package.json` como `^1.32.1` — o `override` só reescrevia a faixa do par; `scan:security` verde; reiniciado do portão 1 | ✗ |
| 14 | 2026-10-08 | F7 · B-37 (`verify:full`) | — | — | — | ✅ **portões 1-11 verdes**, `exit 0` |
| 15 | 2026-10-08 | F7 · B-37 (`test:e2e:mobile`) | e2e do app | 30 de 32: 02·S-54 tocava "Abrir a sessão" abaixo da dobra (o card cresceu com os alcances do plano 23; a página rola); 05·S-79 com o `HttpException` da renovação recusada como erro não tratado | S-54: o teste rola até o botão (`ensureVisible`) e passa | ✗ |
| 16 | 2026-10-08 | F7 · B-37 (`test:e2e:mobile permission_flow limits`) | e2e do app | 05·S-79 de novo, igual: a tela pede o login (a condição vale em ~32 s de 60), mas um erro não tratado reprova o teste. Bisseção pelo `git stash`, só a suíte `limits`: `mobile/lib` do commit → 6/6; sem as mudanças do plano 23 em `features/permission` → 6/6; **só sem as do `permission_mapper.dart` do plano 23 → 6/6**. Nada do plano 22 envolvido | **parado e escalado**: a causa é a leitura dos alcances (plano 23, B-15) no mapper, e o caminho até o erro não tratado da renovação não foi achado lendo o código | ⛔ |
| 17 | 2026-10-08 | F7 · B-37 (`test:e2e:mobile limits`, instrumentado) | e2e do app | com um `ProviderObserver` temporário: no momento da falha, `authControllerProvider` falha com o `HttpException` e o `pushControllerProvider` com "deviceControllerProvider was disposed during loading state" — o `build` antigo do `DeviceController`, substituído enquanto esperava `authControllerProvider.future`, recebe a recusa depois, sem ninguém ouvindo; o card maior do plano 23 só mudava o tempo | o `DeviceController` lê uma entrada que falhou como ninguém entrou (`null`), com teste unit; `limits` 3 de 3 verdes (antes 1 de 3); instrumentação retirada; reiniciado do portão 1 | ✗ |
| 18 | 2026-10-08 | F7 · B-37 (`verify:full` + `test:e2e:mobile`) | — | — | — | ✅ **portões 1-11 verdes**, `exit 0`; `test:e2e:mobile` 32/32, `exit 0` |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-04 | Abrir a imagem do prompt sob demanda ([D-09](decisions.md#f1--mapeamento-e-leituras)) | escolha do usuário, contra a recomendação (só o marcador) | rota nova da B-12, D-10, B-30, B-33, S-29…S-34, S-118…S-122, R-08 |
| 2026-10-04 | Pensamento resumido à vista ([D-15](decisions.md#f5--fidelidade-no-web)) | escolha do usuário; revê a D-17 do plano 08 | B-03, B-27, B-31, S-102 |
| 2026-10-04 | O e2e faz a conversa crescer pela porta do store roteirizado ([D-17](decisions.md#f7--e2e)) | o agente diverge da proposta: o backend do e2e substitui o `TRANSCRIPT_SDK`, e o SDK real já é provado na integração | B-34, S-123 |
| 2026-10-04 | `blockId` = `<uuid>:<índice>` no histórico ([D-06](decisions.md#f1--mapeamento-e-leituras)) | a proposta dizia só `uuid`, que não distingue os blocos de um prompt com imagem | B-06, S-08, S-09 |
| 2026-10-07 | F0, F1 e F2 fecham com o portão rápido (`pnpm verify` + `docs:check`, `contracts:check`, `i18n:check`); o `pnpm verify:full` e os e2e rodam uma vez, depois da F7 | decisão do usuário, que virou norma do repositório ([ADR-023](../../architecture/shared/00-decisions.md#adr-023--portão-rápido-por-fase-portão-completo-no-fim-do-plano)) e vale já para esta execução; duas tentativas de `verify:full` foram interrompidas por ela | o histórico de validação abaixo; AGENTS.md, o protocolo, a DoD, o índice de planos |
| 2026-10-07 | `blockId` = `<uuid>:<índice>` **também ao vivo** (D-06 revista) | o SDK entrega ao vivo uma mensagem `assistant` por bloco sob o mesmo `message.id`: `<messageId>:<índice>` daria `msg_…:0` ao pensamento e ao texto, e a deduplicação apagaria o texto. Medido pelo SDK nas gravações: o `uuid` ao vivo é o da entrada do transcript | B-06, B-13, S-08, S-38, R-07, o 05 |
| 2026-10-07 | O conteúdo das rotas tem cache próprio, de 2 conversas ([D-18](decisions.md#f1--mapeamento-e-leituras)) | a lista em cache guarda só os eventos, com o `summary` cortado | B-11, B-12 |
| 2026-10-07 | A rota da saída devolve também `cutAt` | sem dizer onde cortou, a tela não pode marcar o corte (S-114) | o schema `transcript-tool-result`, `backend/03` |
| 2026-10-07 | As chaves de tela entram com as telas (F3…F6) | o `i18n:check` reprova chave órfã; na F0 entraram só as que o backend emite, as renomeações do app e os pares do mapa | B-04 |
| 2026-10-07 | O frame `transcript.appended` sai do log do gateway com o `payload` de cada evento trocado pelo marcador | o gateway loga todo frame de saída; sem a regra, a conversa iria para o log (S-72) | `redact.ts`, `session-hub.ts`, `shared/03-logging` |
| 2026-10-07 | O gravador guarda o `history` de cada execução, e `--history` o acrescenta a uma gravação antiga | S-21 e o `at` precisam do transcript que o SDK relê, com os prompts e os `timestamp`, e não do stream | `record-agent-sdk-fixtures.mjs`, 5 fixtures, README |
| 2026-10-07 | Sem fixture de dois pensamentos na mesma resposta | duas tentativas de gravação deram um pensamento só; o cenário saiu do gravador e S-35 é provado nos clientes | B-05, S-07, S-35 |
| 2026-10-07 | `working` é `true` em toda última entrada que não seja a resposta só de texto (inclusive um `tool_result` ainda sem resposta) | a lista da D-12 não nomeia o `tool_result`, e depois dele o modelo ainda vai responder | B-15, S-45 |
| 2026-10-07 | A liberação de uma connection (pastas e conversas) e o envio numerado de uma assinatura ganharam uma base comum | o portão de duplicação reprovaria a cópia do `ConnectionWatchRelease` e do `SocketWatchSink` | `connection-release.ts`, `numbered-stream.ts` |
| 2026-10-07 | A duração do pensamento passa a "N min SS s" a partir de 60 s, ao vivo e no histórico | S-105 pede que o histórico mude de unidade "como o rótulo ao vivo", que nunca mudava; o formato é o do indicador de trabalho | B-27, `thinking-label.ts`; B-31 usa as mesmas chaves |
| 2026-10-07 | Ferramenta de subagente (Agent/Task) mantém o próprio rótulo mesmo com `title`; MCP com título é "servidor · ferramenta · título" | o rótulo do subagente já mostra a descrição e o tipo, que "Agent · título" perderia | B-29, `tool-labels.ts` |
| 2026-10-07 | Com `title`, o nome acessível leva também o rótulo sem título (`sessions.toolRow.labelTitled`) | a web/03 manda o comando estar no nome acessível | B-29 |
| 2026-10-07 | A saída completa é pedida para toda ferramenta terminada da cadeia principal, não só Bash; só Bash tem IN/OUT | a rota lê só a cadeia principal: nada se pede para negada, em execução, de subagente ou sem `conversationId` | B-29, S-113, S-116 |
| 2026-10-07 | Saída cortada ganha uma linha traduzida no `cutAt` | S-114 pede marcar onde cortou | B-29 |
| 2026-10-07 | Imagem: `415`, `413` e `404` mostram a mensagem sem "tentar de novo"; rede ou inesperado mostram | refazer o pedido não muda a resposta daqueles três | B-30, S-120 |
| 2026-10-07 | Sem duração (e não "0 s") quando o `at` do bloco é anterior ao da entrada anterior | o prompt enfileirado é lido depois do resultado que o precede (S-21) | B-27, S-106 |
| 2026-10-07 | O turno termina em cada mensagem do usuário e também nas linhas `turn`, `compacted` e `rewound` | depois delas o leitor mostra "Claude" de novo | B-28, D-16 |
| 2026-10-07 | Resposta sem autor mantém o botão "copiar", sozinho na linha do cabeçalho | copiar continua valendo para cada resposta | B-28 |
| 2026-10-07 | O export em Markdown pula os blocos de imagem | sem isso cada imagem sairia como pensamento vazio | B-30, `conversation-markdown.ts` |
| 2026-10-07 | Cenários comuns a web e app (S-101…S-106, S-111…S-116, S-118…S-122) ficam ⬜ até a F6 provar a metade do app | na legenda, 🟡 é "escrito, falhando", não "meio provado" | `scenarios.md` |
| 2026-10-07 | A reassinatura depois da queda do WS fica no serviço, que guarda o último `lastMessageId` entregue; o hook cuida só de aba escondida/visível | quem sabe do socket é o serviço; o hook não precisa saber | B-20, B-21, S-80 |
| 2026-10-07 | O acompanhado é marcado com o `lastMessageId` da página 1; relida com outro, o acompanhado cai e a assinatura recomeça da página nova | sem a marca, a página relida e o acompanhado somariam os mesmos blocos | B-21, B-22 |
| 2026-10-07 | `reset` relê só a página 1 (o cache é cortado nela antes de reler) | cursores antigos podem apontar para dentro da cadeia reescrita | B-21, S-78 |
| 2026-10-07 | Recusa (`LIMIT`, `LIVE_HERE`, `NOT_FOUND`) não é repetida sozinha; repete ao voltar a aba, e uma assinatura que vinga apaga a mensagem | repetir em laço contra um teto só gera carga | B-21, S-81 |
| 2026-10-07 | "Trabalhando" só aparece com a assinatura viva; socket caído ou aba escondida o apagam | sem assinatura o estado é velho | B-23, S-86 |
| 2026-10-07 | "N novas" conta mensagens da conversa principal com bloco visível, a partir da última presente quando a pessoa saiu do fim | resposta só de ferramenta não é mensagem para quem lê; página antiga carregada no meio não é nova | B-23, S-84 |
| 2026-10-07 | A pílula usa duas chaves (`newerOne`/`newer`) e não tem par no mapa com o `historyFollowNew` (plural ICU) do app | os catálogos do web não têm plural, e o check não compara texto ICU | B-23, B-04 |
| 2026-10-07 | O texto de ajuda de "trabalhando" do web é o do app, palavra por palavra — exceção à D-04 ("o texto do web vence") | F3 e F4 correram juntas e o app escreveu primeiro; o web ainda não tinha texto | `history.follow.workingHelp` ↔ `historyFollowWorkingHelp` |
| 2026-10-07 | A ajuda fica atrás de um botão de informação, fora da região `aria-live` | o texto é longo, e a região viva deve anunciar só o estado | B-23, S-86 |
| 2026-10-07 | `ChatFrame` ganhou `tail` e `useFollowTail` passou a devolver `{ following, toEnd }`; o `ws-client` passou o ack `transcript.following` aos observadores | a pílula precisa saber onde está a rolagem; sem o repasse o ack se perdia | B-23, B-20 |
| 2026-10-07 | No app, acompanhar tem data source, repositório e caso de uso próprios (`TranscriptFollowWsDataSource`, `FollowTranscript`), fora do `SessionWsDataSource` | outro tipo de atualização e outro stream | B-24 |
| 2026-10-07 | O `WsClient` do app (como o do web) passa o ack `transcript.following` aos observadores | antes, ack desse tipo era descartado | B-24 |
| 2026-10-07 | No app, buraco no `seq` e `reset` com `gone` relêem a página 1; o `gone` mostra o `NOT_FOUND` traduzido | o contrato manda reler, nunca remendar | B-25, S-92 |
| 2026-10-07 | Saiu o último ouvinte, a assinatura é solta mesmo com o board no cache de 30 s; voltar à página dentro da janela reassina | assinatura sem tela é carga sem leitor | B-25, S-95 |
| 2026-10-07 | Assinatura solta antes do ack: quando o ack chega, o controller manda `unfollow` na hora | nada fica assinado no servidor | B-25 |
| 2026-10-07 | No app, "trabalhando" é apagado na pausa, na queda do socket e na recusa; um ack novo o mantém só com `activeElsewhere` | o mesmo critério do web: sem assinatura o estado é velho | B-26, S-98 |
| 2026-10-07 | "N novas" do app passa a contar mensagens, como o web (S-84); a F4 contava entradas | S-99 pede o mesmo comportamento do web; corrigido na F6 | B-26, S-99 |
| 2026-10-07 | "Trabalhando em outro cliente…" no app é uma `MessageStrip` acima do botão de retomar, região viva, e o toque abre a ajuda | a lista rola; o estado precisa ficar à vista | B-26, S-98 |
| 2026-10-07 | Confirmar a retomada no app não solta a assinatura por si; ir para a tela da sessão solta (provider descartado) e, se a retomada for recusada, a página continua acompanhando | o ciclo de vida do provider já solta; soltar antes deixaria a página parada numa recusa | B-26, S-97 |
| 2026-10-07 | `ConfirmDialog` comum e o ajudante `_overSocket` em `session_providers.dart` | o portão de duplicação reprovaria as cópias | B-24, B-26 |
| 2026-10-07 | Bases comuns no web: `useObjectUrl` (o `blob:` da prévia do editor e da imagem do prompt), `unfoldedOf` (leitura ao desdobrar: subagente e saída completa) e `socket-subscriptions.ts` (`SubscriptionTransport`, `routeFrames`, `watchReadiness`: as pastas observadas e as conversas acompanhadas) | o portão de duplicação reprovaria as cópias da F3 e da F5 | `useRawObjectUrl`, `usePromptImage`, `useToolResult`, `useSubagentHistory`, `folder-watches.ts`, `transcript-follow.service.ts` |
| 2026-10-07 | No app, a imagem abre num `Dialog.fullscreen`, não numa rota; fechar descarta o provider e solta os bytes | imagem não precisa de deep link; descartar é o equivalente a revogar o `blob:` | B-33, S-119 |
| 2026-10-07 | No app, a saída da ferramenta tem as sequências ANSI removidas, não coloridas | o app não tem renderizador ANSI, e o código solto vira ruído | B-32, S-112 |
| 2026-10-07 | No app, o pensamento resumido fica à vista também enquanto chega; revê as expectativas da S-59 do plano 10 | a D-15 vale ao vivo e no histórico | B-31, S-102 |
| 2026-10-07 | No app, o Bash em execução mostra OUT com o progresso ao vivo quando imprime; a saída completa nunca é pedida enquanto roda | o app já mostrava o progresso; S-116 só proíbe o pedido | B-32, S-116 |
| 2026-10-07 | No app, a saída completa fica em cache 5 min depois que o card sai da tela | rolar para longe e voltar não pede de novo, como o `gcTime` do web | B-32, S-113 |
| 2026-10-07 | No app, o nome acessível do card é `sessions.toolRow.label`, sem o comando (o web leva o comando, `labelTitled`); o comando está no IN, aberto | no app o rótulo sem título é só o nome da ferramenta, e repetir não informa | B-32 — divergência aceita |
| 2026-10-07 | No app, ferramenta recusada mostra o motivo (`summary`) como saída, sem o "Recusado:" do web | é o comportamento que o app já tinha | B-32 — divergência aceita |
| 2026-10-07 | No app, o balão de prompt mostra o texto e depois os marcadores de imagem; resposta do modelo só de imagem também vira mensagem | é a ordem dos blocos do CLI na gravação | B-33, S-118, S-121 |
| 2026-10-07 | `FoldLine` comum e a falha dentro de `ToolOutputView`, no app; as unidades de byte não são traduzidas, como o `Intl` do web | o portão de duplicação reprovaria as cópias | B-31, B-32 |
| 2026-10-07 | A porta do e2e escreve com o `append` e o `rewrite` do store roteirizado (não só `add`), saiu para `backend/test/e2e/conversations-elsewhere.ts` e é montada pelo mesmo código no teste de integração (`startTestApp` ganhou `mount`) | mantêm o `lastModified` crescente que o seguidor sonda; um módulo só prova a porta que o e2e usa | B-34, S-123 |
| 2026-10-07 | Plantar ganhou `history: true` (o `history` gravado, com prompts e `timestamp`); as uuids são renumeradas por conversa | sem prompts e `at` não há rótulo de pensamento; a renumeração é a do plantio antigo | B-34 |
| 2026-10-07 | Reescrever a cadeia usa as entradas depois do `compact_boundary` do `compact-turn`; a cadeia termina numa entrada do usuário, e `working` fica `true` | é a cadeia que o SDK refaz, e a `compact-turn` não tem `history` gravado | B-34, S-126 |
| 2026-10-07 | `ScrollingPre` (`tabIndex=0`) no OUT e nos dois `<pre>` de input da ferramenta, com supressão pontual de `jsx-a11y/no-noninteractive-tabindex` justificada (como `ChatFrame`, `DiffHunks`) | o axe da S-127 reprovou `scrollable-region-focusable`: a saída de 600 linhas rolava sem alcance pelo teclado | B-29, B-35 — bug da F5 achado pelo e2e |
| 2026-10-07 | A spec S-255 do plano 08 (`claude-panel-conversation.spec.ts`) passou a esperar o rótulo com `title` e o IN | a F1/F5 mudaram o rótulo e o input do Bash; o portão 9 reprovaria | plano 08, S-255 |
| 2026-10-07 | S-127 roda o axe também no tema escuro, com o leitor crescido e com a imagem aberta | as outras specs fazem os dois temas | B-35 |
| 2026-10-08 | O app lê o `live-history.json` pelo nome (`SHARED_BY_NAME` em `scripts/mobile.mjs`), sem cópia `mobile-*` | um arquivo só para as duas pontas, como a B-34 pretendia | B-36 |
| 2026-10-08 | O app chega à porta do e2e pela origem do web (`/api/e2e/conversations-elsewhere`) | só a porta da origem do web é repassada ao emulador, e o web encaminha `/api` ao backend | B-36 |
| 2026-10-08 | Cada teste do app planta numa pasta própria (criada por `POST /files`, apagada no fim) e abre o leitor pela rota | plantar na raiz apareceria nas listas de outras suítes | B-36 |
| 2026-10-08 | O e2e do app não confere IN/OUT, saída completa, imagem nem duração do pensamento | S-128 e S-129 não pedem; o web prova a S-127, e os widgets do app provam a fidelidade (F6) | B-36 |
| 2026-10-08 | O backend declara `@modelcontextprotocol/sdk` (`^1.32.1`), par do Agent SDK que ninguém declarava | o pnpm instalava o par sozinho na 1.30.0 (GHSA-6qxp-vccf-f47h), e um `override` só mexia na faixa do par; quem consome o par é quem o declara | `backend/package.json`, portão 10 |
| 2026-10-08 | O `DeviceController` do app lê uma entrada ou renovação que falhou como ninguém entrou (`null`), em vez de deixar a falha subir | a recusa da renovação no meio de um turno escapava como erro não tratado, pelo `build` substituído (05 · S-79); a tela de entrada já diz o porquê | `device_controller.dart`, plano 05 S-79 |
| 2026-10-08 | O e2e 02·S-54 rola até "Abrir a sessão" antes de tocar | o card do plano 23 cresceu com os alcances e empurrou o botão para baixo da dobra; a página rola | `permission_flow_test.dart` |
---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| — | — | — | — |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | O SDK muda a forma de `SessionMessage` | 🔲 aberto | — |
| R-02 | Transcript muito grande torna a releitura cara | 🔲 aberto | medido na B-19 até 12,7 MB (41 ms, +30 MB); acima de 50 MB não há transcript no store desta máquina ([D-11](decisions.md#f2--seguidor-no-backend)) |
| R-03 | Compactação ou rewind reescreve a cadeia | 🔲 aberto | — |
| R-04 | `working` inferido errado | 🔲 aberto | — |
| R-05 | Assinaturas órfãs | 🔲 aberto | — |
| R-06 | Ordem "corrigida" pelos timestamps | 🔲 aberto | — |
| R-07 | `blockId` muda a deduplicação da sessão viva | 🔲 aberto | os ids passaram a coincidir (D-06 revista); a junção continua por `messageId` (S-38) |
| R-08 | Rotas de saída e de imagem expõem conteúdo | 🔲 aberto | — |
| R-09 | Plano 10 mexe nos mesmos widgets do app | 🔲 aberto | conferir antes da F6 |
| R-10 | Outras sessões na mesma árvore | 🔲 aberto | 2026-10-07: o plano 23 estava em andamento na mesma árvore, nos mesmos arquivos de contrato e i18n |

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
