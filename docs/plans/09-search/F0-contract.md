# F0 — Contrato

Plano: [09 — Busca](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** a F0 do [plano 07](../07-explorer-and-editor/README.md) — o módulo `files`, os
códigos `FILE_*`/`PRECONDITION_REQUIRED` e a escrita humana auditada que o substituir usa — e a F0 do
[plano 06](../06-workbench/README.md), que define o workbench onde as telas moram.
**Entrega:** a decisão de arquitetura sobre executar o ripgrep, o módulo `search` registrado com
suas fronteiras, o contrato HTTP documentado, os códigos de erro no catálogo e as regras estáticas
que impedem um segundo caminho até `child_process`.

**Por quê primeiro:** é a primeira vez que o backend executa um programa **que não é o Claude**, com
entrada vinda do usuário (padrão, globs, caminhos). A disciplina de execução é arquitetura, não
detalhe de implementação — e regra que não é verificada por máquina não existe
([AGENTS.md](../../../AGENTS.md)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — ADR-016: o ripgrep por subprocesso, com disciplina fixa 🔲

Abre o ADR-016 em [00-decisions](../../architecture/shared/00-decisions.md): a busca executa o
ripgrep como **subprocesso**, e toda execução segue as mesmas regras, sem exceção por conveniência:

- `execFile`/`spawn` com **argv em array** e `shell: false` — nenhum texto do usuário é interpretado
  por shell, nunca;
- binário por **caminho absoluto** resolvido uma vez no boot (D-01), nunca procurado no `PATH` a
  cada chamada — o `PATH` desta máquina resolve `rg` para uma função de shell que executa o `claude`;
- o padrão entra como `--regexp=<padrão>` (ou `-e` seguido do padrão como elemento próprio), os
  globs como `--glob=<glob>`, e `--` antes de todo caminho — padrão, glob ou nome de arquivo que
  começa com `-` é **dado**, não opção;
- flags sempre presentes: `--no-config` (ignora `RIPGREP_CONFIG_PATH`), `--json`, `--no-follow`
  implícito (nunca `-L`), teto de tamanho de arquivo, `--max-columns` com prévia,
  `--regex-size-limit` e `--dfa-size-limit`; flags **nunca** usadas: `--pre`, `--pre-glob`
  (executam programa por arquivo), `-z`/`--search-zip` (executa descompressores), `-P`/`--pcre2`
  (motor com backtracking);
- **env mínimo** por lista de permissão (`PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`) — nenhuma
  variável `RC_*`, nenhuma credencial de banco, OIDC ou push;
- prazo em toda execução, `SIGTERM` e depois `SIGKILL`; teto de bytes lidos; o filho morre quando a
  requisição que o pediu é abortada;
- **um único adapter** importa `node:child_process` (B-05 faz a máquina garantir isso).

Registra também o que a D-01 decidir sobre a origem do binário e a entrada dele no
`onlyBuiltDependencies`. Não há teste de código nesta task; os cenários que a verificam são os do
executor (B-06) e das regras estáticas (B-05).

### B-02 — Módulo `search` no catálogo e nas fronteiras 🔲

Registra o módulo em [backend/03](../../architecture/backend/03-modules.md#criando-um-módulo-novo):
responsabilidade ("localizar arquivos e texto dentro de uma pasta liberada, e substituir"), o que
**não** é dele (escrever arquivo — é do `files` do 07; decidir se a pasta pode ser aberta — é do
`workspace`), e o lugar no diagrama de fronteiras: `search → workspace` (resolver a pasta, pela porta
existente) e `search → files` (ler com ETag e escrever o resultado do substituir, pelas portas do 07).
Sem ciclo: `files` não conhece `search`.

A linguagem própria que justifica o módulo: consulta, casamento, prévia, truncamento, lote. A fatia
nasce nas quatro camadas ([backend/02](../../architecture/backend/02-folder-structure.md)), com o
executor de subprocesso em `adapter/outbound/process/` — técnico, sem regra de negócio, pronto para
ser reusado por outro módulo sem que ninguém reimplemente a disciplina do ADR-016.

### B-03 — Contrato HTTP da busca 🔲

Documenta em backend/03, com a tabela de status de cada endpoint, no molde do `GET /audit-entries`:

| Endpoint | O que faz |
|---|---|
| `GET /search/files?folder=&query=&kinds=&prefer=&limit=&includeIgnored=` | localizador de caminhos: arquivos e/ou pastas (`kinds=file,dir`) pontuados pela consulta, com as posições casadas para destaque; `prefer` (repetível, teto de 50) são caminhos que sobem na ordem — os recentes e abertos da aba |
| `POST /search/text` | busca em texto: `folder`, `pattern`, `isRegex`, `caseSensitive`, `wholeWord`, `multiline`, `include[]`, `exclude[]`, `useIgnoreFiles`, `onlyPaths[]` (só nos editores abertos), `contextLines` |
| `POST /search/replace/preview` | a mesma consulta + `replacement` + `preserveCase`: por arquivo, cada casamento com antes/depois e o **ETag** do conteúdo lido |
| `POST /search/replace` | aplica: a consulta + `replacement` + `files[{path, etag}]`; relatório por arquivo (`applied`, `changed`, `missing`, `skipped`) conforme a D-05 |

`POST` para leitura porque a consulta tem corpo estruturado; é seguro e sem efeito colateral (os
dois primeiros `POST` não escrevem nada). Resultado com `truncated: null | { reason: 'limit' |
'timeout' }` e `skipped` (binário, grande, ilegível, nome não representável). Pasta resolvida pelo
`workspace` antes de qualquer processo: `403` `WORKSPACE_NOT_ALLOWED`/`FORBIDDEN`, `404`
`WORKSPACE_NOT_FOUND`, `422` `WORKSPACE_NOT_A_DIRECTORY`. Caminhos de resultado relativos à pasta,
com `/`. Colunas em unidades UTF-16 — é o que o editor do 07 conta.

**O localizador tem dois consumidores, e o contrato serve aos dois:** o Quick Open deste plano e o
`@` do composer do [plano 08](../08-claude-panel/README.md), que autocompleta arquivos **e pastas**
da pasta aberta para pôr no contexto do prompt. Por isso: `kinds` escolhe arquivos, pastas ou
ambos (pasta é derivada dos arquivos listados — pasta vazia não aparece, e isso é dito no contrato);
`prefer` põe recentes e abertos na frente sem que o servidor precise saber o que é uma aba; teto de
resultado (`limit`, padrão 50, teto 200); `.gitignore` e exclusões respeitados, com
`includeIgnored=true` para incluir o ignorado; e um **orçamento de latência** declarado — p95 abaixo
de 150 ms com a lista em cache (D-07), que é o que um menu que abre a cada tecla tolera. O cliente
cancela a consulta anterior a cada tecla e descarta resposta velha; o servidor mata o que ainda
estiver rodando para a consulta abortada.

A forma da resposta segue a D-02; as exclusões padrão, a D-03. A busca é por **aba de pasta** do 07:
o `folder` é o da aba, e nada do estado de uma aba vaza para outra. Os limites de taxa por usuário do
[plano 05](../05-hardening-operations/README.md) se somam ao teto de concorrência deste plano.

### B-04 — Códigos de erro novos e chaves de tradução 🔲

Entram no [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio)
**antes** de existir no código, e em `error-catalogue.ts`, com `messageKey` em en e pt-BR:

| `code` | HTTP | Significa |
|---|---|---|
| `SEARCH_PATTERN_INVALID` | 400 | padrão que o motor não compila: sintaxe (`reason: 'syntax'`, com a posição quando o motor diz), recurso fora da sintaxe do Rust — lookaround, *backreference* (`'unsupported'`) —, ou acima do limite de tamanho compilado (`'tooComplex'`) |
| `SEARCH_ENGINE_FAILED` | 502 | o ripgrep falhou ou sumiu — mesma classe do `CLAUDE_UNAVAILABLE`: dependência que caiu, não bug nosso |

E os usos novos de códigos existentes, cada um com sua `messageKey`: `RATE_LIMITED` com
`params.scope: 'search'`; `PAYLOAD_TOO_LARGE` com `params.measure: 'files'` no aplicar;
`INVALID_INPUT` com `search.error.globOutsideFolder` e `search.error.pathOutsideFolder`. Prazo
estourado **não** é erro: é `200` com `truncated.reason: 'timeout'` — o que se achou vale.

### B-05 — Regras estáticas: `child_process` confinado, shell proibido 🔲

Três regras verificadas por máquina ([09](../../architecture/shared/09-code-quality.md#regras-de-arquitetura-como-lint)):

- `dependency-cruiser`: `node:child_process` (e `child_process`) só pode ser importado de
  `adapter/outbound/process/`;
- regra própria no `scan:security`, ao lado das do Agent SDK: `shell: true`, `exec(`, `execSync(` e
  `spawn` com uma string única de comando reprovam em `backend/src`;
- o semgrep (`p/nodejs`, `p/command-injection`) acusa `execFile` com argumento não literal no
  adapter — a supressão é **na linha**, com o id da regra e a justificativa depois de `--` citando o
  ADR-016 ([suprimir uma regra](../../architecture/shared/09-code-quality.md#suprimir-uma-regra)); supressão
  sem justificativa reprova.

Cada regra ganha um teste com um arquivo-probe que a viola e é reprovado.

---

## Cenários cobertos

S-01…S-05.

---

## Critério de conclusão

```bash
pnpm verify
pnpm docs:check
```
