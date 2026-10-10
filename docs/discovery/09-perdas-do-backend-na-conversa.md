# Proposta: O que o backend perde da conversa, e a mensagem desconhecida na tela

**Estado:** virou o [plano 27 — Perdas da conversa](../plans/27-conversation-losses/README.md) em
2026-10-10. Nenhum código escrito. Daqui em diante vale o plano; as decisões abertas estão no
[decisions.md](../plans/27-conversation-losses/decisions.md) dele, com os mesmos IDs.
**Criada em:** 2026-10-09. O usuário pediu: "criar uma discovery sobre as perdas do backend que
estão no 26 F6, ver as perdas e tem que ter a mesma implementação no mobile". Durante o levantamento,
acrescentou duas coisas. A primeira: "mensagens que são desconhecidas, tem que de alguma forma
aparecer no chat mobile e web, tem que ter uma saída, não só log". A segunda: "o plano 26 vai fazer a
paridade do que se tem até hoje, esse plano vai complementar o que falta nos dois [...] o discovery vai
levantar para depois criar o plano".
**Destino:** insumo de um **plano novo**. A ordem, decidida pelo usuário em 2026-10-09, é
[plano 26 — Paridade da conversa no app](../plans/26-mobile-conversation-parity/README.md) →
[plano 13 — Configuração do Claude](../plans/13-claude-settings/README.md) → o plano desta discovery. Qualquer plano gerado a partir dela depende do 26 **e** do 13
concluídos. O plano 26
iguala o app ao web **no que o web já mostra**. Este levantamento cobre o que **nenhuma das duas pontas**
mostra, porque o backend descarta antes do WS. Esta proposta **não** é um plano: não tem tarefas com ID
nem critério de conclusão por comando.
**Relação com outros documentos:**

- Aprofunda o [§7 da discovery 08](08-paridade-da-conversa-no-app.md#7-perdas-das-duas-pontas-backend)
  e a antiga F6 do plano 26 ("Perdas do backend", tasks B-22…B-26 e B-30). Essa fase **saiu do plano
  26** em 2026-10-09, mandada para esta discovery
  ([26 · Não entra](../plans/26-mobile-conversation-parity/README.md#não-entra)), e as D-04, D-05 e D-06
  de lá passam a valer aqui. A medição mostrou que a fase partia de três premissas erradas (§2).
- Segue a [discovery 03 — Múltiplos motores de agente](03-multiplos-motores-de-agente.md): todo
  evento e campo novo daqui é **canônico**, sem vocabulário do Claude, para servir a outro motor
  depois (§8.1, pedido do usuário).
- Esbarra numa regra do contrato: "cliente ignora o que não conhece"
  ([05-websocket-protocol §Versionamento](../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)),
  repetida no cenário S-80 do plano 26. O pedido R3 pede o contrário para a conversa. O conflito fica
  registrado, sem escolha (D-02).

---

## Sumário

1. [O pedido](#1-o-pedido)
2. [A resposta curta](#2-a-resposta-curta)
3. [Princípios](#3-princípios)
4. [Inventário: as 39 variantes do `SDKMessage`](#4-inventário-as-39-variantes-do-sdkmessage)
5. [Perdas dentro da mensagem de usuário](#5-perdas-dentro-da-mensagem-de-usuário)
6. [Perdas do histórico](#6-perdas-do-histórico)
7. [A mensagem desconhecida (R3)](#7-a-mensagem-desconhecida-r3)
8. [Contrato](#8-contrato)
9. [A mesma implementação no web e no app](#9-a-mesma-implementação-no-web-e-no-app)
10. [Testes e fixtures](#10-testes-e-fixtures)
11. [Fora do escopo](#11-fora-do-escopo)
12. [Decisões em aberto](#12-decisões-em-aberto)
13. [Riscos](#13-riscos)
14. [Matriz de cenários (semente)](#14-matriz-de-cenários-semente)
15. [Fatiamento sugerido](#15-fatiamento-sugerido)
16. [Referências](#16-referências)

---

## 1. O pedido

| # | Requisito | Onde é tratado |
|---|---|---|
| R1 | levantar as perdas do backend que a antiga F6 do plano 26 citava, conferidas no código e no SDK | §2, §4, §5, §6 |
| R2 | o que o web passar a mostrar, o app mostra igual, no conteúdo e no formato (a R4 da discovery 08) | §3, §9 |
| R3 | mensagem desconhecida **aparece na conversa**, no web e no app. Não basta o log. Depois: "tudo o que for desconhecido vai ser tratado por um plano desta discovery" | §7 |
| R5 | mensagens, comandos e eventos para o web e o app são **canônicos**: outro agente de código pode entrar no futuro | §3, §8.1 |
| R4 | o plano 26 fica com a paridade do que existe hoje; o plano que sai daqui complementa o que falta nas duas pontas | cabeçalho, §15, D-01 |

## 2. A resposta curta

Levantado em 2026-10-09 lendo o mapper, o adapter do transcript, o `sdk.d.ts` do SDK 0.3.277 e as
fixtures gravadas, e conferido contra os redutores e os widgets das duas pontas.

**A perda é maior do que a antiga F6 listava.** O `SDKMessage` tem 39 variantes. O mapper converte 8 em
eventos e cala 9 de propósito. As outras **22 caem no `default`**: viram uma linha de `warn` no log e
mais nada ([session-runner.ts:474-481](../../backend/src/adapter/outbound/claude/session-runner.ts#L474-L481)).
Entre elas estão a saída de slash command, o aviso de troca de modelo, o banner de hook, a notificação
do CLI e a negação automática de permissão (§4).

**Três premissas da antiga F6 não se confirmam:**

1. **"A compactação some do histórico porque `historicalEvents` devolve `[]`."** Isso é verdade, mas
   não é o único motivo. O adapter chama `getSessionMessages` **sem** `includeSystemMessages`
   ([transcript.adapter.ts:311](../../backend/src/adapter/outbound/claude/transcript.adapter.ts#L311)).
   Por isso nenhuma entrada `system` chega ao mapper. A correção mexe nos dois lugares, e o custo da
   leitura com as mensagens de sistema precisa ser medido.
2. **"O `hook_response` traz o `systemMessage`."** Não traz. O tipo tem `output`, `stdout`, `stderr`,
   `exit_code` e `outcome`. O `systemMessage` existe na saída JSON que o hook escreve
   (`SyncHookJSONOutput`), e o SDK diz que o retorno de hook chega como `informational`
   ("hook feedback (e.g. a UserPromptSubmit hook's block reason), slash-command output"). Medir em qual
   dos dois ele aparece. Outro dado da medição: a `tool-turn` foi gravada com `includeHookEvents: true`
   e com o nosso `PreToolUse`, e **não tem nenhum** `hook_*`. Os hooks de callback do backend não geram
   eventos de hook. Só o hook de shell das settings gera.
3. **"O modelo reserva vira uma mensagem de sistema."** O SDK só tipa a troca **por recusa**
   (`model_refusal_fallback`, e `model_refusal_no_fallback` quando não há troca). O `fallbackModel` por
   sobrecarga não tem mensagem própria; pode chegar como `informational`, como `notification` ou sem
   aviso nenhum. E o `model_refusal_fallback` traz `retracted_message_uuids`, as mensagens que o cliente
   **deve remover**. As duas pontas hoje mostram a resposta recusada, e ela continua na tela depois da
   troca. Isso não é só perda de aviso: é conteúdo errado na tela.

**Uma perda que já acontece hoje, antes do plano 13**, foi medida na fixture gravada `compact-turn`:

- o `/compact` gera uma mensagem de usuário com `isSynthetic: true` contendo o **resumo inteiro**
  ("This session is being continued from a previous conversation…");
- gera outra, com `isReplay: true`, contendo `<local-command-stdout>Compacted </local-command-stdout>`.

O mapper publica as duas como `message.completed` com `role: 'user'`. Nem o web nem o app filtram nada
disso, então as duas pontas desenham **dois balões "Você"** que a pessoa não escreveu: um com o resumo e
outro com a tag crua.

**Perdas caladas que não passam pelo `default`:**

- `status` com `compact_result: 'failed'` e `compact_error` cai na lista quieta. Um `/compact` que
  falha não aparece em lugar nenhum.
- `api_retry` vira só `statusChanged: thinking`. Perde a tentativa, o máximo de tentativas, a espera e
  o erro.
- `result` de erro (`error_during_execution`, `error_max_turns`, `error_max_budget_usd`…) vira um
  `turn.completed` igual ao de sucesso. O texto do `errors[]` é descartado.
- O `denied` do contrato nunca é emitido: uma negação feita pelo CLI chega como `failed`, e o
  `permission_denied` que a explica cai no `default`.

**O app herda tudo isso**, e perde um pouco mais por conta própria (§9). Um exemplo: no histórico, a
linha de compactação tem `entryId` `compaction:$seq`, e o histórico usa `seq = 0`. Com duas
compactações, a segunda substitui a primeira.

## 3. Princípios

1. **Toda variante tem destino declarado.** Cada variante do SDK está em exatamente uma de três listas:
   **mapeada** (vira evento do contrato), **aviso** (vira `session.notice`) ou **quieta**, sempre com
   o motivo escrito. O que não está em nenhuma é **desconhecida** e aparece na conversa (R3). A
   checagem é de compilador: um `switch` exaustivo sobre a união do SDK, com `never` no fim, quebra o
   `tsc` quando uma versão do SDK acrescenta uma variante.
2. **Uma correção, no backend.** A perda das duas pontas se corrige no mapper e na leitura do
   histórico, uma vez só. Os clientes só desenham.
3. **O mesmo elemento nas duas pontas.** Cada linha nova da conversa tem um par web/app: o mesmo tipo
   de entrada no redutor, a mesma chave de i18n (par no `i18n-shared.json`) e o mesmo estado padrão
   (dobrado ou aberto). Entra no `render-parity.json` do plano 26 já como `ok`.
4. **Ao vivo, no replay e no histórico, igual.** Todo evento novo tem um id estável (o `uuid` da
   mensagem do SDK), para o replay e o histórico não duplicarem nem sobrescreverem linhas.
5. **Texto do CLI, de hook e de comando não é confiável.** É mostrado como texto, ou como o markdown
   seguro do plano 26, nunca como HTML. É cortado num limite. Link só `http`, `https` ou `mailto`, com
   confirmação.
6. **Bytes nunca no WS.** Imagem em resultado de tool trafega como marcador e é buscada pela rota de
   imagem, como a imagem do prompt ([plano 22 · D-09](../plans/22-live-history/decisions.md)).
7. **O log continua.** A linha na tela não substitui o `warn` da variante desconhecida.
8. **Canônico, não do Claude.** Todo evento, campo, `kind` e chave de i18n novo tem nome nosso, que
   outro motor de agente consiga emitir. O vocabulário do SDK fica no adapter (§8.1, e a
   [discovery 03](03-multiplos-motores-de-agente.md)).

## 4. Inventário: as 39 variantes do `SDKMessage`

A fonte é o `sdk.d.ts` do 0.3.277 (a união `SDKMessage`, linha 5025), mais o `command_lifecycle`,
que o CLI emite sem estar na união. "Hoje" é o
[sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts) em
2026-10-09. "Proposta" é a recomendação; quem decide é a D-04.

### 4.1 Mapeadas hoje

| Variante | Hoje | Perda | Proposta |
|---|---|---|---|
| `assistant` | `message.completed` + `tool.started` | bloco que não é texto, pensamento, `tool_use` nem imagem passa só com o `type` (p. ex. `server_tool_use`, `web_search_tool_result`, `document`), e os dois clientes o descartam ([BLOCK_KINDS](../../web/src/features/session/services/conversation-reducer.ts#L332-L337); o app só lê `text`, pensamento e imagem) | bloco desconhecido vira linha genérica (§7.3) |
| `user` / replay | `message.completed` (`role: user`) ou `tool.completed` | todo o §5 | §5 |
| `stream_event` | `message.delta` | — | — |
| `tool_progress` | `tool.progress` com o tempo decorrido | — (o bug de concatenação no app é do plano 26) | — |
| `result` | `turn.completed` | o erro: `subtype`, `is_error`, `errors[]`, `permission_denials` | `turn.completed` ganha `outcome` canônico (`failed`, `limitReached`, `budgetExceeded`…, nunca o subtipo do SDK) **e** um aviso `turn.failed` com o texto do `errors[]` cortado |
| `system:compact_boundary` | `session.compacted` | só ao vivo (§6); sem id estável | ganha `compactionId` (o `uuid`) e entra no histórico |
| `system:api_retry` | `statusChanged: thinking` | tentativa, máximo, espera, `error_status` | mantém o status e acrescenta o aviso `request.retrying` com os números em `params`. Medir o volume num caso real (D-05) |
| `rate_limit_event` | nada, de propósito ([mapper:85-95](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L85-L95)) | o terminal avisa que o limite está perto ou foi atingido | aviso `usage.limited` **só** quando o `rate_limit_info` diz que o limite foi atingido ou está perto; nada quando o estado é normal. Medir os campos (D-05) |

### 4.2 Quietas hoje, de propósito

| Variante | Motivo atual | Proposta |
|---|---|---|
| `system:init` | o `session.started` é nosso, com o nosso id | continua quieta |
| `system:status` | estado do CLI | quieta, **menos** `compact_result: 'failed'`, que vira o aviso `compaction.failed` com o `compact_error` |
| `system:thinking_tokens` | contador | quieta |
| `system:task_started`, `task_progress`, `task_updated`, `task_notification` | o subagent é desenhado pelas mensagens e tools dele | quietas |
| `system:background_tasks_changed` | idem | quieta |
| `command_lifecycle` | a fila de prompts é do backend (plano 08 · D-14) | quieta |

### 4.3 No `default` hoje: só `warn`

| Variante | O que é (doc do SDK) | Proposta |
|---|---|---|
| `system:local_command_output` | saída de slash command local (`/cost`, `/context`…), "exibida como texto de assistente" | aviso `command.output`, aberto, com o texto no markdown seguro e o comando como origem, quando se souber |
| `system:informational` | banner genérico: status, retorno de hook, saída de comando; `level` `info`/`notice`/`suggestion`/`warning`; `prevent_continuation` | aviso `agent.info` com o `level`. O `info` vem dobrado ("só no modo transcript", diz o SDK). O `prevent_continuation` aparece como "o hook parou a continuação" |
| `system:notification` | fila de notificações do REPL (`key`, `text`, `priority`) | aviso `agent.notification` |
| `system:hook_started`, `hook_progress` | ciclo de vida do hook | quietas: o resultado é o que interessa |
| `system:hook_response` | o hook terminou: `outcome`, `stdout`, `stderr`, `exit_code` | aviso `hook.failed` quando `outcome` é `error` (com o `stderr` cortado). Nada quando é `success`, a não ser que a medição mostre que o `systemMessage` vem aqui e não no `informational` (D-05) |
| `system:model_refusal_fallback` | recusa, refeita no modelo reserva; `retracted_message_uuids` | aviso `model.switched` (do modelo X para o Y, `reason: 'refusal'`) **e** a retirada das mensagens recusadas nas duas pontas (§8, D-06) |
| `system:model_refusal_no_fallback` | recusa sem reserva | aviso `model.refused` com o `content` |
| `system:permission_denied` | o CLI negou a tool sem perguntar (regra, modo) | o `tool.completed` daquela tool sai com `status: 'denied'` e o motivo, em vez de `failed`. É o `denied` que o contrato já prevê e nunca é emitido |
| `system:plugin_install` | instalação de plugin (plano 13) | aviso `extension.failed` só quando `status` é `failed`; o resto fica quieto |
| `auth_status` | autenticação do CLI | aviso `auth.failed` quando há `error`; o resto fica quieto |
| `system:memory_recall` | o CLI lembrou memórias (`path`, `scope`) | aviso `memory.recalled` dobrado, com os caminhos |
| `conversation_reset` | `/clear`, saída do modo plano: conversa nova | aviso `conversation.reset`. O que fazer com a sessão (seguir o id novo?) **medir** (D-05) |
| `system:worker_shutting_down` | o processo do CLI vai sair, com `reason` | aviso `agent.stopping`. Conferir se o `session.closed` já cobre (D-05) |
| `tool_use_summary` | um rótulo para um grupo de tools | quieta: o rótulo de tool é nosso (plano 26). Decidir (D-04) |
| `system:session_state_changed` | `idle`/`running`/`requires_action` | quieta: o status é nosso. Registrar como candidato a sinal de fim de turno |
| `system:commands_changed` | lista de slash commands mudou | quieta: é dado do plano 13 (a lista de comandos), não mensagem |
| `system:files_persisted` | Files API | quieta: não usamos |
| `system:elicitation_complete` | elicitação MCP | quieta: não suportamos elicitação |
| `system:control_request_progress` | progresso de pedido de controle **nosso** | quieta |
| `system:mirror_error` | falha do `SessionStore` espelhado | quieta na tela, `error` no log: não usamos `SessionStore` |
| `prompt_suggestion` | próximo prompt previsto (`promptSuggestions`) | quieta: não ligamos a opção |

Com a proposta, o `default` fica vazio para o SDK de hoje. Ele passa a pegar só o que uma versão nova
do SDK trouxer, e isso aparece na tela pela R3 (§7).

## 5. Perdas dentro da mensagem de usuário

O `fromUser`/`userEvents` ([mapper:352-395](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L352-L395))
trata toda mensagem de usuário sem `tool_result` como prompt.

| Caso | Hoje | Medido? | Proposta |
|---|---|---|---|
| resumo da compactação (`isSynthetic: true`) | balão "Você" com o resumo inteiro | **sim**, `compact-turn` | `message.completed` com `injected.kind: 'contextSummary'`. Os dois clientes o desenham **dentro** da linha de compactação, dobrado, com o resumo em markdown ao abrir |
| saída de comando local ecoada (`isReplay: true`, `<local-command-stdout>`) | balão "Você" com a tag crua | **sim**, `compact-turn` | vira o aviso `command.output` (o texto sem a tag). Se já houver um `local_command_output` igual no mesmo turno, o eco é descartado (D-07) |
| corpo de skill (`isSynthetic`) | provavelmente um balão "Você" com o `SKILL.md` | não: precisa da fixture `skill-turn` | `injected: { kind: 'instructions', name }` com o `parentToolUseId` do `Skill`; linha dobrada "Skill *x* carregada" sob o card (é a D-04 do plano 26) |
| expansão de `/comando` (`<command-name>`, `<command-message>`, `<command-args>`) | tags cruas, ao vivo ou no histórico | não | o prompt vira o `/comando args` digitado; nenhuma tag chega ao cliente |
| prompt de outro dispositivo (`isReplay` sem tag) | balão "Você" | sim | mantém: é o que mostra o que foi enviado do outro aparelho |
| `image` **dentro** de `tool_result` | descartada: `resultText` só lê texto ([mapper:423-427](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L423-L427)) | não: precisa da fixture `mcp-media-result-turn` | marcador em `tool.completed.attachments[]` (`kind: 'image'`). A imagem está **aninhada** no bloco, então o `blockId` precisa de um terceiro nível (`<uuid>:<índice>:<sub-índice>`), e o índice da rota ([transcript-contents.ts](../../backend/src/adapter/outbound/claude/transcript-contents.ts)) passa a olhar dentro do `tool_result` |
| `resource` de texto | descartado | não | o texto entra no resumo e na saída inteira, com o URI como cabeçalho |
| `resource_link` | descartado | não | `tool.completed.attachments[]` (`kind: 'link'`, `uri`, `title`), mostrado como **texto**. Vira link só se for `http`/`https`, com confirmação. `javascript:` nunca vira link |
| bloco que não é `tool_result` numa mensagem com `tool_result` | descartado | não | medir se o CLI produz isso. Se produzir, vira `message.completed` à parte |
| `tool_use_result` estruturado (MCP) | ignorado | — | continua ignorado, porque o texto basta. Registrar como exclusão |

## 6. Perdas do histórico

| Perda | Onde | Proposta |
|---|---|---|
| nenhuma entrada `system` é lida | [transcript.adapter.ts:311](../../backend/src/adapter/outbound/claude/transcript.adapter.ts#L311): `getSessionMessages` sem `includeSystemMessages` | ler com `includeSystemMessages: true` e medir o custo (o SDK reparsa o JSONL inteiro a cada leitura, [transcript-reads.ts](../../backend/src/adapter/outbound/claude/transcript-reads.ts)) |
| `system` → `[]` | [`historicalEvents`, mapper:455-480](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L455-L480) | passa pelas **mesmas** funções do ao vivo (`fromSystem`), como o plano 22 fez com `assistant` e `user` |
| os subtipos do JSONL não são os do stream | — | o transcript grava `system` com subtipos próprios. **Medir** quais aparecem (compactação, saída de comando, informativo, erro de API) e mapear cada um para o mesmo evento do ao vivo. O que não tiver par vai para a regra da R3 |
| compactação sem id estável | app: `CompactionLine.entryId` = `compaction:$seq` ([conversation_entry.dart:309](../../mobile/lib/features/session/domain/entities/conversation_entry.dart#L309)), e o histórico usa `seq = 0`. Web: `id: seq ?? frame.id` ([conversation-reducer.ts:604](../../web/src/features/session/services/conversation-reducer.ts#L604)) | `compactionId` no contrato, e as duas pontas passam a usar esse id. O web tem que ser conferido no histórico |
| a cadeia depois do `/compact` é outra | [scripted-transcripts.ts `compactedChain`](../../backend/test/fakes/agent-sdk/scripted-transcripts.ts) | medir onde o `compact_boundary` e o resumo ficam na cadeia que o SDK reconstrói, para a linha cair no mesmo lugar em que caiu ao vivo |
| o app descarta `UnreadEvent` no histórico | [history_mapper.dart](../../mobile/lib/features/session/data/mappers/history_mapper.dart) (`whereType<SessionEvent>`) | com a R3, o desconhecido do histórico também vira linha (§7.4) |

## 7. A mensagem desconhecida (R3)

**Escopo:** pela regra do usuário, **todo** caso de "desconhecido" é deste plano, nas três pontas. O
plano 26 não trata nenhum: ele iguala o app ao web no que é conhecido.

### 7.0 Onde o desconhecido some hoje

Levantado no código em 2026-10-09. Todos os casos abaixo terminam hoje sem nada na tela, e alguns
nem no log.

| # | Ponta | Caso | Onde | Hoje | Proposta |
|---|---|---|---|---|---|
| U-01 | backend | tipo de `SDKMessage` desconhecido | [mapper:96-99](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L96-L99) | `warn` | `session.notice` `unknown` (§7.1) |
| U-02 | backend | subtipo de `system` desconhecido | [mapper:143-146](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L143-L146) | `warn` | idem |
| U-03 | backend | entrada do histórico de tipo desconhecido, e todo `system` | [mapper:476](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L476) | `[]`, **sem log** | idem, pelo mesmo caminho do ao vivo (§7.2) |
| U-04 | backend | bloco do `tool_result` que não é texto | [`resultText`, mapper:423-427](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L423-L427) | descartado, **sem log** | os conhecidos viram `attachments` (§5); o resto vira um anexo `unknown` com o tipo |
| U-05 | web e app | bloco de conteúdo de tipo desconhecido (o backend já o repassa com o `type`) | web [`BLOCK_KINDS`](../../web/src/features/session/services/conversation-reducer.ts#L332-L337); app `_finished` e `_thoughtOf` ([session_event_mapper.dart:226-288](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart#L226-L288)) | descartado | bloco genérico, na ordem (§7.3) |
| U-06 | web e app | evento WS de tipo desconhecido | web [`readEvent`:63-72](../../web/src/features/session/services/conversation-reducer.ts#L63-L72); app [`_pongOr`:171-174](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart#L171-L174) | estado sem mudança / `UnreadEvent`; o `seq` avança | linha genérica, uma por tipo (§7.4, D-02) |
| U-07 | web e app | valor de enum desconhecido num evento conhecido: o `status` da sessão, o `status` da tool, o motivo do `session.closed`, o resultado do `session.rewound` | web `STATUSES` (:163-175) e `TOOL_OUTCOMES` (:504-520); app :177-188, :325-333, :391-402, :409 | web: ignora o campo ou a mudança; app: o evento **inteiro** vira `UnreadEvent` | o evento é aplicado com o valor neutro (o card fica no estado anterior), e uma linha genérica diz qual valor não foi entendido |
| U-08 | web | `blockType` desconhecido no `message.delta` | [conversation-reducer.ts:305](../../web/src/features/session/services/conversation-reducer.ts#L305) | lido como `text`: um tipo novo de bloco apareceria **como resposta** | vira um bloco à parte, do tipo desconhecido, como no U-05. O app faz igual |
| U-09 | web e app | evento conhecido sem um campo obrigatório (malformado) | web `aboutMessage` (:49-54); app, os retornos `UnreadEvent` por campo ausente | descartado em silêncio | `warn` no log do cliente **e** a mesma linha genérica do U-06. Não é forward-compat: é contrato violado, e precisa aparecer |
| U-10 | app | o histórico descarta todo `UnreadEvent` | [session_event_mapper.dart:82-84](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart#L82-L84) | some do histórico | o histórico aplica a mesma regra do ao vivo |
| U-11 | web e app | `kind` de `session.notice` desconhecido (depois deste plano) | — | — | desenhado como `unknown`, com o `text` se houver |

O que **não** é desconhecido, e fica fora: a tool de nome que o cliente não conhece (o plano 26 a
mostra pelo nome, S-50) e a linguagem de código sem realce (o 26 a mostra sem cor, S-25). Os dois já
têm uma saída na tela.

Os U-01…U-04 são do backend. Os U-05…U-11 são das duas pontas e entram com o mesmo par web/app do
§9. A linha genérica é **uma só** nos dois clientes: o mesmo componente para U-05…U-11, com um
`reason` (`unknownEvent`, `unknownValue`, `malformed`, `unknownBlock`, `unknownNotice`) e as mesmas
chaves de i18n pareadas.

Os §7.1 a §7.4 detalham os casos principais.

### 7.1 Variante do SDK desconhecida (backend)

Hoje: `{ events: [], unknown: 'system:xyz' }` e um `warn`. Proposta:

- O mapper emite `session.notice` com `kind: 'unknown'`, `origin: { engine: 'claude', native:
  'system:xyz' }` e `noticeId` (o `uuid` da mensagem, quando ela tem um). O `native` é opaco (§8.1).
- `text` **só** quando a mensagem tem um campo de texto conhecido no nível de cima (`content`, `text`,
  `message`, `error` ou `reason`, como string). Vai cortado (p. ex. 2 000 caracteres) e marcado como não
  confiável. **Nunca** o JSON da mensagem: o mesmo motivo pelo qual o `describe` não loga o payload
  ([mapper:502](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L502)) vale para o
  buffer de replay e para a tela (D-03).
- O `warn` continua.
- Na tela, as duas pontas mostram uma linha discreta: "O agente enviou uma mensagem que esta versão
  não sabe mostrar (`system:xyz`)". O texto aparece ao abrir, se houver.
- Variantes iguais em sequência viram uma linha só, com contador ("×3"), para uma versão nova do SDK
  que emita a mesma coisa a cada turno não encher a conversa.

### 7.2 Entrada do histórico desconhecida

O mesmo, pelo mesmo caminho (`historicalEvents` → `fromSystem`/`default`). Isso só vale depois do §6.

### 7.3 Bloco de conteúdo desconhecido

O backend já repassa o `type` de um bloco que não conhece. O web o descarta no `BLOCK_KINDS`, e o app
só lê `text`, pensamento e imagem. Proposta: as duas pontas desenham um bloco genérico, "Conteúdo do
tipo `server_tool_use` que esta versão não mostra", no lugar do bloco e na ordem dos blocos. O texto vai
junto, se o bloco tiver `text`. Os tipos conhecidos que ficam de fora de propósito vão para uma lista
com motivo, como no §4.

### 7.4 Evento WS desconhecido (cliente)

Hoje: o web devolve o estado sem mudança ([conversation-reducer.ts:63-72](../../web/src/features/session/services/conversation-reducer.ts#L63-L72)),
e o app gera `UnreadEvent` ([session_event_mapper.dart:147, 171-174](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart#L171-L174)).
Nos dois, o `seq` avança. É o que manda o contrato: "cliente ignora o que não conhece".

A R3 pede o contrário, e o caso é real para o app: o app da loja fica atrás do backend, e um evento de
conversa novo seria invisível nele. **Isso conflita com o documento de contrato e com o S-80 do plano
26**, e por isso fica para o usuário decidir (D-02). Recomendação:

- Um evento desconhecido **mostra** uma linha genérica na conversa: "Esta versão do app não mostra um
  tipo de conteúdo da sessão (`x.y`). Atualize o app." Uma linha por tipo por sessão, e o `seq` avança
  como hoje.
- Os eventos que **não** são conversa entram numa lista explícita de "conhecidos e calados" nos dois
  clientes **antes** da regra mudar. Exemplos: o `session.mcpStatusChanged`, que hoje cai no caminho do
  desconhecido nas duas pontas, e os `workspace.*`/`transcript.*`, que o app já separa. Sem essa lista,
  a regra nova desenha uma linha a cada mudança de status de MCP.
- O documento [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md) troca "ignora"
  por "ignora sem quebrar e, se for da conversa, mostra a linha genérica".

## 8. Contrato

### 8.1 Canônico, não do Claude

Pedido do usuário, de 2026-10-09: "as mensagens, comandos e eventos para web e mobile têm que ser
canônicos, pois no futuro podemos usar outros agentes de código". A regra é a da
[discovery 03 §3](03-multiplos-motores-de-agente.md#3-princípios): o contrato é nosso, nunca de um
motor ([ADR-006](../architecture/shared/00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru)).
Aplicada aqui:

- **Nada do vocabulário do SDK no contrato.** Nenhum `kind`, enum ou campo tem nome de subtipo do
  Claude (`local_command_output`, `model_refusal_fallback`, `error_max_turns`, `hook_response`). O
  adapter do Claude traduz para o nome canônico. Um adapter de outro motor traduz o que ele tiver para
  os **mesmos** nomes.
- **O nome nativo só como texto opaco.** Em `origin.native` (p. ex. `system:xyz`), para diagnóstico e
  para a linha `unknown`. Nenhum cliente toma decisão por ele. Junto vai `origin.engine`, com o
  `EngineId` da 03 (`claude` hoje).
- **Conceito que nem todo motor tem** (hook, slash command, compactação, skill) é emitido só quando o
  motor o tem. Isso segue as capacidades da [03 §6.2](03-multiplos-motores-de-agente.md#62-capacidades).
  O cliente nunca pergunta qual é o motor: desenha pelo `kind`.
- **Nenhum comando novo** do cliente para o servidor. Tudo aqui são eventos e campos de evento.
- **Chaves de i18n canônicas:** `sessions.notice.modelSwitched`, nunca `sessions.notice.claudeFallback`.
- A mesma forma serve a `session.notice` **e** a `transcript.appended` (o histórico), como o resto do
  contrato.

### 8.2 O evento de aviso

Tudo é aditivo: campo opcional e evento novo, **sem subir `v`**. Schema, `protocol.ts`,
`protocol.g.dart` e o 05 vão na mesma entrega. Os nomes são proposta (D-04, D-10).

```jsonc
// evento novo, com seq, no replay e no histórico (transcript.appended)
"session.notice": {
  "noticeId": "…",                 // id estável ao vivo × histórico (no Claude, o uuid da mensagem)
  "kind": "…",                     // string aberta, da tabela abaixo; cliente que não conhece o kind o mostra como `unknown`
  "level": "info | notice | warning | error",
  "messageKey": "sessions.notice.modelSwitched",   // quando o texto é nosso
  "params": { "from": "…", "to": "…", "reason": "refusal" },
  "text": "…",                     // quando o texto é do agente, do hook ou do comando: não confiável, cortado
  "truncated": true,
  "subject": { "command": "/cost", "hook": "nome", "trigger": "afterTool" },  // canônico, todos opcionais
  "origin": { "engine": "claude", "native": "system:xyz" },                   // opaco: diagnóstico e `unknown`
  "parentToolUseId": "…",          // aviso de dentro de um subagent
  "at": "…"                        // só no histórico
}
```

| `kind` canônico | O que diz | De onde vem no Claude (só no adapter) |
|---|---|---|
| `command.output` | saída de um comando local do agente | `local_command_output`; o eco `<local-command-stdout>` |
| `agent.info` | banner genérico do agente, com `level` | `informational` |
| `agent.notification` | notificação do agente | `notification` |
| `agent.stopping` | o processo do agente vai sair | `worker_shutting_down` |
| `hook.failed` | uma automação configurada pelo usuário falhou | `hook_response` com `outcome: 'error'` |
| `model.switched` | a resposta veio de outro modelo; `params.reason`: `refusal`, `overload` ou `other` | `model_refusal_fallback`; a troca por sobrecarga, se medida |
| `model.refused` | o modelo recusou, sem troca | `model_refusal_no_fallback` |
| `request.retrying` | o pedido ao modelo vai ser repetido; `params`: `attempt`, `maxAttempts`, `delayMs` | `api_retry` |
| `usage.limited` | limite de uso perto ou atingido | `rate_limit_event`, só fora do estado normal |
| `turn.failed` | o turno terminou em erro; `params.reason`: `execution`, `maxTurns`, `budget` ou `other` | `result` com `subtype` de erro |
| `compaction.failed` | a compactação do contexto falhou | `status` com `compact_result: 'failed'` |
| `extension.failed` | um plugin ou extensão não carregou | `plugin_install` com `failed` |
| `auth.failed` | o agente perdeu a autenticação | `auth_status` com `error` |
| `memory.recalled` | o agente leu memórias; `params.paths` | `memory_recall` |
| `conversation.reset` | o agente começou uma conversa nova | `conversation_reset` |
| `unknown` | algo que o adapter não conhece | o `default` |

O mapa da terceira coluna mora no adapter (`adapter/outbound/claude/`). A aplicação e os clientes
só veem a primeira.

### 8.3 Campos novos em eventos que já existem

| Evento | Campo | Para |
|---|---|---|
| `message.completed` | `injected?: { kind: 'instructions' \| 'commandExpansion' \| 'contextSummary' \| 'other', name? }` | §5: o que o agente injetou na conversa nunca vira prompt. No Claude, o `isSynthetic` da skill, do `/comando` e do resumo da compactação |
| `tool.completed` | `attachments?: [{ kind: 'image', blockId, mediaType?, size? } \| { kind: 'link', uri, title? }]` | imagem e link no resultado de tool, sem dizer "MCP". No Claude, `image` e `resource_link` dentro do `tool_result`; o `resource` de texto vai para o texto |
| `tool.completed` | `status: 'denied'` passa a ser emitido, com o motivo no `summary` | no Claude, o `permission_denied` |
| `turn.completed` | `outcome?: 'completed' \| 'failed' \| 'limitReached' \| 'budgetExceeded' \| 'cancelled'` | o turno que terminou em erro, sem o `subtype` do SDK |
| `session.compacted` | `compactionId` | id estável ao vivo e no histórico. A 03 já prevê esse evento só para motor com a capacidade |
| `message.retracted` (novo) | `messageIds[]` | o cliente remove a resposta que o agente retirou. No Claude, os `retracted_message_uuids`. **Medir** se eles batem com o `uuid` do `blockId` ou com o `messageId` (D-06) |

Rota: `GET /transcripts/:id/images/:blockId` passa a servir também a imagem aninhada no resultado de
tool. Hoje o índice só tem imagens de prompt da cadeia principal. A 03 já prevê que essa rota vire
`{ engine, id }`, e nada daqui atrapalha.

i18n: o backend manda `messageKey` + `params`, e quem traduz é o cliente (regra 2 do AGENTS). Cada
chave nasce nos dois catálogos (web `sessions.notice.*`, app `sessionNotice*`), com o par no
[i18n-shared.json](../../scripts/i18n-shared.json).

## 9. A mesma implementação no web e no app

Cada linha abaixo é um elemento com par obrigatório. As peças existem nas duas pontas, com o mesmo
desenho, e o que muda é só onde encaixar.

| Elemento | Web | App |
|---|---|---|
| **leitura do evento** | `session.notice` no `EVENT_READERS` ([conversation-reducer.ts:690-705](../../web/src/features/session/services/conversation-reducer.ts#L690-L705)) → entrada `{ kind: 'notice' }` no `TimelineEntry` ([live-session.ts](../../web/src/features/session/types/live-session.ts)) | `session.notice` no `_readers` ([session_event_mapper.dart:112-127](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart#L112-L127)) → `SessionNotice` em `session_event.dart` → `NoticeLine` em `conversation_entry.dart`, com `entryId` `notice:<noticeId>`, nunca pelo `seq` |
| **linha de aviso** | `NoticeRow`, sobre o `SystemRow` do [TurnRow.tsx:19-38](../../web/src/features/session/components/conversation/TurnRow.tsx#L19-L38) (exportá-lo), no switch do [TimelineEntries.tsx:99-117](../../web/src/features/session/components/conversation/TimelineEntries.tsx#L99-L117); o `authorsOf` (:59-84) reinicia a sequência de autor | `NoticeLine` sobre o `_Line` de [conversation_lines.dart:81-95](../../mobile/lib/features/session/presentation/widgets/conversation_lines.dart#L81-L95), no `Conversation._applied` ([conversation.dart:307-356](../../mobile/lib/features/session/domain/entities/conversation.dart#L307-L356)) por `_withEntry`, e no switch do [conversation_view.dart:497-507](../../mobile/lib/features/session/presentation/widgets/conversation_view.dart#L497-L507) |
| **nível** (`info` dobrado, `warning`/`error` em destaque) | cores dos tokens de tema | as mesmas cores, pelo `ColorScheme` |
| **texto ao abrir** | o markdown seguro (`Markdown`) para `command.output`; texto puro para o resto | o `SafeMarkdown` do plano 26 (`core/widgets/markdown/`), com `SelectionArea`; texto puro para o resto |
| **linha desconhecida** (§7) | a mesma `NoticeRow` com `kind: 'unknown'`; o mesmo `kind` desconhecido também cai aqui | a mesma `NoticeLine` |
| **bloco desconhecido** | novo `BlockKind` `unknown` no `BLOCK_KINDS`, desenhado no `MessageItem` | o mapper `_finished` (:226-260) passa a guardar os blocos na ordem, com o desconhecido; o `MessageBubble` o desenha |
| **valor desconhecido e evento malformado** (U-07, U-09) | o leitor aplica o evento com o valor neutro e acrescenta a entrada genérica | o mapper para de devolver `UnreadEvent` por valor desconhecido: devolve o evento com o valor neutro e a entrada genérica |
| **evento WS desconhecido** (D-02) | `readEvent` sem leitor → entrada `unknownEvent`, uma por tipo | `_pongOr` → `UnknownSessionEvent` em vez de `UnreadEvent`; o histórico para de descartar |
| **resumo da compactação** | `CompactedRow` ([TurnRow.tsx:72-100](../../web/src/features/session/components/conversation/TurnRow.tsx#L72-L100)) ganha o "ver resumo" dobrado | `CompactedLine` ([conversation_lines.dart:29-51](../../mobile/lib/features/session/presentation/widgets/conversation_lines.dart#L29-L51)) ganha o mesmo |
| **id da compactação** | `compactionId` no lugar de `seq ?? frame.id` | `compactionId` no lugar de `compaction:$seq` |
| **mídia no card da tool** | `ImageMarker` ([ImageMarker.tsx:67-124](../../web/src/features/session/components/conversation/ImageMarker.tsx#L67-L124)) dentro do `ToolRow`, com o `usePromptImage` | `ImageMarker` ([image_marker.dart:37](../../mobile/lib/features/session/presentation/widgets/image_marker.dart#L37)) dentro do `ToolCard`, com o `PromptImageController` e o zoom do `ZoomableImage` |
| **zoom da imagem** | o diálogo do web não tem zoom; o app tem (`InteractiveViewer`, máx. 8×) | — |
| **link de recurso** | texto; link só `http`/`https` com confirmação | o mesmo, com a confirmação de link do leitor do plano 25 |
| **tool negada pelo CLI** | `ToolRow` já desenha `denied` com o motivo (`sessions.toolRow.denied`) | `ToolCard` já aceita `denied`; conferir o texto do motivo |
| **turno com erro** | a linha do turno (`TurnRow`) em estado de erro, mais o aviso | `TurnLine` igual |
| **resposta retirada** (D-06) | o redutor remove as mensagens pelos ids | o `Conversation` remove pelos ids, ao vivo e no replay |
| **skill / comando** (§5) | linha dobrada sob o card do `Skill`; o prompt `/comando args` | o mesmo. **Depende da F5 do plano 26** (o aninhamento no app) para ficar sob o card |
| **i18n** | `sessions.notice.*` em `en.json`/`pt-BR.json` | `sessionNotice*` em `app_en.arb`/`app_pt.arb`, com o par no `i18n-shared.json` |

**Uma diferença que já existe:** o zoom da imagem. O app tem, e o web não. Não é perda de conteúdo, mas
um elemento novo de imagem no card da tool herda essa diferença. Fica registrada (D-08).

## 10. Testes e fixtures

Os três níveis, com 90 % por arquivo, como sempre. O que é específico:

- **Contrato canônico.** Um teste do pacote `contracts` recusa nos schemas deste plano qualquer `kind`,
  enum ou chave com nome do SDK (`snake_case` de subtipo, `claude`, `sdk`). O `origin.native` é a única
  exceção, por ser opaco.
- **Exaustividade no compilador.** Um teste de tipo (`expectTypeOf`, ou o `switch` com `never`)
  quebra quando o SDK acrescenta uma variante. A atualização do SDK passa a exigir a decisão de onde a
  variante nova cai.
- **Uma unidade por variante** do §4, em três grupos: mapeadas (o evento), aviso (o `kind`, o nível, o
  corte do texto) e quietas (nada, e sem `unknown`).
- **Desconhecido sintético.** Uma mensagem inventada (`{ type: 'system', subtype: 'nunca_visto',
  content: 'x' }`) prova a linha `unknown`. Ela é escrita à mão, porque testa o nosso caminho de
  sobrevivência e não a forma do SDK.
- **Fixtures gravadas** por `scripts/record-agent-sdk-fixtures.mjs`, nunca escritas à mão:
  - `compact-turn` (já existe; passa a provar o §5);
  - `compact-failed-turn`;
  - `local-command-turn` (`/cost` ou `/context`);
  - `project-command-turn` (`/comando` do projeto, ao vivo e no histórico);
  - `skill-turn`;
  - `hook-message-turn` (hook de settings com `systemMessage`, e um que falha);
  - `mcp-media-result-turn` (imagem, `resource` e `resource_link`);
  - `denied-by-rule-turn`.

  A recusa com troca de modelo (`model_refusal_fallback`) **não** se provoca de propósito: ou fica
  como fixture escrita à mão, marcada como tal, ou fica sem fixture com a exclusão registrada (D-09).
- **Histórico.** Para cada fixture, a sequência de eventos do histórico é igual à do ao vivo (o
  princípio 4), conferida pelo `scripted-transcripts`.
- **Paridade.** Cada elemento do §9 entra no `render-parity.json` do plano 26, com o widget test do
  app que desenha a mesma fixture.
- **E2E.** `test:e2e` e `test:e2e:mobile` com uma sessão que tem `/compact` e um comando local, para
  conferir que não há balão "Você" fantasma e que o aviso está na tela. `test:e2e:live` repete as
  medições a cada versão do CLI.

## 11. Fora do escopo

- A paridade do que o web **já** mostra: é do plano 26 (R4).
- As **features** que algumas variantes sugerem: a lista de slash commands (`commands_changed`), a
  elicitação MCP, a Files API, as sugestões de prompt e o `SessionStore`. Ficam quietas com o motivo
  escrito, e voltam a ser discutidas se a feature entrar.
- O `tool_use_result` estruturado do MCP: o texto basta.
- O zoom no diálogo de imagem do web (D-08), a não ser que a decisão o traga para cá.

## 12. Decisões em aberto

IDs desta discovery. Viram as primeiras do `decisions.md` do plano novo, com os mesmos números.

| ID | Decisão | Recomendação |
|---|---|---|
| D-01 | A antiga F6 do plano 26 vem para o plano novo? | ✅ **decidida em 2026-10-09:** saiu do 26 ([Não entra](../plans/26-mobile-conversation-parity/README.md#não-entra)), com as B-22…B-26 e a B-30 vagas. O 26 faz a paridade do que existe, e o novo faz o que falta nas duas pontas. Ordem: 26 → 13 → este. As D-04 (sintética), D-05 (o que medir) e D-06 (quais perdas e a forma do contrato) do 26 ficam cobertas pela D-04 (destino de cada variante e nomes do contrato, sintética incluída) e pela D-05 (o que medir) desta lista. Fica para o plano novo: os cenários S-72…S-76, S-80 e S-81 do 26 e as entradas do `render-parity.json` que dependiam da fase |
| D-02 | **Evento WS desconhecido no cliente:** ignorar (contrato atual, S-80) ou mostrar uma linha (R3) | **mostrar**, uma linha por tipo por sessão, com a lista explícita de "conhecidos e calados" criada antes. **Conflita com o 05-websocket-protocol**: é o usuário quem decide, e o documento muda junto |
| D-03 | O que a linha `unknown` mostra | o nome da variante e, quando existir, o texto de um campo conhecido, cortado. Nunca o JSON |
| D-04 | Destino de cada variante (§4) e os nomes do contrato (§8) | a tabela do §4 e o rascunho do §8 |
| D-05 | O que medir no spike | `includeSystemMessages` (custo e subtipos do JSONL), onde chega o `systemMessage` de hook, a troca por sobrecarga do `fallbackModel`, os campos do `rate_limit_info`, o volume do `api_retry`, o `conversation_reset` depois de `/clear` e o `worker_shutting_down` |
| D-06 | A retirada da resposta recusada | evento próprio `message.retracted`, se os uuids baterem com o que os clientes guardam. Se não baterem, o aviso sem retirada e a exclusão registrada |
| D-07 | Eco `<local-command-stdout>` e `local_command_output` juntos | um só aviso por saída: o `local_command_output` vence, e o eco só vale quando estiver sozinho (no histórico, por exemplo) |
| D-08 | Zoom da imagem no web | fora deste plano; registrar como diferença conhecida |
| D-09 | Fixture da recusa com reserva | escrita à mão e marcada, porque o caminho de retirada precisa de teste e não há como provocar a recusa |
| D-10 | Os `kind` canônicos do §8.2 e o `injected`/`attachments` do §8.3 | a tabela do §8.2, revisada contra a matriz de capacidades da [03 §5.3](03-multiplos-motores-de-agente.md#53-matriz-de-capacidades) antes de fechar: cada `kind` precisa fazer sentido para pelo menos um motor além do Claude, ou ser genérico (`agent.info`, `unknown`) |
| D-11 | ✅ O que a [B-46 do plano 13](../plans/13-claude-settings/F4-e2e.md) exige e só este plano entrega: a skill de usuário "com a mensagem que o CLI acrescenta" e a tool MCP "com imagem no resultado" passando na paridade de conteúdo do 26 (B-28) | com a ordem 26 → 13 → este, o 13 termina antes de essas perdas serem corrigidas. Do jeito que está escrita, a B-46 registraria o erro de hoje como conteúdo esperado (o balão "Você" com o `SKILL.md`, a imagem sumida). **Recomendação:** tirar as duas partes da B-46. As fixtures continuam no 13, sem a sintética e sem a mídia na paridade, e a F7 deste plano passa a conferi-las. ✅ **Decidida pelo usuário em 2026-10-09 e aplicada:** as duas partes saíram da B-46 e do S-214 do 13, com o registro no progresso dele |

## 13. Riscos

| ID | Risco | Mitigação |
|---|---|---|
| R-01 | A linha `unknown` vira ruído (uma variante nova a cada turno) | contador em sequência, lista de quietas com motivo, e a atualização do SDK revisa a lista (o `never` do §10) |
| R-02 | Texto de hook ou de comando com conteúdo sensível (caminho, segredo) chega ao buffer de replay e ao celular | corte; o texto já é da própria sessão do dono; nunca o JSON. Revisar na revisão de segurança do plano |
| R-03 | `includeSystemMessages` deixa a leitura do histórico mais lenta | medir no spike; o cache por versão do plano 22 continua valendo |
| R-04 | A forma do `systemMessage`, do aviso de troca de modelo ou do JSONL muda numa versão do CLI | fixtures gravadas e `test:e2e:live` por versão |
| R-05 | Mudar "cliente ignora" quebra o app da loja | a lista de "conhecidos e calados" sai **antes**, numa versão do app, e a regra nova só depois |
| R-06 | A retirada remove a mensagem errada | os ids medidos (D-06); a retirada é idempotente e ignora id desconhecido, como diz o SDK |
| R-07 | Entre o fim do 13 e este plano, as sessões com MCP, skill, hook e comando de projeto rodam **com** as perdas: o balão "Você" fantasma, a imagem sumida, o aviso de hook que ninguém vê | aceito pela ordem (D-01). O 13 não esconde isso: a D-11 tira da B-46 o que só este plano corrige |

## 14. Matriz de cenários (semente)

Para o plano enumerar por inteiro, pelas seis dimensões do
[protocolo §Estágio 0](../architecture/shared/11-validation-protocol.md).

| Dimensão | Cenários |
|---|---|
| Equivalência | cada `kind` de aviso; `/compact` sem balão fantasma, com o resumo na linha; comando local; skill; `/comando` no histórico; imagem, `resource` e `resource_link` no resultado; tool negada por regra; turno com erro |
| Fronteira | texto de aviso vazio, de 1 caractere e acima do corte; 10 avisos iguais em sequência (contador); imagem sem `mediaType`; `resource_link` sem `name`; duas compactações no histórico |
| Erro | cada U-01…U-11 do §7.0; variante do SDK desconhecida, com e sem campo de texto; bloco desconhecido; evento WS desconhecido no cliente; `resource_link` com `javascript:`; imagem do resultado que não carrega; hook que falha com `stderr` grande |
| Transição de estado | recusa → troca de modelo → resposta recusada retirada; `/compact` que falha; aviso de dentro de um subagent; histórico carregado por cima do ao vivo, com avisos |
| Concorrência | aviso chegando entre deltas de uma resposta; dois hooks terminando juntos; retirada chegando antes do `message.completed` que retira |
| Canônico | nenhum `kind`/enum novo com nome do SDK; um adapter falso de outro motor emite os mesmos `kind` e as duas pontas os desenham sem saber o motor |
| Idempotência | o mesmo `session.notice` no ao vivo, no replay e no histórico vira uma linha só (`noticeId`); a retirada aplicada duas vezes; o eco e o `local_command_output` da mesma saída viram um aviso só |

## 15. Fatiamento sugerido

| Fase | Entrega | Depende de |
|---|---|---|
| F0 | spike: as medições da D-05, as fixtures do §10 gravadas, os uuids da retirada (D-06) | os planos 26 e 13 concluídos |
| F1 | a lista de "conhecidos e calados" nos dois clientes (sai antes, R-05), e o `session.mcpStatusChanged` entra nela | D-02 |
| F2 | o contrato do §8 nas três pontas (schema, TS, Dart, 05), sem comportamento | D-04 |
| F3 | backend: o `switch` exaustivo, os avisos do §4, a sintética e o eco do §5, a linha `unknown` | F0, F2 |
| F4 | backend: mídia, recurso e link no resultado de tool, e a rota de imagem aninhada | F0, F2 |
| F5 | backend: histórico com `includeSystemMessages` e as mesmas funções do ao vivo, com ids estáveis | F0, F3 |
| F6 | web e app **juntos**: a linha de aviso, todo desconhecido do §7.0 (U-05…U-11), o resumo da compactação, a mídia no card, a retirada, o `denied`, o turno com erro, o i18n pareado | F2…F5 |
| F7 | E2E (web, app e live) | todas |

**O plano inteiro depende do 26 e do 13 concluídos**, desde a F0. A ordem é 26 → 13 → este:

- o 26 deixa o app igual ao web de hoje, e este plano parte dessa base para acrescentar, nas duas
  pontas, o que nenhuma delas mostra;
- o 13 traz para a sessão o que gera a maior parte das perdas: tool MCP composta pelo backend, skill de
  usuário pelo plugin sintético, slash command, hook e subagent de projeto. Com ele pronto, as fixtures
  do §10 são gravadas **pela via real**, e não por um ambiente de spike que imita a composição.

 A F6 usa ainda
o markdown e o aninhamento do app que o 26 entrega. As medições que o 26 fazia para esta discovery
(sintética, avisos, mídia MCP) saíram do spike dele e são da F0 daqui.

## 16. Referências

**Backend:**

- [sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts):
  - `rate_limit_event`: 85-95;
  - `default` dos tipos: 96-99;
  - `QUIET_TYPES`: 109;
  - `fromSystem` (`compact_boundary` 129, `api_retry` 140, `default` 143);
  - `QUIET_SYSTEM_SUBTYPES`: 156-164;
  - `fromUser`/`userEvents`: 352-395;
  - `resultText`: 423-427;
  - `fromResult`: 430-441;
  - `historicalEvents`: 455-480;
  - `describe`: 502.
- [session-runner.ts:474-481](../../backend/src/adapter/outbound/claude/session-runner.ts#L474-L481) (o `warn`).
- [transcript.adapter.ts:311](../../backend/src/adapter/outbound/claude/transcript.adapter.ts#L311) (`getSessionMessages` sem `includeSystemMessages`).
- [transcript-contents.ts](../../backend/src/adapter/outbound/claude/transcript-contents.ts) (o índice de imagens, só de prompt).
- [sdk-options.factory.ts:98](../../backend/src/adapter/outbound/claude/sdk-options.factory.ts#L98) (`includeHookEvents: true`).
- Fixtures: [compact-turn.json](../../backend/test/fakes/agent-sdk/fixtures/compact-turn.json) (a sintética e o eco medidos), [tool-turn.json](../../backend/test/fakes/agent-sdk/fixtures/tool-turn.json) (nenhum `hook_*` com o nosso `PreToolUse`).

**SDK** (`sdk.d.ts` 0.3.277): a união `SDKMessage` (5025); `includeHookEvents` (≈1777); `SDKHookResponseMessage`,
`SDKInformationalMessage`, `SDKLocalCommandOutputMessage` (≈4905-4972); `SDKModelRefusalFallbackMessage`
e `…NoFallback` (≈5100-5150); `SDKUserMessage.isSynthetic` (5886); `SDKUserMessageReplay.isReplay`
(6026); `SyncHookJSONOutput.systemMessage` (9131); `getSessionMessages`/`includeSystemMessages` (828-851).

**Contrato:** [protocol.ts](../../packages/contracts/src/protocol.ts) (bloco de conteúdo 441-455,
`session.compacted` 583-588, `tool.completed` 682-696);
[05-websocket-protocol §Versionamento](../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos).

**Web:** [conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts)
(`readEvent` 63-72, `BLOCK_KINDS` 332-337, `applyCompleted` 434-457, `applyCompacted` 593-609,
leitores 690-705); [TurnRow.tsx](../../web/src/features/session/components/conversation/TurnRow.tsx)
(`SystemRow` 19-38, `CompactedRow` 72-100);
[TimelineEntries.tsx](../../web/src/features/session/components/conversation/TimelineEntries.tsx);
[ImageMarker.tsx](../../web/src/features/session/components/conversation/ImageMarker.tsx);
[ToolRow.tsx](../../web/src/features/session/components/conversation/ToolRow.tsx).

**App:** [session_event_mapper.dart](../../mobile/lib/features/session/data/mappers/session_event_mapper.dart)
(`_readers` 112-127, desconhecido 147 e 171-174, `_finished` 226-260, `_toolOutcome` 322-343, `_compacted` 380-388);
[history_mapper.dart](../../mobile/lib/features/session/data/mappers/history_mapper.dart);
[conversation.dart](../../mobile/lib/features/session/domain/entities/conversation.dart) (`_applied` 307-356);
[conversation_entry.dart](../../mobile/lib/features/session/domain/entities/conversation_entry.dart) (`CompactionLine` 293-309);
[conversation_lines.dart](../../mobile/lib/features/session/presentation/widgets/conversation_lines.dart);
[image_marker.dart](../../mobile/lib/features/session/presentation/widgets/image_marker.dart);
[tool_card.dart](../../mobile/lib/features/session/presentation/widgets/tool_card.dart).

**Planos:** [26 · Não entra](../plans/26-mobile-conversation-parity/README.md#não-entra) ·
[26 · decisions (D-04, D-05, D-06)](../plans/26-mobile-conversation-parity/decisions.md#f0--spike) ·
[discovery 08 §7](08-paridade-da-conversa-no-app.md#7-perdas-das-duas-pontas-backend).
