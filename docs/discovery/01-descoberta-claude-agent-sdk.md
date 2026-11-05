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

## 8 — Segunda rodada de spikes (2026-09-13)

Investigação das premissas que tinham ficado assumidas. Duas delas estavam **erradas** e
mudaram a arquitetura.

### 8.1 — `settingSources: []` desliga o `CLAUDE.md` do projeto

A decisão da rodada anterior (§7.2) foi correta quanto ao risco, mas larga demais. Medido,
escopo por escopo, num projeto com `CLAUDE.md` contendo uma instrução verificável:

| `settingSources` | `canUseTool` respeitado | `CLAUDE.md` do projeto |
|---|---|---|
| omitido (default) | ❌ pulado | ✅ carregado |
| `['user']` | ❌ pulado | ❌ ignorado |
| **`['project']`** | **✅ chamado** | **✅ carregado** |
| `['local']` | ✅ chamado | ❌ ignorado |
| `[]` | ✅ chamado | ❌ ignorado |

**`['project']` é a configuração correta**: preserva a aprovação humana **e** carrega o
contexto do projeto. Com `[]`, as sessões do remote-claude ignorariam as instruções que o
usuário escreveu para o próprio repositório — ficariam mensuravelmente piores que as do
VSCode, no mesmo projeto, sem que ninguém tivesse decidido isso.

**O que `user` traz junto, e por isso fica de fora:** os plugins e skills pessoais (57 → 54
slash commands; sumiram `jar-explorer:*` e `skill-architect`) e — o ponto crítico — as regras
`permissions.allow` de `~/.claude/settings.json`.

### 8.2 — A assimetria `allow` vs `deny` entre escopos

Detalhe de segurança que só apareceu ao testar os escopos separadamente:

| Origem da regra | `allow` | `deny` |
|---|---|---|
| `user` (`~/.claude/settings.json`) | **aplicado** — fura o `canUseTool` | aplicado |
| `project` (`.claude/settings.json` do repo) | **ignorado** | **aplicado** |

Medido: com `deny: ["Write"]` no projeto e `settingSources: ['project']`, a tool `Write`
ficou indisponível — o modelo recorreu a `ToolSearch` e `Bash` para contornar. Já o
`allow: ["Write"]` do projeto **não** dispensou o `canUseTool`.

Faz sentido como desenho de segurança: honrar `deny` de um repositório de terceiro é seguro
(só restringe); honrar `allow` não é.

> **Incerteza resolvida em 2026-09-18, e a resposta é a ruim.** Os diretórios desta medição não
> constavam como confiados (`hasTrustDialogAccepted`). A [B-45](../plans/01-live-session/F0-contract.md)
> repetiu o teste num diretório **confiado**, sobre um `CLAUDE_CONFIG_DIR` isolado: o `allow` de
> projeto passa a ser aplicado e o `canUseTool` **não é chamado**. A tabela acima vale apenas para
> diretório não confiado. O detalhe da medição está em
> [04a-claude](../architecture/backend/04a-claude.md#diretório-confiado-fura-o-canusetool--medido).

### 8.3 — `reinitialize()` não reentrega o pedido, e não precisamos dele

A premissa mais crítica da arquitetura de reconexão estava **errada**.

Medido: permissão pendente, `canUseTool` travado, `reinitialize()` chamado 10 s depois.
Resultado: `reinitialize()` retornou com sucesso e o `canUseTool` **não foi invocado de
novo** — uma única invocação na sessão inteira.

E está correto que não tenha sido. O erro foi meu, no modelo mental:

```
[celular] ──(rede cai aqui)── [nosso backend] ──(este canal NÃO cai)── [CLI] ── Claude
                                     │
                              a Promise do canUseTool
                              continua pendente aqui
```

O gap que o produto sofre é entre **o cliente móvel e o nosso backend**. O canal
SDK↔CLI é stdio de um subprocesso local: ele **não quebra** quando o celular perde rede. A
`Promise` do `canUseTool` fica pendente no nosso processo o tempo todo, e o próprio SDK
deduplica requests em voo — por isso não reentrega: não há nada a recuperar.

**Consequência:** a reentrega de permissão órfã é responsabilidade do **nosso** módulo
`permission`, que já mantém o registro de pendentes e republica no `session.attach`.
`reinitialize()` só seria relevante numa topologia em que o SDK fala com um CLI remoto — que
não é a nossa. Ele sai do caminho crítico.

### 8.4 — O CLI não impõe timeout próprio no `canUseTool`

Permissão mantida pendurada por **150 s** sem resposta: o CLI não desistiu, não cancelou e
não emitiu erro. Ao liberar, a sessão seguiu e terminou em `result: success`.

**Consequência:** o timeout de 120 s do módulo `permission` é o **único** que existe, e é
autoritativo. Sem ele, uma sessão fica pendurada indefinidamente. Confirma o desenho.

### 8.5 — Custo de recurso por sessão

Três sessões simultâneas, medindo RSS dos subprocessos:

| Sessões | Processos | RSS adicional |
|---|---|---|
| 1 | +1 | +237 MB |
| 2 | +2 | +475 MB |
| 3 | +3 | +667 MB |

**~222 MB e exatamente 1 processo por sessão**, crescimento linear. `query.close()` devolveu
tudo ao baseline — sem processo órfão.

Número concreto para o limite de sessões simultâneas: 10 sessões ≈ **2,2 GB**. O limite deve
ser configurável e derivado da RAM da máquina, não um número fixo.

### 8.6 — Segundo prompt durante um turno é enfileirado pelo SDK

> **Revisto em 2026-10-01** ([§10.4](#104--prompt-no-meio-do-turno-é-fundido-ao-turno-em-curso-d-14-revê-86)):
> no SDK 0.3.277 o prompt entregue no meio do turno é **fundido** a ele. A fila passou ao backend.

Medido: prompt enviado 1,5 s após o primeiro, com o turno em execução. O `push` foi aceito
sem erro, e o resultado foram **dois turnos sequenciais** (`RESULT #1`, depois `RESULT #2`),
cada um com sua resposta correta.

**Consequência:** a regra "um turno por vez → `409`" é **política nossa**, não limitação do
SDK. E é provavelmente a política errada: o enfileiramento nativo é exatamente o
comportamento da UI do Claude Code — o usuário digita um complemento enquanto o Claude
trabalha, e ele roda em seguida. Rejeitar com `409` entrega uma experiência pior do que a
que vem de graça.

### Como reproduzir

Scripts em `scratchpad/sdkprobe/`: `inv-settings.mjs`, `inv-claudemd.mjs`, `inv-scopes.mjs`,
`inv-deny.mjs`, `inv-reinit.mjs`, `inv-mem.mjs`, `inv-concurrent.mjs`.

---

## 9 — Terceira rodada de spikes (2026-09-16)

Feita para fechar as decisões do [plano 04](../plans/04-transcript-and-resume/decisions.md).
Quatro dos sete gaps eram **mensuráveis nesta máquina** e não precisavam de opinião. Só o
§9.5 gastou token; o resto é leitura local.

### 9.1 — O store real de sessões

`~/.claude/projects/`, medido inteiro:

| | |
|---|---|
| workspaces | 22 |
| sessões | 298 |
| tamanho total | 668 MB |
| sessões por workspace | p50 = **1**, máx = **154** |
| linhas por sessão | p50 = 333, p90 = 1698, p99 = 3353, máx = 5099 |
| bytes por sessão | p50 = 1,0 MB, p90 = 4,3 MB, máx = 12,7 MB |
| sessões sem `cwd` | **55** — 18 % |

O store tem transcript de projeto de cliente. É o argumento que fechou o
[D-01](../plans/04-transcript-and-resume/decisions.md#d-01--o-que-aparece-de-fora): o que a
allowlist cerca para executar, ela cerca para ler.

### 9.2 — `limit`/`offset` não reduzem o trabalho do servidor

Na maior sessão do store (12,7 MB, 5099 linhas):

| chamada | tempo | heap |
|---|---|---|
| `getSessionMessages` sem limite | 66 ms | ~30 MB |
| `limit: 1` | 47 ms | ~29 MB |
| `limit: 50, offset: 0` | 63 ms | ~30 MB |
| `limit: 50` na cauda | 44 ms | ~29 MB |
| `offset` além do fim | 37 ms | devolve `[]` |
| id inexistente | 2 ms | devolve `[]` |

**O parse do JSONL é integral em toda chamada** — o SDK reconstrói a cadeia de `parentUuid`
antes de cortar a fatia. Consequência de arquitetura: **paginação protege o cliente, não o
servidor.** Quem protege o servidor é cache — e o `lastModified` do `listSessions` é a chave de
invalidação pronta — mais limite de leituras concorrentes.

Dois detalhes que valem contrato:

- as 5099 linhas viram **803 mensagens**: ~16,5 KB por mensagem, porque o payload carrega input
  e output de tool. Página de 50 seria ~800 KB no celular;
- `offset` conta **mensagens**, não linhas (verificado), e a mesma página pedida duas vezes
  devolve o mesmo conteúdo;
- **`[]` não distingue "vazia" de "não existe".** Quem distingue é `getSessionInfo`, que devolve
  `undefined`.

### 9.3 — `SDKSessionInfo` não tem origem

Os campos são `sessionId`, `summary`, `lastModified`, `fileSize`, `customTitle`, `firstPrompt`,
`gitBranch`, `cwd`, `tag`, `createdAt`. **Nenhum diz de onde a sessão veio.**

E `includeProgrammatic: false` devolveu as **mesmas 298** sessões, então nem o diff entre as
duas listas separa o que é nosso do que é do editor. Quem quiser rotular a origem tira isso do
**próprio banco** — é nossa se temos linha dela. Por isso o rótulo honesto é "externa", e não
"VSCode": pode ter vindo do terminal.

Custo da listagem: `listSessions({})` = **281 ms** para 298 sessões; `listSessions({ dir })` =
**21 ms**. A ordem default é `lastModified` descendente, e `limit`/`offset` são uma janela
estável sobre ela — mas a ordem **muda sob escrita concorrente**, o que apareceu dentro do
próprio probe, em menos de um segundo. Offset cru pula e duplica linha; cursor sobre
`(lastModified, sessionId)` não.

`includeWorktrees` é `true` por padrão, então `listSessions({ dir })` pode devolver sessão cujo
`cwd` está fora do `dir` pedido. Filtro confiável é sobre o `cwd` devolvido.

### 9.4 — Não há como saber que uma sessão está aberta no editor

Os locks ficam em `~/.claude/ide/`, **um por instância de IDE**, nomeados por PID, e guardam
credencial — nosso backend não deveria lê-los. Eles não dizem qual `sessionId` está aberto.
Havia 7 processos do Claude da extensão do VSCode rodando durante a medição, e nenhum caminho
suportado ligando processo a sessão.

Logo, "recusar retomada se a sessão estiver aberta no editor" **não é implementável**. O que o
SDK oferece no lugar é `resume` + `forkSession: true`: continua a conversa num `sessionId` novo,
sem nunca escrever no arquivo que o outro consumidor pode estar usando. `forkSession` copia o
transcript remapeando os UUIDs, e **não** copia o histórico de undo.

O risco que o fork elimina não é cosmético: dois escritores no mesmo JSONL bifurcam a cadeia de
`parentUuid`, e `getSessionMessages` reconstrói **uma** cadeia — um dos lados desaparece da
leitura, em silêncio. Base do
[D-04](../plans/04-transcript-and-resume/decisions.md#d-04--duas-bocas-no-mesmo-arquivo).

### 9.5 — `rewindFiles()` sobrescreve alteração manual, o `dryRun` não avisa, e não há filtro por arquivo

Único spike pago desta rodada (≈ US$ 0,21, três execuções — duas morreram em erro do script).
Sessão real com `enableFileCheckpointing: true`, `cwd` num repositório descartável:

```text
turno 1: a sessão escreve  a.txt = "ONE"   e  b.txt = "BEE"
turno 2: a sessão altera   a.txt = "TWO"
à mão:                     a.txt = "EXTERNAL EDIT BY THE USER"
à mão:                     c.txt, que a sessão nunca tocou

rewindFiles(prompt do turno 2, { dryRun: true })
  → { canRewind: true, filesChanged: ["a.txt"], insertions: 1, deletions: 1 }
rewindFiles(prompt do turno 2)
  → { canRewind: true, skippedLinks: 0 }

depois: a.txt = "ONE"      b.txt = "BEE"      c.txt intacto
```

**Sobrescreve em silêncio**, e o `dryRun` **não denuncia**: ele reporta um reverte de uma linha,
de aparência trivial, porque as contagens são calculadas contra o checkpoint e não têm como
saber que o conteúdo atual foi escrito pelo usuário. Confirmação construída só sobre o `dryRun`
é tranquilizadora e destrutiva — é o
[D-06](../plans/04-transcript-and-resume/decisions.md#d-06--desfazer-sem-destruir).

O store de backup é `~/.claude/file-history/<sessionId>/<hash>@v1`: **conteúdo puro**, sem
metadado do arquivo vivo. Então o CLI só sabe "difere ou não", nunca "quem alterou" — e quem
quiser a distinção grava hash e mtime por conta própria, no hook `PostToolUse`.

Mais quatro achados do mesmo spike:

- **o alvo do rewind é mensagem de _prompt_.** No transcript, `tool_result` também tem
  `type: 'user'`; apontar para um deles devolve `"No file checkpoint found for this message."`;
- **as duas formas de erro são diferentes:** com alvo inválido, o `dryRun` **devolve**
  `{ canRewind: false, error }` e a chamada real **lança**, com
  `errorClass: 'control_request_failed'`;
- o alcance é do checkpoint escolhido, não da sessão toda: `b.txt`, escrito no turno 1, não
  voltou;
- **rewind repetido é idempotente**: a segunda chamada idêntica devolve `canRewind: true` e não
  muda o disco. E arquivo que a sessão nunca tocou não é alcançado.

E o que a assinatura não oferece, e decidiu o desenho: **`rewindFiles(userMessageId, { dryRun })`
não aceita filtro de arquivo.** Uma chamada reverte **todos** os arquivos divergentes daquele
checkpoint, e não há como pedir "todos menos este". Somando ao achado de que ele sobrescreve
alteração manual em silêncio, "preservar o arquivo que o usuário editou e reverter o resto" é
**impossível** em cima dessa API.

Sobra também que `rewindFiles` é método de `Query`: exige **sessão viva**. Rewind de sessão
encerrada só existe se o store for nosso.

Os dois fatos juntos são a base do desenho de store próprio — chaveado por `prompt_id`, que o
`BaseHookInput` entrega em **todo** hook ("UUID correlating a user prompt with all subsequent
events until the next prompt"), sem exigir leitura do transcript.

Armadilha de script, que vale para o nosso adapter: **sair do `for await` do `Query` aborta a
query**. O primeiro spike morreu com `Operation aborted` porque o laço dava `return` ao receber
o `result`. Um consumidor só, para toda a vida da sessão, e os turnos se coordenam por promise.

### 9.6 — `supportedCommands()` traz comando morto e interno

54 comandos nesta instalação com `settingSources: ['project']` — a rodada anterior mediu 57.
A contagem varia por instalação, versão e skills instalados, o que sustenta a proibição de lista
fixa. Cada item traz `name`, `description` e `argumentHint`.

A lista crua **não é apresentável como está**: `agents` tem descrição começando em `(removed)`,
`extra-usage` vem como `Renamed to /usage-credits`, dois comandos têm prefixo `__`
(`__remote-workflow`, `workflow-launch-exec`) e `heapdump` despeja o heap em `~/Desktop`.
Filtrar por **metadado** — prefixo e descrição — envelhece bem; filtrar por nome é a lista fixa
de novo.

Chamar `supportedCommands()` não custa token: basta abrir a `query()` e nunca ceder prompt.

**Remedido em 2026-09-26** (SDK `0.3.277`, CLI `2.1.277`, [plano 04 · F3](../plans/04-transcript-and-resume/F3-commands.md)),
com a gravação que agora é fixture (`pnpm fixtures:record commands`):

- **55** comandos. Os mortos são os mesmos dois (`agents`, `extra-usage`); o único com prefixo `__`
  é `__remote-workflow`. **`workflow-launch-exec` não tem prefixo** nem outro metadado de interno —
  a nota acima estava errada, e pelo filtro por metadado ele fica no menu. Hoje todo item vem com
  `builtin: true` e alguns com `aliases` (`review` → `code-review`, `cost`/`stats` → `usage`);
- **o `system:init` não chega antes do primeiro prompt.** Com a `query()` aberta e ociosa por 4 s,
  nenhuma mensagem saiu do stream; `supportedCommands()` respondeu em ~0,5 s. Logo, a versão do CLI
  — que só o `system:init` traz (`claude_code_version`) — não existe quando o menu costuma ser
  aberto. O `manifest.json` do SDK diz a mesma versão (2.1.277) desde o início;
- **`/init` enviado como prompt**, num projeto de dois arquivos: 6 `PreToolUse` (3 `Bash`, 2
  `Read`, 1 `Write`), 2 `canUseTool` (`Bash`, `Write`), `result: success`, em 33 s. É a fixture
  `init-turn`.

### Como reproduzir

Scripts em `scratchpad/sdkprobe/`: `measure-store.mjs`, `probe-pagination.mjs`,
`probe-listing.mjs`, `probe-limit.mjs`, `probe-commands.mjs`, `spike-rewind.mjs`.

---

## 10 — Quarta rodada de spikes (2026-10-01)

Feita para a F0 do [plano 08](../plans/08-claude-panel/F0-contract.md) — os spikes das D-01, D-02, D-06,
D-14, D-15, D-16 e D-17, e as fixtures que o fake roteirizado do painel reproduz. Não há script de spike
à parte: os cenários são do `pnpm fixtures:record`, e cada medida está no fixture que a gravou
(`backend/test/fakes/agent-sdk/fixtures/`). CLI **2.1.277**, SDK **0.3.277**, modelo padrão
`claude-opus-5[1m]`.

### 10.0 — Gravado de dentro de uma sessão do Claude Code, o CLI vira filho dela

A primeira gravação herdou as variáveis da sessão do Claude Code que a disparou
(`CLAUDE_CODE_ENTRYPOINT=claude-vscode`, `CLAUDE_CODE_SESSION_ID`, o socket de mensagens,
`CLAUDE_CODE_ENABLE_TASKS`…): o CLI se apresentou como `claude-vscode`, trouxe as tools e os MCPs
daquele host e aplicou as guardas de `Bash` dele (`sleep 40` bloqueado). O gravador agora tira
`CLAUDE_CODE_*`, `CLAUDECODE`, `CLAUDE_PID`, `CLAUDE_EFFORT`, `CLAUDE_AGENT_SDK_VERSION` e
`MCP_CONNECTION_NONBLOCKING` do ambiente, e a segunda gravação saiu com `entrypoint` ausente.
**O backend tem o mesmo risco:** `claudeEnvironment` tira só a configuração dele, então um backend
iniciado de dentro de uma sessão do Claude Code passa essas variáveis a todo subprocesso.

### 10.1 — `@caminho` no streaming input é expandido pelo CLI, sem `Read` (D-01, R-10)

`Summarise @notes.md in one line.` → resposta correta sobre o conteúdo, **0** `PreToolUse`, **0**
tool (`mention-turn`). O CLI leu o arquivo por conta própria e o pôs no contexto: leitura de arquivo
que a trilha nunca viu. Já `<reference path="notes.md" lines="1-2" />` levou a um `Read` sob o hook
(`reference-turn`).

**Consequência:** a referência que o backend compõe usa o formato delimitado, e **nunca** `@`. E o
problema não espera o painel: hoje, qualquer prompt com `@arquivo` digitado lê o arquivo sem trilha.
O composer da [F5](../plans/08-claude-panel/F5-composer-and-context.md) transforma `@` em chip, mas o
texto livre continua chegando ao CLI — a B-44 precisa neutralizar o `@caminho` do texto antes do
`session.prompt` (a forma, a decidir lá).

### 10.2 — Bloco `image` no `SDKUserMessage` é aceito (D-02)

Um PNG 16×16 vermelho em base64, num bloco `image` ao lado do texto: o modelo respondeu `red`
(`image-turn`). O upload HTTP da D-02 fica de pé.

### 10.3 — `applyFlagSettings` no meio da sessão reinicia a query e perde os hooks (D-16)

`applyFlagSettings({ effortLevel: 'low' })` entre dois turnos: o segundo turno chegou com um `init`
novo, o `Bash` dele foi negado ("The user doesn't want to take this action right now") e **nenhum**
`PreToolUse` disparou (`effort-turn`, reproduzido nas duas gravações). Trocar esforço na sessão viva
desliga a trilha. **Consequência:** sem `session.setEffort`; o esforço é escolhido no rascunho e vai no
`session.start` (`Options.effort`). O hook informa o esforço do turno (`effort.level`: `high` por
padrão).

### 10.4 — Prompt no meio do turno é fundido ao turno em curso (D-14, revê §8.6)

O segundo prompt, entregue ao SDK enquanto o primeiro turno rodava um `Bash`, **não** virou turno
próprio: houve um `result` só, com `first.\n\nsecond.` (`queue-turn`). É o contrário do que o §8.6
mediu no SDK 0.3.270. **Consequência:** segurar o prompt no backend até o `result` (a D-14) é o que
mantém "roda em seguida, como turno próprio" — e a fila passa a ser visível e cancelável.

### 10.5 — Um `Bash` de 40 s deixa o transcript 40 s sem escrita (D-06)

Com o comando em primeiro plano, o arquivo do transcript ficou **40 188 ms** sem mudar
(`long-tool-turn`, `transcript.longestSilenceMs`). A janela padrão de 120 s cobre tool de até dois
minutos; uma mais longa faz uma conversa ativa parecer parada — o rótulo "escrita há *n* min" diz
exatamente isso, e a retomada não depende dele (externa é sempre fork).

### 10.6 — Subagent com `forwardSubagentText` (D-15)

O tool é `Agent` (não `Task`). Com `forwardSubagentText: true`, o texto e as tools do subagent chegam
como `assistant`/`user` com `parent_tool_use_id` — **sem** `stream_event` (o subagent não tem delta) —,
mais `system:task_started`, `task_progress`, `task_updated` e `task_notification`. Um subagent que lê
um arquivo custou 66 mensagens no total, 5 dele: o ring buffer de 1000 não está em risco.

### 10.7 — Thinking vem omitido por padrão; `display: 'summarized'` o traz (D-17)

Sem opção de thinking, o modelo padrão manda o bloco `thinking` com o texto **vazio** e a assinatura
(`thinking-turn`): a tela só pode dizer que houve raciocínio. Com
`thinking: { type: 'adaptive', display: 'summarized' }` o bloco e os `thinking_delta` trazem o texto
resumido (`thinking-summarized-turn`). Vários `system:thinking_tokens` acompanham os deltas.

**O tempo do pensamento não é gravado** (plano 22, B-03). O `timestamp` de cada entrada do transcript
marca o **fim** dela — o CLI grava um bloco por entrada, quando o bloco fecha —, e nenhuma entrada diz
quando o pensamento começou. A duração que o stream vivo mede (do primeiro `thinking_delta` ao fim do
bloco) **não** vai para o arquivo. O que o histórico permite é o intervalo entre o `timestamp` da
entrada anterior e o do bloco, que inclui a latência até o primeiro token: um limite superior — por isso
"Pensou por **até** *n* s" ([22 · D-14](../plans/22-live-history/decisions.md#f5--fidelidade-no-web)).
O SDK devolve esse `timestamp` em `getSessionMessages`, embora o tipo `SessionMessage` não o declare
(SDK 0.3.277, medido em 2026-10-07); as mensagens ao vivo também o trazem. E o `uuid` de cada mensagem
`assistant`/`user` ao vivo é o da entrada do transcript — o que faz o `blockId` `<uuid>:<índice>` ser o
mesmo ao vivo e no histórico ([22 · D-06](../plans/22-live-history/decisions.md#f1--mapeamento-e-leituras)).

### 10.8 — A lista de tarefas depende do modelo, e uma variável a liga (B-20, D-25)

Desde o CLI 2.1.268, as tools de lista de tarefas só são oferecidas a Claude 3.x, Opus 4.0–4.7,
Sonnet 4.0–4.6 e Haiku 4.5. Com qualquer outro modelo — o `claude-opus-5` das gravações —, elas somem
das tools e das deferidas do `ToolSearch` (`todo-turn`); `settings: { todoFeatureEnabled: true }` só
liga o painel do terminal e não muda isso (`todo-enabled-turn`). Duas variáveis de ambiente do CLI
decidem o que aparece:

| `CLAUDE_CODE_ENABLE_TODO_TOOLS` | `CLAUDE_CODE_ENABLE_TASKS` | Tools | Fixture |
|---|---|---|---|
| ausente | — | nenhuma (modelo fora da lista) | `todo-turn` |
| `1` | ausente | `TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList` | `task-tools-turn` |
| `1` | `0` | `TodoWrite` | `todo-write-turn` |
| ausente, modelo da lista (`claude-haiku-4-5`) | ausente | `TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList` | `task-tools-listed-model-turn` |

O modelo decide **se** há lista; **qual** tool a mantém só o `CLAUDE_CODE_ENABLE_TASKS` decide, igual
para todo modelo. Um `--tools`/`--allowedTools` que nomeie uma delas também liga — mas o produto não usa
`allowedTools` (aprova sem perguntar). As quatro `Task*` e o `TodoWrite` são **deferidas**: o modelo
as carrega pelo `ToolSearch` antes da primeira chamada. Nenhuma passa pelo `canUseTool`, só pelo
`PreToolUse`.

- **`TodoWrite`** manda a lista **inteira** a cada chamada (`todos` com `content`, `status`,
  `activeForm`); o resultado traz `oldTodos` e `newTodos`.
- **`Task*`** são **incrementais**: `TaskCreate` (`subject`, `description`, `activeForm`) devolve o
  `id`; `TaskUpdate` muda pelo `taskId` (`status`, inclusive `deleted`, e dependências
  `addBlocks`/`addBlockedBy`), com `statusChange` no resultado. Cada tarefa fica em disco, em
  `~/.claude/tasks/<session_id>/<id>.json`, e há os hooks `TaskCreated` e `TaskCompleted`.

### 10.9 — O resto do que o painel desenha

- **Edit e Write** (`edit-turn`): o CLI lê antes de editar; dois `Edit` no mesmo arquivo no mesmo turno,
  `Write` sobre existente e `Write` de novo — os quatro passam pelo `canUseTool`. **`MultiEdit` não
  existe** nesta versão.
- **Modo plan** (`plan-turn`): o `ExitPlanMode` chega ao `canUseTool` com `{ plan, planFilePath }` — a
  premissa da B-22 vale. O `AskUserQuestion` também passa por ele.
- **`/compact`** (`compact-turn`): `system:status` `compacting`, um `init` novo, o
  `system:compact_boundary` com `{ trigger: 'manual', pre_tokens, post_tokens, duration_ms }` — 30 s —,
  o resumo como mensagem `user` de texto e um `result` com `num_turns: 0`.
- Subtipos de `system` novos para o mapper: `thinking_tokens`, `task_*`, `background_tasks_changed`, e
  `status` com `requesting`/`compacting`.

### 10.10 — O prompt não volta pelo stream; com `uuid`, o CLI responde `command_lifecycle` (plano 08, F6)

- **O CLI não ecoa o prompt do streaming input**: em nenhuma gravação há a mensagem `user` do prompt
  (só a do `/compact`, com `isReplay`). Sem eco, o painel e o app mostravam a resposta sem a pergunta —
  achado pelo e2e da F6. O backend passou a dizer o prompt ele mesmo (`message.completed` de papel
  `user`, [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md#multi-cliente-na-mesma-sessão)).
- **Um `SDKUserMessage` com `uuid`** é guardado na conversa **sob esse `uuid`** — o `forkSession` do
  `sdk.d.ts` o aceita como `upToMessageId` — e o CLI responde com mensagens de `type`
  **`command_lifecycle`** (`{ command_uuid, state: 'queued' | 'started', uuid, session_id }`), que a
  união tipada do SDK não nomeia. Gravado em `stamped-turn`; o primeiro `smoke-live` da F6 as viu como
  variante desconhecida, e o mapper passou a conhecê-las como silenciosas — a fila de prompts é do
  backend (D-14) e já diz quando um prompt espera, começa ou sai.

### Como reproduzir

`pnpm fixtures:record <cenário>` — os cenários e o porquê de cada um estão em
`scripts/record-agent-sdk-fixtures.mjs`; a medida da D-06 sai em `transcript` no fixture.

---

## 11 — Quinta rodada de spikes (2026-10-09)

Feita para a F0 do [plano 13](../plans/13-claude-settings/F0-contract.md) — a B-01, as medições de que
dependem as decisões D-01, D-02, D-05, D-06, D-11, D-13, D-17, D-20, D-21 e D-22. Contra o Claude real,
sobre um `CLAUDE_CONFIG_DIR` isolado com a credencial **copiada** (o `~/.claude` de quem roda não é
tocado), num repositório gerado por execução e com o servidor MCP de fixture nosso
(`e2e/fixtures/mcp-server/fixture-mcp-server.mjs`, [13 · D-19](../plans/13-claude-settings/decisions.md#d-19--servidor-mcp-de-fixture)).
CLI **2.1.277**, SDK **0.3.277**, turnos em `haiku`. Toda sessão com `settingSources: ['project']`, o
`PreToolUse` e o `canUseTool`, como o produto.

| # | Pergunta | Medido | Decide |
|---|---|---|---|
| 1 | o que sobe com `strictMcpConfig: true` | só o passado em `mcpServers` (`source: dynamic`). Nenhum servidor do `.mcp.json` — nem com `enableAllProjectMcpServers: true` e `enabledMcpjsonServers` no `.claude/settings.json` —, de plugin, de frontmatter de subagent, nem os **conectores claude.ai** da conta subiram, e nenhum processo deles nasceu. **Sem** o strict, no mesmo repositório: o `projectsrv` do `.mcp.json` subiu aprovado pelo próprio repositório, e 19 conectores claude.ai (um `connected`, 18 `needs-auth`) | D-01: o strict isola, inclusive dos conectores; o repositório **se auto-aprova** sem ele |
| 2 | tool MCP e aprovação | as três tools MCP chamadas — inclusive a que se declara `readOnly` — dispararam o `PreToolUse` **e** o `canUseTool`, em `default` e em `acceptEdits`. O `ToolSearch` que as carrega (são deferidas) só o hook | D-13: nada de tool MCP é auto-aprovado pelo CLI |
| 3 | o segredo | pelo `mcpServers` do `query()`, o valor **está** em `/proc/<pid>/cmdline` (`--mcp-config`). Por `setMcpServers()` logo depois do início: fora do argv, **512 ms**, o servidor `connected` com as 4 tools na resposta, e o primeiro turno chamou a tool e recebeu o segredo. `${VAR}` é expandido pelo caminho do argv, contra o ambiente do CLI; pelo `setMcpServers()` **não** — chega literal | D-02: entrega por `setMcpServers()`; a expansão de `${VAR}` é nossa |
| 4 | custo da sonda | `initializationResult()` sem prompt: **~0,3–1,3 s**, **~230–240 MB** de RSS, 1 processo, **0** mensagens no stream, 0 servidores MCP. Responde 52 comandos, 5 agents, 5 modelos (`default`, `opus[1m]`, `claude-fable-5-1`, `sonnet`, `haiku`), o estilo atual e 5 disponíveis, e a conta com `apiProvider`, `email` e `subscriptionType` (sem `organization` nesta conta) | D-05 |
| 5 | o que o projeto injeta com a confiança limpa | o hook `PreToolUse` do `.claude/settings.json` **roda** nas nossas sessões, sem ninguém aprovar. `CLAUDE.local.md`, `.claude/settings.local.json` (e o hook dele) e o `CLAUDE.md` do usuário **não** são carregados. O subagent de projeto com `permissionMode: acceptEdits` **escreveu sem o `canUseTool`** — o `PreToolUse` viu a escrita com `permission_mode: 'acceptEdits'` e `agent_type: 'writer'`. Com o hook respondendo `permissionDecision: 'ask'` para um modo mais largo que o da sessão, a escrita **voltou ao `canUseTool`** (e, negada, não aconteceu). `mcpServers` de frontmatter não subiu com o strict | D-17, R-03, D-23 |
| 6 | herança de ambiente | o servidor stdio enxerga **todo** o ambiente do CLI — inclusive um `DATABASE_URL` e um `RC_*` postos nele | B-20: o filtro do subprocesso protege o servidor também |
| 7 | shell inline (`!`) | sem `allowed-tools` no frontmatter, o bloco não roda. **Com** `allowed-tools: Bash(touch:*)`, roda na expansão — do `/comando` digitado e do `Skill` de projeto e de plugin — **sem `canUseTool` e sem `PreToolUse`**. `managedSettings: { disableSkillShellExecution: true }` **não** o impede; `settings: { disableSkillShellExecution: true }` (camada de flag) impede as três origens. O `Skill` em si passa pelo `canUseTool` | D-21, D-24 |
| 8 | skills | com `['project']`, nem as skills de `~/.claude/skills`, nem as sincronizadas do claude.ai (`skills/synced`), nem as de um plugin que o CLI instalou (habilitado no `settings.json` do usuário **e** no do projeto) carregam. Um plugin local sintético com links para as pastas de skill as traz como `rc-user-skills:<nome>` — inclusive a que declara `hooks:` no frontmatter, que então cabe a nós recusar. `reloadSkills()` devolve as skills **e** os comandos de prompt (os de `.claude/commands/` e builtins como `init`): 15–17 itens contra 52 de `supportedCommands()`. Com a `allow` de `Write` no `settings.json` do usuário e o plugin sintético ligado, o `canUseTool` **foi** chamado e nada foi escrito | D-20, D-22, B-34 |
| 9 | camada de flag no início | `settings: { outputStyle: 'Explanatory' }` no `query()`: o `initializationResult()` responde o estilo, e o `PreToolUse` continua disparando — o problema do §10.3 é do `applyFlagSettings` no meio da sessão, não da opção | D-06, B-15 |
| 10 | de onde o CLI lê o `.mcp.json` | aberto numa subpasta de um repositório (`.git` na raiz), o CLI subiu o servidor do `.mcp.json` da **raiz** | D-11: a tela lê da pasta até a raiz do repositório |

**Consequências para o produto**, todas registradas nas decisões do plano 13 e na
[ADR-018](../architecture/shared/00-decisions.md#adr-018--a-extensão-do-claude-só-entra-pelo-produto):

- a sessão leva `strictMcpConfig: true` e nada mais de MCP no `query()`; os nossos servidores chegam por
  `setMcpServers()` depois do início, e `${VAR}` é expandido pelo backend, no ambiente já sem os
  segredos dele;
- o hook `PreToolUse` da trilha passa a **devolver `ask`** quando a chamada roda num modo mais largo que
  o da sessão (o `permission_mode` que o hook recebe): o subagent de projeto que pede `acceptEdits`
  volta a perguntar ([13 · D-23](../plans/13-claude-settings/decisions.md#d-23--modo-próprio-de-subagent-volta-a-perguntar));
- a sessão leva `settings: { disableSkillShellExecution: true }` pelo montador de flag settings — não
  `managedSettings`, que não segura ([13 · D-24](../plans/13-claude-settings/decisions.md#d-24--shell-inline-desligado-pela-camada-de-flag));
- o hook de projeto continua rodando, e a tela diz isso sem eufemismo (R-03 aberto).

### Como reproduzir

`pnpm spike:claude-config` — ou uma sonda pelo nome (`strict`, `approval`, `secret`, `probe`,
`project`, `shell`, `skills`, `flags`, `locations`), e `--json <arquivo>` para os números crus. Exige o
Claude logado; as sondas `probe`, `strict` e `locations` não gastam cota.

---

## 12 — Sexta rodada de spikes (2026-10-09)

Feita para a F0 do [plano 26](../plans/26-mobile-conversation-parity/F0-spike.md) — a B-01: a forma das
mensagens que a conversa do app passa a desenhar, medida antes das fixtures que a assumem. Mesmo
ambiente do §11: `CLAUDE_CONFIG_DIR` isolado com a credencial copiada, repositório gerado por execução,
o servidor MCP de fixture passado **direto** à sessão com `strictMcpConfig`. Toda sessão com as opções
do produto que mudam o stream: `settingSources: ['project']`, o `PreToolUse`, o `canUseTool`,
`includePartialMessages`, `includeHookEvents`, `forwardSubagentText`, `persistSession` e o thinking
resumido. CLI **2.1.277**, SDK **0.3.277**, turnos em `haiku`.

| # | Pergunta | Medido | Decide |
|---|---|---|---|
| 1 | subagent de projeto (`.claude/agents/writer.md`, `tools: Write, Read`) com `Write` que pede permissão — ao vivo | o `Agent` (`subagent_type: writer`) e **7** mensagens com `parent_tool_use_id` igual ao id dele: 5 `assistant` e 2 `user` — o prompt do subagent e o `tool_result` do `Write`. Blocos: 3 `text` (um é o prompt), 2 `thinking`, 1 `tool_use`, 1 `tool_result`. **Nenhum** `stream_event`: o subagent não tem delta, só a mensagem inteira (confirma o §10.6). O `Write` dele nunca aparece na cadeia principal. O `canUseTool` do `Write` veio com o `toolUseID` da chamada **do subagent** e com `agentID`. Nenhum `tool_progress` (o `Write` é rápido) | [26 · B-18](../plans/26-mobile-conversation-parity/F5-subagents.md): o app guarda o dono de cada frame; [B-21](../plans/26-mobile-conversation-parity/F5-subagents.md): a permissão é achada pelo `toolUseId` dentro do subagent |
| 2 | o mesmo subagent pelo histórico | o `getSessionMessages` da conversa **não** tem nenhuma mensagem com `parent_tool_use_id`: o subagent mora fora dela. O `listSubagents` lista 1, e o `getSubagentMessages` dele devolve 7 mensagens, **todas** com o `parent_tool_use_id` do `Agent` — o que o backend usa para achá-lo (`transcript.adapter.ts`). Blocos: 2 `text`, 2 `thinking`, 1 `tool_use`, 1 `tool_result` (o prompt do subagent vem como texto puro, não como bloco) | [26 · B-20](../plans/26-mobile-conversation-parity/F5-subagents.md): o app lê a rota de subagents ao abrir o card, como o web |
| 3 | nome de uma tool MCP chamada sem título | `mcp__fixture__echo`, com a entrada `{ text }` — **sem** `description`, então sem título no `tool.started`. O `canUseTool` foi chamado com o mesmo nome | [26 · B-13](../plans/26-mobile-conversation-parity/F4-tool-cards.md): o rótulo `fixture · echo`, nunca o nome cru |
| 4 | texto, tool e texto numa resposta | 5 mensagens `assistant`, **um bloco cada**. Sob o primeiro `message.id`: `thinking`, `text`, `tool_use`; sob o segundo: `thinking`, `text`. Dois blocos de texto, cada um numa mensagem de API própria — o `message.completed` do backend leva um bloco por vez, e a mensagem do app tem de guardar a lista em ordem, não colar os textos | [26 · B-09](../plans/26-mobile-conversation-parity/F3-message-markdown.md) |

**Consequências:** nenhuma surpresa contra o que o plano 26 assume. O subagent é a única perda de
mensagem inteira do app, e as três vias que ele tem de cobrir são as medidas aqui: o stream com
`parent_tool_use_id` (sem delta), o `canUseTool` com o id da chamada do subagent, e o histórico em
arquivo próprio, achado pelo `parent_tool_use_id`. As fixtures da
[B-02](../plans/26-mobile-conversation-parity/F0-spike.md) são gravadas nessa forma, e o `smoke-live`
da [B-31](../plans/26-mobile-conversation-parity/F7-e2e.md) volta a conferi-la a cada versão do CLI.

### Como reproduzir

`pnpm spike:conversation-parity` — ou uma sonda pelo nome (`subagent`, `mcp`, `blocks`), e
`--json <arquivo>` para os números crus. Exige o Claude logado; cada sonda gasta um turno pequeno.

---

## 13 — Sétima rodada de spikes (2026-11-01)

Feita para a F0 do [plano 27](../plans/27-conversation-losses/F0-spike.md) — a B-01: as dez perguntas
da [D-05](../plans/27-conversation-losses/decisions.md#f0--spike), que alimentam o D-04 (destino de
cada variante), o D-06 (retirada) e o D-13 (teto do texto) do mesmo plano. Mesmo ambiente dos §11/§12:
`CLAUDE_CONFIG_DIR` isolado com a credencial copiada, repositório descartável por sessão. CLI
**2.1.277**, SDK **0.3.277**, turnos em `haiku`.

| # | Pergunta | Medido | Decide |
|---|---|---|---|
| 1 | `includeSystemMessages`: subtipos e custo | numa conversa de 2 turnos (uma tool, um `/compact`): **sem** a opção, `getSessionMessages` já devolve as três mensagens sintéticas do `/compact` — o resumo (`isCompactSummary: true`, `is_meta: true`, o resumo inteiro como texto) e os dois ecos (`isCompletedLocalCommand: true`: o `<command-name>/compact</command-name>` e o `<local-command-stdout>Compacted </local-command-stdout>`) —, todas de `type: 'user'`. **Com** a opção, entra **uma** linha a mais, de `type: 'system'`, mas **sem `subtype` nem qualquer outro campo** além de `uuid`, `session_id`, `parent_tool_use_id`, `parent_agent_id` e `timestamp` — um marcador de posição vazio, não a informação da variante. Custo, nesta conversa pequena: poucos ms nos dois casos; não mede R-03 numa conversa longa | D-05, R-03 |
| 2 | onde chega o `systemMessage` de um hook de `.claude/settings.json` | **nunca** no `hook_response` (que só tem `output`/`stdout`/`stderr`/`exit_code`/`outcome` — o `output` é o JSON cru do hook, não os campos). O CLI monta uma mensagem própria, `system/informational`, com `content: "<hook_name> says: <mensagem>"` e `level: 'notice'`. Mas só chega ao stream com `includeHookEvents: true`: sem a opção, o hook roda do mesmo jeito — nenhum `hook_started`/`hook_progress`/`hook_response` nem `informational` aparece. O primeiro run deste spike mediu exatamente essa ausência, por não ter passado a opção | D-04 |
| 3 | troca de modelo por sobrecarga: aviso próprio? | não provocável de propósito (como a recusa da D-09). Medição estática do `sdk.d.ts`: não existe variante de "troca por sobrecarga" — só `model_refusal_fallback`/`model_refusal_no_fallback`, e os dois têm `trigger: 'refusal'`, nunca sobrecarga. A troca pela opção `fallbackModel` não tem aviso de nenhum tipo | D-04 |
| 4 | campos do `rate_limit_info` | esta conta (assinatura, não chave de API) recebe um `rate_limit_event` passivo em toda sessão, mesmo sem pedir nada: `status: 'allowed'`, `resetsAt`, `rateLimitType: 'five_hour'`, e um `unifiedWindows` com `five_hour`/`seven_day`, cada um com `utilization` e `resetsAt`; e os campos de excedente — `overageStatus: 'rejected'`, `overageDisabledReason: 'out_of_credits'`, `isUsingOverage: false` — próprios desta conta (sem crédito de excedente), não do campo em geral. Os outros `rateLimitType` (`seven_day_opus`, `seven_day_sonnet`, `seven_day_overage_included`, `overage`) e outros `overageDisabledReason` não foram vistos | D-04 |
| 5 | volume do `api_retry` sob falha de rede forçada | `ANTHROPIC_BASE_URL` para uma porta fechada (`http://127.0.0.1:1`, sem gastar cota: a chamada nunca sai da máquina). Em 30 s: **6** tentativas, com o atraso dobrando a cada uma (566, 1090, 2049, 4475, 9345, 18810 ms), `max_retries: 10` (continuaria além dos 30 s), `error_status: null` — confirma o comentário do tipo ("erro de conexão não tem resposta HTTP") — e `error: 'unknown'`, o valor do enum para uma falha de transporte, sem nenhum dos valores específicos de HTTP | D-04 |
| 6 | `/clear`: `conversation_reset` e troca de `session_id` | o CLI emite exatamente um `conversation_reset`, com um `new_conversation_id` novo. E o `session_id` que **toda** `SDKMessage` carrega muda entre a mensagem antes e a de depois do `/clear` — mesmo sendo o mesmo subprocesso, a mesma `options.sessionId` do `query()`. Quem correlaciona pelo `session_id` do payload, em vez do `sessionId` que o backend controla, vê o identificador trocar no meio do stream | D-04 |
| 7 | `worker_shutting_down` frente ao `session.closed` | não observável pela SDK local usada por este produto: o comentário do tipo diz que é emitido "pela bridge", num encerramento gracioso que o **hospedeiro** pede com um motivo — caminho de um backend hospedado, que o `query()` local não aciona. O `close()` da sessão não aceita motivo. Nenhuma sessão foi aberta para esta sonda (sem gasto de cota) | D-04 |
| 8 | uuid da retirada bate com `blockId`/`messageId` | não provocável de propósito, pela mesma razão da D-09. O `sdk.d.ts` documenta a forma dos `retracted_message_uuids`: "um uuid por mensagem normalizada do SDK; mensagens de vários blocos carregam um uuid derivado por bloco" — por bloco, não por mensagem inteira, o que é compatível com um `blockId` nosso, mas sem uma retirada real para confirmar | D-06 |
| 9 | bloco que não é `tool_result` numa mensagem de `tool_result` | nenhum visto, no único `tool_result` desta sessão (o `ls` do Bash). Um ponto só; a preocupação do [discovery 09 §5](09-perdas-do-backend-na-conversa.md#5-perdas-dentro-da-mensagem-de-usuário) continua em aberto para outras tools — a F4 cobre imagem e `resource`/`resource_link` nas próprias fixtures | discovery 09 §5 |
| 10 | onde ficam o `compact_boundary` e o resumo depois do `/compact` | o `compact_boundary` ao vivo carrega um `compact_metadata` rico: `trigger`, `pre_tokens`, `post_tokens`, `cumulative_dropped_tokens`, `duration_ms` (13 s neste `/compact` manual), `preserved_segment` (uuids de início/âncora/fim) e `preserved_messages` (os uuids preservados ao pé da letra). No histórico (`includeSystemMessages`), esse `compact_boundary` **não aparece** (`inHistory: false`) — o histórico reconstrói como [a linha `system` vazia da sonda 1] + [o resumo sintético, `isCompactSummary`] + [a cauda preservada ao pé da letra: aqui, a última resposta real e os dois ecos do `/compact`], **fora da ordem cronológica** (a cauda preservada tem timestamp anterior ao do resumo sintético). Os turnos originais de antes da compactação (o prompt do `ls` e a chamada de tool) somem — a compactação é mesmo destrutiva, como o nome promete | D-05 |

**Consequências:**

- confirma, com números, a premissa do [discovery 09 §1](09-perdas-do-backend-na-conversa.md#1-o-pedido)
  sobre o `/compact`: o resumo e os dois ecos já
  chegam ao histórico hoje, sem `includeSystemMessages` — o que falta é o backend **saber** que são
  sintéticos (pelos campos `isCompactSummary`/`is_meta`/`isCompletedLocalCommand`, não por adivinhar
  pela posição) e dizer isso ao cliente, em vez de desenhar três balões "Você" (F3, B-11);
- `includeSystemMessages` no histórico entrega pouco: uma linha por evento de sistema, sem o `subtype`
  nem o payload — o `compact_boundary` com o `compact_metadata` só existe **ao vivo**. Se o produto
  quiser mostrar o resumo da compactação com os números (tokens, duração) depois de reabrir o
  histórico, precisa gravar isso no momento em que acontece ao vivo, não reconstruir depois (F5,
  R-03 — o teto do plano 22 por versão continua valendo, e a resposta é "não dá para só ligar a
  opção");
- o `systemMessage` de um hook de projeto só chega ao stream com `includeHookEvents: true`, como uma
  mensagem `informational` separada — nunca um campo do `hook_response` (F3, B-09);
- o `api_retry` sob falha de transporte nunca tem `error_status`; o volume (6 tentativas em 30 s, antes
  do `max_retries: 10`) é a base para o teto de ruído de um aviso de "tentando de novo" (F3, B-09, R-01);
- o `session_id` do payload muda com o `/clear` — qualquer correlação por esse campo, em vez do
  `sessionId` que o backend já controla, quebra nesse momento (F3, B-10/B-11);
- dois bugs no próprio spike, achados pela sonda e não pela leitura do tipo: o comando do hook de
  teste, escrito entre aspas duplas, perdia as aspas do JSON na casca (saída inválida, sonda 2 vazia na
  primeira rodada) — corrigido com aspas simples; e `makeThrowawayWorld` sem arquivo nenhum nunca
  criava o diretório do repositório, e o CLI falhava ao nascer com uma mensagem genérica de "binário
  não compatível com a libc" que não tinha nada a ver com a causa real — corrigido criando o diretório
  sempre. Os dois ficam em `scripts/lib/spike-session.mjs` e
  `scripts/lib/conversation-losses-spike.mjs`, compartilhados com os spikes dos §12 e §11.

### 13.1 — Três achados da gravação das fixtures (B-02, mesma rodada)

Gravando as fixtures da [B-02](../plans/27-conversation-losses/F0-spike.md#b-02--fixtures-gravadas-)
pelo `pnpm fixtures:record`, três medições que a B-01 não cobria:

- **`resource` e `resource_link` de uma tool MCP não chegam como bloco estruturado**: só a `image`
  sobrevive como bloco `image` de verdade (`source.type: 'base64'`). O CLI já achata `resource` e
  `resource_link` em texto antes do backend ver a mensagem — `[Resource from fixture at
  fixture://note.txt] a fixture resource` e `[Resource link: linked.txt] fixture://linked.txt` —, o que
  confirma a decisão de escopo do plano 27 ("o texto basta" para esse par, [README](../plans/27-conversation-losses/README.md#não-entra)): não há nada estruturado para a F4 desenhar além da imagem;
- **um `/comando` de projeto não tem eco nenhum ao vivo**: nem `local_command_output`, nem mensagem de
  `user` alguma — o stream vai direto de `system/init` ao `assistant` com a resposta. Só no histórico
  (`getSessionMessages`) a expansão aparece, como um `user` com
  `<command-message>…</command-message><command-name>/…</command-name><command-args>…</command-args>`,
  a mesma forma de tag do eco do `/compact` (§13, sonda 1). O prompt digitado que a B-21 mostra ao vivo
  é o que o próprio backend enviou, não um eco do CLI — não há perda aqui, só a confirmação de que não
  há o que esperar da CLI;
- **`/compact` sem nada para compactar falha por uma resposta sintética, não pelo `compact_error`**: o
  `assistant` que seguiu era `model: '<synthetic>'`, com o texto `Error: No messages to compact` — o
  CLI nunca chegou a emitir um `compact_boundary`. O `compact_error` do tipo pode existir para uma
  falha **durante** uma compactação real, mas essa forma não foi medida — não provocável sem uma falha
  de API no meio do processo.

### Como reproduzir

`pnpm spike:conversation-losses` — ou uma sonda pelo nome (`systemMessages`, `hookMessage`,
`fallbackModel`, `rateLimit`, `apiRetry`, `conversationReset`, `workerShutdown`, `retraction`,
`strayBlock`, `compactChain`), e `--json <arquivo>` para os números crus. Exige o Claude logado;
`fallbackModel`, `workerShutdown` e `retraction` não abrem sessão nem gastam cota — respondem do
`sdk.d.ts`, pela mesma razão da D-09. `apiRetry` também não gasta cota (a chamada nunca sai da
máquina). As demais abrem no máximo três sessões reais, uma por grupo de sondas. As fixtures da B-02
são gravadas por `pnpm fixtures:record <nome>` (ou sem nome, todas), definidas em
`scripts/record-agent-sdk-fixtures.mjs`.

---

## Versões verificadas

| Item | Versão |
|---|---|
| `@anthropic-ai/claude-agent-sdk` | 0.3.270 na descoberta · **0.3.273** na rodada de 2026-09-16 · **0.3.277** de 2026-10-01 a 2026-11-01 (CLI embutido 2.1.277) |
| Claude Code CLI (PATH) | 2.1.226 — e **2.1.273** na extensão do VSCode: há dois binários na máquina |
| Node | v24.16.0 |
| npm | 11.13.0 |
| Flutter / Dart | presentes em `~/middleware/flutter/flutter/bin` |
| Data da descoberta | 2026-09-13 · terceira rodada de spikes em 2026-09-16 · quarta em 2026-10-01 · quinta e sexta em 2026-10-09 · sétima em 2026-11-01 |

Fontes: `sdk.d.ts` (9221 linhas) e `README.md` do pacote, inspecionados localmente.
Doc oficial: <https://platform.claude.com/docs/en/agent-sdk/overview>
