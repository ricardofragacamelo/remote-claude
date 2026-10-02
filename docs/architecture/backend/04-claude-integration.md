# Integração com o Claude local (Agent SDK)

O documento mais denso do backend. Leia junto com a
[descoberta do SDK](../../discovery/01-descoberta-claude-agent-sdk.md), que tem a superfície
da API verificada.

Voltar para o [índice do backend](README.md).

---

## Onde isso mora

**Todo** contato com `@anthropic-ai/claude-agent-sdk` acontece em um único lugar:

```
src/adapter/outbound/claude/
├── agent-sdk.adapter.ts          implementa ClaudeSessionPort
├── session-runner.ts             1 sessão = 1 query() = 1 subprocesso
├── input-queue.ts                a fila async que alimenta o streaming input
├── sdk-message.mapper.ts         SDKMessage → evento do nosso contrato
├── permission-bridge.ts          canUseTool ↔ módulo permission
└── sdk-options.factory.ts        monta Options a partir do domínio
```

Nenhum import de `@anthropic-ai/*` fora desta pasta. É o que permite trocar o SDK, versioná-lo
ou fakeá-lo em teste sem tocar em regra de negócio.

---

## Autenticação — não faça nada

O backend roda como o usuário dono da máquina e **herda o login do Claude**
(`~/.claude/.credentials.json`). Não existe `ANTHROPIC_API_KEY` neste sistema, e não crie
variável de ambiente para isso.

A consequência de segurança é o fato central do projeto: **quem alcança o backend executa
comando arbitrário na máquina**, via tool `Bash`, com as credenciais do usuário. Por isso
`auth`, `permission` e `audit` são núcleo, não acessório.

---

## Streaming input mode — obrigatório

`query()` aceita `prompt` como string **ou** como `AsyncIterable`. Só o segundo habilita os
control requests (`interrupt`, `setModel`, `setPermissionMode`). **Sempre use o segundo.**

```ts
// input-queue.ts — a fila que vira o AsyncIterable
class SessionInputQueue implements AsyncIterable<SDKUserMessage> {
  push(message: SDKUserMessage): void  // chamado por session.prompt
  close(): void
}
```

O runner então é:

```ts
const queue = new SessionInputQueue()
const q = query({ prompt: queue, options })

for await (const message of q) {
  const events = mapper.toEvents(message)   // SDKMessage → nosso contrato
  for (const event of events) hub.publish(sessionId, event)
}
```

O `for await` **é** a fonte do stream. Ele roda pela vida inteira da sessão.

---

## Options — o que amarramos

```ts
// sdk-options.factory.ts
{
  cwd: workspace.path.value,              // ← "workspace" é isto
  additionalDirectories: workspace.extraDirs,
  settingSources: ['project'],            // ← OBRIGATÓRIO. Nem mais, nem menos.
  permissionMode: session.permissionMode,
  canUseTool: permissionBridge.handle,    // ← aprovação humana
  hooks: { PreToolUse: [auditHook] },     // ← trilha de auditoria (cobertura total)
  includePartialMessages: true,           // deltas para UI fluida
  includeHookEvents: true,
  model: session.model,
  maxBudgetUsd: config.session.maxBudgetUsd,
  maxTurns: config.session.maxTurns,
  ...conversationOptions(session.conversation),  // sessionId · resume · forkSession — ver Retomada
  persistSession: true,                   // mantém o JSONL, compartilhado com o VSCode
  enableFileCheckpointing: true,          // o /rewind do usuário no editor, não o nosso desfazer
  abortController,
}
```

Decisões tomadas:

| Opção | Escolha | Por quê |
|---|---|---|
| `includePartialMessages` | `true` | sem deltas a UI trava em "pensando…" por minutos |
| `persistSession` | `true` | retomar do celular o que começou no VSCode |
| `enableFileCheckpointing` | `true` | preserva o `/rewind` do próprio usuário no editor; o **nosso** desfazer não depende dele — ver [Desfazer arquivos](#desfazer-arquivos--o-store-é-nosso) |
| `allowDangerouslySkipPermissions` | **`false`, sempre** | desligaria o `canUseTool`, que é o produto |
| `settingSources` | **`['project']`, sempre** | ver [A armadilha do `settingSources`](#a-armadilha-do-settingsources) |
| `pathToClaudeCodeExecutable` | binário do SDK | versões casadas; atualiza pelo npm junto com o SDK |

`allowDangerouslySkipPermissions` nunca vira configurável. Um flag assim acaba ligado.

### A armadilha do `settingSources`

**Verificado por spike, não deduzido dos tipos.** Ver
[descoberta §7.2](../../discovery/01-descoberta-claude-agent-sdk.md#72--as-settings-do-usuário-furam-o-canusetool).

Quando `settingSources` é **omitido**, o SDK carrega as settings de `user`, `project` e
`local` da máquina. Uma regra `allow` em `~/.claude/settings.json` — por exemplo
`"permissions": { "allow": ["Bash(*)", "Write"] }`, coisa comum em máquina de quem usa o
Claude Code no terminal — **auto-aprova a tool antes de o `canUseTool` ser chamado**.

No spike, com essa configuração presente na máquina, `Bash` e `Write` executaram e o
`canUseTool` **não foi invocado nenhuma vez**. Sem erro, sem aviso.

Isso desliga, em silêncio, o mecanismo sobre o qual o produto inteiro se apoia.

**Mas `[]` é largo demais** — e isso também foi medido. Escopo por escopo:

| `settingSources` | `canUseTool` respeitado | `CLAUDE.md` do projeto |
|---|---|---|
| omitido (default) | ❌ pulado | ✅ carregado |
| `['user']` | ❌ pulado | ❌ ignorado |
| **`['project']`** | **✅ chamado** | **✅ carregado** |
| `[]` | ✅ chamado | ❌ ignorado |

Com `[]`, as sessões **ignoram o `CLAUDE.md` do projeto** — ficariam piores que as do VSCode
no mesmo repositório. `['project']` preserva as duas coisas, e é a configuração obrigatória.

O escopo `user` é o perigoso: é dele que vêm as regras `permissions.allow` pessoais. O escopo
`project` tem uma assimetria que **só vale em diretório não confiado** — `deny` de projeto é
aplicado, `allow` de projeto não dispensa o `canUseTool`. Ver
[descoberta §8.2](../../discovery/01-descoberta-claude-agent-sdk.md#82--a-assimetria-allow-vs-deny-entre-escopos).

### Diretório confiado fura o `canUseTool` — medido

**A assimetria acima desaparece quando o diretório está confiado.** Medido em 2026-09-18
([B-45](../../plans/01-live-session/F0-contract.md), SDK `0.3.277`), com `settingSources:
['project']` e `.claude/settings.json` do projeto contendo `"permissions": { "allow": ["Write"] }`:

| `hasTrustDialogAccepted` do diretório | `canUseTool` chamado | hook `PreToolUse` chamado | arquivo escrito |
|---|---|---|---|
| `false` | ✅ **sim** | ✅ sim | sim |
| `true` | ❌ **não** | ✅ sim | sim |

Dois braços, dois ciclos cada, resultado idêntico. Com o diretório confiado, a tool executou
**sem que ninguém fosse consultado** — sem erro e sem aviso.

Três consequências, e nenhuma delas é opcional:

1. **A mitigação é obrigatória, não redundante.** O backend limpa ou recusa a marca de confiança
   antes de abrir sessão. Era a decisão adotada "de qualquer forma"; a medição diz que sem ela o
   produto não tem aprovação humana.
2. **[ADR-011](../shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) se confirma.** O hook `PreToolUse` foi chamado nos dois braços. Auditoria
   ancorada no `canUseTool` teria perdido exatamente a invocação que ninguém autorizou — que é a
   que mais importa registrar.
3. **`options.allowedTools` com nome simples também fura.** Descoberto no mesmo spike: uma entrada
   como `allowedTools: ['Write']` auto-aprova a tool antes do callback, e o próprio SDK avisa
   (`CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`). A fábrica de opções não pode usar nomes simples ali.

> Existe uma regra própria que reprova `query()` sem `settingSources: ['project']` e sem o hook
> `PreToolUse`. Ver [qualidade](../shared/09-code-quality.md#segurança-estática).
>
> A regra lê **código**, não prosa: comentários são apagados antes da busca, porque este projeto
> explica o SDK por escrito e um portão que acusa a explicação é um portão que se aprende a
> ignorar. Strings ficam, porque é dentro de uma que mora o `['project']` que a regra exige.
>
> **A regra sozinha não basta, e por um motivo que este código criou.** A fábrica de `Query`
> existe para que o teste possa injetar um stream roteirizado, e com ela o único `query(` literal
> do backend passou a ser um passthrough. Então `realQueryFactory` **recusa** opções sem as duas
> coisas (`UnsafeSdkOptionsError`): a máquina lê a chamada literal, e o processo não alcança o
> subprocesso sem passar por ela. Uma verifica, a outra impede.

---

## A ponte de permissão

```ts
// permission-bridge.ts
const canUseTool: CanUseTool = async (toolName, input, options) => {
  // 1. idempotência — o SDK reentrega após gap de transporte
  const existing = await permissions.findByRequestId(options.requestId)
  if (existing?.isResolved) return existing.toSdkResult()

  // 2. regra — de sessão, de projeto ou "sempre" — resolve sem incomodar ninguém.
  //    Lida a cada pedido, nunca em cache: revogar vale na próxima invocação da sessão já de pé.
  const rule = await permissions.findMatchingRule(userId, sessionId, projectPath, toolName, input)
  if (rule) return rule.toSdkResult()   // publica permission.resolved com auto: true

  // 3. cria o request, publica evento, dispara push, e ESPERA
  const request = await permissions.create({ ...options, toolName, input })
  const decision = await permissions.awaitDecision(request.id, {
    signal: options.signal,                    // SDK pode cancelar
    timeoutMs: config.permission.timeoutMs,    // default 120s
    defaultTo: options.defaultToNo ? 'deny' : 'deny',
  })

  return decision.toSdkResult()
}
```

**`canUseTool` não é chamado para toda tool.** Mesmo com `settingSources: []`, o CLI
auto-aprova tools de baixo risco por classificação própria — no spike, 6 tool calls
produziram 2 pedidos de permissão. Isso está **correto** para aprovação (ninguém quer
autorizar cada `Read`), mas significa que **auditoria não pode se apoiar aqui**. Ver
[a trilha de auditoria](#a-trilha-de-auditoria-é-o-hook-não-o-canusetool).

Quatro pontos que **não** são negociáveis:

1. **Esta função bloqueia o loop do agente.** Enquanto ela não resolve, a sessão está parada.
   Timeout é obrigatório — **e o nosso é o único que existe**: medido, o CLI manteve uma
   permissão pendurada por 150 s sem desistir nem emitir erro
   ([descoberta §8.4](../../discovery/01-descoberta-claude-agent-sdk.md#84--o-cli-não-impõe-timeout-próprio-no-canusetool)).
   Sem o nosso timeout, a sessão fica pendurada indefinidamente.
2. **Idempotência por `requestId`.** Depois de um gap de transporte, `query.reinitialize()`
   reentrega os requests pendentes. Resolver duas vezes = executar a tool duas vezes.
3. **Timeout nega.** `defaultTo: 'deny'`. Silêncio nunca autoriza.
4. **`options.signal`** é respeitado — o SDK cancela o pedido quando a sessão morre.

O retorno é `{ behavior: 'allow' }` ou `{ behavior: 'deny', message }` — **sem**
`updatedPermissions`, e isso é decisão, não omissão
([D-09 do plano 03](../../plans/03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade)).
Uma regra devolvida ao SDK passa a ser aplicada pelo CLI **sem** chamar o `canUseTool`, e o SDK
`0.3.277` não tem como retirá-la de uma sessão viva: revogar deixaria de valer até a próxima
sessão, e a execução autorizada pela regra deixaria de aparecer como `permission.resolved` com
`auto: true`. A regra nossa é a única autoridade; o SDK pergunta, e quem responde é ela.

### A regra fala a gramática do Claude, não uma nossa

A `PermissionRule` que persistimos e o `PermissionUpdate` que devolvemos ao SDK descrevem **o
mesmo conjunto de comandos**, e por isso usam a **mesma gramática** — a das settings do Claude
Code:

| Padrão | Casa |
|---|---|
| `Bash` | toda invocação da tool |
| `Bash(git status)` | `git status`, e só |
| `Bash(git status:*)` | `git status`, `git status --short`, `git status -b` |

Sem glob (`Bash(git *)` liberaria `git push --force`) e sem expressão regular — poder demais
para uma decisão de segurança tomada num toque de celular, e nenhuma UI consegue mostrar o
alcance real de uma regex.

A razão não é só restringir. É que o `ruleContent` guardado é **literalmente** a gramática do
`PermissionUpdate`: hoje ele não é devolvido ao SDK (D-09), mas o dia em que for, é uma linha na
ponte e não uma tradução — e tradução que erra por um caractere faz a nossa metade liberar o que a
do Claude não libera, ou o contrário, que é pior. Duas respostas para a mesma pergunta.

Duas consequências que não são detalhe de implementação:

1. **o padrão é validado na criação da regra**, não no primeiro casamento: fora da gramática é
   `PERMISSION_RULE_PATTERN_INVALID`, e não uma regra que nunca casa nada — ou que casa demais;
2. **o prefixo respeita fronteira de token.** `Bash(git status:*)` não cobre `git statusx`. É o
   furo que passa despercebido num matcher escrito com igualdade de string;
3. **numa linha de shell, a decisão muda a leitura — sempre para o lado seguro**
   ([13 · D-07](../../plans/13-rules-management/decisions.md)). Um `allow` de **prefixo** só cobre
   linha que é um comando só: `Bash(git status:*)` não responde `git status && curl … | sh`, nem
   linha com substituição ou redirecionamento — mesmo entre aspas, porque não há parser, e sem
   parser o único erro seguro é perguntar de novo. O `allow` **exato** continua casando a string
   idêntica, que é o que alguém aprovou. Um `deny` casa se casar **qualquer comando dentro da
   linha** (`Bash(rm:*)` recusa `ls && rm -rf build` e `echo $(rm -rf x)`) — é lombada, não
   sandbox: alias, script e `xargs` passam por ele. A lista de operadores é **uma**, em
   `shell-syntax.ts`, lida pelo matcher e pelo classificador de risco.

O casamento é **regra pura do domínio**, sem I/O: é o que permite testá-lo por fronteira e é
dele que a UI tira o texto de alcance que mostra ao usuário.

---

## A trilha de auditoria é o hook, não o `canUseTool`

**Verificado por spike.** Ver
[descoberta §7.3](../../discovery/01-descoberta-claude-agent-sdk.md#73--canusetool-não-é-chamado-para-toda-tool).

Os dois mecanismos têm papéis diferentes, e confundi-los abre um buraco na auditoria:

| Mecanismo | Cobre | Papel |
|---|---|---|
| `canUseTool` | só o que exige decisão humana | **aprovação** — módulo `permission` |
| Hook `PreToolUse` | **toda** invocação de tool | **auditoria** — módulo `audit` |

Medido na mesma sessão:

```
tool_use emitidos : 6  [Bash, Bash, Read, Read, Bash, Write]
PreToolUse hook   : 6  ← cobertura total
canUseTool        : 2  ← só Bash "perigoso" e Write
```

**Remedido em 2026-09-19, com o gravador de fixtures** (`pnpm fixtures:record`, SDK `0.3.277`),
sobre um prompt diferente:

```
tool_use emitidos : 4  [Read, Bash, Read, Write]
PreToolUse hook   : 4  ← cobertura total
canUseTool        : 1  ← só Write
```

Os **números** dependem do prompt e não se repetem; a **assimetria** se repete, e é ela que a
ADR-011 afirma. A fixture está commitada em `backend/test/fakes/agent-sdk/fixtures/tool-turn.json`
e é o que o fake replica — o dia em que hook e `canUseTool` cobrirem o mesmo conjunto, é esse
arquivo que denuncia.

Ancorar a trilha em `canUseTool` deixaria de fora **toda leitura de arquivo** e todo comando
auto-aprovado. Num sistema que dá acesso ao filesystem do usuário, isso é inaceitável.

```ts
// adapter/outbound/claude/audit-hook.ts
const auditHook: HookCallback = async (input, toolUseId) => {
  await audit.recordToolInvocation({
    sessionId, toolUseId, toolName: input.tool_name, input: input.tool_input, at: clock.now(),
  })
  return { continue: true }
}
```

O hook **registra e deixa passar**; ele não decide. Decisão é do `canUseTool`. Falha de
escrita da auditoria bloqueia a execução — ver [03-modules.md](03-modules.md#audit).

### O hook irmão: `PostToolUse`, para o que resultou

O `PreToolUse` registra a **intenção** — é a trilha. Para tool que escreve em arquivo, um
`PostToolUse` grava o **resultado**: caminho, hash e mtime de como a sessão deixou o arquivo.

Sem isso, o desfazer não tem como distinguir "como a sessão deixou" de "o usuário editou à mão
depois" — e `rewindFiles()` sobrescreve o segundo em silêncio
([§9.5](../../discovery/01-descoberta-claude-agent-sdk.md#95--rewindfiles-sobrescreve-alteração-manual-o-dryrun-não-avisa-e-não-há-filtro-por-arquivo)).
Detalhes em [Desfazer arquivos](#desfazer-arquivos--o-store-é-nosso).

Três diferenças em relação ao hook da trilha, e nenhuma é detalhe:

| | trilha (`PreToolUse`) | estado do arquivo (`PostToolUse`) |
|---|---|---|
| quando | antes da execução | depois, porque o hash só existe então |
| tabela | append-only, imutável | sobrescrita por arquivo — **não** é a tabela da trilha |
| falha ao gravar | **bloqueia** a autorização | não bloqueia: o desfazer fica conservador, e isso é aceitável |

`PostToolUseFailure` **não** atualiza nada: tool que falhou não mexeu no arquivo, e gravar o
hash ali criaria uma linha de base falsa.

Depois de gravar a linha de base, o journal **publica** `session.fileStateRecorded { path, hash, at }`
no barramento interno (`EventEmitter2`). Quem ouve é o `files` (plano 07), que guarda as escritas
recentes do Claude para rotular a origem de uma mudança no disco — sem importar `session`, e sem
que nada do que ele faça alcance o hook: publicar **nunca lança**.

---

## O mapper — a tradução que protege o contrato

`SDKMessage` tem ~38 variantes e o SDK está em `0.3.x`.
[ADR-006](../shared/00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru) proíbe
emitir o tipo cru.

| `SDKMessage` | Nosso evento |
|---|---|
| `system` / `init` | `session.started` |
| `stream_event` | `message.delta` |
| `assistant` (texto) | `message.completed` |
| `assistant` (tool_use) | `tool.started` |
| `tool_progress` | `tool.progress` |
| `user` (tool_result) | `tool.completed` |
| `result` | `turn.completed` (usage, custo, duração) |
| `compact_boundary` | `session.statusChanged` |
| `rate_limit`, `api_retry` | `session.statusChanged` + `warn` no log |
| variante desconhecida | **descarta e loga `warn`** — nunca derruba a sessão |

A última linha é a regra de sobrevivência: variante nova em atualização do SDK vira log, não
crash. O `smoke-live`, [sob demanda](../shared/06-testing-strategy.md), é quem avisa que
apareceu algo novo para mapear.

---

## Ciclo de vida e recursos

**Uma `query()` = um subprocesso do CLI.** N sessões = N processos.

**Custo medido: ~222 MB de RSS e exatamente 1 processo por sessão**, com crescimento linear
(3 sessões = +667 MB). `query.close()` devolveu tudo ao baseline, sem processo órfão. Ver
[descoberta §8.5](../../discovery/01-descoberta-claude-agent-sdk.md#85--custo-de-recurso-por-sessão).

| Regra | Por quê | Como |
|---|---|---|
| Limite de sessões simultâneas **derivado da RAM da máquina**, não fixo → `SESSION_LIMIT_REACHED` | ~222 MB cada; 10 sessões ≈ 2,2 GB | `floor(RAM × fração / MB por sessão)`, entre piso e teto; lido no boot, com o limite do cgroup valendo como RAM (`sessionCapacity`, [05 · D-01](../../plans/05-hardening-operations/decisions.md)) |
| `query.close()` **sempre** no finally, inclusive em erro | processo vazado não morre sozinho | `SessionEnder.release` esquece a entrada aconteça o que acontecer |
| Sessão ociosa além do TTL é encerrada, com `session.closed { reason: 'idleTimeout' }` | libera recurso | 30 min desde o último evento do Claude ou comando do dono; só `idle` conta — esperar permissão **nunca** é ociosidade ([05 · D-02](../../plans/05-hardening-operations/decisions.md)) |
| O shutdown fecha todas as sessões, na ordem | shutdown limpo | `GracefulShutdown` — ver [backend/06](06-realtime.md#shutdown) |
| Sessão órfã (backend reiniciou) é detectada no boot e limpa | processo sobrevive ao pai | o subprocesso nasce com `REMOTE_CLAUDE_OWNER` e `REMOTE_CLAUDE_PARENT_PID` no ambiente; no boot, `OrphanSweep` encerra só o que tem a marca **e** cujo backend morreu — nunca por nome de binário, que mataria o Claude Code do terminal |
| O subprocesso **não herda a configuração do backend** | o `pnpm dev` carrega o `.env` inteiro no processo: um `Bash` do Claude com `env` veria a senha do banco e a do admin do provedor | `claudeEnvironment` tira tudo que é do backend — os prefixos `RC_`, `OIDC_`, `DATABASE_`, `PG` e `NODE_ENV`/`LOG_LEVEL` — e mantém o resto da máquina (`PATH`, `HOME`, proxy, CA, `ANTHROPIC_*`, `CLAUDE_CONFIG_DIR`); um teste confere o filtro contra as chaves do schema **e** do `.env.example`, e o `realQueryFactory` recusa `env` ausente ou com variável do backend ([10 · D-10](../../plans/10-integrated-terminal/decisions.md)) |

O registro de sessões vivas é **em memória** (`Map<SessionId, SessionRunner>`), não no
Postgres — é estado de processo, morre com ele. O Postgres guarda metadado e auditoria.

**Um consumidor só para o `Query`, pela vida toda da sessão.** Sair do `for await` — um
`return` ao receber o `result`, por exemplo — **aborta a query**: a chamada seguinte falha com
`Operation aborted`. O `SessionRunner` consome o stream num laço único e coordena os turnos por
promise; nenhum outro ponto do código itera aquele `Query`. Custou um spike descobrir
([§9.5](../../discovery/01-descoberta-claude-agent-sdk.md#95--rewindfiles-sobrescreve-alteração-manual-o-dryrun-não-avisa-e-não-há-filtro-por-arquivo)).

---

## Reconexão e requests pendentes

**Corrigido após spike.** A versão anterior deste documento mandava chamar
`query.reinitialize()` na reconexão. Isso estava errado, e o erro era de modelo mental:

```
[celular] ──(a rede cai AQUI)── [nosso backend] ──(este canal NÃO cai)── [CLI] ── Claude
                                       │
                                a Promise do canUseTool
                                segue pendente aqui
```

O gap que o produto sofre é entre **o cliente móvel e o nosso backend**. O canal SDK↔CLI é
stdio de um subprocesso local — ele não quebra quando o celular perde rede. A `Promise` do
`canUseTool` continua pendente no nosso processo o tempo todo.

Medido: com uma permissão pendente, `reinitialize()` **não** reinvoca o `canUseTool` — e está
certo, porque não há nada a recuperar. Ver
[descoberta §8.3](../../discovery/01-descoberta-claude-agent-sdk.md#83--reinitialize-não-reentrega-o-pedido-e-não-precisamos-dele).

**O fluxo correto na reconexão:**

1. `session.attach` com `resumeFromSeq` → replay do ring buffer.
2. O módulo `permission` republica, do **seu próprio registro**, os requests ainda pendentes.
3. O cliente responde; a `Promise` original resolve.

`reinitialize()` sai do caminho crítico. Ele serve a uma topologia que não é a nossa (SDK
falando com um CLI remoto). A idempotência por `requestId` continua obrigatória — por causa
de múltiplos clientes e de retry do cliente, não do SDK.

---

## Slash commands (`/init`, gerar README e AGENTS.md)

O requisito de "gerar readme, AGENTS.md" se resolve com os próprios comandos do Claude Code.
`query.supportedCommands()` lista o que a instalação oferece, e a UI monta a partir disso —
**não** mantenha lista hardcoded, ela varia por instalação, por versão e pelos skills
instalados (57 comandos numa medição, **54** na seguinte, com `settingSources: ['project']`).
Cada item traz `name`, `description` e `argumentHint`. Chamar não custa token: abre-se a
`query()` e nunca se cede prompt.

**A lista crua não é apresentável.** Ela inclui comando morto — descrição começando em
`(removed)` ou `Renamed to …` — e interno, de prefixo `__`. O filtro é por **metadado**, nunca
por nome: lista de nomes é a lista hardcoded de volta, e envelhece na próxima versão do CLI.
Ver [descoberta §9.6](../../discovery/01-descoberta-claude-agent-sdk.md#96--supportedcommands-traz-comando-morto-e-interno).

**O cache da lista é chaveado pela versão do binário que o SDK spawna** — não pela do `PATH` —
**e pelo workspace**, porque o `.claude/` de um projeto traz comandos e skills próprios. Uma
máquina com o CLI do `PATH` e o da extensão do VSCode em versões diferentes é o caso comum, não o
exótico; cachear pela versão errada serve o menu de outra instalação.

**De onde vem a versão — medido.** O CLI só diz a própria versão no `system:init`, e esse
`system:init` **não chega antes do primeiro prompt**: uma sessão deixada ociosa por 4 s não emitiu
mensagem nenhuma, enquanto `supportedCommands()` respondeu em ~0,5 s. Como abrir o menu numa sessão
recém-aberta é o caso comum, a versão sai do `manifest.json` do próprio SDK — o arquivo que fixa o
binário que ele spawna, com checksum por plataforma (2.1.277, igual ao que o `system:init` reportou).
Quando o `system:init` chega, a palavra do CLI vale mais, e divergência entre as duas é logada em
`warn`.

**Comando que não existe é recusado antes do Claude.** Um prompt `/nome` cujo `nome` a instalação
não tem — nem como nome, nem como alias, e contando os comandos que o menu esconde — é `INVALID_INPUT`
(`session.error.unknownCommand`). Enviado, o CLI responderia com prosa própria, dentro da conversa.
Lista indisponível não recusa nada: o menu é descoberta, não fronteira. Caminho absoluto não é
comando (`/tmp/x está vazio` para no segundo `/`).

**Confirmado por spike:** enviar `"/init"` como prompt **dispara o comando**. A sessão explora
o projeto com `Bash`/`Read` e escreve o arquivo com `Write`, terminando em `result: success`.
Ver [descoberta §7.1](../../discovery/01-descoberta-claude-agent-sdk.md#71--init-funciona-como-slash-command-pelo-sdk).

Consequência prática: o comando passa pelo fluxo normal de permissão. Gerar um `AGENTS.md`
vai pedir autorização de `Write` — e isso é correto, é escrita no projeto do usuário.

---

## Retomada — fork fora, in-place dentro

`resume` continua a conversa **no mesmo arquivo**. Como o JSONL é compartilhado com o VSCode e
com o terminal, isso significa que pode haver dois escritores no mesmo transcript — e o dano
não é cosmético: a cadeia de `parentUuid` bifurca, `getSessionMessages` reconstrói **uma**
cadeia, e um dos lados desaparece da leitura em silêncio.

**Não há como detectar que uma sessão está aberta no editor.** Os locks de `~/.claude/ide/` são
por instância de IDE, nomeados por PID, e guardam credencial — o backend **não os lê**. Eles não
dizem qual `sessionId` está aberto. Logo, a regra não pode depender de detecção:

| Sessão | Como retomamos | Por quê |
|---|---|---|
| **nossa** (temos linha dela no banco) | `resume` puro | um `sessionId`, um transcript, histórico de undo preservado |
| **externa** (VSCode, terminal) | `resume` + `forkSession: true` | nunca escrevemos no arquivo que outro consumidor pode estar usando |

Em opções do SDK, os três casos (`conversationOptions` na `sdk-options.factory`):

| Conversa | Opções |
|---|---|
| nova | `sessionId: <uuid nosso>` |
| nossa, continuada | `resume: <id>` — sem `sessionId`, que o SDK recusa ao lado de `resume` sem fork |
| começada fora | `resume: <origem>`, `forkSession: true`, `sessionId: <uuid nosso>` — o id do fork é cunhado e gravado como nosso **antes** do `query()`, pela mesma regra da sessão nova |

E três regras de execução, porque um segundo escritor no mesmo arquivo é o defeito que isto tudo
existe para evitar:

- **o que está vivo é juntado.** Retomar uma conversa que já tem sessão viva do mesmo usuário
  responde `session.attached` dessa sessão, sem segundo `query()` (S-24). "Viva" vale pelo id da
  conversa e pelo que ela continua — retomar a do editor duas vezes junta-se ao fork que já roda;
- **duas retomadas simultâneas são uma** (S-25): a segunda espera a primeira e junta-se a ela;
- **a retomada é auditada antes do subprocesso** (S-27), e trilha indisponível não retoma — a
  mesma regra que vale para aprovar.

Duas consequências que a UI precisa dizer, não esconder:

- a continuação de sessão externa vive num **`sessionId` novo**, e o editor não verá as
  respostas dadas do celular. A promessa é editor → celular, e sempre foi só essa;
- **fork não copia o histórico de undo.** Coincide com o limite que o desfazer já tinha — só
  alcança o que aquela sessão tocou —, então nada se perde além do que já não era prometido.

Isso promove a procedência de detalhe de UI a **invariante de correção**: origem errada
significa escrever no transcript de outro consumidor. Ver
[descoberta §9.4](../../discovery/01-descoberta-claude-agent-sdk.md#94--não-há-como-saber-que-uma-sessão-está-aberta-no-editor).

---

## Desfazer arquivos — o store é nosso

"Desfazer" é a rede de segurança que torna aceitável aprovar um `Write` pelo celular. O caminho
óbvio era `rewindFiles()` do SDK, e **ele não serve**. Três fatos, os dois primeiros medidos
contra o Claude real
([§9.5](../../discovery/01-descoberta-claude-agent-sdk.md#95--rewindfiles-sobrescreve-alteração-manual-o-dryrun-não-avisa-e-não-há-filtro-por-arquivo)):

1. **sobrescreve alteração manual, em silêncio.** Arquivo que o usuário editou à mão depois do
   checkpoint volta ao conteúdo do checkpoint, com `canRewind: true` e `skippedLinks: 0`;
2. **`dryRun: true` não denuncia isso** — devolve contagens calculadas contra o checkpoint, e um
   reverte destrutivo parece trivial ali;
3. **não aceita filtro de arquivo.** Uma chamada reverte todos os divergentes do checkpoint.
   "Preservar o que o usuário editou e reverter o resto" não é implementável sobre essa API.

Então o mecanismo é nosso, e do SDK usamos só os hooks:

| Hook | O que guarda |
|---|---|
| `UserPromptSubmit` | abre o checkpoint do turno: `prompt_id` e o texto do prompt, que rotula o ponto de desfazer |
| `PreToolUse` | no primeiro toque do turno num caminho, o **conteúdo anterior** — ou "ausente", para poder apagar o que o turno criou |
| `PostToolUse` | hash e mtime do **resultado**: a linha de base da divergência |
| `PostToolUseFailure` | nada — tool que falhou não mexeu no arquivo |

A chave é `(session_id, prompt_id, path)`. O `prompt_id` vem do `BaseHookInput` em **todo** hook
("UUID correlating a user prompt with all subsequent events until the next prompt"), então o
turno de um snapshot é sabido sem ler o transcript.

Desfazer para um `prompt_id`, então, é voltar ao **momento anterior** àquele turno: para cada
caminho que aquele turno **ou um posterior** tocou — cada um no snapshot do primeiro desses turnos
que o tocou —, comparar o estado atual com o que a sessão deixou por último. Um arquivo que um turno
posterior escreveu também não estava assim naquele momento, e "voltar para antes deste turno" é um
ponto no tempo. O alcance é a sessão viva **e as sessões anteriores da mesma conversa** — uma nossa
continuada in-place —, pela coluna `claude_session_id` do journal; um fork não alcança nada da
origem. Antes de qualquer outra pergunta, o caminho que **já está** como estava no ponto fica como
está: é o que torna o segundo desfazer para o mesmo ponto idempotente —

| Situação | O que fazemos |
|---|---|
| igual ao que a sessão deixou | restaura o snapshot |
| **diferente** — alguém editou depois | **preserva**, e o resultado diz qual arquivo e por quê |
| virou symlink, hard link ou arquivo não regular, ou o pai deixou de resolver | recusa: sem essa checagem, restaurar é caminho para escrever fora do workspace |
| não foi snapshotado (acima do limite de tamanho, ou ilegível) | preserva (`notRestorable`), e a UI não promete o que não pode cumprir |
| nada registra como a sessão o deixou | preserva (`noBaseline`): o desfazer não adivinha |

Mais três regras que o revert próprio obriga:

- **restauração atômica** por arquivo: temporário no mesmo diretório, depois `rename`. Falha no
  meio deixando arquivo truncado é pior que não ter revertido;
- **sob a trava do caminho**, a mesma que o salvar da pessoa pelo editor toma (`PATH_LOCK`, da
  plataforma): restaurar e salvar o mesmo arquivo nunca se intercalam, e o disco termina com uma
  versão inteira — o `ETag` diz qual. A escrita da pessoa é, para o desfazer, **alteração manual**:
  ele a preserva (`modifiedOutside`) — ver [ADR-015](../shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web);
- **resultado parcial é first-class:** o evento carrega revertidos **e** preservados, com motivo
  — não um booleano;
- **não exige sessão viva.** `rewindFiles` era método de `Query`; nosso store não é. "Sessão
  fechada não desfaz" permanece como **política**, não como limitação;
- **o próprio desfazer é escrita da sessão**: depois de restaurar (ou apagar) um caminho, a linha de
  base passa a ser o que o desfazer deixou — sem isso, um segundo desfazer para um ponto anterior
  leria o arquivo restaurado como edição de outra pessoa;
- **fora de `idle` é recusado** com `SESSION_LOCKED`, e dois desfazeres da mesma sessão também: o
  segundo planejaria contra um disco que o primeiro está reescrevendo.

`enableFileCheckpointing: true` continua ligado, porque é o `/rewind` do próprio usuário no
editor. Ele não é mais o nosso mecanismo.

---

## Logging desta borda

Obrigatório, em `debug` — ver [logging](../shared/03-logging.md):

| `op` | Quando | Cuidado |
|---|---|---|
| `claude.input` | prompt enviado à fila | truncar em 2 KB; pode conter segredo |
| `claude.output` | cada `SDKMessage` recebido | logue `type` e `subtype` sempre; payload truncado |
| `claude.permission.request` | `canUseTool` chamado | logue o `input` **inteiro** — é auditoria |
| `claude.permission.resolve` | decisão devolvida | `decision`, `resolvedBy`, `durationMs` |
| `claude.session.lifecycle` | start / close / crash | `exitReason`, `pid` |

Nunca logue conteúdo de arquivo lido pela tool `Read` — só `path` e `bytes`.
