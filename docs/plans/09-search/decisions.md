# Plano 09 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> **Já decidido pelo usuário (2026-09-26), fora desta tabela:** o plano é **só busca**. Controle
> de versão (git) saiu inteiro — ver o [Não entra](README.md#não-entra) do plano.
>
> Os fatos citados como "medido" foram conferidos nesta máquina em 2026-09-26: **nenhum `rg` no
> `PATH`** — o `rg` do shell é uma *função* que executa o binário do Claude Code com `argv0=rg`; o
> pacote `@anthropic-ai/claude-agent-sdk-linux-x64@0.3.277` traz só o executável `claude`, sem
> `vendor/ripgrep`; pnpm 10.18 com `onlyBuiltDependencies: [esbuild]` — todo outro pacote fica
> proibido de rodar script de instalação.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | De onde vem o binário do ripgrep: `@vscode/ripgrep`, o do sistema, ou o que o SDK carrega | se o *postinstall* do `@vscode/ripgrep` funciona sob o `onlyBuiltDependencies` do pnpm 10 e sem rede no CI; como o plano 17 empacota | B-01, B-07 | 2026-09-28 · **`@vscode/ripgrep`, versão fixada**, no `onlyBuiltDependencies` com a justificativa no ADR-016 (B-01) e verificação de integridade do binário baixado; `RC_RIPGREP_PATH` como sobreposição validada no boot (existe, executa, versão mínima), com caminho inválido derrubando o boot; nunca o `claude` do SDK. Baixar ou empacotar fica para o plano 17, que ganhou a D-08. Decisão do usuário com a recomendação | ✅ |
| D-02 | Transporte do resultado de busca: HTTP com teto, HTTP em fluxo (NDJSON) ou evento WS | tempo até o primeiro resultado e até o fim numa pasta grande — não medido | B-03, B-10 | 2026-09-28 · **HTTP em fluxo (NDJSON)** desde o início, não a resposta única da recomendação. Decisão do usuário. Em fluxo: `POST /search/text` e `/search/replace/preview`, com uma linha por arquivo; resposta única: `GET /search/files` e `POST /search/replace`. Erro detectável antes do primeiro byte sai com o status próprio; depois dele, o fluxo **sempre** fecha com `{type:'end'}` ou `{type:'error'}`, e fluxo sem linha final é tratado como `SEARCH_ENGINE_FAILED`. A ordem é montada no cliente, ao inserir. Muda B-03, B-04, B-10, B-11, B-13 e os cenários S-71, S-75, S-77 e os novos S-163…S-171 | ✅ |
| D-03 | Exclusões padrão da busca e do Quick Open: o que se pula sem o usuário pedir | as exclusões que o plano 07 fixar para a árvore (D-10 dele) | B-03, B-09, B-10 | 2026-09-28 · **as exclusões da D-10 do 07 + o `search.exclude` padrão do VS Code + `.gitignore`/`.ignore`/`.rgignore`**, com o botão "usar exclusões e arquivos de ignore"; `.git/` pulado sempre; ocultos aparecem; listas na seção "Busca" das configurações do 06, classificadas pela D-13 de lá. O gap fechou quando o 07 decidiu a D-10. Decisão do usuário com a recomendação | ✅ |

### D-01 — de onde vem o ripgrep

O VS Code usa o `@vscode/ripgrep`: um pacote npm cujo *postinstall* baixa o binário da release do
GitHub para a plataforma. Três caminhos, com o que foi medido:

| Opção | A favor | Contra |
|---|---|---|
| (a) `@vscode/ripgrep`, versão fixada | mesmo binário do VS Code; mesma versão em toda máquina; licença permissiva | o *postinstall* precisa entrar no `onlyBuiltDependencies` — hoje só o `esbuild` roda script de instalação, e abrir essa porta é decisão de cadeia de suprimentos; baixa da rede na instalação |
| (b) o do sistema (`rg` no `PATH` ou caminho configurado) | zero dependência nova | **medido: esta máquina não tem `rg`**; versão diferente por máquina muda o JSON e as flags |
| (c) o que o SDK carrega | já está instalado | **medido: não existe como arquivo** — o SDK 0.3.277 traz só o `claude`, e o "`rg`" do shell é o próprio `claude` chamado com `argv0=rg`. É detalhe interno, não documentado, de outro produto |

**Recomendação:** (a), fixada, com o pacote acrescentado ao `onlyBuiltDependencies` **com a
justificativa no ADR-016** (aberto em B-01) e verificação de integridade do binário baixado; mais
`RC_RIPGREP_PATH` como sobreposição explícita para quem prefere o do sistema — validado no boot
(existe, executa, versão mínima), com caminho inválido **derrubando o boot**, como a allowlist.
Nunca (c). Se o binário é baixado na instalação ou empacotado no artefato é pergunta do
[plano 17](../17-distribution/README.md), que é avisado por nota, não editado agora.

### D-02 — como o resultado chega

| Opção | A favor | Contra |
|---|---|---|
| (a) HTTP, resposta única com teto e `truncated` | contrato simples; cancelamento pelo abort da requisição; o `api.ts` já sabe fazer | o primeiro resultado só aparece quando a busca termina ou atinge o teto |
| (b) HTTP em fluxo (NDJSON, `Transfer-Encoding: chunked`) | resultado progressivo, como o VS Code; sem contrato WS | o `api.ts` precisa ler fluxo; proxy pode bufferizar |
| (c) evento WS num stream próprio com `seq` próprio | progressivo, reaproveita a conexão | contrato WS nas três pontas (tipos Dart) e `pnpm test:e2e:mobile` no critério |

**Recomendação:** (a) agora, com (b) como evolução se a medição do D-06 mostrar p90 acima de 2 s
até o fim numa pasta típica. (c) só se o plano 07 já tiver um stream por pasta que sirva — e aí a
mudança de contrato vira task explícita aqui, com o comando mobile no critério.

**Resultado (2026-09-28):** o usuário escolheu **(b), desde o início**. A escolha abriu três gaps,
fechados no mesmo dia, todos com a recomendação:

| Gap | Resposta |
|---|---|
| quais endpoints transmitem em fluxo | `POST /search/text` e `POST /search/replace/preview`, uma linha por arquivo (casamentos e, na prévia, o ETag). `GET /search/files` fica em resposta única, porque ordena por pontuação com teto e tem orçamento de p95 < 150 ms. `POST /search/replace` também fica em resposta única, porque devolve o relatório do lote |
| fim e falha depois do `200` | erro detectável **antes** do primeiro byte (`400`, `403`, `404`, `413`, `422`, `429`) sai com o status próprio, como hoje. Depois do primeiro byte o fluxo **sempre** fecha com exatamente uma linha final: `{type:'end', truncated, skipped}` ou `{type:'error', code, messageKey, params}`. Fluxo sem linha final (conexão caída) ou com linha malformada o cliente trata como `SEARCH_ENGINE_FAILED`. É uma exceção explícita à regra "nunca `200` com erro no corpo", registrada no [doc 04](../../architecture/shared/04-errors-and-http.md) pela B-03: o status já saiu, e o erro é tipado, nunca uma lista vazia com `200` |
| ordem determinística do B-10 | o `rg` roda em paralelo e as linhas chegam em qualquer ordem. O hook insere cada arquivo na posição ordenada (caminho, depois posição), então a lista final é determinística. Com truncamento, o **conjunto** pode variar, e o contrato diz isso |

Cabeçalhos da resposta em fluxo: `Content-Type: application/x-ndjson`, `Cache-Control: no-transform`
e `X-Accel-Buffering: no`, contra o proxy que bufferiza. O contrato WebSocket não muda, e o
`pnpm test:e2e:mobile` continua fora do critério.

### D-03 — o que se pula sem pedir

O VS Code separa duas listas: `files.exclude` (some da árvore **e** da busca) e `search.exclude`
(some só da busca: `**/node_modules`, `**/bower_components`, `**/*.code-search`), e por padrão
respeita `.gitignore`, `.ignore` e `.rgignore`, com um botão para desligar tudo isso.

| Opção | O que faz |
|---|---|
| (a) só o `.gitignore` | `node_modules` num projeto sem `.gitignore` afoga toda busca |
| (b) as exclusões da árvore do 07 + o `search.exclude` padrão do VS Code + arquivos de ignore, com o botão "usar exclusões e arquivos de ignore" | fidelidade, e uma lista só para a árvore e a busca |

**Recomendação:** (b). `.git/` é pulado **sempre**, inclusive com o botão desligado; arquivos
ocultos aparecem (como no VS Code) a menos que excluídos. As listas são preferência do usuário na
seção "Busca" das configurações do [06](../06-workbench/README.md) (B-19), classificadas pela D-13
de lá. Depende da D-10 do [07](../07-explorer-and-editor/README.md), decidida em 2026-09-28.

---

## F1 — Busca

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Qual motor aplica o substituir: o próprio ripgrep (`--replace` + `--json`) ou `RegExp` do JavaScript | se o JSON do ripgrep fixado traz o texto substituído por casamento, com offsets — **exige spike** | B-11 | 2026-09-28 · **o ripgrep com `--replace` e `--json`**, um motor só; o Node só costura os bytes nos offsets; "preservar caixa" é pós-processamento. **Provisório até o spike da B-11**: se o JSON trouxer só a linha substituída, a substituição é reconstruída por linha, ainda pelo ripgrep. Decisão do usuário com a recomendação | ✅ |
| D-05 | Semântica do aplicar em lote com precondição por arquivo | — (é escolha de contrato; o precedente é o ADR-013) | B-11, B-16 | 2026-09-28 · **por arquivo, como o desfazer do ADR-013**: aplica o que bate, preserva e relata o divergente, `200` com o relatório; falha de escrita no meio é `500` `INTERNAL_ERROR` com `params.applied`; pedido sem ETag em algum arquivo é `428` e nada é escrito. Decisão do usuário com a recomendação | ✅ |
| D-06 | Tetos e prazos iniciais da busca e da listagem | tempo e memória de `rg --files` e `rg --json` em pasta grande — **medir** | B-09, B-10 | 2026-09-28 · **a tabela inicial, configurável por `RC_SEARCH_*`, medida antes de fechar a F1** (este repositório com e sem `node_modules`, o kernel Linux, com e sem `-U`); a medição ajusta a tabela. Com a D-02 em fluxo, a medição deixa de decidir o transporte e passa a registrar o tempo até o primeiro arquivo. Decisão do usuário com a recomendação | ✅ |
| D-07 | Lista de caminhos do localizador (Quick Open e `@` do 08): recalcular a cada consulta, cache com TTL, ou cache invalidado pelo watcher do 07 | quanto custa `rg --files` numa pasta grande (D-06) e se o watcher do 07 é observável de dentro do backend | B-09 | 2026-09-28 · **cache por realpath com TTL de 10 s e *single-flight***, consultado depois da allowlist; invalidação pelo watcher do 07 quando ele publicar a mudança como evento interno (`EventEmitter2`). Decisão do usuário com a recomendação | ✅ |

### D-04 — um motor só para prévia e aplicação

A prévia sai do ripgrep, que usa a sintaxe de regex do Rust (tempo linear, sem backtracking). Se a
aplicação usar `RegExp` do JavaScript, são **dois motores**: sintaxe diferente (`$1` × `$<n>`,
classes Unicode, `\b`), a prévia mostra uma coisa e o disco recebe outra — e o `RegExp` faz
backtracking, reabrindo o ReDoS que o ripgrep fecha.

| Opção | O que faz |
|---|---|
| (a) ripgrep com `--replace` e `--json`: ele devolve o casamento e a substituição; o Node só costura os bytes nos offsets | um motor; o Node não interpreta regex |
| (b) `RegExp` com flag `v` no Node | dois motores e ReDoS |
| (c) `re2` (binding nativo) | motor linear, mas módulo nativo com script de instalação (plano 17) e ainda um segundo motor |

**Recomendação:** (a). Gap: confirmar no ripgrep fixado (D-01) que o JSON traz, por submatch, o
texto de substituição — se trouxer só a linha substituída, o B-11 reconstrói a substituição por
linha, ainda com o ripgrep como único motor. "Preservar caixa" (o botão `AB` do VS Code) é
pós-processamento puro do texto já substituído, testável em unit.

### D-05 — o aplicar em lote

Aplicar o substituir mexe em vários arquivos com base no que o humano **viu** na prévia. Entre ver
e aplicar, o Claude pode ter escrito num deles — ou o próprio humano, no editor.

| Opção | O que faz |
|---|---|
| (a) tudo-ou-nada: qualquer divergência → `412` e nada é escrito | simples; um arquivo tocado pelo Claude trava o lote inteiro |
| (b) por arquivo, como o desfazer do ADR-013: aplica o que bate, **preserva** e relata o divergente, `200` com o relatório | fidelidade ao VS Code e ao precedente da casa |
| (c) `207 Multi-Status` | fora da tabela do [doc 04](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) |

**Recomendação:** (b). O arquivo preservado não é erro do pedido, é estado respeitado, exatamente
como no [desfazer](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso).
Falha de **escrita** no meio do lote é `500` `INTERNAL_ERROR` com `params.applied`, no mesmo molde
do `session.error.rewindIncomplete`; pedido sem ETag em algum arquivo é `428`
`PRECONDITION_REQUIRED` (código do plano 07), e nada é escrito.

### D-06 — tetos e prazos

Valores iniciais, todos configuráveis por variável `RC_SEARCH_*`:

| Medida | Inicial | Referência |
|---|---|---|
| casamentos por busca | 20 000 | `search.maxResults` padrão do VS Code |
| arquivos listados para o Quick Open | 200 000 | — |
| resultados devolvidos pelo Quick Open | 50 (teto 200) | — |
| latência do localizador com a lista em cache | p95 < 150 ms | o `@` do composer do 08 abre a cada tecla |
| prévia por casamento | 250 caracteres em torno do casamento | — |
| arquivo pulado na busca | acima de 20 MB (5 MB em modo multilinha, que lê o arquivo inteiro) | — |
| buscas simultâneas por usuário | 2 | — |
| prazo da busca e da listagem | 15 s, com resultado parcial | — |
| arquivos num aplicar | 1 000 | — |

**Recomendação:** adotar esses valores e **medir antes de fechar a F1**: `rg --files` e
`rg --json` com um padrão comum neste repositório, neste repositório com `node_modules` fora do
ignore, e num repositório público grande (o do kernel Linux, ~80 mil arquivos), com e sem `-U`. A
medição entra aqui e ajusta a tabela.

### D-07 — a lista de caminhos do localizador

O localizador pontua a consulta contra **todos** os caminhos da pasta a cada tecla — no Quick Open e no `@` do composer do [plano 08](../08-claude-panel/README.md), que tem orçamento de p95 < 150 ms. Recalcular
`rg --files` por consulta custa o que o D-06 medir; guardar a lista custa memória e pode ficar
velha.

| Opção | O que faz |
|---|---|
| (a) recalcular sempre | sempre fresco; caro em pasta grande |
| (b) cache por pasta com TTL curto (10 s) e *single-flight* | barato; arquivo criado há 3 s pode faltar |
| (c) (b) + invalidação quando o watcher do 07 reporta mudança na pasta | fresco e barato, se o evento interno existir |

**Recomendação:** (b) agora, (c) quando o 07 publicar a mudança como evento interno do backend
(`EventEmitter2`, [backend/03](../../architecture/backend/03-modules.md#comunicação-assíncrona)). O
cache é chaveado pelo **realpath** da pasta e consultado **depois** da validação da allowlist — pasta
que saiu da allowlist não é respondida pelo cache.

---

## F2 — Busca na web

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Editor de resultados de busca: só em memória, ou salvável como `.code-search` compatível com o VS Code | — (escolha de produto) | B-17 | 2026-09-28 · **salvável como `.code-search`** no formato do VS Code, pela escrita do 07 (trilha e conflito dele); `**/*.code-search` fora da própria busca; histórico de buscas em `localStorage` com `try/catch`. Decisão do usuário com a recomendação | ✅ |

### D-08 — o editor de resultados

O *Search Editor* do VS Code abre os resultados como um documento numa aba: com linhas de
contexto, re-executável, editável como texto e salvável como `.code-search` para abrir de novo.

| Opção | O que faz |
|---|---|
| (a) só em memória, por aba de pasta | nenhuma escrita em disco; some ao fechar |
| (b) salvável como `.code-search` no formato do VS Code, pela escrita do 07, onde o usuário escolher | abre no VS Code também; entra na trilha como qualquer escrita humana do 07 |

**Recomendação:** (b). O arquivo é texto do usuário como qualquer outro — a escrita, a trilha e o
conflito são os do [07](../07-explorer-and-editor/README.md), e o `**/*.code-search` fica fora da
própria busca pela D-03. Histórico de buscas é conveniência por visitante (`localStorage`, com
`try/catch`), seguindo a classificação da D-13 do [06](../06-workbench/README.md).

---

## F3 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto: a fixture segue a D-07 do plano 04 — gerada por execução, nunca um diretório fixo)* | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md).
3. Rode `pnpm plan progress 09`: o contador sai daqui, no [progresso do plano](progress.md) e no
   [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; o efeito dela no plano vai para o
  [progresso](progress.md).
