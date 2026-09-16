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

> **Incerteza residual, não resolvida:** os diretórios de teste não constam em
> `~/.claude.json` como confiados (`hasTrustDialogAccepted`). Não foi verificado se, num
> diretório **já confiado** pelo usuário no CLI interativo, o `allow` de projeto passa a ser
> aplicado — o que reabriria a brecha. Testar isso exigiria alterar o `~/.claude.json` do
> usuário, o que não foi feito. **Verificar antes de ir para produção.**

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

### Como reproduzir

Scripts em `scratchpad/sdkprobe/`: `measure-store.mjs`, `probe-pagination.mjs`,
`probe-listing.mjs`, `probe-limit.mjs`, `probe-commands.mjs`, `spike-rewind.mjs`.

---

## Versões verificadas

| Item | Versão |
|---|---|
| `@anthropic-ai/claude-agent-sdk` | 0.3.270 na descoberta · **0.3.273** na rodada de 2026-09-16 |
| Claude Code CLI (PATH) | 2.1.226 — e **2.1.273** na extensão do VSCode: há dois binários na máquina |
| Node | v24.16.0 |
| npm | 11.13.0 |
| Flutter / Dart | presentes em `~/middleware/flutter/flutter/bin` |
| Data da descoberta | 2026-09-13 · terceira rodada de spikes em 2026-09-16 |

Fontes: `sdk.d.ts` (9221 linhas) e `README.md` do pacote, inspecionados localmente.
Doc oficial: <https://platform.claude.com/docs/en/agent-sdk/overview>
