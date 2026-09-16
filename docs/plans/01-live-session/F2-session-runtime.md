# F2 — Runtime da sessão

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md), [F1](F1-workspace.md).
**Entrega:** `adapter/outbound/claude/` completo, o módulo `session`, e o fan-out com ring
buffer e replay. Ao fim desta fase o Claude **roda** — ainda negando toda tool que exigir
humano, porque a ponte de permissão só chega na [F4](F4-permission.md).

---

## Por que a fase é a maior do plano

Ela é uma peça só: o `for await` do Agent SDK é a fonte do stream, e cortá-lo ao meio produz
duas metades que não rodam. O que dá para fatiar é a **ordem interna** — fake primeiro, opções
depois, runner, mapper, domínio, hub —, e é assim que as tasks estão.

Leia [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md) e
[backend/06-realtime](../../architecture/backend/06-realtime.md) **antes** do primeiro arquivo.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-12 — Porta `ClaudeSessionPort` e o SDK fake roteirizado 🔲

A porta em `application/session/ports/`; o fake em `backend/test/fakes/agent-sdk/`, emitindo
`SDKMessage` roteirizados a partir de um script declarativo (uma lista de mensagens, com
pausas controladas por fake timer).

**Vem primeiro de propósito.** Sem ele não existe teste de integração determinístico, não
existe e2e, e a cobertura de 90 % em `adapter/outbound/claude/` seria impossível sem gastar
cota e rede — [estratégia de testes](../../architecture/shared/06-testing-strategy.md#integração--componentes-reais-conversando).

O fake é um risco declarado (R-02 do [plano](README.md#riscos-e-decisões-em-aberto)): quem o
confronta com a realidade é o `smoke-live` da [F6](F6-e2e.md).

### B-13 — `sdk-options.factory` 🔲

Monta `Options` a partir do domínio, com o que a arquitetura já amarrou:
`settingSources: ['project']`, `canUseTool`, `hooks.PreToolUse`, `includePartialMessages`,
`includeHookEvents`, `persistSession`, `enableFileCheckpointing`, `abortController`, limites de
budget e turno.

`allowDangerouslySkipPermissions` é **`false` sempre**, e não vira configuração — um flag assim
acaba ligado.

Por que `['project']` e não omitido nem `[]`:
[a armadilha do `settingSources`](../../architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources).

### B-14 — `input-queue` e `session-runner` 🔲

A fila `AsyncIterable<SDKUserMessage>` que habilita os control requests, e o runner que mantém
**uma** `query()` por sessão, com `query.close()` no `finally` — inclusive quando o loop lançou.

Subprocesso vazado não morre sozinho, e este roda na máquina do usuário.

### B-15 — `sdk-message.mapper` 🔲

`SDKMessage` → evento do nosso contrato, pela
[tabela de mapeamento](../../architecture/backend/04-claude-integration.md#o-mapper--a-tradução-que-protege-o-contrato).
`SDKMessage` cru **nunca** sai do adapter ([ADR-006](../../architecture/shared/00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru)).

A regra de sobrevivência: variante desconhecida vira `warn` e é descartada. Ela **não** derruba
a sessão — é o que permite o SDK ganhar uma variante nova sem tirar o produto do ar.

### B-16 — Domínio `session`: entidade e máquina de estados 🔲

`starting → idle → thinking → running → waitingPermission → idle → closed`, com cada transição
inválida virando erro de domínio — [backend/03](../../architecture/backend/03-modules.md#session).

Regra pura, sem I/O, e é o arquivo onde a cobertura de `branches` mais importa.

### B-17 — Use cases da sessão 🔲

`start`, `prompt`, `interrupt`, `setModel`, `setPermissionMode`, `close`.

**Prompt concorrente enfileira** — é o que o SDK já faz, foi medido, e rejeitar com `409` era
política nossa e era a errada ([R-02 do bootstrap](../00-bootstrap/progress.md#decisões-tomadas-durante-a-execução)).

O limite de sessões simultâneas existe aqui como **número configurado**, com
`SESSION_LIMIT_REACHED`. Derivá-lo da RAM é o [plano 05](../05-hardening-operations/README.md).

### B-18 — Hub, ring buffer e replay 🔲

`SessionHub` com fan-out 1 sessão → N connections, `seq` atribuído **num ponto só**,
`EventBuffer` de 1000 eventos, `attach`/`detach` e o `gap` do
[replay](../../architecture/backend/06-realtime.md#ring-buffer-e-replay).

Publicação é fire-and-forget por connection: socket lento **não** segura o loop do Agent SDK.
Fila estourada → desconecta com `1013` e o cliente reconecta.

### B-19 — Handlers dos comandos no gateway 🔲

Um handler por comando em `adapter/inbound/ws/session/`. O gateway **não contém regra**: valida
o frame, autoriza a connection e chama o use case.

`ack` sai **antes** de qualquer frame causado pelo comando, e significa aceito, não concluído.
Autorização por ação conforme [backend/06](../../architecture/backend/06-realtime.md#autorização-por-connection)
— fechar a sessão é só do dono.

### B-20 — Logging da borda do Agent SDK 🔲

`claude.input`, `claude.output`, `claude.session.lifecycle` em `debug`, com truncamento e
redação conforme [a tabela desta borda](../../architecture/backend/04-claude-integration.md#logging-desta-borda).

Conteúdo de arquivo lido pela tool `Read` **nunca** vai para o log — só `path` e `bytes`.

---

## Cenários cobertos

S-21…S-39.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
