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

### B-08 — O `switch` exaustivo e as três listas ✅

**Como ficou:** o `switch` virou um `Record` por `type` (`HANDLERS`, em `sdk-message.mapper.ts`) e um
segundo `Record` por `subtype` de `system` (`SYSTEM_HANDLERS`) — a mesma garantia de exaustividade do
compilador que um `switch` com `never` daria, sem o custo de complexidade ciclomática de uma única
função com 39 ramos (o gate 2 reprovava acima de 10). As três listas viram dado, em
`sdk-message-classification.ts` (`SDK_VARIANT_CLASSIFICATION`, 40 linhas: as 39 variantes do SDK —
`user` e `user:replay` contadas à parte, como o próprio SDK as conta — mais `command_lifecycle`), cada
uma com o motivo escrito, e um teste (`sdk-message-classification.spec.ts`) prova a contagem, a ausência
de duplicata (S-21) e dois `expectTypeOf` que quebram o `tsc` se a união do SDK ganhar um `type` ou um
`subtype` de `system` que a lista não conhece (S-19). Cenários S-18…S-21.

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

### B-09 — Os avisos ✅

**Como ficou:** o mapa inteiro mora em `sdk-message-notices.ts`, uma função por `kind`. Os quatro `kind`
que a D-10 já tinha dobrado em `agent.info` (`memory.recalled`, `conversation.reset`, `hook.failed`,
`extension.failed`) saem exatamente assim: `memoryRecalledNotice`, `conversationResetNotice`,
`hookFailedNotice` e `pluginFailedNotice` emitem `kind: 'agent.info'`, com o `text`/`params`/`subject`
dizendo do que se trata. O `systemMessage` de hook (achado pela B-01, sonda 2) chega como
`system:informational`, nunca como campo do `hook_response` — confirmado pela fixture
`hook-message-turn` (S-25). `request.retrying`, `usage.limited`, `agent.stopping`, `model.switched` e
`conversation.reset` usam `messageKey`+`params` (texto nosso, nunca o do agente); `command.output`,
`agent.info` (banner, hook, plugin) e `model.refused` usam `text` (prosa do agente/hook/comando, cortada
no teto da D-13, nunca as duas formas juntas — convenção do próprio schema). `turn.failed` (B-10) é a
única exceção documentada: carrega os dois, `params.reason` estrutural **e** o `errors[]` cru. Cenários
S-22…S-31.

**Desvio do fatiamento original:** as seis `messageKey` novas (`sessions.notice.modelSwitched`,
`.requestRetrying`, `.usageLimited`, `.agentStopping`, `.memoryRecalled`, `.conversationReset`) exigiram
entrada no catálogo do web **já nesta fase** — não deu para esperar a F6. O `gates.spec.mjs` da raiz
(`i18n-check.mjs`, parte do portão 7 de `pnpm verify`, não só do 11) falha se o backend manda uma
`messageKey` que catálogo nenhum traduz, e essa checagem não distingue "ainda não chegou a fase do
cliente" de "esqueceram". As seis entraram em `web/src/shared/i18n/locales/{en,pt-BR}.json`, sob
`sessions.notice.*`, com texto mínimo e os `{{param}}` que fazem sentido mostrar — sem nenhum componente
que as leia ainda (isso é a F6, B-19…B-24). O app não precisava de nada: a checagem só cobra `messageKey`
do backend contra o catálogo **web** (`senders`), nunca o mobile.

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

### B-10 — O desfecho do turno e a tool negada pelo CLI ✅

**Como ficou:** a segunda metade, que a implementação parcial de 2026-10-25 deixou de fora, entrou
agora. `fromResult` passa a emitir um `session.notice` `turn.failed` ao lado do `turn.completed`, sempre
que o `outcome` não é `completed` — com `params.reason` (`execution`/`maxTurns`/`budget`/`other`) e o
`errors[]` cortado no teto da D-13 em `text`. O `permission_denied` grava o motivo num mapa do próprio
`SdkMessageMapper` (`recordDenial`/`consumeDenial`), e o `tool_result` da mesma `tool_use_id` o consome
uma vez só, fechando com `status: 'denied'` e o motivo em `summary`, em vez de `failed`. A "ordem não
importa" (S-36) ficou provada só no sentido que o CLI de fato garante — a negação sempre chega **antes**
do `tool_result` que ela explica, porque é a própria negação que fabrica aquele resultado de erro; não
há como o cliente desfazer um `tool.completed` já emitido, então a ordem inversa nunca é suportada (nem
observada). O teste prova a correlação por `tool_use_id` mesmo com outra tool no meio. Cenários S-32…S-36.

O `result` de erro (`error_during_execution`, `error_max_turns`, `error_max_budget_usd`…) deixa de ser
um `turn.completed` igual ao de sucesso: ganha o `outcome` canônico e um aviso `turn.failed` com o
texto do `errors[]` cortado. Subtipo que o adapter não conhece vira `failed` com `reason: 'other'`.

O `permission_denied` passa a fechar a tool com `status: 'denied'` e o motivo, em vez do `failed` que o
`tool_result` de erro dá hoje. A correlação é pelo `tool_use_id`, e a ordem entre os dois não muda o
resultado. Cenários S-32…S-36.

**Implementação parcial, fora do ciclo deste plano (2026-10-25):** só a primeira metade — o `outcome`
canônico de `turn.completed` — foi feita, em `fromResult()`/`outcomeOf()`
(`backend/src/adapter/outbound/engines/claude/sdk-message.mapper.ts`), com `TurnRow`/`TurnLine`
mostrando uma linha própria (não o resumo de custo/tokens) para todo turno que não seja `completed`,
no web e no mobile. Diferenças do desenho acima: `outcome` ficou **dentro** de `turn.completed`, sem
um `turn.failed` separado — então não há `errors[]` cortado nem texto do porquê, só o `outcome` em si;
um subtipo que o adapter não conhece vira `failed` puro, sem `reason: 'other'` (o campo `reason` não
existe nesta versão). O `permission_denied` → `status: 'denied'` da tool **não foi tocado** — segue
exatamente como descrito acima, ainda 🔲. Cenários S-32…S-34 cobertos por teste unitário no mapper
(`sdk-message.mapper.spec.ts`) e no reducer/mapper do web e do mobile; S-35 e S-36 (a tool negada)
continuam sem cobertura, por não terem sido tocados. **`pnpm verify`/`verify:full` não foram rodados**
para esta mudança — só `tsc`, `eslint` e os testes unitários dos arquivos tocados, nos três lados.

### B-11 — A mensagem sintética e o eco ✅

**Como ficou:** o `SdkMessageMapper` ganhou um `pendingInjected`, marcado pelo `compact_boundary`
(`{kind:'contextSummary'}`) e pelo `tool.started` de uma tool `Skill` (`{kind:'instructions', name,
parentToolUseId}`), consumido pela **próxima** mensagem `user` sintética sem `tool_result` — a mesma
ordem que a B-01/B-02 mediram ao vivo nas duas fixtures (`compact-turn`, `user-skill-plugin-turn`). A
expansão de `/comando` (`<command-name>`/`<command-args>`) **não tem nada a fazer no vivo**: a B-01/B-02
mediram que um `/comando` de projeto não produz eco nenhum ao vivo — nem `local_command_output`, nem
mensagem `user` alguma; a tag só existe no histórico (`getSessionMessages`), fora do escopo desta fase
(F5). O eco `<local-command-stdout>` vira `command.output` sempre, sem tentar correlacionar com um
`local_command_output` da mesma saída — a D-07 já havia decidido **mostrar os dois**, ao contrário da
recomendação original de um só; o texto do plano acima ("se houver um `local_command_output` da mesma
saída, o eco é descartado") ficou desatualizado depois da decisão do usuário em 2026-11-01 e foi corrigido
aqui e no cenário S-39 (ver scenarios.md). Cenários S-37…S-43.

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

### B-12 — A troca de modelo e a retirada ✅

**Como ficou:** `model_refusal_fallback` vira só o aviso `model.switched` (`from`/`to`/`reason:
'refusal'`) — **sem** `message.retracted`, como a D-06 já havia fechado em 2026-11-01 (a medição não
confirmou nem refutou os uuids, e o ramo conservador venceu: nenhum evento de retirada nesta fase). A
troca por sobrecarga (`reason: 'overload'`) não entrou: a B-01 (sonda 3) mediu, no `sdk.d.ts`, que não
existe variante alguma para troca por sobrecarga — só `model_refusal_fallback`/`…no_fallback`, os dois
com `trigger: 'refusal'`. `model_refusal_no_fallback` vira `model.refused` com o `content`. A fixture
escrita à mão `refusal-fallback-turn` (D-09) prova o caminho vivo; o `retracted_message_uuids` vazio
(S-46) e a idempotência do `noticeId` no replay (S-47) são testados diretamente, sem fixture. Cenários
S-44…S-47.

O `model_refusal_fallback` vira o aviso `model.switched` (`from`, `to`, `reason: 'refusal'`) **e** o
`message.retracted` com os `retracted_message_uuids` traduzidos para os ids que os clientes guardam,
como a B-01 mediu ([D-06](decisions.md#f2--contrato)). O `model_refusal_no_fallback` vira
`model.refused` com o `content`. Lista vazia de uuids: só o aviso. A troca por sobrecarga entra com
`reason: 'overload'` se a B-01 achar a mensagem dela. A prova usa a fixture escrita à mão da
[D-09](decisions.md#f0--spike). Cenários S-44…S-47.

### B-13 — A variante desconhecida ✅

**Como ficou:** o `default` do `HANDLERS`/`SYSTEM_HANDLERS` (a entrada ausente no `Record`, nunca mais um
`switch`) emite `session.notice` `kind: 'unknown'`, `origin.native` com o `describe()` de hoje (`type` ou
`type:subtype`), e `text` só de um campo conhecido no nível de cima (`content`, `text`, `message`,
`error` ou `reason`, nessa ordem, como string) — nunca o JSON (D-03), com o mesmo teto da D-13. O `warn`
de `session-runner.ts` continua, com o comentário e a mensagem do log corrigidos (não dizem mais
"dropped": a linha chega ao cliente agora). Mensagem sem `uuid` ganha um `noticeId` derivado
(`unknown:<sessionId>:<ordinal>` ou `unknown:<ordinal>`), estável contanto que o mesmo `SdkMessageMapper`
processe a mesma entrada na mesma ordem — o caso real de "replay" (o mesmo evento já emitido, reenviado
do buffer) não precisa de mais nada, porque reenvia o **mesmo** evento; a leitura do histórico (F5) é
quem vai precisar derivar de novo a partir do zero, e o mesmo mecanismo serve. Cenários S-48…S-52.

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
