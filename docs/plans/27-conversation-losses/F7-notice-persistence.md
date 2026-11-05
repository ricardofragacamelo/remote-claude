# F7 — Persistência de avisos

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F6](F6-clients.md). Esta fase foi **inserida depois de a E2E (hoje [F8](F8-e2e.md))
já ter começado** — a B-26 dela achou a R-10 em execução — e renumerada para antes dela, porque a E2E
é sempre a última fase do plano (fase nova entra antes, nunca depois). Ver
[progress.md](progress.md#decisões-tomadas-durante-a-execução).
**Entrega:** um `session.notice` emitido ao vivo sobrevive a uma releitura fria do histórico — mesmo
quando o motor nunca grava rastro nenhum dele no próprio transcript —, porque o backend o guarda por
conta própria e o devolve mesclado na mesma leitura que hoje só reconstrói o transcript.

---

## Por quê

A B-26 (E2E, hoje F8) achou a R-10: os dois avisos `agent.info` do `hook-message-turn` (o informativo do hook
que funcionou, o `warning` do que falhou) somem da conversa do app ao reabrir pelo histórico — nunca
ao vivo. Investigado a fundo (não por leitura de código, por instrumentação e por uma rodada real
contra o emulador): não é um bug de render nem de domínio. É o que a F5 já havia medido e documentado
em `historicalSystemEvents` (`transcript.adapter.ts`, B-17): **nenhum `system` que não seja o
`compact_boundary` deixa qualquer rastro no transcript do Claude** — "nem a tool negada
(`permission_denied`), nem o comando local (`local_command_output`)" — e isso vale também para o
`system:informational` e o `system:hook_response` que gritam os dois avisos de hook
([sdk-message-notices.ts](../../../backend/src/adapter/outbound/engines/claude/sdk-message-notices.ts)
`agentInfoNotice`/`hookFailedNotice`). Confirmado ao vivo, contra o emulador real: uma releitura do
histórico depois do reabrir mostra 29 eventos reconstruídos, e nenhum dos dois `agent.info` está
entre eles — exatamente como a medição da F5 previa.

O web (B-25) nunca provoca essa lacuna porque o `reloaded()` de lá reconecta pelo buffer de replay do
`session.attach` (reentrega o que a sessão viva já mandou), nunca por uma leitura do transcript. O app
(`reopenFromHistory`) é o único dos dois que de fato exercita `historicalEvents`/o transcript lido do
zero — e é por isso que só a B-26 encontrou a lacuna.

**Decisão do usuário (D-15):** em vez de reduzir o escopo da S-104/B-26 (aceitar avisos de hook como
"só ao vivo"), o backend passa a persistir o `session.notice` por conta própria, fora do transcript do
Claude, e a devolvê-lo mesclado numa releitura fria. Ver [decisions.md](decisions.md#f8--e2e).

---

## Desenho

- **O armazém é neutro de motor.** Chave `(engine, conversationId, noticeId)` — nunca um id do Claude
  sozinho —, para que um motor futuro tenha o mesmo caminho, mesmo que hoje só o Claude escreva nele.
  Vive fora de `engines/claude/`, como todo o núcleo (regra 12 do `AGENTS.md`).
- **Não duplica o transcript** ([backend/05-persistence](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai)):
  o `session.notice` de hook não tem **nenhuma** outra fonte de verdade — o transcript nunca o
  carrega, medido —, então guardá-lo aqui não cria uma segunda fonte que diverge da primeira; cria a
  **única**. Continua valendo que o conteúdo da conversa (mensagens, tool, compactação) nunca é copiado
  para o Postgres — só o aviso que o próprio motor já perde.
- **Escrita:** no ponto neutro onde todo evento de toda sessão, de qualquer motor, já passa —
  `StartSessionUseCase.onEvent` — um `session.notice` é gravado no armazém, sem bloquear nem atrasar
  a publicação do evento no WS. A promessa de nunca derrubar a sessão viva (S-116) é do **próprio
  contrato da porta** (`NoticeStore.record` nunca rejeita): quem loga e engole a falha é a
  implementação Drizzle, no adapter, nunca o caso de uso — `application/` não importa um logger
  seu (a Dependency Rule), e a regra 9 do `AGENTS.md` ("regra que não é verificada por máquina não
  existe") é o próprio `pnpm lint:arch`, que reprovou a primeira versão disto até a responsabilidade
  de logar se mudar para o lugar certo.
- **Leitura:** o adapter de transcript do Claude (`transcript.adapter.ts`, o mesmo lugar que a F5 já
  usa para reconstruir o `system` do histórico) busca os avisos persistidos da conversa e os mescla
  na lista de mensagens, por posição — pelo `at` do aviso ao vivo (ausente; `recordedAt` supre, do
  mesmo jeito que `historicalSystemEvents`/`unknownOf` já sintetizam um `at` que o motor não dá,
  B-18) contra o `timestamp` real de cada entrada do transcript (`timestampOf`, medido, F5). Um
  `noticeId` que o histórico **já** reconstrói sozinho (a compactação, hoje) vence: o persistido
  correspondente é descartado, nunca duplicado (S-119).
- **Por que no adapter do Claude, não na camada neutra do caso de uso:** só o adapter tem, hoje, o
  `timestamp` de cada entrada real do transcript (`timestampOf`, lido do bruto que o `.d.ts` não
  declara) para posicionar o aviso persistido no lugar certo. O armazém em si — a porta, a tabela — é
  neutro; o motor futuro que quiser mesclar da mesma forma mescla do seu próprio jeito de saber
  "quando", no seu próprio adapter.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-29 — O armazém de avisos ✅

Uma tabela própria (`persisted_notices`, migration `0028`), fora do transcript, chaveada por
`(engine, conversation_id, notice_id)` com índice único — a mesma gravação duas vezes, ou duas
concorrentes, deixam uma linha só (`ON CONFLICT DO NOTHING`). Porta `NoticeStore` em
`application/notice/ports/`, com `record(ref, payload)` e `listFor(ref)`; implementação Drizzle em
`adapter/outbound/persistence/notice/`, pelas convenções do
[backend/05-persistence](../../architecture/backend/05-persistence.md) (schema em `infrastructure/`,
mapper separado, repositório nunca devolve row crua). `payload` é o `SessionNoticePayload` do
contrato, inteiro, em `jsonb` — o mesmo teto de 4 000 caracteres da D-13 já vale no schema, nada novo
a validar aqui. Cenários S-109…S-114.

**Como ficou:** a porta ganhou uma regra que o desenho original não tinha — `record()` **nunca
rejeita** (ver a nota da B-30 abaixo); a implementação Drizzle (`DrizzleNoticeStoreRepository`) captura
qualquer falha da própria escrita, loga via o `PersistenceContext.logger` que todo repositório já tem,
e resolve mesmo assim. Confirmado com `pnpm lint:arch` (o portão de arquitetura, não opinião) e com um
teste de integração que força uma falha real (um `payload.params` circular, que quebra a serialização
do driver) contra o Postgres de verdade (testcontainers) — a chamada resolve, a linha não existe, e o
log de erro aparece. `DrizzleNoticeStoreRepository`/`FakeNoticeStore` (o dublê de teste) implementam a
mesma regra. `pnpm vitest` (6 casos de integração contra Postgres real + 1 de falha) e `tsc` verdes.

### B-30 — A escrita ao vivo ✅

`StartSessionUseCase.onEvent` grava todo `session.notice` no armazém, pela `ConversationRef` da sessão
(`this.registry.conversationOf`, já usado por `engineOf`) — fogo e esquece, nunca bloqueia nem atrasa
`this.broadcaster.publish`. `NoticeStore` entra como dependência opcional no fim do construtor
(`| null = null`, o mesmo padrão de `models`/`configuration` já usado ali) para não quebrar quem
instancia o caso de uso sem ele. Cenários S-115…S-117, S-124.

**Como ficou — um ajuste de arquitetura que `pnpm lint:arch` pegou, não eu:** a primeira versão desta
task injetava um `Logger` no caso de uso para logar uma falha de gravação ali mesmo
(`application/session/start-session.use-case.ts`). O portão de arquitetura reprovou
(`no-outward-dependency-application`): nenhum arquivo de `application/` importa `@shared/logging/logger`
— nem um único outro caso de uso deste backend o faz, medido. Corrigido movendo a responsabilidade de
logar inteira para `DrizzleNoticeStoreRepository` (que já tem um logger, por ser adapter) — o contrato
da porta passou a dizer explicitamente que `record()` nunca rejeita, e `persistNotice()` no caso de uso
voltou a ser uma chamada `void`, sem `catch`, confiando no contrato da porta como já confia em todo
outro — a mesma disciplina que a regra 9 do `AGENTS.md` pede: a responsabilidade mudou de lugar porque
uma regra verificada por máquina a pegou, não por reflexão de código. Cenário S-116 provado na B-29
(a falha é da implementação, não do caso de uso) e aqui (o caso de uso nunca trava nem derruba o
evento publicado, mesmo com a gravação falhando). `pnpm vitest` (5 casos) e `pnpm lint:arch` verdes.

### B-31 — A leitura mesclada ✅

`AgentSdkTranscriptAdapter.messages()` busca os avisos persistidos da conversa (fora do cache do
transcript — o cache é do arquivo, e um aviso novo não muda o `lastModified` do transcript) e os
mescla na lista de `TranscriptMessage` pela posição temporal (`mergedWithPersistedNotices`, função
pura, extraída para `persisted-notice-merge.ts` — testável sem SDK nem Postgres), descartando
qualquer `noticeId` que o histórico reconstruído já carregue. Uma falha ao listar os avisos
persistidos não derruba a leitura: a página volta com as mensagens reais do transcript, sem os avisos
persistidos, e loga o erro (o adapter já tem um `Logger` próprio — nenhum conflito de camada aqui,
diferente da B-30). Cenários S-118…S-123.

**Como ficou:** `toMessage`/`messagesOf` passaram a carregar o `timestamp` real de cada entrada
(`timestampOf`, já medido na F5 — só precisou virar `export`) num tipo interno,
`TimedTranscriptMessage`, que estende `TranscriptMessage` sem mudar o contrato público. A busca dos
avisos persistidos roda **fora** do `TranscriptCache` (que só é invalidado quando o transcript em si
muda) — senão um aviso gravado depois do último cache nunca apareceria até o arquivo mudar de novo.
Provado com 3 testes de unidade no próprio `transcript.adapter.spec.ts` (um `FakeNoticeStore` como
porta) e 5 na função pura de mesclagem (posição, descarte do duplicado, idempotência de reler duas
vezes, a conversa sem nenhum aviso, e um aviso/mensagem sem `at` que não quebra, só não é
posicionado com certeza). A S-123 (um dispositivo que nunca viu nada ao vivo) é, pela porta do
usuário, a própria B-26/S-104 do F8 (E2E) voltando a passar — ver lá. `pnpm vitest` (8 casos novos) e `tsc`
verdes.

---

## Cenários cobertos

S-109…S-124.

---

## Critério de conclusão

```bash
pnpm verify
```

Fechada a F7, a B-26/F8 (E2E) é re-confirmada (S-104 ⛔→✅) e o plano roda o critério de conclusão
inteiro — ver [F8-e2e.md](F8-e2e.md).
