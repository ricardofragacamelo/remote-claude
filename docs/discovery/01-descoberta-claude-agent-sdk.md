# Descoberta — como o backend Node vai falar com o Claude local

Documento de insumo técnico para a definição de arquitetura do **remote-claude**
(backend Node + front web + app Flutter para operar o Claude Code instalado na máquina).

Nada foi implementado. Tudo abaixo foi verificado em 2026-09-13 contra os artefatos reais
listados em [Versões verificadas](#versões-verificadas).

---

## 1. Conclusão principal

O caminho certo é o **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`), que é o
próprio Claude Code empacotado como biblioteca Node. Ele já entrega, pronto:

- loop do agente, tools nativas (Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch), subagents, skills, hooks, MCP;
- **streaming de eventos** — é literalmente um `AsyncGenerator` de mensagens;
- **controle remoto da sessão em tempo real** (interromper, trocar modelo, trocar modo de permissão);
- **aprovação de permissão delegada ao host** — é o gancho que torna o app mobile viável;
- **persistência e retomada de sessão**, compartilhada com as sessões do plugin do VSCode.

Não confundir com dois vizinhos que aparecem na documentação da API:

| Opção | O que é | Serve aqui? |
|---|---|---|
| **Claude Agent SDK** | Claude Code como lib; roda na sua máquina | **Sim** — é o alvo |
| Tool Runner (`client.beta.messages.tool_runner`) | Helper do SDK da API; só as tools que você escrever, sem filesystem | Não |
| Managed Agents | Anthropic hospeda o loop e um sandbox | Não — queremos a máquina local |

A skill `claude-api` do Claude Code cobre só os dois últimos e diz explicitamente que não
gera código de Agent SDK. A referência correta é <https://platform.claude.com/docs/en/agent-sdk/overview>.

### Alternativa descartada (mas boa de conhecer)

Dá para pular o SDK e falar direto com o CLI: `claude -p --output-format stream-json`.
É o que o SDK faz por baixo. Vale só se quisermos controle total do protocolo de wire;
o custo é reimplementar aprovação de permissão, retomada de sessão e os control requests.

---

## 2. Autenticação — o requisito "usar o claude que está instalado"

Não precisa de `ANTHROPIC_API_KEY`. O SDK resolve credencial igual ao Claude Code, e a
máquina já está logada:

```
~/.claude/.credentials.json        # OAuth da conta (modo 600)
~/.claude/projects/<slug-do-path>/ # transcripts .jsonl por workspace
```

Consequência direta para a arquitetura: **o backend roda como o usuário `ricardocamelo`
e herda o login**. Ele não repassa nem precisa conhecer a credencial.

Isso desloca todo o problema de segurança para a borda: quem chega no backend pela rede
está, na prática, com shell na máquina via tool `Bash`. Ver [§6](#6-decisões-em-aberto).

### Qual binário roda

O pacote instala junto um CLI próprio (`@anthropic-ai/claude-agent-sdk-linux-x64`),
independente do `claude` 2.1.226 que já está no PATH. A opção
`pathToClaudeCodeExecutable` força usar o binário instalado. Decisão a tomar: fixar no
binário do SDK (versões casadas, atualiza com o npm) ou seguir o CLI da máquina
(mesma versão do VSCode, mas pode dessincronizar do SDK).

---

## 3. Superfície da API que importa

### 3.1 Entrada — `query()`

```ts
function query(params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: Options
}): Query
```

O `prompt` como `AsyncIterable` é o **streaming input mode**, e é obrigatório para o nosso
caso: só nele funcionam os control requests (interrupt, setModel, setPermissionMode...).
Na prática cada sessão vira uma fila async que o backend alimenta conforme chegam
mensagens do web/mobile.

`Query` é um `AsyncGenerator<SDKMessage, void>` — o laço `for await` é a fonte do stream
que replicamos para os clientes.

### 3.2 `Options` — os campos relevantes

Workspace e escopo:

| Campo | Uso aqui |
|---|---|
| `cwd` | **o "workspace"**: diretório raiz da sessão |
| `additionalDirectories` | diretórios extras liberados fora do `cwd` |
| `settingSources` | de onde ler settings (`user`/`project`/`local`) — controla se o `CLAUDE.md` do projeto entra |
| `env`, `pathToClaudeCodeExecutable`, `executable` | como o subprocesso sobe |

Permissão:

| Campo | Uso aqui |
|---|---|
| `canUseTool` | callback de aprovação — **o coração do fluxo mobile** |
| `permissionMode` | `default \| acceptEdits \| bypassPermissions \| plan \| dontAsk \| auto` |
| `permissionPrompts` | `'host' \| 'none'` |
| `allowedTools` / `disallowedTools` | allow/deny list estática |
| `allowDangerouslySkipPermissions` | precisa de decisão explícita nossa |

Sessão:

| Campo | Uso aqui |
|---|---|
| `resume`, `sessionId`, `forkSession`, `continue` | retomar / bifurcar conversas |
| `persistSession`, `sessionStore` | persistir no JSONL local ou num store custom |
| `enableFileCheckpointing` | habilita `rewindFiles()` (desfazer alterações) |

Stream e modelo:

| Campo | Uso aqui |
|---|---|
| `includePartialMessages` | deltas token-a-token — necessário pra UI fluida |
| `includeHookEvents`, `forwardSubagentText` | granularidade extra do stream |
| `model`, `fallbackModel`, `thinking`, `effort` | controle de modelo |
| `maxTurns`, `maxBudgetUsd`, `taskBudget` | limites de custo por sessão |
| `agents`, `skills`, `plugins`, `mcpServers`, `hooks` | extensões |

### 3.3 Controle em tempo real — métodos de `Query`

Só em streaming input mode. Os que mudam o desenho do produto:

```ts
interrupt()                          // parar a execução
setPermissionMode(mode)              // trocar modo no meio da sessão
setModel(model?)                     // trocar modelo no meio da sessão
supportedCommands()                  // lista os slash commands (/init, /code-review, ...)
supportedModels() / supportedAgents()
getContextUsage({detail})            // uso da janela de contexto por categoria
initializationResult() / reinitialize()
readFile(path, {maxBytes, encoding}) // leitura de arquivo já sujeita às regras de permissão
rewindFiles(userMessageId, {dryRun}) // desfazer alterações até uma mensagem
backgroundTasks(toolUseId?)          // jogar Bash/subagent pro background
stopTask(taskId)
mcpServerStatus() / setMcpServers() / reconnectMcpServer()
close()
```

Dois merecem destaque para a arquitetura:

- **`reinitialize()`** — feito sob medida para reconexão. Depois de um gap de transporte
  (mobile perdeu rede, backend reiniciou o socket), ele reentrega os `can_use_tool`
  pendentes em que o loop ainda está travado. Isso resolve o pior caso do fluxo mobile:
  a permissão que ficou órfã. A doc avisa que os callbacks precisam ser **idempotentes por
  `request_id`**.
- **`readFile()`** — dá um visualizador de arquivos no cliente sem furar o modelo de
  permissão, porque passa pelas mesmas regras da tool Read.

### 3.4 Saída — `SDKMessage`

É uma união de **~38 variantes**. As principais:

- `assistant` / `user` / `user_replay` — turnos da conversa
- `stream_event` (`SDKPartialAssistantMessage`) — deltas do streaming
- `result` — fim do turno, com custo e uso
- `system` (init, compact boundary, background tasks changed, ...)
- `tool_progress`, `tool_use_summary`, `task_*` — progresso de tools e subagents
- `hook_started` / `hook_progress` / `hook_response`
- `status`, `api_retry`, `rate_limit`, `permission_denied`, `notification`

Decisão de arquitetura aqui: **o protocolo de wire para web/mobile não deveria ser o
`SDKMessage` cru**. São variantes demais, muitas irrelevantes para a UI, e acoplaria os
dois clientes a um tipo instável do SDK. Vale uma camada de normalização no backend com
um union enxuto e versionado.

### 3.5 Aprovação de permissão — o fluxo que viabiliza o mobile

```ts
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal
    requestId: string
    toolUseID: string
    suggestions?: PermissionUpdate[]   // regras sugeridas p/ "sempre permitir"
    title?: string
    description?: string
    displayName?: string
    defaultToNo?: boolean
    blockedPath?: string
    decisionReason?: string
    agentID?: string
    matchedAskRule?: { source: string; toolName: string; ruleContent?: string }
  },
) => Promise<PermissionResult | null>

type PermissionResult =
  | { behavior: 'allow'; updatedInput?: ...; updatedPermissions?: PermissionUpdate[] }
  | { behavior: 'deny'; message: string; interrupt?: boolean }
```

Ou seja: o backend recebe "o Claude quer rodar `rm -rf build/`", empurra isso para o
celular/web como notificação, **espera a resposta humana**, e devolve allow/deny. O
`updatedPermissions` permite o "sempre permitir isso neste projeto" persistir como regra
(`PermissionUpdate` com destino `session` / `localSettings` / `projectSettings` / `userSettings`).

O `signal` e o `defaultToNo` dão o comportamento de timeout: se ninguém responder, nega.

### 3.6 Sessões — funções de módulo (fora da `query`)

```ts
listSessions(opts?)                    // → SDKSessionInfo[]
getSessionInfo(sessionId, opts?)
getSessionMessages(sessionId, opts?)   // → histórico p/ hidratar a UI
getSubagentMessages(sessionId, agentId, opts?)
listSubagents(sessionId, opts?)
forkSession(sessionId, opts?)
renameSession(sessionId, title, opts?)
deleteSession(sessionId, opts?)
importSessionToStore(sessionId, store, opts?)
```

`SDKSessionInfo` traz `sessionId`, `summary`, `customTitle`, `firstPrompt`, `cwd`,
`gitBranch`, `lastModified`, `createdAt`, `fileSize`.

Consequência interessante: essas funções leem o mesmo `~/.claude/projects/`. **O backend
enxerga e retoma as sessões criadas no VSCode**, e vice-versa. Isso pode ser um recurso
("continuar no celular o que comecei no VSCode") ou uma armadilha (duas sessões escrevendo
no mesmo workspace ao mesmo tempo).

---

## 4. Mapeamento requisito → recurso

| Requisito | Como se resolve | Confiança |
|---|---|---|
| Escolher um workspace (diretório raiz) | `options.cwd` + `additionalDirectories` | verificado nos tipos |
| Executar prompts como no VSCode | streaming input mode + `for await` do `Query` | verificado |
| Dois canais (web + mobile) interagindo | fan-out do stream no backend; SDK não faz multiplexação | decisão nossa |
| Gerar README / AGENTS.md | mandar `/init` como prompt — **confirmado por spike**, ver §7 | verificado |
| Aprovar ações de fora da máquina | `canUseTool` + push | verificado nos tipos |
| Retomar conversa | `resume` / `listSessions` / `getSessionMessages` | verificado |
| Interromper execução | `query.interrupt()` | verificado |
| Ver custo/uso | mensagem `result` + `getContextUsage()` | verificado |

O item de slash commands estava pendente e foi **resolvido por spike** — junto com dois
achados que mudaram o desenho da arquitetura. Ver [§7](#7--resultados-do-spike-2026-09-13).

---

## 5. Restrições operacionais

- **Node >= 18** (`engines`). A máquina está em v24.16.0.
- **Uma `query()` = um subprocesso do CLI.** N sessões simultâneas = N processos. Precisa de
  um pool/limite e de ciclo de vida explícito (`close()`), senão vazam processos.
- **`SDKMessage` é um alvo móvel** — 38 variantes hoje, e o SDK está em `0.3.x` (pré-1.0,
  quebra sem cerimônia). Reforça a camada de normalização do §3.4.
- **Credencial é OAuth de conta, não API key** — sujeita a rate limits de plano
  (`usage_EXPERIMENTAL_...` expõe as janelas de 5h/7d, mas é API instável e explicitamente
  marcada como "não dependa disso ainda").
- O SDK tem também um `browser-sdk.d.ts` e um `bridge.d.ts` que não foram investigados;
  podem ser relevantes se em algum momento o front quiser falar direto.

---

## 6. Decisões em aberto

Levantadas pela descoberta, para você decidir na arquitetura:

1. **Segurança da borda.** O backend expõe execução de comando arbitrário na máquina.
   Escopo de exposição (só LAN? tailscale? internet com TLS?), autenticação, e se existe
   um modo "read-only" são decisões que moldam tudo o mais.
2. **Protocolo de wire.** `SDKMessage` cru vs. union normalizado e versionado. Afeta
   diretamente o acoplamento do Flutter.
3. **Transporte.** WebSocket bidirecional vs. SSE + POST. O `canUseTool` precisa de
   round-trip servidor→cliente→servidor, o que pesa a favor de WS.
4. **Reconexão e replay.** Buffer de eventos por sessão, e uso do `reinitialize()` para
   recuperar permissões órfãs. Precisa de idempotência por `request_id`.
5. **Fan-out multi-cliente.** Web e mobile na mesma sessão ao mesmo tempo: ambos veem o
   stream, mas quem pode aprovar permissão? Quem pode mandar prompt?
6. **Binário do CLI.** Bundled do SDK vs. `claude` da máquina (`pathToClaudeCodeExecutable`).
7. **Convivência com o VSCode.** Compartilhar `~/.claude/projects/` é feature ou conflito?
8. **Modo de permissão padrão.** `default` (pergunta tudo) é seguro mas insuportável no
   celular; `bypassPermissions` é o oposto. `acceptEdits` e `auto` são os meios-termos.
9. **Limites de custo.** `maxBudgetUsd` / `maxTurns` / `taskBudget` por sessão.


---

## 7 — Resultados do spike (2026-09-13)

Três execuções reais contra o Claude local, com `cwd` apontado para projetos descartáveis no
scratchpad. Custo total ≈ US$ 0,91.

### 7.1 — `/init` funciona como slash command pelo SDK

✅ **Resolvido.**

**A pergunta:** mandar `"/init"` como prompt dispara o comando, ou vira texto comum para o
modelo?

**Resultado:** dispara o comando. A sessão executou `Bash` e `Read` para explorar o projeto e
`Write` para criar o `CLAUDE.md`, terminando com `result: success` em 6 turnos.

```
[TOOL] Bash · Bash · Read · Read · Bash · Write
[RESULT] subtype=success turns=7
```

O `system:init` também expõe `slash_commands` (57 na instalação atual), o que confirma
`supportedCommands()` como fonte para montar a UI.

**Conclusão:** o requisito "gerar readme, AGENTS.md" se resolve mandando o comando como
prompt. Sem bloqueio.

### 7.2 — As settings do usuário furam o `canUseTool`

⚠️ **O achado mais importante do spike.** Na primeira execução, com `permissionMode: 'default'`
e um `canUseTool` instalado, o resultado foi:

```
tools usadas:      Bash, Write
permission asks:   0        ← canUseTool NUNCA foi chamado
```

`Bash` e `Write` executaram sem passar pelo nosso handler. A causa está em
`~/.claude/settings.json` da máquina:

```jsonc
{ "permissions": { "allow": ["Bash(*)", "Edit", "Write", "NotebookEdit", …] } }
```

Quando `settingSources` é **omitido**, o SDK carrega as settings de `user`, `project` e
`local` — e uma regra `allow` ali auto-aprova a tool **antes** de o `canUseTool` ser
consultado. A doc do tipo confirma: *"When omitted, all sources are loaded (matches CLI
defaults). Pass `[]` to skip user/project/local sources."*

**Por que isso é grave:** todo o produto se apoia em `canUseTool` como ponto de aprovação
humana. Um arquivo de configuração na máquina — que o usuário pode ter escrito meses antes,
para o uso dele no terminal — desliga isso em silêncio. Não há erro, não há aviso.

**Mitigação, validada na segunda execução:** com `settingSources: []`, o `canUseTool` volta a
ser chamado.

```
permission asks: 2   ← Bash e Write pediram autorização
```

`settingSources: []` passa a ser **obrigatório** na fábrica de `Options`. A consequência a
aceitar: a sessão deixa de herdar as permissões e settings pessoais do usuário — que é
exatamente o comportamento que queremos, já que quem decide passa a ser o nosso módulo
`permission`.

### 7.3 — `canUseTool` não é chamado para toda tool

⚠️ Mesmo com `settingSources: []`, a contagem não fecha: **6 tool calls, 2 pedidos de
permissão**. O CLI auto-aprova, por classificação própria, tools de baixo risco (leitura,
comando shell inócuo).

A terceira execução comparou os três pontos de observação, na mesma sessão:

```
tool_use emitidos : 6  [Bash, Bash, Read, Read, Bash, Write]
PreToolUse hook   : 6  [Bash, Bash, Read, Read, Bash, Write]   ← cobertura total
canUseTool        : 2  [Bash, Write]                            ← só o que precisa de humano
```

**Conclusão para a arquitetura:** os dois mecanismos têm papéis diferentes, e confundi-los
abre um buraco na auditoria.

| Mecanismo | Cobre | Serve para |
|---|---|---|
| `canUseTool` | só o que exige decisão humana | **aprovação** — o fluxo de permissão |
| Hook `PreToolUse` | **toda** invocação de tool | **auditoria** — a trilha do que executou |

Construir a trilha de auditoria sobre `canUseTool` deixaria de fora toda leitura de arquivo e
todo comando auto-aprovado. A auditoria precisa ser ancorada no hook `PreToolUse`.

### Como reproduzir

Os scripts ficaram em `scratchpad/sdkprobe/`: `spike-init.mjs`, `spike-init-isolated.mjs`,
`spike-hooks.mjs`. Todos usam streaming input mode, como será em produção.

---

## Versões verificadas

| Item | Versão |
|---|---|
| `@anthropic-ai/claude-agent-sdk` | 0.3.270 |
| Claude Code CLI (PATH) | 2.1.226 |
| Node | v24.16.0 |
| npm | 11.13.0 |
| Flutter / Dart | presentes em `~/middleware/flutter/flutter/bin` |
| Data da descoberta | 2026-09-13 |

Fontes: `sdk.d.ts` (9221 linhas) e `README.md` do pacote, inspecionados localmente.
Doc oficial: <https://platform.claude.com/docs/en/agent-sdk/overview>
