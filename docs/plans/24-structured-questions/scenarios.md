# Plano 24 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Semente: os 45 cenários da [proposta §16](../../discovery/05-perguntas-estruturadas.md#16-matriz-de-cenários-semente),
renumerados, completados com o que o plano 23 trouxe (`reaches`, `HUMAN_ONLY_TOOLS`, Permitir
tudo) e o seguidor do plano 22, e atribuídos a tasks.

---

## Normas e contrato — B-01…B-03

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | as normas emendadas (05, 04, backend/04, web/03, mobile/04) existem, e todo link novo resolve (`pnpm docs:check`) | eq | unit | — | B-01 | ✅ |
| S-02 | o guard gerado aceita `answers` dentro dos limites e recusa `answers` com 5 itens, `selected` com 5 rótulos, `other` com 2001 caracteres ou `questionId` que não é string | fron | unit | `INVALID_INPUT` | B-02 | ✅ |
| S-03 | `interaction` em `permission.requested` e `answers` em `permission.resolve` e `permission.resolved` saem iguais em TypeScript e Dart (`pnpm contracts:check`); os dois códigos novos estão no catálogo de erros das três pontas | eq | unit | — | B-02 | ✅ |
| S-04 | as chaves novas existem em `en` e `pt-BR` no backend (push), no web e no app, e os pares estão no mapa compartilhado (`pnpm i18n:check`) | eq | unit | — | B-03 | ✅ |

## Normalizar — B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-05 | uma pergunta de escolha única vira `interaction` com `id: 'q1'`, `prompt`, `header`, `multiSelect: false` e as opções com `preview: null` | eq | unit | — | B-04 | ✅ |
| S-06 | quatro perguntas de quatro opções (o máximo) viram `q1…q4` na ordem do input | fron | unit | — | B-04 | ✅ |
| S-07 | uma pergunta de duas opções (o mínimo) é aceita | fron | unit | — | B-04 | ✅ |
| S-08 | `prompt`, `header`, `label`, `description` e `preview` acima do `maxLength` são truncados, e não recusados | fron | unit | — | B-04 | ✅ |
| S-09 | 0 perguntas, 5 perguntas, 1 opção, 5 opções ou opção sem rótulo → `malformed: true`, `questions: []` | err | unit | — | B-04 | ✅ |
| S-10 | pergunta sem `options` (o `kind: text` do modo estendido) → `malformed: true` | err | unit | — | B-04 | ✅ |
| S-11 | duas perguntas com o mesmo texto, ou dois rótulos iguais na mesma pergunta → `malformed: true` | err | unit | — | B-04 | ✅ |
| S-12 | o rótulo com "(Recommended)" fica intacto; `input` sem `questions`, ou com `questions` que não é lista → `malformed: true` | eq | unit | — | B-04 | ✅ |

## Validar a resposta — B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-13 | escolha única com um rótulo, escolha múltipla com dois e "Outro" sozinho são aceitos | eq | unit | — | B-05 | ✅ |
| S-14 | escolha múltipla com rótulos e "Outro" juntos é aceita | eq | unit | — | B-05 | ✅ |
| S-15 | `allow` sem `answers` num pedido de pergunta; o pedido continua aberto | err | integração | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-16 | rótulo que não é opção da pergunta; `details[]` diz a regra e a pergunta, e não ecoa o texto enviado | err | unit + integração | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-17 | escolha única com dois rótulos, ou com rótulo e "Outro" | err | unit | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-18 | uma pergunta sem resposta ([D-04](decisions.md#f1--backend)) | err | unit | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-19 | `questionId` que não existe, ou repetido | err | unit | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-20 | `answers` num pedido que não é pergunta (`Bash`) | err | integração | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-21 | `answers` junto com `deny` | err | unit | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-22 | "Outro" só com espaços é recusado; com 2000 caracteres passa | fron | unit + integração | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |
| S-23 | `allow` num pedido `malformed`, ou `allow` sem `answers` de um cliente antigo pelo card genérico → recusado, e o Claude não recebe um "permitido" vazio | err | integração | `PERMISSION_ANSWERS_INVALID` | B-05 | ✅ |

## O pedido de pergunta — B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-24 | o pedido de `AskUserQuestion` sai com `interaction`, `riskHint: 'read'`, `defaultToNo: false`, `suggestions: []`, `reaches: []` e `title: 'permission.tool.AskUserQuestion'`; o de `Bash` sai sem `interaction`, como hoje | eq | unit | — | B-06 | ✅ |
| S-25 | o `expiresAt` de uma pergunta usa `RC_QUESTION_TIMEOUT_MS`, e o de uma permissão continua usando `RC_PERMISSION_TIMEOUT_MS` | eq | unit | — | B-06 | ✅ |
| S-26 | `RC_QUESTION_TIMEOUT_MS` ausente, zero, negativo ou não numérico faz a configuração falhar na subida | err | unit | — | B-06 | ✅ |
| S-27 | estender uma pergunta soma o mesmo passo de hoje, até o mesmo teto de extensões | est | integração | `INVALID_INPUT` no teto, como hoje | B-06 | ✅ |
| S-28 | responder uma pergunta com `scope: 'always'` e `reach: 'tool'` vale como `once`, e nenhuma regra é gravada | eq | integração | — | B-06 | ✅ |

## Regras e perguntas — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-29 | uma regra de allow `AskUserQuestion` já gravada é ignorada, e o humano é perguntado; o `debug` registra que a regra foi ignorada | est | integração | — | B-07 | ✅ |
| S-30 | uma regra de deny `AskUserQuestion` recusa sozinha | eq | integração | — (`DENIED_BY_RULE` na trilha) | B-07 | ✅ |
| S-31 | `POST /permission-rules` com allow `AskUserQuestion` → 422; com deny → 201 | err | integração | `PERMISSION_RULE_TOOL_INTERACTIVE` | B-07 | ✅ |
| S-32 | o mesmo para `ExitPlanMode` ([D-08](decisions.md#f1--backend)) | eq | integração | `PERMISSION_RULE_TOOL_INTERACTIVE` | B-07 | ✅ |
| S-33 | em Permitir tudo, `AskUserQuestion` abre o card de pergunta, com `interaction` (a regressão do 23 · S-11) | eq | unit | — | B-07 | ✅ |
| S-34 | no modo `plan`, a pergunta abre o card de pergunta | eq | unit | — | B-07 | ✅ |

## Resolver com respostas — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-35 | `permission.resolve` com `answers` válidas: o pedido é liquidado, `permission_requests.answers` gravado, e `permission.resolved` leva as `answers` a todas as conexões da sessão | eq | integração | — | B-08 | ✅ |
| S-36 | a linha de decisão da trilha guarda as `answers`; a linha `recorded` continua com o input original | eq | integração | — | B-08 | ✅ |
| S-37 | o `info` `permission.question.answered` traz `requestId`, número de perguntas e se houve "Outro", sem conteúdo; o `debug` traz o conteúdo truncado | eq | integração | — | B-08 | ✅ |
| S-38 | dois clientes respondem ao mesmo tempo com respostas diferentes: a primeira vence, a segunda recebe o `ack` silencioso, e o SDK é chamado uma vez | conc | integração | — | B-08 | ✅ |
| S-39 | a mesma resposta reenviada com o mesmo `requestId` → `ack` silencioso, uma gravação, um veredito | idem | integração | — | B-08 | ✅ |
| S-40 | resposta a uma pergunta vencida se comporta como a de qualquer pedido vencido hoje | est | integração | `PERMISSION_REQUEST_EXPIRED` | B-08 | ✅ |
| S-41 | quem não é dono da sessão não responde | err | integração | `PERMISSION_NOT_OWNED` | B-08 | ✅ |
| S-42 | o replay do `session.attach` reentrega a pergunta pendente com a `interaction`, e a resolvida com as `answers` | est | integração | — | B-08 | ✅ |
| S-43 | uma resposta inválida deixa o pedido aberto; uma válida, logo depois, o liquida | est | integração | `PERMISSION_ANSWERS_INVALID` na primeira | B-08 | ✅ |
| S-44 | a migration adiciona `answers` anulável; linhas antigas são lidas com `answers: null` | fron | integração | — | B-08 | ✅ |
| S-45 | recusar com motivo e sem motivo (o cliente manda a chave padrão) → `deny` chega ao SDK com o texto | eq | integração | — | B-08 | ✅ |

## O veredito chega ao SDK — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | a ponte copia `answers` para o veredito; o runner devolve `updatedInput` com as `questions` e o `metadata` originais e `answers: { [prompt]: rótulo }` | eq | unit | — | B-09 | ✅ |
| S-47 | escolha múltipla vira os rótulos unidos por `", "`; um rótulo que contém `", "` não quebra a tradução | fron | unit | — | B-09 | ✅ |
| S-48 | o "Outro" entra no lugar do rótulo; na múltipla, depois dos rótulos | eq | unit | — | B-09 | ✅ |
| S-49 | uma opção cujo rótulo foi truncado na normalização volta ao SDK com o rótulo **original**, achado pela posição | fron | unit | — | B-09 | ✅ |
| S-50 | no vencimento, o Claude recebe `deny` com a mensagem de "não respondida a tempo" ([D-07](decisions.md#f1--backend)) | est | unit + integração | `PERMISSION_REQUEST_EXPIRED` | B-09 | ✅ |
| S-51 | sessão encerrada com pergunta aberta: o pedido vence, e as conexões recebem `permission.resolved` | est | integração | `PERMISSION_REQUEST_EXPIRED` | B-09 | ✅ |

## Push e estado — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-52 | o push de uma pergunta usa `push.question.*`, em `en` e `pt-BR`, e não leva o texto da pergunta nem das opções | eq | unit | — | B-10 | ✅ |
| S-53 | `GET /sessions/:id/permissions/:requestId` devolve a `interaction` do pendente e as `answers` do resolvido | eq | integração | — | B-10 | ✅ |
| S-54 | `GET` de pergunta vencida → 410; de pergunta inexistente → 404 | err | integração | `PERMISSION_REQUEST_EXPIRED` / `PERMISSION_REQUEST_NOT_FOUND` | B-10 | ✅ |
| S-55 | pergunta dentro de subagente (`parentToolUseId`) vira pedido com `interaction`, e a resposta chega ao SDK | eq | integração | — | B-10 | ✅ |

## Fixtures — B-11, B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-56 | o gravador responde `AskUserQuestion` com a primeira opção de cada pergunta; o `plan-turn` regravado traz "Your questions have been answered" e `tool_use_result.answers` preenchido | eq | unit | — | B-11 | ✅ |
| S-57 | a gravação do `question-turn` falha alto quando o modelo não faz ≥ 2 perguntas, uma múltipla e uma com preview | err | unit | — | B-11 | ✅ |
| S-58 | o `ScriptedQuery` registra o que o `canUseTool` devolveu, e a integração lê `updatedInput.answers` desse registro | eq | integração | — | B-12 | ✅ |
| S-59 | `recorded-fixtures.spec`, `sdk-message.mapper.spec`, `session-runner.spec` e `permission-bridge.spec` passam com as fixtures e o veredito novos | eq | unit | — | B-12 | ✅ |

## Web: dados — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-60 | `toRequest` lê a `interaction`; um pedido sem ela continua no card genérico | eq | unit | — | B-13 | ✅ |
| S-61 | `sendAnswer` envia `answers`; `toOutcome` lê `answers` do resolvido | eq | unit | — | B-13 | ✅ |
| S-62 | o rascunho é guardado por `requestId` e sobrevive à queda do socket e ao replay do `attach` | est | unit + integração | — | B-13 | ✅ |
| S-63 | resolvida em outro cliente enquanto se respondia: o rascunho é descartado e o card vira a linha respondida | conc | integração | — | B-13 | ✅ |

## Web: o card — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-64 | escolha única: radio, marcar limpa o anterior, "Enviar respostas" habilita com uma pergunta | eq | integração | — | B-14 | ✅ |
| S-65 | escolha múltipla: checkbox que alterna, sem avanço | eq | integração | — | B-14 | ✅ |
| S-66 | "Outro" é a última opção, abre o campo com foco; marcado e vazio não conta como resposta | fron | integração | — | B-14 | ✅ |
| S-67 | abas com o `header`, marca de respondida; quatro perguntas de quatro opções cabem em 360 px sem rolagem horizontal (a medida é do e2e, B-23: o jsdom não mede layout) | fron | integração + e2e | — | B-14 | ✅ |
| S-68 | avanço automático na escolha única que não é a última; sem avanço na múltipla e na última | est | integração | — | B-14 | ✅ |
| S-69 | "Enviar respostas" desabilitado até toda pergunta ter resposta | fron | integração | — | B-14 | ✅ |
| S-70 | preview: painel com o markdown seguro da opção em foco, "sem prévia" na opção que não tem, nenhum painel na múltipla; HTML no preview aparece como texto | eq | integração | — | B-14 | ✅ |
| S-71 | a opção "(Recommended)" é destacada e não vem marcada | eq | integração | — | B-14 | ✅ |
| S-72 | "Não responder" abre o motivo opcional; Esc faz o mesmo; vazio manda a chave padrão | eq | integração | — | B-14 | ✅ |
| S-73 | contagem regressiva e "Estender"; no vencimento, o card diz que expirou e descarta o rascunho | est | integração | — | B-14 | ✅ |
| S-74 | teclado: ←/→ trocam de pergunta, ↑/↓ andam nas opções, Enter marca, Ctrl/⌘+Enter envia; `radiogroup`/`group` com `aria-checked`; foco na primeira opção; axe sem violação | eq | integração | — | B-14 | ✅ |
| S-75 | malformada: só a explicação e "Não responder"; enviando: card bloqueado; socket fora: envio liberado e rascunho mantido | err | integração | — | B-14 | ✅ |
| S-76 | pergunta de subagente cuja linha não está desenhada vai para a cauda (`TailRequests`) e é respondida de lá | eq | integração | — | B-14 | ✅ |

## Web: a linha respondida — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-77 | a linha de `AskUserQuestion` mostra cada pergunta com a escolhida marcada, as outras esmaecidas e o texto do "Outro", em vez do JSON | eq | integração | — | B-15 | ✅ |
| S-78 | recusada mostra o motivo; pendente mostra "aguardando resposta"; sem respostas (outro cliente) mostra as perguntas e o `summary` | est | integração | — | B-15 | ✅ |
| S-79 | o rótulo: "Perguntou: {header}" com uma pergunta, "Fez {n} perguntas" com várias | fron | unit | — | B-15 | ✅ |

## Web: avisos — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-80 | `WorkingIndicator` e `PendingPill` dizem "Aguardando sua resposta" para pergunta e o texto de hoje para permissão | eq | integração | — | B-16 | ✅ |
| S-81 | o aviso interno e o do navegador têm a variante de pergunta, sem o texto dela | eq | unit | — | B-16 | ✅ |

## Mobile: dados — B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-82 | o mapper lê `interaction` do pedido e `answers` do resolvido; pedido sem `interaction` continua genérico | eq | unit | — | B-17 | ✅ |
| S-83 | o data source e o repositório enviam `answers` no `permission.resolve` | eq | unit | — | B-17 | ✅ |
| S-84 | o rascunho por `requestId` sobrevive à reconexão e ao replay; resolvida em outro cliente, é descartado | est | unit | — | B-17 | ✅ |
| S-85 | responder não pede biometria ([D-11](decisions.md#f4--mobile)) nem a confirmação em dois passos (`riskHint: 'read'`) | eq | widget | — | B-17 | ✅ |

## Mobile: o card — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-86 | escolha única: radio, e "Enviar respostas" habilita | eq | widget | — | B-18 | ✅ |
| S-87 | escolha múltipla: checkbox que alterna, sem avanço | eq | widget | — | B-18 | ✅ |
| S-88 | "Outro" abre o campo com foco; marcado e vazio não conta | fron | widget | — | B-18 | ✅ |
| S-89 | várias perguntas em passos: "Pergunta 2 de 3", Voltar e Próxima, marca de respondida; quatro perguntas de quatro opções cabem numa tela de 360 dp | fron | widget | — | B-18 | ✅ |
| S-90 | avanço automático na escolha única que não é a última, com Voltar sempre à vista | est | widget | — | B-18 | ✅ |
| S-91 | "Enviar respostas" desabilitado até toda pergunta ter resposta | fron | widget | — | B-18 | ✅ |
| S-92 | "Ver prévia" abre uma folha com o preview em monoespaçado; sem botão na múltipla | eq | widget | — | B-18 | ✅ |
| S-93 | "Não responder" com motivo opcional; contagem, "Estender" e expiração como no card de permissão; malformada mostra só a recusa | est | widget | — | B-18 | ✅ |
| S-94 | a chegada pelo push abre a tela de permissão com o card de pergunta em tela cheia; resolvida mostra as respostas; 410 e 404 como hoje | est | widget | — | B-18 | ✅ |

## Mobile: a linha respondida e os avisos — B-19, B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-95 | o `tool_card` de `AskUserQuestion` mostra as respostas em vez do mapa cru; recusada mostra o motivo | eq | widget | — | B-19 | ✅ |
| S-96 | o rótulo da tool: a chave nova, "Perguntou: {header}" ou "Fez {n} perguntas" | fron | unit | — | B-19 | ✅ |
| S-97 | o indicador da sessão diz "Aguardando sua resposta" para pergunta | eq | widget | — | B-20 | ✅ |

## Histórico — B-21, B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-98 | reabrir uma sessão traz a linha de `AskUserQuestion` com as `answers` do banco, casadas pelo `toolUseId` | eq | integração | — | B-21 | ✅ |
| S-99 | sessão respondida fora do produto (sem linha nossa): perguntas e `summary`, sem quebra | eq | integração | — | B-21 | ✅ |
| S-100 | o seguidor do plano 22 entrega a linha com as `answers` quando a pergunta foi respondida aqui | eq | integração | — | B-21 | ✅ |
| S-101 | pergunta recusada ou vencida aparece como tal no histórico, com o motivo | est | integração | — | B-21 | ✅ |
| S-102 | o web desenha a linha respondida a partir do histórico, igual à ao vivo | eq | integração | — | B-22 | ✅ |
| S-103 | o app desenha a linha respondida a partir do histórico, igual à ao vivo | eq | widget | — | B-22 | ✅ |

## E2E — B-23…B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-104 | web, `question-turn`: escolha única, múltipla e "Outro" respondidas pelo card; a linha da tool mostra as respostas e o turno continua | eq | e2e | — | B-23 | ✅ |
| S-105 | web: "Não responder" com motivo; a linha mostra a recusa | eq | e2e | — | B-23 | ✅ |
| S-106 | web: a pergunta vence com prazo curto de teste; o card diz que expirou | est | e2e | — | B-23 | ✅ |
| S-107 | web, dois contextos do mesmo usuário: um responde, o outro troca o card pela linha respondida | conc | e2e | — | B-23 | ✅ |
| S-108 | `claude-panel-changes` responde o `AskUserQuestion` do `plan-turn` pelo card de pergunta | eq | e2e | — | B-23 | ✅ |
| S-109 | app: a pergunta respondida pelos passos chega ao Claude, e a linha mostra as respostas | eq | e2e | — | B-24 | ✅ |
| S-110 | app: recusar; e a pergunta respondida no web aparece respondida no app | conc | e2e | — | B-24 | ✅ |
| S-111 | `pnpm verify:full` e `pnpm test:e2e:mobile` saem com 0 | eq | e2e | — | B-25 | ⛔ |

---

## Dimensões sem cenário

Nenhuma. `idem` tem um só cenário próprio (S-39) porque a idempotência é a de qualquer pedido de
permissão, já coberta pelo plano 03; o que muda aqui é só o corpo da resposta.
