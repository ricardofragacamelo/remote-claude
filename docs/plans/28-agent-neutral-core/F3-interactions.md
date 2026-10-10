# F3 — Interações e estado

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-canonical-tools.md): os `kind` `question`, `plan`, `tasks` e `agent` existem no contrato.
**Entrega:**

- o plano para aprovar é uma interação nossa;
- a pergunta e o subagent são reconhecidos pelo `kind`;
- a lista de tarefas chega pronta, num evento;
- a compactação é um comando;
- o contexto tem categorias nossas;
- a mudança de arquivo feita pelo agente tem origem `agent`;
- e cada controle some quando o motor não tem a capacidade.

---

## Por quê

Cinco dos 10 pares duplicados entre TypeScript e Dart são estado da sessão que os clientes **reconstroem**
a partir do input cru. No app, a lista de tarefas é montada dentro da camada de **domínio**
([discovery §4.4](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#44-app)).

A pergunta já é canônica desde o [plano 24](../24-structured-questions/README.md), e o schema dele previa
o plano como "a segunda variante". Esta fase completa o que o 24 começou.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-20 — A interação `plan` 🔲

A `interaction` de `permission.requested` ganha a variante `{ kind: 'plan', markdown, path? }`, ao lado
da `question` do 24, na definição `question-interaction` (que passa a se chamar `interaction`). O adapter
a monta a partir do `ExitPlanMode`.

Os modos oferecidos depois da aprovação são os **canônicos** que o motor anuncia (F4). Até lá, o
adapter os traduz. Saem:

- o `toolName === 'ExitPlanMode'` do `PermissionRequestCard.tsx` e do `permission_panel.dart`;
- o `input.plan` do `PlanApprovalCard.tsx` e do `plan_approval_card.dart`;
- a constante `planTool`.

Capacidade `planApproval`. Cenários S-61…S-63.

### B-21 — A pergunta e o subagent pelo `kind` 🔲

O `question-of.ts`, o `ToolRow.tsx` e o `tool_card.dart` (`questionTool`) reconhecem a pergunta pelo
`kind` `question`. O `QUESTION_TOOL` sai do domínio, e o `question-history.ts` do backend pareia
`tool.started`/`tool.completed` pelo `kind`.

O subagent é o `kind` `agent`: o `opensSubagent` (web) e o `Agent`/`Task` (app) saem, e o aninhamento
continua pelo `parentToolUseId`. A rota de subagent é a de `/transcripts/:engine/:id/subagents/:toolUseId`
da F1. Capacidades `questions` e `subagents`. Cenários S-64, S-65.

### B-22 — `session.tasksChanged` 🔲

Evento novo, com `seq`, no replay e no histórico: `{ tasks: [{ id, title, activeTitle?, status:
pending · inProgress · completed }] }`. O adapter o deriva de `TodoWrite`, `TaskCreate` e `TaskUpdate`,
e o `taskId` que o `tool.completed` leva hoje fica só em `v-1`.

Saem o `task-list.ts` do web e o `task_list.dart` do app (o da camada de domínio). O `TaskStrip.tsx` e o
`task_strip.dart` desenham o evento. O histórico reproduz a última lista pela mesma função do ao vivo.
Capacidade `taskList`; sem ela, a faixa não existe. Cenários S-66…S-68.

### B-23 — O comando `session.compact` 🔲

Comando novo `session.compact { sessionId }`, recusado com `ENGINE_CAPABILITY_UNAVAILABLE` quando o
motor não tem `compaction`. No Claude, o adapter manda `/compact`. Saem os dois `'/compact'` literais, o
do `SessionScreen.tsx` e o do `live_session_controller.dart`.

O `session.compacted` continua como está, com o `compactionId` que o [27](../27-conversation-losses/README.md)
acrescenta. O slash command digitado pela pessoa continua indo como prompt: é o motor que o entende, e
não nós. Cenários S-69, S-70.

### B-24 — O contexto canônico 🔲

`GET /sessions/:id/context` passa a responder categorias `{ id, messageKey?, text?, tokens }`:

- os ids canônicos têm chave nossa: `system`, `tools`, `messages`, `memory`, `free` e `reserved`;
- o resto vem com o texto do motor, como manda a convenção `messageKey`/`text` do 27.

Saem os ids do Claude do `ContextMeter.tsx` e do `context_ring.dart`. A rota entra no `schema/http/`.
Capacidade `contextUse`. Cenários S-71, S-72.

### B-25 — A origem `agent` da mudança de arquivo 🔲

`workspace.filesChanged.origin` passa de `claude` para `agent`, com o `engine` ao lado. Mudam:

- o `ChangeOrigin` do domínio;
- o `claude-write.listener.ts` (que vira `agent-write.listener.ts`);
- o `claude-writes.ts` e as constantes `CLAUDE_WRITE_MEMORY_*`;
- o `folder-watches.ts` e o `FilePane.tsx` do web;
- o `ClaudeWaitingStrip` do leitor do app, nos dados. O nome do widget é da [F6](F6-engine-extensions.md).

O baseline perde as entradas desta fase. Cenários S-73…S-76.

---

## Cenários cobertos

S-61…S-76.

---

## Critério de conclusão

```bash
pnpm verify
```
