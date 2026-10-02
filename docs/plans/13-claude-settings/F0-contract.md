# F0 — Contrato

Plano: [13 — Configuração do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** planos [06](../06-workbench/README.md) (navegação global e screen frame) e
[08](../08-claude-panel/README.md) (controles da sessão) concluídos. Dentro do plano, nada: é a
primeira fase.
**Entrega:** as medições que mandam no desenho, a ADR, o módulo `claude-config` registrado, o
contrato HTTP e WS nas três pontas, os códigos de erro, as tabelas e os kinds de trilha, e as regras
de máquina que impedem uma porta de configuração de virar um furo.

---

## Por quê

Quase tudo o que este plano toca tem uma forma de desligar a aprovação humana **em silêncio** —
foi assim com `settingSources` omitido (ADR-011), com a marca de confiança do diretório
([plano 01 · D-11](../01-live-session/decisions.md#d-11--o-furo-que-invalidaria-o-produto)) e com
`allowedTools` de nome simples ([D-14](../01-live-session/decisions.md#d-14--o-segundo-jeito-de-furar-o-canusetool)).
Servidor MCP, plugin, flag settings e frontmatter de subagent são quatro portas novas do mesmo tipo.
Por isso a fase começa medindo, e termina com regra de máquina — não com UI.

**O que já foi verificado ao escrever o plano**, lendo o `sdk.d.ts` e o `sdk.mjs` do SDK `0.3.277`
instalado (não é spike; é leitura de tipo e de código):

| Fato | Onde | Consequência |
|---|---|---|
| `Query` expõe `supportedModels()`, `supportedAgents()`, `mcpServerStatus()`, `accountInfo()`, `reconnectMcpServer(name)`, `toggleMcpServer(name, enabled)`, `setMcpServers(servers)`, `setModel`, `setPermissionMode` | `sdk.d.ts`, interface `Query` | todos exigem uma `query()` viva — ver [D-05](decisions.md#d-05--catálogo-sem-sessão-viva) |
| `initializationResult()` devolve **numa chamada** `commands`, `agents`, `models`, `account`, `output_style` e `available_output_styles` | `SDKControlInitializeResponse` | a sonda efêmera faz **uma** pergunta, não cinco |
| `Options.strictMcpConfig`: só os `mcpServers` passados valem; ignora `.mcp.json`, settings, plugins e frontmatter de agent | `Options` | é o que torna o store nosso a única fonte ([D-01](decisions.md#d-01--onde-mora-o-servidor-mcp)) |
| **`mcpServers` vai para o argv**: `q.push("--mcp-config", JSON.stringify({mcpServers}))` | `sdk.mjs` | env e headers com segredo ficam em `/proc/<pid>/cmdline`, legível por qualquer usuário da máquina ([D-02](decisions.md#d-02--segredo-de-servidor-mcp)) |
| `McpServerStatus.source` — "Key trust on this, not on the name" | `McpServerStatus` | status e procedência lidos pelo `source` (S-93) |
| `McpServerToolPolicy.permission_policy: 'always_allow'` em servidor remoto | `McpHttpServerConfig.tools` | auto-aprovaria a tool sem o `canUseTool` — nunca montado (B-08) |
| `AgentDefinition.permissionMode` e `mcpServers` no frontmatter de subagent | `AgentDefinition` | subagent de projeto pode pedir modo próprio — medir (B-01) e sinalizar (B-36) |
| `Settings.enabledPlugins`, `enableAllProjectMcpServers`, `enabledMcpjsonServers` são chaves de settings — logo, de `.claude/settings.json` do projeto, que `['project']` carrega | `Settings` | um repositório clonado pode pedir plugin e aprovar o próprio `.mcp.json` |
| `Options.plugins: [{ type: 'local', path, skipMcpDiscovery? }]` — só local | `SdkPluginConfig` | plugins entram só por diretório ([D-15](decisions.md#d-15--plugins-do-claude)), e é por essa via que as skills de usuário e de sistema entram sem ampliar `settingSources` ([D-20](decisions.md#d-20--skills-de-projeto-usuário-e-sistema)) |
| `Options.skills?: string[] \| 'all'` — "a context filter, not a sandbox"; `reloadSkills()` devolve a lista de skills | `Options`, `Query` | ligar/desligar skill é preferência, não fronteira (B-34) |
| `Settings.disableSkillShellExecution` troca os blocos `!` de skill e slash command por um marcador; `Options.managedSettings` só aceita o que restringe | `Settings`, `Options` | a via para desligar shell inline se ele não passar pela aprovação ([D-21](decisions.md#d-21--shell-inline-de-skills-e-slash-commands)) |
| `updateSettings(source, …)` escreve em arquivo de settings do usuário/local; `applyFlagSettings` e `Options.settings` escrevem na camada de flag, **acima** de user/project, e aceitam `permissions` | `Query`, `Options` | três jeitos de reescrever permissão por fora do `canUseTool` — proibidos ou restritos a uma allowlist de chave (B-08) |
| `list_permission_rules`, `get_hooks_listing`, `get_settings` existem como control request, **sem** método público em `Query` | `SDKControlRequestInner` | não usamos superfície não publicada ([D-16](decisions.md#d-16--como-ler-a-configuração-de-projeto)) |

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — Spike: as medições que mandam no desenho 🔲

Contra o Claude real, sobre um `CLAUDE_CONFIG_DIR` isolado com a credencial copiada — como a
[B-45 do plano 01](../01-live-session/F0-contract.md) fez, sem disputar o `~/.claude.json` com o
Claude Code aberto na máquina —, num repositório descartável gerado por execução
([plano 04 · D-07](../04-transcript-and-resume/decisions.md#d-07--onde-o-init-pode-escrever)),
com um servidor MCP stdio de fixture ([D-19](decisions.md#d-19--servidor-mcp-de-fixture)):

1. **O que sobe com `strictMcpConfig: true`.** Com `.mcp.json`, `enableAllProjectMcpServers: true` no
   `.claude/settings.json`, subagent com `mcpServers` no frontmatter, `enabledPlugins` e conta com
   conectores claude.ai: `mcpServerStatus()` deve listar só o que passamos. Decide D-01 (S-01).
2. **Tool MCP e aprovação.** `PreToolUse` e `canUseTool` por invocação, com e sem annotation
   `readOnly`, em `default` e em `acceptEdits`. Decide D-13 (S-02).
3. **Entrega do segredo.** Confirmar em `/proc/<pid>/cmdline` o argv lido no `sdk.mjs`; medir
   `setMcpServers()` logo depois do início (as tools estão lá antes do primeiro turno?) e se `${VAR}` é
   expandido nas duas vias, e contra qual ambiente. Decide D-02 (S-03).
4. **Custo da sonda.** `initializationResult()` sem prompt: tempo, RSS, nenhum turno, nenhum
   servidor MCP com `mcpServers: {}`. Decide D-05 (S-04).
5. **O que o projeto ainda injeta com a confiança limpa.** Hooks de `.claude/settings.json` rodam?
   `CLAUDE.local.md` e `.claude/settings.local.json` são carregados com `['project']`? Subagent de
   projeto com `permissionMode: acceptEdits` escreve sem `canUseTool`? Decide D-17 e o texto da B-38.
6. **Herança de ambiente.** O que um servidor stdio enxerga do ambiente do CLI. Dimensiona a B-20 (S-05).
7. **Shell inline de skill e slash command.** Um bloco `!` num `SKILL.md` e num `.claude/commands/*.md`
   roda passando pelo `canUseTool` e pelo `PreToolUse`? E `managedSettings: { disableSkillShellExecution:
   true }` o troca pelo marcador, por origem ou para todas? Decide D-21.
8. **Skills.** `reloadSkills()` devolve só skills? Uma pasta de skill ligada por symlink dentro de um
   plugin local sintético carrega como `plugin:<nome>`? As sincronizadas do claude.ai
   (`~/.claude/skills/synced`) já entram com `['project']`? Com uma `allow` em `~/.claude/settings.json`,
   o `canUseTool` continua sendo chamado com o plugin sintético ligado? Decide a B-35 e a D-22.

O resultado vai para a [descoberta](../../discovery/01-descoberta-claude-agent-sdk.md) como uma
nova seção de spikes, com o "como reproduzir", e cada decisão acima é fechada com o número medido.
Resultado ruim **não** é falha do spike: é o que ele existe para achar. Cenários S-01…S-05 — e os
`smoke-live` da [F4](F4-e2e.md), que repetem as medições a cada versão do CLI.

### B-02 — ADR-018: extensões do Claude só entram pelo produto 🔲

ADR-018 em [00-decisions](../../architecture/shared/00-decisions.md) (a numeração segue a ordem dos
planos: 014 no 06, 015 no 07, 016 no 11, 017 no 12, 018 aqui, 019 no 14). Registra, decorrente da ADR-011 e da B-01:

- toda `query()` passa `strictMcpConfig: true`; o conjunto de servidores MCP de uma sessão é
  **composto pelo backend** a partir do store nosso e das aprovações nossas do `.mcp.json`
  ([D-01](decisions.md#d-01--onde-mora-o-servidor-mcp), [D-11](decisions.md#d-11--aprovação-do-mcpjson));
- nenhuma escrita em arquivo de settings do CLI (`updateSettings` proibido); a camada de flag
  (`Options.settings`, `applyFlagSettings`) só recebe chaves de uma allowlist (`outputStyle`,
  `effortLevel`) — nunca `permissions`, `hooks`, `env`, `enabledPlugins` ou chaves de MCP;
- plugins só pela opção `plugins` do SDK, como `local` e com `skipMcpDiscovery: true` — os de
  marketplace baixados pelo backend para diretório próprio, de marketplace declarado, nunca pelo
  `claude plugin install` nem para `~/.claude` ([D-15](decisions.md#d-15--plugins-do-claude));
- configuração de projeto (permissões, hooks, plugins habilitados) é **mostrada**, não editada por
  esta tela ([D-17](decisions.md#d-17--permissões-hooks-e-plugins-de-projeto)).

E uma **emenda à ADR-011**, "como as skills de usuário e de sistema entram sem ampliar
`settingSources`" ([D-20](decisions.md#d-20--skills-de-projeto-usuário-e-sistema), decidida pelo usuário
em 2026-09-26): `['project']` continua obrigatório e não configurável; as skills do usuário e do sistema
entram por um plugin local sintético, por usuário, que expõe só `skills/`; e, se o shell inline não
passar pela aprovação, a sessão o desliga por `managedSettings` ([D-21](decisions.md#d-21--shell-inline-de-skills-e-slash-commands)).

Atualiza também [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#options--o-que-amarramos)
(tabela de opções: `strictMcpConfig`, `mcpServers`, `plugins`, `effort`, `thinking`, `fallbackModel`)
e a seção "Diretório confiado" com o que a B-01 mediu sobre hooks e subagents.

### B-03 — Módulo `claude-config` 🔲

Módulo novo ([D-03](decisions.md#d-03--módulo-novo-ou-parte-de-session)) no catálogo de
[backend/03-modules](../../architecture/backend/03-modules.md#o-catálogo): padrões, servidores MCP,
aprovações de projeto, plugins, e a leitura da configuração de projeto. **Não** é dono de sessão viva
(é o `session`) nem de regra de permissão (é o `permission`).

Fronteiras: consulta `workspace` para resolver pasta; o `session` pergunta por uma porta declarada nele
(`SessionConfigurationSource`: padrões efetivos + servidores e plugins da sessão); revogar regra de
`mcp__<nome>` é porta para o `permission` ([D-12](decisions.md#d-12--regra-de-tool-mcp-quando-o-servidor-muda));
escreve em `audit`. Sem ciclo: o `claude-config` não importa o `session` — a lista de sessões vivas do
usuário numa pasta chega por uma porta que o `session` implementa. Todo contato com o SDK — a sonda, o
teste de conexão — fica em `adapter/outbound/claude/`, como manda
[backend/04](../../architecture/backend/04-claude-integration.md#onde-isso-mora). Cenário S-14.

### B-04 — Contrato HTTP 🔲

Documentado em [backend/03-modules](../../architecture/backend/03-modules.md) na seção do módulo, com
tabela de status por rota, no formato das rotas de `permission`. Todas Bearer, escopadas por quem
pergunta, pasta sempre resolvida pela allowlist antes de qualquer outra coisa:

| Rota | O quê |
|---|---|
| `GET /claude/account` · `GET /claude/installation` | conta do CLI e diagnóstico da instalação ([F1](F1-models-and-modes.md)) |
| `POST /claude/diagnostics/model-check` | teste de conexão com o modelo ([D-08](decisions.md#d-08--teste-de-conexão-com-o-modelo)) |
| `GET /claude/models?folder=` | modelos da instalação |
| `GET /claude/defaults?folder=` · `PUT /claude/defaults` · `PUT /claude/defaults/folder` · `DELETE /claude/defaults/folder?folder=` | padrões do usuário e sobreposição por pasta ([D-04](decisions.md#d-04--padrões-por-usuário-e-por-pasta)) |
| `GET /claude/mcp-servers?folder=` | store nosso + `.mcp.json` com aprovação + status vivo quando há sessão |
| `POST /claude/mcp-servers/preview` | descrição por extenso e regras que seriam revogadas — sem efeito |
| `POST` · `PUT /:id` · `PATCH /:id` (`enabled`) · `DELETE /:id` em `/claude/mcp-servers` | escrever o store |
| `POST /claude/mcp-servers/:id/test` | testar conexão |
| `PUT /claude/project-mcp-approvals` · `DELETE /claude/project-mcp-approvals?folder=&name=` | aprovar/rejeitar entrada do `.mcp.json` por digest |
| `GET /claude/plugins` · `POST /claude/plugins/preview` · `POST` · `PATCH /:id` · `DELETE /:id` | plugins locais |
| `GET /claude/skills?folder=` · `PUT /claude/skills/preferences` | skills da pasta com origem e estado; ligar/desligar origem e skill, por usuário ou por pasta |
| `GET /claude/project-config?folder=` | configuração de projeto ([F3](F3-project-config.md)) |

Resposta nunca carrega valor de segredo, token, caminho de credencial nem conteúdo de arquivo de
memória — só metadado. Os endpoints entram nos limites do
[plano 05](../05-hardening-operations/README.md) (ritmo por usuário) quando ele rodar; a sonda e o teste
têm, desde já, um em voo por chave.

### B-05 — Contrato WebSocket, nas três pontas 🔲

Mudança de contrato: schema em `packages/contracts/schema`, TS, **Dart regenerado** e o
[documento](../../architecture/shared/05-websocket-protocol.md#comandos-cliente--servidor) na mesma
entrega. Campos e eventos novos, sem subir `v`
([versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)):

- comando `session.toggleMcpServer { sessionId, name, enabled }` → `query.toggleMcpServer`;
- comando `session.reconnectMcpServer { sessionId, name }` → `query.reconnectMcpServer`;
- evento `session.mcpStatusChanged { servers: [{ name, status, source, error? }] }` — evento **de
  sessão**, com o `seq` dela (não precisa de stream próprio); `error` redigido;
- `session.started` ganha `effort?`, `outputStyle?` e `defaultsFrom?` (`client`/`folder`/`user`/
  `installation`) — de onde veio o que a sessão está usando.

O indicador que consome o evento vai para o painel do plano 08 ([D-14](decisions.md#d-14--quem-entrega-o-indicador-de-mcp-da-sessão)).
Cenários S-10, S-11.

### B-06 — Códigos de erro 🔲

No [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) e em
`error-catalogue.ts`, com `messageKey` en/pt-BR (`claudeConfig.error.*`): `MCP_SERVER_NOT_FOUND` 404,
`MCP_SERVER_NAME_TAKEN` 409, `MCP_SERVER_CONFIG_INVALID` 422 (`params.rule`), `MCP_APPROVAL_STALE`
409 (o `.mcp.json` mudou desde que foi mostrado), `MODEL_NOT_AVAILABLE` 422, `DEFAULT_MODE_NOT_ALLOWED`
422, `PLUGIN_NOT_FOUND` 404, `PLUGIN_PATH_INVALID` 422, `PLUGIN_MARKETPLACE_NOT_ALLOWED` 403
(marketplace fora do arquivo da allowlist), `PLUGIN_SOURCE_UNAVAILABLE` 502 (fonte do marketplace
inacessível). Reusados: `INVALID_INPUT`, `FORBIDDEN`,
`WORKSPACE_*`, `SESSION_NOT_FOUND`, `SESSION_LIMIT_REACHED`, `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`,
`SERVICE_UNAVAILABLE` (chave de segredo ausente, `claudeConfig.error.secretStoreUnavailable`),
`INTERNAL_ERROR`. `400` para o que não se entende (tipo errado), `422` para o que se entende e é
impossível (nome com `__`, URL `file:`). Cenário S-12.

### B-07 — Tabelas e kinds de trilha 🔲

Migration versionada nova (não chute número): `claude_defaults` (usuário, pasta opcional, modelo,
modo, esforço, thinking, output style, modelo reserva), `mcp_servers` (usuário, nome, escopo
`user`/`folder`, pasta, transporte, comando, args, URL, ligado), segredos cifrados à parte
([D-02](decisions.md#d-02--segredo-de-servidor-mcp)), `mcp_project_approvals` (usuário, pasta, nome,
digest, decisão), `claude_plugins` (usuário, caminho, digest do manifesto, ligado) e
`claude_skill_preferences` (usuário, pasta opcional, origens ligadas, skills desligadas).

Os kinds novos entram no CHECK de `audit_events` por migration nova, nunca editando a aplicada:
`claude.defaultsChanged`, `claude.mcpServerAdded`, `claude.mcpServerChanged`, `claude.mcpServerRemoved`,
`claude.mcpServerToggled`, `claude.mcpServerTested`, `claude.mcpProjectServerApproved`,
`claude.mcpProjectServerRejected`, `claude.pluginAdded`, `claude.pluginToggled`, `claude.pluginRemoved`,
`claude.skillSourceToggled`.
`details` com comando/URL/args (redigidos) e **nomes** de variáveis, nunca valores. Documentar em
[backend/05-persistence](../../architecture/backend/05-persistence.md#os-fatos-de-conta); a linha do
tempo do [plano 14](../14-audit-explained/README.md) mostra esses kinds quando existir. Cenário S-13.

### B-08 — Regras de máquina 🔲

Em `pnpm scan:security` (`scripts/lib/agent-sdk-rules.mjs`), junto das que já exigem
`settingSources: ['project']` e o `PreToolUse` — ver
[09-code-quality](../../architecture/shared/09-code-quality.md#segurança-estática), atualizado na
mesma entrega:

- `query(` sem `strictMcpConfig: true` literal reprova — e o `realQueryFactory` recusa as opções sem
  ele, como já recusa sem as outras duas (a máquina lê, o processo impede);
- `updateSettings(` em qualquer lugar reprova; `settings:` nas opções e `applyFlagSettings(` só dentro
  do montador de flag settings, que aceita uma allowlist de chave e recusa o resto; `managedSettings:`
  só dentro do mesmo montador, e só com chaves que **restringem** (`disableSkillShellExecution`);
- `permission_policy` e `tools:` em configuração de servidor MCP reprovam; plugin sem
  `skipMcpDiscovery: true` reprova;
- control request não público (`get_hooks_listing`, `list_permission_rules`, `get_settings`) reprova.

Cenários S-06…S-09, S-145.

### B-09 — Rota, i18n e o documento de UI 🔲

A tela é **uma** rota na navegação global do plano 06, fora das Configurações do app:
`/claude-settings?section=account|installation|models|mcp|plugins|skills|project&folder=<caminho>` — seção e pasta na
search, para o link reproduzir a tela ([D-09](decisions.md#d-09--a-seção-claude-das-configurações-do-app)).
Namespace i18n `claudeSettings.*` en/pt-BR. Acrescentar a
[web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) um padrão
"Configuração do Claude": seções com navegação lateral, o screen frame do 06, segundo passo para toda
ação que amplia o que roda na máquina, segredo só escrita. Cenário S-15.

---

## Cenários cobertos

S-01…S-15, S-145 (a regra; a leitura que ela protege é da F3).

---

## Critério de conclusão

```bash
pnpm verify
pnpm contracts:check
pnpm scan:security
```
