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

Decisão do usuário ([11 · D-20](../../plans/11-claude-settings/decisions.md)): as sessões carregam
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
`managedSettings` para essas origens ([11 · D-21](../../plans/11-claude-settings/decisions.md)).

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
> [07](../../plans/07-explorer-and-editor/README.md), 016 no [09](../../plans/09-search/README.md),
> 017 no [10](../../plans/10-integrated-terminal/README.md), 018 no
> [11](../../plans/11-claude-settings/README.md) e 019 no [12](../../plans/12-audit-explained/README.md).
> Por isso a 014 e a 017, cujas decisões já foram tomadas, aparecem aqui antes das outras.

## ADR-014 — O web vira um workbench, construído em React

**Status:** aceita · 2026-09-26 · decisão do usuário ([06 · D-01](../../plans/06-workbench/decisions.md))

A primeira versão rodando foi recusada pelo usuário como "muito pobre": uma coluna de cartões, a
sessão aberta numa pasta de rascunho, e telas de trilha e regras sem detalhe nem ajuda. O pedido foi
um **cliente do Claude no molde do VS Code**.

**A decisão:**

- **construir o workbench em React, sobre a stack fechada — e não embutir openvscode-server ou
  code-server.** O argumento que decide é de segurança, não de esforço: o VS Code embutido traz
  terminal e extensões que executam na máquina **fora** do `canUseTool` e do hook `PreToolUse`, e
  furariam a trilha e a permissão ([ADR-011](#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse));
- **cada pasta aberta é uma aba com um workbench completo** — explorer, editor e o chat do Claude
  lado a lado, na mesma aba —, várias abertas ao mesmo tempo. Não é multi-root workspace;
- **uma tela por assunto**: auditoria, regras, dispositivos, uso e custo, logs e diagnóstico,
  configuração do Claude e configurações do app têm tela e rota próprias, e nunca dividem uma;
- **a paridade com o VS Code é a de arquivos** — abrir, criar, funções de arquivo e editar.
  Inteligência de linguagem, depuração e controle de versão ficam fora, por decisão do usuário;
- o seletor de pasta navega **só dentro das raízes da allowlist**
  ([06 · D-03](../../plans/06-workbench/decisions.md)) — a allowlist continua sendo a primeira linha
  de defesa, e "a máquina toda" é declarar o `$HOME` como raiz no arquivo.

**Consequências:** a coluna única deixa de ser o layout do produto a partir de `md`; abaixo disso,
uma view por vez dentro da mesma aba. O detalhe de layout, estado por aba e rotas é do
[plano 06](../../plans/06-workbench/README.md), que completa esta ADR com as decisões de
apresentação (D-08, D-10) e atualiza `web/02`, `web/03` e `web/04`.

## ADR-017 — Existe um terminal, fora do modelo de permissão, com travas

**Status:** aceita · 2026-09-26 · decisão do usuário ([10 · D-01](../../plans/10-integrated-terminal/decisions.md)),
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

Cada trava tem o seu limite dito no [plano 10](../../plans/10-integrated-terminal/README.md) — a
"só do web" não barra quem tem as credenciais do usuário. Job desacoplado pelo próprio usuário
(`nohup`, `setsid`) sobrevive ao fechamento, como em qualquer terminal; um PTY não sobrevive ao
restart do backend.

