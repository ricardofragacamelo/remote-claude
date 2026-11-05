# F2 — Contrato

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-known-silent.md), e das decisões [D-04](decisions.md#f2--contrato),
[D-06](decisions.md#f2--contrato), [D-10](decisions.md#f2--contrato) e [D-13](decisions.md#f2--contrato).
**Entrega:** o contrato do
[§8 da discovery](../../discovery/09-perdas-do-backend-na-conversa.md#8-contrato) nas três pontas
(schema, `protocol.ts`, `protocol.g.dart` e o 05), **sem comportamento**. Ninguém emite nem desenha
nada novo ainda.

---

## Por quê

O contrato vem antes do backend e dos clientes porque é ele que as duas pontas compartilham: as F3…F5
emitem o que está aqui, e a F6 desenha. Mudar o nome de um `kind` depois de a F3 emiti-lo é mudar três
pontas de novo.

Tudo é **aditivo**: evento novo e campo opcional, sem subir `v`
([05 · Versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)).
E tudo é **canônico**: nenhum nome do Claude no contrato
([discovery §8.1](../../discovery/09-perdas-do-backend-na-conversa.md#81-canônico-não-do-claude)). Desde o
[plano 28](../28-agent-neutral-core/README.md), isso é conferido por máquina sobre o contrato inteiro: o
`neutral:check` do portão 11 lê todos os schemas, e os campos novos daqui seguem as formas de lá
(`origin`, `conversation`, `kind` aberto).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-05 — O evento `session.notice` ✅

O evento com `seq`, no replay e no histórico (`transcript.appended`), na forma do
[§8.2](../../discovery/09-perdas-do-backend-na-conversa.md#82-o-evento-de-aviso): `noticeId`, `kind`
(string aberta), `level`, `messageKey` + `params` quando o texto é nosso, `text` + `truncated` quando
o texto é do agente, `subject`, `origin` (`engine` e o `native` opaco), `parentToolUseId` e `at`.

Os `kind` são os da tabela do §8.2, revistos contra a
[matriz de capacidades da discovery 03](../../discovery/03-multiplos-motores-de-agente.md#53-matriz-de-capacidades)
pela [D-10](decisions.md#f2--contrato). O teto do `text` é o da [D-13](decisions.md#f2--contrato), como
`maxLength` do schema ([05 · Limites de campo](../../architecture/shared/05-websocket-protocol.md#limites-de-campo)).
O evento é da classe **conversa** da B-03. Todo `kind` novo passa pelo critério da D-10, com a nota do
plano 28 (capacidade declarada). Cenários S-10…S-12.

**Como ficou:** `packages/contracts/schema/events/session-notice.schema.json` e a definição
`packages/contracts/schema/definitions/notice-subject.schema.json` (`command`, `hook`, `trigger`,
todos opcionais — o `subject` do §8.2). `origin` reaproveita `engine-origin.schema.json`, já usado por
`tool.started`. `level` é o único enum fechado (`info`·`notice`·`warning`·`error`); `kind` é string
aberta, `maxLength: 64`, nos moldes do `kind` de `tool.started`. `text` tem `maxLength: 4000`, a
escolha da D-13 (acima da recomendação de 2 000). A tabela de `kind` ficou com **12** entradas depois
do critério da D-10 — ver o resultado de lá: `command.output`, `agent.info`, `agent.notification`,
`agent.stopping`, `model.switched`, `model.refused`, `request.retrying`, `usage.limited`,
`turn.failed`, `compaction.failed`, `auth.failed`, `unknown`. Entrou na tabela de eventos do
[05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente).

### B-06 — Os campos novos e o `message.retracted` ✅

Os campos do [§8.3](../../discovery/09-perdas-do-backend-na-conversa.md#83-campos-novos-em-eventos-que-já-existem),
todos opcionais:

- `message.completed.injected` (`instructions`, `commandExpansion`, `contextSummary`, `other`, e `name`);
- `tool.completed.attachments[]` (`image` com `blockId`, `mediaType?`, `size?`; `link` com `uri` e
  `title?`; `unknown` com o `type`);
- `turn.completed.outcome` (`completed`, `failed`, `limitReached`, `budgetExceeded`, `cancelled`);
- `session.compacted.compactionId`.

E o evento novo `message.retracted` com `messageIds[]` (ao menos um), se a [D-06](decisions.md#f2--contrato)
confirmar que os ids batem. Se não baterem, o evento não entra, e a exclusão fica registrada no
[progress.md](progress.md). O `status: 'denied'` do `tool.completed` já existe e não muda.
Cenários S-13…S-15.

**Como ficou:** `turn.completed.outcome` e `tool.completed.status: 'denied'` **já existiam** no
contrato (trabalho do plano 28) — só `cancelled` entrou no enum do `outcome`, que foi de 4 para 5
valores. `message.completed.injected` e `tool.completed.attachments[]` são schema novo, nos moldes do
bloco de conteúdo de `message.completed` (objeto plano, campos opcionais por `kind`, nunca uma união
de verdade — o gerador não suporta `oneOf`). `session.compacted.compactionId` é campo novo, string
simples. **`message.retracted` não entrou**: a B-01 não confirmou nem refutou a D-06 (sonda 8 não
provocável de propósito) — registrado em [progress.md](progress.md#escopo-reduzido-ou-adiado) e em
[decisions.md](decisions.md#f2--contrato). B-12 e B-23 ficam sem esse evento até a decisão ser revista.

### B-07 — Os `kind` e campos novos no portão de neutralidade ✅

O teste que esta task criaria foi **absorvido pelo [plano 28](../28-agent-neutral-core/F0-norms.md)**
([D-14](decisions.md#normas)): o portão de neutralidade (`pnpm neutral:check`, portão 11) já recusa, em
todos os schemas, qualquer `kind`, enum ou chave com nome de motor (`snake_case` de subtipo do SDK,
`claude`, `sdk`, `anthropic`), e o vocabulário é o `scripts/engine-vocabulary.json`, com o motivo de
cada entrada. O `origin.native` continua a única exceção, por ser opaco.

Aqui, a task é conferir os `kind` e os campos novos deste plano nesse portão: os subtipos do SDK que as
F3…F5 traduzem (`local_command_output`, `error_max_turns`, `model_refusal_fallback`…) entram no
vocabulário, se ainda não estiverem, e os testes do portão ganham os casos dos schemas novos
(`session.notice`, `message.retracted`, `injected`, `attachments`, `outcome`). Nenhum teste paralelo
nasce no pacote `contracts`. Cenários S-16, S-17.

**Como ficou:** `pnpm neutral:check` passou sobre o schema novo sem entrada nenhuma na baseline — a
primeira tentativa achou "claude" na prosa de uma descrição (não num identificador), prova de que o
portão lê texto livre também, e a descrição foi reescrita sem nomear o motor. O vocabulário ganhou 11
termos novos (`local_command_output`, `hook_response`, `model_refusal_fallback`,
`model_refusal_no_fallback`, `worker_shutting_down`, `rate_limit_event`, `plugin_install`,
`auth_status`, `permission_denied`, `model_switch`, `retracted_message_uuids`) — todos com `0`
ocorrências hoje, porque a F3 ainda não existe; `compact_boundary` e `api_retry` já estavam. `notification`
e `informational` ficaram de fora de propósito: são palavras comuns do produto (central de notificação,
push), e marcá-las por inteiro quebraria código legítimo sem relação com o motor — a F3 decide, quando
escrever o adapter, se precisa de um termo mais específico para elas. `message.retracted` não entrou no
vocabulário por não ter sido criado (B-06). Nenhum teste novo no pacote `contracts`, como previsto: a
prova real é o `pnpm neutral:check` sobre os schemas de verdade, não uma fixture paralela.

---

## Cenários cobertos

S-10…S-17.

---

## Critério de conclusão

```bash
pnpm verify
```
