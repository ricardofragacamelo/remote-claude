# F3 — Configuração de projeto

Plano: [13 — Configuração do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-mcp-servers.md) — o `.mcp.json` e os plugins habilitados pelo projeto já têm
tratamento lá; aqui eles só aparecem. E do plano [07](../07-explorer-and-editor/README.md): criar e
editar arquivo é a escrita dele.
**Entrega:** a seção Projeto mostra, para a pasta escolhida, tudo o que o repositório injeta no Claude —
memória, slash commands, skills, subagents, output styles, hooks, permissões e plugins —, diz o que
de fato vale nas sessões deste produto, e cria ou edita os arquivos de `.claude/` pelo editor, a partir
de um modelo inicial. As skills do usuário e do sistema passam a carregar, sem ampliar
`settingSources`, e cada skill pode ser ligada ou desligada por origem, por usuário e por pasta.

---

## Por quê

Com `settingSources: ['project']` ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)),
o `.claude/` do repositório é **o** canal pelo qual um projeto muda o comportamento do Claude nas
nossas sessões — para o bem (o `CLAUDE.md`, os comandos do time) e para o mal (hook que roda comando,
subagent que pede modo próprio, plugin habilitado pelo repositório). Hoje isso é invisível na UI. Mostrar
é a primeira proteção, e é também o que o usuário pediu: ver e ajustar como o Claude trabalha naquela
pasta.

Escrever `.claude/` **não** ganha rota própria: é arquivo da pasta, e o plano 07 já é a fronteira de
escrita humana — allowlist, ETag, trilha `file.*` antes do disco
([D-18](decisions.md#d-18--por-onde-se-criam-comandos-skills-agents-e-estilos)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-31 — `GET /claude/project-config` 🔲

[D-16](decisions.md#d-16--como-ler-a-configuração-de-projeto): o que é **arquivo de formato
documentado** do Claude Code (`.claude/settings.json`, frontmatter de `.claude/commands/`,
`.claude/agents/`, `.claude/output-styles/`, `.mcp.json`) é lido por nós — dentro da allowlist,
contenção no realpath, teto de tamanho, parse tolerante que explica o que não entendeu; o que o CLI
**resolve** (comandos e skills efetivos, agents, estilos disponíveis) vem do catálogo da B-10; e o que
está **carregado** numa sessão viva vem dela (`getContextUsage({ detail: 'summary' })`, que não chama a
API de contagem de tokens). Control request sem método público em `Query` não é usado (B-08).

Não confundir com o transcript: ler `settings.json` é ler configuração que o usuário escreve e versiona,
com formato publicado; a proibição de parser próprio do plano 04 é sobre o JSONL interno do Claude.

Cache por pasta invalidado pelo mtime de `.claude/` e do `.mcp.json`; leitura concorrente com o Claude
escrevendo devolve o antes ou o depois (arquivos escritos por rename). Cenários S-141…S-147.

### B-32 — Memória: o que existe e o que vale 🔲

`CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, os `CLAUDE.md` de ancestrais até a raiz da
allowlist, e o `~/.claude/CLAUDE.md` do usuário: existe, tamanho, modificado — e **se é carregado** pelas
sessões deste produto, pela regra que a B-01 mediu (o escopo `user` não é; o `local` depende da medição).
Com sessão viva, a lista de carregados vem dela, e divergência com a regra é `warn`. Nunca o conteúdo na
resposta: "abrir no editor" leva à aba da pasta com o arquivo (plano 07); arquivo fora da pasta não vira
link. Sem `CLAUDE.md`, o estado vazio oferece o `/init` (plano 04, pelo painel) e o modelo inicial.
Cenários S-148…S-150.

### B-33 — Slash commands do projeto 🔲

A lista é a do `supportedCommands()` **sem** `builtin` (o SDK marca os do próprio Claude Code) e sem as skills (que têm a B-34), com o
arquivo de origem quando ele está na pasta — reusando o `menuOf` do plano 04 para esconder interno e
morto. "Novo slash command": nome validado, modelo inicial com frontmatter (`description`,
`argument-hint`, `allowed-tools` comentado com o aviso de que ele **não** dispensa a aprovação aqui),
gravado por `POST /files` do plano 07 em `.claude/commands/<nome>.md` e aberto no editor. O catálogo da
pasta é invalidado, e o comando aparece no menu do painel. Nome que já existe: o `409` do plano 07.
Cenários S-151…S-153.

### B-34 — Skills: lista, origem e preferências 🔲

O composer do plano 08 completa `/` com slash commands **e** skills; a configuração das skills mora
aqui. A lista da pasta vem de `reloadSkills()` no catálogo (sessão viva, ou a sonda da B-10 — a B-01
confirma que devolve só skills), cruzada com a origem: **Projeto** (`.claude/skills/<nome>/SKILL.md` da
pasta), **Usuário** e **Sistema** (as do plugin sintético da B-35, qualificadas `plugin:<nome>`). A tela
mostra o nome simples, o selo da origem, a descrição, o estado e o arquivo.

Preferências por usuário e por pasta, com a mesma sobreposição dos padrões
([D-04](decisions.md#d-04--padrões-por-usuário-e-por-pasta)): ligar/desligar uma **origem** inteira ou uma
skill. Viram a opção `skills` do `query()` — omitida quando nada está desligado (omitir é o padrão do
CLI, não "desligado"), lista explícita quando algo está. Desligada, a skill some do `/` do painel e a tool
`Skill` a recusa. A ajuda diz o que o próprio SDK diz: é **filtro de contexto, não sandbox** — o arquivo
continua legível por `Read`/`Bash`, e segredo não mora em skill. Ligar as origens Usuário ou Sistema amplia
o que entra na sessão e grava `claude.skillSourceToggled`; desligar skill não vai para a trilha (só
restringe).

Colisão de nome: a do projeto é a que `/nome` chama; a outra continua listada, com o selo, e alcançável
por `plugin:nome` — nenhuma some em silêncio. "Nova skill": nome validado, modelo inicial de
`SKILL.md` (frontmatter `name`, `description`, e o aviso sobre blocos `!` da
[D-21](decisions.md#d-21--shell-inline-de-skills-e-slash-commands)), gravado pelo `POST /files` do plano 07
em `.claude/skills/<nome>/SKILL.md`, aberto no editor; `reloadSkills()` na sessão viva a faz aparecer.
Cenários S-154…S-164.

### B-35 — O plugin sintético das skills de usuário e de sistema 🔲

A decisão do usuário ([D-20](decisions.md#d-20--skills-de-projeto-usuário-e-sistema)): carregar skills do
projeto, do usuário e do sistema, **sem** ampliar `settingSources` — o escopo `user` traria junto as
`allow` e os hooks de `~/.claude/settings.json`, que furam o `canUseTool` e a trilha
([plano 01 · D-11](../01-live-session/decisions.md#d-11--o-furo-que-invalidaria-o-produto), ADR-011).
O caminho é a opção `plugins` do SDK (`SdkPluginConfig`: `{ type: 'local', path, skipMcpDiscovery }`,
verificado no `sdk.d.ts`): o backend monta, **por usuário**, um diretório de plugin local nosso que
expõe **só `skills/`**:

- **fontes** — Usuário: `~/.claude/skills` do `CLAUDE_CONFIG_DIR` efetivo, incluindo `synced/` quando
  existir (a B-01 mede se as sincronizadas do claude.ai já entram sozinhas, para não carregá-las duas
  vezes); Sistema: o que a [D-22](decisions.md#d-22--de-onde-vêm-as-skills-de-sistema) definir (skills de
  plugins instalados no Claude Code, skills gerenciadas da instalação; as embutidas no CLI já carregam);
- **só skills** — manifesto nosso, nenhum diretório de hooks, agents, comandos ou MCP, e
  `skipMcpDiscovery: true`; skill cujo frontmatter declara hook **não** é carregada, e aparece com o motivo;
- **contenção** — cada entrada é um link para uma pasta de skill **dentro do home do usuário**;
  symlink que escapa é recusado, pela mesma checagem de realpath do `ResolveWorkspaceUseCase`;
- **construção atômica** — em diretório temporário e `rename`, reconstruída quando o digest das fontes
  muda, reusada quando não muda, cacheada por versão do CLI; dois `session.start` juntos constroem uma vez;
- **shell inline** — se a B-01 mostrar que os blocos `!` de skill e slash command rodam sem
  `canUseTool`/`PreToolUse`, a sessão passa `managedSettings: { disableSkillShellExecution: true }` pelo
  montador da B-08 ([D-21](decisions.md#d-21--shell-inline-de-skills-e-slash-commands)), e a ajuda diz
  que esses blocos viram um marcador.

O plugin de um usuário nunca entra na sessão de outro. A regressão que importa é a da D-11: com uma
`allow` em `~/.claude/settings.json`, o `canUseTool` continua sendo chamado. Cenários S-165…S-174.

### B-36 — Subagents do projeto 🔲

A lista vem de `supportedAgents()` (nome, descrição, modelo), com o arquivo de origem. Frontmatter que
muda o que o subagent pode fazer — `permissionMode`, `tools` amplos, `mcpServers` — aparece
**sinalizado**, com a explicação e com o que a B-01 mediu: `mcpServers` de frontmatter não sobe
(`strictMcpConfig`); `permissionMode` de subagent é o cenário S-198. "Novo subagent" pelo modelo inicial,
como na B-33, em `.claude/agents/<nome>.md`. Cenários S-175, S-176.

### B-37 — Output styles 🔲

O atual e os disponíveis vêm de `initializationResult()` (`output_style`, `available_output_styles`),
os do projeto com o arquivo de origem. "Novo output style" pelo modelo inicial em
`.claude/output-styles/<nome>.md`; escolher um como padrão grava pelo store da F1 (B-14), para o usuário
ou para a pasta — aplicado pela camada de flag, com allowlist ([D-06](decisions.md#d-06--o-que-entra-como-padrão)).
Cenários S-177, S-178.

### B-38 — Hooks, permissões e plugins do projeto: só leitura, explicados 🔲

[D-17](decisions.md#d-17--permissões-hooks-e-plugins-de-projeto). Do `.claude/settings.json`:

- **hooks** — evento, matcher e comando por extenso, com o que a B-01 mediu: se hooks de projeto rodam
  nas nossas sessões, a tela diz sem eufemismo que aquele comando roda na máquina em todo `<evento>`,
  sem ninguém aprovar, e isso fica como risco aberto do plano ([R-03](README.md#riscos-e-decisões-em-aberto));
- **permissões** — `deny` descrito como aplicado; `allow` descrito como **sem efeito aqui**, porque o
  backend limpa a marca de confiança antes de abrir sessão
  ([backend/04](../../architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido)),
  com a nota de que no Claude Code do terminal ele roda sem perguntar;
- **`enabledPlugins`** e **`enableAllProjectMcpServers`** — listados com aviso; o primeiro depende de o
  plugin estar instalado na máquina, o segundo não conta aqui (B-24).

A tela não oferece editor estruturado para nada disso. O arquivo continua editável pelo editor do plano
07, como qualquer arquivo da pasta — escrita humana, auditada lá —, e a ajuda diz isso. A alternativa de
um editor estruturado atrás de segundo passo está registrada na D-17. Cenários S-179…S-181.

### B-39 — Tela: projeto e skills 🔲

Seção "Projeto" com o seletor de pasta (abas abertas e recentes do 06; pasta na URL), um cartão por
assunto — Memória, Slash commands e skills, Subagents, Output styles, Hooks, Permissões, Plugins e
`.mcp.json` (este levando à seção MCP) —, cada item com a origem, o estado "carregado/não carregado aqui"
e as ações (abrir no editor, novo a partir do modelo, definir como padrão). Busca nas listas longas de
comandos e agents. Os quatro estados.

Seção "Skills", própria: lista densa (nome, selo Projeto/Usuário/Sistema, descrição, estado), busca,
filtro por origem e estado, ligar/desligar a origem inteira ou cada skill — para o usuário ou para a
pasta, com a origem da preferência à vista —, seleção com ligar/desligar em lote, "nova skill" pelo
modelo, abrir no editor as do projeto, e as não carregadas com o motivo (declara hook, link que sai do
home). Ligar Usuário ou Sistema mostra antes a lista do que vai entrar. Cenário S-182.

### B-40 — Usabilidade e ajuda: projeto 🔲

Ajuda en/pt-BR: o que é o `CLAUDE.md` e onde o Claude o procura, o que é um slash command e uma skill,
o que é uma skill e de onde cada origem vem (Projeto, Usuário, Sistema), por que desligar uma skill é
filtro e não cerca, o que acontece com os blocos `!`, o que é um subagent e por que um frontmatter pode
mudar o que ele pode fazer, o que é um output style, o
que é um hook — **código que roda na máquina** —, por que as permissões do projeto não valem aqui e
valem no terminal, e o que este produto não carrega (escopo `user`). Estado vazio que ensina (criar o
`CLAUDE.md` pelo `/init`, o primeiro comando pelo modelo); tooltip em todo ícone; "Claude: abrir
CLAUDE.md", "Claude: novo slash command", "Claude: novo subagent" na palette; teclado; axe.
Cenários S-183, S-184.

---

## Cenários cobertos

S-141…S-184.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
