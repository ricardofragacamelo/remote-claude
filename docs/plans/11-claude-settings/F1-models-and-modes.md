# F1 — Conta, modelos, padrões e diagnóstico

Plano: [11 — Configuração do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md).
**Entrega:** a tela "Configuração do Claude" existe, com as seções Conta, Instalação e Modelos e
padrões; o diagnóstico da instalação responde "por que o Claude não funciona aqui"; e uma sessão nova
nasce com o modelo, o modo, o esforço, o thinking e o output style que o usuário escolheu — para ele, ou
para aquela pasta.

---

## Por quê

É a parte mais barata e a que o usuário mais sente: hoje toda sessão nasce com o modelo do CLI e o modo
`default`, e trocar é um comando por sessão (plano 08). E é também a que prepara a F2: o **catálogo da
instalação** — perguntar ao CLI sem sessão aberta — é o mesmo mecanismo que o teste de servidor MCP
usa, e nasce aqui, pequeno.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-10 — Catálogo da instalação 🔲

`InstallationCatalog`, generalizando o padrão que o `CommandCatalog` do plano 04 já provou
([backend/03 · session](../../architecture/backend/03-modules.md#session),
[plano 04 · F3](../04-transcript-and-resume/F3-commands.md)): chaveado pela versão do binário que o SDK
spawna (lida do manifesto, corrigida pelo `system:init`), pelo `CLAUDE_CONFIG_DIR` efetivo e — para o
que depende do `.claude/` do projeto (agents, comandos, output styles) — pela pasta; uma chamada em voo
por chave; falha e versão desconhecida nunca ficam no cache.

De onde vem a resposta ([D-05](decisions.md#d-05--catálogo-sem-sessão-viva)): de uma sessão viva do
chamador naquela pasta, se houver; senão de uma **sonda efêmera** — uma `query()` que nunca cede prompt
e faz uma só pergunta, `initializationResult()`, fechada no `finally`. A sonda passa pelo
`realQueryFactory` como qualquer `query()`: `settingSources: ['project']`, `PreToolUse`,
`strictMcpConfig: true` com `mcpServers: {}` (listar modelos não pode subir servidor MCP de ninguém),
marca de confiança limpa, ambiente sem segredos do backend (B-20). Ela ocupa um lugar na capacidade
de sessões enquanto vive: com a capacidade cheia e nenhuma sessão viva na pasta, `SESSION_LIMIT_REACHED`.

Testes: unit do cache e do single-flight com relógio e fábrica falsos; integração com o SDK fake e o
processo real de contagem de capacidade; o custo real vem do `smoke-live` (S-04). Cenários S-16…S-23.

### B-11 — Conta e instalação 🔲

`GET /claude/account`: `accountInfo()` — provedor (`apiProvider`), plano (`subscriptionType`),
organização, e-mail ([D-07](decisions.md#d-07--o-que-da-conta-aparece-e-para-quem)); de
`tokenSource`/`apiKeySource` só o **nome** da fonte. CLI sem login é **estado** (`loginRequired`), com a
instrução de rodar `claude` e `/login` na máquina — o produto não loga ninguém no CLI remotamente, porque
o backend herda o login e não conhece a credencial
([backend/04](../../architecture/backend/04-claude-integration.md#autenticação--não-faça-nada)).
`refresh=true` ignora o TTL do cache da conta.

`GET /claude/installation` — o diagnóstico que responde "por que o Claude não funciona aqui": versão do
SDK, versão do binário que ele spawna, versão do `claude` do `PATH` quando existe e diverge (é o caso
comum, [plano 04 · D-05](../04-transcript-and-resume/decisions.md#d-05--o-menu-é-descoberta-não-fronteira)),
`CLAUDE_CONFIG_DIR` efetivo — vazio é ausente, o defeito que o
[plano 04](../04-transcript-and-resume/progress.md) corrigiu no ciclo 16 —, estado do login, e o
resultado do último teste de conexão. A tela "Logs e diagnóstico" do plano 06 e a de saúde do
[plano 16](../16-logs-and-diagnostics/README.md) **reusam** esta rota, não a refazem
([D-08](decisions.md#d-08--teste-de-conexão-com-o-modelo)). Cenários S-24…S-29.

### B-12 — Teste de conexão com o modelo 🔲

`POST /claude/diagnostics/model-check { model? }`: uma `query()` de **um** turno com um prompt mínimo
fixo, sem tools (`tools: []`), `maxTurns: 1` e `maxBudgetUsd` baixo de configuração; mede latência,
devolve o modelo que respondeu e o custo estimado. É o único ponto deste plano que **gasta token**, e a
tela diz isso antes do clique.

O resultado do diagnóstico é dado, não erro da requisição: `ok`, `notLoggedIn`, `rateLimited`,
`failed` com o motivo traduzido — o diagnóstico rodou e achou o problema. `502`/`504` ficam para o CLI
que morreu ou não respondeu no prazo, que é falha do teste, não resultado dele. Um teste em voo por
usuário. Não vira sessão, não entra no histórico, não vai para a trilha (não executa tool); o custo é
o que o [plano 14](../14-usage-and-cost/README.md) contabilizar. Cenários S-30…S-33.

### B-13 — Modelos da instalação 🔲

`GET /claude/models?folder=`: `supportedModels()` pelo catálogo — `value`, `displayName`,
`description`, `resolvedModel`, `supportsEffort`, `supportedEffortLevels`, `supportsAdaptiveThinking`.
**Nunca** lista no código: envelhece na primeira atualização do CLI, que é o argumento que já proibiu a
lista fixa de comandos. Os permission modes vêm do domínio (`PERMISSION_MODES`), cada um com a
descrição traduzida do que ele faz. Cenários S-34…S-36.

### B-14 — Padrões: store e regras 🔲

Regra pura no domínio do `claude-config` ([D-04](decisions.md#d-04--padrões-por-usuário-e-por-pasta),
[D-06](decisions.md#d-06--o-que-entra-como-padrão)): o padrão do usuário, sobreposto pelo da pasta mais
próxima (a própria ou o ancestral mais próximo com sobreposição), sobreposto pelo que o cliente mandou
no `session.start`. Campos: modelo, permission mode, esforço, thinking (ligado/desligado), output
style, modelo reserva.

Validação: modelo tem de estar no catálogo **no momento de gravar** (`MODEL_NOT_AVAILABLE`; catálogo
fora do ar recusa com `CLAUDE_UNAVAILABLE` em vez de gravar sem validar); `bypassPermissions` nunca é
padrão (`DEFAULT_MODE_NOT_ALLOWED` — é regra estática de
[09-code-quality](../../architecture/shared/09-code-quality.md#segurança-estática) desde o bootstrap, e
passa a valer para o dado também); esforço só se o modelo suporta e o nível está na lista; modelo
reserva diferente do principal (o SDK lança erro se forem iguais). Toda mudança grava
`claude.defaultsChanged` antes de responder, só quando algo mudou; trilha indisponível não grava.

Rotas da [B-04](F0-contract.md); o `GET` devolve o efetivo e a origem de cada campo, que é o que a tela
mostra ("vem do padrão da pasta"). Cenários S-37…S-47.

### B-15 — Aplicar no `session.start` 🔲

O `StartSessionUseCase` pergunta pela porta `SessionConfigurationSource` quando o cliente não mandou
modelo ou modo; a `sdk-options.factory` ganha `effort`, `thinking` e `fallbackModel`; o output style
entra pelo **montador de flag settings** (B-08) — a única via que o SDK oferece para ele, e por isso
com allowlist de chave. Vale igual para a retomada (plano 04), que é uma sessão nova.

Padrão velho — o modelo sumiu numa atualização do CLI, o estilo foi apagado — não impede a sessão: cai
no da instalação, `warn` no log, e `session.started` diz o que valeu e `defaultsFrom`. Sessão viva não
muda quando o padrão muda: trocar dentro dela é o seletor do plano 08. Cenários S-48…S-53.

### B-16 — A tela e as primeiras seções 🔲

`web/src/features/claude-settings/`, cadeia Component → Hook → Service → `api.ts`
([web/01](../../architecture/web/01-architecture.md)), dentro do screen frame do plano 06 (título, uma
linha de propósito, gaveta de ajuda), com navegação lateral entre as seções — Conta, Instalação,
Modelos e padrões, Servidores MCP, Plugins, Skills, Projeto — e o seletor de pasta (abas abertas e recentes do
06) para a sobreposição por pasta. Os quatro estados em cada seção
([web/03](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre)), skeleton que mantém
o layout, mobile-first.

A seção "Claude" das Configurações do app (plano 06) vira um atalho para cá, e o seletor de modelo do
painel do plano 08 passa a ler o **mesmo** `GET /claude/models` se ainda não lê — duas fontes de modelos
são duas listas divergindo ([D-09](decisions.md#d-09--a-seção-claude-das-configurações-do-app)).
Cenários S-54…S-56.

### B-17 — Usabilidade e ajuda: conta, modelos e padrões 🔲

A task que os princípios globais exigem por tela: gaveta de ajuda escrita para quem nunca viu o produto,
en e pt-BR — o que é um modelo, o que esforço e thinking mudam (custo e latência), o que é output style,
cada permission mode **por extenso com a consequência** (`acceptEdits`: o Claude edita arquivos sem
perguntar; `plan`: só planeja; por que `bypassPermissions` não pode ser padrão), o que o teste de conexão
gasta, o que não é registrado. Tooltip em todo controle de ícone; "saiba mais" de cada campo levando à
seção certa da ajuda; validação inline antes de enviar (esforço incompatível desabilitado com o
motivo); erro traduzido que diz o que fazer; comandos na palette do 06 ("Claude: trocar modelo padrão",
"Claude: testar conexão", "Claude: abrir configuração do Claude") com atalho editável no editor de
atalhos do 07. Testes de integração com axe. Cenários S-57…S-62.

---

## Cenários cobertos

S-16…S-62.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
