# Proposta — Núcleo canônico e agentes de código isolados nas três pontas

**Estado:** virou o [plano 28 — Núcleo neutro de agente](../plans/28-agent-neutral-core/README.md) em 2026-10-10, com as decisões do §13 com os mesmos IDs; a D-01 (a ordem do §10, alternativa A) foi decidida pelo usuário na criação. Nenhum código escrito.
**Criada em:** 2026-10-10. O pedido do usuário chegou em seis mensagens:

1. "fazer uma descoberta, preparar para multi agente de código. Todas as mensagens que são usadas no
   mobile e web são canônicas. Deixar isoladas as implementações e o código dependente de agente;
   nada no core do sistema de visualização deve ser dependente de um agente de código. As
   implementações devem ser isoladas no back, já usamos clean architecture, verificar. Quais planos
   vão ser afetados, e em qual ordem o plano gerado por essa descoberta deveria ser executado";
2. "as interfaces mobile também devem ter os códigos dependentes de agente isolados";
3. "e web também";
4. "a descoberta e o plano gerado também devem ter instruções das mudanças de documentação e AGENTS,
   para indicar essas decisões e mudanças de arquitetura que essa mudança impacta";
5. e 6. "o plano 27 foi criado, pode usar ele como base para alguma decisão — ele já foi criado
   pensando em mensagens e core canônico".

**Destino:** insumo de **um plano novo**, o 28 (nome proposto: `28-agent-neutral-core`). Esta
proposta **não** é um plano: não tem tarefas com ID nem critério de conclusão por comando. Ela fixa o
**quê** e o **porquê**, mede o estado de hoje e lista o que falta decidir.

**Relação com outros documentos:**

- **Detalha o M0 da [discovery 03 — Múltiplos motores de agente](03-multiplos-motores-de-agente.md)**
  ("Neutralização", [§17](03-multiplos-motores-de-agente.md#17-fatiamento-sugerido-em-planos)). A 03
  desenhou a porta de motor, as capacidades e as ferramentas canônicas, mas a medição dela (§4.2) é de
  2026-10-03 e olhava quase só para o backend e o contrato. Esta discovery **mede de novo** (os planos
  13, 21…26 entraram depois), acrescenta o **isolamento dentro do web e do app** e as mudanças de
  documentação, e responde o impacto nos planos e a ordem. A 03 continua valendo para o resto
  (M1…M4: spike, segundo motor, ACP). Onde as duas divergem, vale esta.
- **Toma o [plano 27 — Perdas da conversa](../plans/27-conversation-losses/README.md) como base das
  convenções canônicas** (mensagem 5). O 27 é o único plano escrito inteiro na forma canônica, e as
  regras dele viram regra do contrato todo (§3, §6.1).
- Segue a regra da [discovery 09 §8.1](09-perdas-do-backend-na-conversa.md#81-canônico-não-do-claude):
  todo evento novo é canônico. Esta discovery estende a regra aos eventos **que já existem**.

---

## Sumário

1. [O pedido](#1-o-pedido)
2. [A resposta curta](#2-a-resposta-curta)
3. [Princípios](#3-princípios)
4. [Inventário de 2026-10-10](#4-inventário-de-2026-10-10)
5. [Arquitetura alvo: três anéis em cada ponta](#5-arquitetura-alvo-três-anéis-em-cada-ponta)
6. [O modelo canônico das mensagens](#6-o-modelo-canônico-das-mensagens)
7. [Verificação por máquina](#7-verificação-por-máquina)
8. [Mudanças de documentação e do AGENTS](#8-mudanças-de-documentação-e-do-agents)
9. [Planos afetados](#9-planos-afetados)
10. [Ordem de execução](#10-ordem-de-execução)
11. [Fatiamento sugerido do plano 28](#11-fatiamento-sugerido-do-plano-28)
12. [Matriz de cenários (semente)](#12-matriz-de-cenários-semente)
13. [Decisões em aberto](#13-decisões-em-aberto)
14. [Riscos](#14-riscos)
15. [Fora do escopo](#15-fora-do-escopo)

---

## 1. O pedido

| # | Requisito | Onde é tratado |
|---|---|---|
| R1 | toda mensagem que o web e o app consomem é **canônica**: WS **e** as rotas REST que a conversa lê | §6 |
| R2 | o código dependente de agente fica **isolado no backend**; conferir se a Clean Architecture de hoje garante isso | §2, §4.1, §5.1 |
| R3 | **nada no núcleo de visualização** depende de um agente de código | §3, §5.2, §5.3, §7 |
| R4 | o web **e** o app também isolam o código que é de um agente só (mensagens 2 e 3) | §5.2, §5.3 |
| R5 | quais planos são afetados, e em que ordem o plano desta discovery roda | §9, §10 |
| R6 | a discovery **e o plano** trazem as mudanças de documentação, de ADR e do AGENTS que a mudança de arquitetura exige | §8, §11 |
| R7 | o plano 27 é a base das decisões canônicas | §3, §6.1, D-03 |

---

## 2. A resposta curta

**A Clean Architecture do backend está respeitada no import, mas não no vocabulário.** O SDK do Claude
está confinado: os 17 arquivos que importam `@anthropic-ai/claude-agent-sdk` estão todos em
`adapter/outbound/claude/`, e a regra `sdk-is-isolated` do `dependency-cruiser` garante isso. Só que
a regra confere **import**, não **conceito**. O Claude como produto entrou no meio do sistema por nome
de ferramenta, de modo e de campo:

- o `domain/permission` é o motor de permissão do Claude Code reescrito: a gramática de regra
  `Tool(x:*)`, o classificador de risco por nome de ferramenta (`Read`, `Bash`, `Edit`…), os modos do CLI;
- o `domain/session` interpreta o input do `Edit` (`old_string`/`new_string`) para o diff;
- `ClaudeSessionId` aparece em 29 arquivos fora do adapter, e `claudeSessionId` está no contrato, em 3
  tabelas e nas duas pontas;
- existe um **bounded context inteiro com nome de produto**, o `claude-config` do plano 13: 24 arquivos
  de domínio, 6 tabelas, 13 kinds de auditoria e rotas `/claude/*`;
- dois adapters (`diag`, `permission`) importam arquivos de dentro de `adapter/outbound/claude/`.

**O contrato é um só, gerado de um schema, mas carrega dado cru do Claude.** `tool.started` e
`permission.requested` levam o `toolName` e o `input` do SDK. `session.started` exige `claudeSessionId`.
Os modos de permissão são os do CLI, `turn.completed` exige `costUsd`, o `usage` é o mapa da Anthropic,
e os blocos têm os nomes da API (`redacted_thinking`, `tool_use`). E o contrato só cobre o WS: as rotas
REST têm tipos escritos à mão em cada ponta.

**Por isso, quem interpreta o Claude são os clientes, e duas vezes.** O web tem 6 arquivos que decidem
pelo nome da ferramenta e 6 que leem o input cru. O app tem 4 e 3. São **10 pares de lógica
duplicada** entre TypeScript e Dart: rótulo de tool, lista de tarefas (no app, dentro da camada de
**domínio**), cartão de plano, modos, categorias de contexto, `/compact`… Cada motor novo custaria essa
interpretação **duas vezes**, e cada uma delas pode divergir da outra. É a mesma causa da falta de
paridade que o plano 26 corrige.

**A saída é uma só, e paga as duas dívidas:** a interpretação sai dos clientes e vai para o adapter
do motor, no backend. O contrato passa a levar o **tipo canônico** da ferramenta, o rótulo pronto
(`messageKey` + `params`), o assunto normalizado, a lista de tarefas, o plano e a pergunta como
objetos nossos. Os clientes desenham pelo `kind`, como o plano 27 já faz com os avisos. O que é de um
motor só (a tela de plugins e skills do Claude, por exemplo) mora num **anel de extensão** em cada
ponta (`engines/claude/`), que o núcleo nunca importa. E as duas coisas são conferidas por máquina.

**Os planos em andamento vão piorar o quadro se rodarem antes**:

- a F4 do [26](../plans/26-mobile-conversation-parity/README.md) porta para o Dart o mapa de rótulos
  por nome de ferramenta do Claude (B-13) e o diff a partir do input (B-16);
- a B-16 do [14](../plans/14-audit-explained/README.md) cria um catálogo de ferramentas do Claude no web;
- o [16](../plans/16-usage-and-cost/README.md) cria coluna e rota por `claude_session_id`;
- a B-08 do [15](../plans/15-rules-management/README.md), em andamento, aprofunda a gramática do Claude
  no domínio.

**Ordem recomendada** (§10): fechar a F0 do 26, rodar o 28 e só então retomar a F1 do 26. Depois
vêm o 13 e o 27, na ordem que o usuário já decidiu. Isso **muda** a ordem "26 → 13 → 27" decidida em
2026-10-09, porque põe o 28 no meio do 26, e por isso é decisão do usuário (D-01).

---

## 3. Princípios

Os da [discovery 03 §3](03-multiplos-motores-de-agente.md#3-princípios) continuam valendo. Estes são
os que esta proposta acrescenta ou torna verificáveis. Os marcados **(27)** já são regra no plano 27 e
passam a valer para o contrato inteiro.

1. **O cliente desenha pelo `kind`, nunca pelo motor nem pelo nome nativo (27).** Nenhum `if` sobre
   `engine`, `toolName` ou valor de modo do Claude no web ou no app
   ([27 · F6](../plans/27-conversation-losses/F6-clients.md)).
2. **O nome nativo só viaja como texto opaco, em `origin` (27).** `origin { engine, native }` serve
   para diagnóstico, para a linha genérica e para o dialeto de regra do motor. Nenhum cliente decide
   por ele.
3. **`kind` é string aberta; o desconhecido aparece, e não quebra (27).** O que o cliente não conhece
   é desenhado pela linha genérica (`unknown`/`other`), como as U-05…U-11 do 27.
4. **Todo `kind` faz sentido para pelo menos um motor além do Claude, ou é genérico (27 · D-10).** A
   regra que o 27 usa para os avisos vale para os tipos de ferramenta, as interações e as capacidades.
5. **Quem interpreta é o adapter do motor.** O backend entrega pronto: tipo, rótulo
   (`messageKey` + `params`, como manda a regra 2 do AGENTS), assunto, caminhos que mudam, diff, tarefas,
   plano e pergunta. O cliente não lê o input cru de nenhuma ferramenta.
6. **Três anéis em cada ponta.** Núcleo neutro; extensão de motor (`engines/<motor>/`), que só
   depende do núcleo; e a composição, o único ponto que conhece as extensões (§5). A seta aponta para o
   núcleo, nas três pontas, e o lint confere.
7. **Capacidade declarada, nunca suposta** ([03 §6.2](03-multiplos-motores-de-agente.md#62-capacidades)).
   O cliente esconde o que o motor da sessão não tem. Com o Claude como motor único, nada some da tela.
8. **Vocabulário neutro é verificado por máquina** (regra 9 do AGENTS). O teste de vocabulário da
   [27 · B-07](../plans/27-conversation-losses/F2-contract.md) deixa de olhar só os schemas novos e passa
   a olhar todo o contrato, as chaves de i18n e o código do núcleo nas três pontas (§7).
9. **Sem big bang, sem perda.** O Claude continua sendo o único motor de produção. **Critério do plano:
   tudo o que existe funciona igual, e nenhum arquivo do núcleo conhece o Claude.** O segundo motor real
   é a 03 (M1/M2). A prova de neutralidade é um **motor de teste** (D-14).

---

## 4. Inventário de 2026-10-10

Medido com `grep`, `wc` e leitura, sem tocar em nada. Os números servem para dimensionar o trabalho,
não para contar tarefas. "Núcleo" é tudo o que **não** está em `adapter/outbound/claude/` (backend) e
em `features/claude-settings/` (web).

### 4.1 Backend

| Medida | Valor | Onde |
|---|---|---|
| Arquivos que importam o SDK | 17, **todos** no adapter | `sdk-is-isolated` garante |
| Tamanho do adapter | 28 arquivos, 4 067 linhas | [adapter/outbound/claude/](../../backend/src/adapter/outbound/claude/) |
| `[Cc]laude` em `domain/` | 66 de 197 arquivos (33 com a palavra em código, 94 linhas) | `audit-event-kind`, `claude-session-id`, `domain/claude-config/*` |
| `[Cc]laude` em `application/` | 66 de 189 arquivos (33 em código, 133 linhas) | `start-session.use-case.ts` (25), `claude-session.port.ts` |
| `[Cc]laude` em `adapter/inbound/` | 18 de 58 arquivos | `claude-config.controller.ts`, `session-conversation.ts` |
| `[Cc]laude` em `infrastructure/` | 32 de 90 arquivos | migrations `0011`, `0013`, `0020`; `claude-config.module.ts` |
| `ClaudeSessionId` (tipo) | 78 ocorrências em 29 arquivos | value object em `domain/transcript/` |
| Nome de ferramenta do Claude em código do núcleo | 36 arquivos o citam, 7 decidem por ele | tabela abaixo |
| Adapter importando outro adapter | 2 | `diag/installation-versions.reader.ts` → `claude/cli-version`; `permission/permission-resolved.listeners.ts` → `claude/permission-bridge` |

**Onde o domínio e a aplicação decidem pelo Claude:**

| Arquivo | O que sabe do Claude |
|---|---|
| [risk.classifier.ts](../../backend/src/domain/permission/services/risk.classifier.ts) | conjuntos fixos `Read`/`Glob`/`Grep`/`WebFetch`/`TodoWrite`/`Task*`… (leitura) e `Write`/`Edit`/`MultiEdit`/`NotebookEdit` (escrita); lê `input.command` |
| [rule-pattern.ts](../../backend/src/domain/permission/services/rule-pattern.ts) | a gramática `Tool(x:*)` "dos settings do Claude Code"; `MATCHED_FIELDS` = `command`, `file_path`, `path`, `pattern`, `url` |
| `shell-syntax.ts`, `rule-reach.ts`, `rule-precedence.ts` | `SHELL_TOOLS` = `Bash`; `permissionMode === 'plan'` |
| [mode-approval.ts](../../backend/src/domain/permission/services/mode-approval.ts) | `HUMAN_ONLY_TOOLS` = `AskUserQuestion`, `ExitPlanMode` |
| `question.value-object.ts`, `question.ts` | `QUESTION_TOOL = 'AskUserQuestion'`; normaliza `input.questions` |
| [session-diff.ts](../../backend/src/domain/session/services/session-diff.ts) | `DIFFABLE_TOOLS` = `Edit`/`MultiEdit`/`Write`; lê `file_path`, `content`, `edits[].old_string`/`new_string` |
| `mode-widening.ts`, `permission-mode.value-object.ts` | os modos do CLI (`default`, `acceptEdits`, `plan`, `dontAsk`, `auto`, `bypassPermissions`) e `sdkPermissionMode()` |
| `installation.ts`, `slash-commands.ts` | tipos da instalação do Claude (`supportsEffort`, `outputStyle`, `tokenSource`), o plugin `remote-claude-user`, os comandos sugeridos (`init`, `compact`…) |
| `disclosed-input.ts` | `if (toolName !== 'Read')` |
| `change-origin.ts` | `ChangeOrigin = 'claude' \| 'user' \| 'external'` |
| `session-changes.use-cases.ts` | `tool.toolName !== 'Write'` |

**As portas com forma de Claude:**

- [claude-session.port.ts](../../backend/src/application/session/ports/claude-session.port.ts), com
  `ClaudeSessionStart` (`effort`, `thinking`, `outputStyle`, `fallbackModel`, `forkAt`) e
  `ClaudeSessionHandle` (`cliVersion`, `supportedCommands()`, `contextUse()`, `mcpServers()`).
- O `SessionEvent` é `{ type: string; payload: Record<string, unknown> }`: o evento não tem tipo na
  aplicação, e o mapper do adapter é quem decide a forma.
- `TranscriptStore`, `SessionOrigin`, `ResumableConversationSource`, `UndoReach` e `JournalScope`, todas
  chaveadas por `ClaudeSessionId`.
- `PermissionQuestion`/`ToolInvocation` levam `toolName` + `input` cru, na forma do `canUseTool` e do hook
  `PreToolUse`.

**O módulo `claude-config` (plano 13):**

- Existe nas quatro camadas, mais `adapter/outbound/claude-config/` e `persistence/claude-config/`.
- Tabelas: `claude_defaults`, `mcp_servers`, `mcp_server_secrets`, `mcp_project_approvals`,
  `claude_plugins` e `claude_skill_preferences`, todas na migration `0020`.
- 13 kinds `claude.*` de auditoria, dos quais só `claude.defaultsChanged` é emitido hoje.
- O controller é `@Controller('claude')`, e o desenho do [03-modules](../architecture/backend/03-modules.md)
  prevê cerca de 20 rotas `/claude/*`.

**Configuração:**

- Do motor, no adapter: `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_ENABLE_TODO_TOOLS` e `CLAUDE_CODE_ENABLE_TASKS`.
- Do produto, com valor do Claude: `RC_SESSION_DEFAULT_MODEL=claude-sonnet-5` e
  `RC_MODEL_CHECK_MAX_BUDGET_USD`.

### 4.2 Contrato

| Medida | Valor |
|---|---|
| Schemas em [packages/contracts/schema/](../../packages/contracts/schema/) | 57 (eventos, comandos, acks, respostas, definições) |
| Cobertura | **só o WS**; o REST tem tipos à mão no web e no app |
| `claudeSessionId` | obrigatório em `session.started`; em `session.attached`; `transcript.follow` o descreve como "a conversa no store do Claude" |
| Dado cru do motor | `tool.started.{toolName, input}` e `permission.requested.{toolName, input}` obrigatórios |
| Enums do Claude | `permissionMode` (`default`, `acceptEdits`, `bypassPermissions`, `plan`, `allowAll`) em três schemas; `effort` (`low`…`max`); `workspace.filesChanged.origin` = `claude` |
| Unidade do Claude | `turn.completed.costUsd` obrigatório; `usage` é o mapa aberto da Anthropic (`input_tokens`, `cache_read_input_tokens`…) |
| Nomes da API | blocos `redacted_thinking`, `tool_use` e `tool_result`; `tool.progress.chunk` é "`Bash · 3s`" |
| Gramática do Claude | `permission.requested.suggestions[].pattern` e `reaches[].patterns` |
| Já canônico | `interaction` de pergunta e `answers` (plano 24); `riskHint`, `title`, `description`, `status` |
| Descrições que dizem "Claude" | 20 schemas |

### 4.3 Web

| Medida | Valor | Onde |
|---|---|---|
| Decide pelo nome da ferramenta | 6 arquivos, 32 linhas, mais 2 que montam chave de i18n com o nome (`permission.tool.${toolName}`) | [tool-labels.ts](../../web/src/features/session/lib/tool-labels.ts) (18 ferramentas), `task-list.ts`, `ToolRow.tsx`, `question-of.ts`, `edit-preview.ts`, `PermissionRequestCard.tsx` |
| Lê input cru de ferramenta | 6 arquivos (`file_path`, `old_string`, `new_string`, `edits`, `command`, `todos`, `plan`…) | os de cima, mais `useEditPreview.ts` e `PlanApprovalCard.tsx` |
| Nomes da API no redutor | `input_tokens`, `cache_read_input_tokens`, `redacted_thinking` | [conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts) |
| Enum do Claude escrito à mão | modos em 5 lugares, esforço em 4 | `claude-panel.store.ts`, `panel-modes.ts`, `claude-panel-restorer.ts`, `claude-settings/types/defaults.ts`, `PlanApprovalCard.tsx` |
| `claudeSessionId` | 29 linhas em 9 arquivos | `live-session.store.ts`, `ws-client.ts`… |
| Identificador `claude*` fora do `claude-settings` | 63 arquivos | `claudePanelStore`, `useClaudePanel`, `addToClaude`, comandos `claude.*`, view `'claude'` |
| Arquivos com nome de Claude | a feature `claude-settings/` (21 arquivos, 1 284 linhas), mais 14 fora dela | `ClaudePanel.tsx`, `ClaudeSideBar.tsx`, `ClaudeSettingsRoute.tsx`… |
| i18n | **305 de 1 816 chaves (17 %)** têm "claude" na chave ou "Claude" no valor | `claudeSettings.*` (~100), `claudePanel.*` (46), `claudeConfig.*` (15) |
| Prompt literal | `'/compact'` | `SessionScreen.tsx:459` |

### 4.4 App

| Medida | Valor | Onde |
|---|---|---|
| Decide pelo nome da ferramenta | 4 arquivos (17 literais), mais 1 por constante | `tool_card.dart`, `permission_card_view.dart` (8 nomes), `task_list.dart`, `plan_approval_card.dart`; `permission_panel.dart` |
| Lê input cru | 3 arquivos, 9 chaves | `tool_card.dart` (`command`), `task_list.dart` (`todos`, `activeForm`, `subject`…), `plan_approval_card.dart` (`plan`) |
| Interpretação do Claude **na camada de domínio** | `task_list.dart` refaz a lista de tarefas a partir do `TodoWrite`/`Task*` | `features/session/domain/entities/` |
| Enum do Claude escrito à mão | modos em `session_choices.dart` e `plan_approval_card.dart`; categorias de contexto do Claude em `context_ring.dart` | |
| `claudeSessionId` | 31 ocorrências fora do gerado, em 11 arquivos | `resume_controller.dart`, `session_update.dart`, `ws_client.dart`… |
| Nome de Claude | `ClaudeWaitingStrip`; o produto (`remote_claude`, `RemoteClaudeApp`, bundle ids) | |
| i18n | 53 de 672 chaves em cada ARB; famílias `permissionTool*` (uma por ferramenta), `mode*`, `effort*`, `context*` | |
| Prompt literal | `'/compact'` | `live_session_controller.dart:234` |
| Sem par no app | o diff (o web tem; a F4 do 26 o traria a partir do input) | |

### 4.5 A mesma interpretação, duas vezes

| Lógica | App | Web |
|---|---|---|
| rótulo da tool, MCP, subagent, `Bash`, pergunta | `tool_card.dart` | `tool-labels.ts`, `ToolRow.tsx`, `question-of.ts` |
| rótulo da tool no cartão de permissão | `permission_card_view.dart` | `PermissionCard.tsx` |
| lista de tarefas | `task_list.dart` (domínio) | `task-list.ts` |
| faixa de tarefas | `task_strip.dart` | `TaskStrip.tsx` |
| cartão de plano e modos depois dele | `plan_approval_card.dart`, `permission_panel.dart` | `PlanApprovalCard.tsx`, `PermissionRequestCard.tsx` |
| modos oferecidos | `session_choices.dart` | `panel-modes.ts`, `claude-panel-restorer.ts`, `defaults.ts` |
| verbos do "trabalhando" | `working_indicator.dart` | `working-verbs.ts` |
| categorias do contexto | `context_ring.dart` | `ContextMeter.tsx` |
| `/compact` | `live_session_controller.dart` | `SessionScreen.tsx` |
| rótulo do raciocínio | `thinking_line.dart` | `thinking-label.ts` |

São 10 pares. Os oito primeiros interpretam dado do Claude e somem com o contrato canônico. Os verbos
do "trabalhando" e o rótulo do raciocínio são texto do produto. Ficam nas duas pontas, pareados pelo
`i18n-shared.json`.

---

## 5. Arquitetura alvo: três anéis em cada ponta

```
             ┌──────────────── composição ────────────────┐
             │ registra as extensões habilitadas           │
             └──────┬──────────────────────────────┬───────┘
                    │ importa                      │ importa
                    ▼                              ▼
  ┌──────── núcleo (neutro) ────────┐   ┌──── engines/<motor>/ ────┐
  │ conversa, permissão, histórico, │◄──│ o que só esse motor tem:  │
  │ auditoria, arquivos, workbench  │   │ adapter, classificador,   │
  │ desenha pelo `kind`; registros  │   │ telas próprias, chaves    │
  │ onde a extensão se pendura      │   │ de i18n próprias          │
  └─────────────────────────────────┘   └───────────────────────────┘
        nunca importa engines/                nunca importa outra extensão
```

A mesma forma nas três pontas. Cada uma usa o mecanismo de fronteira que já tem
([09-code-quality](../architecture/shared/09-code-quality.md#regras-de-arquitetura-como-lint)).

### 5.1 Backend

O backend é organizado por camada ([backend/02](../architecture/backend/02-folder-structure.md)), então
a extensão é um **recorte por motor dentro de cada camada**, e não uma pasta solta:

```
backend/src/
├── domain/                     núcleo: nenhum nome de motor, de ferramenta, de modo ou de campo cru
│   ├── engine/                 EngineId, ConversationRef, EngineCapabilities, ToolKind, interações
│   └── engines/claude/         o que só o Claude tem como regra (ex-claude-config: plugins, skills)
├── application/
│   ├── session/ports/          AgentEnginePort, EngineRegistry (ex-ClaudeSessionPort)
│   └── engines/claude/         use cases da extensão (ex-application/claude-config, parte)
├── adapter/
│   ├── inbound/http/engines/claude/     rotas /engines/claude/* (ex-/claude/*)
│   └── outbound/engines/claude/         ex-adapter/outbound/claude/: SDK, mapper, gate, transcript,
│                                        e o que sai do núcleo: classificador de ferramenta, dialeto
│                                        de regra, gramática dos modos
└── infrastructure/modules/engines/claude.module.ts      a composição
```

O que **sai do núcleo e vai para o adapter** do Claude:

| Hoje no núcleo | Vai para | E o núcleo fica com |
|---|---|---|
| conjuntos de nome em `risk.classifier.ts` | o classificador de ferramenta do adapter (nome → `kind`) | risco por `kind`; o comando do `shell` continua parseado no domínio, porque é neutro |
| gramática `Tool(x:*)` de `rule-pattern.ts`, `SHELL_TOOLS`, `MATCHED_FIELDS` | uma porta `RuleDialect`, implementada pelo adapter | a regra como `{ engine, kind?, matcher }`; casar e alcançar por meio da porta (D-11) |
| `DIFFABLE_TOOLS` e a leitura de `old_string` em `session-diff.ts` | o classificador, que entrega `FileChange { path, op, edits?, content? }` | o diff sobre `FileChange` |
| `HUMAN_ONLY_TOOLS`, `QUESTION_TOOL` | a interação canônica (`question`, `plan`) | "interação nunca é aprovada por regra nem por modo" |
| `disclosed-input` por `Read` | o `kind` `file.read` e o `subject` | o que a auditoria mostra, por `kind` |
| modos do CLI em `mode-widening.ts` e `sdkPermissionMode()` | o adapter traduz o modo canônico | os modos canônicos (§6.4) |
| `ClaudeSessionId`, `Claude*Error` | `ConversationRef`, `AgentUnavailableError`, `AgentTimeoutError` | a validação do id é do adapter |
| tipos da instalação do Claude em `installation.ts` | o adapter, ou a extensão | `EngineDescription` (versão, autenticado, capacidades), como na 03 §6.9 |
| os dois imports de adapter → `claude/` | uma porta do núcleo | — |

**O `claude-config` se divide** (D-06):

- **padrões da sessão** (modelo, modo, esforço) viram núcleo, por motor, e a tabela ganha `engine`;
- **MCP** vira núcleo, como capacidade (`mcp`), porque é um protocolo aberto, e Codex, Copilot e
  Gemini também o usam;
- **plugins, skills, output styles, `.claude/` do projeto, conta e instalação** são do Claude e ficam
  em `engines/claude/`. As tabelas `claude_plugins` e `claude_skill_preferences` e os kinds `claude.*`
  dessas partes **mantêm o prefixo**, porque o prefixo passa a ser o da extensão (convenção
  `<módulo>.<fato>` do [14 · B-06](../plans/14-audit-explained/F0-contract.md)).

### 5.2 Web

O web é organizado por feature ([web/02](../architecture/web/02-folder-structure.md)), e o núcleo já
tem os **registros** onde uma extensão se pendura: as seções de configuração (`settings-sections`), a
navegação global (`global-navigation.ts`), os comandos (`commands/`) e as views do workbench.

```
web/src/
├── features/                   núcleo: session, permission, transcript… — desenham pelo `kind`
├── engines/
│   └── claude/                 ex-features/claude-settings, e a ajuda própria do Claude
│       ├── settings/           as seções que só o Claude tem (plugins, skills, projeto, conta)
│       └── index.ts            registra seções, comandos e ajuda nos registros do núcleo
└── app/engines.ts              a composição: o único arquivo que importa engines/*
```

Ao mesmo tempo, renomeia-se o que é núcleo mas tem nome de produto:

- `ClaudePanel` → `AgentPanel`, `claudePanelStore` → `agentPanelStore`, `ClaudeSideBar` → `AgentSideBar`;
- `addToClaude` → `addToAgent`;
- comandos `claude.*` → `agent.*`, e a view `'claude'` → `'agent'`;
- `claudePanel.*` → `agentPanel.*`, e as chaves de valor "Claude" ganham o parâmetro `{agent}`.

O nome do motor vem de `GET /engines` (`displayName`), e não é traduzido, porque é nome próprio. Mas
também não nasce no JSX ([03 §7.4](03-multiplos-motores-de-agente.md#74-web)).

### 5.3 App

```
mobile/lib/
├── features/                   núcleo: session, permission, transcript… — desenham pelo `kind`
├── engines/
│   └── claude/                 só o que for de um motor só; hoje, nada (D-15)
└── app/engines.dart            a composição
```

O app hoje não tem tela própria do Claude. O que ele tem de Claude é interpretação, e ela some com o
contrato canônico:

- `task_list.dart` **sai da camada de domínio**: a lista chega pronta do servidor;
- os dois `toolLabel` (o de `tool_card.dart` e o de `permission_card_view.dart`) dão lugar ao rótulo do evento;
- `plan_approval_card.dart` lê a interação `plan`;
- `session_choices.dart` e `context_ring.dart` leem o que o servidor anuncia;
- `ClaudeWaitingStrip` → `AgentWaitingStrip`;
- `claudeSessionId` → `conversation`.

O anel `engines/` nasce com a regra de lint já valendo, e fica vazio até haver uma tela de um motor só.

### 5.4 O que fica com o nome do produto

`remote-claude`, `@remote-claude/contracts`, o pacote Dart `remote_claude`, `RemoteClaudeApp`, os bundle
ids, os canais `remote_claude/*` e o plugin sintético `remote-claude-user` são **o nome do produto**, e
não o do motor. Renomear o produto é decisão separada ([03 · ME-12](03-multiplos-motores-de-agente.md#18-decisões-em-aberto)).
Esses nomes entram numa lista de exceções permanentes do portão (§7), cada um com o motivo.

---

## 6. O modelo canônico das mensagens

### 6.1 O que vem do plano 27, e vira regra de todo o contrato

| Convenção do 27 | Onde nasceu | Com este plano |
|---|---|---|
| `origin { engine, native }`, opaco | `session.notice` ([27 · B-05](../plans/27-conversation-losses/F2-contract.md)) | todo evento que nasce de um item nativo do motor carrega `origin`: `tool.*`, `permission.requested`, `message.*`. O `toolName` de hoje vira `origin.native` |
| `kind` aberto, desconhecido desenhado pela linha genérica | os U-05…U-11 da [27 · F6](../plans/27-conversation-losses/F6-clients.md) | o `kind` de ferramenta desconhecido é `other`; o cliente desenha pelo rótulo do evento e pela entrada exata |
| `messageKey` + `params` quando o texto é nosso, e `text` quando é do agente | `session.notice` | o rótulo da ferramenta, as categorias de contexto, os modos e o esforço |
| todo `kind` serve a outro motor, ou é genérico | [27 · D-10](../plans/27-conversation-losses/decisions.md#f2--contrato) | o critério para a tabela de `ToolKind` e para cada capacidade |
| teste do vocabulário canônico, com a lista proibida num arquivo só | [27 · B-07](../plans/27-conversation-losses/F2-contract.md) | vira o portão de neutralidade do §7, sobre o contrato inteiro, o i18n e o código do núcleo (D-03) |
| variante do SDK com destino declarado pelo compilador (`switch` exaustivo com `never`) | [27 · B-08](../plans/27-conversation-losses/F3-backend-notices.md) | a tabela nome nativo → `kind` do classificador também é exaustiva, e o nome não listado cai em `other` |
| web e app **juntos** na mesma fase, com o i18n pareado | [27 · F6](../plans/27-conversation-losses/F6-clients.md) | cada fase do 28 é vertical: contrato, backend, web e app (§11) |

### 6.2 Ferramenta

A tabela de tipos é a da [03 §6.3](03-multiplos-motores-de-agente.md#63-ferramentas-canônicas), com dois
acréscimos que a medição pediu: `question` e `plan` (hoje decididos por nome nos dois clientes) e
`tasks` (a lista de tarefas).

```jsonc
"tool.started": {
  "toolUseId": "…",
  "kind": "file.edit",                  // aberto: file.read · file.edit · file.write · file.delete · file.move
                                        //   search · shell · web · mcp · agent · question · plan · tasks · other
  "label": { "messageKey": "sessions.tool.fileEdit",
             "params": { "path": "src/a.ts", "added": 3, "removed": 1 } },   // o backend monta, o cliente traduz
  "subject": { "paths": ["src/a.ts"] }, // normalizado, todos opcionais: paths, command, pattern, url, query,
                                        //   server, tool, description
  "changes": [{ "path": "src/a.ts", "op": "edit" }],   // file.*: o que vai mudar (desfazer, diff, prévia)
  "rawInput": { },                      // opaco: só a "entrada exata", nunca lido campo a campo (D-04)
  "origin": { "engine": "claude", "native": "Edit" },
  "title": "…", "parentToolUseId": "…", "at": "…"
}
```

- `permission.requested` ganha os mesmos `kind`, `label`, `subject`, `changes` e `origin`, e mantém
  `riskHint`, `title`, `description`, `reaches` e `interaction`.
- **O diff e a prévia do diff são do backend.** A rota `GET /sessions/:id/tools/:toolUseId/diff` passa a
  servir também o pedido **pendente**, e o `edit-preview.ts` do web deixa de calcular a prévia contra o
  disco a partir do input. Com isso, o diff que a F4 do 26 levaria ao app (B-16) é só uma chamada a essa
  rota.
- `tool.progress.chunk` deixa de trazer o nome nativo ("`Bash · 3s`"): o cliente monta o texto com o
  rótulo do `tool.started`.
- O `kind` `agent` substitui o `opensSubagent` por nome (`Agent`/`Task`), e o `parentToolUseId` continua
  como está.

### 6.3 Interações e estado da sessão

| Hoje | Canônico | Capacidade |
|---|---|---|
| a pergunta é reconhecida por `toolName === 'AskUserQuestion'` nos clientes | o `kind` `question`; a `interaction` do plano 24 continua como é | `questions` |
| o cartão de plano é escolhido por `ExitPlanMode` e lê `input.plan` | `interaction { kind: 'plan', markdown, path? }`, a segunda variante que o schema do 24 já previa | `planApproval` |
| a lista de tarefas é refeita nos dois clientes a partir de `TodoWrite`/`Task*` | evento `session.tasksChanged { tasks: [{ id, title, activeTitle?, status: pending · inProgress · completed }] }`, ao vivo e no histórico | `taskList` |
| os dois clientes mandam o prompt `'/compact'` | comando `session.compact`; o adapter sabe que no Claude é `/compact` | `compaction` |
| categorias de contexto com os ids do Claude | `{ id, messageKey?, text?, tokens }`; ids canônicos com chave nossa (`system`, `tools`, `messages`, `memory`, `free`, `reserved`), e o resto com o texto do motor | `contextUse` |
| `workspace.filesChanged.origin = 'claude'` | `origin = 'agent'`, mais o `engine` | — |

### 6.4 Sessão, modos, uso e erros

| Hoje | Canônico |
|---|---|
| `claudeSessionId`, `resumedFrom`, `transcript.follow.conversationId` | `conversation { engine, id }` e `resumedFrom { engine, id }` ([03 §6.7](03-multiplos-motores-de-agente.md#67-conversa-histórico-e-retomada)); rotas `/transcripts/:engine/:id/…` |
| `permissionMode`: `default` · `acceptEdits` · `plan` · `allowAll` · `bypassPermissions` | `ask` · `acceptEdits` · `readOnly` · `allowAll` ([03 §6.5](03-multiplos-motores-de-agente.md#65-modos-de-permissão-canônicos) mais o [ADR-022](../architecture/shared/00-decisions.md#adr-022--permitir-tudo-é-um-modo-nosso-não-o-bypasspermissions-do-sdk)); `bypassPermissions` sai do enum, porque já é recusado; o motor anuncia os que tem |
| `effort` fixo `low`…`max` | enum canônico, e o motor anuncia o subconjunto que tem (`effortLevels`) |
| `turn.completed.costUsd` obrigatório, `usage` com as chaves da Anthropic | `usage { inputTokens?, outputTokens?, cacheReadTokens?, cacheWriteTokens? }` e `costUsd?` opcional ([03 §6.8](03-multiplos-motores-de-agente.md#68-uso-e-custo)) |
| blocos `redacted_thinking`, `tool_use`, `tool_result` | `redactedThinking`, `toolUse`, `toolResult`. O `thinking` fica, porque o Codex tem o mesmo conceito; quem não tem a capacidade não o emite |
| `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`, `session.error.claudeUnavailable` | `AGENT_UNAVAILABLE`, `AGENT_TIMEOUT`, com `params.engine` |
| `session.started` sem capacidades | `session.started.engine` e `capabilities`; `GET /engines` com `{ id, displayName, state, capabilities }` |

### 6.5 REST

Os tipos das rotas que **a conversa** lê passam para o pacote `contracts`, com o mesmo gerador para
TypeScript e Dart (D-09). São estas: `/transcripts/*`, `/sessions/:id/{models,context,mcp-servers,commands}`,
`/sessions/:id/tools/:toolUseId/diff`, `/catalog` e `/engines`. Hoje são escritas à mão nas duas pontas,
e é por isso que só o WS tem o contrato conferido.

As rotas de extensão (`/engines/claude/*`) ficam fora do pacote. Elas são consumidas só por
`engines/claude/` no web.

### 6.6 Versão do contrato

Remover `claudeSessionId`, `toolName` e `input`, e trocar os valores do enum de modos, **quebra** o
contrato: sobe `v`, e o servidor aceita `v-1` durante a janela
([05 · Versionamento](../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)).
Durante a janela, o servidor emite os campos novos **e** os antigos. Sai em `v+1` só o que o portão de
neutralidade aponta (D-08).

---

## 7. Verificação por máquina

"Regra que não é verificada por máquina não existe" (regra 9 do AGENTS). O plano entrega três
verificações, e as três quebram o build.

### 7.1 Lint de arquitetura, nas três pontas

| Ponta | Regra nova | Proíbe |
|---|---|---|
| backend (`dependency-cruiser`) | `engine-extension-is-isolated` | importar `*/engines/<motor>/` de fora dele, exceto a composição em `infrastructure/modules/engines/` |
| backend | `engines-do-not-know-each-other` | `engines/<a>/` importar `engines/<b>/` |
| backend | `sdk-is-isolated` (revista) | o SDK fora de `adapter/outbound/engines/claude/` |
| backend | `adapters-do-not-know-each-other` | um adapter importar arquivo interno de outro; hoje, os 2 casos do §4.1 |
| web (ESLint `no-restricted-imports`) | `core-cannot-import-engines` | `features/`, `shared/` e `app/` (menos `app/engines.ts`) importando `engines/` |
| web | `engines-are-isolated` | `engines/<a>/` importando `engines/<b>/`, ou um caminho profundo de `features/` (só o barril) |
| app (`import_lint`) | `core_cannot_import_engines`, `features_cannot_import_engines` | `core/` e `features/` importando `engines/` |
| app | `engines_are_isolated` | `engines/<a>/` importando `engines/<b>/` |

### 7.2 O portão de neutralidade

Um script em `scripts/`, pela regra 10 do AGENTS: `scripts/engine-neutrality.mjs`, com a lógica em
`scripts/lib/` e os testes em `test/unit/scripts/`. Roda como `pnpm neutral:check`, no **portão 11**,
ao lado do `contracts:check` e do `i18n:check`.

- **O vocabulário proibido fica num arquivo só**, `scripts/engine-vocabulary.json`, com o motivo de
  cada entrada. É o arquivo que a 27 · B-07 previa (D-03). Entram:
  - os nomes de motor: `claude`, `anthropic`, `sdk`;
  - os nomes nativos de ferramenta do Claude;
  - os modos do CLI;
  - as chaves cruas de input: `old_string`, `new_string`, `file_path`, `todos`, `activeForm`;
  - as chaves de uso da Anthropic;
  - os subtipos `snake_case` do SDK.
- **O que ele lê:**
  - o código do núcleo nas três pontas: identificadores e literais, e também comentários (D-13);
  - **todos** os schemas do contrato: chaves, enums, `kind` e descrições;
  - as chaves **e os valores** de i18n dos namespaces do núcleo, porque o nome do motor entra como
    `{agent}`.
- **Fora da leitura:** `engines/` nas três pontas, `origin.native`, o código gerado e os nomes de
  produto do §5.4.
- **Catraca:** um baseline (`scripts/engine-neutrality-baseline.json`) lista cada violação de hoje com a
  fase do 28 que a remove. O portão falha:
  - com violação nova fora do baseline;
  - com entrada do baseline que **não ocorre mais** (o baseline só encolhe);
  - com entrada cuja fase já fechou (a mesma regra do `render-parity.json` do
    [26 · B-05](../plans/26-mobile-conversation-parity/F1-parity-map.md)).

  Ao fim do 28, o baseline do núcleo está **vazio**.

A catraca é o que permite rodar o 26, o 13 e o 27 depois do 28 sem que acoplamento novo entre, já
que nada mais pode entrar no baseline.

### 7.3 O motor de teste

Um adapter **falso, não Claude**, só para teste (D-14): ferramentas com outros nomes nativos
(`write_file`, `run_shell`), menos capacidades (sem esforço, sem compactação, sem plano) e outro
`displayName`. O e2e do web e do app abre uma sessão nele e confere três coisas:

- a conversa é desenhada pelo `kind`, igual à do Claude;
- os controles sem a capacidade somem;
- nenhuma tela diz "Claude".

Só esse teste **prova** o R3, porque o resto só prova ausência de palavra. Ele mora em
`backend/test/fakes/engine/`, ao lado do fake do SDK, e só é registrado pela composição de teste.

---

## 8. Mudanças de documentação e do AGENTS

Pedido explícito (R6). A **F0 do plano 28 escreve as normas**: o ADR, o AGENTS e a forma-alvo nos
documentos de arquitetura. Cada fase seguinte atualiza o documento do que ela implementa, na mesma
entrega, como manda o AGENTS para contrato. A tabela é a lista que o plano tem de cumprir.

### 8.1 AGENTS.md

| Seção | Mudança |
|---|---|
| **O que é este projeto** | "operar remotamente o **agente de código** instalado na máquina local (hoje o Claude Code, pela porta de motor)". A stack ganha a linha da porta de motor |
| **Regras que valem SEMPRE** | regra nova **12 — Núcleo neutro de agente**: nenhum nome de motor, de ferramenta, de modo ou campo de input cru fora de `engines/<motor>/`, nas três pontas; o cliente desenha pelo `kind`; o contrato é nosso. Verificado por `pnpm neutral:check` e pelo lint de arquitetura |
| **Regra 6** (Dependency Rule) | acrescenta "e o núcleo nunca importa `engines/`, em nenhuma das três pontas" |
| **Quando carregar cada documento** | "Entender **como** o backend conversa com o Claude local" → "…com um agente de código" ([backend/04-engine-integration](../architecture/backend/04-claude-integration.md), mais o anexo do Claude); linha nova "Mexer em algo que só um agente tem (tela, ferramenta, modo, configuração)" → `shared/12-engines.md` |
| **Gatilhos específicos** | "Vai adicionar ou alterar um evento/comando WebSocket" ganha "o evento é canônico: `kind`, `origin`, `messageKey`"; gatilho novo "Vai mostrar algo que vem de uma ferramenta do agente → pelo `kind`, nunca pelo nome" |
| **Anti-padrões** | entram: "nome de ferramenta, modo ou campo de input de um agente fora de `engines/<motor>/`"; "cliente decidindo por `engine`, `origin.native` ou `toolName`"; "`Claude*`/`claudeSessionId` em identificador, rota, tabela ou chave do núcleo"; "nome de motor escrito numa string de i18n do núcleo (é `{agent}`)". O anti-padrão "`query()` do Agent SDK sem `settingSources`…" vira "sessão de motor aberta sem a asserção de segurança do motor (no Claude: `settingSources: ['project']` e o hook `PreToolUse`)" |
| `CLAUDE.md` | **não muda**: ele só importa o AGENTS |

### 8.2 ADRs ([00-decisions](../architecture/shared/00-decisions.md))

| ADR | Mudança |
|---|---|
| **ADR-025 (novo)** — "Núcleo neutro de agente, extensões isoladas por motor nas três pontas" | os três anéis, o `kind` com o `origin` opaco, a interpretação no adapter, o portão de neutralidade e o motor de teste. **Altera** o ADR-001 (o Agent SDK deixa de ser *a* porta e passa a ser a implementação do Claude) e **estende** o ADR-006 (o contrato próprio passa a cobrir nomes de ferramenta, modos, ids de conversa e unidade de custo) |
| ADR-001 | nota de alteração pelo ADR-025; o conteúdo continua válido para o Claude |
| ADR-006 | estendido: ferramentas, interações e estado canônicos; as convenções do 27 (§6.1) |
| ADR-011 | reescrito como **contrato de segurança que todo adapter de motor cumpre** ([03 §6.6](03-multiplos-motores-de-agente.md#66-segurança-por-motor)); as duas obrigações de hoje ficam como a implementação do Claude |
| ADR-013 | os caminhos que o desfazer guarda vêm do `changes` canônico, não da tabela de nomes |
| ADR-018 ("Extensões do Claude só entram pelo produto") | reclassificado como ADR da extensão `engines/claude/`; o MCP sai dele e vira núcleo (D-06) |
| ADR-022 (permitir tudo) | os modos canônicos; `allowAll` continua nosso |

### 8.3 Documentos de arquitetura

| Documento | Mudança |
|---|---|
| [architecture/README](../architecture/README.md) | o desenho geral com a porta de motor e os três anéis |
| **shared/12-engines.md (novo)** | o documento do que é de motor: os três anéis, como criar uma extensão, o `kind`, as capacidades, o portão; roteado pelo AGENTS |
| [shared/05-websocket-protocol](../architecture/shared/05-websocket-protocol.md) | cada evento do §6, na fase que o implementa; uma seção "Canônico" com as convenções do §6.1; as seções "Thinking e subagents", "A lista de tarefas — `TodoWrite` e `Task*`" e "Slash commands" reescritas pelo `kind` e pela capacidade |
| [shared/02-i18n](../architecture/shared/02-i18n.md) | o nome do motor como `{agent}`, nunca no texto; chaves de extensão em `engines.<motor>.*` |
| [shared/03-logging](../architecture/shared/03-logging.md) | `op` `claude.*` → `engine.*`, com `engine` e `engineVersion` no contexto ([03 §11](03-multiplos-motores-de-agente.md#11-observabilidade)) |
| [shared/04-errors-and-http](../architecture/shared/04-errors-and-http.md) | `AGENT_UNAVAILABLE`, `AGENT_TIMEOUT`, `ENGINE_CAPABILITY_UNAVAILABLE` |
| [shared/06-testing-strategy](../architecture/shared/06-testing-strategy.md) | a dimensão motor nos cenários que dependem de capacidade; o motor de teste |
| [shared/07-repository-layout](../architecture/shared/07-repository-layout.md) | `engines/` nas três pontas; o REST no pacote `contracts` |
| [shared/09-code-quality](../architecture/shared/09-code-quality.md) | as regras do §7.1 nas três tabelas; o portão de neutralidade |
| [shared/10-definition-of-done](../architecture/shared/10-definition-of-done.md) | item "`pnpm neutral:check` verde, sem entrada nova no baseline" |
| [shared/11-validation-protocol](../architecture/shared/11-validation-protocol.md) | o portão 11 passa a ser "Contrato, i18n e neutralidade" |
| [backend/01-clean-architecture](../architecture/backend/01-clean-architecture.md) | o anel de extensão e a porta de motor |
| [backend/02-folder-structure](../architecture/backend/02-folder-structure.md) | `*/engines/<motor>/` em cada camada |
| [backend/03-modules](../architecture/backend/03-modules.md) | o `claude-config` dividido (§5.1); `engine` como módulo do núcleo |
| [backend/04-claude-integration](../architecture/backend/04-claude-integration.md) | vira `04-engine-integration.md` (a porta, as capacidades, o classificador, o dialeto de regra), mais um anexo `04a-claude.md` com o que é do Claude |
| [backend/05-persistence](../architecture/backend/05-persistence.md) | `engine`, `conversation_id` e `tool_kind` nas tabelas; tabelas de extensão com o prefixo do motor |
| [backend/07-testing](../architecture/backend/07-testing.md) | a suíte de contrato da porta e o motor de teste |
| [web/01-architecture](../architecture/web/01-architecture.md), [web/02-folder-structure](../architecture/web/02-folder-structure.md) | `engines/` e a composição em `app/engines.ts`; os registros do núcleo como ponto de extensão |
| [web/04-state-and-data](../architecture/web/04-state-and-data.md) | os modelos de conversa sobre o `kind` |
| [mobile/01-architecture](../architecture/mobile/01-architecture.md), [mobile/02-folder-structure](../architecture/mobile/02-folder-structure.md) | `engines/` e `app/engines.dart` |
| [mobile/04-ui](../architecture/mobile/04-ui.md) | o cartão de ferramenta e o de permissão pelo `kind` |
| [README.md](../../README.md) (raiz), seção **Comandos** | `pnpm neutral:check` |

### 8.4 Discoveries e planos

| Documento | Mudança |
|---|---|
| [discovery/README](README.md) | a linha desta discovery; ao virar plano, a coluna **Plano** |
| [discovery 03](03-multiplos-motores-de-agente.md) | cabeçalho: "o M0 é detalhado pela discovery 10 e implementado pelo plano 28" |
| [plans/README](../plans/README.md) | a linha do 28, e o parágrafo da ordem (§10) |
| README e `decisions.md` dos planos 13, 14, 15, 16, 18, 26 e 27 | uma nota "depende do 28" e o ajuste de cada task da tabela do §9. Quem faz é a F0 do 28, **não** esta discovery: o 27 está sendo escrito em paralelo, e mexer nele daqui criaria conflito |

---

## 9. Planos afetados

Estado lido em 2026-10-10 no [índice](../plans/README.md) e no [progresso geral](../plans/progress.md).

| Plano | Estado | Impacto | O que muda | Quando rodar |
|---|---|---|---|---|
| [26 — Paridade da conversa no app](../plans/26-mobile-conversation-parity/README.md) | 🔄 F0 feita, falta o `pnpm verify` | **alto** | o `render-parity.json` (F1) passa a ser chaveado pelo `kind`, e não pelos rótulos do `tool-labels.ts`; a F4 **encolhe**: a B-13 desenha o `label` do evento em vez de portar o mapa de nomes para o Dart, e a B-16 chama a rota de diff em vez de calcular a partir do input; a B-17 usa o `usage` canônico; a F5 aninha pelo `kind` `agent`; o JSON neutro da B-28 é o modelo canônico do §6 | F0 antes do 28; **F1…F7 depois** |
| [13 — Configuração do Claude](../plans/13-claude-settings/README.md) | 🔄 F0 e F1 feitas, parado antes da F2 | **alto** | o que F0 e F1 construíram (módulo, rotas, tabela, tela) é **movido** pela F6 do 28; a F2 nasce com o MCP no núcleo (capacidade `mcp`, `/engines/:engine/mcp-servers`) e os plugins em `engines/claude/`; a F3 (skills, `.claude/`, output styles, hooks) inteira em `engines/claude/`; a tela vira seções registradas pela extensão | depois do 28 e do 26 |
| [27 — Perdas da conversa](../plans/27-conversation-losses/README.md) | 🔲 criado | **baixo** | já é canônico. A B-07 é absorvida pelo portão de neutralidade do 28 (D-03). A B-21 ("Skill *x* carregada" sob o card do `Skill`) passa a ser pelo `kind`, ou por um `injected.kind` | depois do 13, como decidido |
| [15 — Gestão de regras](../plans/15-rules-management/README.md) | 🔄 B-08 em andamento | **alto** | a B-08 aprofunda a gramática do Claude no domínio (`Bash` composto, `ruleBreadth`). Com o 28, ela é escrita **atrás do `RuleDialect`**; a B-03 (`evaluate { toolName, input }`) passa a receber `kind` + `subject`; os modelos da D-16 (`Bash(git status:*)`) viram do dialeto do Claude | **pausar a B-08** até a F5 do 28 (D-12) |
| [14 — Auditoria explicada](../plans/14-audit-explained/README.md) | 🔲 | **alto** | a B-07 nasce com `engine` + `conversation_id` em vez de `claude_session_id`; a B-16 **não** cria catálogo de ferramentas do Claude no web: explica pelo `kind` e pelo `label`; a B-28 usa a rota de diff; o spike B-01 (hooks do Claude) é do adapter | depois do 28 |
| [16 — Uso e custo](../plans/16-usage-and-cost/README.md) | 🔲 | **alto** | a B-03 usa `/usage/conversations/:engine/:id`; a B-04 usa `engine` + `conversation_id` e categorias de token canônicas; as janelas de limite da conta (`five_hour`, `seven_day_opus`…) e o tipo de assinatura são do Claude: vão para a extensão, ou para capacidade (`cost: 'usd'`, [03 §6.8](03-multiplos-motores-de-agente.md#68-uso-e-custo)) | depois do 28 |
| [18 — Logs e diagnóstico](../plans/18-logs-and-diagnostics/README.md) | 🔲 | médio | a B-26 (CLI, `CLAUDE_CONFIG_DIR`, login, `claude-probe`) vira um `HealthCheck` **registrado pela extensão**; o registro da D-15 de lá já é o ponto de extensão certo; os códigos `HEALTH_CLAUDE_*` vão para a extensão | depois do 28 |
| [19 — Distribuição](../plans/19-distribution/README.md) | 🔲, último | baixo | os pré-requisitos do `install.mjs` (B-05) e a credencial por motor ([03 §6.9](03-multiplos-motores-de-agente.md#69-instalação-autenticação-e-diagnóstico)); o portão de atualização do SDK (B-12) vira por motor | continua o último |
| [12 — Terminal integrado](../plans/12-integrated-terminal/README.md) | 🔄 B-13 em andamento | baixo | o `claudePolicy` do `childEnvironment` vira uma política por motor, entregue pela extensão; "Contexto para o Claude" → `{agent}` | pode seguir; só nasce com o nome neutro |
| [11 — Busca](../plans/11-search/README.md) | 🔲 | mínimo | só o fake do SDK nos testes | independente |
| [17 — Dispositivos](../plans/17-devices/README.md), [20 — Dev public](../plans/20-dev-public/README.md) | 🔄 | nenhum | — | independentes |
| Concluídos 08, 22, 23, 24 | ✅ | — | criaram o contrato que o 28 neutraliza (`forkAt`, `effort`, `blockType`, o enum de modos, `reaches`, `transcript.*`). O 24 já é canônico | não são reabertos: o 28 muda o que eles entregaram |
| [Discovery 02 — workflow](02-workflow-de-sessoes.md), sem plano | — | médio | o WF-A (decisões estruturadas) e o WF-B nascem sobre o núcleo canônico ([03 §10.13](03-multiplos-motores-de-agente.md#1013-resumo-do-impacto-no-wf)) | depois do 28 |

---

## 10. Ordem de execução

### 10.1 A recomendada

> **Na criação do plano 28 (2026-10-10)**, a F1 do 26 já estava escrita, e só faltava o `pnpm verify`.
> O corte passou para **depois da F1**: 26 · F1 → 28 → 26 · F2…F7. O 28 reescreve pelo `kind` o mapa
> de paridade que ela entrega. A ordem que vale é a do [índice dos planos](../plans/README.md#ordem-de-execução).

```
26 · F0  (falta só o pnpm verify)
   │
   ▼
28 — Núcleo canônico e agentes isolados   F0 normas e catraca … F7 e2e com o motor de teste
   │
   ▼
26 · F1…F7   paridade sobre o `kind`; a F4 encolhe
   │
   ▼
13 · F2…F4   já em engines/claude/, com o MCP no núcleo
   │
   ▼
27           já canônico; a B-07 absorvida
   │
   ├──► 15 (retoma a B-08 sobre o RuleDialect) · 14 · 16 · 18     cada um pela sua dependência
   ├──► discovery 02 (workflow): WF-A, WF-B…
   └──► discovery 03: M1 spike → M2 segundo motor → M3 ACP → M4
                                   │
                                   ▼
                                  19 — Distribuição (o último, como já é)

Independentes do 28: 11, 12 (só o nome do `claudePolicy`), 17, 20.
```

**Por que o 28 entra antes da F1 do 26, e não depois do 27:**

1. **A F0 do 26 não acopla nada novo**: é medição e fixture. Fechá-la é só rodar o `pnpm verify`.
2. **A F1…F7 do 26 acoplaria o app ao Claude.** A B-13 porta o mapa de 18 ferramentas por nome para o
   Dart, e a B-16 faz o diff a partir do input. O 28 apagaria as duas coisas depois. Rodando antes, a
   F4 do 26 vira desenhar o `label` e chamar uma rota.
3. **O 13 parou exatamente na fronteira certa.** O que falta dele (MCP, plugins, skills, `.claude/`) é
   o que mais precisa da divisão núcleo/extensão. Rodar a F2 antes do 28 significa construir no
   `claude-config` para mover logo depois.
4. **O 27 não perde nada esperando, e ganha**: ele já é canônico, e o portão do 28 confere de graça a
   regra que a B-07 dele ia criar.
5. **A catraca (§7.2) garante a ordem por máquina.** Depois da F0 do 28, nenhum desses planos consegue
   acoplar algo novo sem quebrar o portão 11.

### 10.2 As alternativas

| Ordem | Custo |
|---|---|
| **A — a recomendada**: 26·F0 → 28 → 26·F1… → 13 → 27 | muda a ordem que o usuário decidiu em 2026-10-09 ao pôr o 28 dentro do 26 (D-01); atrasa a paridade do app pela duração do 28 |
| **B — a decidida, com o 28 no fim**: 26 → 13 → 27 → 28 | retrabalho: a F4 do 26 (rótulo e diff no Dart), a F1 e a F6 do 26 (mapa e JSON neutro por nome), a F2 e a F3 do 13 (construídas no `claude-config` e movidas), e a B-08 do 15. O acoplamento cresce até o 28, e o baseline do portão nasce maior |
| **C — só a F0 do 28 agora** (normas e catraca), o resto depois do 27 | na prática igual a A: a catraca impede a B-13 do 26 de entrar como está, e o 26 ficaria parado esperando o resto do 28 |

---

## 11. Fatiamento sugerido do plano 28

Plano no formato normativo ([plans/README](../plans/README.md)), criado por `pnpm plan new`. A ordem é
dependência. **Cada fase é vertical**: contrato, backend, web e app na mesma entrega, porque contrato
quebrado em uma ponta só é bug (AGENTS, gatilhos), e porque o 27 ([F6](../plans/27-conversation-losses/F6-clients.md))
já trabalha assim. A coluna **Documentos** é o que a fase atualiza (R6).

| Fase | Entrega | Documentos |
|---|---|---|
| **F0 — Normas e catraca** | ADR-025 e as notas no 001, 006, 011, 013, 018 e 022; a regra 12, os anti-padrões, o roteador e os gatilhos do AGENTS; `shared/12-engines.md`; a forma-alvo nos docs do §8.3; `pnpm neutral:check` com o vocabulário, o baseline de hoje e os testes do script; as regras de lint do §7.1, valendo já (`engines/` vazio nas três pontas, e os 2 imports entre adapters no baseline); as notas de dependência nos planos 13, 14, 15, 16, 18, 26 e 27 | AGENTS, 00-decisions, 12-engines, 09, 10, 11, README da raiz |
| **F1 — Porta de motor e conversa** | `AgentEnginePort` e `EngineRegistry` com o Claude como único adapter; `adapter/outbound/claude/` → `adapter/outbound/engines/claude/`; `ConversationRef` no lugar de `ClaudeSessionId` (domínio, portas, banco com migration nova, contrato, web, app); `Agent*Error`; `session.started.engine` e `capabilities`; `GET /engines`; rotas `/transcripts/:engine/:id/…` | backend/01, 02, 04 → 04-engine-integration + 04a-claude, 05; shared/04, 05 |
| **F2 — Ferramentas canônicas** | classificador exaustivo do Claude no adapter (nome → `kind`, `label`, `subject`, `changes`); `origin` no `tool.*` e no `permission.requested`; `rawInput` opaco; `risk.classifier`, `session-diff`, `disclosed-input` e o desfazer sobre o `kind` e o `FileChange`; diff e prévia pela rota, também para o pedido pendente; web e app sem `tool-labels.ts`, `edit-preview.ts`, `DIFFABLE`, os dois `toolLabel` e o `commandOf`; i18n `sessions.tool.*` por `kind`, pareado | shared/05, 02; web/04; mobile/04; ADR-013 |
| **F3 — Interações e estado** | interação `plan`; o `kind` `question` no lugar do nome; `session.tasksChanged` (ao vivo e no histórico) e o fim de `task-list.ts` e `task_list.dart`; o comando `session.compact`; categorias de contexto canônicas; o `kind` `agent` para o subagent; `origin = 'agent'` no `filesChanged` | shared/05 |
| **F4 — Modos, esforço, uso e blocos** | modos canônicos no contrato, no domínio, no banco (CHECK do `claude_defaults` por migration nova) e nas duas pontas, com o adapter traduzindo; `effortLevels` anunciado; `usage` canônico e `costUsd?`; `redactedThinking`, `toolUse`, `toolResult` | shared/05; ADR-022; backend/05 |
| **F5 — Permissão pelo dialeto** | a porta `RuleDialect`, com a gramática do Claude no adapter; `HUMAN_ONLY_TOOLS` pela interação; `engine` nas regras (as existentes migram como `claude`); `tool_kind` ao lado do `tool_name` em `audit_entries` e `permission_requests`; os 2 imports entre adapters resolvidos por porta | backend/03 (`permission`), 05; ADR-011 reescrito |
| **F6 — Extensões isoladas** | a divisão do `claude-config` (§5.1): padrões e MCP no núcleo, por motor, e o resto em `*/engines/claude/`, com as rotas `/engines/claude/*`; `features/claude-settings/` → `web/src/engines/claude/`, registrado pela composição; `ClaudePanel` → `AgentPanel` e o resto dos nomes do §5.2; os comandos `claude.*` → `agent.*`; as 305 chaves do web e as 53 do app (namespace neutro e `{agent}`), com o `i18n-shared.json`; `ClaudeWaitingStrip`; os kinds de auditoria do núcleo renomeados por migration nova | backend/02, 03; web/01, 02; mobile/01, 02; shared/02, 03, 07; ADR-018 |
| **F7 — E2E** | o motor de teste (§7.3) e o e2e do web e do app com ele; todos os e2e de hoje verdes com o Claude; `smoke-live` contra o Claude real; o baseline do núcleo **vazio** | shared/06; backend/07 |

**Critério de conclusão** (proposta):

```bash
pnpm verify:full         # inclui o portão 11 com o neutral:check, e o baseline vazio
pnpm test:e2e:mobile     # o portão 9 é só do web
pnpm test:e2e:live       # o Claude real continua igual
```

**Peso relativo:** a F2 e a F6 são as maiores. A F2 toca o domínio de permissão, o desfazer e as
duas pontas; a F6 é mecânica, mas larga (cerca de 360 chaves de i18n, a tela do 13 e os nomes).

---

## 12. Matriz de cenários (semente)

| Dimensão | Cenários |
|---|---|
| **Equivalência** | cada ferramenta nativa do Claude → o `kind` e o `label` esperados (tabela exaustiva); cada `kind` desenhado igual no web e no app; cada interação (`question`, `plan`) e a lista de tarefas, ao vivo e no histórico; cada modo canônico ↔ modo do CLI; regra existente casando igual depois da migração; a mesma conversa no Claude e no motor de teste, com o mesmo desenho |
| **Fronteira** | nome nativo fora da tabela (`other`); `mcp__srv__tool` com e sem servidor conhecido; `changes` vazio; `label` sem `params`; capacidade ausente (esforço, compactação, plano) escondendo o controle; motor com um modo só; `usage` sem nenhum campo; `costUsd` ausente; o baseline com uma entrada só e vazio |
| **Erro** | `kind` desconhecido no cliente (linha genérica, como a U-11 do 27); `session.compact` num motor sem a capacidade (`ENGINE_CAPABILITY_UNAVAILABLE`); `ConversationRef` de motor desabilitado; dialeto de regra recusando um padrão; violação nova no núcleo (o portão falha); entrada do baseline que sumiu (o portão falha); extensão importada pelo núcleo (o lint falha); `AGENT_UNAVAILABLE` traduzido nas duas pontas |
| **Transição de estado** | sessão aberta em `v-1` e reconectada em `v+1` dentro da janela; tarefas mudando de estado ao vivo; plano aprovado → modo canônico seguinte; histórico de uma conversa gravada antes da migração (`claude_session_id` → `conversation`); regras e padrões gravados antes da migração; `claude.defaultsChanged` antigo lido depois da renomeação |
| **Concorrência** | dois clientes, um em `v` e outro em `v+1`, na mesma sessão; o mesmo pedido de permissão com `kind` resolvido no web e no app; o motor de teste e o Claude abertos ao mesmo tempo na mesma pasta (a restrição da [03 §10.5](03-multiplos-motores-de-agente.md#105-motores-diferentes-num-mesmo-workflow)) |
| **Idempotência** | as migrations de `engine`/`conversation_id`, de modos e de kinds de auditoria rodadas duas vezes; `session.tasksChanged` repetido no replay; `neutral:check` rodado duas vezes sem mudar o baseline; a regra migrada duas vezes |

---

## 13. Decisões em aberto

Cada uma vira entrada no `decisions.md` do plano 28. **Recomendação** é a proposta deste documento,
não decisão tomada.

> **Decididas em 2026-10-10** no [plano 28](../plans/28-agent-neutral-core/decisions.md), pelo usuário.
> Três saíram contra a recomendação daqui, e vale o plano:
>
> - **D-09:** todo o REST vai para o pacote `contracts`, e não só o da conversa;
> - **D-10:** nenhum kind de auditoria fica com nome de motor; os da extensão viram `engine.*`;
> - **D-11:** a gramática canônica de regra entra já, e a nova D-18 migra todas as regras gravadas.
>
> Com isso, o `RuleDialect` passa a ser só tradutor por motor, e o §5.1 e o §15 ("gramática canônica
> fora do escopo") ficam superados nesse ponto. Quando a decisão já existe na 03, o ID de lá vai junto.

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D-01 | **A ordem** (§10): a decidida em 2026-10-09 é 26 → 13 → 27 | A · B · C do §10.2 | **A**: o 28 depois da F0 do 26 e antes da F1 do 26. Muda uma decisão do usuário, por isso é dele |
| D-02 | Quem monta o **rótulo** da ferramenta | o backend (`messageKey` + `params`) · o cliente, por uma tabela por `kind` | **o backend**: uma fonte só, como os avisos do 27 e a regra 2 do AGENTS; o cliente só traduz. A tabela por `kind` nos dois clientes seria a duplicação de hoje, só que menor |
| D-03 | A **B-07 do 27** | fica no 27 · é absorvida pelo portão do 28 | **absorvida**: o 28 a entrega antes, mais larga, com o mesmo arquivo de vocabulário. O 27 passa a citar o portão. Registrar no `decisions.md` do 27 na F0 do 28 |
| D-04 | O **input cru** no contrato | sai de vez · fica opaco (`rawInput`) | **opaco**: a "entrada exata" do card e a exportação da conversa precisam dele, e mostrar JSON é neutro. O portão proíbe ler qualquer campo dele, e um só componente por ponta o desenha |
| D-05 | O **termo** no código e na pasta | `engines/` · `agents/` | **`engines/`**, como a [03 · ME-04](03-multiplos-motores-de-agente.md#18-decisões-em-aberto) (`agent` já é subagent no contrato). Na UI, "agente", e o nome do motor como `{agent}` |
| D-06 | A **divisão do `claude-config`** | tudo na extensão · padrões e MCP no núcleo, e o resto na extensão · tudo no núcleo | **padrões e MCP no núcleo, o resto na extensão** (§5.1). O MCP é protocolo aberto, e os outros motores o usam |
| D-07 | As **rotas** do 13 | `/claude/*` · `/engines/claude/*` e as neutras em `/engines/:engine/*` | **`/engines/claude/*`** para a extensão; `/engines/:engine/{models,defaults,mcp-servers}` para o núcleo |
| D-08 | A **versão do contrato** ([03 · ME-13](03-multiplos-motores-de-agente.md#18-decisões-em-aberto)) | `v+1` com janela de `v` · só aditivo | **`v+1` com janela**. Se o app ainda não estiver publicado em loja, a janela pode ser zero, e isso é decisão de produto |
| D-09 | O **REST** no pacote `contracts` | nada · só as rotas que a conversa lê · todas | **só as da conversa** (§6.5): é onde a neutralidade precisa de máquina. As outras entram quando cada plano mexer nelas |
| D-10 | Os **kinds de auditoria** `claude.*` | renomear todos · renomear só os do núcleo · manter | **só os do núcleo**, por migration nova (`claude.defaultsChanged` → o do módulo de padrões; os de MCP → `mcp.*`); os de plugin e skill ficam como kinds da extensão |
| D-11 | A **gramática de regra** ([03 · ME-11](03-multiplos-motores-de-agente.md#18-decisões-em-aberto)) | gramática canônica já (`shell: npm test`) · a do Claude atrás do `RuleDialect` | **atrás do `RuleDialect` agora**, com `engine` na regra; a gramática canônica entra com o segundo motor, quando houver o que unificar |
| D-12 | A **B-08 do 15**, em andamento | terminar e mover na F5 do 28 · pausar até a F5 | **pausar**: ela aprofunda exatamente o que a F5 move. Se o estado dela não permitir pausar, terminar dentro do `RuleDialect` |
| D-13 | **Comentário** conta no portão | sim, pelo baseline · não | **sim**: comentário que diz "o store do Claude" no núcleo engana o próximo agente que ler, e a regra 9 do AGENTS não tem exceção para comentário. O custo é mecânico |
| D-14 | O **motor de teste** | sim, só no e2e · sim, também no unit da suíte de contrato da porta · não | **sim, nos dois**: é a única prova do R3 que não é ausência de palavra, e é a semente da suíte de contrato da [03 §7.7](03-multiplos-motores-de-agente.md#77-testes-e-scripts) |
| D-15 | O **`engines/` do app** nasce vazio | nasce vazio, com o lint · nasce quando houver uso | **vazio, com o lint**: a regra precisa existir antes da primeira tela de motor, ou a primeira tela entra pelo núcleo |
| D-16 | Os **nomes de modo canônicos** | `ask`/`acceptEdits`/`readOnly`/`allowAll` · manter `default` e `plan` | **os canônicos** da [03 §6.5](03-multiplos-motores-de-agente.md#65-modos-de-permissão-canônicos): `plan` só é "somente leitura" para quem conhece o Claude, e `default` não diz nada. Migra o `claude_defaults.permission_mode` e o estado restaurado dos clientes |

---

## 14. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-01 | A classificação canônica erra, e uma ferramenta que escreve é classificada como leitura ([03 · R-04](03-multiplos-motores-de-agente.md#12-riscos)) | tabela exaustiva com `never`; o nome desconhecido é `other`, que **sempre** pergunta e nunca tem regra larga; teste com a lista de ferramentas do catálogo da instalação |
| R-02 | A neutralização muda o comportamento com o Claude (regressão silenciosa) | o critério é "tudo igual": os e2e de hoje e o `smoke-live` verdes sem mudar cenário; as fixtures gravadas dos planos 22, 24 e 26 conferidas antes e depois |
| R-03 | O app publicado quebra com o `v+1` | a janela de `v-1`, com o servidor emitindo os dois formatos (D-08) |
| R-04 | O 28 atrasa a paridade do app (26) e o 13 | o atraso é o custo da ordem A; a alternativa B custa retrabalho maior (§10.2). A F0 do 28 é curta, e a catraca já protege a partir dela |
| R-05 | O baseline vira um lugar para esconder violação | só encolhe, cada entrada tem a fase que a remove, e uma entrada vencida quebra o portão |
| R-06 | Renomear 360 chaves de i18n e os identificadores gera conflito com sessões paralelas no mesmo working tree (há outra sessão editando o 27 enquanto esta discovery é escrita) | a F6 é a última fase de código, depois das mudanças de contrato; ela roda sem outro plano em andamento no mesmo tree ([verify congela o tree](../architecture/shared/11-validation-protocol.md)) |
| R-07 | A migração de `claude_session_id` → `conversation_id` perde a ligação com o checkpoint do desfazer ou com a origem da sessão | migration nova com cópia e verificação; os cenários de transição do §12; as migrations antigas não mudam ([backend/05](../architecture/backend/05-persistence.md)) |
| R-08 | O núcleo fica neutro no papel, mas cada tela continua pensando no Claude (capacidade sempre presente) | o motor de teste com capacidades a menos (D-14), no e2e das duas pontas |

---

## 15. Fora do escopo

- **Um segundo motor real** (Copilot, Codex, ACP): é a [03](03-multiplos-motores-de-agente.md), M1…M4,
  e começa depois do 28.
- **Renomear o produto** (`remote-claude`): [03 · ME-12](03-multiplos-motores-de-agente.md#18-decisões-em-aberto).
- **A gramática de regra canônica entre motores**: D-11, com o segundo motor.
- **Seletor de motor no "nova sessão"** e o selo de motor na aba: só fazem sentido com dois motores
  reais. O 28 deixa o `engine` no contrato e o `displayName` no `GET /engines`, que é o que as telas vão
  ler.
- **Mudar a proposta de workflow** (discovery 02): os ajustes continuam os da
  [03 §10.13](03-multiplos-motores-de-agente.md#1013-resumo-do-impacto-no-wf).
- **Editar os planos 13, 14, 15, 16, 18, 26 e 27 agora**: a F0 do 28 faz isso (§8.4).
