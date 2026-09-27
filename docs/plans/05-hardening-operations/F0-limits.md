# F0 — Limites

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 01](../01-live-session/README.md).
**Entrega:** o backend para de aceitar mais do que a máquina aguenta, devolve o que não está
sendo usado, não deixa processo para trás, e não perde uma notificação por uma falha de rede.

---

## O que torna esta fase diferente

Cada sessão é **um subprocesso real** na máquina do usuário — ~222 MB, medido. Um vazamento
aqui não é uma métrica feia num painel: é a máquina de alguém ficando sem memória enquanto essa
pessoa trabalha.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-01 — Limite derivado da RAM ✅

Em vez de um número fixo, a capacidade sai da memória disponível, com piso e teto
configuráveis. A fórmula é **regra pura** — sem I/O, testável, e é onde o cenário de fronteira
mora.

Estourou → `SESSION_LIMIT_REACHED` (`429`), com `Retry-After`.

**Como ficou ([D-01](decisions.md)):** `floor(RAM × RC_SESSION_MEMORY_FRACTION / RC_SESSION_MEMORY_MB)`,
entre `RC_SESSION_MIN_CONCURRENT` e `RC_SESSION_MAX_CONCURRENT`, lido uma vez no boot — o limite
do cgroup vale como RAM quando existe. A regra é `sessionCapacity()` no domínio; o boot diz a
capacidade calculada numa linha `session.capacity`. `retryAfterSeconds: 30` viaja nos `params`
do erro, porque frame WebSocket não tem cabeçalho.

### B-02 — TTL de sessão ociosa ✅

Ociosa além do prazo é encerrada com `session.closed`, liberando o subprocesso. Sessão
**ativa** não é encerrada — e "ativa" inclui esperar permissão, que é um estado de espera
legítimo, não ociosidade.

**Como ficou ([D-02](decisions.md)):** 30 min (`RC_SESSION_IDLE_TTL_MS`) contados do último evento
do Claude ou do último comando do dono — o registro de sessões anota a atividade em todo
`require`. Só `idle` pode ser ociosa. O `SessionReaperJob` passa a cada quarto do TTL (no máximo
um minuto) e fecha com `session.closed { reason: 'idleTimeout' }` — motivo novo no contrato.

### B-03 — Sessão órfã encontrada no boot ✅

O backend pode morrer sem chamar `close()`; o subprocesso do CLI sobrevive ao pai. Na subida, o
processo varre e encerra os órfãos **marcados como nossos**.

A marca importa: varredura que mata por nome de binário mataria o Claude Code que o usuário
abriu no terminal.

**Como ficou:** o subprocesso nasce com `REMOTE_CLAUDE_OWNER=remote-claude-backend` e
`REMOTE_CLAUDE_PARENT_PID=<pid do backend>` no ambiente. No boot, `OrphanSweep` lê
`/proc/<pid>/environ` dos processos do próprio usuário e encerra (`SIGTERM`, e `SIGKILL` após 2 s)
só os que têm a marca **e** cujo backend não existe mais. Sem `/proc` (macOS), diz que não pôde
olhar — nunca finge que não achou nada. Falha na varredura nunca derruba o boot.

### B-04 — Shutdown ordeiro ✅

Na ordem de [backend/06](../../architecture/backend/06-realtime.md#shutdown): para de aceitar
conexão, avisa as sessões, fecha os sockets com `1001`, `query.close()` em **todas**, drena o
pool. Pular o quarto passo deixa processo órfão na máquina do usuário.

Chamar duas vezes é inofensivo.

**Como ficou:** `GracefulShutdown` (em `onModuleDestroy`) é o dono da ordem, porque ela atravessa
módulos: o gateway para de aceitar e fecha os sockets; `ShutdownSessionsUseCase` anuncia e depois
fecha os subprocessos; o pool do banco drena no `onApplicationShutdown`, que o Nest roda depois de
todo `onModuleDestroy`.

### B-05 — Rate limit por connection ✅

Frames por segundo, tamanho de frame e sessões anexadas. Estourou → `error` com
`RATE_LIMITED`; reincidiu → fecha com `4429`. `429` e `503` **sempre** trazem `Retry-After` —
sem ele o cliente martela.

**Como ficou:** balde de fichas por connection (`RC_WS_MAX_FRAMES_PER_SECOND`), contado antes de
decodificar. Estourou → `error` `RATE_LIMITED` com `params.retryAfterSeconds: 1`; outro frame
dentro dessa janela → `4429`. Sessões anexadas (`RC_WS_MAX_ATTACHED_SESSIONS`) são checadas
**antes** do handler, porque `session.start` gera subprocesso. No HTTP, o filtro põe `Retry-After`
em todo `429` e `503`, com o valor do erro ou 1 s. Web e app, depois de um `4429`, esperam pelo
menos o que o servidor pediu.

### B-06 — Limites anunciados no handshake ✅

O `connection.ready` já carrega `limits`; aqui eles passam a ser reais e configuráveis. Cliente
que conhece o limite não precisa descobri-lo apanhando.

**Como ficou:** `limits` ganhou `maxFramesPerSecond` e `maxAttachedSessions` (mudança de contrato,
nas três pontas); `maxFrameBytes` vem de `RC_WS_MAX_FRAME_BYTES`.

### B-07 — Heartbeat e idle sob carga ✅

`ping` a cada 30 s, sem `pong` em 10 s fecha com `4408`. Conferir que isso se mantém com o
servidor ocupado — heartbeat que atrasa sob carga derruba conexão saudável.

**Como ficou:** os tempos vivem em `WsSettings`, injetável — a suíte encurta o heartbeat e prova
os dois lados (S-60): quatro batidas com o cliente mandando frames sem parar, e `4408` para quem
não responde o `ping`.

### B-25 — Nova tentativa do push ✅

Hoje o `NotifyPermissionUseCase` chama o provedor **uma vez**: `failed` vira `warn` e acabou.
No e2e do [plano 02](../02-mobile-approval/progress.md) (ciclo 32), um `connect timeout` ao buscar
o token de acesso do provedor perdeu a notificação do pedido, e a retirada, segundos depois,
entregou com `200`. [D-05 do plano 02](../02-mobile-approval/decisions.md#d-05--quando-o-push-não-sai)
decidiu "sem segundo canal", não "sem nova tentativa".

`failed` passa a ser tentado de novo, com recuo e um número limitado de tentativas
([D-09](decisions.md)), tanto no aviso quanto na retirada. Três coisas não mudam:

- `tokenRejected` é permanente e **não** é tentado de novo — o token é apagado, como em D-13;
- a nova tentativa nunca segura o pedido de permissão, e nunca passa do `expiresAt` dele;
- pedido que se resolve durante o recuo cancela a tentativa pendente: nenhum aviso chega depois
  da retirada.

`Retry-After` do provedor, quando vem, manda no recuo. Esgotou → um `warn` só, com o número de
tentativas.

**Como ficou ([D-09](decisions.md)):** `PushDispatcher` na aplicação — só a primeira tentativa é
aguardada; as outras vão pelo `Scheduler`. 3 tentativas, 1 s → 4 s com 20 % de jitter. O
`PushSender` passou a separar `failed` (rede, `401`, `408`, `429`, `5xx` — tentado de novo) de
`rejected` (demais `4xx` — não). A retirada **para** o aviso: cancela o que está agendado e espera
o que está no fio antes de sair, o que garante S-50 e S-51. No e2e de push real, o backend
roteirizado falha o primeiro aviso de propósito (`RC_E2E_PUSH_FAIL_FIRST`).

S-53 rodou em 2026-09-27 (`pnpm test:e2e:mobile:push`, API 35, `Successful: 1`): o aviso saiu da
primeira tentativa sem chamada HTTP (a falha forçada), a nova tentativa partiu ~0,8 s depois —
dentro de 1 s ± 20 % — e o provedor respondeu `delivered`; o patrol tocou a notificação e aprovou.

### B-26 — Prazo no cliente para uma retomada sem resposta ✅

Herdada do [plano 04](../04-transcript-and-resume/progress.md#escopo-reduzido-ou-adiado). O backend
sempre responde a um `session.start` com `resumeSessionId` — sessão, junção ou recusa —, então
silêncio é resposta perdida com o socket. Web (`useResumeSession`) e app (`ResumeController`)
param de esperar em 30 s, dizem `RESUME_TIMEOUT` (chave `session.error.resumeTimeout`) e deixam
tentar de novo; resposta antes do prazo cancela o prazo.

### B-27 — Prompt durante um desfazer ✅

Herdada do [plano 04](../04-transcript-and-resume/progress.md#escopo-reduzido-ou-adiado). A trava do
desfazer saiu do caso de uso e foi para a entidade `Session`, onde o prompt também a enxerga: prompt
que chega enquanto os arquivos voltam é recusado com `SESSION_LOCKED` (`reason: rewindRunning`) —
checado antes e depois de ler o menu de comandos, que é onde o desfazer pode entrar no meio.

---

## Cenários cobertos

S-01…S-14, S-47…S-60.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
