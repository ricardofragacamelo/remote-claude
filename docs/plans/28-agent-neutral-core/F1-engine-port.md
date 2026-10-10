# F1 — Porta de motor e conversa

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-norms.md): as normas e a catraca.
**Entrega:**

- a sessão fala com uma **porta de motor**, e o Claude é o único adapter registrado;
- a conversa é `{ engine, id }` em todo lugar: portas, banco, contrato, web e app;
- erros com nome de agente, não de produto;
- `GET /engines` e as capacidades em `session.started`;
- o contrato em `v+1`, com a janela de `v-1`.

---

## Por quê

Todo o resto do plano pendura na porta e no id da conversa. A F2 classifica dentro do adapter, que
precisa estar no lugar novo. A F4 anuncia modos e esforço pelas capacidades, que nascem aqui. E
`ClaudeSessionId` é o termo de maior alcance do inventário (29 arquivos do backend, 9 do web, 11 do
app, 3 tabelas).

O `v+1` sai nesta fase, e não na última, porque cada fase seguinte remove um campo. Abrir a janela uma
vez e fechar ao fim do plano é uma subida de `v` só, e não cinco
([D-08](decisions.md#f1--porta-de-motor-e-conversa)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-08 — O domínio `engine` e os erros neutros 🔲

`backend/src/domain/engine/`, sem framework:

- `EngineId`, fechado e vindo da configuração;
- `ConversationRef { engine, id }`;
- `EngineCapabilities`, o subconjunto da [discovery 03 §6.2](../../discovery/03-multiplos-motores-de-agente.md#62-capacidades)
  que o produto usa hoje, cada uma justificada pelo critério da [27 · D-10](../27-conversation-losses/decisions.md#f2--contrato);
- `EngineDescription`: instalado, versão, autenticado e capacidades;
- `ToolKind`, aberto, com a tabela da F2.

Os erros `ClaudeUnavailableError`, `ClaudeTimeoutError` e `InvalidClaudeSessionIdError`, e os de
transcript que reusam os códigos, viram `AgentUnavailableError` (`AGENT_UNAVAILABLE`, 502),
`AgentTimeoutError` (`AGENT_TIMEOUT`, 504) e `InvalidConversationRefError` (400), com `params.engine`.
Entra também o `EngineCapabilityUnavailableError` (`ENGINE_CAPABILITY_UNAVAILABLE`, 409). Os nomes vão
para o [catálogo](../../architecture/shared/04-errors-and-http.md) e para as chaves de i18n das três
pontas, pareadas no `i18n-shared.json`. Cenários S-25…S-27.

### B-09 — `AgentEnginePort` e `EngineRegistry` 🔲

A porta substitui a [claude-session.port.ts](../../../backend/src/application/session/ports/claude-session.port.ts)
na forma da [discovery 03 §6.1](../../discovery/03-multiplos-motores-de-agente.md#61-a-porta-de-motor):

- o núcleo obrigatório (`describe`, `start`, `prompt`, `interrupt`, `close`);
- o `control` opcional por capacidade (modelo, comandos, contexto, MCP, fork).

O `EngineRegistry` resolve `EngineId → AgentEnginePort`. Os use cases de `session` (start, drive,
catalog, insight, rewind) passam por ele, e pedir controle que o motor não tem é o erro da B-08, nunca um
`undefined`.

O `SessionEvent` ganha tipo na aplicação: a união dos eventos do contrato, e não mais
`{ type: string; payload }`, para que o compilador confira quem emite o quê.

Configuração `RC_ENGINES_ENABLED` e `RC_ENGINE_DEFAULT`, com `claude` como padrão, validada no boot.
Cenários S-28…S-30.

### B-10 — O adapter no lugar novo, e a composição 🔲

O adapter muda de pasta: `backend/src/adapter/outbound/claude/` → `backend/src/adapter/outbound/engines/claude/`.
A composição fica em `infrastructure/modules/engines/claude.module.ts` (ex-`claude-sdk.module.ts`), que
é o único que importa o adapter.

As regras `sdk-is-isolated`, `transcript-reads-through-the-sdk` e `transcript-is-never-persisted`
passam a citar o caminho novo, e a aceitação do caminho antigo da [B-06](F0-norms.md#b-06--o-lint-dos-três-anéis-nas-três-pontas-) sai.

O adapter implementa `describe()` (versão do CLI, login sem expor credencial, capacidades) e a porta da
B-09, e a asserção de segurança do ADR-011 continua no `query.factory.ts`. O `backend/04` vira
`04-engine-integration.md` (a porta, as capacidades, como um adapter se registra) mais o anexo
`04a-claude.md` com o que é do Claude. O roteador do AGENTS aponta para os dois. Cenários S-31, S-32.

### B-11 — `ConversationRef` nas portas e no banco 🔲

`SessionOrigin`, `ResumableConversationSource`, `UndoReach`, `JournalScope`, `LiveConversationSource`,
`TranscriptOriginSource` e o `TranscriptStore` passam a receber `ConversationRef`. O `TranscriptStore`
fica atrás de um `TranscriptStoreRegistry` por motor, com uma implementação só. A geração do id da
conversa antes de abrir o processo (`CLAUDE_SESSION_ID_GENERATOR`) é do adapter.

O banco ganha uma migration **nova** ([backend/05](../../architecture/backend/05-persistence.md); as
aplicadas não mudam):

- `engine` (não nulo, `claude` nas linhas existentes) e `conversation_id`, copiado de `claude_session_id`,
  em `session_origins`, `turn_file_checkpoints` e `session_file_states`;
- índices por `(engine, conversation_id)`;
- conferência de contagem na própria migration.

A coluna antiga sai numa migration seguinte, na [F7](F7-e2e.md), depois da janela. Cenários S-33…S-35.

### B-12 — O contrato: conversa, motor e capacidades, em `v+1` 🔲

Em [packages/contracts/schema/](../../../packages/contracts/schema/), com o 05 na mesma entrega:

- `session.started` ganha `engine`, `conversation { engine, id }`, `resumedFrom { engine, id }?` e
  `capabilities`. O `claudeSessionId` fica só em `v-1`;
- `session.attached` faz o mesmo;
- `session.start` ganha `engine?`, e `resumeFrom { engine, id }` substitui o `resumeSessionId`;
- `transcript.follow` passa a receber a conversa por `{ engine, id }`;
- as definições `conversation-ref` e `engine-capabilities` vão em `definitions/`;
- as rotas `GET /engines` (`{ id, displayName, state, capabilities }`) e `/transcripts/:engine/:id/…`
  (messages, subagents, tools, images) entram, com `/transcripts/:id/…` em `v-1`;
- os tipos REST dessas rotas entram no pacote, em `schema/http/`, com o mesmo gerador para TypeScript e
  Dart. São as primeiras: pela [D-09](decisions.md#f1--porta-de-motor-e-conversa), **todo** o REST entra
  no pacote, e o resto é a [B-48](F6-engine-extensions.md#b-48--o-resto-do-rest-no-pacote-contracts-) da F6.

O servidor emite os dois formatos durante a janela. O `PROTOCOL_VERSION` sobe uma vez aqui e não sobe
de novo até o fim do plano ([D-08](decisions.md#f1--porta-de-motor-e-conversa)). Cenários S-36…S-38.

### B-13 — O web e o app pela conversa e pelos erros neutros 🔲

O `claudeSessionId` sai do web (9 arquivos: `live-session.store.ts`, `ws-client.ts`,
`useSessionFrames.ts`, `sessions-view.service.ts`…) e do app (11 arquivos: `resume_controller.dart`,
`session_update.dart`, `ws_client.dart`, `session_event.dart`…), trocado por `conversation`. O reload
depois de um `gap`, a retomada, o fork e o "copiar id" passam a usar `{ engine, id }`.

Os erros `AGENT_*` são traduzidos nas duas pontas, e as chaves `session.error.claudeUnavailable` e
`transcriptErrorClaudeTimeout` saem. As capacidades são **lidas e guardadas**, sem esconder nada ainda;
quem esconde é a fase de cada controle (F3, F4). O baseline perde as entradas desta fase. Cenários S-39,
S-40.

---

## Cenários cobertos

S-25…S-40.

---

## Critério de conclusão

```bash
pnpm verify
```
