# Plano 07 — Explorer and editor

**Objetivo:** navegar a árvore da pasta aberta, abrir arquivos em abas num editor de código, editar
e salvar sem perder trabalho quando o Claude escreve no mesmo arquivo, e ter as funções de arquivo
do VS Code — criar (inclusive de modelo), renomear, mover, copiar, duplicar, apagar com desfazer,
comparar, prévias, upload/download e histórico local.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full       # portões 1-11, sai com código 0
pnpm test:e2e:mobile   # o app continua verde com o contrato WS novo
```

**Depende de:** [plano 06 — Workbench](../06-workbench/README.md) (a aba de pasta, a URL
`/workbench?folder=`, o registro de comandos, o menu **Arquivo**, a status bar e as Configurações), e
por ele do [plano 04](../04-transcript-and-resume/README.md) (o store do desfazer, com o qual a escrita
humana convive). Não depende dos planos 05 e 19.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O usuário pediu "um client de Claude" no molde do VS Code, e corrigiu o alcance em seguida: não tudo
do VS Code, mas **abrir, criar arquivos, funções de arquivo e editar** — completas. Hoje a web não
mostra um arquivo sequer da pasta em que o Claude trabalha; o usuário vê o `Edit` passar num card e
não tem onde abrir o resultado.

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **O humano passa a escrever no disco, e isso é arquitetura** (ADR-015, aberta em B-01) | até aqui só o Claude escrevia, sob `canUseTool` e trilha; o ator novo precisa da mesma fronteira (allowlist **e** pasta aberta), da mesma trilha (antes do disco, sem conteúdo) e de uma relação dita com o desfazer do [ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso) |
| **Concorrência por conteúdo, não por relógio** — `ETag` sha256 e `If-Match` obrigatório ([D-03](decisions.md#d-03--a-semântica-de-concorrência)) | o Claude reescreve arquivos no mesmo segundo e com o mesmo tamanho; só o hash diz com certeza que o humano está salvando sobre a versão que viu |
| **O núcleo fecha na F6**, prévias (F7) e histórico (F8) depois | os planos 08 e 11 consomem o núcleo — a aba de diff, a escrita auditada, o arraste para o chat — e não precisam esperar hexadecimal nem Linha do tempo |

E uma que o plano recusa: embutir o editor do VS Code inteiro (openvscode-server/code-server). É a
mesma decisão da ADR-014 do plano 06 — o terminal e as extensões dele furariam a trilha e a
permissão —, e o editor aqui é construído no web sobre uma biblioteca
([D-09](decisions.md#d-09--monaco-ou-codemirror-6)).

---

## Escopo

### Entra

| | |
|---|---|
| ADR-015, módulo `files`, rotas e códigos novos, stream `workspace.filesChanged` nas três pontas, estado por aba de pasta | F0 |
| Contenção de caminho a cada operação (`..`, symlink, a corrida entre checar e abrir), árvore, leitura com teto, binário, encoding e `ETag` | F1 |
| Salvar atômico com `If-Match`, criar (com conteúdo de modelo), renomear, mover e copiar sem sobrescrever, apagar com contagem, trilha antes do disco, convivência com o desfazer da sessão | F2 |
| Watcher medido, com exclusões, coalescência, refcount e liberação garantida; origem `claude`/`user`/`external` | F3 |
| Explorer: árvore ARIA virtualizada, todas as funções de arquivo, seleção múltipla, lote, desfazer operação de arquivo, atualização viva, fatos na Auditoria, ajuda | F4 |
| Editor: abas, grupos lado a lado, salvar / salvar como / salvar todos / reverter / auto-save, conflito, mudança externa, localizar e substituir, ir para linha, encoding e fim de linha, modo arquivo grande, diff, preferências, arrastar para o Claude, ajuda | F5 |
| E2e do núcleo, com o Claude roteirizado no mesmo arquivo, e o app verde | F6 |
| Prévia de markdown, imagem, SVG e PDF; hexadecimal; leitura paginada; upload por arrastar do desktop; download de arquivo e de pasta | F7 |
| Histórico local: versão anterior a cada escrita humana, comparar, restaurar, desfazer o apagar, Linha do tempo | F8 |

### Não entra

- **Inteligência de linguagem e depuração** — completar, diagnóstico, formatador, símbolos,
  depurador. **Decisão do usuário de 2026-09-26**: o editor tem realce de sintaxe e nada que execute
  código do projeto.
- **Git** — decorações na árvore, diff contra o HEAD, commits na Linha do tempo. Decisão do usuário
  de 2026-09-26: o [plano 11](../11-search/README.md) ficou só com busca.
- **Quick Open, busca em arquivos e substituir em lote** — [plano 11](../11-search/README.md),
  que escreve pela escrita auditada deste plano (B-11).
- **O chat, o alvo do arraste e os chips de contexto** — [plano 08](../08-claude-panel/README.md); daqui
  sai só a fonte de arraste e o comando "Adicionar ao contexto" (B-42).
- **Terminal** — [plano 12](../12-integrated-terminal/README.md).
- **A tela de configuração do Claude** — [plano 13](../13-claude-settings/README.md); este plano dá o
  editor que ela usa para `CLAUDE.md` e o segundo passo dos arquivos que mudam a permissão
  ([D-15](decisions.md#d-15--arquivos-que-mudam-a-permissão)).
- **Explorer e editor no app Flutter** — o web é mobile-first e responde no celular; o app só recebe
  os tipos gerados.
- **Rascunho não salvo guardado no navegador** ("hot exit") — conteúdo de arquivo em claro na máquina
  de quem abriu ([D-14](decisions.md#d-14--rascunho-não-salvo-e-a-recarga)).
- **Lixeira do sistema** — fica fora da allowlist ([D-06](decisions.md#d-06--apagar-definitivo-ou-lixeira));
  o desfazer do apagar é o histórico local.
- **Multi-root numa árvore só, colaboração em tempo real, notebooks, extensões** — fora de todos os
  planos do workbench.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | ADR-015, módulo `files`, rotas, códigos, stream WS nas três pontas, estado por aba | B-01…B-06 | ✅ |
| F1 | [Leitura de arquivos](F1-file-read.md) | contenção de caminho, árvore e leitura com `ETag` | B-07…B-10 | ✅ |
| F2 | [Escrita de arquivos](F2-file-write.md) | salvar, criar, mover, copiar e apagar sem perder trabalho, na trilha | B-11…B-18 | ✅ |
| F3 | [Observação de mudanças](F3-file-watch.md) | o disco avisa o que mudou e quem mudou, sem vazar watcher | B-19…B-23 | ✅ |
| F4 | [Explorer](F4-explorer.md) | a árvore e todas as funções de arquivo, com lote e desfazer | B-24…B-30 | ✅ |
| F5 | [Editor](F5-editor.md) | abas, grupos, salvar e conflito, mudança externa, arrastar para o Claude | B-31…B-42 | ✅ |
| F6 | [E2E](F6-e2e.md) | o núcleo pela porta do usuário, com o Claude no mesmo arquivo | B-43…B-46 | ✅ |
| F7 | [Prévias e transferência](F7-previews-and-transfer.md) | prévias, hexadecimal, paginado, upload e download | B-47…B-54 | ✅ |
| F8 | [Histórico local](F8-local-history.md) | histórico local, restaurar, desfazer o apagar | B-55…B-61 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| A escrita humana é decisão registrada: fronteira allowlist + pasta aberta, trilha antes do disco, leitura fora da trilha | B-01 | [00-decisions](../../architecture/shared/00-decisions.md) (ADR-015, aberta em B-01) | S-09, S-61, S-116 |
| `files` é módulo próprio, fala com `workspace` por porta e com `session` só por evento | B-02, B-18 | [backend/03-modules](../../architecture/backend/03-modules.md#o-catálogo) | S-08, S-126 |
| Todo erro novo tem código, chave e status com significado | B-03 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-05…S-07 |
| A mudança no disco chega por um stream com `seq` próprio, sem replay, nas três pontas | B-04, B-05, B-23 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#envelope) | S-01…S-04, S-152…S-156 |
| Explorer e editor são estado da aba de pasta, e o link reproduz a tela | B-06, B-24, B-40 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#a-url-é-estado) | S-10…S-13, S-160, S-259…S-263 |
| Nenhuma operação sai da pasta aberta — `..`, symlink, a corrida entre checar e abrir | B-07, B-11, B-15, B-49 | [backend/03-modules](../../architecture/backend/03-modules.md#workspace) | S-14…S-27, S-78, S-113, S-114, S-306 |
| A árvore lista um nível, com teto, sem abrir o que não é arquivo | B-08 | [backend/03-modules](../../architecture/backend/03-modules.md#workspace) | S-28…S-39 |
| A leitura tem teto, detecta binário e encoding sem palpite, e dá um `ETag` do que voltou | B-09, B-10 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-40…S-61 |
| Nenhum save apaga o trabalho do Claude em silêncio, nem trunca arquivo, nem duplica no reenvio | B-11, B-34, B-35, B-40 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-62…S-79, S-225…S-242, S-259…S-263 |
| Criar, mover, copiar e apagar nunca sobrescrevem nem atravessam link | B-12…B-15 | [backend/03-modules](../../architecture/backend/03-modules.md#workspace) | S-80…S-115 |
| Toda escrita humana entra na trilha antes do disco, sem conteúdo, e é visível | B-16, B-17, B-29 | [backend/05-persistence](../../architecture/backend/05-persistence.md#os-fatos-de-conta) | S-116…S-123, S-196, S-197 |
| A escrita humana convive com o desfazer da sessão, que a preserva | B-18, B-44 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#desfazer-arquivos--o-store-é-nosso) | S-124…S-127, S-283…S-285 |
| O watcher não esgota o inotify da máquina, e toda assinatura é liberada | B-19, B-20, B-21 | [backend/06-realtime](../../architecture/backend/06-realtime.md#fan-out) | S-128…S-147 |
| A origem da mudança rotula, e não decide | B-22 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#envelope) | S-148…S-151 |
| O explorer é acessível, virtualizado e tem as funções de arquivo completas, em lote e com desfazer | B-24…B-27 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-157…S-187 |
| A árvore acompanha o disco, e a aba inativa não gasta watcher | B-28 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#websocket--o-stream-ao-vivo) | S-188…S-195 |
| O editor carrega sob demanda, sem CDN, e é testável sem o navegador real | B-31 | [web/06-testing](../../architecture/web/06-testing.md#o-que-testar-em-cada-elo-da-cadeia) | S-204…S-208 |
| Abas, grupos, localizar, status bar, arquivo grande, diff e preferências funcionam como no VS Code | B-32, B-33, B-36…B-39 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-209…S-224, S-243…S-258 |
| Arquivos e seleção vão para o chat do Claude por arraste tipado, com alternativa por teclado | B-42 | [web/02-folder-structure](../../architecture/web/02-folder-structure.md#quando-algo-vira-shared) | S-269…S-279 |
| Toda view tem ajuda traduzida, tooltips, atalhos na palette, vazio que ensina e axe sem violação | B-30, B-41, B-53, B-60 | [02-i18n](../../architecture/shared/02-i18n.md), [web/06-testing](../../architecture/web/06-testing.md#acessibilidade-em-teste) | S-198…S-203, S-264…S-268, S-323, S-324, S-351, S-352 |
| O núcleo é provado pela porta do usuário, e o app continua verde | B-43…B-46 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#cenários-e2e-obrigatórios) | S-280…S-291 |
| Prévias não executam conteúdo do usuário, e nenhuma transferência leva token na URL | B-47…B-52, B-54 | [08-authentication](../../architecture/shared/08-authentication.md) | S-292…S-322, S-325…S-327, S-356…S-360 |
| O histórico local guarda o que a escrita humana perderia, com teto, e restaura sem sobrescrever às cegas | B-55…B-59, B-61 | [backend/05-persistence](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai) | S-328…S-350, S-353…S-355 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
├── commands/    workspace-watch · workspace-unwatch
└── events/      workspace-watching · workspace-files-changed · workspace-watch-stopped

backend/src/
├── domain/files/                  FilePath · nomes · duplicar · sensíveis · exclusões · origem
├── application/files/             ler · salvar · criar · mover · copiar · apagar · watch · histórico
│   └── ports/                     FolderResolver · FileTreeReader · FolderWatcher · FileHistoryStore …
├── adapter/
│   ├── inbound/http/files/        tree · content · move · copy · raw · archive · upload · history
│   ├── inbound/http/audit/        + GET /audit-events
│   ├── inbound/ws/files/          workspace.watch / workspace.unwatch
│   ├── outbound/filesystem/       leitura, escrita atômica, watcher
│   └── outbound/file-history/     blobs endereçados por hash
├── infrastructure/modules/files.module.ts
└── infrastructure/database/migrations/   três versionadas novas: file.*, file.downloaded, histórico

web/src/
├── features/explorer/
├── features/editor/               porta CodeEditor + adaptador do editor escolhido
├── features/file-history/
└── shared/                        tipo do arraste + scopeDragPayload

mobile/lib/…                       só os tipos Dart gerados
e2e/specs/                         explorer-editor · previews-transfer · local-history
docs/architecture/                 ADR-015 · backend/03 · backend/05 · shared/04 · shared/05 · web/03 · web/04
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Perda de trabalho** entre o humano e o Claude no mesmo arquivo | **aberto** — `ETag` forte, `If-Match` obrigatório, save atômico e reenvio idempotente ([D-03](decisions.md#d-03--a-semântica-de-concorrência)); a trava por caminho serializa humano e desfazer no mesmo processo (B-18). Resta uma janela entre a última conferência do hash e o `rename` contra um escritor **externo** (o CLI escreve direto no disco): declarada, e coberta depois pelo watcher (aviso) e pelo desfazer (preserva) |
| R-02 | **Fuga de caminho** por `..`, symlink ou troca de diretório entre checar e abrir | **aberto** — `FilePath` puro, `realpath` a cada operação, verificação no descritor ([D-05](decisions.md#d-05--symlinks-e-hard-links)); o `rename` é por caminho e tem janela residual; `/proc/self/fd` é Linux-only, e o macOS é gap para o [plano 19](../19-distribution/README.md) |
| R-03 | O watcher **esgota o inotify** da máquina (e o VS Code do usuário para de ver mudanças) ou **vaza** | **aberto** — medido antes de escolher ([D-08](decisions.md#d-08--a-implementação-do-watcher)): `chokidar`, que não gasta watch nos não assistidos da [D-10](decisions.md#d-10--exclusões-padrão-e-teto-da-árvore) nem em `.git` e diz `ENOSPC` na subida e depois dela; refcount e liberação por toda saída, provados (S-142…S-147; mil ciclos em S-145); erro explícito no limite (S-135). Resta o custo de um watch por arquivo além de um por pasta — 2 805 neste repositório, contra os 709 de um watcher só de pastas |
| R-04 | O editor é pesado no celular, não roda em jsdom, ou exige CDN | **aberto** — [D-09](decisions.md#d-09--monaco-ou-codemirror-6) decide depois de medir; porta `CodeEditor` com falso para os 90 % por arquivo; modo simplificado abaixo de `md` |
| R-05 | Contrato WS alterado numa ponta só, ou `seq` de stream que não é sessão | **aberto** — nas três pontas na mesma mudança (B-04, B-05); a regra "por stream" é escrita uma vez e o plano 12 a reusa ([D-07](decisions.md#d-07--o-transporte-da-mudança-e-o-seq-do-stream)) |
| R-06 | **Conteúdo de arquivo vazando** para log, trilha, armazenamento do navegador ou URL | **aberto** — teste de marcador no log (S-61), trilha só com caminho e hash (S-116), nada de rascunho no navegador ([D-14](decisions.md#d-14--rascunho-não-salvo-e-a-recarga)), blob com Bearer ([D-16](decisions.md#d-16--download-sem-token-na-url-e-os-tetos)) |
| R-07 | Servir conteúdo do usuário vira **script na origem do produto** | **aberto** — `sandbox`, `nosniff`, `attachment` e prévia sem navegar para o conteúdo ([D-18](decisions.md#d-18--servir-conteúdo-do-usuário-para-prévia)) |
| R-08 | **Apagar sem volta** | **aberto** — contagem e segundo passo até a F8; depois, desfazer pelo histórico local para o que cabe no teto ([D-06](decisions.md#d-06--apagar-definitivo-ou-lixeira)) |
| R-09 | Um save rápido em `.claude/settings.json` **muda o que o Claude pode fazer** sem ninguém perceber | **aberto** — segundo passo e fato marcado `sensitive` ([D-15](decisions.md#d-15--arquivos-que-mudam-a-permissão)) |
| R-10 | **Escrita no disco alcançável pela rede** antes do endurecimento do [plano 05](../05-hardening-operations/README.md) | aceito — os limites do 05 valem para as rotas novas quando ele vier; até lá, a fronteira é a allowlist, a pasta aberta e a trilha. É a ordem que a D-02 do plano 06 escolheu |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: o critério dela. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md), e rode `pnpm plan progress 07`.
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
