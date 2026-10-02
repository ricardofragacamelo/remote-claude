# F0 — Contrato

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** o [plano 06](../06-workbench/README.md) concluído — a aba de pasta, a URL
`/workbench?folder=`, o registro de comandos, o menu **Arquivo** e a área de editor que este plano
preenche.
**Entrega:** o contrato escrito antes do código — ADR-015, o módulo `files` no catálogo, as rotas com
os seus status, os códigos novos, o stream de mudança no WebSocket nas três pontas e o desenho do
estado por aba de pasta no web.

## Por quê

Três contratos nascem aqui e são consumidos por outros planos: a escrita humana auditada (o plano 09
substitui em lote por ela; o 11 edita `CLAUDE.md` por ela), o stream de mudança com `seq` próprio (o
plano 10 reusa a regra) e a aba de diff (o 08 abre as alterações do Claude nela). Escrevê-los depois
do código é descobrir, no plano seguinte, que cada um fala de um jeito.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — ADR-015: o humano escreve no disco pela web ✅

Nova ADR em [00-decisions](../../architecture/shared/00-decisions.md), no formato das existentes. Até
aqui, quem escrevia no disco do usuário era o Claude, sob `canUseTool` e com o hook `PreToolUse`
registrando ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)).
A ADR registra o ator novo:

- a **fronteira** é a allowlist **e** a pasta aberta ([D-11](decisions.md#d-11--a-raiz-do-explorer-é-a-pasta-aberta)),
  conferidas no servidor a cada operação, no `realpath`;
- **toda escrita vai para a trilha antes do disco**, sem conteúdo; leitura não vai
  ([D-02](decisions.md#d-02--a-escrita-humana-na-trilha));
- **relação com o desfazer** ([ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)):
  a escrita humana é, para o desfazer da sessão, "alteração manual" — ele a preserva, e isso é
  cenário (S-124), não acidente;
- concorrência por `ETag` forte e `If-Match` obrigatório ([D-03](decisions.md#d-03--a-semântica-de-concorrência));
- o editor é construído no web (a mesma escolha da ADR-014 do plano 06 de **não** embutir o VS Code),
  **sem** inteligência de linguagem — decisão do usuário de 2026-09-26.

A F8 acrescenta à ADR o histórico local (B-55).

### B-02 — O módulo `files` no catálogo, e as rotas do núcleo ✅

Em [backend/03-modules](../../architecture/backend/03-modules.md#o-catálogo): o módulo `files`
([D-01](decisions.md#d-01--módulo-novo-ou-extensão-do-workspace)) na tabela, no diagrama de fronteiras
(`files → workspace` por porta, `files → audit` escrevendo, **nenhuma** seta para `session`: a
origem `claude` chega pelo evento de domínio `session.fileStateRecorded`) e uma seção própria com as
rotas e os status — o mesmo formato das seções `transcript` e `permission`:

| Rota | O que é |
|---|---|
| `GET /files/tree?folder=&path=` | um nível: nome, `kind` (`file`/`directory`/`symlink`/`other`), tamanho, mtime, `hidden`, `outside`, `targetKind`; `truncated` |
| `GET /files/content?folder=&path=&encoding=` | texto, `ETag`, `encoding`, `bom`, `eol`, `largeFile`; `If-None-Match` → `304` |
| `PUT /files/content` | salvar com `If-Match` obrigatório; `encoding`, `bom`, `confirmSensitive` |
| `POST /files` | criar arquivo (com conteúdo inicial opcional) ou pasta; `201` com `Location` e `ETag` |
| `POST /files/move` | renomear/mover, sem sobrescrever; `If-Match` opcional |
| `POST /files/copy` | copiar/duplicar, sem sobrescrever |
| `DELETE /files?folder=&path=&recursive=&expectedEntries=` | apagar; pasta não vazia pede a contagem |

Registrar também, na seção `workspace`, que uma subpasta aberta é uma fronteira mais estreita que a
raiz. As rotas de prévia/transferência e de histórico entram nas fases delas (B-47, B-55).

### B-03 — Os códigos novos no catálogo ✅

No [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) e no
`error-catalogue.ts`, **antes** de existirem no código, com `messageKey` en/pt-BR:

| `code` | HTTP | Quando |
|---|---|---|
| `FILE_NOT_FOUND` | 404 | caminho que não existe dentro da pasta |
| `FILE_EXISTS` | 409 | criar, mover ou copiar para cima de algo |
| `DIRECTORY_NOT_EMPTY` | 409 | apagar pasta com conteúdo sem a contagem (`params.entryCount`, `entryCountCapped`) |
| `FILE_CHANGED` | 412 | `If-Match` que não casa — inclusive arquivo apagado; `params.currentEtag` |
| `PRECONDITION_REQUIRED` | 428 | `PUT` sem `If-Match` (ou com `*`); arquivo sensível sem confirmação (`params.reason`) |
| `FILE_TOO_LARGE` | 413 | acima do teto (`params.size`, `params.limit`, `params.measure`) |
| `FILE_NOT_TEXT` | 415 | binário ou encoding que não se decodifica (`params.reason`: `binary`·`encoding`) |
| `FILE_NOT_A_FILE` | 422 | conteúdo pedido de diretório, FIFO, socket ou device |
| `FILE_OPERATION_INVALID` | 422 | mover para dentro de si, operar na própria pasta aberta, `EXDEV`, laço de symlink (`params.reason`) |
| `FILE_NOT_ENCODABLE` | 422 | o conteúdo não cabe no encoding de destino |
| `STORAGE_FULL` | 507 | disco cheio (`ENOSPC`, `EDQUOT`) |
| `WATCH_LIMIT_REACHED` | 429 | teto de assinaturas por connection (`params.limit`) |
| `WATCH_UNAVAILABLE` | 503 | o sistema recusou mais watches (`params.retryAfterSeconds`) |

E na [tabela de status](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http): linhas
para `412`, `415`, `428` e `507`, com o que cada um significa neste produto — e a nota da
[D-02](decisions.md#d-02--a-escrita-humana-na-trilha) sobre por que trilha indisponível aqui é `503`
e no desfazer é `500`. Reusados sem mudança: `WORKSPACE_NOT_ALLOWED`, `FORBIDDEN`,
`WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`, `INVALID_INPUT`, `SERVICE_UNAVAILABLE`.

### B-04 — O stream de mudança no WebSocket ✅

Em [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#envelope), pela
[D-07](decisions.md#d-07--o-transporte-da-mudança-e-o-seq-do-stream):

- comandos `workspace.watch { workspacePath }` e `workspace.unwatch { watchId }`; ack
  `workspace.watching { watchId, workspacePath }`;
- eventos `workspace.filesChanged { watchId, changes: [{ path, kind: created|changed|deleted,
  origin?: claude|user|external }], overflow? }` e `workspace.watchStopped { watchId, reason:
  allowlistChanged|folderDeleted|systemLimit }`;
- a regra do envelope passa de "`seq` monotônico por sessão" a "**por stream** — uma sessão, ou uma
  assinatura", e **sem replay** para assinatura: reconexão refaz o `watch` e recarrega a árvore;
- os limites do [plano 05](../05-hardening-operations/README.md) valem para os comandos novos.

Schema em `packages/contracts/schema`, geração TS e Dart (`pnpm contracts:generate`) na mesma
mudança — contrato quebrado numa ponta só é bug.

### B-05 — O app continua verde com o contrato novo ✅

O app Flutter não ganha explorer nem editor (fora do escopo), mas recebe os tipos Dart gerados e
precisa **ignorar** os eventos `workspace.*` que nunca pede — a regra "cliente ignora o
desconhecido" do contrato, provada. `pnpm test:e2e:mobile` verde é critério desta fase e do plano
(lembrar de parar os daemons do Gradle antes do `verify:full`).

### B-06 — O estado do explorer e do editor por aba de pasta ✅

Em [web/04-state-and-data](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) e
[web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto):

- **tudo é da aba de pasta** do plano 06: árvore expandida, seleção, pilha de desfazer de operações de
  arquivo, abas e grupos de editor, buffers sujos, arquivos recentes — um store por aba, nunca um
  global compartilhado;
- **a URL** leva o arquivo ativo da aba ativa (`/workbench?folder=…&file=…`); o resto (abas abertas,
  grupos) é restaurado pelo mecanismo de estado por aba do plano 06 — só caminhos, nunca conteúdo
  ([D-14](decisions.md#d-14--rascunho-não-salvo-e-a-recarga));
- **os pontos de extensão** que outros planos usam: a aba de diff (planos 08 e 09), o comando
  "Adicionar ao contexto do Claude" e o tipo do arraste ([D-20](decisions.md#d-20--o-que-se-arrasta-para-o-claude),
  consumidos pelo 08), e as ações de arquivo no menu **Arquivo** e na command palette do 06;
- os padrões de UI novos em `web/03`: árvore (ARIA tree), abas de editor, diálogo de conflito,
  placeholders de arquivo não editável.

---

## Cenários cobertos

S-01, S-02, S-04…S-09. S-03 passou para a [B-21](F3-file-watch.md) (é o handler de
`workspace.watch` que valida o payload) e S-10…S-13 para a [B-24](F4-explorer.md), a
[B-26](F4-explorer.md) e a [B-40](F5-editor.md), que constroem a tela que eles exercitam — ver o
[progresso](progress.md#decisões-tomadas-durante-a-execução).

---

## Critério de conclusão

```bash
pnpm verify
pnpm contracts:check
pnpm docs:check
pnpm test:e2e:mobile
```
