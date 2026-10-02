# Plano 11 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Códigos marcados *(novo, B-04)* entram no catálogo pela B-04; os `FILE_*` e o
`PRECONDITION_REQUIRED` são do [plano 07](../07-explorer-and-editor/README.md). Nível "integração"
na web é componente real com MSW ([web/06](../../architecture/web/06-testing.md)).

**A entrada hostil é tratada como dado** — padrão, glob, nome de arquivo e texto de substituição
que começam com `-`, carregam `$(...)`, `;`, crase ou `..` — é equivalência, não erro: o
comportamento esperado é o mesmo do texto comum, e o que se verifica é a **ausência** de efeito (o
arquivo-sentinela não existe no fim).

---

## Contrato e regras estáticas — B-01…B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | import de `node:child_process` fora de `adapter/outbound/process/` → `lint:arch` reprova | err | unit | — | B-05 | ⬜ |
| S-02 | `shell: true`, `exec(`, `execSync(` ou `spawn` com uma string única de comando em `backend/src` → `scan:security` reprova | err | unit | — | B-05 | ⬜ |
| S-03 | supressão do semgrep sem justificativa depois de `--` → lint reprova | err | unit | — | B-05 | ⬜ |
| S-04 | os códigos novos têm status e `messageKey` em en e pt-BR; código usado e não catalogado cai em `500` e o teste do catálogo reprova | err | unit | `SEARCH_PATTERN_INVALID`, `SEARCH_ENGINE_FAILED` *(novos, B-04)* | B-04 | ⬜ |
| S-05 | `search` importa `files` e `workspace` só por barril e porta; um import de `files` para `search` (ciclo) reprova | err | unit | — | B-02 | ⬜ |

## Executor de subprocesso — B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-06 | argv chega ao filho elemento por elemento, sem shell: `$(touch s)`, `; rm -rf x`, crase, `\|` e `&&` são texto, e o sentinela não existe | eq | integração | — | B-06 | ⬜ |
| S-07 | o env do filho tem só a lista de permissão: nenhuma `RC_*`, senha do banco, segredo OIDC ou credencial de push | eq | integração | — | B-06 | ⬜ |
| S-08 | filho que passa do prazo recebe `SIGTERM` e, sem sair, `SIGKILL`; nenhum processo sobra | fron | integração | — | B-06 | ⬜ |
| S-09 | saída acima do teto de bytes: o filho morre ao atingi-lo, o resultado vem truncado e a memória fica limitada | fron | integração | — | B-06 | ⬜ |
| S-10 | o abort mata o filho, e a promessa rejeita como abort, não como falha de processo | est | integração | — | B-06 | ⬜ |
| S-11 | binário inexistente → erro tipado que a borda traduz, nunca `500` genérico | err | unit | `SEARCH_ENGINE_FAILED` | B-06 | ⬜ |
| S-12 | o log `debug` traz binário, subcomando, `cwd`, duração, código de saída, bytes e truncamento — e nunca o padrão, a substituição ou conteúdo de arquivo | eq | integração | — | B-06 | ⬜ |
| S-13 | cinquenta execuções simultâneas não misturam a saída de um filho com a de outro | conc | integração | — | B-06 | ⬜ |
| S-14 | stdin é fechado depois de escrito: filho que lê stdin não fica pendurado | est | integração | — | B-06 | ⬜ |
| S-15 | byte inválido em UTF-8 chega em bytes, sem troca silenciosa por `U+FFFD` | fron | unit | — | B-06 | ⬜ |
| S-16 | linha partida entre dois *chunks* do stdout é remontada inteira antes de virar mensagem | fron | unit | — | B-06 | ⬜ |
| S-17 | abort depois que o filho já saiu é inócuo | idem | unit | — | B-06 | ⬜ |

## Binário do ripgrep — B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-18 | o boot resolve o binário da D-01 e loga caminho e versão | eq | integração | — | B-07 | ⬜ |
| S-19 | caminho configurado inexistente ou não executável derruba o boot, com mensagem que diz qual variável corrigir | err | integração | — | B-07 | ⬜ |
| S-20 | versão abaixo da mínima derruba o boot | fron | unit | — | B-07 | ⬜ |
| S-21 | o `rg` do `PATH` — inclusive uma função de shell que despacha para outro binário — nunca é o escolhido | eq | unit | — | B-07 | ⬜ |
| S-22 | `RIPGREP_CONFIG_PATH` no ambiente do backend não altera a busca | eq | integração | — | B-07 | ⬜ |
| S-23 | binário apagado depois do boot → a busca responde `502` e o backend continua de pé | est | integração | `SEARCH_ENGINE_FAILED` | B-07 | ⬜ |
| S-24 | ripgrep sai com código 2 sem saída útil → `502`; código 1 (nada achado) → `200` vazio | err | integração | `SEARCH_ENGINE_FAILED` | B-07 | ⬜ |

## Domínio da busca — B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-25 | padrão vazio → `400`, regra `required` | err | unit | `INVALID_INPUT` | B-08 | ⬜ |
| S-26 | padrão acima do teto de comprimento → `400`, regra `maxLength` | fron | unit | `INVALID_INPUT` | B-08 | ⬜ |
| S-27 | sintaxe inválida (`(abc`) → `reason: 'syntax'`, com a posição quando o motor informa | err | integração | `SEARCH_PATTERN_INVALID` | B-08 | ⬜ |
| S-28 | lookaround ou *backreference* (`(?=x)`, `\1`) → `reason: 'unsupported'`; PCRE2 nunca é ligado | err | integração | `SEARCH_PATTERN_INVALID` | B-08 | ⬜ |
| S-29 | regex acima do limite compilado (`(a{1000}){1000}`) → `reason: 'tooComplex'` em milissegundos, sem CPU presa | fron | integração | `SEARCH_PATTERN_INVALID` | B-08 | ⬜ |
| S-30 | padrão catastrófico para backtracking (`(a+)+$` contra 50 mil `a` e um `!`) termina em tempo linear | fron | integração | — | B-08 | ⬜ |
| S-31 | padrão que começa com `-` (`--pre=sh`, `-e`, `--files`, `--`) é procurado como texto; nenhum preprocessador roda, nenhum modo muda | eq | integração | — | B-08 | ⬜ |
| S-32 | glob absoluto, com `..` ou com `~` → `400` (`search.error.globOutsideFolder`) | err | unit | `INVALID_INPUT` | B-08 | ⬜ |
| S-33 | glob que começa com `-` vira um único `--glob=`: filtra, não vira opção | eq | integração | — | B-08 | ⬜ |
| S-34 | lista de globs acima do teto de itens → `400` | fron | unit | `INVALID_INPUT` | B-08 | ⬜ |
| S-35 | `onlyPaths` com caminho fora da pasta → `400` (`search.error.pathOutsideFolder`) | err | unit | `INVALID_INPUT` | B-08 | ⬜ |
| S-36 | modo literal escapa metacaracteres: `a.b` não casa `axb`, e `[` sozinho não é erro | eq | unit | — | B-08 | ⬜ |
| S-37 | caixa, palavra inteira e regex combinados dão o resultado da tabela de referência tirada do VS Code | eq | integração | — | B-08 | ⬜ |
| S-38 | padrão com `\n` liga o multilinha sozinho e casa através de linhas | eq | integração | — | B-08 | ⬜ |
| S-39 | *fuzzy*: `wbss` casa `web/src/…/SessionScreen.tsx`; nome do arquivo > contiguidade > início de palavra > caminho curto; empate estável | eq | unit | — | B-08 | ⬜ |
| S-40 | `prefer` põe recente e aberto na frente sem esconder um casamento exato de nome | eq | unit | — | B-08 | ⬜ |
| S-41 | consulta maior que qualquer caminho → lista vazia, não erro | fron | unit | — | B-08 | ⬜ |
| S-42 | caminho de resultado que resolveria fora da pasta é descartado, mesmo que o motor o devolva | fron | unit | — | B-08 | ⬜ |
| S-43 | preservar caixa: `foo`→`bar` dá `bar`/`Bar`/`BAR` para `foo`/`Foo`/`FOO`; caixa mista fica como digitada | eq | unit | — | B-08 | ⬜ |
| S-44 | erros de formato em vários campos voltam todos juntos em `details[]` | err | unit | `INVALID_INPUT` | B-08 | ⬜ |

## Localizador de caminhos (Quick Open e `@` do 08) — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-45 | respeita `.gitignore`, `.ignore` e as exclusões da D-03; `.git/` nunca aparece | eq | integração | — | B-09 | ⬜ |
| S-46 | `includeIgnored=true` traz o ignorado; `.git/` continua fora | eq | integração | — | B-09 | ⬜ |
| S-47 | arquivo oculto (`.env.example`) aparece por padrão, a menos que excluído | eq | integração | — | B-09 | ⬜ |
| S-48 | `kinds=dir` devolve pastas derivadas dos arquivos, `kinds=file,dir` mistura; pasta vazia não aparece, como o contrato diz | fron | integração | — | B-09 | ⬜ |
| S-49 | pasta acima do teto de arquivos → o que listou, com `truncated: { reason: 'limit' }` | fron | integração | — | B-09 | ⬜ |
| S-50 | pasta de 200 mil arquivos (`node_modules` sem ignore) estoura o prazo → parcial com `reason: 'timeout'`, processo morto | fron | integração | — | B-09 | ⬜ |
| S-51 | symlink para fora da raiz não é seguido nem listado com alvo externo | fron | integração | — | B-09 | ⬜ |
| S-52 | pasta fora da allowlist → `403` antes de qualquer processo | err | integração | `WORKSPACE_NOT_ALLOWED` | B-09 | ⬜ |
| S-53 | raiz de outra pessoa → `403` | err | integração | `FORBIDDEN` | B-09 | ⬜ |
| S-54 | pasta inexistente → `404`; arquivo no lugar de pasta → `422` | err | integração | `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY` | B-09 | ⬜ |
| S-55 | pasta que é symlink para fora da raiz → `403`, pela contenção no realpath | err | integração | `WORKSPACE_NOT_ALLOWED` | B-09 | ⬜ |
| S-56 | a mesma consulta dentro do TTL não relista; arquivo criado depois do TTL aparece | idem | integração | — | B-09 | ⬜ |
| S-57 | duas consultas simultâneas na mesma pasta fria disparam **uma** listagem | conc | unit | — | B-09 | ⬜ |
| S-58 | pasta que saiu da allowlist depois de cacheada não é respondida pelo cache | est | integração | `WORKSPACE_NOT_ALLOWED` | B-09 | ⬜ |
| S-59 | consulta vazia devolve só os `prefer` que existem na pasta | fron | unit | — | B-09 | ⬜ |
| S-60 | `limit` fora de 1…200, ou mais de 50 `prefer` → `400` | fron | unit | `INVALID_INPUT` | B-09 | ⬜ |
| S-61 | p95 abaixo de 150 ms com a lista em cache, numa pasta de 50 mil arquivos | fron | integração | — | B-09 | ⬜ |
| S-62 | consulta abortada (nova tecla) mata a listagem fria que ninguém mais espera; se outra consulta a espera, ela continua | conc | integração | — | B-09 | ⬜ |
| S-63 | nome de arquivo não representável em UTF-8 é omitido e contado em `skipped` | fron | integração | — | B-09 | ⬜ |

## Busca em texto — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-64 | resultado agrupado por arquivo, com linha, coluna em UTF-16, prévia e intervalos de destaque | eq | integração | — | B-10 | ⬜ |
| S-65 | coluna correta com caracteres multibyte e emoji antes do casamento | fron | unit | — | B-10 | ⬜ |
| S-66 | linha minificada de 5 MB → prévia numa janela em torno do casamento, resposta dentro do teto | fron | integração | — | B-10 | ⬜ |
| S-67 | binário e arquivo acima do teto são pulados e contados em `skipped` | fron | integração | — | B-10 | ⬜ |
| S-68 | linhas de contexto vêm antes e depois, sem duplicar linha entre casamentos próximos | eq | integração | — | B-10 | ⬜ |
| S-69 | `onlyPaths` restringe a busca aos arquivos dados | eq | integração | — | B-10 | ⬜ |
| S-70 | teto de casamentos → `truncated: { reason: 'limit' }`, e o processo é encerrado ao atingi-lo | fron | integração | — | B-10 | ⬜ |
| S-71 | prazo estourado → o fluxo traz o que achou e fecha com `end` e `reason: 'timeout'` | fron | integração | — | B-10 | ⬜ |
| S-72 | a requisição abortada mata o processo: zero `rg` órfão na tabela de processos | est | integração | — | B-10 | ⬜ |
| S-73 | terceira busca simultânea do mesmo usuário → `429` com `scope: 'search'` e `Retry-After` | conc | integração | `RATE_LIMITED` | B-10 | ⬜ |
| S-74 | buscas de usuários diferentes não disputam a vaga um do outro | conc | unit | — | B-10 | ⬜ |
| S-75 | nenhum casamento → `200` com só a linha `end`, não `404` | fron | integração | — | B-10 | ⬜ |
| S-76 | arquivo apagado pelo Claude durante a busca vira `skipped`, e a busca continua | conc | integração | — | B-10 | ⬜ |
| S-77 | a mesma busca, sem truncamento, devolve o mesmo conjunto de arquivos e casamentos, em qualquer ordem de linhas | idem | integração | — | B-10 | ⬜ |
| S-78 | corpo acima do limite → `413` | fron | integração | `PAYLOAD_TOO_LARGE` | B-10 | ⬜ |
| S-79 | multilinha num arquivo acima do teto menor do modo multilinha → pulado e contado | fron | integração | — | B-10 | ⬜ |
| S-80 | pasta apagada entre a resolução e a execução → `404`, não `502` | err | integração | `WORKSPACE_NOT_FOUND` | B-10 | ⬜ |
| S-163 | o primeiro arquivo chega ao cliente antes de o `rg` terminar: o fluxo é progressivo, não um corpo guardado até o fim | eq | integração | — | B-10 | ⬜ |
| S-164 | todo fluxo fecha com exatamente uma linha final (`end` ou `error`), e nada vem depois dela | eq | integração | — | B-10 | ⬜ |
| S-165 | o `rg` cai depois do primeiro byte → linha `error` com `SEARCH_ENGINE_FAILED`, e o fluxo fecha | err | integração | `SEARCH_ENGINE_FAILED` | B-10 | ⬜ |
| S-166 | erro detectável antes do primeiro byte (padrão que não compila, pasta fora da allowlist, taxa) sai com o status próprio, sem abrir o fluxo | err | integração | `SEARCH_PATTERN_INVALID` | B-10 | ⬜ |
| S-167 | a resposta em fluxo tem `Content-Type: application/x-ndjson`, `Cache-Control: no-transform` e `X-Accel-Buffering: no` | eq | integração | — | B-10 | ⬜ |

## Substituir — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-81 | a prévia lista, por arquivo, antes e depois de cada casamento e o ETag do conteúdo lido | eq | integração | — | B-11 | ⬜ |
| S-82 | grupos de captura (`$1`, `${name}`) produzem o mesmo texto na prévia e no disco — um motor só | eq | integração | — | B-11 | ⬜ |
| S-83 | aplicar com ETags que batem escreve pela escrita atômica do 07, com `file.*` na trilha **antes** do disco e `details.via: 'replace'` | eq | integração | — | B-11 | ⬜ |
| S-84 | arquivo alterado entre prévia e aplicar (Claude ou editor) é preservado e relatado `changed`; os demais são aplicados | conc | integração | — | B-11 | ⬜ |
| S-85 | aplicar duas vezes o mesmo pedido: o segundo não substitui de novo — todos voltam `changed` | idem | integração | — | B-11 | ⬜ |
| S-86 | arquivo apagado entre prévia e aplicar → `missing`, sem recriar | est | integração | — | B-11 | ⬜ |
| S-87 | arquivo que virou binário ou passou do teto → `skipped`, com o motivo | est | integração | — | B-11 | ⬜ |
| S-88 | trilha indisponível → nenhum arquivo escrito, `500` | err | integração | `INTERNAL_ERROR` | B-11 | ⬜ |
| S-89 | falha de escrita no meio do lote → `500` com `params.applied`; nenhum arquivo truncado | err | integração | `INTERNAL_ERROR` | B-11 | ⬜ |
| S-90 | a substituição preserva CRLF, BOM e modo do arquivo | fron | integração | — | B-11 | ⬜ |
| S-91 | caminho no aplicar fora da pasta, com `..` ou absoluto → `400`, nada escrito | err | integração | `INVALID_INPUT` | B-11 | ⬜ |
| S-92 | caminho que virou symlink para fora da raiz entre prévia e aplicar → recusado pela contenção do 07 e relatado; nada escrito fora | err | integração | `WORKSPACE_NOT_ALLOWED` | B-11 | ⬜ |
| S-93 | arquivo sem ETag no pedido → `428`, nada escrito | err | integração | `PRECONDITION_REQUIRED` | B-11 | ⬜ |
| S-94 | arquivos acima do teto num aplicar → `413` com `measure: 'files'` | fron | integração | `PAYLOAD_TOO_LARGE` | B-11 | ⬜ |
| S-95 | arquivo que a sessão viva escreveu e o substituir mudou depois → o desfazer daquele turno o preserva (alteração manual para o ADR-013) | est | integração | — | B-11 | ⬜ |
| S-96 | texto de substituição com `-` no início, `$(…)` ou `;` é escrito literalmente (só as referências de grupo são interpretadas) | eq | integração | — | B-11 | ⬜ |
| S-97 | "preservar caixa" no disco é igual ao da prévia | eq | integração | — | B-11 | ⬜ |
| S-98 | dois aplicar simultâneos sobre o mesmo arquivo: um aplica, o outro vê `changed` | conc | integração | — | B-11 | ⬜ |
| S-168 | a prévia em fluxo traz o ETag em cada linha de arquivo, e a linha final `end` | eq | integração | — | B-11 | ⬜ |

## Controllers — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-99 | sem token → `401` nos quatro endpoints | err | integração | `UNAUTHENTICATED` | B-12 | ⬜ |
| S-100 | tipo errado nos campos → `400` com todos os campos em `details[]` | err | integração | `INVALID_INPUT` | B-12 | ⬜ |
| S-101 | o abort da requisição HTTP chega ao `AbortSignal` do caso de uso | est | integração | — | B-12 | ⬜ |

## Service, hooks e Quick Open — B-13, B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-102 | consulta superada é cancelada pelo `AbortSignal`, e só a última resposta chega à tela | conc | integração | — | B-13 | ⬜ |
| S-103 | o hook do localizador é exportado pela feature e serve o `@` do 08 com `kinds=file,dir` e `prefer` | eq | integração | — | B-13 | ⬜ |
| S-104 | o log `debug` do service não carrega o padrão de busca | eq | integração | — | B-13 | ⬜ |
| S-169 | arquivos que chegam fora de ordem são inseridos na posição ordenada: a lista final é a mesma para qualquer ordem de chegada | conc | unit | — | B-13 | ⬜ |
| S-170 | fluxo cortado sem linha final → estado de erro traduzido de `SEARCH_ENGINE_FAILED`, com o que chegou mantido e marcado como parcial | err | integração | `SEARCH_ENGINE_FAILED` | B-13 | ⬜ |
| S-171 | linha NDJSON malformada → o mesmo estado de erro do fluxo cortado, e a leitura para | err | unit | `SEARCH_ENGINE_FAILED` | B-13 | ⬜ |
| S-105 | Quick Open vazio mostra recentes e abertos da aba de pasta; digitando, eles sobem na lista | eq | integração | — | B-14 | ⬜ |
| S-106 | teclado completo: setas, Enter, Ctrl/Cmd+Enter abre ao lado, Esc fecha; padrão *combobox*; axe sem violação | eq | integração | — | B-14 | ⬜ |
| S-107 | `arquivo.ts:42` abre na linha 42; `:42` sozinho aciona o "ir para linha" do 07 | eq | integração | — | B-14 | ⬜ |
| S-108 | `>` troca o Quick Open para os comandos da palette do 06, e apagar o `>` volta | est | integração | — | B-14 | ⬜ |
| S-109 | resultado truncado diz isso na lista | fron | integração | — | B-14 | ⬜ |
| S-110 | dez teclas rápidas → no máximo uma requisição em voo, e o resultado é o da última | conc | integração | — | B-14 | ⬜ |
| S-111 | Quick Open numa aba cuja pasta saiu da allowlist → erro traduzido na própria lista, com o caminho de volta | err | integração | `WORKSPACE_NOT_ALLOWED` | B-14 | ⬜ |
| S-112 | escolher de novo um arquivo já aberto foca a aba existente em vez de abrir outra | idem | integração | — | B-14 | ⬜ |

## View Busca — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-113 | os quatro estados: carregando (skeleton), erro traduzido com ação, vazio que ensina, conteúdo | eq | integração | — | B-15 | ⬜ |
| S-114 | regex inválida mostra o erro traduzido junto ao campo, sem apagar os resultados anteriores | err | integração | `SEARCH_PATTERN_INVALID` | B-15 | ⬜ |
| S-115 | truncado mostra o motivo (teto ou prazo) e como refinar | fron | integração | — | B-15 | ⬜ |
| S-116 | clique num casamento abre o editor na linha e coluna, com o trecho selecionado | eq | integração | — | B-15 | ⬜ |
| S-117 | milhares de casamentos rolam virtualizados, sem travar a tela | fron | integração | — | B-15 | ⬜ |
| S-118 | dispensar, copiar e recolher funcionam pelo botão e pelo menu de contexto | eq | integração | — | B-15 | ⬜ |
| S-119 | "Buscar na pasta…" do explorer preenche o "a incluir"; Ctrl/Cmd+Shift+F com seleção preenche o campo | eq | integração | — | B-15 | ⬜ |
| S-120 | consulta e botões na search da URL: recarregar reproduz a busca | idem | integração | — | B-15 | ⬜ |
| S-121 | a busca de uma aba de pasta não aparece noutra, e voltar à aba mantém consulta e resultados | est | integração | — | B-15 | ⬜ |
| S-122 | `429` mostra "outra busca em andamento" e oferece tentar de novo depois do `Retry-After` | err | integração | `RATE_LIMITED` | B-15 | ⬜ |
| S-123 | arquivo alterado depois da busca (`workspace.filesChanged` do 07): o resultado dele é marcado desatualizado e "buscar de novo" aparece | conc | integração | — | B-15 | ⬜ |

## Substituir na web — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-124 | "substituir tudo" mostra o alcance antes de aplicar; o relatório diz os aplicados e os preservados | eq | integração | — | B-16 | ⬜ |
| S-125 | a prévia de um arquivo abre no diff editor do 07, só leitura | eq | integração | — | B-16 | ⬜ |
| S-126 | arquivo sujo numa aba de editor: aviso antes de aplicar, e o aviso de mudança externa do 07 depois | conc | integração | — | B-16 | ⬜ |
| S-127 | clique duplo em "substituir tudo" aplica uma vez | idem | integração | — | B-16 | ⬜ |
| S-128 | substituir um casamento ou um arquivo afeta só ele | eq | integração | — | B-16 | ⬜ |
| S-129 | os preservados oferecem "refazer a prévia" só deles | est | integração | — | B-16 | ⬜ |
| S-130 | aplicar que responde `500` com `params.applied` mostra o que foi aplicado e o erro traduzido, sem esconder nenhum dos dois | err | integração | `INTERNAL_ERROR` | B-16 | ⬜ |
| S-131 | alcance acima do teto de arquivos de um aplicar: a prévia diz o teto e pede para refinar antes de aplicar | fron | integração | `PAYLOAD_TOO_LARGE` | B-16 | ⬜ |

## Editor de resultados e histórico — B-17, B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-132 | o editor de resultados abre com a consulta, linhas de contexto ajustáveis de 1 a 9, e reexecuta | eq | integração | — | B-17 | ⬜ |
| S-133 | digitar no editor de resultados não escreve nos arquivos encontrados | eq | integração | — | B-17 | ⬜ |
| S-134 | salvar como `.code-search` pela escrita do 07 e reabrir restaura a consulta (D-08) | idem | integração | — | B-17 | ⬜ |
| S-135 | arquivos `*.code-search` não aparecem nos resultados da busca | fron | integração | — | B-17 | ⬜ |
| S-136 | setas percorrem o histórico **da pasta**, sem duplicata consecutiva, com teto de 50 | fron | integração | — | B-18 | ⬜ |
| S-137 | armazenamento do navegador indisponível → a view funciona, sem histórico | est | integração | — | B-18 | ⬜ |
| S-138 | "limpar histórico" pela palette esvazia só o da pasta | eq | integração | — | B-18 | ⬜ |

## Atalhos, configurações, usabilidade e ajuda — B-19, B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-139 | os comandos estão no registro do 06, traduzidos, e o atalho não dispara num campo que o consome | eq | integração | — | B-19 | ⬜ |
| S-140 | mudar as exclusões na seção "Busca" das configurações vale na busca seguinte | est | integração | — | B-19 | ⬜ |
| S-141 | F4/Shift+F4 percorrem os resultados; no último, F4 volta ao primeiro | fron | integração | — | B-19 | ⬜ |
| S-142 | ajuda presente e traduzida em en e pt-BR no Quick Open e na Busca; "saiba mais" abre a seção certa | eq | integração | — | B-20 | ⬜ |
| S-143 | todo botão de ícone tem *tooltip* e `aria-label` traduzidos | eq | integração | — | B-20 | ⬜ |
| S-144 | o estado vazio ensina o próximo passo (como buscar, o que é regex e glob) | eq | integração | — | B-20 | ⬜ |
| S-145 | literal apresentável nas telas novas → `lint` e `i18n:check` reprovam | err | unit | — | B-20 | ⬜ |
| S-146 | abrir a view foca o campo; Esc devolve o foco ao editor | est | integração | — | B-20 | ⬜ |
| S-147 | no celular, Quick Open e Busca ocupam a tela, sem scroll horizontal, com alvos de 44 px | fron | integração | — | B-20 | ⬜ |

## E2E — B-21…B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-148 | a fixture nasce num tmpdir da raiz de e2e e é apagada no fim; nenhum teste toca o repositório do produto | idem | e2e | — | B-21 | ⬜ |
| S-149 | nomes hostis atravessam do disco à árvore de resultados íntegros e abrem no editor | fron | e2e | — | B-21 | ⬜ |
| S-150 | padrão `--pre=sh`, glob `--pre=x` e `$(touch sentinela)` no padrão e na substituição → o sentinela não existe | eq | e2e | — | B-22 | ⬜ |
| S-151 | prazo devolve parcial; abort deixa zero `rg` órfão; a terceira busca simultânea recebe `429` | conc | e2e | `RATE_LIMITED` | B-22 | ⬜ |
| S-152 | o status de cada endpoint bate com a tabela do contrato | eq | e2e | — | B-22 | ⬜ |
| S-153 | o localizador devolve pastas, respeita `prefer` e traz ignorados só quando pedido | eq | e2e | — | B-22 | ⬜ |
| S-154 | pasta fora da allowlist → `403` pela API, e na web um estado de erro traduzido com caminho de volta | err | e2e | `WORKSPACE_NOT_ALLOWED` | B-22 | ⬜ |
| S-155 | Ctrl/Cmd+P → Enter abre o arquivo; `arquivo:42` abre na linha | eq | e2e | — | B-23 | ⬜ |
| S-156 | busca → substituir tudo → o disco mudou → as entradas aparecem em `/audit` | eq | e2e | — | B-23 | ⬜ |
| S-157 | editor de resultados → salvar → reabrir restaura a consulta | idem | e2e | — | B-23 | ⬜ |
| S-158 | a busca na URL sobrevive à recarga, e o histórico responde às setas | idem | e2e | — | B-23 | ⬜ |
| S-159 | viewport de celular, axe e ajuda nos dois idiomas nas duas views | fron | e2e | — | B-23 | ⬜ |
| S-160 | o Claude roteirizado escreve entre prévia e aplicar → o arquivo é preservado; o desfazer do turno o preserva depois | conc | e2e | — | B-24 | ⬜ |
| S-161 | duas abas de pasta (pasta e subpasta) com buscas diferentes não se misturam ao alternar | est | e2e | — | B-24 | ⬜ |
| S-162 | o `@` do composer do 08 recebe arquivos e pastas do mesmo localizador | eq | e2e | — | B-24 | ⬜ |

---

## O `@` do composer do 08 sobre o localizador — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-172 | `@comp` no composer do 08 oferece arquivos e pastas de qualquer lugar da pasta pelo localizador, os abertos e recentes do editor primeiro, e escolher um vira o chip de sempre | eq | integração | — | B-25 | ⬜ |
| S-173 | uma consulta do `@` superada por outra é cancelada, e a resposta dela nunca aparece no menu | conc | integração | — | B-25 | ⬜ |
| S-174 | localizador com `truncated`, sem resultado ou falhando → os mesmos textos do 08 e o "usar o caminho digitado"; caminho fora da pasta não é oferecido | err | integração | `NETWORK_UNREACHABLE` | B-25 | ⬜ |

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Regras estáticas e catálogo (B-01…B-05) | eq, fron, est, conc, idem | são verificações de código-fonte: o arquivo viola ou não viola; não há entrada, estado, tempo nem repetição a variar. O comportamento que elas protegem tem as seis dimensões no executor (S-06…S-17) |
| Binário do ripgrep (B-07) | conc, idem | a resolução acontece uma vez, no boot, antes de qualquer requisição; não há corrida nem repetição possível |
| Domínio da busca (B-08) | est, conc, idem | value objects e funções puras: sem estado que transite nem recurso compartilhado. A idempotência é trivial (mesma entrada, mesma saída) e é coberta pela ordem estável do S-39 |
| Controllers (B-12) | eq, fron, conc, idem | o controller só traduz: os casos de cada dimensão são os dos casos de uso que ele chama (B-09…B-11), exercitados pela mesma porta HTTP nos testes de integração, e o contrato inteiro é conferido no S-152 |
| Editor de resultados e histórico (B-17, B-18) | err, conc | o editor não tem chamada própria além das já cobertas (busca e escrita do 07, cujos erros são dele); o histórico é por aba e por visitante, sem escritor concorrente |
| Atalhos e ajuda (B-19, B-20) | conc, idem | texto e atalho não têm concorrência nem efeito repetível; o clique duplo que importa é o do substituir (S-127) |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
