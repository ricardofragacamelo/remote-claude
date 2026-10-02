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

### B-06 — O executor de subprocesso 🔲

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

### B-07 — O binário do ripgrep 🔲

Resolve o binário conforme a D-01 no boot, executa `--version`, loga caminho e versão, e **derruba o
boot** se o caminho configurado não existe, não executa ou está abaixo da versão mínima — mesma
política da allowlist: configuração errada não sobe em silêncio. Nunca procura `rg` no `PATH` do
processo, que nesta máquina resolveria para uma função de shell que executa o `claude`.

Falha **em execução** (binário apagado depois do boot, crash, código de saída 2 sem saída útil)
responde `502` `SEARCH_ENGINE_FAILED`; código 1 do ripgrep é "nada achado" e responde `200` vazio.

### B-08 — O domínio da busca 🔲

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

### B-09 — O localizador de caminhos 🔲

`rg --files` na pasta resolvida, com as exclusões da D-03 e o `.gitignore` respeitado (ou não, com
`includeIgnored`), `.git/` sempre fora. Pastas derivadas dos caminhos dos arquivos quando `kinds`
pede `dir`. Lista guardada conforme a D-07 (chaveada pelo realpath, consultada **depois** da
validação da allowlist, *single-flight* para consultas simultâneas na mesma pasta fria) e tetos da
D-06: pasta acima do teto de arquivos devolve o que listou com `truncated`; prazo estourado idem,
com `reason: 'timeout'`. Consulta vazia devolve só os `prefer` que existem — o cliente decide o que
mostra sem consulta.

Serve ao Quick Open e ao `@` do composer do [plano 08](../08-claude-panel/README.md); o orçamento de
latência do contrato (p95 < 150 ms em cache) é medido num teste de integração com uma pasta de
50 mil arquivos, não suposto.

### B-10 — A busca em texto 🔲

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

### B-11 — O substituir: prévia e aplicação 🔲

**Prévia** (`POST /search/replace/preview`): a busca do B-10 com `--replace` pelo motor da D-04, e
por arquivo o **ETag** (sha256, o mesmo do 07) do conteúdo que foi lido — é o que o cliente devolve
ao aplicar. Em fluxo como a busca (D-02): uma linha por arquivo, com o ETag nela, e a mesma linha
final.

**Aplicar** (`POST /search/replace`): para cada arquivo pedido, lê de novo pelo `files` do 07; ETag
diferente → **preservado** e relatado `changed`; sumiu → `missing`; virou binário ou grande →
`skipped` com o motivo; senão recalcula a substituição sobre o conteúdo atual (o mesmo motor) e
escreve pela **escrita humana do 07** — atômica, preservando fim de linha, BOM e modo, com a entrada
`file.*` na trilha **antes** do disco e `details.via: 'replace'`. Semântica do lote pela D-05.
Trilha indisponível: nada escrito, `500`. Falha de escrita no meio: `500` `INTERNAL_ERROR` com
`params.applied`, e nenhum arquivo fica truncado (a escrita do 07 é atômica por arquivo).

A escrita é humana para o ADR-013: um arquivo que a sessão viva escreveu e o substituir mudou depois
é **preservado** pelo desfazer daquele turno — cenário explícito, não suposição.

### B-12 — Os controllers HTTP 🔲

`adapter/inbound/http/search/`: DTOs com `class-validator`, o `folder` passado ao
`ResolveWorkspaceUseCase` antes de qualquer processo, mapeamento de erro pelo filtro existente, corpo
acima do limite → `413`, e o abort da requisição ligado ao `AbortSignal` do caso de uso. Os status
batem com a tabela documentada no B-03, verificados pelo `http-contract.spec.ts` do e2e.

---

## Cenários cobertos

S-06…S-101, S-163…S-168.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
