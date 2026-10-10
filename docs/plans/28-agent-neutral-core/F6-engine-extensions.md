# F6 — Extensões isoladas

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-permission-dialect.md): o contrato inteiro já é canônico, e o que sobra é **onde** o
código mora e **como** ele se chama.
**Entrega:**

- o que é de um motor só mora em `engines/<motor>/`, nas três pontas, registrado pela composição;
- o `claude-config` está dividido entre núcleo e extensão;
- os nomes, os comandos e as chaves de i18n do núcleo são neutros, com o nome do motor como `{agent}`.

---

## Por quê

É a fase mais larga e a mais mecânica: cerca de 360 chaves de i18n, a tela do [plano 13](../13-claude-settings/README.md),
63 arquivos do web com identificador `claude*` e os kinds de auditoria. Ela vem por último entre as de
código por duas razões ([R-06](README.md#riscos-e-decisões-em-aberto)):

- as fases de contrato já tiraram a maior parte das chaves e dos identificadores que mudariam duas vezes;
- é a que mais conflita com outra sessão no mesmo working tree, e por isso roda sem outro plano em
  andamento no tree.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-36 — O `claude-config` dividido no backend 🔲

A divisão segue a [discovery §5.1](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#51-backend)
([D-06](decisions.md#f6--extensões-isoladas)).

**No núcleo, por motor:**

- **os padrões da sessão** (modelo, modo, esforço, thinking, modelo reserva) num módulo `agent-settings`
  do núcleo. `claude_defaults` vira `agent_defaults`, com `engine`, por migration nova. O output style é
  do Claude e vai para a extensão;
- **o MCP**, como capacidade `mcp`: as tabelas `mcp_*` ganham `engine`, e os kinds de auditoria de MCP
  passam a `mcp.*`.

**Na extensão `*/engines/claude/` (domain, application, inbound, outbound):** a conta, a instalação, o
teste de modelo, os plugins, as skills, os output styles e o `.claude/` do projeto. As tabelas
`claude_plugins` e `claude_skill_preferences` **mantêm o prefixo**, porque são da extensão. **Nenhum kind
de auditoria** fica com nome de motor ([D-10](decisions.md#f6--extensões-isoladas)): os do núcleo seguem o
módulo (`agentSettings.defaultsChanged`, `mcp.*`), e os da extensão viram `engine.*`, com o motor no
payload (`engine.pluginAdded`, `engine.pluginUpdated`, `engine.pluginToggled`, `engine.pluginRemoved`,
`engine.skillSourceToggled`). A `CHECK` da trilha muda por migration nova, que também renomeia o
`claude.defaultsChanged` já gravado.

**As rotas** ([D-07](decisions.md#f6--extensões-isoladas)):

- do núcleo: `/engines/:engine/{models,defaults,defaults/folder,mcp-servers,project-mcp-approvals}`;
- da extensão: `/engines/claude/{account,installation,diagnostics/model-check,plugins,marketplaces,skills,project-config}`;
- as `/claude/*` ficam em `v-1`.

A regra `claude-config-never-reaches-session` passa a valer para a extensão inteira. Atualizam-se o [backend/03](../../architecture/backend/03-modules.md)
(o módulo `claude-config` sai, e entram `agent-settings`, `mcp` e a extensão) e o ADR-018, reclassificado
como ADR da extensão, com o MCP fora dele. Cenários S-104…S-107.

### B-37 — Instalação e diagnóstico pelo `describe()` 🔲

O `InstallationVersions` (`agentSdk`, `claudeCli`) e o `/diag/versions` passam a listar o `describe()` de
cada motor registrado. Os tipos da instalação do Claude saem do `domain/session/services/installation.ts`:
`supportsEffort` vira capacidade, e `tokenSource`, `apiKeySource` e `outputStyles` vão para a extensão. O
mesmo vale para o `slash-commands.ts`: o plugin sintético `remote-claude-user` e os comandos sugeridos
são da extensão. O `RC_SESSION_DEFAULT_MODEL` passa a ser por motor, e o `RC_MODEL_CHECK_MAX_BUDGET_USD`,
da extensão. Cenários S-108, S-109.

### B-38 — O `web/src/engines/claude/` 🔲

O `features/claude-settings/` (21 arquivos) muda para `web/src/engines/claude/`. As seções do núcleo
(padrões e MCP, por motor) ficam numa feature do núcleo, `features/agent-settings/`, e as seções do Claude
são **registradas** pela extensão nos registros do núcleo:

- `settings-sections`;
- `global-navigation`;
- `commands`;
- a ajuda.

O registro acontece pelo `web/src/app/engines.ts`, o único arquivo que importa `engines/`. A rota
`/claude-settings` vira `/settings/agents/$engine`, com a seção da extensão dentro. O
[web/01](../../architecture/web/01-architecture.md) e o [web/02](../../architecture/web/02-folder-structure.md)
saem da forma-alvo da F0 para a forma real. Cenários S-110, S-111.

### B-39 — Os nomes e o i18n do núcleo no web 🔲

Os renomes da [discovery §5.2](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#52-web):

- `ClaudePanel`, `ClaudeStatusItem`, `ClaudeSideBar`, `useClaudePanel`, `claudePanelStore` e
  `CLAUDE_PANEL_RESTORER` → `Agent*`;
- `addToClaude` → `addToAgent`, e `registerClaudeContext` → `registerAgentContext`;
- os comandos `claude.*` → `agent.*`, com o atalho guardado de quem já tinha migrado;
- a view, o grupo do explorer e o modelo `'claude'` → `'agent'`;
- a regex de `settings-sections.ts`.

**As 305 chaves** saem dos namespaces `claudePanel.*` e `claudeConfig.*` e dos valores "Claude" do núcleo,
de três formas:

- para namespaces neutros, com `{agent}` vindo do `displayName` do `GET /engines`;
- para `engines.claude.*`, quando a chave é da extensão;
- com o par atualizado no `i18n-shared.json`.

Cenários S-112…S-114.

### B-40 — Os nomes e o i18n do núcleo no app 🔲

O `ClaudeWaitingStrip` vira `AgentWaitingStrip`, e o `fileViewerClaudeWaiting` vira `fileViewerAgentWaiting`.
As 53 chaves dos ARB com "Claude" passam a `{agent}`, e as 5 com "Claude" no nome são renomeadas. O
`mobile/lib/engines/` continua vazio ([D-15](decisions.md#f0--normas)), e o `app/engines.dart` registra
nada além do núcleo. O [mobile/01](../../architecture/mobile/01-architecture.md) e o
[mobile/02](../../architecture/mobile/02-folder-structure.md) saem da forma-alvo. Cenários S-115, S-116.

### B-41 — O que sobra no backend: logs, push e comentários 🔲

- O `op` `claude.*` dos logs vira `engine.*`, com `engine` e `engineVersion` no contexto, no adapter e no
  `claude-config-module.configuration.ts` ([shared/03](../../architecture/shared/03-logging.md)).
- O push "Claude is waiting for you" e "Claude has a question" passa a usar `{agent}`.
- Os comentários do núcleo que dizem "o store do Claude" passam a dizer o que é do motor
  ([D-13](decisions.md#f0--normas)).

As constantes do núcleo também mudam: `CLAUDE_SESSION_PORT`, `CLAUDE_DEFAULTS_REPOSITORY` e as `CLAUDE_*` que sobrarem. Cenário
S-117.

### B-48 — O resto do REST no pacote `contracts` 🔲

Pela [D-09](decisions.md#f1--porta-de-motor-e-conversa), **todas** as rotas REST passam a ter o tipo
gerado do schema, como o WS. As rotas da conversa entraram na [B-12](F1-engine-port.md). Aqui entra o
resto, depois que as rotas do `claude-config` mudaram de lugar (B-36):

- arquivos, pastas assistidas, regras, auditoria, aparelhos, notificações e diagnóstico;
- `/engines/:engine/*` e `/engines/claude/*`.

Cada rota ganha um schema em `packages/contracts/schema/http/`, com o mesmo gerador para TypeScript e
Dart. Os tipos à mão do web (`web/src/features/*/types/`) e do app (os DTOs em `data/dtos/`) dão lugar aos
gerados.

O `contracts:check` passa a reprovar duas coisas:

- uma rota do backend sem schema, pela lista de rotas que o Nest registra;
- um schema sem rota.

O [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)
e o [shared/07](../../architecture/shared/07-repository-layout.md) passam a dizer que o pacote cobre WS e
REST. Cenários S-135, S-136.

### B-42 — Os documentos na forma real 🔲

Saem as marcas "alvo do plano 28" da F0, e cada documento passa a descrever o que existe:

- [architecture/README](../../architecture/README.md);
- [backend/01](../../architecture/backend/01-clean-architecture.md), [backend/02](../../architecture/backend/02-folder-structure.md),
  [backend/03](../../architecture/backend/03-modules.md) e [backend/05](../../architecture/backend/05-persistence.md);
- [shared/02](../../architecture/shared/02-i18n.md) (o `{agent}` e o namespace `engines.<motor>.*`) e
  [shared/07](../../architecture/shared/07-repository-layout.md);
- o `shared/12-engines.md`, com o exemplo real da extensão do Claude.

O baseline perde as últimas entradas de código do núcleo. Sobram, se sobrarem, só as que a F7 remove.
Cenários S-118, S-119.

---

## Cenários cobertos

S-104…S-119, S-135, S-136.

---

## Critério de conclusão

```bash
pnpm verify
```
