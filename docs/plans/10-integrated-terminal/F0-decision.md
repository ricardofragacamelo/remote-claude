# F0 — Decisão e contrato

Plano: [10 — Terminal integrado](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada dentro do plano — mas **não começa** com a
[D-01](decisions.md#d-01--o-terminal-existe) aberta. Fora dele, do
[plano 06](../06-workbench/README.md) (a casca do workbench, o painel inferior e as abas de pasta).
**Entrega:** a decisão escrita (ADR-017) de que o terminal existe e do que ele **não** protege; o
interruptor em arquivo, desligado por padrão; a prova de reautenticação recente; o contrato do
terminal nas três pontas; os códigos de erro novos; e a garantia de que nenhum byte de terminal
chega ao log — antes que o primeiro byte exista.

---

## Por quê

A ordem é a do risco. O terminal é a primeira feature do produto que fica **fora** da premissa
"nenhuma tool sensível roda sem um humano dizer sim" — então a primeira entrega é a decisão, por
escrito, com o que ela custa. Depois vêm as cercas que precisam existir **antes** do PTY: quem pode
ligar, quem pode abrir, e o log que já redige o que ainda nem trafega. O contrato fecha a fase
porque ele é o que o web e o app compilam contra.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — A decisão: o terminal existe, e a ADR-017 🔲

A [D-01](decisions.md#d-01--o-terminal-existe) foi decidida pelo usuário em 2026-09-26 — **existe,
com as travas** —, e a **ADR-017** foi aberta no mesmo dia em
[00-decisions](../../architecture/shared/00-decisions.md#adr-017--existe-um-terminal-fora-do-modelo-de-permissão-com-travas).
Esta task confere, quando o plano começar, que a ADR diz, por extenso e sem eufemismo:

- o terminal está **fora** do `canUseTool`, da allowlist e da trilha por comando — o shell faz `cd`
  para qualquer lugar e lê qualquer arquivo que a conta do SO lê;
- **ligar o terminal para um `sub` é entregar a conta do SO que roda o backend** a essa pessoa,
  inclusive as raízes que a allowlist nunca liberou para ela;
- o que não piora: o token do web já equivale a execução de comando (abrir sessão, pedir `Bash`,
  aprovar o próprio pedido); o que se perde é o rastro por comando;
- as guardas e o que cada uma protege — interruptor em arquivo (B-02), step-up (B-03), só do web
  (B-02), ambiente sem segredo (B-07), trilha sem teclas (B-12), nenhum shell sem dono (B-11) — e o
  limite honesto de cada uma (a "só do web" não barra quem tem as credenciais do usuário,
  [D-09](decisions.md#d-09--o-que-prova-que-o-pedido-vem-do-web));
- o que o fechamento **não** mata: job desacoplado pelo usuário (`nohup`, `setsid`), como em
  qualquer terminal;
- que um processo não sobrevive ao restart do backend: o PTY morre com o processo que o segura.

Se a decisão for "não", esta task é a única do plano: a ADR registra o "não", o plano fecha com uma
linha no [progresso geral](../progress.md), a D-10 e a B-13 vão para o
[plano 05](../05-hardening-operations/README.md), e o 06 é avisado de que a seção "Terminal" das
Configurações não será preenchida.

Critério: `pnpm docs:check` verde com a ADR e os links do plano apontando para ela.

### B-02 — O interruptor em arquivo e a prova de origem 🔲

Fecha a [D-08](decisions.md#d-08--onde-mora-o-interruptor) e a
[D-09](decisions.md#d-09--o-que-prova-que-o-pedido-vem-do-web).

- **Interruptor:** seção `terminal: { users: [<sub>…] }` no arquivo da allowlist
  (`RC_WORKSPACE_ALLOWLIST_FILE`), validada pelo mesmo schema: ausente ou `users: []` é desligado;
  fora do schema derruba o boot; recarga **explícita**, no mesmo caminho da allowlist. Recarga que
  tira alguém **encerra** os terminais dele (a execução é da B-11). O script de raízes locais do
  [plano 06](../06-workbench/README.md) preserva a seção e nunca a cria.
- **Origem:** o principal do módulo `auth` passa a carregar `azp` (ou `client_id`, RFC 9068) e o
  `installId` da connection; a regra "só do web" é ausência de `installId` **e** `azp` igual a
  `OIDC_CLIENT_ID_WEB`. `client.kind` não entra na regra — é declaração do cliente.
- Documentos: [backend/03 · workspace](../../architecture/backend/03-modules.md#workspace) (a
  seção nova do arquivo) e a tabela de configuração que falha fechada em
  [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada).

Testes: unit do schema e da leitura; integração do boot recusado, da recarga e da regra de origem
com tokens do provedor fake dos dois clients.

### B-03 — Reautenticação recente (step-up) 🔲

Fecha a [D-02](decisions.md#d-02--como-provar-reautenticação-recente).

- O adapter de identidade (`adapter/outbound/identity/`) extrai `auth_time` do access token para o
  principal; a regra pura `isRecentlyAuthenticated(principal, now, window)` mora no domínio `auth`,
  com a tolerância de relógio de 60 s que a validação já usa
  ([08 · Validação no backend](../../architecture/shared/08-authentication.md#validação-no-backend)).
  Sem `auth_time` → falso. Falha fechada.
- `RC_TERMINAL_STEP_UP_WINDOW_MS`, com piso e teto no código; fora deles o boot não sobe.
- O provedor fake (`infra/keycloak`) passa a emitir `auth_time` no access token e a honrar
  `max_age` — configuração do realm, versionada; o do primeiro deploy fica anotado para o
  [plano 05](../05-hardening-operations/README.md) (provedor real como configuração).
- Documento: seção nova "Reautenticação recente" em
  [08-authentication](../../architecture/shared/08-authentication.md), com o porquê (token renovado
  por refresh não prova presença), o `STEP_UP_REQUIRED` e o `max_age` que o web manda.

### B-04 — O contrato do terminal nas três pontas 🔲

Fecha a [D-05](decisions.md#d-05--os-bytes-no-websocket) e a
[D-07](decisions.md#d-07--reconexão-scrollback-e-quem-vê). É mudança de contrato: backend, web e
mobile na mesma entrega ([05](../../architecture/shared/05-websocket-protocol.md)).

| Comando | Payload |
|---|---|
| `terminal.open` | `{ folder, cols, rows, profile? }` |
| `terminal.attach` | `{ terminalId }` |
| `terminal.input` | `{ terminalId, data }` — texto UTF-8 |
| `terminal.resize` | `{ terminalId, cols, rows }` |
| `terminal.close` | `{ terminalId }` |

| Evento | Payload |
|---|---|
| `terminal.opened` | `{ terminalId, folder, profile, shell, cols, rows, startedAt }` — com o `correlationId` do `terminal.open` |
| `terminal.output` | `{ terminalId, data }` |
| `terminal.attached` | `{ terminalId, cols, rows, snapshot, seq }` — o `seq` a partir do qual a saída viva continua |
| `terminal.detached` | `{ terminalId, reason: 'attachedElsewhere' }` |
| `terminal.titleChanged` | `{ terminalId, title, process }` |
| `terminal.exited` | `{ terminalId, code, signal?, reason }` — `processExited`·`closedByUser`·`idleTimeout`·`viewerGone`·`disabled`·`shutdown` |

- **`seq` por terminal.** O envelope exige `seq` em todo `event`, hoje "monotônico por sessão". O
  doc 05 passa a dizer "por stream — a sessão, ou o terminal (`payload.terminalId`)". Se o
  [plano 07](../07-explorer-and-editor/README.md) já tiver generalizado a regra para o stream de
  mudanças de arquivo, esta task só acrescenta o terminal à lista.
- **HTTP:** `GET /terminals?folder=` → `{ enabled, stepUp: { windowSeconds, satisfiedUntil }, limits,
  terminals: [...] }`; `GET /terminals/profiles` e `PUT /terminals/profiles` (a B-14 implementa).
  Documentados em [backend/03](../../architecture/backend/03-modules.md) no módulo novo `terminal`.
- Schema em `packages/contracts/schema`, `pnpm contracts:generate` para TS e Dart; o app só ganha
  os tipos e os ignora.
- Documentos: seção "Terminal" nova em
  [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) (comandos, eventos,
  fluxo, reconexão, quem vê) e em [backend/06-realtime](../../architecture/backend/06-realtime.md)
  (o stream do terminal, o controle de fluxo e o passo novo do shutdown).

### B-05 — Códigos de erro, chaves de tradução e a redação dos bytes 🔲

- Códigos novos no [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio)
  e no `error-catalogue.ts`: `TERMINAL_DISABLED` (403), `STEP_UP_REQUIRED` (401,
  `params.maxAgeSeconds`), `TERMINAL_NOT_FOUND` (404), `TERMINAL_LIMIT_REACHED` (429,
  `params.limit`) e `TERMINAL_LOCKED` (423). Variações de códigos existentes:
  `FORBIDDEN` (`terminal.error.webOnly`), `INVALID_INPUT` (`terminal.error.unknownProfile`,
  `terminal.error.profileInvalid`), `INTERNAL_ERROR` (`terminal.error.spawnFailed`). Toda chave em
  `en` e `pt-BR` ([i18n](../../architecture/shared/02-i18n.md)), com texto que diz **o que fazer**.
- **Redação:** `data` de `terminal.input`/`terminal.output` e `snapshot` de `terminal.attached`
  **nunca** vão ao log — o `ws.inbound`/`ws.outbound` registra `terminalId` e o tamanho em bytes.
  Vale também para o log do erro de validação do frame. Entra na lista de
  [redação](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log) e em
  `redact.ts`/`io-logging.interceptor.ts`, **nesta** fase: a partir da B-04, um frame
  `terminal.input` já passa pelo codec, e o codec loga.
- No web, o logger da feature `terminal` nunca recebe o conteúdo — e por isso o envio de log do
  cliente também não.

---

## Cenários cobertos

S-01, S-02, S-04, S-05, S-08, S-12, S-14…S-18, S-22, S-23, S-25…S-30, S-32…S-36.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
pnpm test:e2e:mobile     # o contrato mudou: o Dart regenerado precisa manter o app verde
```
