# Plano 27 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões, a partir da semente do
[§14 da discovery](../../discovery/09-perdas-do-backend-na-conversa.md#14-matriz-de-cenários-semente).

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

"Paridade" num cenário quer dizer que o app produz o mesmo conteúdo e o mesmo elemento que o web
para a mesma fixture, conferido pelo teste do app contra a fixture que o teste do web usa. A
dimensão **canônico** da semente (nenhum nome do SDK no contrato; outro motor desenhado igual) entra
como `eq` e `err`, nas S-16, S-17 e S-76.

---

## Spike — B-01, B-02

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | as dez sondas da B-01 respondidas, ao vivo e pelo `getSessionMessages` da mesma conversa, com o custo da leitura com e sem `includeSystemMessages` | eq | spike | — | B-01 | ⬜ |
| S-02 | o uuid de uma mensagem `assistant` gravada comparado com o `blockId` e o `messageId` que os clientes guardam (D-06) | eq | spike | — | B-01 | ⬜ |
| S-03 | cada fixture da B-02 carrega no SDK roteirizado e reproduz a sequência gravada, ao vivo e no `scripted-transcripts` | eq | unit | — | B-02 | ⬜ |
| S-04 | as gravadas não têm diretório descartável nem o home de quem gravou; a `refusal-fallback-turn` é marcada como escrita à mão e o teste de forma a reconhece | err | unit | o teste nomeia a fixture fora de forma | B-02 | ⬜ |

## Conhecidos e calados — B-03, B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-05 | evento servidor → cliente sem classe (conversa ou calado) no schema: o `contracts:check` reprova e o nomeia | err | unit | saída ≠ 0 com o nome do evento | B-03 | ⬜ |
| S-06 | evento classificado nas duas classes: reprova | err | unit | saída ≠ 0 | B-03 | ⬜ |
| S-07 | `session.mcpStatusChanged`, `workspace.*`, `transcript.*` e `diag.*` calados; a lista gerada é a mesma no `protocol.ts` e no `protocol.g.dart` | eq | unit | — | B-03 | ⬜ |
| S-08 | web: evento calado e evento sem leitor fora da lista não mudam a linha do tempo, o `seq` avança, cada ramo loga em `debug` | eq | unit | — | B-04 | ⬜ |
| S-09 | app: o mesmo, ao vivo e no histórico; o evento calado não vira `UnreadEvent` | eq | unit | — | B-04 | ⬜ |

## Contrato — B-05…B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-10 | um `session.notice` de cada `kind` do §8.2 valida no schema, e os tipos TS e Dart gerados concordam | eq | unit | — | B-05 | ⬜ |
| S-11 | `session.notice` sem `noticeId`, `kind` ou `level`, ou com `level` fora do enum: o schema recusa | err | unit | validação falha no campo | B-05 | ⬜ |
| S-12 | `text` no teto da D-13 valida; um caractere acima, recusa | fron | unit | validação falha no `text` | B-05 | ⬜ |
| S-13 | as fixtures de contrato de antes do plano continuam válidas com os campos novos; o `v` não sobe | eq | unit | — | B-06 | ⬜ |
| S-14 | `message.retracted` com `messageIds` vazio é recusado; com um e com vinte, aceito | fron | unit | validação falha em `messageIds` | B-06 | ⬜ |
| S-15 | anexo `image` sem `mediaType` e `link` sem `title` validam; anexo sem `kind`, não | fron | unit | validação falha no anexo | B-06 | ⬜ |
| S-16 | um `kind` `local_command_output`, um enum `error_max_turns` ou uma chave com `claude` num schema deste plano: o portão de neutralidade do plano 28 (`neutral:check`) reprova e nomeia | err | unit | saída ≠ 0 com o caminho do schema | B-07 | ⬜ |
| S-17 | o `origin.native` com `system:local_command_output` passa no `neutral:check`: é a única exceção | eq | unit | — | B-07 | ⬜ |

## Avisos no backend — B-08…B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-18 | cada uma das 39 variantes (mais o `command_lifecycle`) está em exatamente uma lista, com motivo | eq | unit | — | B-08 | ⬜ |
| S-19 | a união do SDK com uma variante a mais não compila (teste de tipo) | err | unit | erro de tipo no `never` | B-08 | ⬜ |
| S-20 | cada variante quieta não emite evento nem `unknown` | eq | unit | — | B-08 | ⬜ |
| S-21 | variante declarada em duas listas: o teste da classificação reprova | err | unit | o teste nomeia a variante | B-08 | ⬜ |
| S-22 | `local-command-turn`: `command.output` com o texto e o `subject.command` | eq | unit | — | B-09 | ⬜ |
| S-23 | `informational` de cada `level` vira `agent.info` com o mesmo nível; com `prevent_continuation`, o parâmetro de que a continuação parou | eq | unit | — | B-09 | ⬜ |
| S-24 | `notification`, `worker_shutting_down`, `memory_recall` (com os caminhos) e `conversation_reset` viram os seus `kind` | eq | unit | — | B-09 | ⬜ |
| S-25 | `hook-message-turn`: o hook que falha vira `hook.failed` com o `stderr` cortado; o que dá certo não gera aviso, salvo o que a B-01 decidir sobre o `systemMessage` | eq | unit | — | B-09 | ⬜ |
| S-26 | `api_retry` mantém o `statusChanged: thinking` e emite `request.retrying` com `attempt`, `maxAttempts` e `delayMs` | eq | unit | — | B-09 | ⬜ |
| S-27 | `rate_limit_event` em estado normal: nada; perto do limite e no limite: `usage.limited` | fron | unit | — | B-09 | ⬜ |
| S-28 | `compact-failed-turn`: `compaction.failed` com o `compact_error`; `status` sem falha continua quieto | eq | unit | — | B-09 | ⬜ |
| S-29 | `plugin_install` e `auth_status`: aviso só na falha; o resto quieto | eq | unit | — | B-09 | ⬜ |
| S-30 | texto de aviso vazio, de um caractere, no teto e um acima do teto (`truncated: true`, cortado no teto) | fron | unit | — | B-09 | ⬜ |
| S-31 | aviso de dentro de um subagent leva o `parentToolUseId`; o log `debug` de entrada e saída não tem o texto inteiro | eq | unit | — | B-09 | ⬜ |
| S-32 | `result` de sucesso: `outcome: 'completed'` e nenhum `turn.failed` | eq | unit | — | B-10 | ⬜ |
| S-33 | `error_max_turns` → `limitReached`; `error_max_budget_usd` → `budgetExceeded`; `error_during_execution` → `failed`; cada um com `turn.failed` e o `errors[]` cortado | eq | unit | — | B-10 | ⬜ |
| S-34 | `result` com subtipo de erro que o adapter não conhece: `failed` com `reason: 'other'` | err | unit | — | B-10 | ⬜ |
| S-35 | `denied-by-rule-turn`: a tool fecha com `status: 'denied'` e o motivo, nunca `failed` | est | unit | — | B-10 | ⬜ |
| S-36 | o `permission_denied` antes e depois do `tool_result` de erro da mesma tool dá o mesmo `denied` | conc | unit | — | B-10 | ⬜ |
| S-37 | `compact-turn`: o resumo sai como `message.completed` com `injected.kind: 'contextSummary'`, nunca como prompt | eq | unit | — | B-11 | ⬜ |
| S-38 | `compact-turn`: o eco `<local-command-stdout>` vira `command.output` sem a tag | eq | unit | — | B-11 | ⬜ |
| S-39 | o eco e o `local_command_output` da mesma saída no turno: um aviso só (D-07) | idem | unit | — | B-11 | ⬜ |
| S-40 | o eco sozinho (sem o `local_command_output`) vira o aviso | est | unit | — | B-11 | ⬜ |
| S-41 | `skill-turn`: `injected: { kind: 'instructions', name }` com o `parentToolUseId` do `Skill` | eq | unit | — | B-11 | ⬜ |
| S-42 | `project-command-turn`: o prompt é `/comando args`; nenhuma tag `<command-*>` chega ao evento | eq | unit | — | B-11 | ⬜ |
| S-43 | prompt de outro dispositivo (`isReplay` sem tag) continua como `message.completed` do usuário | eq | unit | — | B-11 | ⬜ |
| S-44 | `refusal-fallback-turn`: `model.switched` (`from`, `to`, `reason: 'refusal'`) e `message.retracted` com os ids que os clientes guardam | eq | unit | — | B-12 | ⬜ |
| S-45 | `model_refusal_no_fallback` vira `model.refused` com o `content` | eq | unit | — | B-12 | ⬜ |
| S-46 | `retracted_message_uuids` vazio: só o aviso, sem `message.retracted` | fron | unit | — | B-12 | ⬜ |
| S-47 | a mesma recusa no replay: o mesmo `noticeId` e os mesmos ids retirados | idem | unit | — | B-12 | ⬜ |
| S-48 | `{ type: 'system', subtype: 'nunca_visto', content: 'x' }`: `session.notice` `unknown`, `origin.native: 'system:nunca_visto'`, `text: 'x'` | err | unit | — | B-13 | ⬜ |
| S-49 | variante desconhecida sem campo de texto, ou com `content` objeto: sem `text`, e nunca o JSON | err | unit | — | B-13 | ⬜ |
| S-50 | tipo de nível de cima desconhecido: a mesma linha `unknown` | err | unit | — | B-13 | ⬜ |
| S-51 | o `warn` continua, com o nome da variante e sem o payload | eq | unit | — | B-13 | ⬜ |
| S-52 | variante desconhecida sem `uuid`: o `noticeId` derivado é o mesmo no replay | idem | unit | — | B-13 | ⬜ |

## Mídia no resultado de tool — B-14, B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-53 | `mcp-media-result-turn`: a imagem vira anexo `image` com `blockId` `<uuid>:<i>:<j>`, sem bytes no evento | eq | unit | — | B-14 | ⬜ |
| S-54 | o `resource` de texto entra no resumo e na saída, com o URI como cabeçalho | eq | unit | — | B-14 | ⬜ |
| S-55 | o `resource_link` vira anexo `link` com `uri` e `title` | eq | unit | — | B-14 | ⬜ |
| S-56 | imagem sem `mediaType`; `resource_link` sem `name` | fron | unit | — | B-14 | ⬜ |
| S-57 | bloco de tipo desconhecido no `tool_result`: anexo `unknown` com o `type`, e um `warn` | err | unit | — | B-14 | ⬜ |
| S-58 | imagem de 5 MB no resultado: o `tool.completed` fica abaixo do limite de frame, sem base64 | fron | unit | — | B-14 | ⬜ |
| S-59 | `GET /transcripts/:engine/:id/images/<uuid>:<i>:<j>` devolve os bytes com o `Content-Type` da imagem, também de dentro de subagent | eq | integração | — | B-15 | ⬜ |
| S-60 | `blockId` aninhado que aponta para texto, ou com índice fora do bloco | err | integração | `404 NOT_FOUND` | B-15 | ⬜ |
| S-61 | imagem aninhada em SVG, ou acima do teto | err | integração | `415 UNSUPPORTED_MEDIA_TYPE`, `413 PAYLOAD_TOO_LARGE` | B-15 | ⬜ |
| S-62 | o `blockId` de dois níveis (imagem de prompt) continua servido como antes | eq | integração | — | B-15 | ⬜ |

## Histórico — B-16…B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-63 | o `getSessionMessages` é chamado com `includeSystemMessages: true` | eq | unit | — | B-16 | ⬜ |
| S-64 | a leitura de uma conversa longa fica dentro do teto medido na B-01, e a segunda leitura da mesma versão sai do cache | fron | integração | — | B-16 | ⬜ |
| S-65 | para cada fixture da F0, a sequência de eventos do histórico é igual à do ao vivo (menos os deltas) | eq | integração | — | B-17 | ⬜ |
| S-66 | subtipo de `system` do JSONL sem par: a linha `unknown`, com `warn` (U-03) | err | unit | — | B-17 | ⬜ |
| S-67 | entrada do histórico de tipo desconhecido: a linha `unknown`, com `warn` | err | unit | — | B-17 | ⬜ |
| S-68 | duas compactações no histórico: duas linhas, com `compactionId` distintos | fron | integração | — | B-18 | ⬜ |
| S-69 | a linha de compactação cai no mesmo lugar da cadeia em que caiu ao vivo | est | integração | — | B-18 | ⬜ |
| S-70 | histórico carregado por cima do ao vivo, com avisos: nenhum aviso duplicado (`noticeId`) | idem | integração | — | B-18 | ⬜ |
| S-71 | o `transcript.appended` leva o aviso com o `at` | eq | integração | — | B-18 | ⬜ |

## Web e app — B-19…B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-72 | cada `kind` desenhado com a sua chave, em `en` e `pt-BR`, no web e no app (paridade) | eq | unit, widget | — | B-19 | ⬜ |
| S-73 | `info` dobrado; `warning` e `error` em destaque, com as mesmas cores de token nas duas pontas | eq | unit, widget | — | B-19 | ⬜ |
| S-74 | `command.output` com `<script>` e `<img onerror>`: texto, nenhum elemento; os outros `kind` em texto puro | err | unit, widget | — | B-19 | ⬜ |
| S-75 | aviso com `parentToolUseId` aparece sob o subagent, nas duas pontas | eq | unit, widget | — | B-19 | ⬜ |
| S-76 | um aviso com `origin.engine: 'other'` é desenhado igual ao do Claude | eq | unit | — | B-19 | ⬜ |
| S-77 | o mesmo aviso ao vivo, no replay e no histórico vira uma linha só, nas duas pontas | idem | unit | — | B-19 | ⬜ |
| S-78 | bloco de conteúdo desconhecido (`server_tool_use`) aparece na ordem, com o tipo e o texto se houver (U-05) | err | unit, widget | — | B-20 | ⬜ |
| S-79 | `message.delta` com `blockType` desconhecido: bloco à parte, nunca somado à resposta (U-08) | err | unit | — | B-20 | ⬜ |
| S-80 | evento WS de conversa desconhecido: uma linha por tipo por sessão, e o `seq` avança (U-06) | err | unit | — | B-20 | ⬜ |
| S-81 | evento calado da lista da F1 continua sem linha | eq | unit | — | B-20 | ⬜ |
| S-82 | `status` de tool desconhecido: o card fica no estado anterior e a linha diz o valor; no app, o evento não some (U-07) | err | unit | — | B-20 | ⬜ |
| S-83 | evento conhecido sem campo obrigatório: `warn` no log do cliente e a linha `malformed` (U-09) | err | unit | — | B-20 | ⬜ |
| S-84 | app: o histórico com um evento desconhecido mostra a linha, não descarta (U-10) | err | unit | — | B-20 | ⬜ |
| S-85 | `kind` de aviso desconhecido e o `kind: 'unknown'`: a linha genérica, com o `text` ao abrir (U-11) | err | unit, widget | — | B-20 | ⬜ |
| S-86 | dez `unknown` iguais em sequência: uma linha "×10" | fron | unit | — | B-20 | ⬜ |
| S-87 | `unknown` A, B, A intercalados: três linhas, o contador não junta o que não é sequência | est | unit | — | B-20 | ⬜ |
| S-88 | a linha de compactação com o "ver resumo" dobrado, e o resumo em markdown ao abrir (paridade) | eq | unit, widget | — | B-21 | ⬜ |
| S-89 | `compact-turn`: nenhum balão "Você" que a pessoa não escreveu, nas duas pontas | eq | unit | — | B-21 | ⬜ |
| S-90 | duas compactações: duas linhas, uma por `compactionId`, no web e no app | fron | unit | — | B-21 | ⬜ |
| S-91 | `skill-turn`: a linha dobrada "*x* carregada" (`injected.kind: 'instructions'`, com o `name`) sob o card da tool dona, escolhida pelo `injected.kind` e nunca pelo nome da tool | eq | unit, widget | — | B-21 | ⬜ |
| S-92 | `project-command-turn`: o prompt aparece como `/comando args`, ao vivo e no histórico | eq | unit | — | B-21 | ⬜ |
| S-93 | a imagem do resultado no card da tool, buscada pela rota, com o zoom do app | eq | widget | — | B-22 | ⬜ |
| S-94 | imagem do resultado que não carrega: o texto alternativo, sem quebrar o card | err | widget | `404 NOT_FOUND` da rota | B-22 | ⬜ |
| S-95 | anexo `link` com `https:` vira link com confirmação; com `javascript:` ou `data:`, só texto | err | unit, widget | — | B-22 | ⬜ |
| S-96 | tool `denied` mostra o motivo, nas duas pontas | eq | unit, widget | — | B-22 | ⬜ |
| S-97 | turno com `outcome: 'failed'`: a linha do turno em erro e o aviso `turn.failed` | est | unit, widget | — | B-23 | ⬜ |
| S-98 | `message.retracted` remove a resposta recusada, ao vivo, no replay e no histórico | est | unit | — | B-23 | ⬜ |
| S-99 | a mesma retirada duas vezes, e uma com id desconhecido: nada muda na segunda, nada quebra | idem | unit | — | B-23 | ⬜ |
| S-100 | a retirada chega antes do `message.completed` que retira: a mensagem nunca aparece | conc | unit | — | B-23 | ⬜ |
| S-101 | um aviso entre os deltas de uma resposta: a resposta continua um bloco só | conc | unit | — | B-23 | ⬜ |
| S-102 | `docs:check`, `render:check` e `i18n-check` verdes com o 05 na regra nova, cada elemento como `ok` e as chaves pareadas | eq | unit | — | B-24 | ⬜ |

## E2E — B-25…B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-103 | pelo web: `/compact` sem balão fantasma e com o resumo, comando local, hook que falha, imagem MCP no card, `resource_link` em texto, tool negada, a linha da variante inventada; e o mesmo ao reabrir pelo histórico | eq | e2e | — | B-25 | ⬜ |
| S-104 | o mesmo roteiro pelo app, e ao reabrir pelo histórico | eq | e2e | — | B-26 | ⬜ |
| S-105 | `smoke-live`: a sintética e o eco do `/compact`, e o `local_command_output`, com a forma que as fixtures assumem | eq | e2e (live) | — | B-27 | ⬜ |
| S-106 | `smoke-live`: os subtipos de `system` com `includeSystemMessages` e onde chega o `systemMessage` de hook | eq | e2e (live) | — | B-27 | ⬜ |
| S-107 | a skill de usuário e a tool MCP com imagem do plano 13 passam na paridade de conteúdo do plano 26 | eq | integração | — | B-28 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| A forma medida (B-01, B-02) | fron, est, conc, idem | o spike mede uma conversa por sonda; repetir a medição é o `smoke-live` (S-105, S-106) |
| A lista de calados (B-03, B-04) | fron, est, conc, idem | é uma classificação estática, gerada do schema; o comportamento não muda nesta fase |
| O vocabulário canônico (B-07) | fron, est, conc, idem | entradas no vocabulário e casos nos testes do portão do plano 28, que leem schema sem estado nem entrada variável |
| O `switch` exaustivo (B-08) | fron, est, conc, idem | o destino é estático por variante; o comportamento de cada uma está nas B-09…B-13 |
| A leitura com mensagens de sistema (B-16) | err, est, conc | os erros de leitura (`AGENT_UNAVAILABLE`, `AGENT_TIMEOUT`, os nomes neutros do plano 28) não mudam e já são cobertos pelo plano 22 |
| A regra no 05 e a paridade (B-24) | todas menos eq | documento e mapa; os checks são a única verificação |
| E2E (B-25…B-28) | fron, err, est, conc, idem | os casos de borda são das fases; o e2e prova o caminho pela porta do usuário |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
