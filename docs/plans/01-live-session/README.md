# Plano 01 — Sessão viva

**Objetivo:** o Claude roda de verdade na máquina local, com o stream chegando ao web, **toda**
invocação de tool auditada e **nenhuma** tool sensível executada sem um humano aprovar.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
pnpm test:e2e:live   # a suíte e2e/smoke-live contra o Claude real, sai com código 0
```

O segundo comando nasce neste plano (B-41). Ele não é portão de PR — roda sob demanda e no
nightly, como manda a [estratégia de testes](../../architecture/shared/06-testing-strategy.md).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O [bootstrap](../00-bootstrap/README.md) deixou o trilho pronto e deliberadamente não falou com
o Claude. Este plano é a primeira coisa que fala — e ele é grande de propósito, porque três
peças que a tentação manda separar **não podem nascer separadas**:

| Peça | Por que não pode esperar |
|---|---|
| `session` | é o que abre a `query()` |
| `permission` | `query()` sem `canUseTool` é reprovado pelo [semgrep](../../architecture/shared/09-code-quality.md#segurança-estática) — e sem ele o produto é um shell remoto sem dono |
| `audit` | o `canUseTool` cobre só o que exige humano; **toda** leitura de arquivo ficaria fora da trilha ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)) |

Entregar sessão sem as outras duas produziria algo que não pode ser ligado com segurança na
máquina de ninguém. O recorte, aqui, é a **fase** — não o plano.

### A fatia que este plano prova

```
[web]  escolhe workspace  →  session.start  →  prompt
                                                   ↓
[backend]  workspace valida caminho → SessionRunner abre query() → for await
                                                   ↓
           hook PreToolUse grava TODA tool  ·  canUseTool bloqueia o loop
                                                   ↓
[web]  permission.requested → humano aprova → permission.resolved → a tool executa
                                                   ↓
[web]  message.delta · tool.progress · turn.completed, com seq e replay
```

---

## Escopo

### Entra

| | |
|---|---|
| Contrato WS completo de sessão e permissão, nas três pontas | F0 |
| Módulo `workspace`: allowlist, normalização, HTTP e seletor no web | F1 |
| `adapter/outbound/claude/` inteiro, com fake roteirizado do SDK | F2 |
| Fan-out, ring buffer, `attach`/`detach`/replay/`gap` | F2 |
| Módulo `audit` append-only, ancorado no hook `PreToolUse` | F3 |
| Módulo `permission` e a ponte `canUseTool`, com escopo `once` e `session` | F4 |
| Tela de sessão no web: stream, tools, fila de permissão, controles | F5 |
| E2E com SDK fake, e a primeira spec de `e2e/smoke-live/` | F6 |

### Não entra

Deliberadamente fora — cada um tem plano próprio:

- **Mobile além de compilar.** Registro de device, push e a tela de permissão no celular são o
  [plano 02](../02-mobile-approval/README.md). O app continua verde contra o contrato novo (B-43),
  e só.
- **Regra de permissão persistida com escopo `project` e `always`.** Aqui só existe o que morre
  com a sessão — [plano 03](../03-rules-and-audit/README.md).
- **Consulta da trilha de auditoria e retenção.** A trilha é **escrita** aqui; lê-la é o
  [plano 03](../03-rules-and-audit/README.md).
- **Transcript histórico, `resume` e slash commands** — [plano 04](../04-transcript-and-resume/README.md).
- **Limite derivado de RAM, TTL de ociosa, rate limit e sessão órfã.** O limite existe como
  número configurado (B-17); derivá-lo da máquina é o [plano 05](../05-hardening-operations/README.md).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | o spike bloqueante, e comandos, eventos e o round-trip de permissão em schema, TS e Dart | B-01…B-06, B-45 | ✅ |
| F1 | [Workspace](F1-workspace.md) | allowlist, HTTP e seletor no web | B-07…B-11 | ✅ |
| F2 | [Runtime da sessão](F2-session-runtime.md) | adapter do Agent SDK, sessão, fan-out e replay | B-12…B-20, B-44 | ✅ |
| F3 | [Auditoria](F3-audit.md) | trilha append-only de toda invocação de tool, e o checkpoint de arquivo que o desfazer consome | B-21…B-24, B-46, B-47 | ✅ |
| F4 | [Permissão](F4-permission.md) | `canUseTool`, timeout que nega, idempotência | B-25…B-31 | ✅ |
| F5 | [Web da sessão](F5-web-session.md) | stream, tools, fila de permissão, controles | B-32…B-38 | ✅ |
| F6 | [E2E e smoke-live](F6-e2e.md) | cenários obrigatórios e a primeira spec contra o Claude real | B-39…B-43 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Contrato WS de sessão e permissão, versionado e nas três pontas | B-01…B-06 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-01…S-08, S-85…S-87 |
| O furo do diretório confiado é medido **antes** de qualquer código | B-45 | [04-claude-integration](../../architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources) | S-98 |
| Allowlist de workspace é a primeira linha de defesa | B-07…B-11 | [backend/03-modules](../../architecture/backend/03-modules.md) | S-09…S-20 |
| Uma `query()` por sessão, streaming input, sem vazar subprocesso | B-12…B-17 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md) | S-21…S-31, S-39, S-88 |
| O fake é confrontado com o SDK real: roteiro gravado, não escrito | B-44 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-89, S-90 |
| `SDKMessage` nunca vaza cru; variante nova não derruba a sessão | B-15 | [ADR-006](../../architecture/shared/00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru) | S-24…S-27 |
| Fan-out com `seq` único, ring buffer e replay sem buraco | B-18, B-19 | [backend/06-realtime](../../architecture/backend/06-realtime.md) | S-32…S-38 |
| Toda invocação de tool auditada, append-only | B-21…B-24 | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | S-40…S-49 |
| O checkpoint de arquivo — o antes e o depois de cada escrita — para o desfazer do plano 04 não destruir trabalho manual | B-46, B-47 | [backend/05-persistence](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai) | S-99…S-108 |
| `canUseTool` bloqueia, tem timeout que nega e é idempotente | B-25…B-31 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md) | S-50…S-65 |
| O prazo é extensível sem deixar de ser a única proteção | B-27, B-29 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#estender-o-prazo-é-mexer-na-única-proteção-que-existe) | S-91…S-94 |
| `riskHint` é derivado no backend e **falha fechado** | B-30 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-62, S-95 |
| Reconexão republica pendentes do nosso registro, sem `reinitialize()` | B-28 | [ADR-012](../../architecture/shared/00-decisions.md#adr-012--reconexão-não-usa-reinitialize-o-registro-de-pendentes-é-nosso) | S-58, S-59 |
| As três regras do stream no cliente | B-32, B-33 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md) | S-66…S-69, S-73 |
| Fila de permissão na UI, sem duplo clique e sem card zumbi | B-36 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md) | S-70…S-72 |
| Nenhum texto hardcoded, cadeia do front respeitada | B-34…B-38 | [02-i18n](../../architecture/shared/02-i18n.md), [web/01](../../architecture/web/01-architecture.md) | S-74, S-75 |
| Sessão encerrada abre com o que existe, rotulado como parcial | B-34 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#reconexão-e-replay) | S-96, S-97 |
| Os cenários e2e obrigatórios que este plano alcança | B-39, B-40 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#cenários-e2e-obrigatórios) | S-76…S-82 |
| Quebra de contrato do SDK é detectada, não descoberta em produção | B-41 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-83 |
| O contrato novo não quebra o app já entregue | B-43 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-84 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
├── commands/    session-start · session-attach · session-detach · session-prompt
│                session-interrupt · session-set-model · session-set-permission-mode
│                session-close · session-set-locale
├── events/      session-started · session-status-changed · message-delta · message-completed
│                tool-started · tool-progress · tool-completed · turn-completed · session-closed
│                permission-requested · permission-resolved
└── responses/   permission-resolve

backend/src/
├── domain/{workspace,session,permission,audit}/
├── application/{workspace,session,permission,audit}/
├── adapter/
│   ├── inbound/{http/workspace, ws/{session,permission}}/
│   └── outbound/
│       ├── claude/        agent-sdk.adapter · session-runner · input-queue
│       │                  sdk-message.mapper · permission-bridge · sdk-options.factory
│       │                  audit-hook
│       └── persistence/{workspace,permission,audit}/
└── infrastructure/database/{schema,migrations}/

backend/test/{unit,integration}/…          espelhando o fonte
backend/test/fakes/agent-sdk/              o SDK roteirizado (B-12)

web/src/features/{workspace,session,permission}/{components,hooks,services,store}/

e2e/scenarios/                             cenários compartilhados web ↔ mobile
e2e/specs/                                 os cenários obrigatórios com SDK fake
e2e/smoke-live/                            a primeira spec contra o Claude real
scripts/run-smoke-live.mjs                 `pnpm test:e2e:live`
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | Diretório já confiado (`hasTrustDialogAccepted`) faz o `allow` de projeto furar o `canUseTool` | **confirmado pela medição** (B-45, 2026-09-18): em diretório confiado o `canUseTool` não é chamado. Deixa de ser risco e vira requisito — a mitigação entra na F2 e a B-42 a prova em e2e ([medição](../../architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido)) |
| R-02 | O fake do Agent SDK pode divergir do SDK real e dar confiança falsa | mitigar com B-41: o `smoke-live` é quem confronta o fake com a realidade |
| R-03 | Mapear ~38 variantes de `SDKMessage` com 90 % de `branches` é caro | a regra de sobrevivência (variante desconhecida → `warn`) reduz o leque; o resto é tabela, testada por tabela |
| R-04 | `~222 MB` por sessão foi medido em uma máquina só | neste plano o limite é **configurado**; derivá-lo da RAM é o [plano 05](../05-hardening-operations/README.md) |
| R-05 | Auditoria que bloqueia a autorização transforma falha de banco em sessão parada | é a decisão certa e está no [catálogo](../../architecture/backend/03-modules.md#audit); o que se exige é que a falha seja **visível** — `error` no log e evento de erro na UI |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — a [matriz de cenários](scenarios.md) já existe. Revise-a antes de começar e
   acrescente o que faltar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. A F6 fecha com `pnpm verify:full` **e** `pnpm test:e2e:live` verdes.
