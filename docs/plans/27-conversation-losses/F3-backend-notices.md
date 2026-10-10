# F3 — Avisos no backend

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-contract.md), com as fixtures da [F0](F0-spike.md), e das decisões
[D-03](decisions.md#f3--avisos-no-backend) e [D-07](decisions.md#f3--avisos-no-backend).
**Entrega:** o mapper ao vivo com o destino de cada uma das 39 variantes declarado e conferido pelo
`tsc`. O que o agente avisa vira `session.notice`, o turno com erro diz o erro, a tool negada pelo CLI
sai como `denied`, a mensagem sintética nunca vira prompt, a resposta recusada é retirada, e o
desconhecido vira a linha `unknown`.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-08 — O `switch` exaustivo e as três listas 🔲

Cada variante do `SDKMessage` (e o `command_lifecycle`, que o CLI emite fora da união) está em
exatamente uma de três listas: **mapeada**, **aviso** ou **quieta**, sempre com o motivo escrito
([discovery §3](../../discovery/09-perdas-do-backend-na-conversa.md#3-princípios), princípio 1). O
destino é o da tabela do [§4](../../discovery/09-perdas-do-backend-na-conversa.md#4-inventário-as-39-variantes-do-sdkmessage),
ajustado pelo que a B-01 mediu.

O `switch` do `sdk-message.mapper.ts` (em `backend/src/adapter/outbound/engines/claude/`, para onde a
[F1 do plano 28](../28-agent-neutral-core/F1-engine-port.md) move o adapter) termina num `never`, e um teste de tipo prova que uma variante a mais quebra o `tsc`. Com isso, o
`default` fica vazio para o SDK de hoje, e atualizar o SDK passa a exigir a decisão de onde a variante
nova cai. Onde a classificação mora segue a
[backend/02-folder-structure](../../architecture/backend/02-folder-structure.md): tudo no adapter do
Claude, no anel `engines/claude/`. Cenários S-18…S-21.

### B-09 — Os avisos 🔲

O mapa variante do Claude → `kind` canônico do [§8.2](../../discovery/09-perdas-do-backend-na-conversa.md#82-o-evento-de-aviso),
num arquivo do adapter: `command.output`, `agent.info` (com o `level` e o `prevent_continuation`),
`agent.notification`, `agent.stopping`, `hook.failed` (só com `outcome: 'error'`), `request.retrying`
(mantendo o `statusChanged: thinking`), `usage.limited` (só fora do estado normal), `compaction.failed`,
`extension.failed`, `auth.failed`, `memory.recalled` e `conversation.reset`. O que a B-01 decidir sobre
o `systemMessage` do hook e o `worker_shutting_down` entra aqui. Os `kind` que trazem conceito do Claude
(`memory.recalled`, `conversation.reset`, `hook.failed`, `extension.failed`) só entram como estão se
passarem pelo critério da [D-10](decisions.md#f2--contrato), com a nota do plano 28; senão, viram
`agent.info`.

Texto do agente, de hook e de comando é **não confiável**: vai em `text`, cortado no teto da
[D-13](decisions.md#f2--contrato), com `truncated`. O `noticeId` é o `uuid` da mensagem. O aviso de
dentro de um subagent leva o `parentToolUseId`. Entrada e saída em `debug`, sem o texto inteiro
([shared/03-logging](../../architecture/shared/03-logging.md)). Cenários S-22…S-31.

### B-10 — O desfecho do turno e a tool negada pelo CLI 🔲

O `result` de erro (`error_during_execution`, `error_max_turns`, `error_max_budget_usd`…) deixa de ser
um `turn.completed` igual ao de sucesso: ganha o `outcome` canônico e um aviso `turn.failed` com o
texto do `errors[]` cortado. Subtipo que o adapter não conhece vira `failed` com `reason: 'other'`.

O `permission_denied` passa a fechar a tool com `status: 'denied'` e o motivo, em vez do `failed` que o
`tool_result` de erro dá hoje. A correlação é pelo `tool_use_id`, e a ordem entre os dois não muda o
resultado. Cenários S-32…S-36.

### B-11 — A mensagem sintética e o eco 🔲

O [§5](../../discovery/09-perdas-do-backend-na-conversa.md#5-perdas-dentro-da-mensagem-de-usuário),
no `fromUser`/`userEvents`:

- o resumo da compactação (`isSynthetic`) vira `message.completed` com `injected.kind: 'contextSummary'`;
- o corpo de skill vira `injected: { kind: 'instructions', name }`, com o `parentToolUseId` do `Skill`;
- a expansão de `/comando` (`<command-name>`, `<command-message>`, `<command-args>`) vira o prompt
  `/comando args` digitado, e nenhuma tag chega ao cliente;
- o eco `<local-command-stdout>` vira o aviso `command.output`, sem a tag. Se houver um
  `local_command_output` da mesma saída no turno, o eco é descartado ([D-07](decisions.md#f3--avisos-no-backend));
- o prompt de outro dispositivo (`isReplay` sem tag) continua como está.

Cenários S-37…S-43.

### B-12 — A troca de modelo e a retirada 🔲

O `model_refusal_fallback` vira o aviso `model.switched` (`from`, `to`, `reason: 'refusal'`) **e** o
`message.retracted` com os `retracted_message_uuids` traduzidos para os ids que os clientes guardam,
como a B-01 mediu ([D-06](decisions.md#f2--contrato)). O `model_refusal_no_fallback` vira
`model.refused` com o `content`. Lista vazia de uuids: só o aviso. A troca por sobrecarga entra com
`reason: 'overload'` se a B-01 achar a mensagem dela. A prova usa a fixture escrita à mão da
[D-09](decisions.md#f0--spike). Cenários S-44…S-47.

### B-13 — A variante desconhecida 🔲

O que cai no `default` (uma versão nova do SDK) vira `session.notice` com `kind: 'unknown'`,
`origin.native` com o tipo e o subtipo, e o `text` **só** de um campo de texto conhecido no nível de
cima (`content`, `text`, `message`, `error` ou `reason`, como string), cortado. **Nunca** o JSON da
mensagem ([D-03](decisions.md#f3--avisos-no-backend)). O `warn` de hoje continua, sem o payload.

Mensagem sem `uuid` ganha um `noticeId` derivado da sessão e do `seq`, e o replay devolve o mesmo.
O teste usa uma mensagem inventada (`{ type: 'system', subtype: 'nunca_visto', content: 'x' }`),
escrita à mão porque prova o nosso caminho de sobrevivência e não a forma do SDK. Cenários S-48…S-52.

---

## Cenários cobertos

S-18…S-52.

---

## Critério de conclusão

```bash
pnpm verify
```
