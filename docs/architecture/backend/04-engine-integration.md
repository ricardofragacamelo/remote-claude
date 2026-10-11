# Integração com um agente de código — a porta de motor

Como o backend fala com o agente de código da máquina, sem que o núcleo saiba qual é
([ADR-025](../shared/00-decisions.md#adr-025--núcleo-neutro-de-agente-extensões-isoladas-por-motor-nas-três-pontas)).
O que é do Claude, o único motor de produção, está no anexo [04a-claude](04a-claude.md). Os anéis e o
portão de neutralidade estão no [12-engines](../shared/12-engines.md).

Voltar para o [índice do backend](README.md).

---

## Onde isso mora

```
src/
├── domain/engine/                        EngineId, ConversationRef, EngineCapabilities,
│                                         EngineDescription, ToolKind, os erros do agente
├── application/session/
│   ├── ports/agent-engine.port.ts        AgentEnginePort, AgentSessionStart, AgentSessionHandle,
│   │                                     EngineControl, SessionEvent (a união do contrato)
│   └── engine-registry.ts                EngineRegistry: EngineId → AgentEnginePort
├── application/transcript/
│   └── transcript-store-registry.ts      o histórico de todos os motores, como um só
├── adapter/inbound/http/engines/         GET /engines
├── adapter/outbound/engines/<motor>/     o adapter de cada motor — o do Claude: 04a-claude
└── infrastructure/modules/engines/       a composição: o único que importa um adapter de motor
```

---

## A porta

```ts
export interface AgentEnginePort {
  readonly engine: EngineId;
  describe(): Promise<EngineDescription>;      // instalado, versão, login, capacidades — sem cota
  newConversation(): ConversationRef;          // o id na forma do motor, antes do subprocesso
  conversationOf(id: string): ConversationRef | null;   // a regra do id é do motor
  start(input: AgentSessionStart): Promise<AgentSessionHandle>;
}
```

O handle tem um **núcleo** que todo motor tem (`prompt`, `interrupt`, `setPermissionMode`, `close`,
`cliVersion`, `capabilities`) e um `control` com os membros que dependem de capacidade (`setModel`,
`supportedCommands`, `supportedModels`, `contextUse`, `mcpServers`, `initialization`). Um membro
ausente é uma capacidade que o motor não tem; pedi-lo passa por `controlOf` (ou `liveControl`) e é
`ENGINE_CAPABILITY_UNAVAILABLE` (409) — nunca um `undefined`.

O **gate de permissão** e a **auditoria pré-ferramenta** não estão na porta: são portas que o adapter
consome (`SessionPermissionGate`, `ToolInvocationRecorder`), para que todo motor passe pelo mesmo
módulo `permission`.

O `SessionEvent` é a **união dos eventos do contrato** (`EventPayloads`, gerado do schema): emitir um
`type` que o contrato não tem, ou um payload que ele não declara, quebra o `tsc`.

---

## A conversa: `ConversationRef { engine, id }`

A conversa de uma sessão é sempre `{ engine, id }`, nas portas, no banco
([05-persistence](05-persistence.md)) e no contrato. O núcleo só confere a forma (motor com nome de
motor, id sem espaço e de até 256 caracteres); se o id é um que o motor entrega é pergunta do motor,
feita pelo registro (`EngineRegistry.conversation`, `TranscriptStoreRegistry.conversation`). Motor que
não está habilitado e id que o motor nunca entrega são `INVALID_INPUT`; numa rota de histórico, motor
não habilitado é `404`, a mesma resposta de uma conversa que não existe.

---

## O registro e a configuração

| Variável | O que diz |
|---|---|
| `RC_ENGINES_ENABLED` | os motores habilitados, separados por vírgula; vazia = todos os que um adapter registra |
| `RC_ENGINE_DEFAULT` | o motor de uma sessão que o cliente não nomeou; vazia = o primeiro habilitado |

A composição (`infrastructure/modules/engines/index.ts`) conhece os adapters registrados e monta, no
boot, o `EngineRegistry` (sessões) e o `TranscriptStoreRegistry` (histórico). Um nome que nenhum adapter
registra **recusa o boot**: configuração que ninguém consegue rodar é pega antes da primeira sessão.

Registrar um motor novo é: o adapter em `adapter/outbound/engines/<motor>/` (porta de motor e store de
histórico), os seus providers num `<motor>.providers.ts` da composição, e o token dele na lista de
`engineSessionProviders`/`engineTranscriptProviders`. Nenhum outro arquivo do núcleo muda.

---

## `GET /engines`

Os motores habilitados, o padrão primeiro, com o que cada um sabe fazer — antes de existir sessão. Nada
é aberto, nenhuma cota é gasta, e a credencial nunca faz parte da resposta. O tipo é o `EngineListPayload`
do pacote `contracts` ([D-09](../../plans/28-agent-neutral-core/decisions.md#f1--porta-de-motor-e-conversa)).
O `displayName` é como uma tela nomeia o agente: o `{agent}` de uma string, nunca escrito no núcleo.

---

## Capacidades

Declaradas pelo adapter, nunca supostas: `GET /engines` dá as do motor, `session.started.capabilities`
dá as da sessão. A lista é o `EngineCapabilities` do domínio (e do contrato), e cada item serve a mais de
um motor ([27 · D-10](../../plans/27-conversation-losses/decisions.md#f2--contrato)). O cliente esconde o
que o motor da sessão não tem; com o Claude como motor único, nada some.

---

## A ferramenta canônica

Quem lê uma chamada de ferramenta é o adapter do motor dela ([28 · F2](../../plans/28-agent-neutral-core/F2-canonical-tools.md)).
O do Claude tem `adapter/outbound/engines/claude/tool-classifier.ts`: uma tabela exaustiva nome nativo →
`CanonicalTool { kind, label, subject, changes, origin }` (um `Record` sobre a união dos nomes, então um
nome novo sem classificação não compila), `mcp__srv__tool` como `mcp`, e qualquer outro nome como
`other`, que sempre pede permissão. O núcleo decide tudo pelo `CanonicalTool`:

| Quem | Decide por |
|---|---|
| `domain/permission/risk.classifier.ts` | `kind`; o comando do `shell` continua parseado no domínio, que é neutro ([D-29](../../plans/28-agent-neutral-core/decisions.md#f2--ferramentas-canônicas)) |
| `domain/session/session-diff.ts` | o `FileChange` (`diffableChangeOf`, `toolDiffOf`, `pendingDiffOf`) |
| o desfazer (os ganchos do runner) | `pathsChangedBy(tool)`: os caminhos dos `changes` |
| `domain/audit/disclosed-input.ts` | `kind` `file.read` e `subject` (`paths`, `window`) |
| o contrato | `canonicalToolPayload(tool, rawInput)`, no `tool.started` e no `permission.requested` |

O `CanonicalTool` também leva o que a chamada pede e o que ela muda além de arquivos (F3): a
`interaction` de uma pergunta ou de um plano (o adapter normaliza o input do motor; no Claude,
`question-input.ts`), e o passo de tarefa (`TaskStep`: `replace`, `create`, `update`), que o
`TaskListTracker` do domínio aplica quando a chamada termina bem e vira `session.tasksChanged`. Pergunta e
plano são "só humano" pelo `kind` (`HUMAN_ONLY_KINDS`): nenhuma regra nem o Permitir tudo os responde.

O adapter classifica a chamada quando ela acontece: no stream (`SdkMessageMapper`, com a pasta da
sessão), no histórico (`historicalEvents`, com a pasta da conversa), no `canUseTool` e nos ganchos. O que
foi gravado antes, nas palavras do motor (a trilha de auditoria; as regras, na F5), o núcleo lê pelo
`ToolClassifiers` de `application/engine/`, que a composição monta com o classificador puro de cada motor
([D-31](../../plans/28-agent-neutral-core/decisions.md#f2--ferramentas-canônicas)).

---

## Controles que são valores

O `EngineControl` tem também o que não é chamada: o `compactionPrompt`, o prompt que compacta a conversa
naquele motor (no Claude, `/compact`). O `session.compact` o manda pela fila, como um prompt, e o cliente
nunca o conhece ([28 · B-23](../../plans/28-agent-neutral-core/F3-interactions.md#b-23--o-comando-sessioncompact-)).

---

## A janela do protocolo anterior

O contrato subiu para `v2` na F1 do plano 28 ([D-08](../../plans/28-agent-neutral-core/decisions.md#f1--porta-de-motor-e-conversa)).
O gateway fala `v2` e `v1`: cada conexão fala a versão do último frame que mandou, e
`infrastructure/websocket/protocol-window.ts` traduz na borda, frame a frame — o `session.started` da
`v1` leva `claudeSessionId`, o `session.start` da `v1` com `resumeSessionId` vira `resumeFrom`, e o
`tool.started` e o `permission.requested` da `v1` levam `toolName` e `input` no lugar da ferramenta
canônica (`shared/protocol/previous-tool-fields.ts`, que o REST também usa). O núcleo
só emite a forma atual. As rotas REST da `v1` (`/transcripts/:sessionId/…`) respondem o mesmo das novas
(`/transcripts/:engine/:id/…`). A janela fecha na F7 (B-47), e o arquivo sai com ela.

---

## Erros do agente

| Código | Status | Quando |
|---|---|---|
| `AGENT_UNAVAILABLE` | 502 | o agente falhou ou morreu — `params.engine` diz qual |
| `AGENT_TIMEOUT` | 504 | o agente não respondeu no prazo |
| `ENGINE_CAPABILITY_UNAVAILABLE` | 409 | pediu-se o que o motor não tem |

O catálogo é o [04-errors-and-http](../shared/04-errors-and-http.md).
