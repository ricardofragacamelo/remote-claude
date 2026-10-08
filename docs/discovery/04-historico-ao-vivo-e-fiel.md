# Proposta — Histórico ao vivo e fiel ao Claude Code

**Estado:** virou o [plano 22 — Histórico ao vivo](../plans/22-live-history/README.md) em 2026-10-04. As decisões em aberto do §11 foram decididas lá ([decisions.md](../plans/22-live-history/decisions.md)), com IDs novos. Nenhum código escrito.
**Criada em:** 2026-10-04, a partir de uma conversa com o usuário. Ele abriu, ao mesmo tempo, a mesma
sessão no painel do remote-claude ("Do histórico") e na extensão do Claude Code no VS Code, e disse:
"não estão aparecendo as mesmas mensagens, eu queria que tudo chegasse no remote-claude"; "e parou de
mandar coisas para o chat que está na UI do remote-claude para a mesma sessão"; "também tem que
arrumar no mobile".
**Destino:** servir de insumo para um plano em [docs/plans/](../plans/README.md). Esta proposta **não**
é um plano: não tem fases com tarefas nem critério de conclusão. Ela fixa o **quê** e o **porquê**,
com a evidência de cada lacuna, mede o custo e lista o que falta decidir antes de virar plano.

---

## 1. O pedido

A sessão observada é a `ebfc173a-0ca2-4a36-9420-9ecb0c8d6abe` ("Script instalação mobile USB e
endereços"). Ela foi iniciada e estava sendo conduzida **no VS Code**, enquanto o painel do web a
mostrava pelo leitor de histórico. Lado a lado, as duas telas diferiam em duas coisas:

1. **O remote-claude parou.** O leitor mostrava a conversa até um `flutter test … folder_sessions_panel_test.dart`.
   O VS Code, na mesma hora, já estava várias mensagens adiante: "The scroll helper found several
   scrollables…", o registro da D-29, o início dos portões. Tudo isso já estava gravado no transcript,
   mas não chegou ao painel.
2. **O que chegou não era o mesmo que o VS Code mostra.** O pensamento aparecia como "Pensou — o
   modelo não mostrou", e não como "Thought for 10s". O Bash mostrava o comando, e não a descrição
   ("Target the drawer scrollable; rerun S-170"). A saída da ferramenta não aparecia. Havia um
   cabeçalho "CLAUDE" antes de cada passo, e não havia indicador de "trabalhando".

O pedido é que **tudo** o que o Claude Code mostra de uma conversa chegue ao remote-claude, **ao vivo**,
no web **e** no mobile, mesmo quando a conversa está sendo conduzida em outro cliente.

---

## 2. Vocabulário

| Termo | Significado |
|---|---|
| **Leitor** | a tela que mostra uma conversa do histórico, só para ler: `ConversationReader` no web, `ConversationHistoryPage` no mobile. Tem o botão "Continuar esta conversa" (web) / "Retomar" (mobile). |
| **Sessão viva** | uma sessão que **este backend** opera pelo `query()` do Agent SDK. Os clientes a acompanham pelo WebSocket (`session.attach`). |
| **Conversa ativa em outro cliente** | uma conversa de origem `external` (VS Code, terminal) escrita dentro da janela `RC_TRANSCRIPT_ACTIVE_WINDOW_SECONDS` (120 s): `activity = 'activeElsewhere'` ([transcript-activity.ts](../../backend/src/domain/transcript/services/transcript-activity.ts#L46-L61)). Este backend não a opera, e só a enxerga pelo transcript. |
| **Transcript** | o histórico que o Claude Code grava em `~/.claude/projects/`. O backend o lê **só** pelo Agent SDK (`getSessionInfo`, `getSessionMessages`) e nunca abre o arquivo ([transcript.adapter.ts](../../backend/src/adapter/outbound/claude/transcript.adapter.ts#L30-L35), S-09). |
| **Entrada** | uma `SessionMessage` do SDK. O Claude Code grava **um bloco de conteúdo por entrada**: uma resposta da API com `thinking`, `text` e `tool_use` vira três entradas com o mesmo `message.id` e `uuid`s distintos. |
| **Acompanhar** (*follow*) | o mecanismo novo desta proposta: o leitor recebe, por push, as entradas que o transcript ganhou depois da última que ele tem (§5). |
| **Pensamento omitido / resumido** | `thinking` sem texto (o padrão do CLI) ou com o resumo pedido por `display: 'summarized'` ([descoberta §10.7](01-descoberta-claude-agent-sdk.md#107--thinking-vem-omitido-por-padrão-display-summarized-o-traz-d-17)). |

---

## 3. Princípios

1. **O transcript continua sendo lido só pelo SDK.** Acompanhar não abre arquivo, não usa `fs.watch`
   e não interpreta o JSONL. A regra de arquitetura (S-09, `pnpm lint:arch`) não ganha exceção.
2. **Um evento, um formato.** O que chega ao vivo pelo acompanhamento tem a mesma forma do histórico e
   da sessão viva (`message.completed`, `tool.started`, `tool.completed`), e é dobrado pelo **mesmo
   redutor** ([B-03 do plano 04](../plans/04-transcript-and-resume/F0-transcript.md)). Não nasce um
   terceiro formato.
3. **A ordem é a do SDK, nunca a do relógio.** O SDK devolve as entradas na ordem da cadeia
   `parentUuid`, que é a ordem que o modelo viu. Os timestamps podem discordar dela (§4.7).
4. **Mostrar o que existe, e dizer quando não existe.** Quando o transcript não guarda um dado que o
   VS Code mostra (a duração exata de um pensamento, por exemplo), a tela mostra o que dá para saber
   com honestidade, e não inventa precisão (§4.3).
5. **Web e mobile na mesma entrega.** Toda mudança de contrato e de tela vale para as duas pontas,
   como o [05 §Contrato](../architecture/shared/05-websocket-protocol.md) já exige.
6. **Custo proporcional à mudança.** Perguntar "mudou?" tem que ser barato. O caro (reler a conversa)
   só acontece quando ela mudou, e é feito uma vez para todos que a acompanham (§5.4).

---

## 4. Diagnóstico

Cada item tem a evidência, a causa no código e a correção proposta. As referências de linha são do
`main` em 2026-10-04.

### 4.1 Comparação lado a lado

| O que o VS Code mostra | Web (leitor) | Mobile (leitor) | Item |
|---|---|---|---|
| a conversa crescendo enquanto o Claude trabalha | para na leitura inicial | para na leitura inicial | §4.2 |
| "Hatching…" (está trabalhando) | nada | nada | §4.2 |
| "Thought for 1s" no pensamento omitido | "Pensou — o modelo não mostrou" | "Pensou" | §4.3 |
| o texto do pensamento resumido, à vista | "Pensou", recolhido | "Pensou", recolhido | §4.3 |
| **Bash** + a `description` ("Target the drawer scrollable…") | "Bash: (primeira linha do comando)" | o nome da ferramenta e o `input` cru | §4.4 |
| IN (comando) e OUT (saída) ao expandir | JSON do `input` + 200 caracteres do início da saída | `Map.toString()` do `input` + os 200 caracteres | §4.5 |
| uma linha do tempo contínua, sem autor por passo | um cabeçalho "CLAUDE" por resposta da API, inclusive vazio | sem cabeçalho | §4.6 |
| o prompt enviado no meio do turno | aparece (na ordem do SDK) | aparece | §4.7 |
| prompt com imagem | cabeçalho "Você" vazio | balão vazio | §4.7 |
| — | aviso "ativa em outro cliente" fixo na abertura | **nenhum aviso** e nenhuma confirmação antes do fork | §4.8 |

### 4.2 O leitor não acompanha a conversa (web e mobile) — o problema principal

**Evidência.** A conversa `ebfc173a` tinha 1 546 entradas no SDK no momento da medição. O leitor do
web mostrava até a entrada do `flutter test` (`msg_…oSm3ae`). As entradas seguintes (`…PJ2VDw`,
`…vef9MB`, `…wJs5VW`, …) já eram devolvidas por `getSessionMessages`, mas nunca foram pedidas.

**Causa.**

- **Web:** [useConversationHistory.ts](../../web/src/features/session/hooks/useConversationHistory.ts#L50-L55)
  lê pelo `usePagedQuery` com `refetchOnWindowFocus: false` e sem `refetchIntervalMs`, então o
  `refetchInterval` fica `false` ([usePagedQuery.ts](../../web/src/shared/hooks/usePagedQuery.ts#L73-L75)).
  Nada invalida `historyKeys.pages`. O `activity` é tirado da primeira página e nunca mais muda
  ([useConversationHistory.ts](../../web/src/features/session/hooks/useConversationHistory.ts#L79)).
- **Mobile:** `ConversationHistoryController.build` lê uma vez
  ([conversation_history_controller.dart](../../mobile/lib/features/session/presentation/providers/conversation_history_controller.dart#L81-L84)).
  Só existe `reload()` no botão de erro, sem timer e sem `RefreshIndicator`.
- **Contrato:** não há comando nem evento para acompanhar um transcript. O histórico é só HTTP
  ([05-websocket-protocol](../architecture/shared/05-websocket-protocol.md)), e `session.attach`
  vale apenas para sessões vivas **deste** backend.
- **Backend:** não há nada que detecte que um transcript mudou e avise alguém. O `lastModified`
  só é consultado quando alguém pede uma página ou a listagem.

**Agravante — nenhum "trabalhando".** O VS Code mostra "Hatching…" enquanto o Claude trabalha. O
leitor não tem como saber disso. O transcript não grava o estado do turno, mas permite inferi-lo:
última entrada é um `tool_use` sem `tool_result`, ou um prompt sem resposta, e `lastModified` recente.

**Correção.** O mecanismo de acompanhamento do §5, nas duas pontas, mais um indicador "trabalhando
em outro cliente" inferido (§5.6).

### 4.3 Pensamento: rótulo, duração e conteúdo

**Evidência**, na conversa `ebfc173a`:

- 333 blocos `thinking`, dos quais **237 sem texto** (omitidos, o padrão do CLI). O VS Code os mostra
  como "Thought for Ns". O web os mostra como "Pensou — o modelo não mostrou", ou seja, ⅔ dos
  pensamentos de uma conversa feita no VS Code viram um aviso de ausência.
- Na resposta `…vef9MB`, o VS Code mostra "Thought for 10s" e, abaixo, o parágrafo "All eight panel
  tests pass. I'm flagging one case honestly…". No SDK, esse parágrafo é o **segundo bloco `thinking`**
  da resposta (o resumido), e não um `text`. Ou seja, o VS Code exibe o pensamento resumido à vista,
  como texto corrido; o remote-claude o recolhe sob "Pensou". *Não verificado:* se o VS Code usa um
  estilo atenuado para ele (a captura não permite distinguir).

**Causa.**

- **Rótulo:** [ThinkingBlock.tsx](../../web/src/features/session/components/conversation/ThinkingBlock.tsx#L17-L21)
  escolhe `sessions.thinking.hidden` quando o texto é vazio. O backend omite o campo `thinking` vazio
  ([sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L455-L469)).
  As sessões do próprio remote-claude pedem `display: 'summarized'`, mas as do VS Code e do terminal
  não pedem, então para elas o "omitido" é a regra, e não a exceção. O mobile só usa "hidden" para
  `isRedacted` ([thinking_line.dart](../../mobile/lib/features/session/presentation/widgets/thinking_line.dart#L84-L98)),
  e as duas pontas divergem.
- **Duração:** a [D-17 do plano 08](../plans/08-claude-panel/decisions.md) decidiu "mostrado
  recolhido, **com a duração**". Isso só vale ao vivo. O redutor mede `thinkingMs` pelos timestamps
  dos frames ([conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts#L227-L257)),
  e o histórico é dobrado com `ts: ''` ([conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts#L88)),
  então nunca há duração. No mobile, `startedAt`/`endedAt` vêm `null` do histórico.
- **Perda de bloco:** a deduplicação do redutor compara tipo e texto
  ([conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts#L331-L348)).
  Dois pensamentos omitidos na mesma resposta são "iguais", e o segundo some. O mobile faz o mesmo
  ([conversation.dart](../../mobile/lib/features/session/domain/entities/conversation.dart#L490-L495)).

**O que o transcript sabe da duração.** Cada entrada tem `timestamp`, que é o instante em que o bloco
foi **gravado** (fim do bloco). O intervalo entre a entrada anterior e o primeiro bloco da resposta
foi medido contra o VS Code:

| Resposta | Intervalo no transcript | VS Code |
|---|---|---|
| `…PJ2VDw` | 5,2 s | Thought for 1s |
| `…vef9MB` | 12,4 s | Thought for 10s |

O intervalo inclui a latência até o primeiro token, então é um **limite superior** da duração, e não
a duração. O VS Code mede ao vivo, e o transcript não guarda essa medida.

**Correção.**

1. O pensamento omitido passa a ser rotulado como pensamento ("Pensou", com duração quando houver), e
   não como ausência. Ao abrir, continua a dizer que o modelo não mostrou o conteúdo
   (`sessions.thinking.nothingShown`). Web e mobile com a mesma regra.
2. O histórico ganha o `timestamp` de cada entrada (§6.1). A duração mostrada é a do intervalo, com a
   formulação de limite: "Pensou por até 5 s". Decisão HV-03.
3. O pensamento resumido: à vista (como o VS Code) ou recolhido (como a D-17 decidiu). É revisão de
   uma decisão do usuário, então fica em aberto: HV-04.
4. A deduplicação passa a ser por **identidade do bloco**, e não por conteúdo. O backend envia um
   `blockId` em cada bloco (o `uuid` da entrada no histórico, `<messageId>:<index>` ao vivo), e o
   redutor descarta só o mesmo `blockId` visto duas vezes (§6.1).

### 4.4 Título da ferramenta: a `description` do Bash

**Evidência.** O VS Code mostra **Bash** e a descrição que o modelo deu ("Record D-29, adjust S-162,
mark scenarios"). O remote-claude mostra "Bash: cd /home/ricardocamelo/projects/remote-claude && p…".

**Causa.**

- O contrato **já tem** `tool.started.title`, um "short human label … derived by the backend"
  ([tool-started.schema.json](../../packages/contracts/schema/events/tool-started.schema.json#L22-L25)).
  O backend, porém, nunca o preenche ([sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L280-L286)).
- O web monta o rótulo do Bash com `firstLine(input.command)`
  ([tool-labels.ts](../../web/src/features/session/lib/tool-labels.ts#L98-L102)) e só lê
  `description` para Agent/Task.
- O mobile mostra o nome da ferramenta e o `input` como `Map.toString()`
  ([tool_card.dart](../../mobile/lib/features/session/presentation/widgets/tool_card.dart#L135)).

**Correção.** O backend preenche `title` com a `description` do `input` quando ela existe (Bash e
qualquer ferramenta que a traga). O web e o mobile usam `title` quando presente e, na falta dele, o
rótulo atual. O comando completo vai para o bloco IN (§4.5). Decisão HV-05 sobre quem compõe o
rótulo.

### 4.5 Entrada e saída da ferramenta (IN/OUT)

**Evidência.** O VS Code, ao expandir, mostra IN com o comando e OUT com a saída (no exemplo,
`00:02 +8: All tests passed!` e `✗ 1 problem(s) in the documentation graph`). O remote-claude mostra
o `input` inteiro como JSON e até 200 caracteres do **início** da saída.

**Causa.**

- `summarise` corta em 200 caracteres pela **cabeça**
  ([sdk-message.mapper.ts](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L478-L482)).
  Numa saída de teste ou de build, o que importa (o resultado) fica no fim.
- Quando o `tool_result` é uma lista de blocos, `summarise` aplica `JSON.stringify` e o cliente
  recebe `[{"type":"text","text":"…`. O próprio arquivo já tem `resultText`, que junta os textos, mas
  ele não é usado aqui.
- O corte vale ao vivo **e** no histórico (mesmo caminho `userEvents` → `summarise`). O contrato diz
  que "the full output is the transcript's job" ([protocol.ts](../../packages/contracts/src/protocol.ts#L539)),
  mas não existe rota que entregue a saída completa a partir do transcript.
- O web mostra o input como `JSON.stringify(tool.input, null, 2)`
  ([ToolRow.tsx](../../web/src/features/session/components/conversation/ToolRow.tsx#L104-L113)).
  O mobile mostra o card sempre aberto, com `Map.toString()`.

**Correção.**

1. O `summary` continua curto (é o que trafega no stream e no buffer de replay), mas passa a ser
   **texto** (via `resultText`) e a guardar **as últimas linhas**, e não os primeiros caracteres.
   Decisão HV-06 sobre o tamanho e o corte.
2. Rota nova `GET /transcripts/:id/tools/:toolUseId/result`: a saída completa de uma ferramenta, lida
   do transcript pelo SDK, com teto de tamanho e o mesmo cercado de leitura do `ReadTranscriptUseCase`.
   O cliente só a pede quando o card é expandido. Vale para o leitor e também para a sessão viva,
   cujo transcript é o mesmo arquivo (§6.2).
3. Layout IN/OUT por tipo de ferramenta, no web e no mobile: Bash mostra o `command` em mono no IN e
   a saída (ANSI) no OUT; as demais mantêm a apresentação atual do input. O card do mobile passa a
   recolher, como o do web.

### 4.6 O cabeçalho "CLAUDE" a cada resposta

**Evidência.** Na captura do web, há um "CLAUDE" antes de cada Bash, porque cada ida e volta de
ferramenta é uma resposta nova da API. O VS Code mostra uma linha do tempo contínua.

**Causa.** [MessageItem.tsx](../../web/src/features/session/components/conversation/MessageItem.tsx#L120-L122)
desenha o autor em toda entrada de mensagem, e nada olha a entrada anterior. Além disso, uma resposta
feita só de `tool_use` gera uma mensagem sem blocos visíveis, ou seja, um cabeçalho vazio
([conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts#L316-L329),
[conversation-reducer.ts](../../web/src/features/session/services/conversation-reducer.ts#L366-L386)).
O mobile não tem cabeçalho de autor.

**Correção.** O autor aparece uma vez por **turno** (da mensagem do usuário até a próxima), e uma
mensagem sem bloco visível não desenha cabeçalho. A forma (cabeçalho agrupado ou linha do tempo com
marcadores, como o VS Code) é a decisão HV-07. Ela vale para o leitor **e** para a sessão viva, que
usam os mesmos componentes.

### 4.7 Prompts do usuário: enfileirados e com imagem

**Prompt enviado no meio do turno — verificado, sem correção.** "já está implementando o push? o que
você está fazendo?" foi enviado com o Claude trabalhando. O Claude Code grava um `attachment` do tipo
`queued_command`, e o SDK o devolve como entrada `user` com texto. O backend o mapeia para
`message.completed` com papel `user`, e as duas pontas o mostram. O timestamp dele (`11:59:27.826`) é
**anterior** ao do `tool_result` que o precede na cadeia (`11:59:28.913`). A ordem do SDK é a correta,
porque foi depois desse resultado que o modelo leu a pergunta. Fica um cenário de teste (§9) para que
ninguém "corrija" isso ordenando por timestamp.

**Prompt com imagem — a corrigir.**
[toContentBlock](../../backend/src/adapter/outbound/claude/sdk-message.mapper.ts#L458-L470) envia só
`type`, então a imagem chega como `{ type: 'image' }`, sem nada. O redutor do web descarta o bloco e
desenha "Você" vazio. O mobile desenha um balão vazio. **Correção:** o bloco de imagem leva
`mediaType` e o tamanho (nunca os dados), e as duas pontas mostram um marcador "imagem anexada"
traduzido. Abrir a imagem pela rota de saída do §6.2 fica para a decisão HV-08.

### 4.8 O mobile ignora `activity`

O mapper do mobile não lê `activity` ([history_mapper.dart](../../mobile/lib/features/session/data/mappers/history_mapper.dart#L20-L54)),
e a entidade `HistoryPage` não tem esse campo. Por isso o mobile não avisa que a conversa está ativa
em outro cliente e não pede confirmação antes de fazer fork dela, como o web faz
([ConversationReader.tsx](../../web/src/features/session/components/ConversationReader.tsx#L152-L156),
[ConversationReader.tsx](../../web/src/features/session/components/ConversationReader.tsx#L182-L213)).
**Correção:** o mobile passa a ter os dois comportamentos, e o aviso de ambos passa a ser **atualizado
pelo acompanhamento** (`activity` vem em cada `transcript.appended`).

### 4.9 Outras divergências entre web e mobile, e a relação com o plano 10

Na comparação apareceram mais três divergências entre o web e o mobile. Nenhuma delas muda o
[plano 10](../plans/10-mobile-chat-layout/README.md), que está na F6 e cuja F7…F10 não toca o leitor de
histórico.

| Divergência | Situação no plano 10 | Destino |
|---|---|---|
| **Rótulos**: "Retomar" (`historyResumeAction`) × "Continuar esta conversa" (`history.screen.resume`); "Concluída" (`sessionToolStatusSucceeded`) × "Pronto" (`session.toolStatus.succeeded`) | a [D-04](../plans/10-mobile-chat-layout/decisions.md#f0--normas) criou o mapa declarado [i18n-shared.json](../../scripts/i18n-shared.json), que o `i18n:check` usa para comparar web e app texto a texto. O mapa só cobre os verbos, a pílula, o pensamento e a faixa de encerrada, e por isso esses rótulos divergem sem que o portão acuse. A F0, onde o mapa nasceu, está concluída | **entra nesta proposta**: alinhar os textos e acrescentar os pares `history.screen.resume` ↔ `historyResumeAction` e `session.toolStatus.*` ↔ `sessionToolStatus*` ao mapa (§6.5) |
| **Subagente aninhado** no mobile | **fora do plano 10 por decisão do usuário**, na [D-01](../plans/10-mobile-chat-layout/decisions.md#f0--normas) | **fora desta proposta**. Só entra se a D-01 for revista, e aí num plano próprio |
| **Markdown** nas mensagens do mobile (hoje o balão é `Text` puro, em [conversation_view.dart](../../mobile/lib/features/session/presentation/widgets/conversation_view.dart#L370-L391)) | não é mencionado no plano 10 | **fora desta proposta**: não foi pedido aqui e é uma mudança de toda a tela da sessão, não só do leitor. Fica como candidato a plano próprio |

O mapa da D-04 também prende esta proposta ao app. As chaves do pensamento (`sessions.thinking.*` ↔
`thinking*`) já estão nele, então mudar o rótulo do pensamento omitido (§4.3) no web sem mudar no app
reprova o `i18n:check`. É o comportamento desejado, porque garante que as duas pontas mudam juntas.

---

## 5. Acompanhar uma conversa — arquitetura

### 5.1 Opções consideradas

| Opção | Como | Por que não / por que sim |
|---|---|---|
| **A — o cliente reconsulta a página 1** | `refetchInterval` no web, `Timer.periodic` no mobile, `GET /transcripts/:id/messages` a cada N s | simples, mas cada cliente paga uma ida HTTP e a página 1 inteira a cada tick, a junção com as páginas antigas é frágil (a página 1 "anda") e N abas fazem N vezes o mesmo trabalho |
| **B — assinatura por WebSocket, com sondagem no backend** | o cliente assina; o backend pergunta `getSessionInfo` por conversa, compartilhado entre os assinantes, e envia só o que é novo | **recomendada**: uma sondagem barata por conversa, independentemente do número de clientes; push só da cauda nova; mesmo padrão do `workspace.watch`, que já existe |
| **C — observar o arquivo** | `fs.watch` no JSONL | **proibida**: o transcript só é lido pelo SDK (S-09), e o formato do arquivo é interno ao Claude Code |

### 5.2 Fluxo

```text
Leitor                         Backend                                   SDK
  │ GET /transcripts/:id/messages ──►  ReadTranscriptUseCase ──────────► getSessionInfo + getSessionMessages
  │ ◄── página + lastMessageId                                            (cache por lastModified)
  │
  │ transcript.follow {conversationId, afterMessageId} ──► TranscriptFollower
  │ ◄── transcript.following {followId, activity}            │ a cada tick: getSessionInfo (≈2 ms)
  │                                                          │ lastModified mudou?
  │                                                          │   └─ getSessionMessages (cache) → entradas após afterMessageId
  │ ◄── transcript.appended {followId, seq, events, lastMessageId, activity, working}
  │ ◄── transcript.reset {followId, reason}    (a cadeia não contém mais o afterMessageId)
  │ transcript.unfollow {followId} ──►   (ou a conexão cai → solta tudo da conexão)
```

### 5.3 Regras do acompanhamento

1. **Sem lacuna entre a página e a assinatura.** A página devolve `lastMessageId`, e `transcript.follow`
   o envia como `afterMessageId`. O primeiro envio do backend é **tudo** o que veio depois dele, mesmo
   que tenha sido gravado entre a resposta HTTP e a assinatura.
2. **Reconexão é reassinar.** Não há replay: o cliente reassina com o seu último `lastMessageId`, e o
   item 1 garante que nada se perde. Assinar duas vezes com o mesmo `afterMessageId` dá o mesmo
   resultado (idempotente).
3. **Cadeia reescrita = reset.** Rewind, compactação e fork podem tirar da cadeia o `afterMessageId`.
   Nesse caso o backend envia `transcript.reset`, e o cliente relê a página 1 e reassina.
4. **Uma sondagem por conversa.** Os assinantes da mesma conversa (abas, web e mobile) compartilham um
   único tick e uma única releitura. A releitura passa pelo `TranscriptCache` e pelo `ReadLimiter` que
   já existem ([transcript-reads.ts](../../backend/src/adapter/outbound/claude/transcript-reads.ts)).
5. **Intervalo adaptativo.** O tick é curto enquanto `activity = 'activeElsewhere'` e longo quando a
   conversa está parada, porque uma conversa parada pode ser retomada no VS Code a qualquer momento.
   Os valores ficam na decisão HV-02.
6. **O mesmo cercado da leitura.** Assinar exige o mesmo `audience.shown` do `ReadTranscriptUseCase`
   (S-04). Conversa que o chamador não lê não é acompanhada, e a resposta é igual à de um id
   inexistente.
7. **Tetos.** Há um máximo de assinaturas por conexão e de conversas acompanhadas no total (com
   referência inicial no `cachedSessions: 16`). Passar do teto é erro com `code` + `messageKey`, e não
   uma degradação silenciosa.
8. **Só a cadeia principal.** Subagentes continuam carregados sob demanda ao abrir o card (B-21 do
   plano 08). O progresso de um subagente em outro cliente fica fora do escopo (HV-09).
9. **Sessão viva deste backend não é acompanhada por aqui.** Quando `activity = 'liveHere'`, quem
   mostra a conversa é a tela da sessão viva, por `session.attach`. O acompanhamento é para o que este
   backend **não** opera.

### 5.4 Custo, medido em 2026-10-04 na conversa `ebfc173a`

| Leitura | Tamanho | Tempo | Heap |
|---|---|---|---|
| `getSessionInfo` | — | 1,3–2,4 ms | — |
| `getSessionMessages` | 1 546 entradas, 8,5 MB | 50–79 ms | +5–12 MB |

Com um tick de 1 s, a sondagem custa cerca de 2 ms/s por conversa acompanhada. A releitura só
acontece quando `lastModified` muda, ou seja, uma vez por bloco gravado: durante um turno ativo, uma a
cada poucos segundos. A medição de 2026-09 ([D-02 do plano 04](../plans/04-transcript-and-resume/decisions.md))
foi de ~30 MB e 44–66 ms para o maior arquivo da época. O teto de concorrência de 2 leituras continua
valendo. *A medir no plano:* transcript acima de 50 MB e 4 conversas acompanhadas ao mesmo tempo.

### 5.5 O que o cliente faz com o que chega

- **Junta à conversa:** `conversationFrom([...páginas, ...anexados])`, com o mesmo redutor. Entradas
  novas de uma resposta já começada (mesmo `message.id`) caem na mesma mensagem, porque o redutor
  acrescenta blocos. É por isso que a deduplicação por `blockId` (§4.3) é pré-requisito.
- **Rolagem:** se o leitor está no fim, acompanha o fim. Se a pessoa rolou para cima, aparece uma
  pílula "N novas" que leva ao fim. No mobile, o mesmo comportamento.
- **Visibilidade:** aba ou app em segundo plano solta a assinatura, e ao voltar reassina com o último
  `lastMessageId`.
- **Aviso de atividade:** o "ativa em outro cliente" passa a refletir o `activity` mais recente. O
  botão "Continuar esta conversa" continua pedindo confirmação antes do fork enquanto ela estiver ativa.

### 5.6 "Trabalhando em outro cliente"

O transcript não grava o estado do turno, então o backend o **infere** e o envia como `working` em
cada `transcript.appended`:

- `working = true` quando a última entrada da cadeia é um `tool_use` sem `tool_result`, um `thinking`
  ou um prompt do usuário sem resposta, **e** `activity = 'activeElsewhere'`;
- `working = false` quando a última entrada é um `text` final da resposta, ou quando a janela de
  atividade expirou.

As duas pontas mostram um indicador discreto e traduzido: "Trabalhando em outro cliente…". Não dá
para dizer "no VS Code", porque a origem `external` não diz qual cliente é. É inferência, e o texto de
ajuda diz isso. Decisão HV-10.

---

## 6. Mudanças por camada

### 6.1 Backend — mapeamento de eventos (vale ao vivo e no histórico)

| Mudança | Onde |
|---|---|
| `blockId` em cada bloco de conteúdo: o `uuid` da entrada no histórico, `<messageId>:<index>` ao vivo | `sdk-message.mapper.ts` (`toContentBlock`, `assistantEvents`, `historicalEvents`) |
| `at` (o `timestamp` da entrada) nos eventos do histórico, para a duração por limite superior | `historicalEvents` + `transcript.dto.ts` |
| `tool.started.title` = `input.description` quando presente | `sdk-message.mapper.ts` (ponto do `tool.started`) |
| `summary` em texto (`resultText`), pela cauda, com o tamanho de HV-06 | `summarise` |
| bloco `image` com `mediaType` e tamanho, sem dados | `toContentBlock` |
| `lastMessageId` na resposta de `GET /transcripts/:id/messages` | `ReadTranscriptUseCase`, `transcript.dto.ts` |

### 6.2 Backend — o que é novo

| Peça | Camada | Papel |
|---|---|---|
| `FollowTranscriptUseCase` / `TranscriptFollower` | `application/transcript` | registro de assinaturas por conversa; tick pelo `Scheduler` (porta que já existe); diff pela cadeia; inferência de `working`; tetos |
| `transcriptTail(entries, afterMessageId)` | `domain/transcript/services` | função pura: a cauda depois de um id, ou "não está na cadeia" (→ reset) |
| `inferWorking(entries, activity)` | `domain/transcript/services` | função pura do §5.6 |
| handler WS `transcript.follow` / `transcript.unfollow` | `adapter/inbound/ws/transcript` | valida, chama o caso de uso, solta tudo no `disconnect` |
| `ReadToolResultUseCase` + `GET /transcripts/:id/tools/:toolUseId/result` | `application/transcript`, `adapter/inbound/http/transcript` | saída completa de uma ferramenta, com teto, pelo mesmo cercado de leitura |
| `TranscriptStore.toolResult(session, toolUseId)` | porta + `transcript.adapter.ts` | acha o `tool_result` na lista em cache; nada de arquivo |
| variáveis `RC_TRANSCRIPT_FOLLOW_ACTIVE_MS`, `RC_TRANSCRIPT_FOLLOW_IDLE_MS`, `RC_TRANSCRIPT_FOLLOW_MAX` (nomes a confirmar) | `infrastructure/config` + `.env.example` | os valores de HV-02 e do teto |

Log `debug` em toda borda: assinatura, tick (com hit/miss do cache), envio (contagem de eventos, nunca
o conteúdo), reset e soltura. A saída de ferramenta **não** vai para o log, seguindo a regra que já
vale para `Read`.

### 6.3 Contrato

Ver §7. O documento [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md) e os
schemas em `packages/contracts/schema/` são atualizados na mesma mudança, e o `protocol.g.dart` do
mobile é regenerado.

### 6.4 Web

| Mudança | Onde |
|---|---|
| serviço de acompanhamento sobre o `ws-client` | `features/session/services/transcript-follow.service.ts` |
| hook `useConversationFollow` (assina, solta por visibilidade, junta os anexados, trata reset) | `features/session/hooks/` |
| `useConversationHistory` expõe `lastMessageId` e aceita os anexados | `hooks/useConversationHistory.ts` |
| pílula "N novas" e o acompanhamento do fim | `components/ConversationReader.tsx` |
| aviso de atividade vivo + "trabalhando em outro cliente" | `components/ConversationReader.tsx` |
| redutor: deduplicação por `blockId`, duração por `at` | `services/conversation-reducer.ts` |
| rótulo do pensamento omitido, "até N s", resumido conforme HV-04 | `components/conversation/ThinkingBlock.tsx` |
| `title` no rótulo, layout IN/OUT do Bash, saída completa sob demanda | `lib/tool-labels.ts`, `components/conversation/ToolRow.tsx` |
| autor por turno, sem cabeçalho vazio (HV-07) | `components/conversation/MessageItem.tsx`, `TimelineEntries.tsx` |
| marcador de imagem anexada | `services/conversation-reducer.ts`, `MessageItem.tsx` |
| chaves de i18n `en` e `pt-BR` | `shared/i18n/locales/` |

O fluxo é Component → Hook → Service → api/ws: nenhum componente fala com o `ws-client`.

### 6.5 Mobile

| Mudança | Onde |
|---|---|
| comandos e eventos novos no data source do WS e no mapper | `core/network/`, `features/session/data/` |
| `HistoryPage` ganha `activity` e `lastMessageId` | `domain/entities/history_page.dart`, `data/mappers/history_mapper.dart` |
| `ConversationHistoryController` assina, junta, trata reset e solta no `AppLifecycleState.paused` | `presentation/providers/conversation_history_controller.dart` |
| aviso de atividade + confirmação antes do fork + "trabalhando em outro cliente" | `presentation/pages/conversation_history_page.dart` |
| `Conversation` deduplica por `blockId` e mede a duração por `at` | `domain/entities/conversation.dart`, `conversation_entry.dart` |
| rótulo do pensamento igual ao web | `presentation/widgets/thinking_line.dart` |
| card de ferramenta recolhível, `title`, IN/OUT, saída sob demanda | `presentation/widgets/tool_card.dart` |
| marcador de imagem; balão vazio deixa de existir | `presentation/widgets/conversation_view.dart` |
| "Continuar esta conversa" e "Pronto", iguais ao web (§4.9) | ARB `en` e `pt` |
| chaves ARB `en` e `pt` | `l10n/` |
| os pares novos no mapa compartilhado: `history.screen.resume` ↔ `historyResumeAction`, `session.toolStatus.*` ↔ `sessionToolStatus*`, e as chaves novas de pensamento, "trabalhando em outro cliente" e imagem anexada | `scripts/i18n-shared.json` |

### 6.6 Documentação

- [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md): os comandos e eventos do §7, a seção "Acompanhar
  um transcript" no modelo da de `workspace.watch`.
- O documento de contrato REST do transcript: `lastMessageId`, a rota de saída e o `at`.
- `backend/03-modules` §transcript: o seguidor, a sondagem e o porquê de não haver `fs.watch`.
- [Plano 08, D-17](../plans/08-claude-panel/decisions.md): registrar a revisão, se HV-04 mudar o que
  foi decidido.
- [Descoberta §10.7](01-descoberta-claude-agent-sdk.md#107--thinking-vem-omitido-por-padrão-display-summarized-o-traz-d-17):
  o achado do §4.3 (o timestamp marca o fim do bloco, e a duração ao vivo não é gravada).
- Ajuda das telas: o que "trabalhando em outro cliente" significa e por que a duração é "até".

---

## 7. Contrato

### WebSocket

| Direção | Nome | Payload | Observação |
|---|---|---|---|
| comando | `transcript.follow` | `{ conversationId, afterMessageId }` | ack `transcript.following` |
| ack | `transcript.following` | `{ followId, conversationId, activity }` | |
| evento | `transcript.appended` | `{ followId, conversationId, seq, events[], lastMessageId, activity, working }` | `events` com a mesma forma dos eventos do histórico; `seq` por `followId`, sem replay |
| evento | `transcript.reset` | `{ followId, conversationId, reason: 'rewritten' \| 'gone' }` | o cliente relê a página 1 e reassina |
| comando | `transcript.unfollow` | `{ followId }` | idempotente |
| erro | `TRANSCRIPT_FOLLOW_LIMIT`, `NOT_FOUND` | `code` + `messageKey` + `params` | |

Campos aditivos em eventos existentes: `blockId` nos blocos de conteúdo, `at` nos eventos do
histórico, `title` passando a ser preenchido em `tool.started`, e `mediaType`/`size` no bloco `image`.

### REST

| Rota | Mudança |
|---|---|
| `GET /transcripts/:id/messages` | + `lastMessageId`; eventos com `at` e `blockId` |
| `GET /transcripts/:id/tools/:toolUseId/result` | **nova**: `{ text, truncated, bytes }`. `404` para ferramenta ou conversa que o chamador não lê. Saída acima do teto não é erro: vem cortada, com `truncated: true` |

Todas as mudanças são **aditivas**. Um cliente antigo ignora os campos novos, e o
[05 §Versionamento](../architecture/shared/05-websocket-protocol.md) não exige subir a versão do
protocolo. A confirmar no plano: se a política exige subir mesmo assim por haver comandos novos.

---

## 8. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R-01 | O SDK muda a forma de `SessionMessage` ou passa a esconder entradas | o leitor já depende só do SDK; as fixtures gravadas de execuções reais pegam a mudança no teste de contrato do adapter |
| R-02 | Transcript muito grande torna cada releitura cara (o SDK relê o arquivo inteiro) | releitura só quando `lastModified` muda; uma por conversa; `ReadLimiter`; intervalo ocioso longo; medir > 50 MB no plano |
| R-03 | Compactação ou rewind no VS Code reescreve a cadeia | `transcript.reset` (§5.3, item 3); cenário de teste com fixture compactada |
| R-04 | `working` inferido errado (por exemplo, o VS Code fechado no meio de um turno) | `working` só com `activity = 'activeElsewhere'`; expira com a janela; texto de ajuda diz que é inferência |
| R-05 | Assinaturas órfãs (cliente some sem `unfollow`) | soltura no `disconnect` do socket; o tick de uma conversa sem assinantes para |
| R-06 | Alguém "corrige" a ordem pelos timestamps (§4.7) | cenário de teste com o prompt enfileirado da fixture |
| R-07 | O `blockId` muda a deduplicação também da sessão viva | o `withHistory` (junção do histórico com o vivo) entra na matriz; o id ao vivo e o do histórico de um mesmo bloco **não** coincidem, e a junção continua por `messageId` |
| R-08 | A rota de saída expõe conteúdo de arquivo (`Read`) a quem não deveria | o mesmo cercado de leitura do transcript; nada no log; teto de tamanho |

---

## 9. Matriz de cenários — semente

| Dimensão | Cenários |
|---|---|
| **Equivalência** | conversa `external` ativa, parada e `liveHere`; entrada `thinking` omitida, resumida e `redacted`; `text`; `tool_use` de Bash com e sem `description`; `tool_result` string e lista de blocos; prompt de texto, com imagem e enfileirado; web e mobile para cada um |
| **Fronteira** | `afterMessageId` igual à última entrada (nada a enviar); página vazia; saída de ferramenta com 0, 199, 200, 201 caracteres e acima do teto da rota; intervalo de pensamento 0 s; conversa com 1 entrada; teto de assinaturas exato e +1; janela de atividade aos 119 s, 120 s e 121 s |
| **Erro** | `getSessionInfo` falha ou estoura o prazo no meio do acompanhamento; conversa apagada (`reset: 'gone'`); `conversationId` inválido; conversa de outro usuário (resposta igual à inexistente); `toolUseId` inexistente; WS cai durante um envio |
| **Transição de estado** | ativa → parada → ativa de novo (o intervalo muda); `working` true → false; rewind e compactação no VS Code (`reset: 'rewritten'`); "Continuar esta conversa" com a assinatura aberta (a assinatura é solta, e a tela vira a sessão viva); app em segundo plano e de volta |
| **Concorrência** | duas abas e o mobile acompanhando a mesma conversa (uma sondagem, uma releitura); gravação entre a resposta HTTP e o `follow` (nada se perde); dois blocos da mesma resposta chegando em ticks diferentes; leitura de página antiga durante um envio |
| **Idempotência** | `follow` repetido com o mesmo `afterMessageId`; `unfollow` repetido; reconexão reassinando; o mesmo bloco recebido pela página e pelo envio (`blockId` deduplica); dois pensamentos omitidos na mesma resposta (os dois ficam) |

---

## 10. Fatiamento sugerido

**Um plano**, criado por `pnpm plan new`, com as fases na ordem de dependência. A fase de E2E é sempre
a última.

| Fase | Entrega | Depende de |
|---|---|---|
| F0 — Normas e decisões | HV-01…HV-12 decididas e registradas; o 05 e o contrato REST escritos; schemas; chaves de i18n e ARB; os pares novos no `i18n-shared.json` (§4.9) | — |
| F1 — Mapeamento | `blockId`, `at`, `title`, `summary` pela cauda em texto, bloco `image`, `lastMessageId` (backend), com a deduplicação por `blockId` nas duas pontas | F0 |
| F2 — Seguidor no backend | `transcriptTail`, `inferWorking`, `TranscriptFollower`, handler WS, tetos, configuração | F1 |
| F3 — Acompanhar no web | serviço, hook, junção, pílula, aviso vivo, "trabalhando" | F2 |
| F4 — Acompanhar no mobile | data source, controller, ciclo de vida, aviso e confirmação de fork, "trabalhando" | F2 |
| F5 — Fidelidade no web | pensamento (rótulo, "até N s", HV-04), autor por turno, IN/OUT, rota de saída, imagem | F1 |
| F6 — Fidelidade no mobile | os mesmos itens de F5 no app; card recolhível | F1 |
| F7 — E2E | web pelo `pnpm verify:full` (portão 9) e mobile pelo `test:e2e:mobile`, que o `verify:full` não roda: conversa externa crescendo durante a leitura, reset e os rótulos | F3…F6 |

F3/F4 e F5/F6 podem correr em paralelo depois das suas dependências. O e2e precisa de um store de
fixture (`CLAUDE_CONFIG_DIR`) em que o teste acrescenta entradas gravadas de uma execução real enquanto
o leitor está aberto. Como montar isso é a decisão HV-11.

---

## 11. Decisões em aberto

Cada uma vira entrada no `decisions.md` do plano. A coluna **Recomendação** é a proposta deste
documento, e não uma decisão tomada.

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| HV-01 | Mecanismo de acompanhamento | A reconsulta no cliente · B assinatura WS com sondagem no backend · C `fs.watch` | **B** (§5.1); C é proibida pela S-09 |
| HV-02 | Intervalos e tetos | tick ativo 500 ms / 1 s / 2 s · ocioso 5 s / 15 s / sem tick · teto por conexão e global | **1 s ativo, 10 s ocioso, 4 por conexão, 16 no total**, configuráveis |
| HV-03 | Duração do pensamento no histórico | não mostrar · "até N s" (limite superior) · o intervalo como se fosse exato | **"até N s"**: informa sem mentir (§4.3) |
| HV-04 | Pensamento **resumido**: à vista ou recolhido (revê a D-17) | à vista como o VS Code · recolhido como hoje · recolhido com a primeira linha visível | **à vista, em estilo atenuado**, para igualar o VS Code; é decisão do usuário, porque revê a D-17 |
| HV-05 | Quem compõe o título da ferramenta | backend preenche `title` · cliente lê `input.description` | **backend preenche `title`**: o contrato já previa isso, e os dois clientes deixam de saber nomes de campo do Bash |
| HV-06 | `summary` da ferramenta | 200 caracteres pela cabeça (hoje) · últimas N linhas · cabeça + cauda | **as últimas 5 linhas, até 400 caracteres**; o completo pela rota |
| HV-07 | Forma da linha do tempo | cabeçalho por turno · marcadores como o VS Code · manter um por resposta | **cabeçalho por turno**, sem cabeçalho vazio; marcadores ficam para depois, porque mexem em toda a tela da sessão |
| HV-08 | Ver a imagem de um prompt | só marcador · abrir pela rota sob demanda | **só marcador** nesta entrega |
| HV-09 | Subagente em execução em outro cliente | acompanhar também · só ao abrir o card | **só ao abrir o card**, como hoje |
| HV-10 | Indicador "trabalhando" inferido | mostrar · não mostrar | **mostrar**, com ajuda explicando que é inferência |
| HV-11 | Como o e2e faz a conversa crescer | fixture gravada acrescentada pelo teste · fake do SDK | **fixture gravada** num `CLAUDE_CONFIG_DIR` de teste, porque o fake não exercita o `getSessionMessages` real |
| HV-12 | Versão do protocolo | aditivo sem subir · subir `v` | **aditivo sem subir**, se o 05 §Versionamento permitir comandos novos assim |

---

## 12. O que **não** muda

- O transcript continua sendo lido só pelo Agent SDK, sem `fs` no slice de transcript.
- A sessão viva deste backend continua no `session.attach`, com replay e `seq` próprios.
- A listagem de conversas continua com a sondagem de 10 s no web
  ([useFolderSessions.ts](../../web/src/features/session/hooks/useFolderSessions.ts#L19)) e com
  "puxar para atualizar" no mobile.
- "Continuar esta conversa" continua sendo fork ou retomada pelo `session.start`, com a confirmação
  quando a conversa está ativa em outro cliente.
- O `summary` continua curto no stream e no buffer de replay. A saída completa só sai pela rota, sob
  demanda.

---

## 13. Fontes

| Fonte | O que dela foi usado |
|---|---|
| Captura do painel do web ("Do histórico"), 2026-10-04 | §1, §4.1, §4.3, §4.6 |
| Captura da extensão do Claude Code no VS Code, mesma sessão, 2026-10-04 | §1, §4.1, §4.3, §4.4, §4.5 |
| `getSessionMessages('ebfc173a-…')` e `getSessionInfo`, medidos em 2026-10-04 | §4.2, §4.3, §4.7, §5.4 |
| [Plano 04 — transcript e retomada](../plans/04-transcript-and-resume/decisions.md) | D-02 (custo de leitura), B-03 (um formato) |
| [Plano 08 — painel do Claude](../plans/08-claude-panel/decisions.md) | D-17 (thinking), D-10 (sondagem da lista), B-21 (subagentes) |
| [05-websocket-protocol](../architecture/shared/05-websocket-protocol.md) | o padrão `workspace.watch`, versionamento |
