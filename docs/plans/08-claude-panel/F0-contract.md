# F0 — Contrato

Plano: [08 — Painel do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 07](../07-explorer-and-editor/README.md) concluído (o módulo `files`, a API de
leitura e os códigos `FILE_*` que este plano reusa).
**Entrega:** o contrato inteiro do painel escrito e gerado nas três pontas — anexos do prompt,
campos e eventos novos do stream, endpoints de leitura, códigos de erro, padrões de UI — e as
fixtures gravadas de que o fake roteirizado vai precisar. Nenhuma tela ainda.

**Decisões que precisam estar fechadas para começar:** D-01, D-02, D-03, D-05, D-06, D-14, D-15,
D-16 e D-19, e a D-22 para a forma do `upload` ([decisions.md](decisions.md#f0--contrato)). Os spikes da D-01, D-02, D-06, D-14, D-15 e
D-16 rodam **antes** da fase, contra o Claude real, e entram na
[descoberta](../../discovery/01-descoberta-claude-agent-sdk.md) como uma rodada nova — é o registro
dos spikes, como foi no plano 04.

---

## Por que o contrato vem primeiro, e inteiro

Contrato mudado em uma ponta só é bug ([AGENTS.md](../../../AGENTS.md), gatilhos específicos). Este
plano mexe no stream (thinking, subagents, fila, compactação), em três comandos existentes
(`session.prompt`, `session.rewindFiles`, `session.start`) e cria dois comandos
(`session.cancelQueuedPrompt`, `session.rejectChange`) e talvez um terceiro (`session.setEffort`,
pela D-16). Fazer isso fase a fase regeneraria o Dart e rodaria o `test:e2e:mobile` cinco vezes; fazer
de uma vez, com o app provando que ignora o que não conhece, é uma vez.

Tudo o que entra é **campo opcional ou tipo novo**: `v` não sobe
([versionamento](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — `session.prompt.attachments`: arquivo, pasta, trecho, anexo enviado e texto de provedor 🔲

O campo **já existe** no schema (`{ path, mediaType? }`) e hoje ninguém o envia: o backend não o lê
e o web não o manda (verificado — só os tipos gerados o citam). Ele evolui para uma união por `kind`:

| `kind` | Campos | Quem resolve |
|---|---|---|
| `file` (e o ausente, por compatibilidade) | `path`, `range?` `{ startLine, endLine }` | o backend valida na pasta da sessão e compõe a referência (D-01) |
| `folder` | `path` | idem; o Claude lista pelo `Glob`/`LS` |
| `upload` | `attachmentId` | o upload da D-02/D-22: imagem, ou arquivo de texto arrastado do desktop |
| `text` | `source` (`terminal`), `label`, `content` | o provedor que o cliente registrou; vai delimitado e rotulado, com teto |

As obrigatoriedades por `kind` vivem no schema, em `x-required-when`
([campo obrigatório por condição](../../architecture/shared/05-websocket-protocol.md#campo-obrigatório-por-condição)),
com `because`; `maxItems` e o teto de `content` também. `kind` ausente continua valendo como `file`
— é isso que mantém `v`. Regenera TypeScript e Dart; o app não envia anexos e continua verde.

O `text` existe para o `@terminal` do [plano 10](../10-integrated-terminal/README.md), que registra o
provedor quando o terminal existir: o contrato não depende do plano 10 existir.

### B-02 — Stream e comandos: thinking, subagents, compactação, fila, fork, esforço, rejeitar 🔲

Campos e tipos novos, cada um com a decisão que o molda:

| O quê | Forma | Decisão |
|---|---|---|
| thinking vivo | `message.delta.blockType?` (`text` · `thinking`); bloco `thinking` (e `redacted_thinking`) no `content[]` de `message.completed` — o `type` do bloco já é aberto de propósito | D-17 |
| subagent | `parentToolUseId?` em `message.delta`, `message.completed`, `tool.started`, `tool.progress`, `tool.completed` | D-15 |
| compactação | evento `session.compacted { trigger, preTokens? }` — hoje o `compact_boundary` vira só `session.statusChanged` | — |
| fila | eventos `prompt.queued { queueId, position, promptedBy, preview }` e `prompt.dequeued { queueId, reason }` (`started` · `cancelled`); comando `session.cancelQueuedPrompt { sessionId, queueId }` | D-14 |
| editar e reenviar | `session.start.forkAt?` (o `messageId` do prompt a reescrever), obrigatório só com `resumeSessionId` | D-19 |
| esforço | comando `session.setEffort { sessionId, level }` — só se a D-16 o mantiver | D-16 |
| rejeitar | `session.rewindFiles.paths?`; comando `session.rejectChange { sessionId, path, hunkId, revision }`, resultado no `session.rewound` que já existe | D-08 |

O mapper do SDK é quem produz os campos (thinking e `parent_tool_use_id` estão no `SDKMessage`; o
mapper hoje **descarta** thinking deltas por decisão escrita no código — ela muda aqui). O
histórico lido pelo transcript sai das **mesmas** funções do mapper, então thinking e subagent
aparecem iguais vivos e recarregados ([backend/03](../../architecture/backend/03-modules.md#transcript)).
Nesta fase só o contrato e os guards; o comportamento é das fases seguintes.

### B-03 — Os endpoints de leitura, documentados 🔲

Tudo HTTP de leitura, porque é pergunta com resposta
([05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#slash-commands)). Entra em
[backend/03](../../architecture/backend/03-modules.md#session) com a tabela de status de cada um, como
os endpoints do plano 04:

| Endpoint | O quê | Fase |
|---|---|---|
| `GET /sessions?workspacePath=` | sessões **vivas** do chamador na pasta e nas subpastas: `sessionId`, `claudeSessionId`, `workspacePath`, `status`, `model`, `permissionMode`, `startedAt`, `openedFrom` (`web`/`mobile`), `pendingPermissions` | F1 |
| `GET /transcripts?workspacePath=&includeSubfolders=` | o de hoje, mais `activity` (`liveHere` · `activeElsewhere` · `idle`), `liveSessionId?` e `writtenAgoSeconds` — e subpastas pela D-05 | F1 |
| `GET /transcripts/:sessionId/subagents/:agentId/messages` | o transcript do subagent, pela cauda, pelas funções do SDK | F2 |
| `GET /sessions/:sessionId/tools/:toolUseId/diff` | antes/depois de Edit/MultiEdit/Write (D-03), com `before.state` (`content` · `absent` · `unavailable` · `notRestorable`) | F3 |
| `GET /sessions/:sessionId/changes` | arquivos que a sessão mudou (`created` · `modified` · `deleted`), com `modifiedOutside`, `+`/`−` | F3 |
| `GET /sessions/:sessionId/changes/file?path=` | antes da sessão, agora, os trechos com `hunkId` e a `revision` | F3 |
| `GET /sessions/:sessionId/models` | `supportedModels()` da instalação, pelo catálogo do plano 04 | F4 |
| `GET /sessions/:sessionId/commands` | o de hoje, mais `origin` por item (`builtin` · `project` · `user` · `system`) e a regra de colisão do SDK | F5 |
| `GET /catalog?workspacePath=` | comandos, skills e modelos **sem sessão viva**, do catálogo por versão do CLI e pasta (D-13) | F5 |
| `GET /sessions/:sessionId/mcp-servers` | `mcpServerStatus()` reduzido a nome, status e contagem de tools — nunca `config` nem `error` cru | F4 |
| `GET /sessions/:sessionId/context` | `getContextUsage()` por categoria | F4 |
| `POST /sessions/:sessionId/attachments` | upload de imagem ou de texto (D-02, D-22): `201` com `attachmentId`; `413`, `415` | F5 |

A D-05, se decidir por subpastas, **atualiza** a regra "nunca `listSessions({})`" do backend/03 — com
o motivo e a cerca que continua valendo (o `cwd` dentro da pasta aberta). Os endpoints novos entram
nos limites do [plano 05](../05-hardening-operations/README.md) (nota para ele, não edição).

### B-04 — Códigos novos no catálogo 🔲

Entram em [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio)
**antes** do código, com `messageKey` en/pt-BR:

| `code` | HTTP | Quando |
|---|---|---|
| `ATTACHMENT_NOT_FOUND` | 404 | `attachmentId` desconhecido, de outra sessão ou expirado |
| `ATTACHMENT_TYPE_UNSUPPORTED` | 415 | anexo de tipo que não se aceita (imagem que o modelo não lê, binário) |
| `TOOL_USE_NOT_FOUND` | 404 | `toolUseId` que a sessão não tem |
| `DIFF_NOT_APPLICABLE` | 422 | diff pedido de tool que não escreve arquivo |
| `SESSION_CHANGE_STALE` | 409 | o trecho a rejeitar foi calculado sobre um disco que mudou |
| `SESSION_FORK_REJECTED` | 409 | o CLI recusou o ponto de fork (`resumeDropsTurn`) |
| `QUEUED_PROMPT_NOT_FOUND` | 404 | cancelar prompt que a fila não tem |

E chaves novas sobre códigos existentes: `session.error.queuedPromptStarted` (`CONFLICT`, cancelar o
que já começou), `session.error.forkPointUnknown` e `session.error.effortUnsupported`
(`INVALID_INPUT`). Os `FILE_*` são do [plano 07](../07-explorer-and-editor/README.md); se o nome final
de lá for outro, este plano usa o de lá.

### B-05 — Padrões de UI do painel, escritos antes das telas 🔲

Em [web/03-ui-system](../../architecture/web/03-ui-system.md#stream-de-mensagens), a seção de stream
de mensagens cresce para o painel: markdown como **conteúdo não confiável** (sem HTML cru, sem imagem
remota, sem link perigoso), tools compactas com o input exato a um clique e a permissão nunca
compactada, diff inline e o que "prévia contra o disco agora" significa, badges de permissão por aba
de pasta, os quatro estados da view de sessões e o rótulo honesto de "ativa em outro lugar".

Em [web/04-state-and-data](../../architecture/web/04-state-and-data.md#websocket--o-stream-ao-vivo):
o estado do painel é **por aba de pasta** (store chaveado pela pasta, nunca global), o rascunho de
conversa não tem sessão, a lista de sessões é polling com invalidação por evento, e o que a aba
inativa mantém anexado.

### B-06 — Fixtures gravadas para o fake 🔲

O fake roteirizado **não** é escrito à mão
([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)).
Com `pnpm fixtures:record`, contra uma fixture de repositório gerada por execução (a D-07 do plano 04),
gravar os turnos que as fases seguintes vão reproduzir: Edit, MultiEdit e Write sobre arquivo
existente e novo; um prompt com referência seguido do `Read`; um `Task` com subagent; `TodoWrite`
atualizado duas vezes; `ExitPlanMode` em modo `plan` (e se ele passa pelo `canUseTool` — o que a B-22
pressupõe); thinking; `/compact`. A fixture de imagem só se a D-02 a mantiver.

---

## Cenários cobertos

S-01…S-12.

---

## Critério de conclusão

```bash
pnpm verify
pnpm contracts:check
pnpm test:e2e:mobile
```
