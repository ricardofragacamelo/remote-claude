# Plano 08 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> As 23 que estavam abertas foram respondidas pelo usuário em **2026-09-28**, uma a uma, e todas
> seguem a recomendação; com a D-11, as 24 estão decididas. A **D-25** nasceu do spike de 2026-10-01 e
> foi decidida pelo usuário no mesmo dia. As que dependem de spike (D-01, D-02,
> D-14, D-16) ou de medida (D-04, D-06, D-15, D-23) têm o desvio já decidido: a medida vem para esta
> página quando for feita e, onde ela pode mudar um número ou um formato, o **Resultado** diz que é
> provisório.

> Os IDs D-01…D-10 são os do roteiro dos planos 06–13, para que os outros planos possam citá-los;
> D-11…D-23 nasceram ao detalhar as fases; a D-24, de uma decisão do plano 06. A ordem no arquivo é a da fase que cada uma bloqueia
> primeiro, por isso os números não aparecem em sequência.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Como a menção de arquivo, pasta ou trecho chega ao Claude: referência que ele lê pelo `Read` (auditado) ou conteúdo colado no prompt | se o CLI expande `@caminho` vindo do streaming input em conteúdo inline — **exige spike** | B-01, B-44 | 2026-09-28 · **referência**, num formato delimitado que o CLI não expande (ex. `<reference path lines/>`), composto no backend para as duas pontas; o Claude lê pelo `Read` sob o `PreToolUse`; o chip avisa aba suja; `text` de provedor (`@terminal`) delimitado, rotulado e com teto. Decisão do usuário com a recomendação. **Spike de 2026-10-01** ([descoberta §10.1](../../discovery/01-descoberta-claude-agent-sdk.md#101--caminho-no-streaming-input-é-expandido-pelo-cli-sem-read-d-01-r-10)): a sintaxe `<reference path="…" lines="…" />` levou a um `Read` sob o hook — **fica**; `@caminho` foi expandido pelo CLI **sem** `Read` nem hook — o gap é real, e a B-44 neutraliza o `@caminho` do texto livre. O `smoke-live` vigia a premissa (S-238) | ✅ |
| D-02 | Imagem no prompt: entra? como viaja (frame WS × upload HTTP), qual teto e quais tipos | se o streaming input aceita bloco `image` no `SDKUserMessage` e o que o CLI faz com ele — **exige spike**; o frame WS tem 64 KB por padrão | B-01, B-45, B-49 | 2026-09-28 · **upload HTTP** (`POST /sessions/:sessionId/attachments` → `attachmentId`), teto 5 MB, PNG/JPEG/GIF/WebP (`413`/`415`), fora do workspace, da trilha e do log (só tipo, tamanho e hash), descartado ao fechar a sessão ou no TTL; o frame WS fica em 64 KB. Decisão do usuário com a recomendação. **Spike de 2026-10-01** ([§10.2](../../discovery/01-descoberta-claude-agent-sdk.md#102--bloco-image-no-sdkusermessage-é-aceito-d-02)): o CLI aceita o bloco `image` do streaming input — a imagem fica na B-45 | ✅ |
| D-03 | De onde vem o diff de uma tool e da sessão: input da tool + snapshot do ADR-013, ou guardar também o "depois" de cada escrita | quanto o "depois" custaria em disco, medido sobre as sessões reais; quantas escritas repetem o mesmo arquivo no mesmo turno | B-03, B-25, B-26, B-29 | 2026-09-28 · **input da tool + snapshot do ADR-013**, sem store do "depois"; o caso sem snapshot intermediário devolve `before.state: 'unavailable'` com motivo; a prévia do card de permissão é o input aplicado ao disco agora, pela API do plano 07, sem mudar `permission.requested`. Decisão do usuário com a recomendação | ✅ |
| D-05 | O histórico da pasta casa as subpastas? | custo da varredura do store inteiro hoje (281 ms para 298 sessões, medido em 2026-09-16) e como ele cresce | B-03, B-08 | 2026-09-28 · **exato por padrão**, "incluir subpastas" como filtro da view por `listSessions({})` com cache curto (chave: `lastModified` máximo) filtrado por `cwd` dentro da pasta aberta; as vivas casam subpastas sempre. Decisão do usuário com a recomendação; a B-03 atualiza a regra "nunca `listSessions({})`" de backend/03 | ✅ |
| D-06 | "Ativa em outro lugar": qual critério (janela de `lastModified`) e o que se permite fazer com ela | com que frequência o CLI e a extensão escrevem o transcript durante um turno longo — **medir** | B-03, B-08, B-10 | 2026-09-28 · **janela configurável, padrão 120 s** de `lastModified`, calculada no backend, só para conversa externa; rótulo "escrita há *n* min"; externa retoma sempre por fork, e o fork de uma ativa pede confirmação dizendo que as continuações vão divergir. Decisão do usuário com a recomendação. **Medido em 2026-10-01** ([§10.5](../../discovery/01-descoberta-claude-agent-sdk.md#105--um-bash-de-40-s-deixa-o-transcript-40-s-sem-escrita-d-06)): um `Bash` de 40 s deixou o transcript 40,2 s sem escrita — o silêncio dura o que dura a tool; **os 120 s ficam**, e uma tool acima de dois minutos faz a conversa parecer parada, o que o rótulo já diz | ✅ |
| D-14 | A fila de prompts: fica no SDK (como hoje, não cancelável) ou no backend (visível a todos e cancelável) | se segurar o prompt até o turno terminar muda algo no comportamento medido do SDK (§8.6 da descoberta) | B-02, B-34 | 2026-09-28 · **a fila é do backend**: o prompt fica conosco até o turno terminar, `prompt.queued`/`prompt.dequeued` para os observadores e `session.cancelQueuedPrompt` para tirar. Decisão do usuário com a recomendação. **Spike de 2026-10-01** ([§10.4](../../discovery/01-descoberta-claude-agent-sdk.md#104--prompt-no-meio-do-turno-é-fundido-ao-turno-em-curso-d-14-revê-86)): o SDK 0.3.277 **funde** ao turno em curso o prompt entregue no meio dele (um `result` só) — segurar no backend é o que preserva "roda em seguida, como turno próprio"; a decisão fica, e o §8.6 foi revisto | ✅ |
| D-15 | Subagents: encaminhar o texto e o thinking deles (`forwardSubagentText`) ou só as tools | quantos eventos um `Task` típico gera, contra o ring buffer de 1000 eventos por sessão — **medir** | B-02, B-21 | 2026-09-28 · **encaminhar** (`forwardSubagentText: true`), com `parentToolUseId` opcional nos eventos de mensagem e de tool. Decisão do usuário com a recomendação. **Medido em 2026-10-01** ([§10.6](../../discovery/01-descoberta-claude-agent-sdk.md#106--subagent-com-forwardsubagenttext-d-15)): o tool é `Agent`; o subagent chega como mensagens completas com `parent_tool_use_id`, sem delta; um que leu um arquivo custou 5 mensagens — **encaminhar fica** | ✅ |
| D-16 | Esforço (effort) dentro da sessão: entra, e por qual mecanismo | se `applyFlagSettings({ effortLevel })` vale no meio de uma sessão viva e a partir de quando — **exige spike** | B-02, B-36 | 2026-09-28 · **entra, como `session.setEffort { sessionId, level }`** nas três pontas, sobre `applyFlagSettings({ effortLevel })`, só quando o modelo aceita (`supportsEffort`). Decisão do usuário com a recomendação. **Spike de 2026-10-01** ([§10.3](../../discovery/01-descoberta-claude-agent-sdk.md#103--applyflagsettings-no-meio-da-sessão-reinicia-a-query-e-perde-os-hooks-d-16)): `applyFlagSettings` reinicia a query, e o tool seguinte foi negado **sem** `PreToolUse` — trocar esforço na sessão viva desliga a trilha. **Vale o desvio decidido:** sem `session.setEffort`; o esforço é escolhido no rascunho e vai em `session.start.effort` (`Options.effort`) | ✅ |
| D-19 | Editar e reenviar: bifurcar sempre, ou truncar in-place a conversa nossa; e o que acontece com os arquivos | como traduzir o `messageId` do nosso contrato para o UUID da cadeia que `resumeSessionAt` aceita, sem parser de JSONL | B-02, B-35 | 2026-09-28 · **sempre bifurcar**, nunca truncar in-place: o ponto é resolvido pelo `getSessionMessages` (sem parser); recusa do CLI vira `SESSION_FORK_REJECTED`, com a retomada simples oferecida; "desfazer até antes do turno" oferecido, desligado por padrão. Decisão do usuário com a recomendação | ✅ |

### D-01 — como a menção chega ao Claude

A extensão do VS Code manda contexto do editor; nós temos duas maneiras de fazer o mesmo:

| Opção | A favor | Contra |
|---|---|---|
| **Referência**: o prompt leva caminho (e linhas), e o Claude lê pelo `Read`/`Glob` | a leitura passa pelo hook `PreToolUse` e entra na trilha, como toda leitura de arquivo ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)); o frame fica pequeno | o Claude pode decidir não ler; o que ele lê é o disco, não o buffer sujo do editor |
| **Conteúdo inline**: o backend lê o arquivo e cola no prompt | o Claude recebe exatamente o trecho, na hora | é leitura de arquivo que a trilha nunca viu; frame e prompt crescem; o backend passa a ler arquivo para a sessão |

O gap é concreto: o CLI interativo expande `@arquivo` em conteúdo. Se ele fizer o mesmo com texto que
chega pelo streaming input, a "referência" vira conteúdo inline **sem** `PreToolUse` — a pior das
duas. O spike manda um prompt com `@caminho` e verifica se houve `Read` no hook.

**Recomendação:** referência, com um formato que o CLI **não** expande (texto delimitado, ex.
`<reference path="src/x.ts" lines="10-20"/>`, decidido pelo spike), composto no backend para as duas
pontas verem o mesmo; o chip avisa quando a aba do editor está suja. O `text` dos provedores
(`@terminal`) é a exceção declarada: não é leitura de arquivo, é o que a pessoa já vê na tela, e vai
delimitado e rotulado pela origem, com teto. O `smoke-live` vigia a premissa (S-238).

### D-02 — imagem no prompt

O `SDKUserMessage` carrega um `MessageParam` cujo conteúdo aceita blocos `image` (está no
`sdk.d.ts`), mas **nada foi medido**: o CLI pode recusar, converter ou descartar. E o transporte tem
um limite duro: `RC_WS_MAX_FRAME_BYTES` é 65 536 por padrão, e um print de tela passa disso.

| Opção | Consequência |
|---|---|
| imagem em base64 no frame | exige subir o limite de frame para todos os frames — afrouxa uma proteção do [plano 05](../05-hardening-operations/README.md) para servir um caso |
| **upload HTTP** (`POST /sessions/:sessionId/attachments`) devolvendo `attachmentId`, referenciado no prompt | o limite de frame fica; teto e tipo viram `413`/`415` com status de verdade; a imagem vive fora do workspace, com TTL |
| imagem fora do escopo | registrar no [progresso](progress.md) como escopo reduzido, se o spike reprovar |

**Recomendação:** upload HTTP, teto de 5 MB, PNG/JPEG/GIF/WebP (os tipos da Messages API), guardado
em memória ou em diretório temporário do backend — nunca no workspace, nunca na trilha nem no log
(só tipo, tamanho e hash) —, descartado ao fechar a sessão ou no TTL. Se o spike mostrar que o CLI
não aceita, a parte de imagem da B-45 sai, com nota.

### D-03 — de onde vem o diff

O store do [ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)
guarda o conteúdo **anterior** no primeiro toque de cada turno num caminho, e o hash de como a sessão
deixou o arquivo. Não guarda o conteúdo **depois** de cada escrita.

| Opção | O que se consegue |
|---|---|
| **input da tool + snapshot** | Edit/MultiEdit: o trecho antes/depois é exato (vem do input). Arquivo inteiro: antes = snapshot do turno; depois = disco, **quando** o disco ainda tem o hash que a sessão deixou. Segundo Edit no mesmo arquivo e turno: só o trecho |
| guardar o "depois" de cada escrita | diff exato em todo caso, ao custo de um segundo store por escrita, com teto e purga próprios |

**Recomendação:** input + snapshot. O caso sem snapshot intermediário é declarado na resposta
(`before.state: 'unavailable'`, com motivo), não escondido. A prévia do card de permissão (antes de a
tool rodar) não usa o store: é o input aplicado ao disco **agora**, lido pela API de arquivos do
[plano 07](../07-explorer-and-editor/README.md) — sem mudar o `permission.requested` nem o app.

### D-05 — a lista casa subpastas

`listSessions({ dir })` casa o diretório **exato** (21 ms). Casar subpastas não tem opção no SDK:
exige `listSessions({})` — o store inteiro, 281 ms medidos — filtrado pelo `cwd`, e hoje
[backend/03](../../architecture/backend/03-modules.md#transcript) diz "nunca `listSessions({})`".

O caso relatado casa exato: o VS Code aberto na raiz do repositório grava `cwd` = raiz. Subpasta
importa quando a pessoa abre `/repo` e conversou em `/repo/backend`.

**Recomendação:** exato por padrão, e "incluir subpastas" como filtro da view, servido por
`listSessions({})` com cache curto (chave: `lastModified` máximo) e o filtro de `cwd` **dentro da
pasta aberta** — que já está dentro da allowlist, então a cerca continua sendo o `cwd`, como na D-01
do plano 04. Decidir assim **atualiza a regra** de backend/03 (a B-03 faz isso). As sessões **vivas**
casam subpastas sempre: é filtro em memória.

### D-06 — ativa em outro lugar: o critério e o que se permite

Não há como saber que uma conversa está aberta no editor
([§9.4](../../discovery/01-descoberta-claude-agent-sdk.md#94--não-há-como-saber-que-uma-sessão-está-aberta-no-editor)).
O que existe é o `lastModified`: um transcript escrito há segundos quase certamente tem alguém
escrevendo.

**Recomendação:** janela configurável, padrão **120 s**, calculada no backend (um relógio, as duas
pontas iguais); só para conversa **externa** (a nossa, sabemos se está viva); o rótulo diz "escrita
há *n* min", nunca "aberta no VS Code". O que se permite não muda — externa sempre retoma por fork —,
mas o fork de uma ativa pede confirmação dizendo que outro processo escreve nela e que as duas
continuações vão divergir. O gap é medir o intervalo real de escrita durante um turno longo (uma
tool demorada pode deixar minutos sem escrita).

### D-14 — a fila de prompts

Hoje o prompt que chega durante um turno vai direto para o `AsyncIterable` do SDK, que o enfileira
([§8.6](../../discovery/01-descoberta-claude-agent-sdk.md#86--segundo-prompt-durante-um-turno-é-enfileirado-pelo-sdk)).
Depois de entregue, não se tira. A extensão do VS Code mostra a fila e deixa cancelar.

**Recomendação:** a fila passa a ser do backend: o prompt fica conosco até o turno terminar, os
observadores veem `prompt.queued`/`prompt.dequeued`, e `session.cancelQueuedPrompt` o tira. O efeito
para o Claude é o mesmo (roda em seguida, na ordem), e o multi-cliente vê a mesma fila. O gap é
confirmar que segurar o prompt não muda o que o SDK faz no fim do turno (ex.: prompt absorvido no
meio do turno, que o `resumeDropsTurn` menciona).

### D-15 — subagents: o que encaminhar

Por padrão o SDK só emite as tools do subagent; com `forwardSubagentText: true` emite também texto e
thinking, com `parent_tool_use_id`. Isso é o que permite a conversa aninhada da extensão — e pode
encher o ring buffer (1000 eventos por sessão) mais rápido, trocando replay por `gap`.

**Recomendação:** encaminhar, com o `parentToolUseId` como campo opcional nos eventos de mensagem e
de tool; o gap é medir o volume de um `Task` real. Se estourar o buffer com frequência, o texto do
subagent fica fora do stream e é carregado ao expandir, pelas funções do SDK (`getSubagentMessages`).

### D-16 — esforço na sessão

O `ModelInfo` diz se o modelo aceita esforço e quais níveis (`supportsEffort`,
`supportedEffortLevels`); o `Query` tem `applyFlagSettings({ effortLevel })` e um
`setMaxThinkingTokens` já marcado como obsoleto. O padrão de esforço é do
[plano 13](../13-claude-settings/README.md); o controle **da sessão** seria daqui.

**Recomendação:** entra, como `session.setEffort { sessionId, level }` (comando novo, nas três
pontas) sobre `applyFlagSettings`, só quando o modelo o aceita — se o spike confirmar que vale no meio
da sessão. Se não valer, o esforço é escolhido no rascunho e vai no `session.start`.

### D-19 — editar e reenviar

`resume` + `resumeSessionAt` + `forkSession` continua a conversa a partir de um ponto, num id novo;
`resumeDropsTurn` faz o CLI validar o ponto e recusar de forma determinística quando o trecho
descartado tem algo que não é do turno.

**Recomendação:** sempre bifurcar — nunca truncar in-place, nem a conversa nossa: a original continua
legível e o fork é a mesma mecânica da retomada externa ([backend/04](../../architecture/backend/04-claude-integration.md#retomada--fork-fora-in-place-dentro)).
O backend resolve o ponto pelo `getSessionMessages` (sem parser), e a recusa do CLI vira
`SESSION_FORK_REJECTED` com a retomada simples oferecida, sem repetir o fork. Os arquivos não voltam
sozinhos: a tela oferece também desfazer até antes daquele turno (o desfazer do plano 04), desligado
por padrão, porque o fork não leva o histórico de undo.

---

## F1 — Sessões da pasta

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | Como a lista de sessões se atualiza: polling ou evento | — (a escolha é de desenho; o "ativa em outro lugar" só é observável lendo o store) | B-11 | 2026-09-28 · **polling pelo TanStack Query**, 10 s com a view visível, parado com a view escondida ou a aba de pasta inativa, mais invalidação por `session.started`/`session.closed`; nenhum stream novo. Decisão do usuário com a recomendação | ✅ |
| D-24 | O link de uma sessão e de uma conversa, agora que as rotas antigas não existem | nenhum técnico — a URL do workbench já leva a pasta na search ([06 · D-06](../06-workbench/decisions.md#d-06--a-url-do-workbench)) | B-12 | 2026-09-28 · **na search do workbench**: `/workbench?folder=…&session=…` ou `&conversation=…`, exclusivos; o que não existe ou não é do chamador mostra o erro traduzido com caminho de volta. Decisão do usuário com a recomendação | ✅ |

### D-10 — a lista de sessões se atualiza como

Evento exigiria um stream fora de sessão, com `seq` próprio (o envelope exige `seq` em todo
`event`), e ainda assim não cobriria a conversa **externa** que ficou ativa — o `transcript` não
observa disco, por regra (`transcript-reads-through-the-sdk`).

**Recomendação:** polling pelo TanStack Query — 10 s com a view visível, parado com a view escondida
ou a aba de pasta inativa (a D-11 do [plano 06](../06-workbench/README.md)) — mais invalidação
imediata pelos eventos que o cliente **já** recebe das sessões que observa (`session.started`,
`session.closed`). Nenhum stream novo.

### D-24 — o link de uma sessão e de uma conversa

O plano 06 **removeu** `/sessions/$sessionId`, `/history` e `/history/$conversationId`, sem deep link
de compatibilidade ([06 · D-07](../06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas),
decisão do usuário de 2026-09-28). A B-12 deixou de ser "as rotas de hoje viram deep links": quando
este plano começar, elas não existem. Mas "colar o link em outro dispositivo reproduz a tela" continua
sendo o teste, e a conversa aberta no painel precisa de um link.

| Opção | Contra |
|---|---|
| **na search do workbench**: `/workbench?folder=…&session=…` e `&conversation=…` | nenhum além de uma URL mais longa; é a forma da D-06 do 06 e do `&file=` do 07 |
| rotas próprias de novo (`/workbench/sessions/$id`) | reabre o que o usuário acabou de tirar, e mistura path e search para o mesmo estado |
| sem link | falha o teste de [web/04 · A URL é estado](../../architecture/web/04-state-and-data.md#a-url-é-estado) |

**Recomendação:** na search do workbench, ao lado de `folder`. `session` e `conversation` são
exclusivos; o que não existe ou não é do chamador mostra o erro traduzido com caminho de volta.

---

## F2 — Renderização

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Biblioteca de markdown e de realce | a escolha de editor do plano 07 (Monaco × CodeMirror); bundle medido no celular | B-14, B-15 | 2026-09-28 · **`react-markdown` + `remark-gfm`, sem `rehype-raw`**; URLs só `http`, `https`, `mailto` e relativo; imagem remota vira link; realce pelo `monaco.editor.colorize`, sob demanda (o plano 07 escolheu Monaco, 07 · D-09). Decisão do usuário com a recomendação; o bundle é medido na B-14 | ✅ |
| D-25 | A lista de tarefas: `TodoWrite` ou `Task*`, ligadas por variável de ambiente | nenhum: medido — o CLI 2.1.268+ esconde as tools de modelos fora da lista; `CLAUDE_CODE_ENABLE_TODO_TOOLS` as liga (`task-tools-turn`, `todo-write-turn`) | B-20 | 2026-10-01 · **as duas**: o backend abre o SDK com `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` e o painel desenha a lista pela tool que vier no stream — `TodoWrite` ou `Task*` —, nunca pelo modelo. Decisão do usuário com a recomendação | ✅ |
| D-17 | Thinking: aberto ou recolhido, e o que dele vai para o buffer, o transcript e o log | se o modelo em uso devolve thinking resumido, omitido ou em destaques por padrão | B-19 | 2026-09-28 · **mostrado recolhido**, com a duração; vai no buffer e no transcript como bloco próprio; no log, só o tamanho. Decisão do usuário com a recomendação. **Medido em 2026-10-01** ([§10.7](../../discovery/01-descoberta-claude-agent-sdk.md#107--thinking-vem-omitido-por-padrão-display-summarized-o-traz-d-17)): por padrão o thinking vem **omitido** (bloco sem texto); `thinking: { display: 'summarized' }` traz o resumo — a B-19 pede o resumo, para haver o que mostrar. **Revista em 2026-10-04 pela [D-15 do plano 22](../22-live-history/decisions.md#f5--fidelidade-no-web) — o resumido fica à vista**, em estilo atenuado, como o VS Code; o omitido continua recolhido | ✅ |

### D-25 — a lista de tarefas: `TodoWrite` ou `Task*`

Aberta em 2026-10-01 pelo spike da B-06, que concluiu que não havia tool de lista de tarefas em sessão
do SDK. **Revista no mesmo dia** ([descoberta §10.8](../../discovery/01-descoberta-claude-agent-sdk.md#108--a-lista-de-tarefas-depende-do-modelo-e-uma-variável-a-liga-b-20-d-25)):
a tool existe, mas desde o CLI 2.1.268 só é oferecida a modelos até Opus 4.7 / Sonnet 4.6 / Haiku 4.5;
com o `claude-opus-5` das gravações, some. `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` no `env` do `query()`
a devolve — como as quatro `Task*` incrementais, ou, com `CLAUDE_CODE_ENABLE_TASKS=0` a mais, como o
`TodoWrite` de lista inteira que a B-20 descreve. As duas formas estão gravadas.

O modelo só decide **se** há lista: um modelo da lista, sem variável, também recebe as `Task*`
(`task-tools-listed-model-turn`). **Qual** tool aparece é o `CLAUDE_CODE_ENABLE_TASKS`, igual para todo
modelo — e o produto não é o único a defini-lo: o ambiente do backend vai inteiro para o CLI, e um
CLI mais antigo ou um transcript antigo trazem `TodoWrite`.

| Opção | Consequência |
|---|---|
| **as duas** — `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, e o painel desenha a lista pela tool que vier no stream | todo modelo tem lista; o painel lê o `TodoWrite` (lista inteira) e as `Task*` (incremental, pelo `id`); o histórico funciona com qualquer das duas; a B-20 e S-85/S-86 ganham os dois formatos |
| só `Task*` — `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` | menos código; uma sessão com `CLAUDE_CODE_ENABLE_TASKS=0` no ambiente, ou um transcript com `TodoWrite`, mostra a tool genérica |
| só `TodoWrite` — mais `CLAUDE_CODE_ENABLE_TASKS=0` | a B-20 vale como está; força o caminho antigo do CLI em todo modelo |
| a B-20 sai do plano | nenhuma variável nova; o painel não mostra lista de tarefas |

Qualquer das três primeiras põe a variável no `sdk-options.factory` e as tools que faltam no
`risk.classifier` (hoje ele só conhece o `TodoWrite`).

**Recomendação:** as duas, escolhidas pelo nome da tool no stream, nunca pelo modelo.

**Decidido em 2026-10-01** pelo usuário, com a recomendação: o produto não suporta um modelo só, e a
tool que chega não depende do modelo. A B-20 e S-85…S-87 foram reescritas para os dois formatos.

### D-04 — markdown e realce

**Recomendação:** `react-markdown` com `remark-gfm`, **sem** `rehype-raw` (HTML cru nunca vira
elemento), com transformação de URL que só aceita `http`, `https`, `mailto` e caminho relativo, e
imagem remota trocada por link. Realce: se o plano 07 escolher Monaco, o `monaco.editor.colorize`
dele — uma gramática, um tema, carregado sob demanda; se escolher CodeMirror, o `highlightTree` do
mesmo parser. Medir o bundle na B-14.

### D-17 — thinking

**Recomendação:** mostrar, recolhido por padrão, com a duração; vai no buffer e no transcript como
bloco próprio (mesmo redutor), e **não** vai para o log além do tamanho — pode citar conteúdo de
arquivo lido, e a regra de não logar conteúdo de `Read` vale para ele.

> **Revista em 2026-10-04 pela D-15 do plano 22 — o resumido fica à vista.** O pensamento **resumido**
> deixa de ser recolhido: o texto aparece à vista, atenuado, sob "Pensou", como o VS Code o mostra; o
> **omitido** continua recolhido, com "o modelo não mostrou" ao abrir. O resto desta decisão — buffer,
> transcript, log só do tamanho — continua ([22 · D-15](../22-live-history/decisions.md#f5--fidelidade-no-web)).

---

## F3 — Diffs

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Rejeitar por arquivo e por trecho: qual mecanismo, e com que garantias | como calcular o trecho com três versões (antes da sessão, como a sessão deixou, disco agora) sem conteúdo do "como a sessão deixou" — só temos o hash | B-02, B-30, B-31 | 2026-09-28 · **por arquivo**, `session.rewindFiles` com `paths?` (opcional, sem subir `v`) pelo `UndoPlanner`; **por trecho**, `session.rejectChange { sessionId, path, hunkId, revision }` entre o snapshot e o disco, só com o hash da sessão no disco (senão `modifiedOutside`, só inteiro); `revision` mudou → `409` `SESSION_CHANGE_STALE`; desfazer a rejeição por toast, confirmação só para rejeitar tudo. Decisão do usuário com a recomendação | ✅ |
| D-18 | O que "aceitar" uma alteração significa, e onde a marca mora | — | B-28 | 2026-09-28 · **marca de revisão local**, por arquivo e por sessão, no estado da aba de pasta; nunca no servidor nem na trilha; a view "Alterações" filtra pendentes e revisados. Decisão do usuário com a recomendação | ✅ |

### D-08 — rejeitar por arquivo e por trecho

O desfazer de hoje é **por turno** (`session.rewindFiles { promptId }`); o store é **por arquivo**
([ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)).

**Recomendação:**

- **por arquivo:** `session.rewindFiles` ganha `paths?` (campo opcional, sem subir `v`): o
  `UndoPlanner` já decide cada caminho sozinho, então filtrar é reusar o mesmo cálculo — preserva o
  alterado à mão, restauração atômica, trilha antes do disco (`session.filesRewound`, com o alcance em
  `details`, sem migration);
- **por trecho:** comando novo `session.rejectChange { sessionId, path, hunkId, revision }`. Os trechos
  são calculados no backend entre o snapshot e o disco **agora**, e só quando o disco ainda tem o hash
  que a sessão deixou (se não tem, o arquivo é `modifiedOutside` e só se rejeita inteiro, preservando);
  a `revision` é o hash do disco no cálculo — mudou, `SESSION_CHANGE_STALE` (`409`);
- **desfazer a rejeição**, em vez de confirmar: rejeitar guarda o conteúdo que substituiu e oferece
  desfazer (toast do plano 06) enquanto o arquivo não mudar de novo. Confirmação fica só para rejeitar
  **tudo**.

### D-18 — "aceitar" uma alteração

Na extensão do VS Code, aceitar é manter a alteração e fechar o diff. Aqui a alteração já está no
disco: aceitar não escreve nada.

**Recomendação:** aceitar é uma **marca de revisão**, por arquivo e por sessão, guardada no estado da
aba de pasta (que o plano 06 restaura ao recarregar) — nunca no servidor, nunca na trilha. A view
"Alterações" filtra pendentes e revisados.

---

## F4 — Painel de chat

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | A sessão nasce no primeiro prompt (rascunho sem subprocesso) ou ao abrir a conversa | — (custo medido: ~222 MB e 1 processo por sessão) | B-33 | 2026-09-28 · **a sessão nasce no primeiro prompt**: "nova conversa" é rascunho do cliente; o primeiro envio faz `session.start` (modelo, modo e esforço do rascunho) e, no `session.started`, o `session.prompt`; recusa no teto mantém o rascunho. Decisão do usuário com a recomendação | ✅ |
| D-09 | Várias sessões da mesma pasta em abas, e como o teto de 10 aparece para quem tem várias abas | se mostrar a ocupação **global** do teto revela atividade de outros usuários | B-32, B-42 | 2026-09-28 · **várias conversas por pasta, em abas do painel**; `SESSION_LIMIT_REACHED` diz que o teto é da instalação, com o tempo de espera, e lista as sessões **do usuário**; a ocupação global não aparece. Decisão do usuário com a recomendação | ✅ |
| D-11 | O que a aba de pasta inativa mantém das sessões dela | a D-11 do plano 06 (o que uma aba inativa mantém vivo) | B-42 | 2026-09-28 · **as sessões vivas das abas inativas continuam anexadas**, pela [D-11 do plano 06](../06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas), decidida pelo usuário com esta recomendação; a aba inativa suspende o polling da lista e a renderização | ✅ |
| D-13 | De onde vem o catálogo da instalação — comandos, skills e modelos — antes de a sessão existir | a D-06 do plano 13 (catálogo sem sessão viva); quanto custa uma query efêmera que só pergunta | B-36, B-50 | 2026-09-28 · **`GET /catalog?workspacePath=` com cache** por versão do CLI e pasta, e **query efêmera** sem cache (sem prompt, sem token, conta no teto enquanto dura, uma por vez por chave); as skills de usuário e de sistema entram pelo plugin do plano 13. Decisão do usuário com a recomendação; se a D-06 do plano 13 decidir outra fonte, esta passa a ser a dele | ✅ |
| D-20 | Exportar conversa: o que entra e onde é gerado | — | B-39 | 2026-09-28 · **gerada no cliente, em Markdown**, a partir das páginas do transcript que a pessoa já lê; nenhum endpoint novo; saída de tool só com opção ligada, desligada por padrão. Decisão do usuário com a recomendação | ✅ |
| D-21 | Notificação do navegador: quando pedir, quando mostrar e o que dizer | — | B-42 | 2026-09-28 · **permissão pedida só por ação explícita**; notifica com a página escondida, no fim de turno e no pedido de permissão; o texto diz a pasta e o tipo, nunca o comando. Decisão do usuário com a recomendação | ✅ |

### D-07 — a sessão nasce no primeiro prompt

**Recomendação:** sim. "Nova conversa" é um rascunho do cliente, na aba de pasta; o primeiro envio
faz `session.start` (com modelo, modo e esforço escolhidos no rascunho) e, no `session.started`, o
`session.prompt`. Recusa no teto mantém o rascunho inteiro. O menu `/` e o seletor de modelo, que
hoje precisam de sessão viva, leem no rascunho o catálogo da D-13.

### D-09 — várias sessões da mesma pasta e o teto

**Recomendação:** várias conversas por pasta, em abas do painel, cada uma com a sua sessão quando
viva. O teto é da instalação: a recusa (`SESSION_LIMIT_REACHED`) diz isso, com o tempo de espera, e
lista as sessões **do usuário** para ele escolher qual encerrar. Não mostrar a ocupação global — é
dado sobre a atividade de outras pessoas.

### D-11 — o que a aba inativa mantém

Permissão só chega a quem está anexado. Se a aba inativa desanexar as sessões, o pedido que nasce
nelas só aparece por push ou ao voltar — exatamente o que o usuário pediu para não acontecer.

**Recomendação:** as sessões vivas das abas inativas **continuam anexadas** (o stream é barato
perto do subprocesso, e as dez sessões possíveis cabem nos 16 de `maxAttachedSessions`); o que a aba
inativa suspende é o polling da lista e o que é da tela (renderização). Alinhar com a D-11 do
[plano 06](../06-workbench/README.md) antes da B-42.

**Decidido em 2026-09-28**, junto com a D-11 do plano 06, que adotou esta recomendação.

### D-13 — o catálogo antes da sessão

O menu `/`, o seletor de modelo e o esforço precisam da lista da instalação, e ela vem de métodos de uma
`query()` viva (`supportedCommands()`, `supportedModels()`). No rascunho (D-07) não há sessão.

| Opção | Consequência |
|---|---|
| **catálogo com cache + query efêmera no primeiro pedido** | `GET /catalog?workspacePath=` responde do cache por versão do CLI e pasta (o padrão do `CommandCatalog` do plano 04); sem cache, abre uma `query()` que só pergunta — nunca cede prompt, não custa token —, conta no teto enquanto dura e fecha |
| só o cache | a primeira conversa numa pasta não tem menu nem modelos até o primeiro prompt |
| esperar o plano 13 | o 13 depende deste; seria ciclo |

**Recomendação:** catálogo com cache e query efêmera, uma por vez por chave (duas conversas juntas fazem
uma chamada). As skills de usuário e de sistema entram pelo plugin local do
[plano 13](../13-claude-settings/README.md) quando ele existir, e o catálogo passa a incluí-las sem mudar
de forma. Se o 13 decidir outra fonte (a D-06 dele), esta fonte vira a dele.

### D-20 — exportar conversa

O [plano 04](../04-transcript-and-resume/README.md) deixou exportação fora por ser superfície de
vazamento sem demanda. A demanda agora existe.

**Recomendação:** geração **no cliente**, a partir das páginas do transcript que a pessoa já pode
ler — nenhum endpoint novo, nada que a tela não mostre. Markdown com mensagens, thinking recolhido e
tools compactas com o input; saída de tool só com a opção ligada, desligada por padrão (pode carregar
conteúdo de arquivo e segredo).

### D-21 — notificação do navegador

**Recomendação:** pedir a permissão do navegador só por ação explícita da pessoa (nunca ao abrir);
notificar só com a página escondida, quando um turno termina ou uma permissão é pedida; o texto diz a
pasta e o tipo ("o Claude pede permissão em remote-claude"), **nunca** o comando — a notificação
aparece na tela bloqueada, como o push do plano 02.

---

## F5 — Composer e contexto

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | De onde vem o autocomplete do `@` | se o plano 11 (o localizador de arquivos) chega antes desta fase | B-48 | 2026-09-28 · **fuzzy pelo `GET /search/files` do plano 11**, com a F5 esperando a F1 de lá; se a ordem não permitir, a completação por segmento sobre `GET /files/tree` entra como passo provisório registrado no progresso, e a troca para fuzzy vira task. Decisão do usuário com a recomendação. **2026-10-02:** a F5 entrou no passo provisório (o 11 não tinha começado), e a troca, por decisão do usuário, é a [B-25 do plano 11](../11-search/F2-search-ui.md#b-25--o--do-composer-do-08-passa-ao-localizador-) — o plano que traz a fonte | ✅ |
| D-22 | Arquivo arrastado do desktop: anexo enviado ou gravado na pasta | — | B-01, B-45, B-49 | 2026-09-28 · **anexo enviado** (B-45): imagem vira bloco de imagem, texto vira conteúdo delimitado com o nome, com teto e tipo, fora do workspace, morre com a sessão; gravar na pasta é o upload do plano 07, ação separada oferecida ao lado. Decisão do usuário com a recomendação | ✅ |
| D-23 | Como estimar o tamanho do contexto em tokens, e onde ficam o aviso e o teto | a janela de contexto do modelo em uso (do `getContextUsage()`) e o que o `Read` carrega de um arquivo grande | B-47 | 2026-09-28 · **estimativa de ≈ 4 bytes por token** pelo tamanho dos arquivos, dita como estimativa; pasta como "*n* itens"; anexo pelo tamanho real; aviso acima de 25 % da janela livre (`getContextUsage()` com sessão, padrão configurado no rascunho); teto por `maxItems` e por bytes configurado. Decisão do usuário com a recomendação; **o limiar e o padrão do rascunho são provisórios** até a medida | ✅ |

### D-12 — o autocomplete do `@`

O usuário pediu autocomplete "da mesma forma que o plugin do Claude" — fuzzy, com os abertos e recentes
primeiro.

| Opção | Consequência |
|---|---|
| **fuzzy pelo `GET /search/files`** do [plano 11](../11-search/README.md) | igual ao VS Code; cria a dependência 09·F5 ← 10·F1 |
| completar caminho por segmento sobre `GET /files/tree` do [plano 07](../07-explorer-and-editor/README.md) | sem dependência nova, exato, mesma cerca — mas não é o que foi pedido |
| endpoint próprio, mais estreito | duplica o plano 11, e duplicação é portão |

**Recomendação:** o localizador do plano 11, com a F5 deste plano esperando a F1 de lá. Se a ordem dos
planos não permitir, a completação por segmento entra como passo provisório **registrado** no
[progresso](progress.md), e a troca para fuzzy vira task deste plano — nunca uma diferença calada.

### D-22 — arquivo do desktop

O usuário disse: arrastar do desktop sobe como anexo, "nunca gravado na pasta em silêncio".

**Recomendação:** anexo enviado (a B-45): imagem vira bloco de imagem, texto vira conteúdo delimitado
com o nome, com teto e tipo; vive fora do workspace e morre com a sessão. Gravar na pasta é o upload do
[plano 07](../07-explorer-and-editor/README.md), uma ação separada e explícita que a tela oferece ao lado
— depois dela, o arquivo é da pasta e entra como referência comum.

### D-23 — o tamanho do contexto

Referência não custa token no envio; custa quando o Claude a lê. O conjunto de contexto precisa dizer o
que **pode** custar.

**Recomendação:** estimar pelo tamanho dos arquivos (≈ 4 bytes por token, dito como estimativa), pasta
como "*n* itens" sem somar recursivamente, anexo pelo tamanho real. Aviso acima de 25 % da janela livre
do modelo (do `getContextUsage()`, quando há sessão; de um padrão configurado, no rascunho); teto duro
pelo `maxItems` do schema e por um teto de bytes configurado.

---

## F6 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: o `smoke-live` roda na fixture gerada por execução, como decidiu a D-07 do plano 04 | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 08`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
