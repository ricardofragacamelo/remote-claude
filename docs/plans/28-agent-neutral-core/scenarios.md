# Plano 28 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Semente: a [discovery §12](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#12-matriz-de-cenários-semente).

---

## Normas — B-01…B-03

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | o ADR-025 existe, e o 001, 006, 011, 013, 018 e 022 têm a nota que aponta para ele; o `docs:check` acha as âncoras | eq | unit | — | B-01 | ⬜ |
| S-02 | um link para uma âncora de ADR que a nota renomeou reprova o `docs:check` | err | unit | link quebrado | B-01 | ⬜ |
| S-03 | o AGENTS tem a regra 12, o roteador para `12-engines.md` e os anti-padrões novos, e o `docs:check` não acha órfão | eq | unit | — | B-02 | ⬜ |
| S-04 | o `12-engines.md` está no índice do `shared/` e no roteador; os documentos de estrutura marcam a forma-alvo com a fase | eq | unit | — | B-03 | ⬜ |

## O portão de neutralidade — B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-05 | nome de ferramenta do Claude num literal de `web/src/features/` reprova, com arquivo, linha, termo e motivo | err | unit | violação nova | B-04 | ⬜ |
| S-06 | o mesmo literal em `web/src/engines/claude/` passa | eq | unit | — | B-04 | ⬜ |
| S-07 | `claude` numa chave ou num `enum` de schema do contrato reprova; dentro de `origin.native` (valor) passa | eq | unit | violação nova | B-04 | ⬜ |
| S-08 | "Claude" no **valor** de uma chave de i18n do núcleo reprova; `{agent}` passa | err | unit | violação nova | B-04 | ⬜ |
| S-09 | os nomes do produto (`remote-claude`, `remote_claude`, `RemoteClaudeApp`, bundle id) passam pela lista permanente, cada um com o motivo; um nome fora dela reprova | fron | unit | violação nova | B-04 | ⬜ |
| S-10 | código gerado (`protocol.ts`, `protocol.g.dart`), testes e fixtures gravadas não são lidos | fron | unit | — | B-04 | ⬜ |

## O baseline — B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-11 | violação que está no baseline passa; a mesma violação num arquivo novo reprova | eq | unit | violação nova | B-05 | ⬜ |
| S-12 | entrada do baseline que não ocorre mais reprova, até sair do arquivo | est | unit | entrada vencida | B-05 | ⬜ |
| S-13 | entrada cuja fase está ✅ no `progress.md` reprova | est | unit | fase fechada | B-05 | ⬜ |
| S-14 | baseline vazio com o núcleo limpo passa; baseline com uma entrada só passa | fron | unit | — | B-05 | ⬜ |
| S-15 | rodar o `neutral:check` duas vezes não muda o baseline | idem | unit | — | B-05 | ⬜ |
| S-16 | duas violações na mesma linha contam como duas entradas, cada uma com o termo | fron | unit | — | B-05 | ⬜ |

## O lint dos três anéis — B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-17 | `backend/src/application/` importando `*/engines/claude/` reprova o `lint:arch` | err | unit | `engine-extension-is-isolated` | B-06 | ⬜ |
| S-18 | `infrastructure/modules/engines/claude.module.ts` importando a extensão passa | eq | unit | — | B-06 | ⬜ |
| S-19 | `engines/<a>/` importando `engines/<b>/` reprova, no backend e no web | err | unit | `engines-do-not-know-each-other` | B-06 | ⬜ |
| S-20 | `web/src/features/` importando `web/src/engines/` reprova; `web/src/app/engines.ts` passa | eq | unit | `core-cannot-import-engines` | B-06 | ⬜ |
| S-21 | `mobile/lib/features/` importando `mobile/lib/engines/` reprova pelo `scripts/mobile.mjs arch` (o `import_lint` sai 0 e o script não) | err | unit | `features_cannot_import_engines` | B-06 | ⬜ |
| S-22 | um adapter importando arquivo interno de outro adapter reprova, exceto os 2 conhecidos com prazo na F5 | fron | unit | `adapters-do-not-know-each-other` | B-06 | ⬜ |

## Os planos seguintes — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-23 | cada plano ajustado (12, 13, 14, 15, 16, 18, 19, 26, 27) tem a decisão ✅ do ajuste e a dependência no README; o `plan progress` passa | eq | unit | — | B-07 | ⬜ |
| S-24 | os nomes de documento, caminho e rota que os planos ajustados citam existem como as normas da F0 os escreveram; o `docs:check` passa | eq | unit | — | B-07 | ⬜ |

## Domínio `engine` e erros — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-25 | `ConversationRef` com motor habilitado e id válido para o motor é aceito; com motor desconhecido é recusado | eq | unit | `INVALID_INPUT` | B-08 | ⬜ |
| S-26 | o CLI que não responde vira `AGENT_TIMEOUT` (504) com `params.engine`, e o que morre vira `AGENT_UNAVAILABLE` (502), nas duas pontas traduzido | err | integração | `AGENT_TIMEOUT`, `AGENT_UNAVAILABLE` | B-08 | ⬜ |
| S-27 | pedir uma capacidade que o motor não tem devolve `ENGINE_CAPABILITY_UNAVAILABLE` (409), nunca 500 nem `undefined` | err | unit | `ENGINE_CAPABILITY_UNAVAILABLE` | B-08 | ⬜ |

## A porta e o registro — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-28 | `RC_ENGINES_ENABLED` vazio, com um motor e com motor desconhecido: o boot sobe, sobe e recusa, respectivamente | fron | integração | configuração inválida | B-09 | ⬜ |
| S-29 | o `SessionEvent` tipado: emitir um evento fora da união quebra o `tsc` | err | unit | erro de tipo | B-09 | ⬜ |
| S-30 | dois `describe()` concorrentes com um `start` não abrem processo a mais nem gastam cota | conc | integração | — | B-09 | ⬜ |

## O adapter no lugar novo — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-31 | o SDK importado fora de `adapter/outbound/engines/claude/` reprova; o caminho antigo também | err | unit | `sdk-is-isolated` | B-10 | ⬜ |
| S-32 | a asserção de segurança continua recusando sessão sem `settingSources: ['project']` ou sem o `PreToolUse` | err | unit | asserção | B-10 | ⬜ |

## A conversa nas portas e no banco — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-33 | a migration copia `claude_session_id` para `(engine, conversation_id)` nas três tabelas, com a contagem conferida | est | integração | — | B-11 | ⬜ |
| S-34 | a migration rodada duas vezes não duplica nem sobrescreve | idem | integração | — | B-11 | ⬜ |
| S-35 | o desfazer de uma conversa gravada **antes** da migration continua achando os checkpoints | est | integração | — | B-11 | ⬜ |

## O contrato em `v+1` — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-36 | `session.started` em `v+1` leva `engine`, `conversation` e `capabilities`; em `v-1` leva também o `claudeSessionId` | eq | integração | — | B-12 | ⬜ |
| S-37 | um cliente em `v` e outro em `v+1` na mesma sessão recebem cada um a sua forma | conc | integração | — | B-12 | ⬜ |
| S-38 | `GET /transcripts/:engine/:id/messages` e a rota antiga (`v-1`) devolvem o mesmo conteúdo; motor desabilitado é 404 | eq | integração | `NOT_FOUND` | B-12 | ⬜ |

## Web e app pela conversa — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-39 | o reload depois de um `gap`, a retomada e o fork usam a `conversation`, no web e no app | est | integração | — | B-13 | ⬜ |
| S-40 | o "copiar id" da sessão copia o id da conversa, e o texto diz o motor | eq | unit | — | B-13 | ⬜ |

## O classificador — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-41 | cada ferramenta nativa do Claude da tabela vira o `kind`, o `label` e o `subject` esperados | eq | unit | — | B-14 | ⬜ |
| S-42 | nome fora da tabela vira `other`, com o nome no `label` como texto, e pede permissão mesmo com regra larga | err | unit | — | B-14 | ⬜ |
| S-43 | `mcp__srv__tool` vira `kind: 'mcp'` com `subject.server` e `subject.tool`; `mcp__` sem servidor vira `other` | fron | unit | — | B-14 | ⬜ |
| S-44 | `Edit` sem `old_string` e `MultiEdit` com lista vazia viram `changes` vazio, sem lançar | fron | unit | — | B-14 | ⬜ |
| S-45 | o catálogo da instalação anuncia uma ferramenta que a tabela não tem: o teste reprova | err | unit | nome sem destino | B-14 | ⬜ |

## O contrato da ferramenta — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | `tool.started` e `permission.requested` levam `kind`, `label`, `subject`, `changes`, `origin` e `rawInput`, e o guard gerado os confere nas duas pontas | eq | unit | — | B-15 | ⬜ |
| S-47 | o histórico de uma conversa mostra a ferramenta igual ao ao vivo | eq | integração | — | B-15 | ⬜ |
| S-48 | `tool.progress` não tem mais o nome nativo; o cliente monta o texto pelo rótulo | eq | unit | — | B-15 | ⬜ |

## O domínio pelo `kind` — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-49 | o risco de cada `kind` é o mesmo que o nome nativo dava antes (tabela comparada) | eq | unit | — | B-16 | ⬜ |
| S-50 | o diff sobre `FileChange` dá o mesmo resultado que o diff sobre o input do `Edit`, do `MultiEdit` e do `Write` | eq | unit | — | B-16 | ⬜ |
| S-51 | o desfazer guarda os caminhos dos `changes`; `shell` continua fora, como hoje | eq | integração | — | B-16 | ⬜ |
| S-52 | a auditoria de um `file.read` mostra só caminho e intervalo, como o `Read` hoje | eq | unit | — | B-16 | ⬜ |

## O diff pelo backend — B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-53 | o diff de um pedido pendente sai da rota, contra o disco, igual à prévia que o web calculava | eq | integração | — | B-17 | ⬜ |
| S-54 | diff de `kind` sem `changes` é recusado | err | integração | `DIFF_NOT_APPLICABLE` | B-17 | ⬜ |

## O web pelo `kind` — B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-55 | o `ToolRow` e o card de permissão desenham o `label` traduzido, e o mesmo texto de antes para cada ferramenta do Claude | eq | unit | — | B-18 | ⬜ |
| S-56 | `kind` desconhecido desenha a linha genérica com a entrada exata, sem quebrar | err | unit | — | B-18 | ⬜ |
| S-57 | o `render:check` reprova um `kind` novo sem par no app | err | unit | sem par | B-18 | ⬜ |

## O app pelo `kind` — B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-58 | o `ToolCard` e o card de permissão desenham o mesmo `label` que o web, pelo par do `i18n-shared.json` | eq | unit | — | B-19 | ⬜ |
| S-59 | `kind` desconhecido no app desenha a linha genérica | err | unit | — | B-19 | ⬜ |
| S-60 | "Rodando …" no topo da sessão usa o rótulo, nunca o nome nativo | eq | unit | — | B-19 | ⬜ |

## A interação `plan` — B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-61 | o plano chega como `interaction.kind: 'plan'` com o markdown, e o card é o mesmo nas duas pontas | eq | integração | — | B-20 | ⬜ |
| S-62 | aprovar o plano e escolher o modo seguinte troca o modo canônico, e o motor recebe o seu | est | integração | — | B-20 | ⬜ |
| S-63 | o plano aprovado no web e no app ao mesmo tempo é resolvido uma vez | conc | integração | `PERMISSION_REQUEST_NOT_FOUND` (o segundo) | B-20 | ⬜ |

## Pergunta e subagent — B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-64 | a pergunta é reconhecida pelo `kind`, ao vivo e no histórico, e as respostas continuam as do 24 | eq | integração | — | B-21 | ⬜ |
| S-65 | o subagent aninha pelo `kind` `agent` e pelo `parentToolUseId`, nas duas pontas | eq | unit | — | B-21 | ⬜ |

## A lista de tarefas — B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-66 | cada `TodoWrite`/`TaskCreate`/`TaskUpdate` emite um `session.tasksChanged` com a lista inteira, nos estados canônicos | eq | unit | — | B-22 | ⬜ |
| S-67 | o replay e o histórico repetem o evento sem duplicar tarefas | idem | integração | — | B-22 | ⬜ |
| S-68 | motor sem `taskList`: a faixa não existe | fron | unit | — | B-22 | ⬜ |

## A compactação — B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-69 | `session.compact` no Claude compacta, e o `session.compacted` chega | eq | integração | — | B-23 | ⬜ |
| S-70 | `session.compact` num motor sem `compaction` é recusado, e o botão não existe | err | integração | `ENGINE_CAPABILITY_UNAVAILABLE` | B-23 | ⬜ |

## O contexto — B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-71 | as categorias do Claude viram os ids canônicos com chave, e a desconhecida vem com o texto | eq | unit | — | B-24 | ⬜ |
| S-72 | motor sem `contextUse`: a rota recusa e o medidor não existe | err | integração | `ENGINE_CAPABILITY_UNAVAILABLE` | B-24 | ⬜ |

## A origem da mudança — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-73 | a escrita do agente chega como `origin: 'agent'` com o `engine`, e o editor reage como hoje | eq | integração | — | B-25 | ⬜ |
| S-74 | a escrita da pessoa e a externa não mudam | eq | integração | — | B-25 | ⬜ |
| S-75 | duas escritas do agente no mesmo arquivo em sequência rápida continuam atribuídas ao agente | conc | integração | — | B-25 | ⬜ |
| S-76 | o leitor do app mostra a faixa "o agente está escrevendo" pela origem nova | eq | unit | — | B-25 | ⬜ |

## Os modos — B-26, B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-77 | cada modo canônico ↔ o modo do CLI, nas duas direções | eq | unit | — | B-26 | ⬜ |
| S-78 | `readOnly`: o gate nega `file.edit`, `file.write`, `file.delete`, `file.move` e `shell`, mesmo que o motor ache que pode | err | integração | negado pelo gate | B-26 | ⬜ |
| S-79 | `bypassPermissions` num `session.start` é recusado em `v+1` e em `v-1` | err | integração | `INVALID_INPUT` | B-26 | ⬜ |
| S-80 | a migration troca a `CHECK` e os valores gravados em `claude_defaults`; rodada duas vezes, não muda nada | idem | integração | — | B-26 | ⬜ |
| S-81 | os clientes oferecem só os modos de `capabilities.permissionModes`; motor com um modo só esconde o seletor | fron | unit | — | B-27 | ⬜ |
| S-82 | o modo guardado com o valor antigo (`default`, `plan`) é lido como `ask`, `readOnly` | est | unit | — | B-27 | ⬜ |

## Esforço — B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-83 | o seletor mostra só os níveis de `effortLevels`; sem a capacidade, não existe | fron | unit | — | B-28 | ⬜ |
| S-84 | nível fora do anunciado é recusado no `session.start` | err | integração | `INVALID_INPUT` | B-28 | ⬜ |

## Uso — B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-85 | o `usage` canônico tem os mesmos números que o mapa da Anthropic dava | eq | unit | — | B-29 | ⬜ |
| S-86 | `turn.completed` sem `costUsd` e com `usage` vazio desenha o turno sem custo, sem quebrar | fron | unit | — | B-29 | ⬜ |
| S-87 | custo zero é mostrado como zero, e não como ausente | fron | unit | — | B-29 | ⬜ |

## Blocos — B-30

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-88 | `redactedThinking`, `toolUse` e `toolResult` desenham o mesmo que os nomes antigos, ao vivo e no histórico | eq | unit | — | B-30 | ⬜ |
| S-89 | motor sem `thinking` não emite o bloco, e o cliente não reserva espaço para ele | fron | unit | — | B-30 | ⬜ |
| S-90 | bloco de tipo desconhecido segue a regra do 27 (aparece, não some) | err | unit | — | B-30 | ⬜ |

## O dialeto — B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-91 | cada regra gravada antes da F5, migrada para a gramática canônica, casa com as mesmas invocações de antes (tabela das regras do 03 e do 23) | eq | integração | — | B-31 | ⬜ |
| S-92 | os alcances exato, prefixo e tool do 23 saem iguais pelo `reachesFor` | eq | unit | — | B-31 | ⬜ |
| S-93 | padrão fora da gramática canônica (inclusive a forma antiga do Claude, `Bash(…)`) é recusado com o motivo | err | unit | `PERMISSION_RULE_PATTERN_INVALID` | B-31 | ⬜ |
| S-94 | regra restrita a um motor (`engine`) não casa com outro; a regra canônica sem `engine` casa em todo motor com o `kind` | fron | unit | — | B-31 | ⬜ |

## A interação fora das regras — B-32

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-95 | `question` e `plan` nunca são respondidas por regra nem por `allowAll`; gravar regra para elas é recusado | err | integração | `PERMISSION_RULE_TOOL_INTERACTIVE` | B-32 | ⬜ |
| S-96 | a precedência em `readOnly` é a mesma que era em `plan` | eq | unit | — | B-32 | ⬜ |

## O banco da permissão — B-33

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-97 | as regras existentes, convertidas, ficam com `engine` nulo (valem para todo motor com o `kind`), e a trilha antiga ganha o `tool_kind` pelo classificador | est | integração | — | B-33 | ⬜ |
| S-98 | o preenchimento rodado duas vezes não muda nada | idem | integração | — | B-33 | ⬜ |
| S-99 | linha antiga com nome que o classificador não conhece fica `other` | fron | integração | — | B-33 | ⬜ |

## Adapters e segurança — B-34, B-35

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-100 | `/diag/versions` lista o `describe()` do Claude com as mesmas versões de antes | eq | integração | — | B-34 | ⬜ |
| S-101 | o pedido resolvido no web libera o `canUseTool` pela porta, como antes | eq | integração | — | B-34 | ⬜ |
| S-102 | motor registrado sem a asserção de segurança não sobe: fica `unavailable` com o motivo, e os outros sobem | err | integração | motor indisponível | B-35 | ⬜ |
| S-103 | os arquivos de configuração de cada motor registrado entram nos sensíveis | eq | unit | — | B-35 | ⬜ |

## O `claude-config` dividido — B-36, B-37

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-104 | os padrões gravados em `claude_defaults` aparecem em `/engines/claude/defaults` iguais | est | integração | — | B-36 | ⬜ |
| S-105 | a rota antiga `/claude/defaults` responde igual em `v-1` e some no fim da janela | est | integração | — | B-36 | ⬜ |
| S-106 | o `claude.defaultsChanged` gravado é lido com o kind novo pela migration, e nenhum kind da trilha tem nome de motor (os da extensão são `engine.*`, com o motor no payload) | est | integração | — | B-36 | ⬜ |
| S-107 | `/engines/test/plugins` (motor sem a extensão) é 404 | err | integração | `NOT_FOUND` | B-36 | ⬜ |
| S-108 | o diagnóstico mostra uma linha por motor registrado | eq | integração | — | B-37 | ⬜ |
| S-109 | o modelo padrão é por motor: o do Claude não vale para o motor de teste | fron | unit | — | B-37 | ⬜ |

## O web isolado — B-38, B-39

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-110 | as seções do Claude aparecem na configuração pelo registro da extensão; sem ela registrada, a tela do núcleo funciona | eq | unit | — | B-38 | ⬜ |
| S-111 | o endereço antigo `/claude-settings` leva à seção nova | est | e2e | — | B-38 | ⬜ |
| S-112 | o atalho que a pessoa gravou num comando `claude.*` continua valendo no `agent.*` | est | unit | — | B-39 | ⬜ |
| S-113 | o texto do núcleo diz o `displayName` do motor da sessão, em `en` e `pt-BR` | eq | unit | — | B-39 | ⬜ |
| S-114 | o `i18n:check` reprova chave do núcleo sem o par do app | err | unit | par faltando | B-39 | ⬜ |

## O app isolado — B-40

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-115 | o texto do app diz o `displayName` do motor, nas duas línguas | eq | unit | — | B-40 | ⬜ |
| S-116 | o `engines/` vazio do app não muda o build, e o lint continua reprovando o import | fron | unit | — | B-40 | ⬜ |

## O que sobra — B-41, B-42

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-117 | o log de borda do motor leva `op: engine.*`, `engine` e `engineVersion` | eq | integração | — | B-41 | ⬜ |
| S-118 | nenhum documento normativo diz mais "alvo do plano 28" | eq | unit | — | B-42 | ⬜ |
| S-119 | o baseline só tem entradas da F7 ao fechar a F6 | est | unit | — | B-42 | ⬜ |

## O motor de teste — B-43

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-120 | a suíte de contrato da porta passa contra o adapter do Claude e contra o motor de teste | eq | integração | — | B-43 | ⬜ |
| S-121 | o motor de teste nunca é registrado no build de produção | err | unit | — | B-43 | ⬜ |
| S-122 | uma sessão do Claude e uma do motor de teste ao mesmo tempo, na mesma pasta, não se misturam | conc | integração | — | B-43 | ⬜ |

## E2E — B-44…B-46

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-123 | web: uma conversa no motor de teste desenha cada `kind` igual ao do Claude, e a permissão é aprovada pela mesma tela | eq | e2e | — | B-44 | ⬜ |
| S-124 | web: no motor de teste, os controles sem capacidade não existem, e nenhuma tela do núcleo diz "Claude" | fron | e2e | — | B-44 | ⬜ |
| S-125 | app: a mesma conversa do S-123, no emulador | eq | e2e | — | B-45 | ⬜ |
| S-126 | app: os controles sem capacidade não existem, e o texto diz "Test agent" | fron | e2e | — | B-45 | ⬜ |
| S-127 | todos os e2e de hoje, do web e do app, verdes sem mudar cenário | eq | e2e | — | B-46 | ⬜ |
| S-128 | o `smoke-live` contra o Claude real: as formas canônicas saem do CLI instalado | eq | e2e | — | B-46 | ⬜ |

## Fim da janela — B-47

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-129 | com o baseline vazio, qualquer violação nova no núcleo reprova o portão 11 | err | unit | violação nova | B-47 | ⬜ |
| S-130 | fechada a janela, um cliente em `v` recebe o fechamento de versão do handshake, e a migration remove `claude_session_id` | est | integração | `4426` | B-47 | ⬜ |

## A gramática canônica e a migração das regras — B-31, B-33

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-131 | `shell(npm test:*)` casa com o `shell` do Claude e com o do motor de teste, e não casa com `file.edit` | eq | unit | — | B-31 | ⬜ |
| S-132 | o `toEngine` do dialeto do Claude manda ao SDK o mesmo `updatedPermissions` que a regra antiga mandava; a sugestão nativa vem convertida pelo `fromNative`, e a sem tradução é descartada com `warn` | eq | integração | — | B-31 | ⬜ |
| S-133 | a migration converte toda regra traduzível, desliga a que não tem tradução inequívoca (com o padrão antigo e o motivo) e a tela de regras a lista; ativas antes = convertidas + desligadas | est | integração | — | B-33 | ⬜ |
| S-134 | a migration das regras rodada duas vezes não muda nada | idem | integração | — | B-33 | ⬜ |

## O REST no pacote — B-48

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-135 | uma rota do backend sem schema em `schema/http/`, ou um schema sem rota, reprova o `contracts:check` | err | unit | contrato dessincronizado | B-48 | ⬜ |
| S-136 | o web e o app leem as respostas REST pelos tipos gerados, e nenhum tipo de resposta é escrito à mão | eq | unit | — | B-48 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| As normas (B-01…B-03) | `conc`, `idem`, `est` | são documentos conferidos pelo `docs:check`, que não tem estado nem concorrência; rodar duas vezes é o S-15 do portão |
| O lint (B-06) | `est`, `conc`, `idem` | o lint é uma função pura do código; não guarda estado entre execuções |
| O adapter no lugar novo (B-10) | `est`, `conc`, `idem` | é mudança de caminho; o comportamento é coberto pelos cenários da porta (S-28…S-30) e pela regressão (S-127) |
| O app pelo `kind` (B-19) e o web (B-18) | `conc`, `idem` | desenho de evento, sem estado próprio; a concorrência dos eventos é a do contrato (S-37) |
| Esforço, blocos, contexto (B-24, B-28, B-30) | `conc`, `idem` | leitura de anúncio e de evento, sem escrita nem estado compartilhado |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
