# Plano 09 — Busca

**Objetivo:** achar qualquer coisa na pasta aberta como no VS Code — Quick Open, busca em arquivos
com regex e filtros, editor de resultados e histórico — e substituir em lote com prévia em diff, sem
nunca sobrescrever o que mudou depois da prévia.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

Nenhuma fase muda o contrato WebSocket: a D-02 decidiu por HTTP em fluxo (NDJSON), e o
`pnpm test:e2e:mobile` fica fora deste critério.

**Depende de:** [07 — Explorer e editor](../07-explorer-and-editor/README.md) (módulo `files`,
escrita humana auditada com ETag, editor e diff editor, códigos `FILE_*`) e
[06 — Workbench](../06-workbench/README.md) (abas de pasta, activity bar, command palette com o
registro de atalhos, configurações, screen frame com ajuda). **Consumidor:** o `@` do composer do
[08 — Painel do Claude](../08-claude-panel/README.md) usa o localizador deste plano. Não depende de
05 nem de 06.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Com o explorer e o editor do 07, dá para abrir o que se sabe onde está. O que falta é o gesto que mais
se repete num editor de verdade: **"onde está isso?"** — o arquivo cujo nome se lembra pela metade, a
string que aparece em vinte lugares, o nome que precisa mudar em todos eles.

Três escolhas fazem este plano pequeno em superfície e grande em cuidado:

| Escolha | Consequência aqui |
|---|---|
| **O ripgrep faz a busca**, como no VS Code | motor de regex linear (sem backtracking), respeita `.gitignore`, rápido em pasta grande — mas é o **primeiro programa, além do Claude, que o backend executa com entrada do usuário**. Por isso a F0 abre o ADR-016 e trava por máquina o único caminho até `child_process` |
| **O substituir escreve pela escrita humana do 07** | trilha antes do disco, escrita atômica, ETag e a relação com o desfazer (ADR-013) vêm prontas; este plano não cria um segundo jeito de escrever arquivo |
| **Um localizador, dois consumidores** | o Quick Open e o `@` do composer do 08 pedem a mesma coisa — caminhos da pasta, pontuados, rápidos — e recebem do mesmo endpoint, com orçamento de latência declarado |

E uma consequência de produto que precisa ser tratada como feature: entre a prévia e a aplicação do
substituir, **o Claude pode ter escrito** num dos arquivos. O arquivo é preservado e o relatório diz
isso — a mesma regra do [desfazer](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso),
aplicada a uma porta nova.

---

## Escopo

### Entra

| | |
|---|---|
| ADR-016 (ripgrep por subprocesso), módulo `search`, contrato HTTP, códigos novos, regras estáticas | F0 |
| Executor de subprocesso, binário verificado no boot, localizador, busca em texto, substituir | F1 |
| Quick Open, view Busca, substituir com prévia em diff, editor de resultados, histórico, atalhos, configurações "Busca", ajuda | F2 |
| E2E da API e da web, com nomes hostis, injeção, prazo, abort e o Claude roteirizado | F3 |

### Não entra

- **Controle de versão (git)** — **decisão do usuário em 2026-09-26**: este plano é só busca.
  Status, diff, stage, commit, branch, histórico, blame, stash, merge e remotos saíram inteiros, e o
  roteiro não tem plano de git.
- **Localizar/substituir dentro do arquivo aberto e "ir para linha" (Ctrl+G)** — são do editor, no
  [plano 07](../07-explorer-and-editor/README.md). O Quick Open só encaminha `:42` para o comando de lá.
- **Busca por símbolo no Quick Open** (`@`, `#`) — exige inteligência de linguagem, que o usuário
  tirou do roteiro em 2026-09-26.
- **Buscar dentro da conversa** — é do [plano 08](../08-claude-panel/README.md); busca no histórico de
  conversas segue fora pela razão do [plano 04](../04-transcript-and-resume/README.md) (falta índice).
- **Busca na saída do terminal** — é a busca no scrollback do [plano 10](../10-integrated-terminal/README.md).
- **Buscar fora da pasta aberta** — a fronteira é a allowlist e a pasta da aba; outra pasta é outra
  aba ([06](../06-workbench/README.md)).
- **A busca no app Flutter** — as telas novas são do web, que é mobile-first; o contrato WS não muda,
  então o app não é afetado.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | ADR-016, módulo `search`, contrato HTTP, códigos e regras estáticas | B-01…B-05 | 🔲 |
| F1 | [Busca no backend](F1-search.md) | executor, ripgrep, localizador, busca em texto e substituir | B-06…B-12 | 🔲 |
| F2 | [Busca na web](F2-search-ui.md) | Quick Open, view Busca, substituir com prévia, editor de resultados, histórico, ajuda | B-13…B-20 | 🔲 |
| F3 | [E2E](F3-e2e.md) | a busca pela porta do usuário, com entrada hostil e o Claude roteirizado | B-21…B-24 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O ripgrep roda só por argv fixo, sem shell, com env sem segredo, por um único adapter | B-01, B-05, B-06 | [09-code-quality](../../architecture/shared/09-code-quality.md#segurança-estática) e o ADR-016, aberto em B-01 | S-01…S-03, S-06…S-17 |
| O binário é conhecido e verificado no boot — nunca o do `PATH` nem o do SDK | B-07 | ADR-016 (B-01) | S-18…S-24 |
| `search` é módulo com fronteiras, sem ciclo com `files` e `workspace` | B-02 | [backend/03](../../architecture/backend/03-modules.md#criando-um-módulo-novo) | S-05 |
| Todo erro tem código, status e tradução | B-04 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-04, S-25…S-28, S-44, S-100 |
| Entrada hostil é dado: injeção de argumento, regex catastrófica, glob e caminho fora da pasta | B-08 | [09-code-quality](../../architecture/shared/09-code-quality.md#segurança-estática) | S-29…S-36, S-42, S-150 |
| O localizador serve o Quick Open e o `@` do 09: arquivos e pastas, `prefer`, teto, ignore, latência | B-03, B-09 | [backend/03](../../architecture/backend/03-modules.md) | S-45…S-63, S-103, S-153, S-162 |
| A allowlist e o realpath decidem antes de qualquer processo, e o cache nunca responde por uma pasta que saiu | B-09, B-11, B-12 | [backend/03](../../architecture/backend/03-modules.md#workspace) | S-52…S-55, S-58, S-91, S-92, S-154 |
| Busca em texto com tetos, prazo parcial, cancelamento e concorrência limitada | B-10 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-64…S-80 |
| Resultado em fluxo NDJSON: progressivo, sempre com linha final, erro tipado depois do primeiro byte, ordem montada no cliente (D-02) | B-03, B-10, B-11, B-13 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md), exceção registrada pela B-03 | S-163…S-171 |
| Substituir: um motor só, ETag por arquivo, divergente preservado, trilha antes do disco, desfazer respeitado | B-11 | [ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso), [backend/03](../../architecture/backend/03-modules.md#audit) | S-81…S-98, S-156, S-160 |
| Status HTTP com significado, e o abort da requisição chega ao processo | B-12 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-99…S-101, S-151, S-152 |
| Quick Open e view Busca por aba de pasta, com a busca na URL | B-13…B-15 | [web/04](../../architecture/web/04-state-and-data.md#a-url-é-estado) | S-102…S-123, S-155, S-158, S-161 |
| Substituir na web: alcance antes, prévia em diff, relatório com os preservados | B-16 | [web/03](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-124…S-131 |
| Editor de resultados e histórico de buscas | B-17, B-18 | [web/04](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) | S-132…S-138, S-157 |
| Atalhos, configurações, ajuda em toda tela, acessibilidade, i18n e celular | B-19, B-20 | [web/03](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional), [02-i18n](../../architecture/shared/02-i18n.md) | S-139…S-147, S-159 |
| Provado pela porta do usuário, inclusive com o Claude escrevendo no meio | B-21…B-24 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-148…S-162 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
backend/src/
├── domain/search/                     SearchQuery, pontuação fuzzy, preservar caixa, contenção
├── application/search/
│   ├── ports/                         process-runner.port, e as portas para workspace e files
│   └── …                              find-paths, search-text, preview-replace, apply-replace
├── adapter/
│   ├── inbound/http/search/           search.controller, dto/
│   └── outbound/
│       ├── process/                   node-child-process.runner — o ÚNICO import de child_process
│       └── search/                    ripgrep.adapter, ripgrep-json.mapper
└── infrastructure/modules/search.module.ts

web/src/features/search/               Quick Open, view Busca, substituir, editor de resultados, histórico
scripts/lib/                           a regra de shell proibido, no scan:security
e2e/{fixtures,scenarios,specs}/        search-*
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | Injeção de comando ou de argumento pela entrada do usuário — padrão, glob, nome de arquivo e texto de substituição que começam com `-` ou carregam `$(…)` | **aberto** — argv sem shell, `--regexp=`, `--glob=`, `--` antes de caminho, `--pre` proibido (ADR-016, B-01); o único import de `child_process` verificado por máquina (B-05); cenários com sentinela (S-06, S-31, S-33, S-150) |
| R-02 | Uma busca comer a máquina: regex catastrófica, pasta gigante, linha minificada, buscas em paralelo | **aberto** — motor linear do Rust e PCRE2 nunca ligado, limite de regex compilada, tetos, prazo com resultado parcial, teto de bytes, duas buscas por usuário ([D-06](decisions.md#d-06--tetos-e-prazos)) |
| R-03 | O substituir destruir trabalho que o Claude ou o humano fez depois da prévia | **aberto** — ETag por arquivo e divergente preservado ([D-05](decisions.md#d-05--o-aplicar-em-lote)), escrita humana do 07 com trilha antes do disco, desfazer do ADR-013 preservando (S-95, S-160) |
| R-04 | Binário ausente ou diferente por máquina — **medido:** esta máquina não tem `rg`, e o `rg` do shell é o `claude` com outro `argv0` | **aberto** — [D-01](decisions.md#d-01--de-onde-vem-o-ripgrep): binário fixado, verificado no boot, nunca o do SDK |
| R-05 | Abrir o `onlyBuiltDependencies` para o `@vscode/ripgrep` amplia a cadeia de suprimentos | **aberto** — versão fixada, verificação de integridade, justificativa no ADR-016; `RC_RIPGREP_PATH` como alternativa sem script de instalação (D-01) |
| R-06 | A busca enxergar fora da fronteira: symlink, glob com `..`, pasta que saiu da allowlist mas ficou no cache | **aberto** — realpath antes de tudo, sem seguir symlink, contenção de cada resultado, cache consultado depois da validação ([D-07](decisions.md#d-07--a-lista-de-caminhos-do-localizador)) |
| R-07 | O semgrep acusar o `execFile` com argumento variável, e a supressão virar hábito | **aberto** — um adapter só, supressão na linha com o id da regra e o ADR citado (B-05); supressão recusada em review vira ADR, como manda o [09](../../architecture/shared/09-code-quality.md#suprimir-uma-regra) |
| R-08 | O log vazar o que o usuário procurou — muitas vezes, justamente um segredo | **aberto** — log de I/O com binário, duração e contagens, nunca padrão, substituição ou conteúdo (S-12, S-104) |
| R-09 | O `@` do composer do 08 ficar lento numa pasta grande | **aberto** — lista em cache ([D-07](decisions.md#d-07--a-lista-de-caminhos-do-localizador)) e orçamento de p95 < 150 ms medido, não suposto (S-61) |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar, e feche as
   [decisões](decisions.md) que bloqueiam a fase.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md), e rode `pnpm plan progress 09`.
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
