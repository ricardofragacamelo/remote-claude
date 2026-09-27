# F0 — Contrato

Plano: [16 — Logs e diagnóstico](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada dentro do plano. Fora dele, da navegação e da moldura de tela do
[plano 06](../06-workbench/README.md) — só para a B-07.
**Entrega:** o módulo `diagnostics` e o papel de operador nos documentos normativos, os contratos HTTP de logs e de saúde, os códigos e motivos novos no catálogo,
os kinds novos da trilha e as rotas web — tudo **antes** de existir código.

---

## Por quê

Este plano abre uma porta nova: log que só vivia no stdout da máquina passa a sair pela rede até um
navegador. Quem lê o quê, com que redação, e o que nunca sai precisam estar escritos no normativo
antes da primeira linha — senão a primeira implementação decide por omissão, e decide a favor de
mostrar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — O módulo `diagnostics` no catálogo 🔲

Em [backend/03-modules](../../architecture/backend/03-modules.md#o-catálogo):

- módulo novo **`diagnostics`** — guardar em memória e consultar as linhas do log do backend,
  rastreio por `traceId`, nível em execução, relatório de saúde. **Não é responsável por:** log do
  web e do app, que fica no cliente
  ([03-logging](../../architecture/shared/03-logging.md#por-quê-o-mesmo-schema-nas-três-pontas),
  [D-01](decisions.md#d-01--a-fronteira-com-o-plano-05--f1)), nem pela prova de vida pública
  (`health`);
- os módulos **`diag`** (o `diag.ping`, a fatia vertical do bootstrap) e **`health`** (`GET
  /health`, sem autenticação, para o script de partida) **existem no código e não estão no
  catálogo** — entram agora, com o que cada um é e não é;
- diagrama de fronteiras: `diagnostics` consulta `auth` (operador) e lê estado de `session`,
  `workspace`, `notification` e `audit` **por portas próprias**, como qualquer consumidor; ninguém
  depende dele.

### B-02 — O papel de operador 🔲

Registrar a [D-02](decisions.md#d-02--quem-vê-log-de-backend-o-papel-de-operador) em
[08-authentication](../../architecture/shared/08-authentication.md#identidade-e-o-modelo-local) e em
[backend/03 — `auth`](../../architecture/backend/03-modules.md#auth):

- o que é operador (quem opera a instalação: vê log de backend e os detalhes de máquina da saúde,
  muda o nível do backend, dispara a sonda do Claude);
- de onde vem (configuração local, lida no boot, vazia por padrão — nunca claim do provedor);
- como o cliente sabe (`GET /diagnostics/capabilities`, B-04);
- o que recebe quem não é (`403` `FORBIDDEN` com `messageKey` própria de `diagnostics`).

Variável nova em `.env.example` com comentário, e o stack de desenvolvimento declarando o usuário
de teste — é o que deixa o e2e exercitar os dois lados.

### B-03 — `03-logging` e `web/05-logging`: o produto lê o próprio log 🔲

Em [03-logging](../../architecture/shared/03-logging.md), seção nova **"Leitura pelo produto"**:

- o buffer ([D-03](decisions.md#d-03--onde-os-logs-ficam-para-serem-lidos),
  [D-10](decisions.md#d-10--volume-e-retenção-do-buffer)): recebe exatamente a linha do stdout,
  some no reinício, tem teto e reserva `warn+`; o stdout continua sendo o registro durável;
- **redação na leitura**: toda linha servida passa, além da redação por nome que o `pino` já faz,
  por uma redação por **forma de texto** (JWT, `Bearer …`, `token=…`) que este plano escreve — não
  existe hoje, e antes a linha nunca saía da máquina. O que a redação removeu não volta por nenhum
  caminho;
- **as rotas que leem o log não logam o que leram** — só metadados. É a regra que impede o laço
  (R-02) e é exceção declarada à [regra do I/O em `debug`](../../architecture/shared/03-logging.md#a-regra-do-io-em-debug);
- nível do backend em execução, com prazo ([D-06](decisions.md#d-06--mudar-o-nível-do-backend-em-execução)).

Em [web/05-logging](../../architecture/web/05-logging.md#configuração): "debug neste navegador"
com prazo ([D-12](decisions.md#d-12--debug-neste-navegador-prazo-e-alcance)).

### B-04 — Contrato HTTP dos logs 🔲

Em `backend/03 — diagnostics`, espelhado nos DTOs Zod e nos tipos do service do web:

- `GET /diagnostics/capabilities` → `{ operator, operatorsConfigured, logLevel: { current,
  configured, until?, changedBy? }, buffer: { enabled, bytes, oldestAt, startedAt, evicted } }` —
  a única rota de logs aberta a quem não é operador: é por ela que a tela sabe o que explicar;
- `GET /diagnostics/logs?level=&levels=&module=&op=&traceId=&sessionId=&userId=&q=&from=&to=&before=&after=&limit=&wait=`
  → `{ entries[{ cursor, time, level, service, module, op, msg, traceId, sessionId, userId?,
  durationMs, fields, redacted, truncated, unparsed }], nextCursor, prevCursor, gap?, reset? }`. `q` são termos literais com `!` para excluir
  ([D-05](decisions.md#d-05--busca-termos-literais-ou-regex)); `wait` (teto 25 s) só com `after`
  — é o long-poll do seguir ao vivo ([D-04](decisions.md#d-04--seguir-ao-vivo-long-poll-http-stream-no-websocket-ou-sse));
- `GET /diagnostics/logs/facets?<mesmos filtros>` → módulos, `op` e níveis com contagem;
- `GET /diagnostics/logs/traces/:traceId` → a cadeia ordenada, com os pares entrada/saída casados e
  as pendências marcadas; trace inexistente é cadeia vazia, não `404`;
- `GET /diagnostics/logs/export?<filtros>` → `application/x-ndjson` com `Content-Disposition`
  ([D-07](decisions.md#d-07--exportação));
- `GET | PUT | DELETE /diagnostics/log-level` — `PUT { level, durationMinutes }`, `DELETE` volta já.

Recusas: `400` `INVALID_INPUT` (filtro, cursor, período invertido, `limit`, termo longo, duração),
`401` `UNAUTHENTICATED`, `403` `FORBIDDEN` (qualquer rota de leitura de logs, ou o nível, sem ser
operador), `429` `RATE_LIMITED` (`scope: 'logTail'` para long-polls simultâneos acima do teto).
Endpoints novos entram sob os limites do [plano 05](../05-hardening-operations/README.md).

**Se a D-04 escolher o WebSocket**, esta task ganha o contrato `diag.logs.*` nas três pontas
(schema, tipos TS e Dart) e o critério do plano ganha `pnpm test:e2e:mobile`.

### B-05 — Contrato HTTP da saúde e o registro de checks 🔲

Em `backend/03 — diagnostics`:

- `GET /diagnostics/health` → `{ status, checkedAt, cached, items[{ id, category, status: ok | warn
  | fail | timeout | skipped | unknown, reason?, messageKey, params, fixKey?, durationMs,
  details? }] }`. **`200` quando a leitura deu certo, mesmo com itens em `fail`** — o relatório é o
  recurso; a falha é o conteúdo. Dizer isso no doc é o que impede alguém de "corrigir" para `503` e
  quebrar a [regra 7 do AGENTS.md](../../../AGENTS.md#regras-que-valem-sempre-não-precisam-de-leitura-adicional)
  pelo outro lado;
- `POST /diagnostics/health/run { checks?: string[] }` → o relatório recém-executado; `429` com
  ritmo ([D-16](decisions.md#d-16--cache-e-frequência));
- `POST /diagnostics/health/claude-probe` → só operador, `409` `CONFLICT` com outra em curso
  ([D-14](decisions.md#d-14--a-sonda-do-claude-o-que-ela-faz-e-quem-a-dispara));
- `details` filtrado por papel no backend ([D-09](decisions.md#d-09--quem-vê-o-quê-na-saúde));
- o **catálogo de checks** (id, categoria, o que mede, cada `reason`, prazo) e as portas
  `HealthCheck` e `ResourceGauge` que os planos 07, 10 e 11 preenchem
  ([D-15](decisions.md#d-15--a-fronteira-com-os-planos-07-10-e-11));
- `GET /health` público **não muda** — continua `{ status, database }`, e o doc diz por que o
  detalhado não mora nele.

### B-06 — Catálogo de erros, motivos de check e trilha 🔲

No [catálogo de erros](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio)
e em `backend/src/shared/errors/error-catalogue.ts`, com `messageKey` em `en` e `pt-BR`:

- `FORBIDDEN`, `RATE_LIMITED`, `INVALID_INPUT` e `CONFLICT` ganham o módulo `diagnostics` e as
  `messageKey` próprias (`diagnostics.error.operatorRequired`, `…invalidCursor`, …) e os `scope`
  novos (`logTail`, `health`, `claudeProbe`);
- seção nova **"Motivos de check"** — não são status HTTP, são o `reason` de um item do relatório,
  cada um com `messageKey` e `fixKey`: `HEALTH_CHECK_TIMEOUT`, `HEALTH_CHECK_CRASHED`,
  `HEALTH_DATABASE_UNREACHABLE`, `HEALTH_MIGRATIONS_PENDING`, `HEALTH_MIGRATIONS_AHEAD`,
  `HEALTH_ALLOWLIST_INVALID`, `HEALTH_ALLOWLIST_ROOT_MISSING`, `HEALTH_SESSIONS_AT_LIMIT`,
  `HEALTH_PUSH_UNCONFIGURED`, `HEALTH_IDENTITY_UNREACHABLE`, `HEALTH_LOG_BUFFER_EVICTING`,
  `HEALTH_DISK_LOW`, `HEALTH_CLAUDE_CLI_MISSING`, `HEALTH_CLAUDE_NOT_LOGGED_IN`. Todos novos.

Na trilha ([backend/03 — `audit`](../../architecture/backend/03-modules.md#audit)): kinds
`diagnostics.logLevelChanged`, `diagnostics.logsExported`, `diagnostics.claudeProbed`, por
**migration versionada nova** que recria o CHECK `audit_events_kind_known`; `details` sem linha de
log nem texto do Claude.

### B-07 — Rotas web e as duas sub-telas 🔲

Registrar a [D-08](decisions.md#d-08--logs-e-saúde-uma-entrada-ou-duas) no mapa de rotas de
[web/04-state-and-data](../../architecture/web/04-state-and-data.md) e em
[web/03-ui-system](../../architecture/web/03-ui-system.md): a entrada "Logs e diagnóstico" que o
plano 06 criou em `/diagnostics` ganha `/diagnostics/logs` e `/diagnostics/health`, cada uma com a
moldura de tela do 06 (título, propósito, ajuda), e `/diagnostics` abre a saúde. Os filtros da tela
de logs são a **search** da URL, validados pelo router (valor inválido é descartado com aviso, não
quebra a tela). Namespaces de i18n `diagnostics.logs.*`, `diagnostics.health.*` e
`diagnostics.help.*`.

---

## Cenários cobertos

S-01…S-05. Os contratos escritos aqui são provados nas fases que os implementam.

---

## Critério de conclusão

```bash
pnpm verify
pnpm docs:check
```
