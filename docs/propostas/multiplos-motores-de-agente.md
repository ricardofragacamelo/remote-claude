# Proposta — Múltiplos motores de agente de codificação

**Estado:** rascunho, em discussão. Nenhum código escrito.
**Criada em:** 2026-10-03, a partir de uma conversa com o usuário: "hoje usamos o Claude como base;
se eu quisesse outra ferramenta, tipo Copilot, ou outra de mercado, o que precisaria mudar? E para
suportar vários motores?"
**Destino:** servir de insumo para um ou mais planos em [docs/plans/](../plans/README.md). Esta
proposta **não** é um plano: não tem fases com tarefas nem critério de conclusão. Ela fixa o **quê**
e o **porquê**, mede o impacto e lista o que falta decidir antes de virar plano.
**Relação com a [proposta de workflow de sessões](workflow-de-sessoes.md):** aquele documento **não
é alterado** por esta proposta. O impacto sobre ele está todo no §10 daqui, como uma lista de ajustes
a absorver quando os planos de workflow forem criados — ou quando o usuário decidir revisar aquela
proposta.

---

## 1. O pedido

Hoje o produto opera **um** motor: o Claude Code instalado na máquina, via Claude Agent SDK
([ADR-001](../architecture/shared/00-decisions.md#adr-001--claude-agent-sdk-não-cli-direto-nem-managed-agents)).
O usuário quer saber:

1. o que muda para **trocar** o Claude por outro motor de mercado — GitHub Copilot, OpenAI Codex,
   Gemini CLI, ou outro;
2. o que muda para **suportar vários ao mesmo tempo**, escolhendo o motor por sessão;
3. o que isso faz com a **execução de workflows** já proposta, em que sessões são encadeadas,
   perguntas são respondidas por outras sessões e o trabalho é verificado pela evidência.

A resposta curta: o SDK do Claude está bem isolado, mas **o Claude como produto não está**. A
porta, o contrato WebSocket, o banco, o domínio e as telas foram desenhados em torno de conceitos
que só o Claude Code tem: nomes de ferramentas, modos de permissão, slash commands, fork de conversa
e custo em dólar. Trocar de motor é viável. O grosso do trabalho, porém, não está no adapter novo, e
sim em **tornar neutro o que hoje vive no meio do sistema e nos clientes**.

---

## 2. Vocabulário

| Termo | Significado |
|---|---|
| **Motor** (*engine*) | um agente de codificação de mercado que o backend opera: Claude Code, Copilot, Codex, Gemini CLI… Identificado por um `EngineId` fechado (`claude`, `copilot`, `codex`, `acp:<nome>`). |
| **Adapter de motor** | a implementação da porta de motor para um motor. Mora em `adapter/outbound/<motor>/` e é o **único** lugar que conhece o SDK ou o protocolo daquele motor. |
| **Capacidade** | algo que um motor pode ou não oferecer: retomar conversa, fork, slash commands, saída estruturada, custo em US$… Declarada pelo adapter, anunciada aos clientes, respeitada pela aplicação (§6.2). |
| **Conversa** | o histórico persistente de um motor, que sobrevive à sessão viva. Hoje é a `ClaudeSessionId`; passa a ser `{ engine, id }` (§6.7). |
| **Ferramenta canônica** | a classificação **nossa** de uma chamada de ferramenta (`file.edit`, `shell`, `search`…), com um payload normalizado, independente do nome que o motor dá (§6.3). |
| **Interação canônica** | as três coisas que o agente pede ao humano além de permissão: **pergunta estruturada**, **aprovação de plano** e **lista de tarefas** (§6.4). |
| **ACP** | [Agent Client Protocol](https://agentclientprotocol.com): um protocolo aberto (JSON-RPC 2.0) entre um cliente e um agente de codificação, que vários motores já falam (§5.2). |

---

## 3. Princípios

1. **O contrato é nosso, nunca de um motor.** O que vale para o `SDKMessage` hoje
   ([ADR-006](../architecture/shared/00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru))
   passa a valer para nomes de ferramenta, modos de permissão, ids de conversa e unidade de custo.
2. **O modelo de segurança não é negociável por motor.** Todo motor suportado precisa (a) parar
   **antes** de cada escrita, execução ou chamada externa e esperar o nosso veredito, (b) deixar
   rastro de auditoria do que executou e (c) não ter um caminho de autoaprovação que contorne o nosso
   gate. Motor que não cumpre os três **não é registrado**: o boot recusa, e a falha é fechada.
3. **Capacidade declarada, nunca suposta.** A aplicação e as telas perguntam ao motor o que ele sabe
   fazer. Nenhum `if (engine === 'claude')` fora do adapter e da configuração.
4. **Menor denominador comum só no núcleo.** O núcleo obrigatório é pequeno (§6.1). O resto é
   capacidade opcional, e o Claude não perde nada do que tem hoje por existir um motor mais pobre.
5. **Um motor por conversa.** Trocar de motor no meio de uma conversa não existe; o que existe é
   começar outra conversa em outro motor, passando um resumo (§6.7).
6. **Verificação pela evidência continua sendo do motor de workflow, não do agente.** Isso não
   muda com o motor e é o que torna a qualidade comparável entre motores (§10).
7. **As regras do repositório valem igual:** contrato nas três pontas na mesma mudança, i18n por
   `messageKey`, I/O logado em `debug`, três níveis de teste, 90 % por arquivo.

---

## 4. Estado atual

### 4.1 O que já está a favor

| Peça | Onde | Por que ajuda |
|---|---|---|
| SDK confinado | [adapter/outbound/claude/](../../backend/src/adapter/outbound/claude/), 18 arquivos, cerca de 3,6 mil linhas | `domain/` e `application/` não importam o SDK. O `dependency-cruiser` já garante isso. |
| Protocolo próprio | [ADR-006](../architecture/shared/00-decisions.md), [sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts) | clientes nunca recebem o formato do SDK; um motor novo ganha um mapper equivalente |
| Permissão é nossa | [PermissionBridge](../../backend/src/adapter/outbound/claude/permission-bridge.ts) implementa `SessionPermissionGate` | o bridge só guarda a promise. Regras, prazo, histórico e fan-out são do módulo `permission`, agnóstico. |
| Desfazer é nosso | [ADR-013](../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso) | não depende de `rewindFiles()` do Claude: o store de checkpoint funciona para qualquer motor que diga **qual arquivo** vai escrever |
| Reconexão é nossa | [ADR-012](../architecture/shared/00-decisions.md#adr-012--reconexão-não-usa-reinitialize-o-registro-de-pendentes-é-nosso) | o registro de pendentes e o replay não dependem do motor |
| Fila de prompts | [input-queue.ts](../../backend/src/adapter/outbound/claude/input-queue.ts), `PromptQueue` no domínio | a fila é de domínio; só a entrega é do adapter |
| Instruções de projeto em `AGENTS.md` | [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md) só importa | Codex e Copilot leem `AGENTS.md`; o padrão deste repositório já é o portável |

### 4.2 Onde o Claude vaza

Inventário de 2026-10-03. Os números são de `grep` e servem para dimensionar, não para contar
tarefas.

#### Backend — porta e aplicação

- [ClaudeSessionPort](../../backend/src/application/session/ports/claude-session.port.ts) é
  "a única porta do Agent SDK", e tem forma de Claude:
  - `ClaudeSessionStart` leva `conversation.claudeSessionId`, `resumedFrom`, `effort` e
    `forkAt { keepUpTo, dropsTurn }` (o edit-and-resend do plano 08, D-19, que usa
    `resumeSessionAt`/`resumeDropsTurn` do SDK);
  - `ClaudeSessionHandle` expõe `cliVersion`, `supportedCommands()`, `supportedModels()`,
    `contextUse()` e `mcpServers()`, que são chamadas de controle do Claude Code;
  - `onForkRejected` existe porque o CLI do Claude pode recusar o ponto do fork.
- O [TranscriptStore](../../backend/src/application/transcript/ports/transcript-store.port.ts) lê
  o store de conversas **do Claude** (`listSessions`, `getSessionMessages`, subagents por
  `toolUseId`). As medições de custo e cache que ele documenta (21 ms, 281 ms, 30 MB) são do Claude.
- Erros de domínio com nome de produto: `ClaudeUnavailableError`, `ClaudeTimeoutError`,
  `InvalidClaudeSessionIdError`.
- `ClaudeSessionId` (value object) aparece em **37 arquivos** do backend.

#### Backend — adapter e segurança

- [query.factory.ts](../../backend/src/adapter/outbound/claude/query.factory.ts) **recusa** abrir
  uma sessão sem `settingSources: ['project']`, sem o hook `PreToolUse` de auditoria e sem
  `canUseTool` ([ADR-011](../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)).
  É a defesa certa, mas escrita em termos de Claude. Cada motor precisa da **sua** versão dessa
  asserção (§6.6).
- [trusted-directory.ts](../../backend/src/adapter/outbound/claude/trusted-directory.ts): em pasta
  confiável, o SDK do Claude pula o `canUseTool`. Outros motores têm armadilhas equivalentes, como
  "aprovar para sempre" no Copilot ou `execpolicy` no Codex.
- [file-tools.ts](../../backend/src/adapter/outbound/claude/file-tools.ts): a tabela
  `Write`/`Edit`/`MultiEdit`/`NotebookEdit → campo do caminho` alimenta o desfazer. É o ponto
  exato onde o desfazer fica cego para outro motor.
- [sdk-options.factory.ts](../../backend/src/adapter/outbound/claude/sdk-options.factory.ts):
  `enableFileCheckpointing`, `includePartialMessages`, `maxTurns` e a variável
  `CLAUDE_CODE_ENABLE_TODO_TOOLS`.
- Instalação e versão: [cli-version.ts](../../backend/src/adapter/outbound/claude/cli-version.ts),
  [claude-environment.ts](../../backend/src/adapter/outbound/claude/claude-environment.ts),
  [installation-mapping.ts](../../backend/src/adapter/outbound/claude/installation-mapping.ts), e a
  credencial em `~/.claude/.credentials.json`, que o
  [plano 19](../plans/19-distribution/README.md) (R-02) precisa herdar.

#### Banco

- Coluna `claude_session_id`, com índice, em tabelas de sessão e origem.

#### Contrato

- `claudeSessionId` em `session.started` e na rota `GET /transcripts/:claudeSessionId/messages`.
- Modos de permissão com os valores do Claude: `default`, `acceptEdits`, `plan` e
  `bypassPermissions`.
- Conceitos do Claude no contrato: `thinking`, subagents (`parentToolUseId`), `session.compacted`,
  `effort`, `session.rewindFiles`, o menu de slash commands (`GET /sessions/:id/commands`,
  `GET /catalog`), `costUsd` em `turn.completed`.
- `tool.started`, `tool.completed` e `permission.requested` levam o **nome** e o **input cru** da
  ferramenta do Claude.

#### Web e mobile — o acoplamento mais caro

- **Os clientes interpretam as ferramentas do Claude pelo nome e pelo formato do input:**
  - [tool-labels.ts](../../web/src/features/session/lib/tool-labels.ts) e
    [ToolRow.tsx](../../web/src/features/session/components/conversation/ToolRow.tsx): rótulo
    compacto por ferramenta;
  - [edit-preview.ts](../../web/src/features/permission/lib/edit-preview.ts),
    [useToolDiff.ts](../../web/src/features/session/hooks/useToolDiff.ts) e
    [ToolDiffView.tsx](../../web/src/features/session/components/conversation/ToolDiffView.tsx):
    diff a partir de `old_string`/`new_string`/`content` de `Edit`/`MultiEdit`/`Write`;
  - [task-list.ts](../../web/src/features/session/lib/task-list.ts) e
    [TaskStrip.tsx](../../web/src/features/session/components/composer/TaskStrip.tsx):
    `TodoWrite` e `Task*`;
  - [PlanApprovalCard.tsx](../../web/src/features/permission/components/PlanApprovalCard.tsx):
    `ExitPlanMode`;
  - [PermissionRequestCard.tsx](../../web/src/features/permission/components/PermissionRequestCard.tsx);
  - no app, [permission_card_view.dart](../../mobile/lib/features/permission/presentation/widgets/permission_card_view.dart).
- `claudeSessionId` aparece em 19 arquivos de web e mobile.
- Chaves de i18n e textos de tela com "Claude": "Painel do Claude", "Configuração do Claude"…

#### Planos e documentação

- O [plano 13 — Configuração do Claude](../plans/13-claude-settings/README.md) é por definição de um
  motor: conta, instalação, MCP, plugins, skills e `.claude/`.
- O [plano 16 — Uso e custo](../plans/16-usage-and-cost/README.md) assume custo em US$.
- O [plano 18 — Logs e diagnóstico](../plans/18-logs-and-diagnostics/README.md) lê as versões da
  instalação do Claude.
- Os kinds de auditoria `claude.*`.
- Documentos normativos: [backend/04-claude-integration](../architecture/backend/04-claude-integration.md),
  [discovery 01](../discovery/01-descoberta-claude-agent-sdk.md), ADR-001 e ADR-011.
- O próprio nome do produto (`remote-claude`) e o formato `remote-claude/workflow@1` da proposta de
  workflow.

---

## 5. Os motores de mercado

**Conferido em 2026-10-03** nas fontes do §19. Esse mercado muda todo mês: cada linha marcada
"confirmar" é item obrigatório do spike de descoberta (§17, plano M1) antes de qualquer adapter.

### 5.1 Como cada um é operado por programa

| Motor | Como se opera | Observações |
|---|---|---|
| **Claude Code** | Claude Agent SDK (`query()`), subprocesso do CLI, streaming input | é o que existe; referência de capacidades |
| **GitHub Copilot** | **Copilot SDK** (`@github/copilot-sdk`, também em Python, Go, .NET e Rust), que opera o **Copilot CLI** via JSON-RPC; técnico em jan/2026, *public preview* desde abr/2026 | `createSession`/`resumeSession`/`listSessions`; `onPermissionRequest` **obrigatório** desde a mudança de 2026 (antes era aprovar tudo); hooks `onPreToolUse`/`onPostToolUse`; `onUserInputRequest`; `listModels()`; exige login do GitHub e assinatura Copilot; aceita BYOK. O Copilot CLI também fala ACP (*public preview*). |
| **OpenAI Codex** | **`codex app-server`** (JSON-RPC 2.0 sobre stdio, WebSocket experimental) ou o **Codex SDK** TypeScript, que embrulha o CLI | modelo *thread → turn → item*; `thread/start`, `thread/resume`, `thread/fork`, `thread/list`, `thread/rollback`; `turn/start`, `turn/steer`, `turn/interrupt`; aprovações `item/commandExecution/requestApproval` e `item/fileChange/requestApproval` que **bloqueiam**; sandbox próprio (`readOnly`, `workspaceWrite`, `dangerFullAccess`); `model/list`; uso em tokens no `turn/completed`; conversas em `~/.codex/sessions`. |
| **Gemini CLI** e outros (Goose, Cline, OpenHands, Mistral Vibe, Auggie…) | **ACP** nativo | um adapter ACP cobre todos, no denominador comum do protocolo |
| Claude Code e Codex **via ACP** | adapters da comunidade e da Zed | existem, mas para nós perdem capacidades que os SDKs nativos dão; não substituem os adapters nativos |

### 5.2 O ACP em uma página

O que importa do protocolo para esta proposta:

- **Métodos do agente:** `initialize` (negocia versão e capacidades), `authenticate`, `session/new`,
  `session/load` (retoma **com** replay do histórico, se `loadSession`), `session/resume` (sem
  replay), `session/list`, `session/prompt`, `session/cancel`, `session/close`, `session/set_mode` e
  `session/set_config_option`.
- **Métodos do cliente**, que o agente chama em nós:
  - `session/request_permission`: o pedido bloqueante, que é o nosso gate;
  - `fs/read_text_file` e `fs/write_text_file`: o agente pode delegar o disco ao cliente, o que
    permite **ver toda escrita**;
  - `terminal/*`: o agente pode delegar a execução de comandos ao cliente;
  - `elicitation/create`: entrada estruturada do usuário.
- **Atualizações de sessão:** pedaços de conteúdo, chamadas de ferramenta com tipo (*tool kind*) e
  conteúdo — inclusive um `Diff` com caminho e texto antigo e novo —, lista de comandos disponíveis,
  mudança de modo e de configuração.
- **Custo:** existe um tipo `Cost` (`amount`, `currency`), mas reportá-lo é opcional para o agente.

O ponto forte do ACP é exatamente o que mais falta ao produto para ser multimotor: **tipos de
ferramenta, diff estruturado e capacidades negociadas já padronizados**. O ponto fraco: **não há
saída estruturada padronizada**, e é dela que os workflows dependem (§10.3).

### 5.3 Matriz de capacidades

Legenda: ✔ tem · ◐ parcial ou com ressalva · ✗ não tem · ? confirmar no spike.

| Capacidade | Claude (SDK) | Copilot (SDK) | Codex (app-server) | ACP genérico |
|---|---|---|---|---|
| **Pedido de permissão bloqueante por ferramenta** (eliminatório) | ✔ `canUseTool` | ✔ `onPermissionRequest` | ◐ só comando e mudança de arquivo; leitura e MCP ? | ✔ `session/request_permission`, se o agente pedir |
| **Interceptação pré-ferramenta para auditoria** (eliminatório) | ✔ hook `PreToolUse` | ✔ `onPreToolUse` | ◐ `item/started` (observa, não intercepta) ? | ◐ `tool_call` (observa) |
| Desligar autoaprovação própria do motor | ✔ `settingSources: ['project']` | ? (aprovações "permanentes" e config de usuário) | ? (`approvalPolicy`, `execpolicy`) | depende do agente |
| Streaming de texto | ✔ | ✔ | ✔ | ✔ |
| Fila de prompts / prompt durante o turno | ✔ streaming input | ? | ✔ `turn/steer` | ✗ (enfileirar do nosso lado) |
| Interromper | ✔ | ✔ `abort()` | ✔ `turn/interrupt` | ✔ `session/cancel` |
| Retomar conversa | ✔ `resume` | ✔ `resumeSession` | ✔ `thread/resume` | ◐ `session/load`/`resume`, se anunciado |
| Listar conversas (histórico) | ✔ `listSessions` | ✔ `listSessions` | ✔ `thread/list` | ◐ `session/list`, se anunciado |
| Ler mensagens de uma conversa | ✔ `getSessionMessages` | ? | ✔ `thread/read` | ◐ só pelo replay do `session/load` |
| Fork / editar e reenviar | ✔ `forkSession`, `resumeSessionAt` | ? | ✔ `thread/fork`, `thread/rollback` | ✗ |
| Saída estruturada (JSON Schema) | ✔ `outputFormat` | ? (`responseSchema` citado) | ✔ `outputSchema` | ✗ |
| Pergunta estruturada ao humano | ✔ `AskUserQuestion` | ◐ `onUserInputRequest` | ? | ◐ `elicitation/create` |
| Aprovação de plano | ✔ `ExitPlanMode` | ? (modo plano do CLI) | ? | ◐ modos + atualização de plano |
| Lista de tarefas | ✔ `TodoWrite`/`Task*` | ? | ◐ itens de plano ? | ◐ atualização de plano |
| Subagents | ✔ | ? | ✔ | ✗ |
| Raciocínio visível (*thinking*) | ✔ | ? | ✔ itens de raciocínio | ◐ conteúdo de pensamento |
| Slash commands do projeto | ✔ | ? (skills, prompts) | ◐ skills | ◐ comandos disponíveis |
| Lista de modelos | ✔ | ✔ `listModels` | ✔ `model/list` | ◐ opção de configuração |
| Esforço de raciocínio | ✔ `effort` | ? | ✔ | ✗ |
| Uso de contexto por categoria | ✔ `getContextUsage` | ✗ ? | ✗ ? | ✗ |
| Estado dos servidores MCP | ✔ | ? | ✔ | ✗ |
| Custo | ✔ US$ por turno | ◐ *premium requests* ? | ◐ tokens, sem US$ | ◐ `Cost` opcional |
| Imagens no prompt | ✔ | ? | ✔ | ◐ `promptCapabilities.image` |
| Diff estruturado da mudança | ◐ reconstruído do input | ? | ✔ `fileChange` | ✔ conteúdo `Diff` |

**Leitura da matriz:**

- o **Copilot** passa nos dois requisitos eliminatórios **no papel**. O que o spike precisa provar é
  que nenhuma configuração de usuário ou aprovação "permanente" contorna o handler;
- o **Codex** tem o melhor conjunto de capacidades depois do Claude, mas a permissão é **por
  categoria** (comando, arquivo), com o resto confiado ao sandbox. Ou aceitamos isso com uma
  decisão registrada, ou o Codex roda só com `readOnly` fora das categorias que pedem aprovação;
- o **ACP** cobre muitos motores, mas sem saída estruturada nem fork. Serve para **conversa
  interativa**, não para os papéis automáticos do workflow (§10.3).

---

## 6. Arquitetura alvo

```
                         ┌───────────────── application/session ─────────────────┐
  web ─┐                 │  StartSession · DriveSession · Attach · Undo · Queue  │
       ├─ WS / REST ──►  │              │                                        │
  app ─┘  (contrato      │              ▼                                        │
          neutro)        │     AgentEnginePort  ◄── EngineRegistry               │
                         └──────────────┬────────────────────────────────────────┘
                                        │  ferramentas canônicas · interações
                                        │  canônicas · capacidades · ConversationRef
            ┌───────────────────┬───────┴───────────┬────────────────────┐
            ▼                   ▼                   ▼                    ▼
   adapter/outbound/claude  …/copilot          …/codex              …/acp
   Agent SDK (nativo)       Copilot SDK        app-server           JSON-RPC stdio
   mapper + gate + audit    mapper + gate…     mapper + gate…       mapper + gate…
            │                   │                   │                    │
            ▼                   ▼                   ▼                    ▼
       claude CLI          copilot CLI          codex CLI       gemini / goose / …
```

### 6.1 A porta de motor

`ClaudeSessionPort` vira `AgentEnginePort`, com um **núcleo obrigatório** e **capacidades
opcionais**:

```ts
/** What every engine must do, or it is not registered (§3.2). */
export interface AgentEnginePort {
  readonly engine: EngineId;

  /** Installed? Which version? Authenticated? What can it do? No quota spent. */
  describe(): Promise<EngineDescription>;

  start(input: AgentSessionStart): Promise<AgentSessionHandle>;
}

export interface AgentSessionStart {
  readonly sessionId: SessionId;
  readonly workspace: WorkspacePath;
  readonly model: string | null;
  readonly permissionMode: CanonicalPermissionMode;          // §6.5
  readonly conversation: { readonly ref: ConversationRef; readonly resumedFrom: ConversationRef | null };
  readonly options: EngineOptions;                           // effort, forkAt… only if capable
  onEvent(event: SessionEvent): void;                        // already ours (ADR-006)
  onClosed(reason: SessionCloseReason): void;
}

export interface AgentSessionHandle {
  readonly capabilities: EngineCapabilities;                 // §6.2
  prompt(text: string, extras?: PromptExtras): string;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  /** Present only when the matching capability is. */
  readonly control?: Partial<EngineControl>;                 // setModel, commands, models, context, mcp…
}
```

- O **gate de permissão** e a **auditoria pré-ferramenta** não estão na porta: são portas que o
  adapter **consome** (`SessionPermissionGate`, `ToolInvocationPort`), como hoje. Isso garante que
  todos os motores passem pelo mesmo módulo `permission`.
- Pedir uma capacidade que o motor não tem é um erro de domínio próprio
  (`EngineCapabilityUnavailableError` → `code` + `messageKey`, com o status do
  [04-errors-and-http](../architecture/shared/04-errors-and-http.md)), nunca um `undefined` que vaza.
- Um `EngineRegistry` na aplicação resolve `EngineId → AgentEnginePort`. No boot, cada adapter
  habilitado em configuração roda a sua **asserção de segurança** (§6.6); se falhar, o motor fica
  `unavailable` com o motivo, e os outros sobem normalmente.

### 6.2 Capacidades

```ts
interface EngineCapabilities {
  resume: boolean;            history: 'read' | 'list' | 'none';
  fork: 'atMessage' | 'whole' | 'none';
  structuredOutput: 'native' | 'prompted' | 'none';
  promptWhileBusy: boolean;   images: boolean;
  questions: boolean;         planApproval: boolean;   taskList: boolean;
  subagents: boolean;         thinking: boolean;
  slashCommands: boolean;     modelSwitch: boolean;    effort: boolean;
  contextUse: boolean;        mcpStatus: boolean;
  cost: 'usd' | 'tokens' | 'requests' | 'none';
  diff: 'structured' | 'derived' | 'none';
  permissionModes: readonly CanonicalPermissionMode[];
}
```

- São **por sessão**, não só por motor: a versão do CLI ou o modelo escolhido podem mudar o que vale.
  A sessão anuncia as suas em `session.started` e o catálogo pré-sessão anuncia as do motor
  (`GET /engines`, §8).
- Os clientes **escondem** o que não existe: menu de `/`, seletor de esforço, medidor de contexto,
  "editar e reenviar", MCP, thinking. Esconder é melhor que desabilitar com tooltip: o motor nunca
  vai ter, e o usuário escolheu esse motor.

### 6.3 Ferramentas canônicas

O maior item de trabalho do produto. Cada adapter classifica cada chamada de ferramenta num **tipo
canônico** e normaliza o payload; os clientes renderizam pelo tipo.

| Tipo canônico | Payload normalizado | Claude | Copilot (kind) | Codex (item) | ACP (*tool kind*) |
|---|---|---|---|---|---|
| `file.read` | `path`, `range?` | `Read` | `read` | ? | `read` |
| `file.edit` | `path`, `diff { oldText, newText }[]` | `Edit`, `MultiEdit`, `NotebookEdit` | `write` | `fileChange` | `edit` + conteúdo `Diff` |
| `file.write` | `path`, `content` | `Write` | `write` | `fileChange` | `edit` |
| `file.delete` / `file.move` | `path`, `to?` | — (via `Bash`) | ? | `fileChange` | `delete`, `move` |
| `search` | `pattern`, `path?` | `Grep`, `Glob` | ? | ? | `search` |
| `shell` | `command`, `cwd` | `Bash` | `shell` | `commandExecution` | `execute` |
| `web` | `url` ou `query` | `WebFetch`, `WebSearch` | `url` | `webSearch` ? | `fetch` |
| `mcp` | `server`, `tool`, `input` | `mcp__*` | `custom-tool` | `mcpToolCall` | `other` |
| `agent` (subagent) | `description` | `Task`/`Agent` | ? | `collabAgent…` ? | — |
| `other` | `name`, `input` cru | o resto | o resto | o resto | `other` |

Regras:

- o evento carrega `kind`, o payload normalizado, `toolName` (o nome do motor, para exibir e para
  regras) e **não** o input cru. O input cru vai só para a **auditoria**, que já o guarda hoje;
- **as regras de permissão** ([plano 03](../plans/03-rules-and-audit/README.md),
  [plano 15](../plans/15-rules-management/README.md)) passam a casar por `kind` **e** por
  `toolName`: `shell: npm test` vale para todos os motores, `Bash(npm test)` só para o Claude. As
  regras existentes migram para a forma canônica quando o mapeamento é inequívoco;
- **o desfazer** ([ADR-013](../architecture/shared/00-decisions.md)) passa a perguntar ao payload
  canônico quais caminhos `file.*` vão mudar, em vez da tabela de nomes de
  [file-tools.ts](../../backend/src/adapter/outbound/claude/file-tools.ts). `shell` continua fora,
  como hoje, e pela mesma razão;
- **o diff**: motores com diff estruturado (Codex, ACP) o entregam pronto; o Claude continua
  derivando do input, mas **no adapter**, não no cliente. `edit-preview.ts` e `useToolDiff.ts` deixam
  de conhecer `old_string`.

### 6.4 Interações canônicas

O que o agente pede ao humano além de "posso executar isto?":

| Interação | Objeto canônico | Claude | Outros |
|---|---|---|---|
| **Pergunta estruturada** | `question { questions[1..4] { prompt, header?, options[2..4], multi } }` → resposta `answers` | `AskUserQuestion` via `canUseTool` + `updatedInput` | Copilot `onUserInputRequest`; ACP `elicitation/create`; Codex ? |
| **Aprovação de plano** | `plan { markdown, path? }` → `approve` ou `reject { reason }` | `ExitPlanMode` | ACP modo + plano; outros ? |
| **Lista de tarefas** | `tasks [{ id, title, status }]` | `TodoWrite`, `Task*` | ACP atualização de plano; Codex ? |

- O adapter traduz a interação para o objeto canônico e a resposta canônica de volta para o formato
  do motor (no Claude, o `updatedInput { questions, answers }`).
- [PlanApprovalCard](../../web/src/features/permission/components/PlanApprovalCard.tsx) e
  [TaskStrip](../../web/src/features/session/components/composer/TaskStrip.tsx) passam a
  consumir o objeto canônico.
- Isso **coincide** com a lacuna 1 e a lacuna 2 do §4 da proposta de workflow (veredito só com
  `allow`/`deny`; `AskUserQuestion` sem tela). Fazer as duas de uma vez, já na forma canônica, evita
  construir a resposta a `AskUserQuestion` duas vezes (§10.2).

### 6.5 Modos de permissão canônicos

| Canônico | Significado | Claude | Codex | Copilot | ACP |
|---|---|---|---|---|---|
| `ask` | tudo que não é leitura passa pelo gate | `default` | aprovação sob demanda + sandbox de escrita no workspace ? | handler para tudo | modo padrão |
| `acceptEdits` | `file.*` dentro da pasta é aceito; o resto pergunta | `acceptEdits` | ? | handler aprova `write` no workspace | ? |
| `readOnly` | nada escreve, nada executa | `plan` | sandbox `readOnly` | handler nega `write`/`shell` | modo "ask"/plan ? |

- **`bypassPermissions` não entra no canônico.** Hoje ele já é recusado; com vários motores, a
  recusa vira estrutural.
- **`readOnly` é garantido pelo nosso gate, não pelo modo do motor.** O gate nega todo `file.edit`,
  `file.write`, `file.delete`, `file.move` e `shell` quando o modo é `readOnly`, mesmo que o motor
  ache que pode. O modo do motor fica como segunda camada. Isso é o que torna `permissions: plan` dos
  workflows confiável em qualquer motor (§10.6).

### 6.6 Segurança por motor

O ADR-011 é reescrito como **contrato que todo adapter cumpre**, verificado em código no ponto de
abertura da sessão (como o [query.factory.ts](../../backend/src/adapter/outbound/claude/query.factory.ts)
faz hoje):

1. **gate bloqueante** ligado ao `SessionPermissionGate`. Nenhum "aprovar tudo" do SDK (por
   exemplo `PermissionHandler.approve_all` no Copilot) pode ser alcançável por configuração;
2. **auditoria pré-ferramenta** ligada ao `ToolInvocationPort`. Onde o motor só **observa** (início
   de item no Codex, `tool_call` no ACP), a auditoria registra no início do item. É mais fraca,
   porque o registro pode chegar depois de uma leitura já feita; vira decisão (ME-07);
3. **sem autoaprovação do motor**: configuração de usuário, listas "sempre permitir", pastas
   confiáveis e aprovações permanentes desligadas ou isoladas. No Claude é
   `settingSources: ['project']` mais a limpeza da marca de confiança; nos outros, é item do spike;
4. **escopo de pasta**: o `cwd` e as raízes do sandbox do motor ficam dentro da allowlist de raízes;
5. **credenciais do motor** nunca passam pelo backend em log, contrato ou banco. Cada motor usa a
   própria credencial da máquina, como o Claude hoje
   ([ADR-010](../architecture/shared/00-decisions.md) vale para o **nosso** login, não para o do
   motor);
6. **arquivos de configuração de motor entram na lista de sensíveis**
   ([sensitive-files.ts](../../backend/src/domain/files/services/sensitive-files.ts)): `.codex/`,
   `.gemini/`, `.github/copilot-instructions.md`, além de `.claude/`. Um agente que reescreve a
   configuração de **outro** motor é um vetor novo, que só existe quando há vários.

Motor que não cumpre os itens 1 a 3 no spike **não é suportado**, mesmo que seja popular.

### 6.7 Conversa, histórico e retomada

- `ClaudeSessionId` vira `ConversationRef { engine: EngineId, id: string }`. A validação do formato
  do id é do adapter, porque cada motor tem o seu.
- `TranscriptStore` vira **um por motor**, atrás de um `TranscriptStoreRegistry`. A tela de
  histórico lista por motor, ou junta todos com um selo de motor.
- **Motor sem histórico legível** (ACP sem `session/list`, por exemplo): duas saídas, e é uma
  decisão grande (ME-05):
  - **(a)** o histórico daquele motor simplesmente não existe na ferramenta;
  - **(b)** o backend passa a **gravar os eventos** das sessões daquele motor no Postgres e serve o
    histórico a partir daí. Hoje isso é evitado de propósito: o store do Claude é a fonte, e um
    parser próprio quebraria. Para um motor sem store, porém, não há o que quebrar.
- **Trocar de motor numa conversa**: não. O equivalente é "continuar em outro motor": uma conversa
  **nova** no motor B, cujo primeiro prompt traz um resumo da conversa do motor A, delimitado como
  dado. É exatamente a nota de passagem da proposta de workflow (§10.4).

### 6.8 Uso e custo

- `turn.completed` passa a levar `usage { inputTokens?, outputTokens?, cacheTokens?, costUsd?,
  premiumRequests? }`, com o que o motor souber.
- O [plano 16](../plans/16-usage-and-cost/README.md) mostra a unidade que existir. **Orçamento em
  US$ só existe para motor com `cost: 'usd'`**; para os outros, o orçamento é em tokens, em
  requisições ou em tempo e número de sessões. Isso afeta os limites dos workflows (§10.7).
- Estimar US$ a partir de tokens com uma tabela de preço nossa: **não** (ME-09). Tabela de preço
  embutida envelhece calada e erra para baixo.

### 6.9 Instalação, autenticação e diagnóstico

- Cada adapter implementa `describe()`: instalado (caminho do binário), versão, autenticado (sem
  expor a credencial), versão mínima suportada e capacidades.
- `GET /engines` lista os motores habilitados com esse estado. As telas de diagnóstico
  ([plano 18](../plans/18-logs-and-diagnostics/README.md)) e de configuração
  ([plano 13](../plans/13-claude-settings/README.md)) ganham uma seção por motor.
- A distribuição ([plano 19](../plans/19-distribution/README.md)) herda o problema R-02 para cada
  motor: o serviço do SO precisa achar a credencial de cada um (`~/.claude/`, login do GitHub,
  `~/.codex/`…).
- Configuração: `ENGINES_ENABLED=claude,copilot` e `ENGINE_DEFAULT=claude`, mais o caminho do
  binário por motor. Nome de motor **só** na configuração e nos adapters, como hoje vale para o
  provedor de identidade.

---

## 7. Mudanças por camada

### 7.1 Backend

| Camada | Mudança |
|---|---|
| `domain/session` | `EngineId`, `ConversationRef`, `CanonicalPermissionMode`, `CanonicalToolKind`, interações canônicas; erros `EngineUnavailableError`, `EngineTimeoutError`, `EngineCapabilityUnavailableError` (substituem os `Claude*`) |
| `domain/transcript` | `ClaudeSessionId` → `ConversationRef`; `TranscriptSession` ganha `engine` |
| `domain/permission` | regras casam por `kind` e por `toolName`; `rule-pattern.ts` aprende a forma canônica |
| `domain/audit` | kinds `claude.*` → `engine.*`, com o motor no payload |
| `application/session` | `AgentEnginePort`, `EngineRegistry`, checagem de capacidade nos use cases (`setModel`, `commands`, `fork`, `contextUse`…), `StartSession` com `engine` |
| `application/transcript` | `TranscriptStoreRegistry`; rota por `ConversationRef` |
| `adapter/outbound/claude` | implementa a porta nova; o mapper passa a emitir tipos canônicos e diff derivado; `file-tools.ts` vira a classificação canônica do Claude; a asserção de segurança fica onde está |
| `adapter/outbound/<motor>` | um por motor: cliente do SDK ou protocolo, mapper, gate, auditoria, asserção, `describe()`, transcript store |
| `adapter/inbound` | `engine` em `session.start`; `GET /engines`; `GET /catalog?engine=`; transcripts por `engine/id` |
| `infrastructure/config` | motores habilitados, padrão, binários; validação no boot |
| `infrastructure/modules` | registrar os adapters por configuração |
| `dependency-cruiser` | um adapter de motor nunca importa outro; nada fora de `adapter/outbound/<motor>/` importa o SDK daquele motor |

### 7.2 Banco

- Migration nova (as já aplicadas não mudam —
  [backend/05](../architecture/backend/05-persistence.md)): `engine` (não nulo, padrão `claude`
  para as linhas existentes) e `engine_conversation_id`, preenchida a partir de
  `claude_session_id`. A coluna antiga sai numa migration seguinte, depois da janela de
  depreciação do contrato.
- Índice por `(engine, engine_conversation_id)`.
- Regras de permissão: coluna `tool_kind` ao lado do padrão atual.

### 7.3 Contrato

Ver §8.

### 7.4 Web

- Tudo o que lê nome ou input de ferramenta passa a ler `kind` e o payload canônico (§4.2):
  `tool-labels.ts`, `ToolRow.tsx`, `edit-preview.ts`, `useEditPreview.ts`, `useToolDiff.ts`,
  `ToolDiffView.tsx`, `task-list.ts`, `TaskListPanel.tsx`, `PlanApprovalCard.tsx`,
  `PermissionQueue.tsx` e `types/changes.ts`.
- **Seletor de motor** no "nova sessão" (com o padrão da configuração) e **selo de motor** na aba,
  no histórico e na lista de sessões vivas.
- **Capacidades** escondem controles (§6.2).
- **Tela de pergunta estruturada** (canônica) — também é a lacuna 2 da proposta de workflow.
- i18n: as chaves que dizem "Claude" para o motor passam a ter o nome do motor como **parâmetro**.
  "Painel do Claude" vira "Painel do agente" (ou o nome do motor da sessão), e a chave é renomeada.
  O nome de um motor é nome próprio: não é traduzido, mas também não nasce em JSX.

### 7.5 Mobile

- O mesmo que o web nas telas que existem: `permission_card_view.dart` (pela `kind`), o chat do
  [plano 10](../plans/10-mobile-chat-layout/README.md), o selo de motor, o histórico e as
  capacidades.
- Atenção à janela de depreciação: o app publicado não atualiza sozinho (05 §Versionamento).

### 7.6 Documentação e ADRs

- **ADR novo**: "Múltiplos motores atrás de uma porta com capacidades". Ele **altera** o ADR-001,
  porque o Agent SDK deixa de ser a única porta, e não o revoga: o Claude continua sendo operado pelo
  SDK.
- **ADR-011 reescrito** como o contrato de segurança por motor do §6.6. As duas obrigações atuais
  viram a implementação do Claude desse contrato.
- **ADR-006 estendido**: ferramentas e interações canônicas.
- [backend/04-claude-integration](../architecture/backend/04-claude-integration.md) vira
  `04-engine-integration.md` (o geral) mais um anexo por motor. O roteador do
  [AGENTS.md](../../AGENTS.md) ("Entender como o backend conversa com o Claude local") e o
  anti-padrão "`query()` do Agent SDK sem `settingSources`" ganham a versão geral.
- Uma **discovery por motor** (`docs/discovery/02-…-copilot.md`, `03-…-codex.md`, `04-…-acp.md`), no
  molde da [01](../discovery/01-descoberta-claude-agent-sdk.md), escrita pelo spike.
- [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md): todas as mudanças do §8.

### 7.7 Testes e scripts

- **Suíte de contrato da porta**: a mesma bateria de cenários (as seis dimensões) roda contra
  **todos** os adapters, cada um com o seu fake. É o que garante que "suportar o motor X" signifique
  o mesmo para todos.
- **Um fake por motor**, no molde de [backend/test/fakes/agent-sdk/](../../backend/test/fakes/agent-sdk/)
  (`scripted-query.ts` e fixtures). Para o ACP, um agente ACP de mentira falando JSON-RPC de verdade.
- **e2e**: a matriz de cenários do web e do mobile ganha a dimensão motor nos cenários que dependem
  de capacidade (menu `/`, editar e reenviar, medidor de contexto…). Os cenários que não dependem
  rodam com um motor só, para não multiplicar o tempo do `verify:full`.
- **Smoke ao vivo por motor** ([e2e/smoke-live/](../../e2e/smoke-live/)): `sdk-contract.spec.ts`
  vira um por motor e só roda para os motores instalados e autenticados na máquina. Motor ausente é
  `skip` **declarado no relatório**, não falha nem silêncio.
- Scripts em `scripts/`: `engines:check` (o `describe()` de cada motor, em texto), usado pelo
  diagnóstico e pelo smoke.

---

## 8. Contrato

Mudança de contrato nas três pontas, na mesma entrega. As remoções e renomeações **incrementam
`v`**, e o servidor aceita `v-1` durante a janela de depreciação (05 §Versionamento).

### WebSocket

| Item | Mudança | Quebra? |
|---|---|---|
| `session.start` | ganha `engine?` (padrão da configuração) | não |
| `session.started` | ganha `engine`, `conversation { engine, id }`, `capabilities`; `claudeSessionId` fica em `v-1` | sim (remoção em `v`) |
| `tool.started` / `tool.progress` / `tool.completed` | ganham `kind` e `subject` (payload canônico); o input cru sai | sim |
| `permission.requested` | ganha `kind`, `subject`, `interaction?` (`question` · `plan`) | sim |
| `permission.resolve` | ganha `answers` (pergunta) e `reason` (plano) — a lacuna 1 da proposta de workflow | não (campo novo) |
| `session.setPermissionMode` | valores canônicos (`ask` · `acceptEdits` · `readOnly`) | sim |
| `turn.completed` | `costUsd` vira `usage { … }` (§6.8) | sim |
| eventos de thinking, subagent, `session.compacted`, `session.rewound` | inalterados, mas só emitidos se a capacidade existe | não |
| `session.setModel`, `session.rewindFiles`, edição e reenvio | recusados com `engineCapabilityUnavailable` quando a capacidade não existe | não |

### REST

| Rota | Mudança |
|---|---|
| `GET /engines` | nova: motores habilitados, estado (`describe()`), capacidades |
| `GET /catalog?workspacePath=&engine=` | ganha `engine`; o catálogo é do motor |
| `GET /sessions/:id/commands`, `/models`, `/context`, `/mcp` | recusam com `engineCapabilityUnavailable` quando a capacidade não existe |
| `GET /transcripts?engine=` · `GET /transcripts/:engine/:id/messages` | substitui `/transcripts/:claudeSessionId/messages`, que fica em `v-1` |
| regras de permissão | aceitam `toolKind` |

---

## 9. Estratégia de adapters

Três formas de chegar a um motor novo:

| Forma | Ganha | Perde |
|---|---|---|
| **Adapter nativo** (SDK ou protocolo próprio do motor) | todas as capacidades; saída estruturada; custo; fork | um adapter, um mapper, um fake e uma discovery **por motor** |
| **Adapter ACP** (um só) | Gemini CLI, Goose, Cline, OpenHands, Copilot CLI e outros de uma vez; tipos de ferramenta e diff já padronizados | saída estruturada, fork, custo confiável, uso de contexto; depende de cada agente implementar bem as partes opcionais |
| **Tudo via ACP** (inclusive o Claude) | um caminho só | **regressão** do que o produto já tem com o Claude (fork, `getContextUsage`, comandos, `outputFormat`); descartado |

**Recomendação:**

1. **o Claude continua nativo.** Nada do que existe se perde;
2. **o segundo motor é nativo**: Copilot (pedido do usuário) via Copilot SDK, ou Codex via
   app-server. Um motor nativo bem diferente do Claude é o que **prova** a abstração: se a porta
   aguentar o Copilot ou o Codex sem `if`, ela aguenta os outros. Entre os dois, o Codex tem a
   matriz mais completa e um protocolo documentado com geração de tipos; o Copilot tem o pedido do
   usuário e um gate de permissão mais parecido com o nosso. O spike decide (ME-02);
3. **o terceiro é o adapter ACP**, para a cauda longa, com capacidades reduzidas e **sem os papéis
   automáticos de workflow** que exigem saída estruturada nativa (§10.3).

---

## 10. Impacto na execução de workflows

Esta seção mede o impacto desta proposta sobre a [proposta de workflow de sessões](workflow-de-sessoes.md)
(referida aqui como **WF**), seção por seção. **Nada aqui altera aquele documento.** A tabela do
§10.13 é a lista de ajustes a absorver quando os planos de workflow (A a F do WF §21) forem
criados.

### 10.1 O princípio central muda de sujeito

WF §3.1: "o motor encadeia; quem entende o trabalho **é a sessão** … porque quem o interpreta é o
Claude, que já sabe ler todos". Com vários motores, quem interpreta é **o motor da sessão**. Isso
**reforça** a escolha do WF de não ter parser de formato (D-19): o motor de workflow continua
agnóstico do formato do trabalho e passa a ser também agnóstico do agente. A consequência nova é que
**a qualidade de cada passo depende do motor escolhido para ele**. Por isso o motor vira um campo
do passo (§10.4), e o arquivo da execução registra qual motor fez o quê (§10.8).

### 10.2 As lacunas do WF §4 ficam canônicas

| Lacuna do WF §4 | Com esta proposta |
|---|---|
| 1. Veredito só com `allow`/`deny`; responder `AskUserQuestion` exige `updatedInput` | a resposta é a **interação canônica** de pergunta (§6.4); cada adapter traduz para o formato do seu motor. Fazer canônico desde o início evita refazer o veredito quando o segundo motor chegar. |
| 2. O humano não responde `AskUserQuestion` pela UI | a tela de pergunta estruturada é **uma só**, para qualquer motor que tenha a capacidade `questions` |
| 3. Fatos da sessão fora do barramento | inalterada, mas os fatos levam `engine` e as `kind` canônicas |
| 4. Prazo de permissão curto | inalterada; a espera longa passa a depender de capacidade (§10.10) |
| 5. Sem email | inalterada |

**Recomendação de ordem:** o plano A do WF (decisões estruturadas) e a fase de neutralização desta
proposta (M0, §17) tocam os mesmos arquivos (`PermissionVerdict`, `permission.resolve`,
`PlanApprovalCard`, o card do app). Fazer **M0 antes de A**, ou A já na forma canônica, evita
escrever duas vezes.

### 10.3 Saída estruturada: a capacidade de que o workflow mais depende

O WF usa saída estruturada (`outputFormat` do SDK do Claude, WF §4 e §6.8) para quase tudo o que é
autônomo:

- a **nota de passagem** (`output: handoff`, WF §9.3), de onde saem `remaining`, `needsDecision` e o
  resumo para o próximo lote;
- o **veredito do revisor** (UC-06, UC-10);
- o **respondedor**, com o enum de rótulos válidos (WF §13.3);
- o **planejador**, que devolve a lista de lotes (WF §9.2);
- o **diagnóstico** (WF §11.3) e o **review** do pré-voo (WF §9.6).

| Capacidade `structuredOutput` | Comportamento proposto |
|---|---|
| `native` (Claude `outputFormat`, Codex `outputSchema`, Copilot ?) | como no WF |
| `prompted` (o motor recebe o schema no prompt e responde JSON; o motor de workflow valida) | permitido para `session.start` com `output.schema` e para a nota de passagem, com **uma** nova tentativa automática em `invalidOutput`; **proibido** para respondedor, revisor de plano e planejador nos perfis `balanced` e `autonomous` (uma decisão automática não pode depender de JSON que o modelo talvez não feche) |
| `none` | o passo com `output` não valida (erro de validação semântica, WF §6.10) |

Por isso o adapter ACP, sem saída estruturada padronizada, serve para sessões de trabalho
**interativas e supervisionadas**, não para os papéis automáticos.

### 10.4 O formato do workflow ganha `engine`

Mudanças aditivas no formato `@1` do WF §6:

```yaml
engine: claude                  # topo: o motor padrão das sessões desta execução (opcional)

steps:
  implement:
    action: session.start
    engine: codex               # por passo: sobrescreve o do topo
    model: gpt-5-codex          # o modelo é do motor; validado contra o catálogo dele
    …
  review:
    action: session.start
    engine: claude              # revisão por outro fornecedor (§10.5)
    permissions: rules-only
    …
```

- **`engine` omitido** = o do topo; omitido no topo = o padrão da instalação. **O valor resolvido
  vai para o arquivo da execução**, nunca "padrão": a execução de ontem tem de dizer qual motor
  rodou, mesmo que o padrão mude hoje.
- **Validação semântica nova** (WF §6.10):
  - motor não habilitado na instalação;
  - `model` fora do catálogo do motor;
  - `effort` em motor sem a capacidade;
  - `output.schema` em motor sem `structuredOutput` adequado ao papel (§10.3);
  - gatilho `session.questionAsked` ou `session.planProposed` filtrando um motor sem
    `questions` ou `planApproval` (o gatilho nunca dispararia: é aviso, não erro);
  - prompt que começa com `/` (slash command, WF §4) num motor sem `slashCommands`.
- **A saída de `session.start` muda de nome:** WF §6.5 lista `claudeSessionId` entre as saídas. Com
  esta proposta ela vira `conversation` (`{ engine, id }`), e o WF §7.1 já usa
  `session.conversation`. Como o WF ainda não tem código, **o custo da troca hoje é zero**: basta
  nascer `conversation` no plano B. Depois de existirem workflows de usuário referenciando
  `steps.x.output.claudeSessionId`, seria uma quebra de formato (`@2`).
- **`format: remote-claude/workflow@1`**: o nome do produto no identificador do formato não impede
  nada. Se o produto for renomeado, é uma decisão separada (ME-12), e o `format` antigo continua
  reconhecido.

### 10.5 Motores diferentes num mesmo workflow

O que vários motores **acrescentam** aos casos de uso do WF §2:

| Caso | Como fica |
|---|---|
| UC-06 / UC-10 — revisão | **revisor de outro fornecedor**: implementar no motor A e revisar no motor B reduz o erro correlacionado (o mesmo modelo tende a não ver o próprio erro). Pode virar o padrão dos modelos de trabalho (ME-10). |
| UC-08 — sessão conselheira / respondedor | o respondedor pode ser de outro motor; vale a restrição de saída estruturada nativa (§10.3) |
| UC-01 / UC-02 — lotes | o motor por lote é fixo na execução. Trocar de motor no meio, para o **mesmo** lote, só por remediação explícita (§10.11). |
| UC-11 — rotina agendada | o motor mais barato para tarefas mecânicas; o orçamento passa a respeitar a unidade do motor (§10.7) |
| Novo: **comparação** | o mesmo lote em dois motores, em worktrees separadas, para comparar. Exige paralelismo (WF D-10, fora da v1) e fica registrado só como possibilidade futura. |

**Uma restrição que vale sempre**: duas sessões de motores diferentes **não escrevem no mesmo
working tree ao mesmo tempo**, pela mesma razão do WF §8.4 e D-10. Ser de motores diferentes não
muda o problema, só o torna mais difícil de diagnosticar.

### 10.6 Permissões das sessões abertas por workflow (WF §12)

| Valor do WF | Com esta proposta |
|---|---|
| `ask-human` · `rules-then-human` · `rules-only` | inalterados: são políticas **do nosso gate**, e o gate é o mesmo para todos os motores (§6.6) |
| `plan` | passa a significar o modo canônico **`readOnly`**, garantido pelo gate que nega `file.*` e `shell` (§6.5), e não só pelo modo do motor. É o que permite usar qualquer motor para diagnóstico, pré-voo e respondedor sem confiar no modo "plan" de cada um. |

**"Um workflow nunca aprova permissão de ferramenta"** (WF §12, D-01) continua valendo e fica mais
importante: a autoaprovação de cada motor (aprovar para sempre, `execpolicy`, pastas confiáveis) é
exatamente o que §6.6 manda desligar, e um workflow que rodasse com ela ligada contornaria a regra
sem ninguém ver.

**Regras de permissão** (WF §9.6, `rulesForCommands`): o pré-voo propõe as regras na **forma
canônica** (`shell: npm test`), para valerem em qualquer motor que o workflow use.

### 10.7 Limites e custo (WF §6.9, §8.6, §9.6)

- `maxCostUsd` só é verificável para motores com `cost: 'usd'`. Proposta:
  - os limites ganham `maxTokens` e `maxRequests` ao lado de `maxCostUsd`;
  - **a validação recusa** um workflow cujos passos usam um motor sem a unidade de algum limite
    declarado. Um limite que não se mede é pior que nenhum, porque dá falsa segurança;
  - `maxSessions` e `timeout` continuam valendo para todos e passam a ser **obrigatórios** quando
    nenhum limite de custo é mensurável para algum motor do workflow.
- O **aviso de 80 %** (`budget80`) e o erro `limitExceeded` passam a dizer a unidade.
- O **pré-voo `budget`** (estimativa pelo histórico) estima **por motor**, a partir do histórico
  daquele motor naquele workflow.
- O total da execução, no arquivo e no painel, vira um `cost` por unidade: `{ usd: 12.40, tokens:
  1.8M, requests: 14 }`. Somar unidades diferentes numa só é proibido.

### 10.8 O arquivo da execução (WF §7)

Mudanças aditivas no formato `remote-claude/run@1`:

```yaml
steps:
  - step: implement
    item: { index: 1, value: "fase 1 e 2" }
    session:
      id: ses_a1
      engine: codex               # novo
      model: gpt-5-codex          # novo — o resolvido, não o pedido
      engineVersion: 0.58.0       # novo — o do describe(), para comparar depois
      conversation: { engine: codex, id: 0199… }   # era só o id
    cost: { tokens: 412000 }      # a unidade do motor (§10.7)
```

- O cabeçalho-resumo diz quais motores a execução usou.
- WF §7.2 ("a conversa inteira … fica no store do Claude") passa a ser "no store **do motor**", ou
  no diário de eventos nosso para motores sem store (§6.7, ME-05). "Abrir a conversa" no painel
  depende da capacidade `history`; sem ela, o arquivo da execução mostra a nota de passagem e o
  resumo, e diz que a conversa não é legível.
- **UC-05** (ler uma execução depois): o arquivo tem de bastar mesmo quando o motor da sessão foi
  desinstalado depois. Mais uma razão para a nota de passagem e o resumo irem inteiros para o
  arquivo, como o WF já faz.

### 10.9 Reinício do backend e retomada (WF §8.5)

- "As sessões morrem com o processo, **as conversas não**: ficam no store do Claude." Com vários
  motores, isso vale para os motores com `resume`.
- A remediação `resumeConversation` (WF §11.3) **só é oferecida** quando o motor da sessão tem
  `resume`. Sem a capacidade, o erro `interrupted` oferece `retry` (refazer o lote) e `stop`.
- O perfil `autonomous` ("retoma sozinha uma vez") faz o mesmo.

### 10.10 Espera longa e estacionamento (WF §10.5, D-23)

O estacionamento — segurar o pedido por `holdFor`, fechar a sessão e reabrir a conversa com a
resposta como prompt — depende de **retomar uma conversa interrompida no meio de uma chamada de
ferramenta**. O WF já marca um spike para o Claude. Com vários motores:

- **o spike é por motor** e entra no spike de descoberta de cada adapter (§17, M1);
- motor **sem `resume`**, ou cujo `resume` não aceita uma conversa interrompida no meio de uma
  ferramenta: **não estaciona**. A decisão fica segura pelo tempo do `holdFor` e, passado ele, a
  remediação é refazer o lote com a resposta já no prompt;
- a validação do workflow **avisa** quando um passo `rules-then-human` usa um motor que não
  estaciona: é onde uma decisão às 3h da manhã custa uma vaga de sessão por horas, ou o lote inteiro.

### 10.11 Controles e remediações (WF §11.2, §11.3)

| Controle / remediação do WF | Com esta proposta |
|---|---|
| **Orientar** (texto para a sessão corrente, na fila) | depende de `promptWhileBusy`: Claude (streaming input) e Codex (`turn/steer`) recebem na hora; nos outros, o texto **espera o fim do turno**, e a tela diz isso |
| **Assumir** (`takeOver`) | o humano continua no painel da sessão; o painel tem de suportar aquele motor, que é a fase de web do adapter |
| **Abortar** | inalterado (`interrupt` é núcleo) |
| `resumeConversation` | só com `resume` (§10.9) |
| `retryWithGuidance`, `retry`, `skipItem`, `stop`… | inalterados |
| **Novo: `retryWithEngine`** | refaz o passo que falhou **noutro motor**, com a orientação opcional. Útil quando um motor empaca num problema (`noProgress`) que outro resolve. Só aparece se o workflow listar motores alternativos (`engines: [codex, claude]` no passo) — nunca troca de motor sem o arquivo ter dito que pode. |
| **Diagnóstico** (`diagnose`) | pode rodar num motor diferente do que falhou, pelo mesmo argumento do revisor de outro fornecedor (§10.5) |

O catálogo de erros (WF §11.3) ganha dois `kind`:

| `kind` | Quando | Remediações |
|---|---|---|
| `engineUnavailable` | o motor do passo não está instalado, autenticado ou na versão mínima — no pré-voo ou no meio da execução (login expirou) | `retry` (depois de autenticar) · `retryWithEngine` · `stop` |
| `capabilityUnavailable` | o passo pediu algo que o motor não tem (detectado em execução, quando a validação não pôde ver — por exemplo, uma versão do CLI que perdeu a capacidade) | `retryWithEngine` · `editAndResume` · `stop` |

### 10.12 Pré-voo, perfis de autonomia, segurança e telas

- **Pré-voo** (WF §9.6) ganha a checagem `engines`: cada motor usado pelo workflow está instalado,
  autenticado, na versão mínima, com as capacidades que os passos exigem, e com a autoaprovação
  própria desligada (§6.6). Falha vira decisão ("o Codex não está autenticado nesta máquina: abrir
  o diagnóstico · trocar este passo para o Claude · cancelar").
- **Perfis de autonomia** (WF §9.7): as linhas `AskUserQuestion` e `ExitPlanMode` passam a ser
  "pergunta estruturada" e "aprovação de plano" (§6.4). Para motores sem essas capacidades, a linha
  não se aplica, e a tela do perfil diz isso.
- **Segurança** (WF §15):
  - §15.1: a lista de sensíveis ganha os arquivos de configuração de **todos** os motores (§6.6);
  - §15.2 (injeção entre sessões) fica mais relevante com motores diferentes, que obedecem a
    delimitadores de forma diferente; as defesas do WF (enum validado, nenhuma aprovação
    automática de ferramenta, resumos delimitados) não dependem do motor e continuam suficientes;
  - D-18 ("`.remote-claude/`, porque `.claude/` é da instalação do Claude Code") **ganha força**:
    com vários motores, a pasta de workflows tem de ser neutra.
- **Telas** (WF §16): o formulário de disparo de um modelo (WF §9.10) ganha **motor**, com padrão;
  o nó de sessão no canvas e no fluxo da execução mostra o motor; o painel da execução mostra o
  motor por lote e o custo na unidade de cada um.
- **Contrato** (WF §18): `session.started` e a lista de sessões, que ganham `origin` e
  `workflowRunId?`, ganham também `engine`, que este documento já adiciona (§8).
- **Matriz de cenários** (WF §20): ganha a dimensão motor (§16 daqui).

### 10.13 Resumo do impacto no WF

| WF | Impacto | Severidade | O que fazer quando o plano de workflow for criado |
|---|---|---|---|
| §3.1 princípio | "o Claude interpreta" → "o motor da sessão interpreta" | baixa | ajustar o texto; nenhuma mudança de desenho |
| §4 lacunas 1 e 2 | resposta a pergunta e plano canônicos | **alta** | plano A já na forma canônica, depois do M0 (§10.2) |
| §4 saída estruturada | capacidade por motor | **alta** | regra do §10.3 na validação semântica |
| §6.3 / §6.5 formato | `engine` no topo e no passo; saída `conversation` em vez de `claudeSessionId` | média | nascer assim no plano B (custo zero agora) |
| §6.4 gatilhos | `questionAsked`/`planProposed` dependem de capacidade | baixa | aviso de validação |
| §6.9 limites | `maxTokens`, `maxRequests`; unidade obrigatória | média | plano B |
| §7 arquivo da execução | `engine`, `model`, `engineVersion`, `conversation` com motor, custo por unidade | média | plano B, formato `run@1` |
| §8.5 reinício | `resumeConversation` só com `resume` | baixa | plano C |
| §9.6 pré-voo | checagem `engines`; regras canônicas | média | plano C |
| §9.7 perfis | linhas por capacidade | baixa | plano C |
| §10.5 estacionamento | spike por motor; sem `resume`, sem estacionar | média | spike de cada adapter |
| §11 controles | `promptWhileBusy`; `retryWithEngine`; dois `kind` novos | média | plano C |
| §12 permissões | `plan` = `readOnly` garantido pelo gate | média | plano B, depois do M0 |
| §13 respondedor | só com saída estruturada nativa | média | plano D |
| §15 segurança | sensíveis de todos os motores | média | plano B |
| §16 telas | motor no disparo, no canvas, no painel | baixa | planos C e E |
| §17 persistência | `engine` em `workflow_runs` e no estado vivo | baixa | plano B |
| §20 cenários | dimensão motor | média | todos os planos |

**Conclusão para o workflow:** nada na proposta de workflow **impede** vários motores. O desenho
dela — motor de workflow agnóstico, verificação pela evidência, nota de passagem com forma fixa,
gate de permissão nosso — é exatamente o que torna o multimotor tratável. O que ela tem de
específico do Claude está em pontos localizados (saída estruturada, `AskUserQuestion`/`ExitPlanMode`,
`claudeSessionId`, custo em US$, estacionamento). Quase todos ficam baratos se forem resolvidos
**antes** do plano B do workflow, e caros depois.

---

## 11. Observabilidade

- Todo log de borda de motor leva `engine` e `engineVersion` no contexto, além do que já leva. O
  `op` dos logs `claude.*` (por exemplo `claude.permission.request`) vira `engine.*`, com o motor
  como campo — um filtro de log só para todos os motores.
- A trilha de auditoria registra o motor em cada evento de sessão e de ferramenta, e a `kind`
  canônica ao lado do nome do motor.
- O diagnóstico ([plano 18](../plans/18-logs-and-diagnostics/README.md)) mostra o `describe()` de
  cada motor e o motivo de um motor estar `unavailable` (por exemplo, a asserção de segurança que
  falhou).

---

## 12. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-01 | Um motor tem um caminho de autoaprovação não documentado que contorna o gate | spike com teste **negativo** (tentar executar sem aprovação, por cada caminho conhecido) antes de suportar; smoke ao vivo repete o teste a cada versão nova do CLI |
| R-02 | SDKs em *preview* (Copilot) ou `0.x` (Claude) mudam e quebram o mapper | o mapper é o único ponto que muda (ADR-006); a suíte de contrato da porta pega a regressão; versão mínima e máxima testada por motor no `describe()` |
| R-03 | A abstração vira o menor denominador comum e o Claude perde recursos | princípio 4 (§3): núcleo pequeno, o resto é capacidade |
| R-04 | A classificação canônica erra (uma ferramenta que escreve classificada como leitura) | classificação desconhecida cai em `other`, que **sempre** pede permissão e nunca tem regra larga; teste por motor com a lista de ferramentas do catálogo |
| R-05 | Explosão do tempo de e2e com a dimensão motor | dimensão motor só nos cenários que dependem de capacidade (§7.7) |
| R-06 | Termos de uso de um motor proíbem operá-lo por um backend próprio, ou exigem plano pago específico | verificar no spike, por motor, e registrar no ADR |
| R-07 | O custo de manutenção cresce linearmente com o número de motores | um nativo além do Claude, o resto via ACP (§9); motor sem uso pode ser desabilitado sem tocar no resto |
| R-08 | Workflows longos ficam mais frágeis com motores que não estacionam ou não retomam | validação e pré-voo avisam (§10.10); os modelos de trabalho do produto usam por padrão motores com `resume` |

---

## 13. O que **não** muda

- O módulo `permission`: regras, prazos, extensão, histórico, multi-cliente, a fila no web, a
  aprovação no celular.
- A reconexão, o replay e o heartbeat.
- O desfazer de arquivos, salvo a origem dos caminhos (§6.3).
- O explorer, o editor, a busca, o terminal ([ADR-017](../architecture/shared/00-decisions.md)) e as
  pastas assistidas: nada disso fala com o motor.
- A autenticação do produto (OIDC).
- A estrutura em camadas e a Dependency Rule. O multimotor é exatamente o caso que ela existe para
  proteger.

---

## 14. Esforço relativo

Sem estimativa em dias, porque depende do spike. A ordem de grandeza:

| Bloco | Peso |
|---|---|
| M0 — neutralização (porta, canônicos, capacidades, contrato, banco, web e mobile pelo `kind`) **sem motor novo** | **o maior**: toca as três pontas, o contrato e as regras de permissão |
| M1 — spike e discovery por motor | pequeno, mas decide se o motor entra |
| M2 — adapter nativo (Copilot ou Codex) | médio: um adapter do tamanho do `adapter/outbound/claude/` atual, sem o legado |
| M3 — adapter ACP | médio |
| M4 — telas de configuração, uso e diagnóstico por motor | médio |

O M0 também paga dívidas que existem **com um motor só**: diff e rótulo calculados no cliente a
partir do input cru, pergunta estruturada sem tela, regras de permissão presas ao nome da ferramenta.

---

## 15. Contrato de qualidade

Os planos derivados seguem as regras do repositório sem exceção: matriz de cenários antes do código,
três níveis de teste, 90 % por arquivo, `pnpm verify:full` verde, contrato nas três pontas na mesma
mudança, `decisions.md` por plano. Dois pontos específicos:

- **nenhum adapter entra sem a suíte de contrato da porta verde** e sem o teste negativo de
  segurança (R-01);
- **o smoke ao vivo de um motor ausente é `skip` declarado**, nunca falha nem silêncio, e o
  relatório da validação diz quais motores foram exercitados.

---

## 16. Matriz de cenários — semente

| Dimensão | Cenários |
|---|---|
| **Equivalência** | cada motor × núcleo da porta (iniciar, prompt, interromper, fechar); cada tipo canônico de ferramenta × cada motor; cada interação canônica × motores que a têm; cada modo canônico × cada motor; regra canônica (`shell: npm test`) casando em cada motor; workflow com um motor, com dois, com o padrão; revisor de outro motor |
| **Fronteira** | nenhum motor habilitado; um só; todos; motor na versão mínima e uma abaixo; capacidade presente na sessão e ausente no catálogo (e o contrário); ferramenta desconhecida (`other`); diff vazio; pergunta com 1 e 4 questões; custo zero; uso sem unidade |
| **Erro** | motor não instalado; não autenticado; credencial expirada no meio da sessão; asserção de segurança falhando no boot; autoaprovação do motor ligada; capacidade pedida e ausente (`engineCapabilityUnavailable`); `ConversationRef` de motor desabilitado; saída estruturada inválida em `prompted`; motor que cai no meio de um pedido de permissão; JSON-RPC malformado (ACP, Codex) |
| **Transição de estado** | sessão em cada estado × cada motor; retomar conversa de cada motor; continuar em outro motor (conversa nova com resumo); motor desabilitado com sessão viva; versão do CLI trocada entre duas sessões; estacionar e reabrir por motor (§10.10); migração de `claude_session_id` com linhas existentes |
| **Concorrência** | duas sessões de motores diferentes na mesma pasta; o mesmo pedido de permissão respondido no web e no app, em cada motor; dois adapters inicializando ao mesmo tempo no boot; `describe()` concorrente com início de sessão |
| **Idempotência** | `close()` repetido em cada adapter; o mesmo `permission.resolve` duas vezes, em cada motor; migração de dados executada duas vezes; regra legada migrada para canônica duas vezes; `GET /engines` repetido sem gastar cota |

---

## 17. Fatiamento sugerido em planos

Cada um é um plano no formato normativo, criado por `pnpm plan new`. A ordem é de dependência.

| Plano | Escopo | Depende de |
|---|---|---|
| **M0 — Neutralização** | `AgentEnginePort` e `EngineRegistry` com um só adapter (Claude); `ConversationRef`; capacidades; ferramentas e interações canônicas; modos canônicos; pergunta estruturada com tela no web e no app; regras por `kind`; migration; contrato `v+1` com janela para `v`; web e mobile por `kind`; ADRs novo e reescritos. **Critério: tudo o que existe funciona igual, com o Claude, e nenhum arquivo fora de `adapter/outbound/claude/` conhece nome de ferramenta do Claude.** | — |
| **M1 — Spike de motores** | uma fase por motor candidato, sem código de produto: preencher os "?" da matriz do §5.3, o teste negativo de segurança (R-01), estacionamento (§10.10), termos de uso (R-06); uma discovery por motor | — (pode correr em paralelo ao M0) |
| **M2 — Segundo motor nativo** | o adapter escolhido no M1 (Copilot ou Codex): cliente, mapper, gate, auditoria, asserção, transcript store, `describe()`, fake, suíte de contrato, smoke ao vivo; seletor e selo de motor no web e no app | M0, M1 |
| **M3 — Adapter ACP** | cliente JSON-RPC, delegação de `fs/*` (para ver toda escrita), mapeamento de *tool kinds* e `Diff`, capacidades negociadas, agente ACP falso para os testes | M0, M1 |
| **M4 — Configuração, uso e diagnóstico por motor** | os planos 13, 16 e 18 generalizados: seção por motor, unidade de custo, `engines:check` | M2 |

**Encaixe com os planos de workflow (WF §21):**

```
M0 ──► WF-A (decisões estruturadas, já canônicas) ──► WF-B ──► WF-C ──► …
 │                                                     ▲
 └──► M1 ──► M2 ──► (o workflow ganha motor por passo) ┘
```

- **M0 antes de WF-A** evita construir duas vezes a resposta a perguntas e planos (§10.2).
- **WF-B nasce com `engine` e `conversation`** (§10.4) mesmo que só exista o Claude: custo zero
  agora, quebra de formato depois.
- M2 e WF-B podem correr em paralelo depois do M0.

---

## 18. Decisões em aberto

Cada uma vira entrada no `decisions.md` do plano que a precisar. **Recomendação** é a proposta deste
documento, não decisão tomada.

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| ME-01 | Suportar vários motores, ou só **trocar** o Claude por outro? | trocar · vários · ficar só no Claude | **vários, com o Claude como padrão**; o custo de "vários" sobre "trocar" é pequeno depois do M0, e trocar sem M0 é reescrever |
| ME-02 | Qual é o **segundo motor**? | Copilot (SDK) · Codex (app-server) · decidir no spike | **decidir no M1**, com o Copilot como candidato preferido por ser o pedido do usuário; o Codex entra se o Copilot não passar no teste negativo de segurança ou na saída estruturada |
| ME-03 | **ACP** entra? | sim, como terceiro · não · como único caminho | **sim, como terceiro**, sem os papéis automáticos de workflow (§10.3); nunca como único caminho (§9) |
| ME-04 | Termo no código e na UI | `engine` · `agent` · `provider` | **`engine`** no código (`agent` já é subagent, e `provider` já é o de identidade); na UI, "agente" ("Painel do agente") |
| ME-05 | **Histórico** de motor sem store legível | não ter · diário de eventos nosso no Postgres | **não ter na primeira versão**; reavaliar o diário quando houver um motor útil sem store |
| ME-06 | Classificação de ferramentas | tabela fechada por motor · heurística | **tabela fechada por motor**, desconhecido = `other`, que sempre pergunta (R-04) |
| ME-07 | Auditoria em motor que só **observa** a ferramenta (Codex, ACP) | aceitar com registro no início do item · exigir interceptação real · usar a delegação de `fs/*` e `terminal/*` do ACP | **aceitar com o registro e um selo no ADR**; no ACP, delegar `fs/*` e `terminal/*` ao backend quando o agente aceitar, o que dá interceptação real |
| ME-08 | Permissão **por categoria** do Codex (comando e arquivo pedem; o resto, sandbox) | aceitar · só `readOnly` fora das categorias · não suportar | **aceitar**, com o sandbox do Codex em `workspaceWrite` dentro da pasta da allowlist e registro no ADR |
| ME-09 | Estimar **US$** de motor que só dá tokens | tabela de preço nossa · não estimar | **não estimar** (§6.8) |
| ME-10 | **Revisor de outro motor** como padrão dos modelos de trabalho do WF | sim · não · opt-in | **opt-in** na primeira versão; vira padrão se as execuções mostrarem ganho |
| ME-11 | **Regras de permissão** existentes | migrar para canônico · manter por nome · as duas | **as duas**: migrar o que é inequívoco, manter o resto por nome, que só vale para o Claude |
| ME-12 | **Nome do produto** (`remote-claude`) e o `format` dos arquivos | manter · renomear | **manter**; renomear é decisão de produto, separada, e o `format` antigo continuaria reconhecido |
| ME-13 | **Contrato**: `v+1` com janela, ou só campos aditivos sem remover nada | `v+1` · aditivo puro | **`v+1` com janela de `v`**: a soma de campos legados e canônicos para sempre é o que o 05 §Versionamento evita |
| ME-14 | Motor por sessão escolhido por quem | usuário a cada sessão · padrão por pasta · padrão da instalação | **padrão da instalação, sobrescrito por pasta** (em `.remote-claude/`), e escolhível a cada sessão |
| ME-15 | Ordem M0 × WF-A | M0 antes · WF-A antes · juntos | **M0 antes**, ou WF-A como primeira fase do M0 (§10.2) |
| ME-16 | `retryWithEngine` no WF | entra no plano C · depois | **depois**, quando houver dois motores em uso real |

---

## 19. Fontes

Consultadas em 2026-10-03. Tudo o que vem delas e não foi testado aqui está marcado "?" no §5.3.

- Agent Client Protocol — [visão geral](https://agentclientprotocol.com) e
  [schema v1](https://agentclientprotocol.com/protocol/v1/schema).
- GitHub Copilot SDK — [repositório](https://github.com/github/copilot-sdk),
  [pacote npm](https://www.npmjs.com/package/@github/copilot-sdk),
  [compatibilidade SDK × CLI](https://docs.github.com/en/copilot/how-tos/copilot-sdk/troubleshooting/compatibility),
  [mudança na permissão (mai/2026)](https://bartwullems.blogspot.com/2026/05/github-copilot-sdkbreaking-change-in.html),
  [introdução (Microsoft)](https://techcommunity.microsoft.com/blog/microsoftmissioncriticalblog/getting-started-with-github-copilot-sdk/4510059).
- OpenAI Codex — [como o App Server foi construído](https://openai.com/index/unlocking-the-codex-harness/),
  [Codex SDK TypeScript](https://github.com/openai/codex/blob/main/sdk/typescript/README.md),
  [guia do protocolo do app-server](https://codex.danielvaughan.com/2026/04/15/codex-app-server-complete-guide/).
- Clientes ACP multimotor como referência de desenho —
  [vscode-acp](https://github.com/formulahendry/vscode-acp), [kodizm/acp](https://github.com/kodizm/acp).

---

## 20. Fora do escopo desta proposta

- **Trocar de motor no meio de uma conversa** (§3.5); "continuar em outro motor" é uma conversa nova.
- **Chamar a API de um modelo diretamente** (Messages API, OpenAI API) como motor: o produto opera
  **agentes de codificação instalados**, com ferramentas, permissão e conversa próprias. Um "motor"
  feito por nós sobre uma API de modelo seria outro produto
  ([ADR-001](../architecture/shared/00-decisions.md) já descartou Managed Agents pela mesma razão).
- **Executar o mesmo prompt em vários motores em paralelo** para comparar: depende do paralelismo
  que o WF deixou fora da v1 (D-10).
- **Gerenciar a instalação ou o login** dos motores pela ferramenta: o diagnóstico mostra o estado
  e diz o que fazer; instalar e autenticar continuam sendo do usuário, na máquina, como hoje com o
  Claude.
- **Alterar a proposta de workflow de sessões.** Os ajustes estão listados no §10.13, para quando
  os planos dela forem criados.
- Renomear o produto (ME-12).
