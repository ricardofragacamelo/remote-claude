# Plano 11 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> Várias decisões dependem da medição da [B-01](F0-contract.md) — o spike é a primeira task do plano
> por isso. O que já se sabe por leitura do `sdk.d.ts` e do `sdk.mjs` do SDK `0.3.277` está na tabela
> do início da [F0](F0-contract.md#por-quê); aqui ficam as escolhas.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Onde mora um servidor MCP configurado por esta tela | se `strictMcpConfig: true` de fato isola a sessão de `.mcp.json`, plugins, frontmatter de agent e conectores claude.ai — medir (B-01 · 1) | B-02, B-21 | — | 🔲 |
| D-02 | Como guardar e como entregar ao CLI o segredo de um servidor MCP | se `setMcpServers()` logo após o início deixa as tools prontas antes do primeiro turno, e se `${VAR}` é expandido — medir (B-01 · 3) | B-19, B-21 | — | 🔲 |
| D-03 | Módulo novo `claude-config` ou parte do `session` | — (é de linguagem, não de medição) | B-03 | — | 🔲 |
| D-19 | Qual servidor MCP de fixture o spike, o e2e e o `smoke-live` usam | se o `@modelcontextprotocol/sdk` que já está na árvore (1.30.0, dependência do Agent SDK) basta para um servidor stdio mínimo | B-01, B-42, B-46 | — | 🔲 |

### D-01 — onde mora o servidor MCP

A [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)
tira o escopo `user` das sessões — logo, `claude mcp add` e os MCPs de `~/.claude.json` não chegam a
elas. As opções:

- **(a) store nosso, por usuário, passado em `options.mcpServers`, com `strictMcpConfig: true`.** O
  conjunto de cada sessão é composto pelo backend; nada sobe que não esteja no store ou numa
  aprovação nossa do `.mcp.json`. Ganha também o que o `strictMcpConfig` exclui: `.mcp.json` não
  aprovado, servidores de frontmatter de subagent e de plugin;
- **(b) escrever no `.mcp.json` do projeto.** Vira arquivo versionado — o servidor de um usuário vai
  para o repositório de todos, e a aprovação passa a ser do CLI, por pasta;
- **(c) configuração de usuário do CLI.** Contradiz a ADR-011: exigiria carregar o escopo `user`,
  que traz as `allow` pessoais que furam o `canUseTool`.

O gap é técnico: `strictMcpConfig` promete isolar, e a promessa vira fato só medida — inclusive para os
conectores claude.ai, que a documentação da opção não cita.

**Recomendação:** (a). É a única que deixa o backend como autoridade sobre o que roda na máquina, e
reusa o que o produto já faz com permissão: a regra nossa é a única autoridade
([plano 03 · D-09](../03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade)). O
`.mcp.json` continua valendo — por aprovação nossa ([D-11](#d-11--aprovação-do-mcpjson)). Se a B-01
mostrar que algo escapa do `strictMcpConfig`, a mitigação entra na ADR antes da F2 começar.

### D-02 — segredo de servidor MCP

Env e headers de servidor MCP carregam token. Três perguntas: onde guardar, o que a API devolve, e como
chegar ao CLI.

Guardar — (a) **cifrado em repouso** no Postgres, chave em arquivo; (b) arquivo local de configuração,
como a allowlist — mas aí a tela não poderia acrescentar servidor; (c) **referência** a variável de
ambiente do backend (`${env:X}`) — o segredo nunca entra no banco, mas acrescentar um token exige
reiniciar o backend, e o ambiente do backend deixa de ser só dele.

Devolver — nunca inteiro. Só `{ name, set: true }`.

Chegar ao CLI — **não pelo `mcpServers` do `query()`**: lido no `sdk.mjs`, ele vira
`--mcp-config <JSON>` no argv, e argv de processo é legível por qualquer usuário da máquina em
`/proc/<pid>/cmdline`. Sobram `setMcpServers()` depois do início (vai pelo stdin do canal de controle)
ou pôr o valor numa variável só do ambiente daquele subprocesso e referenciá-la por `${VAR}` — este
último vaza o segredo para todo filho do CLI (o `Bash`, os outros servidores).

**Recomendação:** guardar cifrado (AES-256-GCM) com a chave num arquivo de modo `600` apontado pela
configuração — a disciplina da credencial do push
([02 · D-20](../02-mobile-approval/decisions.md#d-20--onde-vive-o-segredo-e-o-que-ele-não-pode-derrubar)):
sem o arquivo, servidor com segredo não é gravado e o resto funciona. API só escrita. Entrega por
`setMcpServers()` depois do início, se a B-01 confirmar que as tools ficam prontas antes do primeiro
turno; senão, o segredo vai na composição inicial pelo caminho que não for argv e a ADR registra o
custo.

### D-03 — módulo novo ou parte de `session`

Padrões, servidores MCP, aprovações, plugins e skills têm vocabulário e regras próprios (digest de
aprovação, escopo, segredo só escrita), um ciclo de vida que sobrevive à sessão — e a sessão só
**consome** o resultado. É o mesmo argumento que separou `permission` de `session`
([backend/03](../../architecture/backend/03-modules.md#por-que-permission-é-módulo-separado-de-session)).

**Recomendação:** módulo novo `claude-config`, com a sessão perguntando por uma porta declarada nela
(`SessionConfigurationSource`). O contato com o SDK continua só em `adapter/outbound/claude/`.

### D-19 — servidor MCP de fixture

Um pacote público (`npx @modelcontextprotocol/server-everything`) baixa código da rede a cada
execução e muda sem aviso — o oposto do que um teste precisa.

**Recomendação:** um servidor stdio **nosso**, mínimo, em `e2e/fixtures/`, sobre o
`@modelcontextprotocol/sdk` declarado como dependência de desenvolvimento explícita (não herdada da
árvore): uma tool `echo`, uma tool marcada `readOnly`, e uma variável de ambiente que ele devolve
mascarada — é como o e2e prova que o segredo chegou sem que ele apareça. Sem rede.

---

## F1 — Conta, modelos, padrões e diagnóstico

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Padrões por usuário, por pasta, ou os dois — e quem vence | — | B-14, B-15, B-34 | — | 🔲 |
| D-05 | Como responder modelos, conta, agents e estilos sem sessão viva | custo real de uma sonda `initializationResult()` sem prompt — medir (B-01 · 4) | B-10 | — | 🔲 |
| D-06 | Quais itens da configuração do Claude entram como padrão | se `fallbackModel` e `effort` se comportam como documentados na instalação medida | B-14, B-15, B-37 | — | 🔲 |
| D-07 | O que da conta do CLI aparece, e para quem | — | B-11 | — | 🔲 |
| D-08 | O teste de conexão com o modelo: existe, onde mora, quanto custa | — | B-11, B-12 | — | 🔲 |
| D-09 | A seção "Claude" das Configurações do app (plano 06 · D-13) e esta tela | o que os planos 06 e 08 decidirem ao executar | B-16 | — | 🔲 |

### D-04 — padrões por usuário e por pasta

(a) só por usuário — simples, mas o repositório que pede outro modelo obriga a trocar a cada sessão;
(b) só por pasta — cada pasta nova começa do zero; (c) **os dois**, com sobreposição.

**Recomendação:** (c): o padrão do usuário, sobreposto pelo da pasta mais próxima (a própria ou o
ancestral mais próximo com sobreposição — mesma forma de "a pasta e as subpastas" que a allowlist
usa), sobreposto pelo que o cliente mandou no `session.start`. O `GET` diz a origem de cada campo, para
a tela explicar "vem do padrão desta pasta". Vale igual para as preferências de skills (B-34).

### D-05 — catálogo sem sessão viva

Todos os métodos de que a tela precisa são de uma `query()` viva. (a) exigir sessão aberta — a tela
ficaria vazia justamente para quem está configurando antes de começar; (b) **sonda efêmera** — uma
`query()` que nunca cede prompt; (c) lista fixa — proibida pelo mesmo argumento que proibiu a de
comandos.

**Recomendação:** sessão viva do chamador na pasta, quando houver; senão sonda efêmera que faz **uma**
pergunta, `initializationResult()` (traz comandos, agents, modelos, conta e estilos juntos), com
`strictMcpConfig: true` e `mcpServers: {}`, e fecha. Cache pelo padrão do `CommandCatalog` do plano 04 —
versão do CLI, `CLAUDE_CONFIG_DIR` e, para o que depende do `.claude/`, pasta —, com TTL curto só para a
conta (novo login não muda a versão). A sonda ocupa lugar na capacidade enquanto vive: ~222 MB medidos
por subprocesso não se escondem.

### D-06 — o que entra como padrão

O SDK expõe, por `Options`: `model`, `permissionMode`, `effort`, `thinking`, `fallbackModel`; e, só pela
camada de settings, `outputStyle`. O VS Code oferece modelo, modo, thinking e estilo.

**Recomendação:** modelo, permission mode (nunca `bypassPermissions`), esforço (quando o modelo
suporta, com os níveis que ele declara), thinking ligado/desligado, output style e modelo reserva. O
output style entra pela camada de flag, pelo montador com allowlist da B-08 — é a única via, e a razão
de a allowlist existir. Fast mode fica de fora enquanto não houver opção de `Options` para ele.

### D-07 — o que da conta aparece e para quem

O produto é multiusuário, e o CLI da máquina tem **um** login: todas as sessões de todos os usuários
gastam na mesma conta. `accountInfo()` traz e-mail, organização, plano, provedor e o nome da fonte da
credencial.

**Recomendação:** mostrar provedor, plano, organização e e-mail a todo usuário autenticado que tenha
alguma raiz na allowlist — é a conta que paga as sessões dele, e esconder não protege nada que ele não
alcance perguntando ao próprio Claude. Nunca token, nunca caminho de credencial; de `tokenSource` e
`apiKeySource`, só o nome.

### D-08 — teste de conexão com o modelo

É o item de diagnóstico que o usuário pediu ("teste de conexão com o modelo") e o único que **gasta
token**. O [plano 16](../16-logs-and-diagnostics/README.md) também quer um teste do CLI na tela de saúde.

**Recomendação:** existe, por clique explícito, com o custo dito antes; um turno, prompt mínimo fixo,
sem tools, `maxTurns: 1`, teto de custo de configuração; o resultado do diagnóstico (`ok`,
`notLoggedIn`, `rateLimited`, `failed`) é dado da resposta, e `502`/`504` ficam para o CLI que morreu
ou não respondeu. **Este plano é dono** da rota; a tela de saúde do 16 e a de diagnóstico do 06 a
reusam — dois testes do mesmo CLI seriam duas respostas para a mesma pergunta.

### D-09 — a seção Claude das Configurações do app

O [plano 06](../06-workbench/README.md) previu, nas Configurações do app, uma seção "Claude" com modelo e
permission mode padrão. O pedido do usuário é o oposto de misturar: "uma tela para cada coisa". E o
[plano 08](../08-claude-panel/README.md) terá um seletor de modelo no composer, com a sua fonte.

**Recomendação:** esta tela é a dona de padrões e configuração do Claude; a seção "Claude" das
Configurações do app vira um atalho para cá; o seletor do 08 lê o mesmo `GET /claude/models`. Os planos
06 e 08 são avisados por nota ao executar, não editados agora.

---

## F2 — Servidores MCP e plugins

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | Uma mudança de servidor MCP afeta as sessões vivas ou só as novas | — | B-23 | — | 🔲 |
| D-11 | Quem aprova um servidor do `.mcp.json`, e até quando a aprovação vale | de qual diretório o CLI lê o `.mcp.json` (só o `cwd`, ou sobe até a raiz do repositório) — medir para mostrar o mesmo | B-24 | — | 🔲 |
| D-12 | O que acontece com as regras de permissão de `mcp__<nome>` quando o servidor muda ou sai | — | B-26 | — | 🔲 |
| D-13 | Como o `riskHint` trata tool MCP e as annotations do servidor | o que o CLI auto-aprova de tool MCP sem chamar o `canUseTool` — medir (B-01 · 2) | B-26 | — | 🔲 |
| D-14 | Quem entrega o indicador de MCP dentro da sessão: o plano 08 ou este | — | B-22 | — | 🔲 |
| D-15 | Plugins do Claude: entram, e como | se `skipMcpDiscovery: true` segura os servidores do plugin, e o que um plugin local traz na instalação medida | B-27, B-29 | — | 🔲 |

### D-10 — mudança de MCP e sessões vivas

`setMcpServers()` e `toggleMcpServer()` mexem na sessão viva. (a) só sessões novas — um servidor
descoberto malicioso continuaria rodando até a sessão fechar; (b) tudo vale já — adicionar um
servidor no meio de uma conversa muda as tools debaixo do turno; (c) **apertar vale já, afrouxar na
próxima sessão**.

**Recomendação:** (c), a mesma assimetria da revogação de regra do plano 03. Remover ou desligar
desliga em toda sessão viva do usuário que tem o servidor; adicionar ou ligar vale na próxima, e a tela
diz. Ligar e reconectar **dentro** da sessão continuam pelos comandos da sessão (B-22).

### D-11 — aprovação do `.mcp.json`

Com `strictMcpConfig`, o CLI ignora o `.mcp.json`; quem decide o que dele entra é o backend. O CLI tem
a sua aprovação (`enabledMcpjsonServers`, `enableAllProjectMcpServers`) — e a segunda pode vir do
**próprio** `.claude/settings.json` do repositório, que se auto-aprovaria.

**Recomendação:** aprovação **nossa**, por usuário, por (pasta, nome, digest da entrada normalizada).
Mudou a entrada — um `git pull` que troca o comando —, volta a "alterado" e não entra até nova
aprovação; a tela mostra a diferença. O `PUT` carrega o digest que a tela mostrou, e arquivo que
mudou no meio responde `MCP_APPROVAL_STALE`. A aprovação do CLI não conta para nada. `${VAR}` é
mostrado literal e expande no ambiente sem os segredos do backend (B-20).

### D-12 — regra de tool MCP quando o servidor muda

Uma regra `always` para `mcp__github__create_issue` foi concedida a um programa. Se o servidor
`github` passa a rodar outro comando — ou é removido e outro nasce com o mesmo nome —, a regra passaria
a autorizar um programa que ninguém avaliou.

(a) nada — a regra fala do nome; (b) avisar; (c) **revogar** as `allow` de `mcp__<nome>` do usuário
quando muda o que roda (comando, args, URL, transporte) ou quando o servidor sai.

**Recomendação:** (c), na mesma transação da alteração e pela rotina de revogação do `permission`
(auditada, idempotente), com a prévia listando as regras que caem. `deny` fica — restringir nunca
autoriza outro programa. Trocar só o nome de uma variável de ambiente, ou ligar/desligar, não revoga.

### D-13 — risco de tool MCP e annotations

`readOnly`, `destructive` e `openWorld` são declarados **pelo servidor** — texto de terceiro. O
`riskHint` do produto falha fechado
([backend/03 · permission](../../architecture/backend/03-modules.md#permission)).

**Recomendação:** annotation só **sobe** o risco (`destructive: true`); `readOnly: true` não baixa;
sem annotation, destrutiva. Se a B-01 mostrar que o CLI auto-aprova alguma tool MCP sem o
`canUseTool`, o que ele auto-aprova vira cenário fixo e aviso na ajuda — a trilha pelo `PreToolUse`
continua cobrindo.

### D-14 — quem entrega o indicador de MCP da sessão

O briefing põe o indicador de status dos MCPs da sessão no [plano 08](../08-claude-panel/README.md), mas o
contrato (comandos e evento) nasce aqui, e o 08 executa antes deste plano.

**Recomendação:** este plano entrega contrato **e** indicador (B-22), no painel que o 08 já construiu;
o 08 é avisado por nota ao executar. Alternativa: o 08 reservar o espaço na barra do composer, que
este plano preenche.

### D-15 — plugins do Claude

O SDK aceita só plugin **local** (`plugins: [{ type: 'local', path, skipMcpDiscovery? }]`). Plugin traz
hooks — código que roda em todo evento —, comandos, agents, skills e servidores MCP. Instalar de
marketplace é `claude plugin install`, que baixa código da rede para o escopo `user`, que a ADR-011
tira das sessões.

**Recomendação:** entram plugins locais, por usuário, de diretório dentro da allowlist, escolhido pelo
diálogo do plano 06; prévia que lista por extenso o que ele traz; segundo passo; trilha; digest do
manifesto (mudou, volta a pendente); sempre `skipMcpDiscovery: true`, com os servidores do plugin
entrando como sugestão no fluxo de aprovação da F2. Marketplace fica fora: é código baixado da rede
para o escopo que a ADR-011 exclui; se vier, é plano próprio, com a mesma construção.

---

## F3 — Configuração de projeto

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-16 | Como ler a configuração de projeto | — | B-31 | — | 🔲 |
| D-17 | Permissões, hooks e plugins de projeto: só leitura ou editáveis nesta tela | se hooks de projeto rodam nas nossas sessões com a confiança limpa — medir (B-01 · 5) | B-38 | — | 🔲 |
| D-18 | Por onde se criam slash commands, skills, subagents e output styles | — | B-33, B-34, B-36, B-37 | — | 🔲 |
| D-20 | Skills do escopo `user` (e do sistema) nas sessões, dado que a ADR-011 tira esse escopo | — | B-02, B-35 | 2026-09-26 · **decidido pelo usuário: carregar skills do projeto, do usuário e do sistema** — sem ampliar `settingSources`; usuário e sistema entram por um plugin local sintético, por usuário, que expõe só `skills/` | ✅ |
| D-21 | O shell inline (`!`) de skills e slash commands passa pela aprovação e pela trilha? Se não, como desligar | se o bloco `!` roda sem `canUseTool`/`PreToolUse`, e se `disableSkillShellExecution` distingue origem — medir (B-01 · 7) | B-35 | — | 🔲 |
| D-22 | De onde vêm as skills de sistema | onde o CLI guarda os plugins instalados e as skills gerenciadas, e se esse formato é estável | B-35 | — | 🔲 |

### D-16 — como ler a configuração de projeto

Três fontes possíveis: (a) arquivos de formato **documentado** do Claude Code (`settings.json`,
frontmatter de comandos, agents, estilos e skills, `.mcp.json`); (b) o que o CLI **resolve**
(`supportedCommands`, `supportedAgents`, `reloadSkills`, `initializationResult`, e o
`getContextUsage` de uma sessão viva, que diz o que foi **carregado**); (c) control requests sem método
público (`get_hooks_listing`, `list_permission_rules`, `get_settings`), que dariam hooks e regras já
resolvidos.

**Recomendação:** (a) + (b), nunca (c) — superfície não publicada muda sem aviso, e uma regra de
máquina (B-08) a proíbe. Ler `settings.json` não fere a regra de "nenhum parser próprio" do plano 04:
aquela é sobre o JSONL interno do transcript; este é configuração que o usuário escreve e versiona, de
formato publicado. O que se lê de arquivo é mostrado como "declarado"; o que a sessão carregou, como
"em uso".

### D-17 — permissões, hooks e plugins de projeto

Editar permissões de projeto pela UI: a `allow` de projeto furaria o `canUseTool` em diretório
confiado ([plano 01 · D-11](../01-live-session/decisions.md#d-11--o-furo-que-invalidaria-o-produto)) — o
backend limpa a marca de confiança, então aqui ela não vale, mas vale no Claude Code do terminal do
mesmo usuário. Hook é **código que roda na máquina** em todo evento. `enabledPlugins` puxa plugin
instalado.

(a) **só leitura com explicação**; (b) editor estruturado atrás de segundo passo (dizendo por extenso o
que a mudança faz, inclusive no terminal), step-up de autenticação e trilha `file.*`, com desfazer pelo
histórico local do plano 07.

Em qualquer das duas, o arquivo continua editável pelo editor do plano 07, como qualquer arquivo da
pasta — escrita humana auditada lá. A decisão é sobre esta tela oferecer um editor **estruturado**, que
torna a mudança fácil.

**Recomendação:** (a). A alternativa (b) fica registrada: é o caminho se o usuário pedir, e o que ela
exige já está listado. Se a B-01 mostrar que hooks de projeto rodam nas nossas sessões, a tela diz isso
sem eufemismo e o [R-03](README.md#riscos-e-decisões-em-aberto) fica aberto — desligá-los é uma decisão
de produto maior (o time conta com eles), que não se toma dentro deste plano.

### D-18 — por onde se criam comandos, skills, agents e estilos

(a) rotas próprias de escrita neste módulo; (b) **a escrita do plano 07** (`POST /files`, `PUT` com
`If-Match`), que já é a fronteira de escrita humana — allowlist, ETag, trilha `file.*` antes do disco.

**Recomendação:** (b). Nenhuma rota de escrita nova aqui. O modelo inicial mora no web, é conteúdo de
arquivo para o Claude (em inglês, como o do próprio CLI — não é texto de UI, então não passa pelo
i18n), com o frontmatter de cada tipo; o nome é validado antes de gravar, e o que já existe é o `409`
do 08. O catálogo da pasta é invalidado pelo mtime de `.claude/`.

### D-20 — skills de projeto, usuário e sistema

**Decidido pelo usuário em 2026-09-26:** "pode carregar skills do projeto, usuário e sistema".

A pergunta nasceu da ADR-011: com `settingSources: ['project']`, as skills de `~/.claude/skills` não
carregam nas sessões do produto. As opções consideradas:

- (a) aceitar — as sessões ficam sem as skills pessoais que o usuário tem no terminal e no VS Code;
- (b) ampliar para `['user', 'project']` — **rejeitada**: o escopo `user` traz junto as `allow` e os
  hooks de `~/.claude/settings.json`, que furam o `canUseTool` e a trilha (medido, plano 01 · D-11), e o
  [AGENTS.md](../../../AGENTS.md) reprova `query()` sem `settingSources: ['project']`;
- (c) **plugin local sintético** — o backend monta, por usuário, um diretório de plugin que expõe **só**
  skills, apontando para as fontes; entra pela opção `plugins` do SDK (verificada: `SdkPluginConfig`,
  `{ type: 'local', path, skipMcpDiscovery }`).

**A escolha é (c)**, e ela define:

- a ADR-011 **não muda na regra**: ganha uma emenda dizendo como as skills de usuário e de sistema
  entram sem ampliar `settingSources` (B-02);
- **Projeto** (`.claude/skills`) já carrega; **Usuário** (`~/.claude/skills`, com `synced/` quando
  existir) e **Sistema** ([D-22](#d-22--de-onde-vêm-as-skills-de-sistema)) entram pelo plugin
  sintético, e aparecem qualificadas `plugin:<nome>` — a UI mostra o nome simples e o selo da origem;
- o plugin sintético expõe só `skills/`: nenhum hook, agent, comando ou MCP, `skipMcpDiscovery: true`,
  e skill que declara hook no frontmatter não é carregada; caminhos só dentro do home do usuário, link
  que escapa recusado; construído atomicamente, cacheado por versão do CLI e digest das fontes (B-35);
- ligar e desligar por origem e por skill vira a opção `skills` do `query()` (B-34);
- **o que a decisão não cobre:** comandos e agents do escopo `user` (`~/.claude/commands`,
  `~/.claude/agents`) — a mesma construção serviria, e é o caminho se forem pedidos.

### D-21 — shell inline de skills e slash commands

Skills e slash commands podem ter blocos `!` que rodam comando de shell **na expansão** — antes, ou
fora, da chamada de tool que o `canUseTool` e o `PreToolUse` enxergam. Se for assim, ligar as skills
do usuário e do sistema (e as do projeto, que já carregam) abre um caminho de execução sem aprovação e
sem trilha — exatamente o que o produto existe para impedir.

O SDK oferece `disableSkillShellExecution` ("Disable inline shell execution in skills and custom slash
commands from user, project, or plugin sources. Commands are replaced with a placeholder"), e
`Options.managedSettings` aceita chaves restritivas na camada de política.

**Recomendação:** medir na B-01. Se o bloco `!` passar pelo `canUseTool` e pelo `PreToolUse`, nada a
fazer além de dizer na ajuda. Se **não** passar, a sessão leva `managedSettings: {
disableSkillShellExecution: true }` pelo montador da B-08 — para todas as origens, inclusive a do
projeto, porque o setting não distingue origem (a medição confirma) e o repositório clonado é
justamente a origem mais arriscada; a ajuda e o modelo inicial de skill dizem que esses blocos viram um
marcador. Isto bloqueia a B-35: as origens Usuário e Sistema não ligam antes de a resposta existir.

### D-22 — de onde vêm as skills de sistema

"Sistema" é: as skills **embutidas** no CLI (já carregam, sem nada a fazer — a B-01 confirma), as de
**plugins instalados** no Claude Code da máquina, e as **gerenciadas** pela política da instalação.
As duas últimas moram em diretórios do CLI cujo layout não é contrato publicado.

**Recomendação:** localizar pelo `CLAUDE_CONFIG_DIR` efetivo o diretório de plugins instalados e, de
cada plugin, só o subdiretório `skills/` — nunca hooks, agents, comandos nem `.mcp.json` dele; skills
gerenciadas, do diretório de política quando existir. Leitura tolerante: layout desconhecido é origem
vazia com `warn`, não falha. O `smoke-live` (B-46) é quem avisa quando uma versão do CLI muda o layout.

---

## F4 — E2E e smoke-live

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto — a fixture de MCP que o e2e usa é a D-19, na F0, porque o spike precisa dela primeiro | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 11`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
