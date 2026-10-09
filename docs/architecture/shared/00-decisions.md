# Decisões de arquitetura (ADR-lite)

Registro do **que** foi escolhido e **por quê**. Leia antes de propor substituir qualquer
tecnologia — provavelmente a alternativa já foi considerada aqui.

Formato: uma decisão por seção. Quando uma decisão for revista, não apague — marque como
`Substituída por ADR-N` e escreva a nova abaixo.

---

## ADR-001 — Claude Agent SDK, não CLI direto nem Managed Agents

**Status:** aceita · 2026-09-13

O backend fala com o Claude local via `@anthropic-ai/claude-agent-sdk`.

**Por quê:** é o Claude Code empacotado como biblioteca. Entrega pronto o loop do agente,
as tools nativas, o streaming, os control requests (interrupt, setModel) e — o ponto
decisivo — o callback `canUseTool`, que permite delegar a aprovação de permissão para um
dispositivo remoto. Sem isso, o app mobile não existe.

**Alternativas descartadas:**
- `claude -p --output-format stream-json` (CLI direto): é o que o SDK faz por baixo. Exigiria
  reimplementar aprovação de permissão, retomada de sessão e control requests.
- Managed Agents: a Anthropic hospeda o loop e um sandbox. Contraria o requisito central —
  queremos a máquina local, com os arquivos locais.
- Tool Runner da API: não tem filesystem nem tools nativas.

**Consequências:** o SDK está em `0.3.x`, pré-1.0. Ver ADR-006.

Detalhes: [../../discovery/01-descoberta-claude-agent-sdk.md](../../discovery/01-descoberta-claude-agent-sdk.md).

---

## ADR-002 — NestJS como framework do backend

**Status:** aceita · 2026-09-13

**Por quê:** DI nativo (essencial para inverter dependências na Clean Architecture sem
container caseiro), estrutura modular que casa com "um módulo por domínio", suporte
first-class a WebSocket gateways, e ecossistema maduro de validação e testes.

**Alternativas descartadas:** Fastify (mais enxuto, pino nativo, mas o container de DI
seria caseiro); Express (WebSocket e tipagem exigiriam montagem manual).

**Consequência — e o risco a administrar:** as camadas do NestJS (`Module`/`Controller`/
`Provider`) **competem conceitualmente** com as camadas da Clean Architecture. A regra que
neutraliza isso: decorator do Nest só existe em `adapter/` e `infrastructure/`. `domain/` e
`application/` são TypeScript puro, sem um único import de `@nestjs/*`. Ver
[backend/01-clean-architecture.md](../backend/01-clean-architecture.md).

---

## ADR-003 — PostgreSQL 18 desde o início, com Drizzle ORM

**Status:** aceita · 2026-09-13

**Por quê o banco:** as sessões do Claude já persistem em `~/.claude/projects/*.jsonl`, mas
autenticação multi-dispositivo, push tokens, regras de permissão persistidas e — sobretudo —
**trilha de auditoria** não têm onde morar. Dado que o sistema executa comando arbitrário na
máquina, auditoria não é opcional.

**Por quê Drizzle e não Prisma/TypeORM:** o repositório fica na camada `adapter`, e o schema
Drizzle é TypeScript puro, sem geração de cliente nem entidades decoradas vazando para o
domínio. TypeORM (idiomático em NestJS) empurra decorators para dentro das entidades, o que
contamina a camada de domínio — exatamente o que ADR-002 tenta evitar.

**Consequências:** migrations versionadas via `drizzle-kit`; testes de integração sobem
Postgres real com testcontainers (ver ADR-004).

---

## ADR-004 — Testcontainers para testes de integração

**Status:** aceita · 2026-09-13

Teste de integração roda contra Postgres **real**, em container efêmero, não contra mock nem
SQLite. Banco em memória mente sobre transação, constraint, tipo e concorrência.

**Consequências:** exige Docker na máquina de dev e no CI; suíte de integração é mais lenta
que a de unit — por isso rodam em alvos separados.

---

## ADR-005 — WebSocket como transporte principal

**Status:** aceita · 2026-09-13

**Por quê:** o fluxo central é bidirecional e iniciado pelo servidor — o Claude pergunta
"posso executar `rm -rf build/`?" e **bloqueia** esperando resposta humana. SSE resolve o
stream servidor→cliente, mas não o round-trip de permissão.

HTTP permanece para o que é genuinamente request/response e cacheável: listar workspaces,
listar sessões, autenticar, buscar histórico.

Contrato: [05-websocket-protocol.md](05-websocket-protocol.md).

---

## ADR-006 — Protocolo próprio, não `SDKMessage` cru

**Status:** aceita · 2026-09-13

O backend **normaliza** os eventos do Agent SDK para um union próprio e versionado antes de
emitir no WebSocket.

**Por quê:** `SDKMessage` tem ~38 variantes, a maioria irrelevante para a UI, e o SDK está em
`0.3.x` — quebra sem cerimônia. Expor o tipo cru acoplaria web e Flutter a um alvo móvel, e
uma atualização de patch do SDK quebraria o app publicado na loja.

**Consequência:** existe um custo de tradução no backend, concentrado em um único adapter.
É o preço de ter um contrato estável.

---

## ADR-007 — pnpm workspaces (com o Flutter fora)

**Status:** aceita · 2026-09-13

`backend/`, `web/`, `e2e/` e `packages/contracts/` são workspaces pnpm. O `mobile/` fica
fora, com `pub` próprio — Dart não participa de workspace Node.

**Por quê:** os tipos do protocolo WebSocket precisam ser **um** artefato compartilhado entre
backend e web (`packages/contracts/`). Duplicar contrato é garantir divergência.

**Consequência:** o Flutter não consegue importar `packages/contracts/`. A paridade é mantida
por **geração de código**: o contrato é descrito em JSON Schema, e o Dart é gerado a partir
dele. Ver [05-websocket-protocol.md](05-websocket-protocol.md).

---

## ADR-008 — Riverpod como gerenciamento de estado no Flutter

**Status:** aceita · 2026-09-13

**Por quê:** é o padrão de mercado atual para projetos Flutter novos. Compile-safe (erro de
dependência aparece em build, não em runtime), testável sem `WidgetTester`, e o
`riverpod_generator` elimina o boilerplate que historicamente afastava do Provider.

**Alternativas descartadas:** BLoC (mais verboso, e o padrão event→state é redundante quando
a fonte já é um stream de eventos do WebSocket); Provider (antecessor, sem type-safety);
`setState` (não escala além de estado local de widget).

---

## ADR-009 — Logging estruturado com paridade entre as três pontas

**Status:** aceita · 2026-09-13

`pino` no backend e no web; `logging` (pacote oficial do Dart) com formatter JSON no Flutter.

**Por quê o mesmo schema de campos nas três:** um problema no app mobile começa no celular,
passa pelo WebSocket, chega no NestJS e termina no Agent SDK. Sem `traceId` comum e nomes de
campo idênticos, correlacionar isso é trabalho manual.

**Por quê não `logger` ou `talker` no Flutter:** ambos são orientados a legibilidade no
console, não a JSON estruturado. `logging` + formatter próprio dá controle total do schema.

Schema: [03-logging.md](03-logging.md).

---

## ADR-010 — OpenID Connect, agnóstico de provedor; Auth0 como alvo inicial

**Status:** aceita · 2026-09-13

Autenticação via **OIDC**. O código conhece o protocolo, não o fornecedor. **Auth0** é o
provedor do primeiro deploy — configuração, não dependência.

**Por quê OIDC em vez de autenticação própria:** este backend dá acesso a execução de comando
arbitrário na máquina do usuário. Delegar para um provedor entrega MFA, rotação de credencial,
detecção de credencial vazada, revogação central e trilha de login sem escrevermos nada. Uma
implementação caseira de senha aqui seria o elo mais fraco de todo o sistema.

**Por quê agnóstico:** o produto roda na máquina do usuário e pode precisar de um provedor
corporativo (Keycloak, Entra ID, Okta) ou self-hosted. Amarrar ao SDK de um fornecedor
transformaria essa troca em reescrita. Usando discovery
(`/.well-known/openid-configuration`) e validação de JWT por JWKS, trocar de provedor é
trocar `OIDC_ISSUER`.

**Por quê Auth0 primeiro:** tier gratuito suficiente, discovery e JWKS conformes, e PKCE
bem suportado nos SDKs de web e mobile. Nada nele é usado que não seja OIDC padrão.

**Consequências:**
- Não existe tabela de senha. O backend é **Resource Server**: valida, nunca emite.
- Identidade local é ancorada em `sub`, nunca em e-mail.
- Autorização (quem abre qual workspace, quem aprova permissão) continua **nossa**, local —
  não usamos role vinda do provedor, para não acoplar o modelo de acesso ao fornecedor.
- Testes usam provedor OIDC **fake** em container. Nunca o Auth0 real.

**Emenda · 2026-09-26 — o alvo passa a ser um Keycloak próprio.** Decisão do usuário
([05 · D-05](../../plans/05-hardening-operations/decisions.md)): o provedor real é um **Keycloak
hospedado junto da instalação e administrado por quem a opera**; o Auth0 deixa de ser o alvo. Nada no
código muda — é a troca de `OIDC_ISSUER` que o "agnóstico" acima promete —, e o teste automatizado
continua no Keycloak local do desenvolvimento, nunca na instância real. O que muda é de quem é a
operação: MFA, política de senha, rotação de chave e recuperação de acesso passam a ser
responsabilidade de quem administra o Keycloak, não de um fornecedor.

Detalhes: [08-authentication.md](08-authentication.md).

---

## ADR-011 — `settingSources: ['project']` obrigatório, e auditoria ancorada no hook `PreToolUse`

**Status:** aceita · 2026-09-13 · **decorre de spike, não de leitura de tipos**

Duas decisões que vieram de um mesmo experimento contra o Claude local. Ver
[descoberta §7](../../discovery/01-descoberta-claude-agent-sdk.md#7--resultados-do-spike-2026-09-13).

### A — Toda `query()` passa `settingSources: ['project']`

**O problema:** omitindo `settingSources`, o SDK carrega as settings de `user`, `project` e
`local` da máquina. Uma regra `allow` em `~/.claude/settings.json` (por exemplo
`"allow": ["Bash(*)", "Write"]`, comum em máquina de quem usa o Claude Code no terminal)
auto-aprova a tool **antes** de o `canUseTool` ser chamado.

Medido: com essa configuração presente, `Bash` e `Write` executaram e o `canUseTool` **não
foi invocado nenhuma vez**. Sem erro, sem aviso. O mecanismo de aprovação sobre o qual o
produto inteiro se apoia estava desligado por um arquivo de configuração pessoal.

**A primeira decisão foi `[]`, e estava larga demais.** Medição posterior mostrou que `[]`
também desliga o **`CLAUDE.md` do projeto** — as sessões ignorariam as instruções do próprio
repositório do usuário. Escopo por escopo:

| `settingSources` | `canUseTool` | `CLAUDE.md` |
|---|---|---|
| omitido | ❌ | ✅ |
| `['user']` | ❌ | ❌ |
| **`['project']`** | **✅** | **✅** |
| `[]` | ✅ | ❌ |

**A decisão:** `settingSources: ['project']` é obrigatório e não configurável, verificado por
regra de `semgrep`. É o único escopo que preserva aprovação humana **e** contexto do projeto.

**Consequência aceita:** a sessão não herda plugins, skills nem regras de permissão pessoais
do usuário (`user`). Quem decide permissão é o módulo `permission`.

**Incerteza residual:** o `allow` de escopo `project` não dispensou o `canUseTool` nos testes,
mas os diretórios não estavam marcados como confiados (`hasTrustDialogAccepted`). Verificar em
diretório confiado antes de produção. Ver
[descoberta §8.2](../../discovery/01-descoberta-claude-agent-sdk.md#82--a-assimetria-allow-vs-deny-entre-escopos).

### B — Auditoria usa o hook `PreToolUse`, não o `canUseTool`

**O problema:** mesmo com `settingSources: []`, o CLI auto-aprova tools de baixo risco por
classificação própria. Medido na mesma sessão: **6 tool calls, 2 chamadas de `canUseTool`,
6 disparos do hook `PreToolUse`**.

Isso está correto para aprovação — ninguém quer autorizar cada `Read`. Mas significa que uma
trilha de auditoria construída sobre `canUseTool` **não registraria nenhuma leitura de
arquivo** nem comando auto-aprovado.

**A decisão:** papéis separados, explicitamente.

| Mecanismo | Cobre | Módulo |
|---|---|---|
| `canUseTool` | só o que exige decisão humana | `permission` |
| Hook `PreToolUse` | **toda** invocação de tool | `audit` |

**Consequência:** o hook registra e deixa passar; não decide. Num sistema com acesso ao
filesystem do usuário, auditoria parcial é pior que ausência de auditoria, porque dá falsa
confiança.

### Emenda · 2026-09-26 — skills de usuário e de sistema entram sem ampliar `settingSources`

Decisão do usuário ([13 · D-20](../../plans/13-claude-settings/decisions.md)): as sessões carregam
skills do **projeto**, do **usuário** e do **sistema**. `settingSources` **continua** `['project']`:
a fonte `user` traria junto as regras `allow` e os hooks de `~/.claude/settings.json`, que furam o
`canUseTool` e a trilha — o mesmo furo medido na D-11 do plano 01.

O caminho é a opção `plugins: [{ type: 'local', path, skipMcpDiscovery: true }]` do SDK: o backend
monta, por usuário, um plugin local sintético que expõe **só** as skills de `~/.claude/skills` e as
de sistema (as dos plugins instalados e as gerenciadas da instalação) — sem hooks, sem MCP. As skills
do projeto (`.claude/skills`) já chegam pela fonte `project`. Quais ficam ligadas é a opção `skills`
do `query()`.

Fica em aberto, e bloqueia ligar as skills de usuário e de sistema: se o shell embutido de uma skill
(os blocos `!`) passa pelo `canUseTool` e pelo `PreToolUse`. Se não passar, ele é desligado por
`managedSettings` para essas origens ([13 · D-21](../../plans/13-claude-settings/decisions.md)).

---

## ADR-012 — Reconexão não usa `reinitialize()`; o registro de pendentes é nosso

**Status:** aceita · 2026-09-13 · **corrige a ADR-011 e o desenho de reconexão**

O desenho anterior mandava chamar `query.reinitialize()` quando um cliente reatava, para
recuperar permission requests órfãos. **Medição mostrou que isso não funciona — e que não é
necessário.**

O erro era de modelo mental: o gap acontece entre o **cliente móvel e o backend**. O canal
SDK↔CLI é stdio de um subprocesso local e **não quebra** quando o celular perde rede. A
`Promise` do `canUseTool` permanece pendente no nosso processo o tempo todo, e o SDK deduplica
requests em voo — por isso não reentrega: não há o que recuperar.

**A decisão:** a republicação de permissões pendentes na reconexão é responsabilidade do
módulo `permission`, a partir do seu próprio registro, disparada pelo `session.attach`.
`reinitialize()` sai do caminho crítico.

**A idempotência por `requestId` continua obrigatória** — agora por causa de múltiplos
clientes e de retry do cliente, não de reentrega do SDK.

Ver [descoberta §8.3](../../discovery/01-descoberta-claude-agent-sdk.md#83--reinitialize-não-reentrega-o-pedido-e-não-precisamos-dele).

---

## ADR-013 — O desfazer não usa `rewindFiles()`; o store de checkpoint é nosso

**Status:** aceita · 2026-09-16 · **muda o mecanismo do desfazer, não a promessa**

O desenho anterior ligava `enableFileCheckpointing: true` para usar `query.rewindFiles()` como
o desfazer do produto. **Medição contra o Claude real mostrou que essa API não sustenta a
promessa** — e um dos três motivos é a própria assinatura, não comportamento:

1. **sobrescreve alteração manual, em silêncio.** Arquivo que o usuário editou à mão depois do
   checkpoint volta ao conteúdo do checkpoint, com `canRewind: true` e `skippedLinks: 0`;
2. **`dryRun: true` não denuncia isso** — as contagens são calculadas contra o checkpoint, e um
   reverte destrutivo aparece como `insertions: 1, deletions: 1`;
3. **não aceita filtro de arquivo.** Uma chamada reverte todos os divergentes do checkpoint.

O terceiro é o que fecha a questão: "preservar o que o usuário editou e reverter o resto" não é
difícil sobre essa API — é **impossível**. E o desfazer existe justamente para ser rede de
segurança de quem aprova de longe; rede que destrói trabalho manual é risco, não rede.

**A decisão:** o store de checkpoint é nosso. Do SDK usamos só os hooks —
`UserPromptSubmit` abre o checkpoint do turno, `PreToolUse` guarda o conteúdo anterior no
primeiro toque de cada caminho, `PostToolUse` guarda hash e mtime do resultado, e
`PostToolUseFailure` não guarda nada. A chave é `(session_id, prompt_id, path)`, e o
`prompt_id` vem do `BaseHookInput` em todo hook — então o turno de um snapshot é sabido **sem
ler o transcript**, o que preserva a regra de nunca fazer parser do JSONL.

O revert é arquivo por arquivo: restaura o que está como a sessão deixou, **preserva** o que
divergiu, e informa os dois.

**O que passou a ser nossa responsabilidade**, e não era antes:

| | Por quê |
|---|---|
| Recusar symlink, hard link, arquivo não regular e pai que deixou de resolver | era o `skippedLinks` do SDK; sem isso, restaurar é caminho para escrever fora do workspace |
| Restauração atômica por arquivo — temporário no mesmo diretório, depois `rename` | falha no meio deixando arquivo truncado é pior que não ter revertido |
| Teto e purga do store de snapshots | referência medida: o store equivalente do CLI ocupa 6,6 MB para 54 sessões |

**`enableFileCheckpointing: true` continua ligado**, e deixa de ser load-bearing: ele preserva o
`/rewind` do próprio usuário no editor. E o desfazer deixou de exigir sessão viva —
`rewindFiles` era método de `Query`, nosso store não é —, então "sessão fechada não desfaz"
passou de limitação a **política**.

Ver [descoberta §9.5](../../discovery/01-descoberta-claude-agent-sdk.md#95--rewindfiles-sobrescreve-alteração-manual-o-dryrun-não-avisa-e-não-há-filtro-por-arquivo)
e [D-06 do plano 04](../../plans/04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir).

---

> **Numeração.** As ADRs 014 a 019 foram reservadas em 2026-09-26 pelos planos que as abrem, na
> ordem dos planos: 014 no [06](../../plans/06-workbench/README.md), 015 no
> [07](../../plans/07-explorer-and-editor/README.md), 016 no [10](../../plans/11-search/README.md),
> 017 no [11](../../plans/12-integrated-terminal/README.md), 018 no
> [12](../../plans/13-claude-settings/README.md) e 019 no [13](../../plans/14-audit-explained/README.md).
> Por isso a 014 e a 017, cujas decisões já foram tomadas, aparecem aqui antes das outras.

## ADR-014 — O web vira um workbench, construído em React

**Status:** aceita · 2026-09-26 · decisão do usuário ([06 · D-01](../../plans/06-workbench/decisions.md#d-01--construir-o-workbench-ou-embutir-o-vs-code)) ·
completada em 2026-09-28 pelo [plano 06 · B-01](../../plans/06-workbench/F0-contract.md#b-01--adr-014-o-web-vira-um-workbench-construído-em-react-),
com as decisões de apresentação

A primeira versão rodando foi recusada pelo usuário como "muito pobre": uma coluna de cartões, a
sessão aberta numa pasta de rascunho, e telas de trilha e regras sem detalhe nem ajuda. O pedido foi
um **cliente do Claude no molde do VS Code**.

**A decisão:**

- **construir o workbench em React, sobre a stack fechada — e não embutir openvscode-server ou
  code-server.** O argumento que decide é de segurança, não de esforço: o VS Code embutido traz
  terminal e extensões que executam na máquina **fora** do `canUseTool` e do hook `PreToolUse`, e
  furariam a trilha e a permissão ([ADR-011](#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse));
- **o workbench de painéis substitui a coluna única a partir de `md`**; abaixo disso, uma view por
  vez, dentro da mesma aba ([06 · D-08](../../plans/06-workbench/decisions.md#d-08--o-workbench-em-tela-pequena));
- **cada pasta aberta é uma aba com um workbench completo** — explorer, editor e o chat do Claude
  lado a lado, na mesma aba, com as sessões da pasta —, várias abertas ao mesmo tempo. **Não** é
  multi-root workspace (várias raízes numa árvore só), que continua fora. O chat nunca é tela nem
  rota própria;
- **uma tela por assunto**: a navegação global leva a Workbench, Auditoria, Regras, Dispositivos,
  Uso e custo ([plano 16](../../plans/16-usage-and-cost/README.md)), Logs e diagnóstico,
  Configuração do Claude ([plano 13](../../plans/13-claude-settings/README.md)) e Configurações do
  app — e, pelo menu de gerenciar, Sobre. Cada uma com tela e rota próprias. **Configurações do app
  e configuração do Claude nunca dividem uma tela**;
- **a paridade com o VS Code é a de arquivos** — abrir, criar, funções de arquivo e editar (decisão
  do usuário de 2026-09-26). Da casca entra o que serve a isso: abas de pasta, menu **Arquivo**,
  command palette, centro de notificações e estado restaurado por aba. Editor de atalhos, vários
  temas, zen mode, layout configurável, menu completo e walkthrough ficam fora; inteligência de
  linguagem, depuração e controle de versão também, por decisão do usuário;
- o seletor de pasta navega **só dentro das raízes da allowlist**
  ([06 · D-03](../../plans/06-workbench/decisions.md#d-03--alcance-do-seletor-dentro-das-raízes-ou-a-máquina-inteira)) —
  a allowlist continua sendo a primeira linha de defesa, e "a máquina toda" é declarar o `$HOME`
  como raiz no arquivo.

**A alternativa descartada — embutir o VS Code** (openvscode-server ou code-server num `iframe`).
Dá fidelidade imediata, e custa a premissa do produto: terminal, tarefas e extensões executam na
máquina fora do `canUseTool`, do `PreToolUse` e da trilha, e "nenhuma tool sensível roda sem um
humano dizer sim" deixaria de valer para metade da tela. Desligá-los não é garantia verificável — a
configuração do VS Code é do usuário, e extensões se instalam por ele. Viria ainda outro servidor,
outra autenticação e outra linguagem de UI, sem resposta no celular e fora da stack fechada. O
mesmo motivo tira o **marketplace de extensões**: extensão executa fora da permissão e da trilha.

**As decisões que a completam**, todas do usuário:

| Decisão | Resultado |
|---|---|
| [06 · D-01](../../plans/06-workbench/decisions.md#d-01--construir-o-workbench-ou-embutir-o-vs-code) | 2026-09-26 · **construir em React**; o VS Code embutido traria terminal e extensões fora da aprovação e da trilha |
| [06 · D-06](../../plans/06-workbench/decisions.md#d-06--a-url-do-workbench) | 2026-09-28 · a pasta da aba ativa na **search**: `/workbench?folder=` |
| [06 · D-07](../../plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas) | 2026-09-28 · `/` abre a aba ativa ou a boas-vindas; `/sessions/$sessionId` e `/history…` **saem sem deep link**, e o histórico volta ao web com o [plano 08](../../plans/08-claude-panel/README.md) |
| [06 · D-08](../../plans/06-workbench/decisions.md#d-08--o-workbench-em-tela-pequena) | 2026-09-28 · abaixo de `md`, **uma view por vez** — Explorer, Editor, Claude, Painel —, barra de views embaixo e seletor de abas no topo, um store para os dois layouts |
| [06 · D-10](../../plans/06-workbench/decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas) | 2026-09-28 · o **conjunto e a ordem das abas no servidor**; a aba ativa na URL; o estado de dentro de cada aba por visitante |
| [06 · D-11](../../plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas) | 2026-09-28 · a aba inativa mantém as sessões e os terminais anexados e libera o resto; teto de **8** abas |

**O que fica de fora, e para onde vai:**

| Fora deste desenho | Onde mora |
|---|---|
| explorer, editor e funções de arquivo | [plano 07](../../plans/07-explorer-and-editor/README.md) — o 06 reserva a view e a área |
| o painel do Claude completo, e o histórico de volta ao web | [plano 08](../../plans/08-claude-panel/README.md) |
| busca | [plano 11](../../plans/11-search/README.md) |
| terminal | [plano 12](../../plans/12-integrated-terminal/README.md), sob a [ADR-017](#adr-017--existe-um-terminal-fora-do-modelo-de-permissão-com-travas) |
| configuração do Claude, uso e custo | planos [12](../../plans/13-claude-settings/README.md) e [15](../../plans/16-usage-and-cost/README.md) — o 06 só reserva a posição |
| o redesenho da auditoria e das regras; a profundidade de dispositivos e de logs | planos [13](../../plans/14-audit-explained/README.md), [14](../../plans/15-rules-management/README.md), [16](../../plans/17-devices/README.md) e [17](../../plans/18-logs-and-diagnostics/README.md) |
| LSP, depuração, git, multi-root, notebooks, colaboração, settings sync, editar a allowlist pela UI, as telas novas no app Flutter | fora do produto ([06 · Não entra](../../plans/06-workbench/README.md#não-entra)) |

**Consequências:** a coluna única deixa de ser o layout do produto a partir de `md`. O detalhe é
normativo em [web/03 · Workbench](../web/03-ui-system.md#workbench) (a moldura, a anatomia, os
registros), [web/04 · Estado de aba de pasta](../web/04-state-and-data.md#estado-de-aba-de-pasta) e
[web/04 · O mapa de rotas](../web/04-state-and-data.md#o-mapa-de-rotas), e
[web/02](../web/02-folder-structure.md) (onde cada feature mora). No backend, a listagem de subpastas
relativiza o "não varre disco" do módulo `workspace` — um nível, sob demanda, dentro da allowlist
([backend/03 · workspace](../backend/03-modules.md#workspace)).

## ADR-015 — O humano escreve no disco pela web

**Status:** aceita · 2026-09-30 · aberta pelo [plano 07 · B-01](../../plans/07-explorer-and-editor/F0-contract.md#b-01--adr-015-o-humano-escreve-no-disco-pela-web-),
sobre as decisões do usuário de 2026-09-28 ([07 · decisões](../../plans/07-explorer-and-editor/decisions.md))

Até o plano 07, quem escrevia no disco do usuário era **o Claude**, sob o `canUseTool` e com o hook
`PreToolUse` registrando ([ADR-011](#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)).
O explorer e o editor trazem um ator novo sobre a mesma máquina: **a pessoa**, salvando, criando,
renomeando, movendo, copiando e apagando arquivos da pasta aberta pela web. A pergunta "quem mudou
este arquivo?" passa a ter uma resposta que a trilha precisa saber dar.

**A decisão:**

- **a fronteira é a allowlist e a pasta aberta**, conferidas no servidor **a cada operação**: a
  pasta pela mesma regra do `ResolveWorkspaceUseCase` (lida a cada uso, nunca em cache); o caminho
  relativo pela regra pura do `FilePath`, antes de qualquer I/O; e de novo no disco — o `realpath`
  do que se toca precisa ficar dentro da pasta, e o que se abre é conferido **no descritor**
  (`/proc/self/fd`), o que pega a troca de um diretório por symlink entre checar e abrir. Subpasta
  aberta é fronteira mais estreita que a raiz: um `path` que sobe acima dela é recusado mesmo dentro
  da mesma raiz ([07 · D-05](../../plans/07-explorer-and-editor/decisions.md#d-05--symlinks-e-hard-links),
  [D-11](../../plans/07-explorer-and-editor/decisions.md#d-11--a-raiz-do-explorer-é-a-pasta-aberta));
- **toda escrita vai para a trilha antes do disco**, sem conteúdo — caminho real e relativo,
  tamanhos, hashes antes e depois, origem e destino, contagem, `sensitive`. Trilha que não grava é
  escrita que não acontece (`503` com `Retry-After`); disco que falha depois do registro deixa um
  `file.failed` apontando o fato, para a trilha nunca afirmar uma escrita que não houve.
  **Leitura não vai para a trilha** — o volume seria o de cada clique na árvore, e o que a pessoa
  lê na própria máquina não é o risco que a trilha existe para cobrir; vai para o log de I/O em
  `debug`, com caminho e bytes e **nunca** o conteúdo ([07 · D-02](../../plans/07-explorer-and-editor/decisions.md#d-02--a-escrita-humana-na-trilha));
- **concorrência por conteúdo**: `ETag` forte (sha256 dos bytes lidos) e `If-Match` obrigatório no
  salvar — sem ele, ou com `*`, é `428`; versão diferente, inclusive arquivo apagado, é `412` com a
  versão atual; o reenvio idêntico depois de resposta perdida é `200` sem segunda escrita
  ([07 · D-03](../../plans/07-explorer-and-editor/decisions.md#d-03--a-semântica-de-concorrência));
- **a relação com o desfazer** ([ADR-013](#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)):
  para o desfazer de uma sessão, a escrita humana é **alteração manual** — muda o hash, o estado que
  a sessão deixou diverge, e o desfazer a preserva (`modifiedOutside`). Isso é cenário provado
  (plano 07, S-124), não acidente. O salvar humano e a restauração do desfazer escrevem pelo mesmo
  processo e se serializam por uma **trava por caminho real**, fornecida pela plataforma aos dois
  módulos (S-125); escritor de fora do processo — o CLI do Claude escreve direto no disco — não passa
  por ela, e a janela residual está no [R-01 do plano 07](../../plans/07-explorer-and-editor/README.md#riscos-e-decisões-em-aberto);
- **os arquivos que mudam o que o Claude pode fazer** (`.claude/settings.json`,
  `.claude/settings.local.json`, `.mcp.json`) são editáveis com segundo passo explícito, e o fato
  na trilha leva `sensitive: true` ([07 · D-15](../../plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão));
- **o editor é construído no web**, pela mesma razão da [ADR-014](#adr-014--o-web-vira-um-workbench-construído-em-react)
  de não embutir o VS Code, e **sem inteligência de linguagem** — completar, diagnóstico, formatador,
  símbolos e depurador ficam fora, decisão do usuário de 2026-09-26: o editor tem realce de sintaxe
  e nada que execute código do projeto.

**O que esta decisão não é:** um caminho para o Claude escrever fora do `canUseTool` — o módulo
`files` não tem seta para `session` e só ouve, pelo barramento interno, o que o Claude escreveu
(`session.fileStateRecorded`), para rotular a origem de uma mudança. Nem um terminal: a pessoa
escreve arquivos, não executa nada.

**Consequências:** módulo `files` no catálogo, com `files → workspace` por porta e `files → audit`
escrevendo ([backend/03 · files](../backend/03-modules.md#files)); seis kinds `file.*` em
`audit_events` por migration nova ([backend/05](../backend/05-persistence.md#os-fatos-de-conta));
os códigos novos no [catálogo](04-errors-and-http.md#catálogo-de-erros-de-domínio); o stream de
mudança no [protocolo](05-websocket-protocol.md#a-pasta-assistida--workspace).

**Baixar é leitura que entra na trilha** (plano 07 · F7): `file.downloaded` antes do primeiro byte de
um `download=true` ou de um zip, porque tira conteúdo da máquina — que é o que a trilha existe para
contar. A prévia e a página do hexadecimal continuam leitura, fora dela, como abrir no editor.

### O histórico local — o backend passa a guardar conteúdo da pessoa

**Acrescentado em 2026-10-01** pelo [plano 07 · B-55](../../plans/07-explorer-and-editor/F8-local-history.md#b-55--o-contrato-do-histórico-e-a-adr-),
sobre a [D-17](../../plans/07-explorer-and-editor/decisions.md#d-17--o-histórico-local).

Até aqui o backend nunca guardava conteúdo de arquivo da pessoa: o `files` lia e escrevia o disco da
pasta aberta, e o que ficava era trilha sem conteúdo. O histórico local muda isso, de propósito, e
com a mesma disciplina do store de snapshots do desfazer
([ADR-013](#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)):

- **o quê:** a versão que uma escrita da pessoa vai **perder** — salvar, apagar, restaurar, upload
  com substituição —, guardada **antes** da escrita. A escrita do Claude não entra: ela já tem o
  store do desfazer da sessão, e duas cópias do mesmo fato divergem;
- **onde:** o metadado em tabela (caminho, hash, tamanho, motivo, quem, quando — nenhuma coluna de
  conteúdo) e o conteúdo em blob no disco do backend, **endereçado por hash**, fora da pasta aberta
  e fora do Postgres — o banco não cresce com o repositório de ninguém
  ([backend/05](../backend/05-persistence.md#o-histórico-local));
- **teto e retenção:** por arquivo, total e por idade, configurados (50 versões, 512 MB, 30 dias),
  com purga por job; arquivo acima do teto de snapshot não entra, e a entrada diz por quê;
- **quem vê:** quem alcança **agora** a pasta da entrada, revalidada a cada pedido — a versão foi
  escrita por alguém com acesso àquela raiz, e quem a alcança hoje já lê o arquivo atual. O autor de
  cada versão fica à vista;
- **por quê:** é a rede de segurança da pessoa, como o desfazer é a das escritas do Claude, e é o que
  troca a confirmação do apagar por um **Desfazer** — o princípio do produto
  ([D-06](../../plans/07-explorer-and-editor/decisions.md#d-06--apagar-definitivo-ou-lixeira));
- **e quando falha:** o histórico é conforto, a trilha é garantia. A falha dele não impede salvar
  (a tela avisa que aquela versão não entrou), mas impede o apagar sem confirmação — nunca se apaga
  achando que há volta.

Restaurar é escrita comum: `If-Match` do atual, o atual guardado antes, `file.restored` na trilha
antes do disco.

## ADR-017 — Existe um terminal, fora do modelo de permissão, com travas

**Status:** aceita · 2026-09-26 · decisão do usuário ([12 · D-01](../../plans/12-integrated-terminal/decisions.md)),
que aceitou a exceção abaixo por escrito

**O que esta decisão aceita, sem eufemismo:** o terminal está **fora** do `canUseTool`, da allowlist
e da trilha por comando. O shell faz `cd` para qualquer lugar e lê o que a conta do sistema lê —
`~/.ssh`, `~/.claude/.credentials.json`, o `.env` do backend. **Ligar o terminal para um `sub` é
entregar a essa pessoa a conta do sistema que roda o backend**, inclusive as raízes que a allowlist
nunca liberou para ela.

**O que não piora:** quem tem um access token válido do web já executa comando arbitrário — abre uma
sessão, pede um `Bash` e aprova o próprio pedido. O modelo de permissão protege contra o **Claude**
fazer o que ninguém pediu, não contra o humano autenticado. O que o terminal tira é o **rastro por
comando** e a propriedade "um humano leu isto antes".

**As travas**, para o terminal não ser o caminho mais fácil de quem não deveria chegar nele:

| Trava | Protege contra |
|---|---|
| desligado por padrão; ligado **por usuário** no arquivo de configuração | ninguém ganhar um shell por omissão |
| reautenticação recente (step-up) para abrir e para reanexar | token velho ou roubado |
| só pelo navegador, nunca pelo app | quem achou um celular desbloqueado |
| ambiente do shell **sem os segredos do backend** | leitura de variável de ambiente |
| trilha de abrir, reanexar e fechar — **nunca as teclas** | senha digitada indo para a trilha |
| limites, TTL de ociosidade e nenhum shell sem dono | processo esquecido rodando para sempre |

Cada trava tem o seu limite dito no [plano 12](../../plans/12-integrated-terminal/README.md) — a
"só do web" não barra quem tem as credenciais do usuário. Job desacoplado pelo próprio usuário
(`nohup`, `setsid`) sobrevive ao fechamento, como em qualquer terminal; um PTY não sobrevive ao
restart do backend.

---

## ADR-019 — Aviso de dependência sem versão corrigida: exceção datada, por ADR

**Status:** aceita · 2026-10-03 · decisão do usuário, no ciclo 8 do
[plano 09](../../plans/09-chat-layout/progress.md#histórico-de-validação)

**Contexto.** O portão 10 reprova qualquer aviso `high` do `pnpm audit` e qualquer aviso do
`osv-scanner`, e a instrução do script é "atualize a dependência; nunca ignore o id". Em 2026-10-03
saiu o GHSA-vfj7-8cjw-p6xm — `braces` ≤ 3.0.3, *stack exhaustion* por padrão muito aninhado — **sem
versão corrigida**: a 3.0.3 é a última. Ele só entra por `jscpd` 4.3.0 → `@jscpd/finder` →
`fast-glob` → `micromatch` → `braces`, dependência de desenvolvimento do portão de duplicação, que
expande só os padrões do nosso `.jscpd.json`. Não há para onde atualizar, e o repositório inteiro
parou no portão 10.

**Alternativas consideradas.**

| Alternativa | Por que não |
|---|---|
| `jscpd` 5.x, que vem empacotado e não declara dependência | é outro motor: com o mesmo config acha 131 clones (em `web/src`, `backend/src`, `mobile/lib` e no lockfile) onde a 4.3.0 acha 0. Adotá-lo pede refatorar tudo isso ou recalibrar o limiar do portão 5 — e recalibrar para passar é proibido. E o código do `braces` pode seguir lá dentro, sem o scanner ver |
| `pnpm.overrides` para outra versão | não existe versão corrigida para onde apontar |
| ignorar o id no `pnpm audit` / no osv | a exceção ficaria sem dono, sem prazo e larga demais: qualquer caminho até o `braces` passaria |
| esperar a correção com o portão vermelho | nenhuma tarefa de nenhum plano fecharia até lá, por um risco que não alcança o produto |

**Decisão.** Um aviso sem versão corrigida pode ser aceito **por um tempo**, por uma ADR, e por
nada mais estreito que isto — em `scripts/accepted-advisories.json`, lido por
`scripts/lib/accepted-advisories.mjs`:

- o **id**, o **pacote** e a **versão**, os três;
- só pelos **caminhos** de dependência que a entrada nomeia (prefixos do `pnpm audit`): o mesmo pacote
  chegando por outra dependência é risco novo, e reprova;
- até uma **data**, depois da qual reprova de novo, com o motivo, saia a correção ou não;
- dito a **cada execução** do portão (`! braces@3.0.3 GHSA-… — accepted by ADR-019 until …`).

O `osv-scanner` não diz o caminho; o `pnpm audit` diz e o julga, e os dois rodam sempre. Nada do
lockfile do app (`pubspec.lock`) é coberto por exceção.

**A exceção aceita hoje:** GHSA-vfj7-8cjw-p6xm, `braces` 3.0.3, só por `.>jscpd>`, até
**2026-11-02**. Ao vencer, o portão volta a reprovar, e a escolha é de novo do usuário: a correção
publicada, outra ferramenta de duplicação, ou uma emenda a esta ADR com outra data.

**O que não muda.** Aviso **com** versão corrigida continua sendo atualizado, nunca aceito — a regra
não ganha uma porta, ganha uma exceção para o caso em que a porta não existe.

## ADR-020 — Diagrama Mermaid é SVG inline, sanitizado em três camadas

**Status:** aceita · 2026-10-03 · decisão do usuário, contra a recomendação, na
[D-02 do plano 21](../../plans/21-rich-previews/decisions.md#f0--normas)

**Contexto.** O `Markdown` único do produto desenha a prévia de arquivo, a resposta do Claude e o plano
para aprovar — e a resposta do Claude é **conteúdo não confiável**: o modelo leu o que ninguém revisou, e
uma injeção de prompt escreve no que ele responde ([08 · R-01](../../plans/08-claude-panel/README.md)).
A [D-18 do plano 07](../../plans/07-explorer-and-editor/decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)
manda SVG entrar **só** por `<img src=blob:>`, onde script nenhum roda. Um bloco `mermaid` desenhado
pelo Mermaid **é** um SVG, gerado na página a partir de texto do modelo, e o Mermaid tem histórico de
CVE de XSS.

**Alternativas consideradas.**

| Alternativa | Por que não |
|---|---|
| SVG como imagem isolada (`<img src=blob:>`) — a recomendação | isola tudo, mas o texto do diagrama não se seleciona nem se copia, e os links do diagrama não funcionam. O usuário escolheu o contrário |
| `iframe` com `sandbox` | um documento por diagrama, altura que não acompanha o conteúdo, tema e foco que não atravessam a fronteira; mais peso para o mesmo isolamento da imagem |
| deixar o bloco como código | é o que o usuário pediu para mudar |

**Decisão.** O diagrama entra como **SVG inline**, e só depois de passar por três camadas, cada uma
suficiente contra uma classe de ataque e as três provadas por teste (21 · S-56):

1. **O Mermaid em `securityLevel: 'strict'`**, `startOnLoad: false`, `maxTextSize` de 20 000 e
   rótulos em texto SVG (`htmlLabels: false`): HTML nos rótulos é codificado, `click` não chama função,
   e uma diretiva `%%{init}%%` do texto não troca tema, CSS nem fonte (chaves em `secure`).
2. **Um passe do DOMPurify nosso** sobre o SVG que o Mermaid devolve, perfil SVG: sem `<script>`, sem
   atributo `on*`, sem `<iframe>`, `<object>`, `<embed>`, `<foreignObject>` nem `<image>`; `href` fora
   de `<a>` só para `#` do próprio SVG; e nenhum `url()` nem `@import` no CSS que aponte para fora dele —
   a regra da imagem remota do `Markdown`: um diagrama não faz a página chamar um host. O que um CVE
   futuro do Mermaid deixar passar, este passe tira.
3. **Os `<a>` reescritos pela regra de link do `Markdown`** (`kindOfUrl`): só `http`, `https` e `mailto`
   ficam com `href`, em nova aba com `rel="noopener noreferrer nofollow"`; `javascript:`, `data:`,
   `file:` e o resto perdem o `href`.

O Mermaid carrega por `import()`, fora do primeiro chunk, e desenha um diagrama por vez. A D-18 do 07
continua valendo para SVG **de arquivo** (prévia de `.svg`): esta ADR abre a exceção só para o SVG que
o próprio app gera a partir de um bloco `mermaid`.

**O que a revoga.** Um CVE do Mermaid sem versão corrigida que alcance o SVG mesmo em `strict`, ou um
script que escape do S-56 — nos dois casos o diagrama volta a ser imagem isolada (a alternativa
recomendada), e esta ADR fica `Substituída`.


## ADR-021 — O backend aceita uma lista explícita de issuers, do mesmo realm

**Status:** aceita · 2026-10-03 · decisão do usuário, na
[D-15 do plano 10](../../plans/10-mobile-chat-layout/decisions.md#f5--endereço-de-conexão),
condicionada ao spike da B-25 — que a confirmou. **Emenda a regra "um issuer"** da
[validação no backend](08-authentication.md#validação-no-backend).

**Contexto.** O app passa a escolher, em tempo de execução, por qual origem fala com o servidor — a
interna, a externa ou outra —, e dessa origem saem a API, o WebSocket e o login
([plano 10 · D-13](../../plans/10-mobile-chat-layout/decisions.md#f5--endereço-de-conexão)). O mesmo
realm é alcançado por mais de uma origem: a porta do próprio provedor e o servidor que encaminha
`/realms` até ele. Sem hostname fixo, o provedor escreve no `iss` a origem pela qual foi chamado. O
backend validava o `iss` contra **um** issuer, então só a origem configurada passava.

**O que o spike mediu** (B-25, Keycloak 26.2.5, sem `KC_HOSTNAME`, com `KC_PROXY_HEADERS=xforwarded`,
o realm do repositório, o encaminhamento do Vite com `changeOrigin` desligado):

| | direto na porta (`:18181`) | pelo encaminhamento do Vite (`:39031`) |
|---|---|---|
| `issuer` do discovery | `http://localhost:18181/realms/remote-claude` | `http://localhost:39031/realms/remote-claude` |
| endpoints do discovery (`authorization`, `token`, `jwks_uri`, `end_session`) | na origem `:18181` | na origem `:39031` |
| JWKS | 2 chaves, `kid` `3908f50I…`, `3KS5AZ8O…` | **byte a byte a mesma** (mesmo md5) |
| `iss` de um token pedido ali | `http://localhost:18181/realms/remote-claude` | `http://localhost:39031/realms/remote-claude` |
| `kid` / `alg` / `aud` do token | `3KS5AZ8O…` / `RS256` / `https://api.remote-claude.local` | os mesmos |

Mais três medidas: com `X-Forwarded-Proto: https` e `X-Forwarded-Host` pelo encaminhamento, o
discovery sai na origem pública (`https://<host>/realms/…`), que é o caminho do túnel e o da
infraestrutura de produção; a página de login pelo encaminhamento manda o formulário para a origem do
encaminhamento e pede o tema por `/resources/…` relativo; e um refresh token emitido por uma origem e
apresentado na outra é recusado pelo provedor (`invalid_grant`, "Invalid token issuer") — quem renova
renova na mesma origem em que entrou, o que o app e o web já fazem.

**Decisão.** A configuração do backend ganha a **lista explícita** dos issuers aceitos:
`OIDC_ISSUER` (o primário — o do web, cujo token endpoint o backend chama pelo navegador) e
`OIDC_ADDITIONAL_ISSUERS` (os outros, separados por vírgula; vazio é nenhum). Para cada issuer da
lista:

- **o seu discovery e o seu cache de JWKS**, cada um com a leitura em voo compartilhada e a regra
  de manter o último documento bom — **por issuer**: a revalidação que falha num não toca no outro;
- a **mesma `aud`**: é a mesma API, e o realm é um só.

O `iss` do token, ainda não verificado, apenas **escolhe** uma entrada da lista; ele nunca acrescenta
uma. Fora da lista → `401 UNAUTHENTICATED` antes de qualquer leitura de rede, e o motivo só no log.
Dentro dela, a assinatura é conferida com as chaves **daquele** issuer, e o `iss` comparado byte a
byte com o que o discovery dele declara — um `iss` forjado não compra nada.

Lista com um issuer só (`OIDC_ADDITIONAL_ISSUERS` vazio) é exatamente o comportamento de antes. Lista
inválida — entrada que não é URL `http(s)`, entrada vazia, issuer repetido (com ou sem a barra final,
o `OIDC_ISSUER` incluído) — não deixa o processo subir.

**Alternativas consideradas.**

| Alternativa | Por que não |
|---|---|
| `KC_HOSTNAME` fixo, um issuer só, todas as origens emitindo o mesmo `iss` | o issuer fixo é uma origem que o celular precisa alcançar para o login; com a origem escolhida no app, o login sairia por um endereço diferente do que ele escolheu |
| aceitar qualquer `iss` cujo caminho seja o do realm | é confiar no token sobre de onde ele vem: qualquer provedor com um realm de mesmo nome passaria a ser candidato |
| um cache de JWKS só, compartilhado | a JWKS medida é a mesma, mas o documento de cada issuer aponta o seu `jwks_uri`, e cache por issuer é o que mantém a falha de uma origem longe da outra |

**Consequências.**

- O provedor fica **sem hostname fixo e atrás dos cabeçalhos de proxy** (`KC_PROXY_HEADERS=xforwarded`)
  no `docker-compose.yml`. O modo público do plano 20 continua passando o `KC_HOSTNAME` dele
  ([20 · D-08](../../plans/20-dev-public/decisions.md)).
- O dev e o e2e listam os dois issuers: o direto, que o web usa, e o do servidor do web
  (`http://localhost:<porta do web>/realms/<realm>`), por onde o celular entra pelo `adb reverse`
  ([plano 10 · D-16](../../plans/10-mobile-chat-layout/decisions.md#f5--endereço-de-conexão)).
- A infraestrutura de produção que publica o endereço externo
  ([19 · D-04](../../plans/19-distribution/decisions.md)) encaminha os mesmos caminhos e manda os
  `X-Forwarded-*`; a origem externa entra na lista.
- Trocar de origem no app é um login novo: o token e o refresh são do issuer de onde vieram.

Detalhes: [08-authentication.md](08-authentication.md#validação-no-backend).

---

## ADR-022 — Permitir tudo é um modo nosso, não o `bypassPermissions` do SDK

**Status:** aceita · 2026-10-07 · decisão do usuário, na
[D-01 do plano 23](../../plans/23-fluid-permissions/decisions.md#f0--normas-e-contrato). **Emenda a regra
"`bypassPermissions` nunca"** dos planos 08 (S-170), 09 (S-25), 10 (S-33) e 13 (S-40): o produto passa a
oferecer um modo que não pergunta, e continua sem oferecer o do SDK.

**Contexto.** Em 2026-10-07 o usuário relatou que o web e o mobile pedem aprovação o tempo todo, apesar
de ele aprovar e criar regras, e pediu uma opção nas duas telas que permita tudo, e que ele possa
desligar. O banco de desenvolvimento mostrou 47 aprovações de Bash "para esta sessão" em 14 dias, e 11
regras persistidas, todas com a linha exata do comando, nenhuma voltando a casar. Até aqui, o único
modo sem perguntas era o `bypassPermissions` do SDK, que nunca foi oferecido: ele desliga o
`canUseTool`, que é o produto.

**Alternativas consideradas.**

| Alternativa | Por que não |
|---|---|
| oferecer o `bypassPermissions` do SDK, com `allowDangerouslySkipPermissions: true` | o CLI para de chamar o `canUseTool`: um `deny` nosso deixa de recusar, nenhuma aprovação fica em `permission_requests`, e voltar a perguntar no meio da sessão depende do CLI aceitar a troca. A flag ficaria configurável, e uma flag assim acaba ligada |
| `acceptEdits` | só cobre edição de arquivo. É exatamente o que o usuário já tinha e continuava sendo perguntado |
| só alargar as regras | resolve a repetição, não o pedido: o usuário quer uma chave que desligue as perguntas, e outra que as religue |

**Decisão.** Um modo novo no contrato, **`allowAll`**, implementado pelo backend:

- o SDK recebe `default` na abertura e em toda troca de modo. O `canUseTool` continua sendo chamado
  para toda tool, e `allowDangerouslySkipPermissions` continua `false`, escrito uma vez;
- a ordem de um pedido é idempotência → regras → modo. Um `deny` que casa ainda recusa, um `allow` de
  regra ainda responde como regra, e só depois o modo aprova;
- `AskUserQuestion` e `ExitPlanMode` continuam abrindo o card: são o Claude pedindo uma resposta, não
  uma permissão;
- a aprovação por modo é uma resolução como as outras: `auto: true`, o dono como autor, `via: 'allowAll'`
  no `permission.resolved`, e uma linha em `permission_requests`;
- ligar resolve os cards já abertos da sessão pelas mesmas regras. Desligar vale na próxima tool, porque
  o modo é lido a cada pedido;
- o modo vale **para a sessão**, escolhido no chip. Não é padrão em configuração nenhuma.

**O que não muda.** `bypassPermissions` continua no contrato com o significado do SDK, nunca oferecido
pelas telas e nunca aceito como padrão; o `pnpm scan:security` continua reprovando
`allowDangerouslySkipPermissions` fora de `false` e `bypassPermissions` como padrão. A trilha de
auditoria continua sendo o hook `PreToolUse`, que não depende do modo.

**Consequências.**

- Uma sessão em `allowAll` roda qualquer comando que nenhuma regra recuse. O chip fica em tom
  destrutivo, com ícone e texto, e o atalho que gira os modos não passa por ele
  ([23 · D-10](../../plans/23-fluid-permissions/decisions.md#f3--web)).
- Um `deny` nas settings do projeto continua recusando antes de nós. É o certo, mas a tela não sabe
  dizer por quê (R-04 do plano 23).

Detalhes: [backend/04-claude-integration.md](../backend/04-claude-integration.md#permitir-tudo--allowall).

---

## ADR-023 — Portão rápido por fase, portão completo no fim do plano

**Status:** aceita · 2026-10-07 · decisão do usuário, durante as F0…F2 do
[plano 22](../../plans/22-live-history/progress.md#decisões-tomadas-durante-a-execução). **Emenda** o
[protocolo de validação](11-validation-protocol.md), a [Definition of Done](10-definition-of-done.md) e o
[AGENTS.md](../../../AGENTS.md), que pediam `pnpm verify:full` ao fim de toda fase.

**Contexto.** O `pnpm verify:full` leva ~25 min, sobe stacks efêmeras e roda o e2e, que divide portas,
`web/dist` e `e2e/.env` com qualquer outra execução na mesma árvore. Rodado ao fim de cada fase, ele
custava mais tempo que a fase em vários planos, e duas sessões na mesma máquina derrubavam o portão uma
da outra sem defeito nenhum no código. O usuário já pedia, plano a plano, para rodá-lo só no fim do lote
(planos 07, 10 e 22).

**Decisão.**

- **Fim de cada fase: o portão rápido**, `pnpm verify` (portões 1-7 — formatação, lint, tipos,
  arquitetura, duplicação, unit e cobertura) e as checagens baratas que a fase tocou (`pnpm docs:check`,
  `pnpm contracts:check`, `pnpm i18n:check`). Vermelho reinicia do portão 1, como sempre.
- **Fim do plano: o portão completo**, `pnpm verify:full` (portões 1-11) e os e2e que o plano exige
  (`pnpm test:e2e:mobile`, `pnpm test:e2e:live`), uma vez, depois da última task do plano.
- **Todo plano termina com a fase de E2E**, e ela é sempre a última: fase nova entra **antes** dela, e
  a de E2E é renumerada para o fim. É nela que o portão completo roda. `pnpm plan new` já cria o plano
  com a fase `e2e` no fim. Planos concluídos antes desta decisão ficam como estão.

**O que não muda.** A conjunção da DoD continua: nada é desligado, nenhum limiar baixa, e o plano só
está **concluído** com `pnpm verify:full` verde. Uma fase verde no portão rápido está pronta como fase;
o plano só está pronto no fim.

**Consequências.**

- Uma regressão de integração ou de e2e pode atravessar várias fases antes de aparecer. O preço é
  aceito: a fase de E2E é a última, e é onde ela aparece.
- Os e2e e o portão completo deixam de disputar a máquina a cada fase com outras sessões.

