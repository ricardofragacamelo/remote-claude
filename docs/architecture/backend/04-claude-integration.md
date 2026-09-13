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
  settingSources: [],                     // ← OBRIGATÓRIO. Ver abaixo.
  permissionMode: session.permissionMode,
  canUseTool: permissionBridge.handle,    // ← aprovação humana
  hooks: { PreToolUse: [auditHook] },     // ← trilha de auditoria (cobertura total)
  includePartialMessages: true,           // deltas para UI fluida
  includeHookEvents: true,
  model: session.model,
  maxBudgetUsd: config.session.maxBudgetUsd,
  maxTurns: config.session.maxTurns,
  resume: session.resumeFrom,
  persistSession: true,                   // mantém o JSONL, compartilhado com o VSCode
  enableFileCheckpointing: true,          // habilita rewindFiles()
  abortController,
}
```

Decisões tomadas:

| Opção | Escolha | Por quê |
|---|---|---|
| `includePartialMessages` | `true` | sem deltas a UI trava em "pensando…" por minutos |
| `persistSession` | `true` | retomar do celular o que começou no VSCode |
| `enableFileCheckpointing` | `true` | "desfazer" é rede de segurança quando se aprova de longe |
| `allowDangerouslySkipPermissions` | **`false`, sempre** | desligaria o `canUseTool`, que é o produto |
| `settingSources` | **`[]`, sempre** | ver [A armadilha do `settingSources`](#a-armadilha-do-settingsources) |
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

Isso desliga, em silêncio, o mecanismo sobre o qual o produto inteiro se apoia. Por isso
`settingSources: []` é obrigatório e **não é configurável**.

A contrapartida, que é desejável: a sessão deixa de herdar as preferências pessoais do
usuário. Quem decide permissão passa a ser exclusivamente o módulo `permission`.

> Existe uma regra de `semgrep` que reprova `query()` sem `settingSources: []`. Ver
> [qualidade](../shared/09-code-quality.md#segurança-estática).

---

## A ponte de permissão

```ts
// permission-bridge.ts
const canUseTool: CanUseTool = async (toolName, input, options) => {
  // 1. idempotência — o SDK reentrega após gap de transporte
  const existing = await permissions.findByRequestId(options.requestId)
  if (existing?.isResolved) return existing.toSdkResult()

  // 2. regra persistida resolve sem incomodar ninguém
  const rule = await permissions.findMatchingRule(sessionId, toolName, input)
  if (rule) return rule.toSdkResult()

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
   Timeout é obrigatório — sem ele, uma sessão fica pendurada para sempre.
2. **Idempotência por `requestId`.** Depois de um gap de transporte, `query.reinitialize()`
   reentrega os requests pendentes. Resolver duas vezes = executar a tool duas vezes.
3. **Timeout nega.** `defaultTo: 'deny'`. Silêncio nunca autoriza.
4. **`options.signal`** é respeitado — o SDK cancela o pedido quando a sessão morre.

O retorno é `{ behavior: 'allow', updatedPermissions? }` ou `{ behavior: 'deny', message }`.
`updatedPermissions` é como o "sempre permitir" vira regra do lado do Claude.

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
crash. O `smoke-live` do [nightly](../shared/06-testing-strategy.md) é quem avisa que
apareceu algo novo para mapear.

---

## Ciclo de vida e recursos

**Uma `query()` = um subprocesso do CLI.** N sessões = N processos.

| Regra | Por quê |
|---|---|
| Limite de sessões simultâneas (config) → `SESSION_LIMIT_REACHED` | cada uma é um processo real |
| `query.close()` **sempre** no finally, inclusive em erro | processo vazado não morre sozinho |
| Sessão ociosa além do TTL é encerrada, com evento `session.closed` | libera recurso |
| `onModuleDestroy` fecha todas as sessões | shutdown limpo |
| Sessão órfã (backend reiniciou) é detectada no boot e limpa | processo sobrevive ao pai |

O registro de sessões vivas é **em memória** (`Map<SessionId, SessionRunner>`), não no
Postgres — é estado de processo, morre com ele. O Postgres guarda metadado e auditoria.

---

## Reconexão e requests órfãos

Quando um cliente reata depois de um gap:

1. `session.attach` com `resumeFromSeq` → replay do ring buffer.
2. O backend chama **`query.reinitialize()`**, que reentrega os `canUseTool` em que o loop
   ainda está travado.
3. O bridge deduplica por `requestId` e republica `permission.requested` para as connections.

Sem o passo 2, uma permissão pedida durante a queda fica órfã e a sessão trava para sempre.
Ver [descoberta §3.3](../../discovery/01-descoberta-claude-agent-sdk.md).

---

## Slash commands (`/init`, gerar README e AGENTS.md)

O requisito de "gerar readme, AGENTS.md" se resolve com os próprios comandos do Claude Code.
`query.supportedCommands()` lista o que a instalação oferece, e a UI monta a partir disso —
**não** mantenha lista hardcoded, ela varia por instalação e por versão (57 comandos na
instalação atual, 54 com `settingSources: []`).

**Confirmado por spike:** enviar `"/init"` como prompt **dispara o comando**. A sessão explora
o projeto com `Bash`/`Read` e escreve o arquivo com `Write`, terminando em `result: success`.
Ver [descoberta §7.1](../../discovery/01-descoberta-claude-agent-sdk.md#71--init-funciona-como-slash-command-pelo-sdk).

Consequência prática: o comando passa pelo fluxo normal de permissão. Gerar um `AGENTS.md`
vai pedir autorização de `Write` — e isso é correto, é escrita no projeto do usuário.

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
