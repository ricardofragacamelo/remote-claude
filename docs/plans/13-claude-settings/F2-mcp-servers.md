# F2 — Servidores MCP e plugins

Plano: [13 — Configuração do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-models-and-modes.md) — o catálogo e a sonda efêmera, que o teste de servidor
reusa — e do [plano 26 — Paridade da conversa no app](../26-mobile-conversation-parity/README.md) concluído
([D-31](decisions.md#decididas-durante-a-execução-b-01-2026-10-09)): a tool MCP sem título e o resultado com
imagem, que esta fase põe na conversa, chegam ao app com o rótulo `servidor · tool` e a mídia, não com o nome cru.
**Entrega:** servidores MCP e plugins — locais e de marketplace — configurados pela tela, com segundo passo, trilha e
segredo que nunca volta; o `.mcp.json` do projeto aprovado por nós, por conteúdo; status vivo e
ligar/desligar/reconectar dentro da sessão; e a prova de que toda tool MCP passa pela aprovação e
pela trilha como qualquer outra.

---

## Por quê

Servidor MCP é **processo arbitrário ou endpoint de rede**, rodando com as credenciais do usuário,
subindo quando a sessão abre — antes de qualquer pedido de permissão. Acrescentar um é autorização
antecipada do mesmo peso que uma regra `always` do plano 03, e por isso tem o mesmo tratamento:
segundo passo com o alcance por extenso
([plano 03 · D-14](../03-rules-and-audit/decisions.md#d-14--escopo-persistido-sempre-pede-o-segundo-passo)),
trilha antes do efeito, e o que aperta vale já.

Plugin é o mesmo problema com mais superfície — traz hooks, comandos, agents e servidores MCP. Mora
nesta fase porque o tratamento é o mesmo, e porque, com `skipMcpDiscovery: true`, o servidor MCP de um
plugin cai no fluxo de aprovação desta fase em vez de subir sozinho.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-18 — Domínio do servidor MCP 🔲

Entidade `McpServer` e regra pura, sem I/O, no `domain/claude-config/`:

- **nome** `^[A-Za-z0-9_-]{1,64}$` e **sem `__`** — a tool chega como `mcp__<servidor>__<tool>`, e um
  nome com `__` torna ambíguo o que é servidor e o que é tool, inclusive para o casamento de regra;
- **transporte** stdio (comando, args, env), http ou sse (URL, headers), campos de um nunca no outro;
  URL só `http:`/`https:`;
- **env** com nome de variável válido e sem sobrepor variável que muda como o processo carrega ou que é
  nossa (`LD_PRELOAD`, `LD_LIBRARY_PATH`, `NODE_OPTIONS`, `DYLD_*`, `CLAUDE_CONFIG_DIR`,
  `REMOTE_CLAUDE_*`);
- **tetos** de configuração para args, env e headers (quantidade e tamanho);
- nenhum campo para `tools[].permission_policy` nem `alwaysLoad` — o primeiro auto-aprovaria tool sem
  o `canUseTool` (B-08).

A **descrição por extenso** — "roda `npx -y pacote --flag` na sua máquina, com as suas credenciais,
sempre que uma sessão abrir em `<pasta>`, com as variáveis `GITHUB_TOKEN`" — é calculada aqui, uma vez,
como o `riskHint` do plano 03: a prévia e a gravação mostram o mesmo texto, e as pontas não divergem.
Cenários S-63…S-68.

### B-19 — Store e segredos 🔲

Tabelas da B-07, repositório, casos de uso e rotas da B-04. Nome único por usuário e escopo
(`MCP_SERVER_NAME_TAKEN`); servidor de outra pessoa é `FORBIDDEN`; id inexistente `MCP_SERVER_NOT_FOUND`.

Segredo — valores de env e headers ([D-02](decisions.md#d-02--segredo-de-servidor-mcp)): cifrado em
repouso com chave lida de **arquivo**, a mesma disciplina da credencial do push
([02 · D-20](../02-mobile-approval/decisions.md#d-20--onde-vive-o-segredo-e-o-que-ele-não-pode-derrubar));
sem o arquivo, servidor **com** segredo não é gravado (`SERVICE_UNAVAILABLE`), o resto funciona. A API é
só escrita: o `GET` devolve `{ name, set: true }`; no `PUT`, chave omitida fica, `null` remove, texto
substitui. `redact.ts` ganha os campos; argumento com forma de segredo (`--token=…`, `Bearer …`) é
redigido no log e na trilha, e a tela avisa para usar env.

Toda escrita grava o kind `claude.mcpServer*` **antes** do efeito, com o comando/URL por extenso e só
os nomes das variáveis; trilha indisponível não grava nada — a regra do
[audit](../../architecture/backend/03-modules.md#audit) para fato de conta. Integração com Postgres real
e varredura do log da suíte atrás de qualquer valor de segredo usado no teste. Cenários S-69…S-80.

### B-20 — O subprocesso sem os segredos do backend 🔲

Hoje o subprocesso do CLI recebe o ambiente **inteiro** do backend (`markedEnvironment(process.env, …)`
em `session-runner.ts`) — e todo servidor MCP stdio herda o ambiente do CLI (medido na B-01). Um
servidor de terceiro receberia a URL do banco, a configuração OIDC e o caminho da credencial do push
sem que ninguém tivesse dito sim a nada: diferente do `Bash`, que ao menos passa pelo `canUseTool`, o
servidor sobe com a sessão.

O ambiente do subprocesso passa a ser o do backend **menos** as chaves do schema de configuração do
backend (`environment.ts`) — a lista sai do schema, não de uma lista à mão, e um teste falha quando o
schema ganha chave que a remoção não cobre. Ficam `PATH`, `HOME`, `CLAUDE_CONFIG_DIR`, locale e a marca
do `OrphanSweep`. O plano 12 precisa da mesma função para o terminal: quem chegar primeiro a cria em
`shared/`, e o outro reusa. Cenários S-81, S-82.

### B-21 — Composição por sessão 🔲

No `session.start` (e na sonda do teste), o backend compõe o conjunto
([D-01](decisions.md#d-01--onde-mora-o-servidor-mcp)): servidores ligados do usuário de escopo `user`, os
de escopo `folder` cuja pasta contém o `cwd`, e as entradas do `.mcp.json` **aprovadas** cujo digest
confere com o arquivo de agora. Nome nosso igual ao do projeto: o nosso vale, e o do projeto aparece
sombreado. Tudo com `strictMcpConfig: true`.

O segredo **não** vai no `mcpServers` do `query()`, que vira argv (`--mcp-config`, lido no `sdk.mjs`):
vai pela via que a B-01 escolher — `setMcpServers()` logo depois do início, pelo stdin do controle, ou
referência `${VAR}` a uma variável posta só no ambiente do subprocesso. Log em `debug` com os nomes, nunca
os valores. Cenários S-83…S-87.

### B-22 — Status vivo e comandos da sessão 🔲

`GET /claude/mcp-servers?folder=` junta ao store o `mcpServerStatus()` das sessões vivas do chamador
na pasta: `connected`, `failed` (com o erro redigido), `needs-auth`, `pending`, `disabled`, e as tools
de cada servidor com as annotations. Status e procedência lidos pelo `source`, nunca pelo nome.

Os comandos `session.toggleMcpServer` e `session.reconnectMcpServer` (B-05) — do dono da sessão, com
`ack` antes do efeito — e o evento `session.mcpStatusChanged`, emitido no `system:init` (que traz
`mcp_servers`) e depois de cada comando. `needs-auth` é explicado: autenticar servidor por OAuth pede
navegador na máquina e o fluxo de elicitação do SDK, que este plano não carrega para o cliente remoto —
nenhuma URL de OAuth trafega pelo produto.

O **indicador** de MCP no painel do plano 08 (status agregado na barra do composer, lista ao clicar,
ligar/desligar e reconectar) é entregue por esta task, no painel que o 08 já construiu
([D-14](decisions.md#d-14--quem-entrega-o-indicador-de-mcp-da-sessão)). No **app**, um chip **só de leitura** no
cabeçalho da sessão, com o status agregado e, ao tocar, a lista com o status e o erro redigido de cada
servidor, lidos do `session.mcpStatusChanged` que o mapper do app hoje ignora; sem ações, que ficam no web
([D-32](decisions.md#decididas-durante-a-execução-b-01-2026-10-09)). Os rótulos de status entram no `i18n-shared.json`.
Cenários S-88…S-96, S-215.

### B-23 — Mudança de configuração e sessões vivas 🔲

[D-10](decisions.md#d-10--mudança-de-mcp-e-sessões-vivas): **apertar vale já, afrouxar vale na próxima
sessão** — a mesma assimetria que a revogação de regra tem no plano 03. Remover ou desligar um servidor
no store desliga-o (`toggleMcpServer(name, false)`) em toda sessão viva do usuário que o tem, com
`session.mcpStatusChanged`; um servidor descoberto malicioso não pode continuar rodando até a sessão
fechar. Adicionar ou ligar vale na próxima sessão, e a resposta e a tela dizem isso. Cenários S-97…S-99.

### B-24 — O `.mcp.json` do projeto e a aprovação 🔲

Leitura do `.mcp.json` da pasta aberta — dentro da allowlist, contenção no realpath (symlink que sai
da raiz não é lido), teto de tamanho, JSON inválido explicado. Cada entrada com estado: pendente,
aprovada, rejeitada, **alterada** (o digest da entrada aprovada não confere mais).

[D-11](decisions.md#d-11--aprovação-do-mcpjson): a aprovação é **nossa**, por usuário, por
(pasta, nome, digest da entrada normalizada) — `PUT /claude/project-mcp-approvals` manda o digest que a
tela mostrou, e arquivo que mudou no meio responde `MCP_APPROVAL_STALE`. Um `git pull` que troca o
comando de um servidor aprovado volta-o a pendente. A aprovação que o CLI guarda
(`enabledMcpjsonServers`, `enableAllProjectMcpServers` — inclusive a do próprio `.claude/settings.json`
do repositório, que se auto-aprovaria) **não conta**: é a mesma lógica de "a regra nossa é a única
autoridade" ([plano 03 · D-09](../03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade)).
`${VAR}` aparece literal e marcado; expande no ambiente da B-20, onde os segredos do backend já não
existem. Aprovar e rejeitar gravam na trilha. Cenários S-100…S-110.

### B-25 — Testar conexão de servidor 🔲

`POST /claude/mcp-servers/:id/test`: sonda efêmera com **só** aquele servidor (strict), espera
`mcpServerStatus()` chegar a `connected`, `failed` ou `needs-auth` dentro do prazo, devolve o status, as
tools e o erro redigido, e fecha no `finally`. Testar **executa** o comando — grava
`claude.mcpServerTested` — e só existe para servidor já gravado, que já passou pelo segundo passo. Um
teste em voo por servidor; ocupa lugar na capacidade como a sonda da B-10. Cenários S-111…S-115.

### B-26 — Tool MCP e permissão 🔲

Não há ponte nova: a prova é que **não precisa haver**. `mcp__srv__tool` chega ao `canUseTool` e ao
`PreToolUse` como qualquer tool ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)),
e o que a B-01 medir sobre tools que o CLI auto-aprova vira cenário fixo. Três ajustes:

- **`riskHint`** ([D-13](decisions.md#d-13--risco-de-tool-mcp-e-annotations)): annotation é texto do
  servidor — `readOnly: true` **não** baixa o risco, `destructive: true` sobe; sem annotation, destrutiva.
  Falha fechada, como manda [backend/03 · permission](../../architecture/backend/03-modules.md#permission);
- **gramática**: `mcp__srv__tool` casa a tool, `mcp__srv` casa o servidor inteiro, com fronteira de
  token (`mcp__srv` não cobre `mcp__srvx__t`) — conferir no `rule-pattern.ts` do plano 03;
- **regra que sobrevive ao servidor** ([D-12](decisions.md#d-12--regra-de-tool-mcp-quando-o-servidor-muda)):
  trocar o que roda (comando, args, URL, transporte) ou remover o servidor revoga as `allow` de
  `mcp__<nome>` daquele usuário, na mesma transação da alteração, e a prévia lista quais — a regra foi
  concedida a outro programa. `deny` fica. Cenários S-116…S-122.

### B-27 — Plugins locais 🔲

[D-15](decisions.md#d-15--plugins-do-claude): plugin **local**, por usuário, de um diretório dentro da
allowlist (`WORKSPACE_NOT_ALLOWED` fora; `PLUGIN_PATH_INVALID` sem manifesto). A prévia lê o manifesto e
lista, por extenso, o que ele traz — hooks (código que roda em todo evento), comandos, agents, skills,
servidores MCP. Entra na sessão por `plugins: [{ type: 'local', path, skipMcpDiscovery: true }]`: os
servidores MCP do plugin **não** sobem sozinhos; aparecem na seção MCP como sugestão para aprovar como
servidor nosso. Digest do manifesto: mudou, volta a pendente. Adicionar, ligar e remover gravam
`claude.plugin*`. Plugin de marketplace usa esta mesma construção, a partir do diretório que a
B-47 baixa. Cenários S-123…S-130.

### B-47 — Plugins de marketplace 🔲

[D-15](decisions.md#d-15--plugins-do-claude), decidida pelo usuário contra a recomendação. Marketplaces
**declarados no arquivo da allowlist** (seção própria, validada no boot como a do terminal do plano 12;
ausente é desligado; fora da lista, `PLUGIN_MARKETPLACE_NOT_ALLOWED`); a tela lista os plugins de cada
um, lidos pelo formato publicado de marketplace do Claude Code. Instalar: o backend baixa o plugin para
um diretório **seu**, por usuário, fixado no commit resolvido — nunca `claude plugin install`, nunca
`~/.claude` —, e daí segue a B-27: prévia por extenso, segundo passo, digest, `skipMcpDiscovery: true`,
trilha `claude.plugin*` antes do efeito. Download é só cópia: nenhum script de instalação roda, o
subprocesso recebe o ambiente sem os segredos do backend (B-20), fonte de tipo não suportado ou caminho
que escapa do repositório é `PLUGIN_PATH_INVALID`, fonte inacessível é `PLUGIN_SOURCE_UNAVAILABLE`, e
download que falha no meio não deixa diretório parcial nem registro. Atualizar é explícito: a tela avisa
que há versão nova, a prévia mostra a **diferença** do que o plugin traz, e só o segundo passo troca o
commit. Marketplace que sai do arquivo (recarga por `SIGHUP`) tira os plugins dele das sessões novas,
com a razão na tela. Cenários S-200…S-211, S-213.

### B-28 — Tela: servidores MCP 🔲

Seção "Servidores MCP": lista densa em colunas (nome, origem nosso/projeto/plugin, escopo, transporte,
status em chip, tools), busca, filtro por origem e status, ordenação; seleção com ligar/desligar em
lote (resultado por item); menu de contexto e palette com as mesmas ações. Assistente de adicionar e
editar: stdio (comando, args um por linha, env) ou http/sse (URL, headers), validação inline com as
regras da B-18, e o **segundo passo** com a descrição por extenso vinda do `preview`, a pasta onde vale e
as regras que serão revogadas — sem confirmar, nada é gravado. Campo de segredo só escrita ("definido").
Remover é destrutivo: confirmação sem foco inicial no botão de remover. Servidores do `.mcp.json` em
grupo próprio, com aprovar/rejeitar e, para os alterados, a diferença entre o aprovado e o atual.
Testar conexão com o resultado inline. Cenários S-131…S-136.

### B-29 — Tela: plugins 🔲

Seção "Plugins": lista (nome, origem local/marketplace, versão declarada, caminho ou commit, estado, o
que traz), adicionar escolhendo o diretório pelo diálogo "Abrir pasta" do plano 06 (nunca caminho
digitado solto) **ou** navegando os marketplaces declarados (busca, detalhe, instalar), prévia do que o
plugin traz antes do segundo passo, "atualização disponível" com a diferença, ligar/desligar, remover
com confirmação, e o atalho para aprovar os servidores MCP que ele sugere. Sem marketplace declarado, o
estado vazio diz como declarar um no arquivo. Cenários S-137, S-212.

### B-30 — Usabilidade e ajuda: MCP e plugins 🔲

Ajuda en/pt-BR para quem nunca viu MCP: o que é um servidor MCP, a diferença entre stdio e http, por que
acrescentar um é tão sensível quanto uma regra `always` e o que o segundo passo protege, o que
`needs-auth` significa e como resolver na máquina, por que o `.mcp.json` do repositório precisa de
aprovação e volta a pendente quando muda, o que um plugin pode fazer, o que é um marketplace e por que
só os declarados no arquivo aparecem, e o que **não** é registrado
(valores de segredo). Estado vazio que ensina (adicionar, ou aprovar os do projeto); tooltip em todo
botão de ícone; "Claude: adicionar servidor MCP" e "Claude: testar servidores" na palette; teclado e
foco no assistente; axe sem violação. Cenários S-138…S-140.

---

## Cenários cobertos

S-63…S-140, S-200…S-213.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
pnpm contracts:check
pnpm scan:security
```
