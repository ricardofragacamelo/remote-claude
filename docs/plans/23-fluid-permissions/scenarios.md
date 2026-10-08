# Plano 23 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Normas e contrato — B-01…B-03

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | a ADR-022 e as normas emendadas existem, e todo link novo resolve (`pnpm docs:check`) | eq | unit | — | B-01 | ✅ |
| S-02 | os schemas aceitam `allowAll` em `session.start`, `session.setPermissionMode` e `session.started`, e recusam um modo fora da lista | eq | unit | `INVALID_INPUT` | B-02 | ✅ |
| S-03 | `reaches` em `permission.requested`, `reach` em `permission.resolve` e `via` em `permission.resolved` saem iguais em TypeScript e Dart (`pnpm contracts`); `reach` fora de `exact`/`prefix`/`tool` é recusado pelo guard | eq | unit | `INVALID_INPUT` | B-02 | ✅ |
| S-04 | as chaves novas existem em `en` e `pt-BR` no web e no app, e os pares estão no mapa compartilhado (`pnpm i18n:check`) | eq | unit | — | B-03 | ✅ |

## O modo no domínio e no SDK — B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-05 | `allowAll` é um modo conhecido; `isPermissionMode('allowall')` é falso | fron | unit | — | B-04 | ✅ |
| S-06 | uma sessão aberta em `allowAll` chega ao SDK com `permissionMode: 'default'`, e `allowDangerouslySkipPermissions` segue `false` | eq | unit | — | B-04 | ✅ |
| S-07 | trocar para `allowAll` chama `setPermissionMode('default')` no SDK; a entidade guarda `allowAll` | eq | unit | — | B-04 | ✅ |
| S-08 | `default`, `acceptEdits` e `plan` chegam ao SDK como são, na abertura e na troca | eq | unit | — | B-04 | ✅ |

## Aprovação automática — B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-09 | em `allowAll`, um `Bash` sem regra é aprovado sem card e sem push; sai `permission.resolved` com `auto: true`, `via: 'allowAll'` e `resolvedBy` do dono | eq | integração | — | B-05 | ✅ |
| S-10 | em `allowAll`, `Edit`, `Write`, `WebFetch`, `WebSearch` e uma tool MCP são aprovadas sozinhas | eq | unit | — | B-05 | ✅ |
| S-11 | em `allowAll`, `AskUserQuestion` abre o card como em `default` | eq | unit | — | B-05 | ✅ |
| S-12 | em `allowAll`, `ExitPlanMode` abre o card como em `default` | eq | unit | — | B-05 | ✅ |
| S-13 | em `allowAll`, um `deny` que casa recusa, com a razão de regra | eq | unit | — | B-05 | ✅ |
| S-14 | em `allowAll`, `ls && rm -rf x` com `deny Bash(rm:*)` é recusado | eq | unit | — | B-05 | ✅ |
| S-15 | a ordem é idempotência → regras → modo: um `allow` de regra que casa responde com `via: 'rule'` mesmo em `allowAll` | eq | unit | — | B-05 | ✅ |
| S-16 | a leitura das regras persistidas falha em `allowAll`: o card abre, nada é aprovado (D-12) | err | unit | — | B-05 | ✅ |
| S-17 | o pedido de `allowAll` vira linha em `permission_requests` com `auto = true`, `decision = allow`, `rule_id` nulo e `resolved_by` do dono | eq | integração | — | B-05 | ✅ |
| S-18 | o modo é o do **momento do pedido**: o mesmo pedido lido com `default` e com `allowAll` dá card e aprovação | fron | unit | — | B-05 | ✅ |
| S-19 | o SDK reentrega o mesmo `requestId` em `allowAll`: a mesma resposta, uma execução | idem | unit | — | B-05 | ✅ |
| S-20 | a aprovação por modo é logada em `debug` com `op`, `sessionId`, `requestId` e `toolName`, sem o input | eq | unit | — | B-05 | ✅ |
| S-21 | um pedido de outra sessão, com o mesmo `requestId`, não herda a aprovação por modo | fron | unit | — | B-05 | ✅ |

## Ligar e desligar — B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-22 | `default` → `allowAll` com um `Bash` e um `Edit` pendentes e um `AskUserQuestion`: os dois primeiros resolvem com `via: 'allowAll'`, o terceiro fica | est | integração | — | B-06 | ✅ |
| S-23 | ao ligar, um pendente que um `deny` recusaria é recusado pela regra, não aprovado | est | unit | — | B-06 | ✅ |
| S-24 | `allowAll` → `default`: a próxima tool abre o card | est | integração | — | B-06 | ✅ |
| S-25 | `allowAll` → `plan`: a próxima tool abre o card, e um `allow` de regra também não responde (03 · D-11) | est | unit | — | B-06 | ✅ |
| S-26 | `session.start` com `permissionMode: 'allowAll'`: a primeira tool roda sem card | est | integração | — | B-06 | ✅ |
| S-27 | ligar `allowAll` sem pendentes não publica nada além do `ack` | fron | unit | — | B-06 | ✅ |

## Os handlers — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-28 | `session.setPermissionMode` com modo fora da lista é recusado antes de tocar a sessão | err | integração | `INVALID_INPUT` | B-07 | ✅ |
| S-29 | trocar o modo de uma sessão fechada ou de outro usuário é recusado | err | integração | `SESSION_NOT_FOUND` | B-07 | ✅ |
| S-30 | ligar `allowAll` duas vezes: dois `ack`, nenhuma resolução repetida | idem | integração | — | B-07 | ✅ |
| S-99 | trocar para `allowAll` enquanto um humano responde o mesmo card: uma resolução só, a primeira vence, o loop é liberado uma vez | conc | integração | — | B-06 | ✅ |
| S-100 | dois clientes trocam o modo ao mesmo tempo: a entidade e o SDK terminam no mesmo modo | conc | unit | — | B-07 | ✅ |

## A linha composta — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-31 | `git push 2>&1 \| tail -5` com `allow Bash(git push:*)` e `allow Bash(tail:*)` é aprovado | eq | unit | — | B-08 | ✅ |
| S-32 | `cd /x && pnpm test` com `allow Bash(cd:*)` e `allow Bash(pnpm test:*)` é aprovado | eq | unit | — | B-08 | ✅ |
| S-33 | `git push && curl x` com só `allow Bash(git push:*)` pergunta | fron | unit | — | B-08 | ✅ |
| S-34 | `2>&1`, `1>&2`, `>/dev/null`, `2>/dev/null`, `&>/dev/null` e `2> /dev/null` são neutralizados | fron | unit | — | B-08 | ✅ |
| S-35 | `> out.txt`, `>> log`, `< in.txt`, `2>err.log` continuam perguntando | fron | unit | — | B-08 | ✅ |
| S-36 | `$(…)`, crase, `<(…)`, heredoc e quebra escapada perguntam mesmo com todo pedaço coberto | err | unit | — | B-08 | ✅ |
| S-37 | `git commit -m "a && b"` (aspas desbalanceadas num pedaço) pergunta | fron | unit | — | B-08 | ✅ |
| S-38 | `echo a\\ b && ls` (barra invertida num pedaço de linha composta) pergunta | fron | unit | — | B-08 | ✅ |
| S-39 | `git commit -m "msg" && git push` (aspas balanceadas) com `git commit:*` e `git push:*` é aprovado | eq | unit | — | B-08 | ✅ |
| S-40 | o `allow` exato continua casando só a linha idêntica, e casa um pedaço idêntico de uma linha composta | eq | unit | — | B-08 | ✅ |
| S-41 | `git statusx && ls` não é coberto por `git status:*` e `ls:*` | fron | unit | — | B-08 | ✅ |
| S-42 | um `deny` em qualquer pedaço vence os `allow` dos outros | eq | unit | — | B-08 | ✅ |
| S-43 | em `plan`, uma linha composta coberta pergunta | est | unit | — | B-08 | ✅ |
| S-44 | regras de `session` e `project` cobrindo pedaços diferentes aprovam, e o `ruleId` é o do primeiro pedaço (D-11) | eq | unit | — | B-08 | ✅ |

## Os alcances — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-45 | `git push -u origin x` → `exact` `Bash(git push -u origin x)` e `prefix` `[Bash(git push:*)]` | eq | unit | — | B-09 | ✅ |
| S-46 | `ls -la` → `Bash(ls:*)`; `cat file.txt` → `Bash(cat:*)`; `pnpm test` → `Bash(pnpm test:*)`; `rm build` → `Bash(rm build:*)` | eq | unit | — | B-09 | ✅ |
| S-47 | `git push 2>&1 \| tail -5 && git status` → `prefix` `[Bash(git push:*), Bash(tail:*), Bash(git status:*)]`, sem repetição | eq | unit | — | B-09 | ✅ |
| S-48 | um pedaço com interpretador, lançador ou elevação (`bash -c`, `sh`, `npx x`, `sudo ls`, `python a.py`, `xargs rm`, `pnpm dlx x`) tira o `prefix` | fron | unit | — | B-09 | ✅ |
| S-49 | um pedaço com atribuição de ambiente (`FOO=1 pnpm test`) tira o `prefix` | fron | unit | — | B-09 | ✅ |
| S-50 | uma linha que a B-08 não analisa (substituição, aspas desbalanceadas) só tem `exact` | fron | unit | — | B-09 | ✅ |
| S-51 | `Edit`, `Write`, `Read` e `WebFetch` → `exact` e `tool`; `WebSearch` e tool MCP (sem campo casável) → só `tool` | eq | unit | — | B-09 | ✅ |
| S-52 | `Bash` nunca tem `tool` | eq | unit | — | B-09 | ✅ |
| S-53 | valor com `)` não tem `exact`; o `prefix` existe quando nenhum padrão dele tem `)` | fron | unit | — | B-09 | ✅ |
| S-54 | todo padrão que um alcance devolve é lido de volta igual por `parseRulePattern` | eq | unit | — | B-09 | ✅ |

## A resposta com alcance — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-55 | `permission.requested` traz `reaches`, e `project`/`always` são oferecidos sempre que houver algum alcance | eq | integração | — | B-10 | ✅ |
| S-56 | `session` + `prefix`: uma regra de sessão por padrão, e a linha seguinte coberta não pergunta | eq | integração | — | B-10 | ✅ |
| S-57 | `always` + `prefix` com dois padrões: duas regras persistidas, cada uma na trilha | eq | integração | — | B-10 | ✅ |
| S-58 | `session` + `tool` para `WebSearch`: a próxima `WebSearch` não pergunta | eq | integração | — | B-10 | ✅ |
| S-59 | `reach` que não foi oferecido para este pedido é recusado, e o pedido continua aberto | err | integração | `INVALID_INPUT` | B-10 | ✅ |
| S-60 | `reach` fora do schema é recusado pelo guard | err | integração | `INVALID_INPUT` | B-10 | ✅ |
| S-61 | sem `reach`, vale `exact`; quando não há `exact`, `project`/`always` sem `reach` são recusados como hoje | eq | integração | `INVALID_INPUT` | B-10 | ✅ |
| S-62 | a trilha falha ao gravar o segundo padrão: as regras desta resposta são revogadas e o pedido continua aberto (D-13) | err | unit | — | B-10 | ✅ |
| S-63 | um padrão inválido entre os do alcance faz a resposta ser recusada antes de gravar qualquer um | err | unit | `INVALID_INPUT` | B-10 | ✅ |
| S-64 | a mesma resposta `always` + `prefix` duas vezes não duplica regra | idem | integração | — | B-10 | ✅ |
| S-65 | web e mobile respondem com alcances diferentes ao mesmo tempo: a primeira vence, e só as regras dela existem | conc | integração | — | B-10 | ✅ |
| S-66 | `deny` com `session` + `prefix` grava regra `deny` de prefixo, e continua exigindo `reason` | eq | unit | `INVALID_INPUT` | B-10 | ✅ |

## Quem respondeu — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-67 | regra que responde publica `via: 'rule'`; resposta humana e prazo vencido não têm `via` | eq | unit | — | B-11 | ✅ |
| S-68 | o `GET /sessions/:id/permissions/:requestId` de um pedido resolvido por modo devolve `via: 'allowAll'` | eq | integração | — | B-11 | ✅ |

## Web — chip — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-69 | o menu de modo oferece Permitir tudo, com descrição por extenso e o aviso | eq | unit | — | B-12 | ✅ |
| S-70 | escolher Permitir tudo manda `session.setPermissionMode` com `allowAll`; escolher outro modo desliga | est | integração | — | B-12 | ✅ |
| S-71 | em `allowAll` o chip fica em tom destrutivo, com ícone e texto, nunca só cor | eq | unit | — | B-12 | ✅ |
| S-72 | o atalho que gira os modos nunca chega a `allowAll`, e sai dele para `default` (D-10) | fron | unit | — | B-12 | ✅ |
| S-73 | o painel restaurado aceita `allowAll`; um modo desconhecido volta a `default` | fron | unit | — | B-12 | ✅ |
| S-74 | antes da sessão existir, escolher Permitir tudo abre a sessão com `permissionMode: 'allowAll'` | est | integração | — | B-12 | ✅ |

## Web — alcance no card — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-75 | com mais de um alcance, o card mostra o seletor, com o padrão de cada um por extenso | eq | unit | — | B-13 | ✅ |
| S-76 | com um alcance só, não há seletor | fron | unit | — | B-13 | ✅ |
| S-77 | o pré-selecionado segue a D-09 | eq | unit | — | B-13 | ✅ |
| S-78 | `session` com `prefix` escolhido manda `reach: 'prefix'` | eq | integração | — | B-13 | ✅ |
| S-79 | a segunda etapa de `project`/`always` mostra todos os padrões do alcance escolhido | eq | unit | — | B-13 | ✅ |
| S-80 | um pedido sem `reaches` (servidor antigo) se comporta como hoje | fron | unit | — | B-13 | ✅ |

## Web — marca — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-81 | a linha da tool aprovada por `allowAll` diz "aprovado automaticamente — Permitir tudo"; por regra, "por uma regra" | eq | unit | — | B-14 | ✅ |
| S-82 | `via` desconhecido cai no texto genérico de aprovação automática | fron | unit | — | B-14 | ✅ |

## Mobile — chip — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-83 | a folha de modo oferece Permitir tudo, com descrição e aviso | eq | unit | — | B-15 | ✅ |
| S-84 | escolher Permitir tudo manda `allowAll`; outro modo desliga | est | integração | — | B-15 | ✅ |
| S-85 | em `allowAll` o chip fica em aviso com ícone e texto | eq | unit | — | B-15 | ✅ |
| S-86 | o app lê `allowAll` de `session.started`, e um modo desconhecido aparece pelo próprio nome, sem ser oferecido | fron | unit | — | B-15 | ✅ |
| S-87 | antes da sessão existir, Permitir tudo abre a sessão com `allowAll` | est | integração | — | B-15 | ✅ |

## Mobile — alcance no card — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-88 | o mapper lê `reaches`, e ignora um alcance desconhecido | fron | unit | — | B-16 | ✅ |
| S-89 | com mais de um alcance, o card mostra o seletor; com um, não | eq | unit | — | B-16 | ✅ |
| S-90 | o pré-selecionado segue a D-09 | eq | unit | — | B-16 | ✅ |
| S-91 | a resposta leva `reach` | eq | integração | — | B-16 | ✅ |
| S-92 | a confirmação de `project`/`always` mostra todos os padrões | eq | unit | — | B-16 | ✅ |

## Mobile — marca — B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-93 | a linha da tool aprovada por `allowAll` diz que foi o Permitir tudo; por regra, que foi uma regra | eq | unit | — | B-17 | ✅ |
| S-94 | o mapper lê `via` e ignora um valor desconhecido | fron | unit | — | B-17 | ✅ |

## E2E — B-18, B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-95 | web: liga Permitir tudo, o Claude roda uma tool sem card e a linha diz que foi automático; desliga, e a próxima tool abre o card | est | e2e | — | B-18 | ✅ |
| S-96 | web: aprova "nesta sessão" com um alcance mais largo que o exato — a tool inteira, no `Write` gravado — e a escrita seguinte roda sem card ([D-14](decisions.md#f5--e2e)) | eq | e2e | — | B-18 | ✅ |
| S-97 | app: liga Permitir tudo, a tool roda sem card; desliga, e o card volta | est | e2e | — | B-19 | ✅ |
| S-98 | app: aprova "nesta sessão" com o alcance da tool inteira, e a escrita seguinte roda sem card ([D-14](decisions.md#f5--e2e)) | eq | e2e | — | B-19 | ✅ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Normas e contrato (B-01…B-03) | `est`, `conc`, `idem` | documento, schema e chave de tradução não têm estado nem concorrência; a geração de tipos é determinística e o portão a confere |
| Os alcances (B-09) | `est`, `conc`, `idem`, `err` | função pura sobre o input: não tem estado, não tem I/O e não falha. A entrada que não pode virar padrão devolve menos alcances (S-48…S-53), nunca um erro |
| Linha composta (B-08) | `conc`, `idem` | função pura de matching; concorrência e idempotência do pedido estão em S-19 e S-99 |
| Marca na linha da tool (B-14, B-17) | `est`, `conc`, `idem`, `err` | texto derivado de um campo do evento; o evento repetido é tratado pelo redutor existente (09 e 10) |
| Chip e card (B-12, B-13, B-15, B-16) | `conc`, `idem` | a corrida entre clientes e a resposta repetida são do servidor (S-65, S-99, S-30); a tela só manda o comando |
| E2E (B-18, B-19) | `fron`, `err`, `conc`, `idem` | ficam nos níveis de baixo; o e2e prova o caminho do usuário |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
