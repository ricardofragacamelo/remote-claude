# F0 — Contrato

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada. É a primeira fase.
**Entrega:** os comandos, eventos e o round-trip de permissão do
[contrato](../../architecture/shared/05-websocket-protocol.md) existindo em JSON Schema, em
TypeScript e em Dart, com `pnpm contracts:check` verde.

---

## Por que primeiro

Contrato é a única coisa que as três pontas compartilham. Mudá-lo depois que backend e web já
têm código obriga a reescrever os dois — e é assim que uma ponta fica para trás. O bootstrap
já provou o custo: o app envia `session.detach`, comando que **nunca existiu** no schema, e
leva `INVALID_INPUT` ([S-119 do plano 00](../00-bootstrap/scenarios.md)).

Nesta fase **não há comportamento novo no backend**. Há vocabulário.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — Schemas dos comandos de sessão ✅

`session.start`, `session.attach`, `session.detach`, `session.prompt`, `session.interrupt`,
`session.setPermissionMode`, `session.setModel`, `session.close`, `session.setLocale`, com os
payloads da [tabela de comandos](../../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor).

`session.detach` fecha a dívida S-119 do bootstrap.

O par do bootstrap **permanece e é renomeado**: `session.ping`/`session.pong` viram
`diag.ping`/`diag.pong` ([D-01](decisions.md#d-01--o-destino-da-fatia-vertical-do-bootstrap)).
Continua sendo o smoke mais barato do gateway — o único que não exige subprocesso do Claude —, e
o nome novo é o que impede a fatia de virar API pública sem dono. A renomeação custa nada
**agora**, porque nada foi construído em cima; o mobile recebe a mudança na mesma entrega
(B-43), porque contrato quebrado em uma ponta só é bug.

Entra também `permission.extend`
([D-09](decisions.md#d-09--estender-o-que-já-é-o-único-timeout)): o comando nasce **aqui**, com
o resto do contrato, e não na F4 — contrato alterado no meio do plano é quebra. O payload é
`{ requestId }` e nada mais: **incremento e teto vêm da configuração do backend**, porque o
nosso timeout é a única proteção contra sessão pendurada e o cliente não escolhe o número.

### B-02 — Schemas dos eventos de sessão ✅

`session.started`, `session.statusChanged`, `message.delta`, `message.completed`,
`tool.started`, `tool.progress`, `tool.completed`, `turn.completed`, `session.closed`,
`diag.pong` e `permission.extended` (`{ requestId, expiresAt, remainingExtensions }`).

`seq` é **obrigatório** em todo `event` — o schema precisa cobrar isso, não a boa vontade de
quem emite.

### B-03 — O round-trip de permissão no schema ✅

É o único caso de `kind: request` servidor → cliente, e o desenho inteiro existe por causa
dele: `permission.requested` (request), `permission.resolve` (response) e `permission.resolved`
(event), com `requestId`, `riskHint`, `defaultToNo`, `suggestions` e `expiresAt`.

`reason` é **obrigatório quando `decision = deny`** — condicional no schema, não validação
espalhada no código.

O ack `session.attached` ganha `replayed`, `oldestAvailableSeq` e `gap`.

### B-04 — Geração TS + Dart e os guards ✅

`pnpm contracts:generate` emite os dois alvos; `pnpm contracts:check` falha se qualquer um
estiver dessincronizado. Guard gerado aceita campo desconhecido (forward-compat) e recusa
frame sem campo obrigatório — ver [versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos).

Campo opcional e evento novo **não** incrementam `v`.

### B-05 — Documento de contrato e catálogo de erros atualizados ✅

[05-websocket-protocol.md](../../architecture/shared/05-websocket-protocol.md) passa a
descrever o que existe, incluindo `promptedBy`/`resolvedBy` nos eventos resultantes. Nenhum
`code` novo é esperado — se aparecer um, ele entra **antes** no
[catálogo de erros](../../architecture/shared/04-errors-and-http.md), nunca depois do código.

Contrato alterado sem atualizar o documento é o anti-padrão listado no [AGENTS.md](../../../AGENTS.md).

### B-06 — As três pontas compilando contra o gerado ✅

Backend, web e mobile importam o contrato novo e seguem verdes. O app **não** ganha tela nesta
fase; ele apenas para de enviar um comando que não existe.

### B-45 — Spike do diretório confiado, antes de tudo ✅

**A primeira coisa a rodar no plano**, antes de qualquer schema
([D-11](decisions.md#d-11--o-furo-que-invalidaria-o-produto)). Verificar, num diretório já
marcado como confiado (`hasTrustDialogAccepted`) pelo CLI interativo, se um `allow` de projeto
volta a dispensar o `canUseTool`.

Está aqui, e não na [F6](F6-e2e.md), porque descobrir um furo de premissa depois da F4 pronta
custa o plano inteiro; o spike custa um diretório descartável, um backup do `~/.claude.json` e a
restauração no fim.

**A mitigação é adotada de qualquer forma** — o backend limpa ou recusa a marca de confiança
antes de abrir sessão. A medição decide se ela é obrigatória ou redundante, nunca se ela existe.
O resultado, qualquer que seja, vira registro em [progress.md](progress.md), fecha a linha de
[D-11](decisions.md) e atualiza
[04-claude-integration](../../architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources).

**Medido em 2026-09-18: o furo é real.** Em diretório confiado o `canUseTool` **não é chamado**, e
o `allow` de projeto executa a tool sem consultar ninguém. A mitigação passa de precaução a
requisito, e o spike ainda achou um segundo caminho para o mesmo furo — nome simples em
`options.allowedTools` ([D-14](decisions.md#d-14--o-segundo-jeito-de-furar-o-canusetool)). A
medição, os números e o método estão em
[D-11](decisions.md#d-11--o-furo-que-invalidaria-o-produto) e em
[04-claude-integration](../../architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido).

O spike rodou sobre um `CLAUDE_CONFIG_DIR` isolado em vez do backup e restauração do
`~/.claude.json` que esta task previa: mede a mesma coisa e não disputa o arquivo com uma sessão
de Claude Code aberta na mesma máquina.

---

## Cenários cobertos

S-01…S-08, S-85…S-87.

---

## Critério de conclusão

```bash
pnpm verify
pnpm contracts:check
```
