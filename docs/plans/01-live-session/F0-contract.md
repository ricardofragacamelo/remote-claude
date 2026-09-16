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

### B-01 — Schemas dos comandos de sessão 🔲

`session.start`, `session.attach`, `session.detach`, `session.prompt`, `session.interrupt`,
`session.setPermissionMode`, `session.setModel`, `session.close`, `session.setLocale`, com os
payloads da [tabela de comandos](../../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor).

`session.detach` fecha a dívida S-119 do bootstrap. `session.ping` **permanece** — é a fatia
vertical que prova o trilho sem o SDK, e continua sendo o teste mais barato do gateway.

### B-02 — Schemas dos eventos de sessão 🔲

`session.started`, `session.statusChanged`, `message.delta`, `message.completed`,
`tool.started`, `tool.progress`, `tool.completed`, `turn.completed`, `session.closed`.

`seq` é **obrigatório** em todo `event` — o schema precisa cobrar isso, não a boa vontade de
quem emite.

### B-03 — O round-trip de permissão no schema 🔲

É o único caso de `kind: request` servidor → cliente, e o desenho inteiro existe por causa
dele: `permission.requested` (request), `permission.resolve` (response) e `permission.resolved`
(event), com `requestId`, `riskHint`, `defaultToNo`, `suggestions` e `expiresAt`.

`reason` é **obrigatório quando `decision = deny`** — condicional no schema, não validação
espalhada no código.

O ack `session.attached` ganha `replayed`, `oldestAvailableSeq` e `gap`.

### B-04 — Geração TS + Dart e os guards 🔲

`pnpm contracts:generate` emite os dois alvos; `pnpm contracts:check` falha se qualquer um
estiver dessincronizado. Guard gerado aceita campo desconhecido (forward-compat) e recusa
frame sem campo obrigatório — ver [versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos).

Campo opcional e evento novo **não** incrementam `v`.

### B-05 — Documento de contrato e catálogo de erros atualizados 🔲

[05-websocket-protocol.md](../../architecture/shared/05-websocket-protocol.md) passa a
descrever o que existe, incluindo `promptedBy`/`resolvedBy` nos eventos resultantes. Nenhum
`code` novo é esperado — se aparecer um, ele entra **antes** no
[catálogo de erros](../../architecture/shared/04-errors-and-http.md), nunca depois do código.

Contrato alterado sem atualizar o documento é o anti-padrão listado no [AGENTS.md](../../../AGENTS.md).

### B-06 — As três pontas compilando contra o gerado 🔲

Backend, web e mobile importam o contrato novo e seguem verdes. O app **não** ganha tela nesta
fase; ele apenas para de enviar um comando que não existe.

---

## Cenários cobertos

S-01…S-08.

---

## Critério de conclusão

```bash
pnpm verify
pnpm contracts:check
```
