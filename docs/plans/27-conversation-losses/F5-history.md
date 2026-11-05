# F5 — Histórico

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-tool-media.md), com o que a B-01 mediu do JSONL.
**Entrega:** o histórico mostra o mesmo que o ao vivo mostrou: as entradas `system` são lidas e
passam pelas mesmas funções do ao vivo, e compactação e aviso têm id estável, sem duplicar nem
sobrescrever.

---

## Por quê

O histórico perde por dois motivos, não um
([discovery §6](../../discovery/09-perdas-do-backend-na-conversa.md#6-perdas-do-histórico)): o adapter
chama `getSessionMessages` sem `includeSystemMessages`, e o `historicalEvents` devolve `[]` para todo
`system`. Corrigir só o segundo não muda nada na tela.

Vem depois das F3 e F4 porque reaproveita as funções delas: o histórico passa pelo `fromSystem`, como o
plano 22 fez com `assistant` e `user` (princípio 4).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-16 — Ler as mensagens de sistema ✅

O `transcript.adapter.ts` do adapter do Claude (em `adapter/outbound/engines/claude/`, desde a
[F1 do plano 28](../28-agent-neutral-core/F1-engine-port.md)) chama `getSessionMessages` com
`includeSystemMessages: true`. O custo que a B-01 mediu fica como teto num teste de integração, e o
cache por versão do plano 22 (o `transcript-reads.ts`, no mesmo lugar) continua valendo (R-03). Cenários S-63, S-64.

**Como ficou:** `readWhole()` passa `includeSystemMessages: true` sempre, para a cadeia principal —
não para a leitura de subagent (`getSubagentMessages`, que a B-01 nunca mediu carregando `system`).
O teste de teto (`transcript.adapter.spec.ts`) **não** reproduz o custo real do SDK — isso só a B-01
mediu, ao vivo, numa conversa de 2 turnos ("poucos ms"); uma conversa longa nunca foi medida, e R-03
segue parcialmente aberto por isso. O teste aqui limita o custo do **nosso próprio** código de
mapeamento (o `SdkMessageMapper` único por leitura da B-17) contra 1.500 entradas sintéticas — uma
rede de segurança contra uma regressão O(n²) nossa, não uma medição do SDK. O cache por versão
(`transcript-reads.ts`) não precisou de nenhuma mudança: ele já era opaco à opção passada.

### B-17 — O histórico pelas funções do ao vivo ✅

O `historicalEvents` deixa de devolver `[]` para `system`: cada subtipo do JSONL que a B-01 achou é
mapeado para o **mesmo** evento do ao vivo. O que não tiver par vai para a linha `unknown` da B-13, e
deixa de sumir sem log (U-03). Para cada fixture da F0, a sequência de eventos do histórico é igual à
do ao vivo, conferida pelo `scripted-transcripts`. Cenários S-65…S-67.

**Como ficou — a medição mudou o desenho:** a B-01 original (sonda 1) mediu só o `compact_boundary`
sob `includeSystemMessages`. A F5 estendeu a medição ao vivo (três sessões novas: tool negada por
regra, `/cost` e um `/compact` de verdade) e achou algo mais extremo do que o texto da F2/F3 supunha:
**nenhum outro subtipo de `system` deixa qualquer traço no histórico** — nem a tool negada
(`permission_denied`), nem o comando local (`local_command_output`). Só o `compact_boundary` deixa
alguma coisa, e o que deixa é um marcador **vazio**: `{ type: 'system', uuid, session_id,
parent_tool_use_id, parent_agent_id, timestamp }`, sem `subtype` e sem `compact_metadata` nenhum —
nada para despachar pelo `SYSTEM_HANDLERS` que a B-09 construiu para o vivo. Por isso:

- `historicalSystemEvents` **não** reusa `fromSystem`/`SYSTEM_HANDLERS` (que dependem de campos que o
  histórico nunca dá) — um `system` sem `subtype` é tratado, por posição, como o `compact_boundary`
  (é o único caso já medido), prime o `pendingInjected` do mapper do mesmo jeito que o handler ao
  vivo faz, e os dois convergem no mesmo efeito. Um `subtype` que uma versão futura do SDK vier a
  persistir cai na mesma regra de sobrevivência de uma variante desconhecida ao vivo (B-13) — nunca
  em `[]` de novo, que era o próprio bug U-03.
- O resumo sintético e o eco do `/compact`/`/cost` **já chegavam** ao histórico mesmo sem
  `includeSystemMessages` (são `user`, não `system`) — só não eram **reconhecidos** como tais. O
  histórico os marca com campos **diferentes dos do vivo**: `isCompactSummary`/`is_meta` onde o vivo
  tem `isSynthetic`, `isCompletedLocalCommand` onde o vivo tem `isReplay`. `historicalUserEvents` lê
  esses nomes e chama o **mesmo** `userEvents()` que o vivo usa — a função não muda, só o que a
  alimenta.
- A expansão de `/comando` (`<command-name>`/`<command-message>`/`<command-args>`) é um caso que **só
  existe no histórico** — medido (F0, B-01): ao vivo não há eco nenhum de um comando de projeto, e o
  prompt mostrado é o que o próprio backend mandou. `commandExpansionOf` (novo, só para o histórico)
  lê as duas tags por conta própria, nunca por ordem fixa — a sonda achou `/greet` com
  `<command-message>` primeiro e `/compact` com `<command-name>` primeiro, na mesma versão do CLI.
- A tool negada por regra do projeto (`permission_denied`) **não deixa rastro nenhum** no histórico —
  nem um marcador vazio, diferente do `compact_boundary`. O único sinal é o `tool_result` em si
  (`is_error: true`, mais um texto do motor dizendo "has been denied"), e esse texto é exatamente o
  que a D-03 proíbe usar para decidir algo. **Lacuna aceita, documentada**: no histórico, uma tool
  negada aparece como uma falha comum (`status: 'failed'`), nunca como `status: 'denied'` — o campo
  continua existindo só ao vivo (B-10). Ver a tabela de escopo reduzido do `progress.md`.
- O `Skill` do assistente (que abre a injeção `instructions`) **já tinha** o mecanismo pronto — só
  faltava o fio: `historicalEvents` passa `onSkillStarted` para `assistantEvents` exatamente como o
  vivo faz, e o mapper (agora um só por leitura inteira, não um por mensagem) carrega o
  `pendingInjected` até a próxima mensagem sintética, igual ao vivo.

### B-18 — Ids estáveis ✅

O `session.compacted` sai com o `compactionId` (o `uuid` do `compact_boundary`), e o aviso com o
`noticeId`, ao vivo, no replay e no `transcript.appended`. A linha de compactação cai no lugar da
cadeia que o SDK reconstrói depois do `/compact` (o `compactedChain` do
[scripted-transcripts.ts](../../../backend/test/fakes/agent-sdk/scripted-transcripts.ts)), o mesmo em
que caiu ao vivo. Cenários S-68…S-71.

**Como ficou:** `compactionId` entrou no handler **ao vivo** do `compact_boundary` também (não só no
histórico) — a B-09 da F3 não o tinha posto lá, e os dois lados têm que concordar no mesmo `uuid` para
a estabilidade valer. O `trigger` do `session.compacted` reconstruído do histórico é um **melhor
esforço documentado**: o marcador vazio (ver B-17) não dá nenhum jeito de saber `manual` de `auto` —
sai sempre `manual`, porque toda compactação que este plano mediu ao vivo foi um `/compact` digitado.
Isso é uma lacuna real, não uma garantia: uma compactação automática (contexto cheio) lida de volta do
histórico mostraria `manual` incorretamente. Fica para quando o SDK vier a persistir o gatilho.

`at` entrou no `session.notice` (campo novo em `NoticeFields`/`notice()`, já previsto no schema da F2
mas nunca ligado) — line a `unknownNotice`, que é o único aviso que o histórico de fato reconstrói
hoje (S-71). `session.compacted` **não** ganhou `at`: o schema da F2 não o declara, e abrir essa porta
agora seria uma mudança de contrato fora do escopo desta fase — documentado no
[05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente).

A duplicação (S-70, "histórico carregado por cima do ao vivo, nenhum aviso duplicado") já era coberta
pelo mecanismo genérico existente, por `TranscriptMessage.id` (o `uuid` da entrada) — o
`transcriptTail` de `transcript-tail.ts` já cortava por esse id antes da F5; a novidade é só que agora
um `system`/`compact_boundary` **participa** dele, porque `toMessage` sempre o indexava como qualquer
outra entrada. Nenhuma mudança própria foi precisa ali — só testes provando que o mecanismo cobre o
caso novo, em `sdk-message.mapper.history.spec.ts`.

A `compactedChain()`/`asTranscript()` do `scripted-transcripts.ts` (infraestrutura do plano 22) corta o
`compact_boundary` **fora** da cadeia que devolve — um atalho de teste anterior a esta medição, usado
por vários testes que já têm suas próprias asserções de posição (ex.: o teste de rewrite do
`live-history.spec.ts`, S-123 do plano 22). Mexer nisso para incluir o marcador arriscava quebrar
aquelas asserções sem necessidade: a prova de B-18 (S-68, S-69) foi feita com uma fixture própria,
escrita à mão a partir da forma real medida (`sdk-message.mapper.history.spec.ts`, bloco "a cadeia de
compactação lida de volta"), não por cima do `compactedChain()` existente. Registrado aqui para quem
for mexer em `asTranscript()` depois: ele não reproduz um `getSessionMessages` real pós-`/compact`.

---

## Cenários cobertos

S-63…S-71.

---

## Critério de conclusão

```bash
pnpm verify
```
