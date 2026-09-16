# Plano 04 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> As sete decisões deste plano foram fechadas em **2026-09-16**, com quatro dos gaps medidos na
> máquina em vez de estimados. Os números citados abaixo vêm da
> [§9 da descoberta](../../discovery/01-descoberta-claude-agent-sdk.md#9--terceira-rodada-de-spikes-2026-09-16),
> que é o registro dos spikes; aqui ficam as escolhas.

---

## F0 — Transcript

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Quais sessões do VSCode aparecem: todas as de `~/.claude/projects/`, ou só as dos workspaces da allowlist | o que o usuário espera ver, e o que ele consideraria vazamento | B-02 | 2026-09-16 · **só a allowlist**, com o `cwd` de cada sessão revalidado e a origem vinda do **nosso** banco — o SDK não a informa | ✅ |
| D-02 | Tamanho da página do transcript, e se a leitura começa pelo fim | tamanho típico de uma conversa real — não medido | B-04 | 2026-09-16 · **25 mensagens (teto 100), pela cauda**, com cache no backend: `limit`/`offset` não reduzem o trabalho do SDK | ✅ |

### D-01 — o que aparece de fora

O transcript vive no mesmo arquivo que o VSCode usa, então **tudo** que foi conversado na
máquina está ao alcance. Listar tudo é coerente com "a máquina é do usuário"; listar só o que
está na allowlist mantém a mesma fronteira que vale para executar — e evita que um projeto que o
usuário deliberadamente não liberou apareça na tela do celular.

**Decidido:** restringir à allowlist. O store medido fecha o argumento — 22 workspaces, 298
sessões, 668 MB, e entre eles transcript de projeto de cliente. Listar tudo significa que
qualquer falha no canal móvel expõe conversa de cliente que ninguém liberou para lá. Uma cerca,
não duas.

O argumento de custo aponta para o mesmo lado: `listSessions({ dir })` custa **21 ms** por
workspace, contra **281 ms** para varrer o store inteiro.

O que a decisão cria:

- a listagem é `listSessions({ dir })` **por workspace da allowlist**, nunca `listSessions({})`;
- **`includeWorktrees: false` explícito e revalidação do `cwd` devolvido.** O default é `true`, e
  o worktree de um repositório liberado é outro caminho em disco, fora da entrada da allowlist.
  Confiar no `dir` que pedimos não basta: o filtro é sobre o `cwd` que voltou. Cenário novo —
  S-55;
- **sessão sem `cwd` é excluída**, por falha fechada: não há como provar que pertence a workspace
  liberado. Não é caso de borda — são **55 das 298** sessões medidas, 18 % do store. Cenário
  novo — S-54;
- **a origem não vem do SDK.** `SDKSessionInfo` tem `sessionId`, `summary`, `lastModified`,
  `fileSize`, `customTitle`, `firstPrompt`, `gitBranch`, `cwd`, `tag` e `createdAt` — nenhum
  campo de procedência —, e `includeProgrammatic: false` devolveu as mesmas 298 sessões, então
  nem o diff entre as duas listas distingue. A origem sai do **nosso** banco: é nossa se temos
  linha dela. Afeta B-02 e B-06;
- **o rótulo é "externa", não "VSCode".** Sessão que não é nossa pode ter vindo do terminal.
  Dizer "VSCode" seria a UI afirmando o que não sabe. Afeta S-11 e a i18n da B-09.

### D-02 — o tamanho da página, e quem ela protege

O gap era o tamanho de uma conversa real. Medido: **p50 = 333 linhas, p90 = 1698, máx = 5099**,
e na maior sessão do store (12,7 MB) essas linhas viram **803 mensagens** — cerca de
**16,5 KB por mensagem**, porque o payload carrega input e output de tool.

E a medição derrubou a premissa que dava sentido à pergunta. `limit`/`offset` **não reduzem o
trabalho do servidor**: na maior sessão, a leitura completa custou 66 ms e ~30 MB de heap, e
`limit: 1` custou 47 ms e ~29 MB. O parse do JSONL é integral em toda chamada, porque o SDK
reconstrói a cadeia de `parentUuid` antes de cortar a fatia.

**Decidido:** página de **25** mensagens, teto **100**, lida **pela cauda**. 25 × 16,5 KB ≈
400 KB, que é o que se pode entregar a um celular; pela cauda porque a intenção é continuar, e
conversa se lê como chat.

O que a decisão cria:

- **cache no backend, chaveado por `sessionId` + `lastModified`** — o `lastModified` do
  `listSessions` é a chave de invalidação pronta. Sem ele, cada página pagaria um parse de até
  30 MB. Cenário novo — S-64;
- **o R-04 muda de forma:** "estourar memória ao ler de uma vez" não se resolve com página
  menor, porque a página menor custa o mesmo. Resolve-se com teto de cache e **limite de
  leituras concorrentes**. Afeta B-04;
- **o cursor da B-04 estava certo, e por um motivo observado:** a ordem do `listSessions` muda
  sob escrita concorrente — aconteceu dentro do próprio probe, em menos de um segundo, porque a
  sessão que media estava sendo escrita. Offset cru pularia e duplicaria linha. O cursor é sobre
  `(lastModified, sessionId)`. Cenário novo — S-57;
- **"vazia" e "não existe" não se distinguem por `getSessionMessages`:** ele devolve `[]` nos
  dois casos (2 ms para id inexistente). O `NOT_FOUND` do S-04 exige `getSessionInfo`, que
  devolve `undefined`. Sem isso, S-03 e S-04 colidem. Cenário novo — S-56.

---

## F1 — Telas de histórico

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | A lista é por workspace (entra-se no workspace e vê-se as sessões) ou global com filtro | quantos workspaces e quantas sessões por workspace | B-06 | 2026-09-16 · **dois níveis**: lista de workspaces da allowlist → sessões do workspace | ✅ |

### D-03 — a forma da lista

Medido: **22 workspaces, 298 sessões**, com distribuição muito torta — p50 de **1** sessão por
workspace, e **154** num só (52 % do store).

**Decidido:** dois níveis. Entra-se no workspace e vê-se as sessões dele.

A distribuição torta é o argumento nos dois sentidos, e o que pesa mais é a fronteira: a
allowlist do D-01 passa a ser **visível na navegação**, em vez de virar um filtro que o usuário
pode não perceber que existe. O workspace de 154 sessões também não afoga os outros 21.

O que a decisão cria:

- a chamada barata é a natural: cada tela de workspace é um `listSessions({ dir })` — 21 ms —, e
  nunca a varredura do store inteiro;
- **a lista de sessões do workspace precisa da sua própria paginação.** 154 sessões num
  workspace não cabem numa tela, e a ordem default do `listSessions` já é `lastModified`
  descendente, o que a B-06 pode usar direto;
- **sessão sem `cwd` não tem balde** — dois níveis reforçam a exclusão do D-01: não há workspace
  onde pendurá-la;
- **o S-12 muda de significado**: "as sessões do workspace aberto", não "o filtro de uma lista
  global". Afeta B-06 e a i18n da B-09.

---

## F2 — Retomada

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Retomar uma sessão que está **aberta agora** no VSCode: permitir, avisar ou recusar | o que o CLI faz com dois consumidores na mesma sessão — **exige spike** | B-12 | 2026-09-16 · **fork na externa, in-place na nossa**: `resume` + `forkSession: true` fora, `resume` puro no que criamos | ✅ |

### D-04 — duas bocas no mesmo arquivo

`persistSession: true` compartilha o JSONL com o VSCode, e é isso que permite continuar do
celular o que começou no editor. O que não foi medido é o caso simultâneo: o editor com a sessão
aberta e nós retomando a mesma.

O spike reformulou a pergunta em vez de respondê-la: **não há como detectar que uma sessão está
aberta no editor agora.** Os locks de `~/.claude/ide/` são por instância de IDE — nomeados por
PID — e guardam credencial, então o backend não deveria lê-los, e eles não dizem qual
`sessionId` está aberto. Havia 7 processos do Claude da extensão rodando durante a medição e
nenhum caminho suportado ligando processo a sessão. "Recusar se estiver aberta" não é
implementável: não se recusa o que não se detecta.

**Decidido:** a estratégia depende da origem, não de uma detecção que não existe.

- **sessão nossa** → `resume` puro. Um `sessionId`, um transcript, histórico de undo preservado.
- **sessão externa** → `resume` + `forkSession: true`. Nunca escrevemos no arquivo que o editor
  pode estar usando.

O risco que o fork elimina não é cosmético: dois escritores no mesmo JSONL bifurcam a cadeia de
`parentUuid`, e `getSessionMessages` reconstrói **uma** cadeia — um dos lados desaparece da
leitura, em silêncio.

O que a decisão cria:

- a origem do D-01 ganha **segunda função**: decide a estratégia de retomada, não só o rótulo da
  lista. Se ela estiver errada, escrevemos no transcript de outro consumidor — o que promove a
  origem de detalhe de UI a invariante de correção. Afeta B-10 e B-12;
- **a UI precisa dizer que a continuação de sessão externa vive num id novo**, e que o editor
  não verá as respostas dadas do celular. A promessa é editor → celular, e sempre foi só essa;
- **fork não copia o histórico de undo** (documentado no SDK). Isso **coincide** com o limite que
  a B-21 já impunha — "só alcança o que aquela sessão tocou" —, então a F4 não perde nada que
  prometia. Vale registrar como coerência, não como acidente;
- **o S-24 continua valendo para as nossas**, que é onde "está viva" é observável: retomar sessão
  nossa que já está viva é `attach`, não um segundo `start`;
- **risco residual registrado:** não ficou verificado que o picker do VSCode esconde as sessões
  que criamos. A doc do SDK diz que pickers de IDE passam `includeProgrammatic: false`, mas na
  medição esse filtro não mudou nada (298 em ambos). Então "in-place na nossa" apoia-se em
  hábito de uso, não em garantia do CLI. Se aparecer transcript intercalado numa sessão nossa, é
  aqui que a investigação começa — e a saída é promover tudo para fork.

---

## F3 — Slash commands

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | A UI mostra todos os comandos da instalação (57 na medida) ou um subconjunto curado | quais são úteis remotamente — vários pressupõem terminal interativo | B-15 | 2026-09-16 · **lista buscável, menos internos e mortos**, com um grupo de sugeridos por cima — filtro por metadado, nunca por nome | ✅ |

### D-05 — o menu é descoberta, não fronteira

`supportedCommands()` devolveu **54** comandos nesta instalação, com `settingSources:
['project']` — a descoberta havia medido 57. A contagem varia por instalação, por versão e pelos
skills instalados, o que é exatamente por que a B-14 proíbe lista fixa.

E a lista crua tem lixo que não é opinião nossa: `agents` vem com a descrição começando em
`(removed)`, `extra-usage` vem como `Renamed to /usage-credits`, dois comandos têm prefixo `__`
(`__remote-workflow`, `workflow-launch-exec`) e `heapdump` despeja o heap em `~/Desktop` — uma
operação sem sentido para quem está no ônibus.

**Decidido:** mostrar tudo numa lista buscável, filtrando por **metadado** e não por nome —
prefixo `__` é interno; descrição que começa com `(removed)` ou `Renamed to` é morta. Em cima,
um grupo "sugeridos".

O que a decisão cria:

- **o grupo "sugeridos" é um ranking de nomes, não uma lista de comandos.** Nome ausente na
  instalação simplesmente não aparece, o que honra a B-15 ("instalação sem um comando não o
  mostra") sem virar a lista hardcoded que a B-14 proíbe;
- **o menu não é fronteira de segurança.** A caixa de prompt aceita qualquer texto, então
  ausência no menu não impede `/heapdump` ser digitado. Impedir um comando é regra de deny — do
  [plano 03](../03-rules-and-audit/F0-rules.md) —, não ausência de item. Registrar isso evita
  que a F3 seja super-projetada como se fosse controle de acesso;
- **o cache da B-17 é chaveado pela versão do binário que o SDK spawna**, não pela do `PATH`:
  há dois CLIs nesta máquina — 2.1.226 no `PATH` e 2.1.273 na extensão do VSCode —, e cachear
  pela versão errada serve menu de outra instalação;
- cenário novo S-60: comando morto ou interno não aparece no menu.

---

## F4 — Desfazer

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | O que `rewindFiles()` faz com arquivo alterado **fora** da sessão depois do checkpoint | comportamento do SDK — **exige spike**; é a diferença entre desfazer e perder trabalho | B-18, B-21 | 2026-09-16 · o SDK sobrescreve em silêncio, o `dryRun` não denuncia e **não há filtro por arquivo** → o desfazer é **nosso**: snapshot por turno, revert por arquivo, e `rewindFiles()` não é usado | ✅ |

### D-06 — desfazer sem destruir

O desfazer existe como rede de segurança de quem aprova de longe. Se ele sobrescrever alteração
que o usuário fez à mão no editor depois do checkpoint, ele deixa de ser rede e vira risco.

O spike respondeu, contra o Claude real, num repositório descartável:

```text
turno 1: a sessão escreve a.txt = "ONE" e b.txt = "BEE"
turno 2: a sessão altera a.txt = "TWO"
à mão:   a.txt = "EXTERNAL EDIT BY THE USER"   e   c.txt, que a sessão nunca tocou

dryRun  → { canRewind: true, filesChanged: [a.txt], insertions: 1, deletions: 1 }
rewind  → { canRewind: true, skippedLinks: 0 }
depois  → a.txt = "ONE"      b.txt = "BEE"      c.txt intacto
```

**Sobrescreve, em silêncio.** E o achado que mais muda a fase: **o `dryRun` não denuncia o
perigo.** Ele reportou um reverte de uma linha, de aparência trivial, porque as contagens são
calculadas contra o checkpoint e não têm como saber que o conteúdo atual foi escrito pelo
usuário. Uma confirmação construída só sobre o `dryRun` seria tranquilizadora e destrutiva.

E há um segundo fato, que não é comportamento e sim assinatura: **`rewindFiles` não aceita
filtro de arquivo.** Uma chamada reverte todos os arquivos divergentes do checkpoint, e não há
como pedir "todos menos este". Somado ao primeiro achado, isso torna "preservar o que o usuário
editou e reverter o resto" **impossível** em cima dessa API — não difícil, impossível.

**Decidido:** o desfazer é **nosso**. Mantemos snapshot próprio do conteúdo anterior, por turno,
e revertemos **arquivo por arquivo**, escolhendo quais. `rewindFiles()` não é usado.

Arquivo cujo estado atual não é o que nossa sessão deixou é **preservado**; os demais revertem;
o resultado diz o que voltou, o que ficou e por quê. O que mudou em relação à primeira redação
desta decisão não é o comportamento prometido — é que agora ele é implementável.

O mecanismo, que não depende do SDK além dos hooks:

| Hook | O que guarda |
|---|---|
| `UserPromptSubmit` | abre o checkpoint do turno, com o texto do prompt como rótulo do ponto de desfazer |
| `PreToolUse` | na primeira vez que o turno toca um caminho, o **conteúdo anterior** (ou "ausente") |
| `PostToolUse` | hash e mtime do **resultado** — a linha de base da divergência |
| `PostToolUseFailure` | nada: tool que falhou não mexeu no arquivo |

A chave é `(session_id, prompt_id, path)`. O `prompt_id` vem do `BaseHookInput` em **todo** hook
— "UUID correlating a user prompt with all subsequent events until the next prompt" —, então não
precisamos ler o transcript nem casar mensagem de prompt para saber a que turno um snapshot
pertence.

O que a decisão cria:

- **três hooks e um store, no plano 01**, não aqui: a linha de base e os snapshots têm de existir
  desde a primeira sessão, senão o desfazer julga sessões para as quais nunca houve registro.
  Entrou como [B-46](../01-live-session/F3-audit.md) (estado resultante) e
  [B-47](../01-live-session/F3-audit.md) (o store de checkpoint), com os cenários S-99…S-108 de
  lá. Esta fase **consome** esse registro; não o cria;
- **o preview da B-19 é diff nosso**, calculado entre o snapshot e o conteúdo atual — não o
  `dryRun` do SDK, que já se provou tranquilizador e errado;
- **herdamos a segurança de link, e ela passa a ser requisito explícito.** O SDK recusava
  caminho que virou symlink, hard link ou arquivo não regular, e caminho cujo diretório-pai
  deixou de resolver para onde apontava — era o `skippedLinks`. Escrevendo nós, essa checagem é
  nossa, e sem ela o restore é um caminho para escrever fora do workspace. Cenário novo — S-65;
- **restauração atômica**, arquivo por arquivo: escreve em temporário no mesmo diretório e
  renomeia. Sem isso, falha no meio deixa arquivo truncado — pior que não ter revertido.
  Cenário novo — S-66;
- **o store tem teto e purga.** Referência medida: o store equivalente do CLI
  (`~/.claude/file-history/`) ocupa 6,6 MB para 54 sessões, então o custo é pequeno — mas
  pequeno sem teto continua crescendo. Cenário novo — S-67;
- **`enableFileCheckpointing: true` deixa de ser load-bearing.** Continua ligado, porque é o
  `/rewind` do próprio usuário no editor; deixa de ser o nosso mecanismo. A opção continua no
  `sdk-options.factory` com a justificativa corrigida;
- **deixou de exigir sessão viva.** `rewindFiles` é método de `Query`; nosso store não é. Então
  "sessão fechada não desfaz" (S-39) passou de **limitação** a **política** — mantida por
  escolha conservadora, e registrada aqui como reversível sem mudança de mecanismo;
- **dois cenários mudam de sentido**, porque eram artefatos do SDK: o S-61 deixa de ser sobre
  `tool_result` como alvo — o nosso alvo é `prompt_id` — e passa a ser alvo que não é checkpoint
  nosso; o S-62 deixa de ser sobre as duas formas de erro do SDK e passa a ser falha parcial da
  nossa própria restauração;
- **S-40 e S-41 continuam válidos, e agora por construção nossa**: o alcance é o conjunto de
  caminhos que aquele turno tocou, e restaurar o mesmo snapshot duas vezes é idempotente porque
  escrever o mesmo conteúdo duas vezes é idempotente.

---

## F5 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | Contra qual repositório descartável o `smoke-live` roda o `/init` | o `/init` **escreve** no projeto; não pode ser o nosso | B-25 | 2026-09-16 · **fixture gerada por execução** — `git init` em tmpdir, um arquivo, um commit —, nunca um repo fixo | ✅ |

### D-07 — onde o `/init` pode escrever

**Decidido:** o `smoke-live` gera a fixture na hora: `git init` num tmpdir, um arquivo, um
commit, e teardown no fim. Nunca um repositório fixo, e nunca o nosso.

Repo fixo acumula estado entre execuções — o segundo `/init` encontra o `CLAUDE.md` que o
primeiro escreveu, e o teste passa a medir outra coisa. Fixture gerada é reprodutível por
construção, e foi o que o spike do D-06 usou.

O que a decisão cria:

- a asserção é sobre o arquivo **na fixture**, e o `cwd` do `smoke-live` nunca é o repositório
  do produto;
- o teardown apaga o tmpdir, e a fixture entra no `.gitignore` de nada — ela não nasce dentro da
  árvore.

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md).
3. Rode `pnpm plan progress`: o contador sai daqui, no [progresso do plano](progress.md) e no
   [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; o efeito dela no plano vai para o
  [progresso](progress.md).
