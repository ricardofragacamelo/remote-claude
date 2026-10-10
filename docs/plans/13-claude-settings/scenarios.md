# Plano 13 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Os cenários marcados `smoke-live` rodam contra o Claude real (`pnpm test:e2e:live`); os demais
níveis `e2e` rodam pela suíte Playwright com o SDK roteirizado. **Códigos novos** (acrescentados ao
catálogo pela [B-06](F0-contract.md)): `MCP_SERVER_NOT_FOUND` (404), `MCP_SERVER_NAME_TAKEN` (409),
`MCP_SERVER_CONFIG_INVALID` (422), `MCP_APPROVAL_STALE` (409), `MODEL_NOT_AVAILABLE` (422),
`DEFAULT_MODE_NOT_ALLOWED` (422), `PLUGIN_NOT_FOUND` (404), `PLUGIN_PATH_INVALID` (422),
`PLUGIN_MARKETPLACE_NOT_ALLOWED` (403), `PLUGIN_SOURCE_UNAVAILABLE` (502). `FILE_EXISTS`
é código do [plano 07](../07-explorer-and-editor/README.md), consumido aqui.

---

## Spike, contrato e regras de máquina — B-01…B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `smoke-live`: com `strictMcpConfig: true` e só `mcpServers` nossos, nenhum servidor do `.mcp.json` (nem com `enableAllProjectMcpServers: true` no `.claude/settings.json`), de frontmatter de subagent, de plugin ou de conector claude.ai sobe — `mcpServerStatus()` lista só os passados | est | e2e | — | B-01 | ✅ |
| S-02 | `smoke-live`: uma tool MCP dispara o hook `PreToolUse` sempre e o `canUseTool` em `default` — inclusive a que se declara `readOnly` | eq | e2e | — | B-01 | ✅ |
| S-03 | `smoke-live`: o valor de um segredo de servidor MCP não aparece em `/proc/<pid>/cmdline` do subprocesso do CLI | err | e2e | — | B-01 | ✅ |
| S-04 | `smoke-live`: a sonda efêmera responde modelos, conta, agents e output styles por `initializationResult()` sem ceder prompt, sem turno e sem subir servidor MCP | eq | e2e | — | B-01 | ✅ |
| S-05 | `smoke-live`: servidor MCP stdio herda o ambiente do CLI — o que ele enxerga é medido e é o que a B-20 corrige | est | e2e | — | B-01 | ✅ |
| S-06 | `query(` sem `strictMcpConfig: true` literal → `pnpm scan:security` reprova | err | unit | — | B-08 | ✅ |
| S-07 | `updateSettings(` em qualquer lugar, ou `settings`/`applyFlagSettings` fora do montador com allowlist de chave → `pnpm scan:security` reprova | err | unit | — | B-08 | ✅ |
| S-08 | o montador de flag settings recusa chave fora da allowlist (`permissions`, `hooks`, `enabledPlugins`, `enableAllProjectMcpServers`, `env`) e aceita `outputStyle` e `effortLevel`; em `managedSettings`, só `disableSkillShellExecution` | fron | unit | — | B-08 | ✅ |
| S-09 | configuração de servidor com `tools[].permission_policy`, ou plugin sem `skipMcpDiscovery: true` → `pnpm scan:security` reprova | err | unit | — | B-08 | ✅ |
| S-10 | os dois comandos e o evento novos existem nas três pontas → `pnpm contracts:check` verde, Dart regenerado | eq | unit | — | B-05 | ✅ |
| S-11 | cliente que não conhece `session.mcpStatusChanged` nem os campos novos de `session.started` os ignora sem quebrar | eq | integração | — | B-05 | ✅ |
| S-12 | todo código novo tem status no mapa e `messageKey` en/pt-BR → `pnpm i18n:check` verde; código sem status responderia `500` e o teste falha | err | unit | — | B-06 | ✅ |
| S-13 | a migration nova acrescenta os kinds `claude.*` ao CHECK sem tocar migration aplicada; kind fora da lista é recusado pelo banco | err | integração | — | B-07 | ✅ |
| S-14 | `claude-config` importando o SDK fora de `adapter/outbound/claude/`, ou o interior de outro módulo → `pnpm lint:arch` reprova | err | unit | — | B-03 | ✅ |
| S-15 | a rota da tela é própria (`/claude-settings`), com seção e pasta na search: o link reproduz a tela | eq | integração | — | B-09 | ✅ |

## Catálogo da instalação — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-16 | com sessão viva do chamador na pasta, modelos e agents vêm dela, sem sonda | eq | integração | — | B-10 | ✅ |
| S-17 | sem sessão viva, uma sonda efêmera responde e é encerrada no `finally` — nenhum processo órfão | est | integração | — | B-10 | ✅ |
| S-18 | duas telas pedindo o catálogo ao mesmo tempo fazem **uma** sonda | conc | unit | — | B-10 | ✅ |
| S-19 | o cache é chaveado por versão do CLI, `CLAUDE_CONFIG_DIR` efetivo e pasta; versão nova → sonda nova | idem | unit | — | B-10 | ✅ |
| S-20 | falha ou prazo estourado da sonda não fica no cache | err | integração | `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT` | B-10 | ✅ |
| S-21 | capacidade de sessões cheia e nenhuma sessão viva na pasta → a sonda é recusada, sem subprocesso | fron | integração | `SESSION_LIMIT_REACHED` | B-10 | ✅ |
| S-22 | a sonda leva `settingSources: ['project']`, o hook `PreToolUse`, `strictMcpConfig: true`, `mcpServers: {}`, e limpa a marca de confiança da pasta antes de subir | eq | unit | — | B-10 | ✅ |
| S-23 | pasta fora da allowlist, de outra pessoa ou inexistente → recusada antes de qualquer sonda | err | integração | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`, `WORKSPACE_NOT_FOUND` | B-10 | ✅ |

## Conta, instalação e diagnóstico — B-11, B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-24 | `GET /claude/account` traz provedor, plano, organização e e-mail — nunca token, nunca caminho de credencial | eq | integração | — | B-11 | ✅ |
| S-25 | CLI sem login → estado `loginRequired` com a instrução para a máquina, não `500` | est | integração | — | B-11 | ✅ |
| S-26 | `refresh=true` ignora o cache da conta: um novo login no CLI aparece | idem | integração | — | B-11 | ✅ |
| S-27 | a instalação mostra a versão do binário que o SDK spawna (manifesto) e a do `claude` no `PATH`, e marca quando divergem | eq | unit | — | B-11 | ✅ |
| S-28 | `CLAUDE_CONFIG_DIR` vazio é lido como ausente, e a tela mostra o diretório efetivo — o defeito corrigido no plano 04 não volta por aqui | fron | unit | — | B-11 | ✅ |
| S-29 | sem credencial válida, qualquer rota `/claude/*` | err | integração | `UNAUTHENTICATED` | B-11 | ✅ |
| S-30 | o teste de conexão com o modelo devolve modelo que respondeu, latência e custo estimado, com um turno, sem tools e sob teto de custo | eq | integração | — | B-12 | ✅ |
| S-31 | teste sem login ou com o modelo recusando → resultado `notLoggedIn`/`failed` descrito, e o `502` fica para o CLI que morreu | err | integração | `CLAUDE_UNAVAILABLE` | B-12 | ✅ |
| S-32 | o teste que não termina no prazo encerra o subprocesso | err | integração | `CLAUDE_TIMEOUT` | B-12 | ✅ |
| S-33 | dois testes do mesmo usuário ao mesmo tempo → um em voo, o segundo recebe o resultado do primeiro | conc | unit | — | B-12 | ✅ |

## Modelos e padrões — B-13…B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-34 | `GET /claude/models` devolve a lista da instalação — nunca constante no código —, com esforço suportado por modelo | eq | integração | — | B-13 | ✅ |
| S-35 | instalação com um modelo a menos reflete na lista | eq | integração | — | B-13 | ✅ |
| S-36 | lista de modelos vazia → a tela explica, e o seletor oferece só "padrão da instalação" | fron | integração | — | B-13 | ✅ |
| S-37 | `PUT /claude/defaults` grava o padrão do usuário, e o `GET` devolve o efetivo com a origem de cada campo | eq | integração | — | B-14 | ✅ |
| S-38 | a sobreposição de uma pasta vale para ela e para as subpastas; a mais próxima vence | fron | unit | — | B-14 | ✅ |
| S-39 | modelo que a instalação não oferece | err | integração | `MODEL_NOT_AVAILABLE` | B-14 | ✅ |
| S-40 | `bypassPermissions` como padrão | err | integração | `DEFAULT_MODE_NOT_ALLOWED` | B-14 | ✅ |
| S-41 | esforço que o modelo não suporta, ou modelo reserva igual ao principal | err | unit | `INVALID_INPUT` | B-14 | ✅ |
| S-42 | corpo malformado lista **todos** os campos inválidos em `details[]` | err | integração | `INVALID_INPUT` | B-14 | ✅ |
| S-43 | o mesmo `PUT` duas vezes grava **um** evento de trilha — só quando algo muda | idem | integração | — | B-14 | ✅ |
| S-44 | mudar padrão grava `claude.defaultsChanged` antes de responder; trilha indisponível não grava o padrão | err | integração | `INTERNAL_ERROR` | B-14 | ✅ |
| S-45 | dois `PUT` simultâneos → um vence por inteiro, sem mistura de campos, e a trilha tem os dois na ordem do banco | conc | integração | — | B-14 | ✅ |
| S-46 | sobreposição de pasta de outra pessoa: ler ou alterar | err | integração | `FORBIDDEN` | B-14 | ✅ |
| S-47 | catálogo indisponível no `PUT` com modelo → recusa honesta, não grava sem validar | err | integração | `CLAUDE_UNAVAILABLE` | B-14 | ✅ |
| S-48 | o cliente que manda `model`/`permissionMode` no `session.start` vence o padrão | eq | unit | — | B-15 | ✅ |
| S-49 | sem padrão nenhum, a sessão abre como hoje: modelo do CLI e `default` | fron | unit | — | B-15 | ✅ |
| S-50 | sessão nova depois de trocar o padrão nasce com ele; a sessão viva não muda | est | integração | — | B-15 | ✅ |
| S-51 | padrão que ficou velho (o modelo sumiu depois de atualizar o CLI) → a sessão abre com o da instalação, `warn`, e `session.started` diz o modelo real e `defaultsFrom` | est | integração | — | B-15 | ✅ |
| S-52 | a retomada aplica os padrões como uma sessão nova | eq | unit | — | B-15 | ✅ |
| S-53 | output style padrão entra pelo montador de flag settings; estilo que não existe mais cai no da instalação, com `warn` | fron | unit | — | B-15 | ✅ |

## Tela — conta, modelos e padrões — B-16, B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-54 | as seções Conta, Instalação e Modelos e padrões mostram os quatro estados, com skeleton que mantém o layout | est | integração | — | B-16 | ✅ |
| S-55 | a tela vive fora das Configurações do app; a seção "Claude" de lá leva para cá | eq | integração | — | B-16 | ✅ |
| S-56 | o seletor de modelo do painel (plano 08) e esta tela leem o mesmo catálogo | eq | integração | — | B-16 | ✅ |
| S-57 | a ajuda está presente e traduzida en/pt-BR: o que é um modelo, esforço, output style, e cada permission mode por extenso com a consequência (`acceptEdits` escreve sem perguntar) | eq | integração | — | B-17 | ✅ |
| S-58 | literal apresentável nas telas novas → `pnpm lint` e `pnpm i18n:check` falham | err | unit | — | B-17 | ✅ |
| S-59 | "Claude: trocar modelo padrão" e "Claude: testar conexão" existem na palette, e o atalho registrado funciona | eq | integração | — | B-17 | ✅ |
| S-60 | validação inline: esforço incompatível com o modelo fica desabilitado com tooltip explicando, antes de enviar | fron | integração | — | B-17 | ✅ |
| S-61 | recusa do servidor chega traduzida e diz o que fazer (atualizar a lista de modelos) | err | integração | `MODEL_NOT_AVAILABLE` | B-17 | ✅ |
| S-62 | foco e teclado percorrem a seção; axe sem violação | eq | integração | — | B-17 | ✅ |

## Servidor MCP — domínio, store e segredo — B-18…B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-63 | stdio com comando, args e env; http e sse com URL e headers — os três aceitos | eq | unit | — | B-18 | ⬜ |
| S-64 | nome fora de `[A-Za-z0-9_-]`, vazio, com mais de 64 caracteres, ou que o motor recusa (no Claude, com `__`, que torna ambíguo o nome nativo da tool) | fron | unit | `MCP_SERVER_CONFIG_INVALID` | B-18 | ⬜ |
| S-65 | URL fora de `http(s)` (`file:`, `javascript:`), stdio sem comando, campos de um transporte no outro | err | unit | `MCP_SERVER_CONFIG_INVALID` | B-18 | ⬜ |
| S-66 | env que sobrepõe variável sensível (`LD_PRELOAD`, `NODE_OPTIONS`, `REMOTE_CLAUDE_*`) ou reservada pelo motor (no Claude, `CLAUDE_CONFIG_DIR`, declarada pelo adapter) | err | unit | `MCP_SERVER_CONFIG_INVALID` | B-18 | ⬜ |
| S-67 | tetos de args, env e headers: no teto passa, um acima recusa | fron | unit | `MCP_SERVER_CONFIG_INVALID` | B-18 | ⬜ |
| S-68 | a descrição por extenso (o que roda, com quais args, onde vale, nomes das variáveis) sai do domínio e é igual na prévia e na gravação | idem | unit | — | B-18 | ⬜ |
| S-69 | nome repetido no mesmo escopo | err | integração | `MCP_SERVER_NAME_TAKEN` | B-19 | ⬜ |
| S-70 | o `GET` nunca devolve valor de segredo — só `{ name, set: true }` | eq | integração | — | B-19 | ⬜ |
| S-71 | no `PUT`, segredo omitido fica, `null` remove, texto substitui | est | integração | — | B-19 | ⬜ |
| S-72 | o segredo está cifrado em repouso: a linha do banco não contém o valor, e a chave vem de arquivo | eq | integração | — | B-19 | ⬜ |
| S-73 | arquivo de chave ausente → servidor **com** segredo não é gravado; sem segredo continua funcionando | err | integração | `SERVICE_UNAVAILABLE` | B-19 | ⬜ |
| S-74 | nenhum valor de segredo no log (inclusive `debug`), na trilha ou em mensagem de erro — varredura do log da suíte | err | integração | — | B-19 | ⬜ |
| S-75 | argumento com forma de segredo (`--token=…`, `Bearer …`) é redigido no log e na trilha, e a tela avisa para usar env | fron | unit | — | B-19 | ⬜ |
| S-76 | servidor de outra pessoa: ler, alterar, ligar ou remover | err | integração | `FORBIDDEN` | B-19 | ⬜ |
| S-77 | id inexistente | err | integração | `MCP_SERVER_NOT_FOUND` | B-19 | ⬜ |
| S-78 | remover de novo responde `404` e não grava segundo evento | idem | integração | `MCP_SERVER_NOT_FOUND` | B-19 | ⬜ |
| S-79 | adicionar, alterar, remover e ligar gravam `mcp.server*`, com o `engine`, **antes** do efeito, com o comando/URL por extenso e só os nomes das variáveis; trilha indisponível não grava nada | err | integração | `INTERNAL_ERROR` | B-19 | ⬜ |
| S-80 | duas alterações simultâneas do mesmo servidor → uma vence por inteiro, e a trilha registra as duas na ordem do banco | conc | integração | — | B-19 | ⬜ |
| S-81 | o subprocesso do CLI — e portanto todo servidor stdio — não recebe as variáveis de configuração do backend (banco, OIDC, push, chave de segredo) | err | integração | — | B-20 | ⬜ |
| S-82 | chave nova no schema de configuração do backend entra na lista de remoção sem lista à mão — o teste falha se o schema ganhar chave não coberta | fron | unit | — | B-20 | ⬜ |

## Composição, status e sessões vivas — B-21…B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-83 | a sessão nasce com os servidores ligados do usuário (escopo usuário + escopo da pasta que casa) e os aprovados do `.mcp.json` cujo digest confere | eq | integração | — | B-21 | ⬜ |
| S-84 | servidor desligado, ou de escopo de outra pasta, não entra | fron | unit | — | B-21 | ⬜ |
| S-85 | servidor de outro usuário nunca entra na sessão de alguém | err | unit | — | B-21 | ⬜ |
| S-86 | o segredo chega ao servidor sem passar pelo argv do CLI, pela via que o spike escolheu | err | integração | — | B-21 | ⬜ |
| S-87 | nome nosso igual ao de um servidor do `.mcp.json` → o nosso vale, e o do projeto aparece sombreado | fron | unit | — | B-21 | ⬜ |
| S-88 | `session.toggleMcpServer` e `session.reconnectMcpServer` chamam o motor pela porta, respondem `ack`, e o resultado chega em `session.mcpStatusChanged` com o `seq` da sessão | eq | integração | — | B-22 | ⬜ |
| S-89 | comando de MCP em sessão de outra pessoa ou inexistente | err | integração | `FORBIDDEN`, `SESSION_NOT_FOUND` | B-22 | ⬜ |
| S-90 | servidor que aquela sessão não tem | err | integração | `MCP_SERVER_NOT_FOUND` | B-22 | ⬜ |
| S-91 | falha do motor ao ligar ou reconectar | err | integração | `AGENT_UNAVAILABLE` | B-22 | ⬜ |
| S-92 | ligar o que já está ligado → `ack`, sem segundo evento | idem | unit | — | B-22 | ⬜ |
| S-93 | o adapter lê o status pelo `source` do SDK, não pelo nome: servidor `sdk` ou `plugin` de mesmo nome não se passa pelo nosso | err | unit | — | B-22 | ⬜ |
| S-94 | `needs-auth` aparece com explicação; nenhuma URL de OAuth trafega pelo produto | fron | integração | — | B-22 | ⬜ |
| S-95 | depois de um `gap`, o cliente relê o status por HTTP e o indicador do painel volta coerente | est | integração | — | B-22 | ⬜ |
| S-96 | a mensagem de erro que o servidor devolve é redigida antes de ir ao cliente (URL com token) | err | unit | — | B-22 | ⬜ |
| S-97 | remover ou desligar no store com sessão viva do usuário → desligado já nela, com `session.mcpStatusChanged` | est | integração | — | B-23 | ⬜ |
| S-98 | adicionar ou ligar com sessão viva → vale na próxima sessão, e a resposta diz isso | est | integração | — | B-23 | ⬜ |
| S-99 | remover durante um turno que usa a tool do servidor → a próxima invocação falha, e o turno não trava | conc | integração | — | B-23 | ⬜ |

## `.mcp.json` do projeto — B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-100 | os servidores do `.mcp.json` aparecem com estado pendente, aprovado, rejeitado ou alterado | eq | integração | — | B-24 | ⬜ |
| S-101 | aprovar grava (pasta, nome, digest), e a próxima sessão tem o servidor | est | integração | — | B-24 | ⬜ |
| S-102 | o `.mcp.json` mudou entre mostrar e aprovar | conc | integração | `MCP_APPROVAL_STALE` | B-24 | ⬜ |
| S-103 | entrada alterada depois de aprovada volta a "alterado" e não entra em sessão até nova aprovação | est | integração | — | B-24 | ⬜ |
| S-104 | a aprovação do próprio motor (no Claude, `enabledMcpjsonServers`, `enableAllProjectMcpServers`, ignoradas pelo adapter) não conta | err | unit | — | B-24 | ⬜ |
| S-105 | `${VAR}` aparece literal na aprovação, marcado; a expansão acontece no ambiente já sem os segredos do backend | err | integração | — | B-24 | ⬜ |
| S-106 | `.mcp.json` malformado, acima do teto, ou symlink que sai da raiz → estado explicado, nada aprovável | err | integração | — | B-24 | ⬜ |
| S-107 | aprovar de novo o mesmo digest não grava segundo evento | idem | integração | — | B-24 | ⬜ |
| S-108 | aprovar e rejeitar entram na trilha, com o comando por extenso | eq | integração | — | B-24 | ⬜ |
| S-109 | a aprovação de um usuário não vale para outro | err | unit | — | B-24 | ⬜ |
| S-110 | pasta fora da allowlist ou de outra pessoa | err | integração | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN` | B-24 | ⬜ |

## Testar conexão de servidor — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-111 | testar sobe só aquele servidor, devolve status e tools (com as annotations), e encerra a sonda | eq | integração | — | B-25 | ⬜ |
| S-112 | servidor que não conecta no prazo → resultado `timeout` descrito, sonda encerrada | fron | integração | — | B-25 | ⬜ |
| S-113 | dois testes do mesmo servidor ao mesmo tempo → um em voo | conc | unit | — | B-25 | ⬜ |
| S-114 | testar grava `mcp.serverTested` — testar **executa** o comando | eq | integração | — | B-25 | ⬜ |
| S-115 | capacidade cheia → teste recusado sem subprocesso | err | integração | `SESSION_LIMIT_REACHED` | B-25 | ⬜ |

## Tool MCP e permissão — B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-116 | a tool MCP chega canônica (`kind: 'mcp'`, `subject.server`, `subject.tool`, `origin.native` opaco) e, no Claude, `mcp__srv__tool` pede permissão pelo `canUseTool` e é registrada pelo `PreToolUse`, como qualquer tool | eq | integração | — | B-26 | ⬜ |
| S-117 | no domínio de `permission` do núcleo, a regra canônica `mcp(srv:tool)` e `mcp(srv:*)` casam a tool `tool` do servidor `srv`; `mcp(srv2:*)` não; `mcp(srv:*)` não cobre o servidor `srvx` | fron | unit | — | B-26 | ⬜ |
| S-118 | annotation `readOnly` não baixa o `riskHint`; `destructive` sobe; sem annotation → destrutiva | err | unit | — | B-26 | ⬜ |
| S-119 | trocar comando, args, URL ou transporte, ou remover um servidor, revoga as `allow` do usuário que alcançam o servidor — as canônicas `mcp(<nome>:…)`, casadas no núcleo, sem o dialeto — o segundo passo as lista; `deny` fica | est | integração | — | B-26 | ⬜ |
| S-120 | servidor novo com o nome de um removido não herda `allow` | err | integração | — | B-26 | ⬜ |
| S-121 | a alteração e a revogação acontecem juntas: falha em uma não grava a outra | err | integração | `INTERNAL_ERROR` | B-26 | ⬜ |
| S-122 | em `readOnly` (o modo canônico), nenhuma `allow` auto-aprova tool MCP — a precedência do plano 03 vale | eq | unit | — | B-26 | ⬜ |

## Plugins locais — B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-123 | plugin local de diretório dentro da allowlist entra na sessão com `skipMcpDiscovery: true` | eq | integração | — | B-27 | ⬜ |
| S-124 | caminho fora da allowlist, ou diretório sem manifesto de plugin | err | integração | `WORKSPACE_NOT_ALLOWED`, `PLUGIN_PATH_INVALID` | B-27 | ⬜ |
| S-125 | a prévia mostra os hooks, comandos, agents e servidores MCP que o plugin declara | eq | unit | — | B-27 | ⬜ |
| S-126 | servidor MCP declarado pelo plugin só sobe se aprovado como servidor nosso | err | integração | — | B-27 | ⬜ |
| S-127 | adicionar, ligar e remover plugin gravam `engine.pluginAdded`, `engine.pluginToggled` e `engine.pluginRemoved`, com o motor no payload, antes do efeito | eq | integração | — | B-27 | ⬜ |
| S-128 | manifesto que muda depois de aprovado volta a pendente | est | integração | — | B-27 | ⬜ |
| S-129 | plugin inexistente, ou de outra pessoa | err | integração | `PLUGIN_NOT_FOUND`, `FORBIDDEN` | B-27 | ⬜ |
| S-130 | adicionar o mesmo diretório duas vezes devolve o existente | idem | integração | — | B-27 | ⬜ |

## Plugins de marketplace — B-47

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-200 | instalar plugin de marketplace declarado baixa para o diretório do backend, fixado no commit, e ele entra na sessão como `local` com `skipMcpDiscovery: true` | eq | integração | — | B-47 | ⬜ |
| S-201 | marketplace fora do arquivo da allowlist é recusado, na listagem e na instalação | err | integração | `PLUGIN_MARKETPLACE_NOT_ALLOWED` | B-47 | ⬜ |
| S-202 | seção de marketplaces ausente é marketplace desligado (lista vazia, explicada); seção fora do schema derruba o boot | fron | unit | — | B-47 | ⬜ |
| S-203 | fonte inacessível, commit inexistente ou manifesto inválido: nada é gravado e nenhum diretório parcial fica | err | integração | `PLUGIN_SOURCE_UNAVAILABLE`, `PLUGIN_PATH_INVALID` | B-47 | ⬜ |
| S-204 | fonte de tipo não suportado, ou caminho de plugin que escapa do repositório (`..`, link) | err | unit | `PLUGIN_PATH_INVALID` | B-47 | ⬜ |
| S-205 | versão nova aparece como "atualização disponível" sem mudar o que roda; atualizar mostra a diferença do que o plugin traz e só troca o commit depois do segundo passo | est | integração | — | B-47 | ⬜ |
| S-206 | arquivo do diretório instalado alterado fora do fluxo diverge do digest e volta a pendente | est | integração | — | B-47 | ⬜ |
| S-207 | instalar o mesmo plugin no mesmo commit duas vezes devolve o existente | idem | integração | — | B-47 | ⬜ |
| S-208 | duas instalações simultâneas do mesmo plugin pelo mesmo usuário deixam um diretório e um registro | conc | integração | — | B-47 | ⬜ |
| S-209 | instalar, atualizar e remover gravam `engine.pluginAdded`, `engine.pluginUpdated` e `engine.pluginRemoved`, com o motor no payload, antes do efeito; remover apaga o diretório | eq | integração | — | B-47 | ⬜ |
| S-210 | o plugin de marketplace de um usuário nunca entra na sessão de outro, nem é lido por ele | err | integração | `FORBIDDEN` | B-47 | ⬜ |
| S-211 | baixar não executa código do plugin, não chama `claude plugin`, não escreve em `~/.claude`, e o subprocesso não recebe os segredos do backend | err | unit | — | B-47 | ⬜ |
| S-212 | a seção de plugins navega os marketplaces declarados (busca, detalhe, instalar com prévia) e, sem nenhum, ensina a declarar no arquivo | eq | integração | — | B-29 | ⬜ |
| S-213 | marketplace retirado do arquivo por recarga: os plugins dele saem das sessões novas, com a razão na tela | est | integração | — | B-47 | ⬜ |

## Tela — servidores MCP e plugins — B-28…B-30

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-131 | a lista mostra status (conectado, falhou, precisa autenticar, pendente, desligado), origem e escopo, com busca, filtro e ordenação | eq | integração | — | B-28 | ⬜ |
| S-132 | o segundo passo diz o comando/URL por extenso, onde vale e quais regras serão revogadas; sem confirmar, nada é gravado | est | integração | — | B-28 | ⬜ |
| S-133 | campo de segredo é só escrita: mostra "definido", nunca o valor; salvar sem tocar mantém | eq | integração | — | B-28 | ⬜ |
| S-134 | ligar/desligar em lote: um item recusado não impede os outros, e a tela diz qual falhou e por quê | err | integração | `FORBIDDEN` | B-28 | ⬜ |
| S-135 | remover pede confirmação (destrutivo), sem foco inicial no botão de remover | est | integração | — | B-28 | ⬜ |
| S-136 | servidor do `.mcp.json` alterado mostra a diferença entre o aprovado e o atual | eq | integração | — | B-28 | ⬜ |
| S-137 | a seção de plugins mostra o que cada plugin traz e o estado, e a prévia antes de adicionar | eq | integração | — | B-29 | ⬜ |
| S-138 | a ajuda está presente e traduzida: o que é MCP, por que acrescentar um é tão sensível quanto uma regra `always`, o que `needs-auth` significa, o que não é registrado (valores de segredo) | eq | integração | — | B-30 | ⬜ |
| S-139 | estado vazio ensina o próximo passo: adicionar um servidor, ou aprovar os do projeto | fron | integração | — | B-30 | ⬜ |
| S-140 | "Claude: adicionar servidor MCP" na palette; teclado e foco no assistente; tooltip em todo botão de ícone; axe sem violação | eq | integração | — | B-30 | ⬜ |

## Configuração de projeto — B-31…B-40

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-141 | `GET /engines/claude/project-config` lista memória, comandos, agents, output styles, hooks, permissões e plugins do projeto | eq | integração | — | B-31 | ⬜ |
| S-142 | pasta fora da allowlist, de outra pessoa ou inexistente | err | integração | `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`, `WORKSPACE_NOT_FOUND` | B-31 | ⬜ |
| S-143 | `.claude/settings.json` malformado ou acima do teto → a parte é explicada, e o resto da tela funciona | err | integração | — | B-31 | ⬜ |
| S-144 | arquivo de configuração que é symlink para fora da raiz não é lido | err | integração | — | B-31 | ⬜ |
| S-145 | nenhum control request não público (`get_hooks_listing`, `list_permission_rules`, `get_settings`) é usado → a regra de máquina reprova | err | unit | — | B-31 | ✅ |
| S-146 | ler enquanto o Claude escreve em `.claude/` devolve o antes ou o depois, nunca um arquivo pela metade | conc | integração | — | B-31 | ⬜ |
| S-147 | a segunda leitura sem mudança em `.claude/` não refaz sonda; mudança de mtime invalida | idem | integração | — | B-31 | ⬜ |
| S-148 | memória: diz qual arquivo existe e qual é **carregado** pelas sessões deste produto; com sessão viva, a lista vem de `getContextUsage` | eq | integração | — | B-32 | ⬜ |
| S-149 | sem `CLAUDE.md`, o estado vazio oferece o `/init` e o modelo inicial | fron | integração | — | B-32 | ⬜ |
| S-150 | "abrir no editor" leva à aba da pasta com o arquivo; arquivo fora da pasta não vira link | fron | integração | — | B-32 | ⬜ |
| S-151 | comandos do projeto são os de `supportedCommands()` sem `builtin`, com o arquivo de origem quando é da pasta | eq | integração | — | B-33 | ⬜ |
| S-152 | criar comando pelo modelo grava `.claude/commands/<nome>.md` pela escrita do plano 07 (trilha `file.*`), e ele aparece no menu do painel | est | integração | — | B-33 | ⬜ |
| S-153 | nome de comando que já existe | err | integração | `FILE_EXISTS` | B-33 | ⬜ |
| S-154 | a lista de skills da pasta traz nome simples, selo da origem (Projeto, Usuário, Sistema), descrição e estado | eq | integração | — | B-34 | ⬜ |
| S-155 | nada desligado → a opção `skills` é omitida (padrão do CLI), nunca `'all'` nem lista | fron | unit | — | B-34 | ⬜ |
| S-156 | desligar uma origem ou uma skill → a sessão nova recebe `skills` sem ela; ela some do `/` do painel e a tool `Skill` a recusa | est | integração | — | B-34 | ⬜ |
| S-157 | colisão de nome projeto × usuário: as duas listadas com o selo; `/nome` chama a do projeto, a outra fica em `plugin:nome` | fron | unit | — | B-34 | ⬜ |
| S-158 | skill apagada do disco depois de desligada: a preferência fica, sem efeito, marcada | est | unit | — | B-34 | ⬜ |
| S-159 | criar skill pelo modelo grava `.claude/skills/<nome>/SKILL.md` pela escrita do plano 07, e ela aparece depois do `reloadSkills()` | est | integração | — | B-34 | ⬜ |
| S-160 | nome de skill fora do formato | err | unit | `INVALID_INPUT` | B-34 | ⬜ |
| S-161 | preferência de skills de uma pasta de outra pessoa | err | integração | `FORBIDDEN` | B-34 | ⬜ |
| S-162 | duas gravações de preferência de skills ao mesmo tempo → uma vence por inteiro | conc | integração | — | B-34 | ⬜ |
| S-163 | a mesma preferência gravada duas vezes não muda nada nem grava segundo evento | idem | unit | — | B-34 | ⬜ |
| S-164 | ligar a origem Usuário ou Sistema grava `engine.skillSourceToggled`, com o motor no payload, antes do efeito; desligar skill não vai para a trilha | eq | integração | — | B-34 | ⬜ |
| S-165 | uma skill de `~/.claude/skills` carrega pelo plugin sintético e aparece com o selo Usuário | eq | integração | — | B-35 | ⬜ |
| S-166 | o plugin sintético expõe só `skills/`, com `skipMcpDiscovery: true` — nenhum hook, agent, comando ou servidor MCP | eq | unit | — | B-35 | ⬜ |
| S-167 | skill de usuário que declara hook no frontmatter não é carregada, e aparece com o motivo — o hook nunca ativa | err | integração | — | B-35 | ⬜ |
| S-168 | com uma `allow` em `~/.claude/settings.json`, o `canUseTool` continua sendo chamado com o plugin sintético ligado — regressão da D-11 do plano 01 | err | integração | — | B-35 | ⬜ |
| S-169 | symlink em `~/.claude/skills` que aponta para fora do home é recusado | err | integração | — | B-35 | ⬜ |
| S-170 | fontes sem mudança reusam o plugin; digest diferente o reconstrói; versão nova do CLI invalida | idem | integração | — | B-35 | ⬜ |
| S-171 | dois `session.start` do mesmo usuário ao mesmo tempo constroem o plugin uma vez, e nenhum vê diretório pela metade | conc | integração | — | B-35 | ⬜ |
| S-172 | diretório de skills do usuário ausente ou vazio → origem vazia explicada, e a sessão abre | fron | integração | — | B-35 | ⬜ |
| S-173 | o plugin sintético de um usuário nunca entra na sessão de outro | err | unit | — | B-35 | ⬜ |
| S-174 | com a política de shell inline ligada, o bloco `!` de uma skill vira o marcador, e a ajuda diz isso | est | integração | — | B-35 | ⬜ |
| S-175 | subagent com `permissionMode`, `tools` amplos ou `mcpServers` no frontmatter aparece sinalizado, com a explicação | err | unit | — | B-36 | ⬜ |
| S-176 | criar subagent pelo modelo grava `.claude/agents/<nome>.md` e ele aparece em `supportedAgents()` na sessão seguinte | est | integração | — | B-36 | ⬜ |
| S-177 | output styles: o atual e os disponíveis vêm de `initializationResult()`; um estilo criado pelo modelo aparece | eq | integração | — | B-37 | ⬜ |
| S-178 | escolher um output style como padrão grava pelo store da F1 | est | integração | — | B-37 | ⬜ |
| S-179 | hooks de projeto aparecem só leitura, com evento, matcher e comando por extenso, e o que o spike mediu sobre rodarem nas nossas sessões | eq | integração | — | B-38 | ⬜ |
| S-180 | permissões de projeto: `deny` descrito como aplicado; `allow` descrito como sem efeito aqui, porque a marca de confiança é limpa | eq | unit | — | B-38 | ⬜ |
| S-181 | `enabledPlugins` do projeto listado, com aviso | eq | unit | — | B-38 | ⬜ |
| S-182 | a seção Projeto troca de pasta pelo seletor (abas abertas e recentes do plano 06) e mostra os quatro estados | est | integração | — | B-39 | ⬜ |
| S-183 | a ajuda está presente e traduzida: CLAUDE.md, slash command, subagent, output style, e "hook é código que roda na máquina" | eq | integração | — | B-40 | ⬜ |
| S-184 | "Claude: abrir CLAUDE.md", "Claude: novo slash command" e "Claude: novo subagent" na palette; atalho, teclado e axe | eq | integração | — | B-40 | ⬜ |

## E2E e smoke-live — B-41…B-46

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-185 | trocar o padrão pela tela e ver a sessão nova nascer com ele | est | e2e | — | B-41 | ⬜ |
| S-186 | o diagnóstico da instalação e o teste de conexão pela tela | eq | e2e | — | B-41 | ⬜ |
| S-187 | adicionar servidor MCP pelo segundo passo e vê-lo na trilha | eq | e2e | — | B-42 | ⬜ |
| S-188 | o segredo nunca volta inteiro — nem na resposta, nem na tela, nem depois de recarregar | err | e2e | — | B-42 | ⬜ |
| S-189 | desligar um servidor com sessão viva muda o indicador da sessão | est | e2e | — | B-42 | ⬜ |
| S-190 | `.mcp.json` pendente → aprovar → sessão nova com o servidor; alterar o arquivo → pendente de novo | est | e2e | — | B-43 | ⬜ |
| S-191 | tool MCP pede permissão pelo card; negar → não roda | est | e2e | — | B-43 | ⬜ |
| S-192 | criar slash command pelo modelo e usá-lo no menu do painel | eq | e2e | — | B-44 | ⬜ |
| S-193 | pasta que saiu da allowlist mostra a recusa traduzida, com caminho de volta | err | e2e | `WORKSPACE_NOT_ALLOWED` | B-44 | ⬜ |
| S-194 | uma skill de usuário aparece com o selo, e desligar a origem pela tela a tira do `/` do painel | est | e2e | — | B-44 | ⬜ |
| S-195 | axe sem violação, teclado de ponta a ponta e viewport de celular sem scroll horizontal nas sete seções; com o motor de teste do plano 28, sem `mcp` e sem extensão, só as seções do núcleo que ele anuncia aparecem | eq | e2e | — | B-45 | ⬜ |
| S-196 | `smoke-live`: modelos e conta reais, servidor de fixture conectado, tool MCP real passando pelo `canUseTool` | eq | e2e | — | B-46 | ⬜ |
| S-197 | `smoke-live`: skill de usuário real carrega pelo plugin sintético, a `allow` de `~/.claude/settings.json` continua sem dispensar o `canUseTool`, e a política de shell inline vale como a D-21 decidiu | err | e2e | — | B-46 | ⬜ |
| S-198 | `smoke-live`: subagent de projeto com `permissionMode: acceptEdits` não escreve sem o `canUseTool` — ou o resultado medido vira aviso na tela e risco aberto | est | e2e | — | B-46 | ⬜ |
| S-199 | `pnpm test:e2e:mobile` verde com os tipos Dart regenerados | eq | e2e | — | B-46 | ⬜ |
| S-214 | as fixtures deste plano (tool MCP composta, skill de usuário, slash command e subagent de projeto, output style padrão) dão o mesmo conteúdo no web e no app pela paridade do plano 26, e o `render:check` sai verde sem `pending` (D-31) | eq | unit | — | B-46 | ⬜ |
| S-215 | app: com a capacidade `mcp` no `session.started`, `session.mcpStatusChanged` vira o chip da sessão (sem ela, nenhum chip) com o status agregado; ao tocar, a lista com status e erro redigido de cada servidor; nenhuma ação de ligar, desligar ou reconectar no app; a lista inteira substitui a anterior a cada evento (D-32) | eq | widget | — | B-22 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Spike (B-01) | `fron`, `conc`, `idem` | o spike mede comportamento do CLI sob uma configuração fixa; fronteiras, corrida e repetição das peças que ele informa estão nas tasks que as implementam (S-21, S-18, S-19) |
| Regras de máquina (B-08) | `eq`, `est`, `conc`, `idem` | regra estática lê código parado: não há estado, corrida nem repetição que mude o veredito, e a classe "código conforme" é o próprio backend passando no portão a cada `pnpm verify` |
| Módulo, persistência e rota (B-03, B-07, B-09) | `fron`, `est`, `conc`, `idem` | são declarações verificadas por `lint:arch`, pelo banco e pelo roteador; o comportamento sob limite, estado e corrida está nos cenários das rotas que as usam (S-19, S-45, S-80) |
| Contrato WS e erros (B-05, B-06) | `fron`, `est`, `conc`, `idem` | contrato e catálogo são declarações verificadas por gerador e por `i18n:check`; o comportamento sob estado e corrida está nos cenários dos comandos (S-88…S-99) |
| Catálogo (B-10) | — | todas as seis cobertas |
| Conta e diagnóstico (B-11, B-12) | — | todas as seis cobertas |
| Modelos (B-13) | `err`, `est`, `conc`, `idem` | a lista é leitura do catálogo; erro, cache e corrida do catálogo estão em S-18…S-21 |
| Tela F1 (B-16, B-17) | `conc`, `idem` | a tela não tem escrita concorrente própria — a corrida de dois `PUT` é do backend (S-45), e a idempotência também (S-43) |
| Domínio do servidor (B-18) | `est`, `conc` | regra pura, sem estado nem I/O; o estado do servidor é do store (S-71) e a corrida também (S-80) |
| Ambiente sem segredos (B-20) | `eq`, `est`, `conc`, `idem` | a remoção é uma função pura sobre o schema de configuração, aplicada uma vez por subprocesso; a única classe de entrada — variável do schema do backend — é a que S-81 prova |
| Composição (B-21) | `est`, `conc`, `idem` | a composição é calculada no `session.start`, uma vez; o que muda com a sessão viva está em S-97…S-99, e a retomada paralela já é uma só (plano 04 · S-25) |
| `.mcp.json` (B-24) | `fron` | o único limite é o teto de tamanho do arquivo, e ele é tratado como estado explicado junto do malformado (S-106) — não há valor de fronteira que mude o resultado |
| Testar servidor (B-25) | `est`, `idem` | o teste não grava estado do servidor — devolve o que observou; e cada teste executa o comando de novo por definição, então o que não se repete é o teste em voo (S-113) |
| Tool MCP e permissão (B-26) | `conc`, `idem` | o casamento e a precedência são regra pura do plano 03, já provada sob corrida e repetição (plano 03 · S-46); a revogação usa a mesma rotina idempotente de lá |
| Plugins (B-27) | `fron`, `conc` | o único limite de um plugin é a allowlist, coberto como erro (S-124); adicionar é um clique deliberado sobre um diretório, e a corrida possível — dois cliques — cai na idempotência (S-130) |
| Plugins de marketplace (B-47) | — | todas as seis cobertas |
| Tela MCP e plugins (B-28…B-30) | `conc`, `idem` | corrida e repetição das escritas são do backend (S-80, S-78); o lote parcial é tratado como erro por item (S-134) |
| Projeto (B-32, B-33, B-36…B-40) | `conc`, `idem` | a leitura concorrente e o cache estão no endpoint (S-146, S-147); criar arquivo é a escrita do plano 07, com a concorrência (ETag, `409`) provada lá |
| E2E (B-41…B-46) | `fron`, `conc`, `idem` | fronteiras, corrida e repetição são exatas e baratas em unit e integração (S-21, S-45, S-43, S-102); pela porta do usuário custariam minutos para provar o mesmo |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md) — ou um
  código novo, declarado no topo desta matriz e acrescentado ao catálogo pela B-06.
