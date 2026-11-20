# F1 — Busca no backend

Plano: [11 — Busca](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md), e da F2 do [plano 07](../07-explorer-and-editor/README.md) (a
escrita atômica com ETag e trilha que o substituir usa).
**Entrega:** o executor de subprocesso, o ripgrep resolvido e verificado no boot, o localizador de
caminhos, a busca em texto e o substituir — atrás dos quatro endpoints do contrato, com tetos,
prazos, cancelamento e nenhum caminho para injeção de argumento.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-06 — O executor de subprocesso ✅

Porta `ProcessRunner` em `application/search/ports/` (outro módulo que precisar declara a própria,
implementada pelo mesmo adapter) e o adapter `NodeChildProcessRunner` em `adapter/outbound/process/`
— o único arquivo do backend que importa `node:child_process` (B-05). Implementa o ADR-016 inteiro:
argv em array sem shell, env por lista de permissão, prazo com `SIGTERM` → `SIGKILL`, teto de bytes
(o filho morre ao atingi-lo e o resultado vem marcado truncado), `AbortSignal` que mata o filho,
stdin fechado depois de escrito, saída entregue **por linha** (o JSON do ripgrep é uma mensagem por
linha) e em bytes, sem decodificação que troque byte inválido em silêncio.

Loga em `debug` ([logging](../../architecture/shared/03-logging.md)) binário, subcomando, `cwd`,
duração, código de saída, bytes lidos e se truncou — **nunca** o padrão, o texto de substituição nem
conteúdo de arquivo: o usuário pode estar procurando exatamente a senha que vazou.

Testes: unit com fake do `child_process` para os ramos de prazo, teto e abort; integração com um
binário-stub (script de teste que imprime o próprio argv e env, dorme, ou despeja bytes) — é o que
prova, sem o ripgrep, que `$(touch x)` chega como texto e que nenhuma `RC_*` chega ao filho.

### B-07 — O binário do ripgrep ✅

Resolve o binário conforme a D-01 no boot, executa `--version`, loga caminho e versão, e **derruba o
boot** se o caminho configurado não existe, não executa ou está abaixo da versão mínima — mesma
política da allowlist: configuração errada não sobe em silêncio. Nunca procura `rg` no `PATH` do
processo, que nesta máquina resolveria para uma função de shell que executa o `claude`.

Falha **em execução** (binário apagado depois do boot, crash, código de saída 2 sem saída útil)
responde `502` `SEARCH_ENGINE_FAILED`; código 1 do ripgrep é "nada achado" e responde `200` vazio.

### B-08 — O domínio da busca ✅

TypeScript puro em `domain/search/`, testável sem processo:

- `SearchQuery` (VO): padrão não vazio e dentro do teto de comprimento; modo literal ou regex; caixa;
  palavra inteira; multilinha **ligada automaticamente** quando o padrão contém `\n`, como no VS Code;
  globs de inclusão/exclusão validados — nem absoluto, nem `..`, nem `~`, teto de itens — e
  `onlyPaths` (só nos editores abertos) relativos e dentro da pasta;
- a pontuação *fuzzy* do localizador: casa subsequência, favorece o nome do arquivo, depois
  contiguidade e início de palavra (`/`, `-`, `_`, *camelCase*), depois caminho curto; `prefer` soma
  um bônus que põe recentes e abertos na frente sem esconder um casamento muito melhor; empate
  estável; devolve as posições casadas para o destaque;
- a **contenção do resultado**: todo caminho que volta do ripgrep é relativizado à pasta e
  descartado se resolveria fora dela — defesa em profundidade, porque o ripgrep não segue symlink e
  só anda dentro da pasta, mas a regra não depende disso;
- "preservar caixa": `foo` → `Bar` vira `bar`/`Bar`/`BAR` conforme a caixa do casamento, como o
  botão `AB` do VS Code.

Erros de formato viram `400` `INVALID_INPUT` com **todos** os campos em `details[]`.

### B-09 — O localizador de caminhos ✅

`rg --files` na pasta resolvida, com as exclusões da D-03 e o `.gitignore` respeitado (ou não, com
`includeIgnored`), `.git/` sempre fora. Pastas derivadas dos caminhos dos arquivos quando `kinds`
pede `dir`. Lista guardada conforme a D-07 (chaveada pelo realpath, consultada **depois** da
validação da allowlist, *single-flight* para consultas simultâneas na mesma pasta fria) e tetos da
D-06: pasta acima do teto de arquivos devolve o que listou com `truncated`; prazo estourado idem,
com `reason: 'timeout'`. Consulta vazia devolve só os `prefer` que existem — o cliente decide o que
mostra sem consulta.

Serve ao Quick Open e ao `@` do composer do [plano 08](../08-claude-panel/README.md); o orçamento de
latência do contrato (p95 < 150 ms em cache) é medido num teste de integração com uma pasta de
50 mil arquivos, não suposto (S-61).

**Cancelamento (S-62):** cada consulta HTTP carrega o `AbortSignal` da própria requisição até o
`FindPathsUseCase.execute`; a `LocateCache` conta, por listagem fria, quantas dessas consultas ainda
esperam o resultado — cada uma que dá um `signal` é uma espera; uma sem `signal` é permanente, e a
listagem nunca morre por conta dela. A listagem é abortada só quando a última espera rastreada sai,
nunca enquanto outra ainda espera: uma nova tecla mata a busca da anterior sem derrubar a de quem
ainda compartilha a mesma pasta fria.

**Nome de arquivo não-UTF-8 (S-63):** `Buffer#toString('utf8')` nunca lança — troca byte inválido por
`U+FFFD` em silêncio, o que garantiria o caminho errado em vez de omiti-lo. O adaptador valida cada
linha do `rg --files` com um `TextDecoder('utf-8', { fatal: true })` antes de decodificar; a que
falha é omitida e contada em `skipped`, devolvido pelo contrato (`SearchLocatePayload.skipped`).

### B-10 — A busca em texto ✅

`rg --json` com o que o B-08 validou, lido **em fluxo** e repassado em fluxo (D-02): cada arquivo vira
uma linha NDJSON **assim que o `rg` o fecha**, sem esperar o fim da busca, com linha, coluna em
UTF-16, trecho de prévia numa janela em torno do casamento (linha minificada de 5 MB não vira
resposta de 5 MB), intervalos de destaque e, quando pedido, linhas de contexto (o editor de
resultados do B-17 usa). Binário e arquivo acima do teto são pulados e contados em `skipped`; erro de
leitura de um arquivo (apagado pelo Claude durante a busca) também — a busca não cai por um arquivo.

Tetos e prazo da D-06: ao atingir o teto de casamentos, o processo é encerrado e a resposta diz
`truncated.reason: 'limit'`; prazo estourado devolve o que achou com `'timeout'`. O abort da
requisição mata o processo. No máximo duas buscas simultâneas por usuário; a terceira recebe `429`
`RATE_LIMITED` (`scope: 'search'`) com `Retry-After`. O fluxo fecha **sempre** com uma linha final:
`end` com `truncated` e `skipped`, ou `error` com o `code` quando o `rg` cai depois do primeiro byte.
O que já saiu não é desfeito. O servidor não ordena, porque o `rg` roda em paralelo: sem
truncamento, o **conjunto** de arquivos e casamentos é determinístico, e a ordem é montada pelo
cliente (B-13).

**Medido na execução — `skipped` só conta o que o `--json` do `rg` realmente sinaliza:** um
arquivo binário ainda é lido e casado pelo `rg` (o `end` carrega `binary_offset`), então dá para
contar e excluir do resultado (S-67). Um arquivo **acima do teto de bytes** (`--max-filesize`),
descoberto durante a varredura de uma pasta, é excluído pelo próprio `rg` **sem nenhuma linha no
fluxo** — o mesmo silêncio do `.gitignore` — então não há como contá-lo um a um nesse caminho; só
quando o caminho vem de `onlyPaths` (explícito, nunca filtrado pela varredura) o `rg` ainda reporta
o arquivo. Um arquivo apagado entre a abertura da aba e a busca (S-76) sai do `rg` como um código de
saída não-zero só para aquele caminho, nunca interrompe os demais — o executor (B-06) já ignora o
código de saída do processo para decidir sucesso, então isso **já funcionava**, sem mudança.

### B-11 — O substituir: prévia e aplicação ✅

**Medido na execução, corrige a D-04:** o `--replace` do ripgrep não tem efeito nenhum sob
`--json` (o próprio `rg --help` diz: "-r/--replace … have no effect when --json is set") — o
mesmo achado do B-10 sobre `--max-columns`, agora para `--replace`. O motor continua único (o
`rg` é quem casa o padrão, nunca um `RegExp` do Node), mas o texto substituído é resolvido por
este backend (`resolvedReplacementOf`, `$0`/`${0}`/`$$` suportados; `$1`/`${name}` — grupo de
captura — recusado com `SearchPatternInvalidError('unsupported')`, porque `--json` nunca expõe os
limites de um grupo, só o casamento inteiro).

**Prévia** (`POST /search/replace/preview`): a busca do B-10, com o texto resolvido por casamento
e, por arquivo, o **ETag** (sha256, o mesmo do 07) do conteúdo lido — é o que o cliente devolve ao
aplicar. Em fluxo como a busca (D-02): uma linha por arquivo, com o ETag nela, e a mesma linha
final.

**Aplicar** (`POST /search/replace`): para cada arquivo pedido, lê de novo pelo `files` do 07; ETag
diferente → **preservado** e relatado `changed`; sumiu → `missing`; virou binário ou grande →
`skipped` com o motivo; senão o motor casa de novo sobre o conteúdo atual (`onlyPaths` daquele
arquivo só) e `appliedContentOf` faz a substituição, escrita pela **escrita humana do 07** —
atômica, preservando fim de linha, BOM e modo (herdados de `SaveFileUseCase`, nunca reimplementados
aqui), com a entrada `file.*` na trilha **antes** do disco e `details.via: 'replace'` (campo novo
em `SaveFileCommand`, plano 07 cede). Semântica do lote pela D-05; caminho fora da pasta (`..` ou
absoluto) recusa o pedido inteiro antes de tocar qualquer arquivo. Trilha indisponível: nada
escrito, `500`. Falha de escrita no meio: `500` `INTERNAL_ERROR` com `params.applied`, e nenhum
arquivo fica truncado (a escrita do 07 é atômica por arquivo).

A escrita é humana para o ADR-013: um arquivo que a sessão viva escreveu e o substituir mudou depois
é **preservado** pelo desfazer daquele turno — cenário explícito, não suposição (S-95, ainda não
verificado nesta fase — depende de uma sessão viva real, fora do alcance dos testes de F1).

### B-12 — Os controllers HTTP ✅

`adapter/inbound/http/search/`: DTOs com Zod (o padrão já em uso em todo o backend — a menção a
`class-validator` era do rascunho inicial do plano, nunca do código), o `folder` passado ao
`ResolveWorkspaceUseCase` antes de qualquer processo, mapeamento de erro pelo filtro existente, corpo
acima do limite → `413`, e o abort da requisição ligado ao `AbortSignal` do caso de uso. Os status
batem com a tabela documentada no B-03, verificados pelo `http-contract.spec.ts` do e2e (F3).

`POST /search/text` ✅: fluxo NDJSON (D-02), com os três cabeçalhos fixos, uma linha `file` por
arquivo e a linha final `end`/`error`. Verificado por integração contra um app real (Postgres +
Keycloak de teste), não só por unidade com um `Response` fake.

Descoberta na execução: o `SearchController` injetava `FindPathsUseCase` pelo **tipo** do
parâmetro, sem `@Inject()` explícito — o mesmo padrão já usado em todo controller com caso de uso
próprio neste backend (ver `FileTransferController`), mas que a busca não seguia. Sob o transform
de teste (`esbuild`/`oxc`, não o `tsc`), a metadata de tipo de dois parâmetros adjacentes do
mesmo construtor saiu incompleta o bastante para o Nest não resolver o primeiro — um bug **antigo**,
dormente desde a B-09, nunca pego porque nenhum teste de integração HTTP tinha subido o app inteiro
através de `/search/*` até agora. Corrigido com `@Inject(FindPathsUseCase)`/`@Inject(SearchTextUseCase)`
explícitos, a mesma disciplina do resto do backend.

`POST /search/replace/preview` ✅ e `POST /search/replace` ✅: o mesmo molde de `/search/text` —
fluxo NDJSON para a prévia, corpo único `{report}` para o aplicar — com `ReadFileUseCase` e
`SaveFileUseCase` do `files` reutilizados via `FilesModule` importado por `search.module.ts`
(o mesmo padrão de `GatewayModule`/`LifecycleModule`). Verificados por integração contra um app
real, incluindo a escrita de verdade no disco (CRLF, BOM, texto com caractere de shell) — o mesmo
nível de prova do `/search/text`.

O corpo acima do limite (`413`) é o próprio `PAYLOAD_TOO_LARGE` do domínio
(`SearchReplaceTooManyFilesError`, `params.measure: 'files'`), nunca o teto de bytes do corpo HTTP
em si — o Zod só tem um teto de sanidade bem acima do real, para que seja sempre o domínio quem
recusa um lote grande demais (S-94).

As quatro rotas de `/search/*` estão no ar. Toda a F1 (B-06…B-12) está concluída.

> **Nota desta sessão:** fechar S-61…S-63 expôs que a tabela de cenários do B-09 ainda tinha nove
> outros cenários ⬜ (S-47, S-49…S-55, S-58) que esta prosa, antes desta nota, dizia concluídos —
> uma divergência entre a prosa e a própria tabela de cenários. Não foi escopo desta sessão
> investigá-los ou fechá-los; ver `progress.md` para o registro completo dessa pendência.

---

## Cenários cobertos

S-06…S-101, S-163…S-168.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
