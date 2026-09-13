# Plano 00 — Bootstrap

**Objetivo:** deixar o repositório em pé com todos os portões de qualidade funcionando,
provado por um **walking skeleton** — uma fatia fina que atravessa todas as camadas de ponta
a ponta.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # sai com código 0
```

Isso só acontece quando lint, tipagem, arquitetura, duplicação, unit, cobertura ≥ 90 %,
integração, e2e, segurança e contratos estiverem todos verdes. Ver
[Definition of Done](../../architecture/shared/10-definition-of-done.md).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [progresso](progress.md).

---

## Por que um walking skeleton

A arquitetura exige que **tudo** que for construído venha com unit, integração e e2e, e com
90 % de cobertura em todas as dimensões. Isso é impossível de cumprir se o arnês de testes
não existir — e um arnês construído no vazio, sem nada real atravessando-o, não prova nada.

O bootstrap resolve os dois de uma vez: constrói o esqueleto **e** uma fatia vertical mínima
que o percorre inteiro. A partir daí, toda feature nova entra num trilho que já funciona.

### O que o e2e do bootstrap prova

```
[web]  login OIDC (Keycloak local)  →  abre WebSocket  →  envia comando
                                                              ↓
[backend]  valida JWT → gateway → use case → domínio → repositório → Postgres
                                                              ↓
[web]  recebe evento com seq, renderiza traduzido
```

Uma fatia que exercita **autenticação, contrato WS, as quatro camadas, o banco e a cadeia do
front** — sem tocar no Agent SDK. A integração com o Claude é o plano seguinte, não este.

---

## Escopo

### Entra

| | |
|---|---|
| Monorepo pnpm, tooling compartilhado, git hooks | F0 |
| `docker-compose.yml` com Postgres 18 e Keycloak, portas parametrizáveis | F1 |
| `scripts/` em `.mjs` — subir stack, rodar e2e, verificar | F1, F6 |
| `packages/contracts` com JSON Schema → TS e Dart | F2 |
| Backend NestJS com as 4 camadas, health, config, pino, filtro de erro, Drizzle | F3 |
| Web React com a cadeia `Component → Hook → Service → api.ts`, shadcn, i18n | F4 |
| Mobile Flutter com Riverpod, go_router, l10n, logging | F5 |
| Playwright, primeiro e2e vertical | F6 |
| Portões estáticos, cobertura, Sonar, CI | F7 |
| Seção **Comandos** no `README.md`, com todos os comandos | F0 |

### Não entra

Deliberadamente fora — cada um vira plano próprio:

- **Claude Agent SDK.** Nenhuma `query()`. O walking skeleton não fala com o Claude.
- **Fluxo de permissão.** Sem `canUseTool`, sem push.
- **Auth0.** O bootstrap usa **só** Keycloak local. Auth0 é configuração
  ([ADR-010](../../architecture/shared/00-decisions.md#adr-010--openid-connect-agnóstico-de-provedor-auth0-como-alvo-inicial)),
  e teste automatizado nunca fala com tenant real.
- **Push notification, auditoria, transcript.**

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Fundação do monorepo](F0-foundation.md) | workspace, tooling, hooks, catálogo de comandos, scripts de apoio | B-01…B-06, B-48, B-49, B-52 | ✅ |
| F1 | [Infraestrutura local](F1-infrastructure.md) | docker-compose, Keycloak, `start-local.mjs`, `clean.mjs` | B-07…B-10, B-50 | 🔲 |
| F2 | [Contratos](F2-contracts.md) | JSON Schema → TS e Dart | B-11…B-14 | 🔲 |
| F3 | [Backend esqueleto](F3-backend.md) | 4 camadas, health, WS, Drizzle, OIDC | B-15…B-23, B-51 | 🔲 |
| F4 | [Web esqueleto](F4-web.md) | cadeia do front, shadcn, i18n, login | B-24…B-30 | 🔲 |
| F5 | [Mobile esqueleto](F5-mobile.md) | Flutter, Riverpod, l10n, login | B-31…B-36 | 🔲 |
| F6 | [Scripts e e2e](F6-scripts-e2e.md) | `run-e2e-local.mjs`, Playwright, e2e vertical | B-37…B-40 | 🔲 |
| F7 | [Portões e CI](F7-gates-ci.md) | estática, cobertura, `verify`, pipeline | B-41…B-47 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Monorepo com contrato único | B-01, B-11…B-14 | [07-repository-layout](../../architecture/shared/07-repository-layout.md) | S-01…S-04 |
| Código inglês, UI traduzida | B-27, B-34, B-45 | [01](../../architecture/shared/01-language-and-naming.md), [02](../../architecture/shared/02-i18n.md) | S-05…S-08 |
| Log estruturado de todo I/O | B-17, B-28, B-35 | [03-logging](../../architecture/shared/03-logging.md) | S-09…S-13 |
| Status HTTP e envelope de erro | B-18 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-14…S-19 |
| Contrato WS versionado | B-11, B-22, B-26, B-33 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-20…S-28 |
| Autenticação OIDC | B-20, B-29, B-36 | [08-authentication](../../architecture/shared/08-authentication.md) | S-29…S-37 |
| Clean Architecture no backend | B-15, B-23, B-41 | [01](../../architecture/backend/01-clean-architecture.md), [02](../../architecture/backend/02-folder-structure.md) | S-38…S-41 |
| Cadeia do front | B-24, B-26, B-30, B-41 | [01-architecture](../../architecture/web/01-architecture.md) | S-42…S-45 |
| Persistência com migration | B-19 | [05-persistence](../../architecture/backend/05-persistence.md) | S-46…S-49 |
| Config falha rápido | B-05, B-16 | [07](../../architecture/shared/07-repository-layout.md#configuração-e-segredo) | S-50…S-52 |
| Stack sobe e derruba limpa | B-07…B-10, B-37 | este plano | S-53…S-60 |
| Três níveis de teste, 90 % | B-38…B-40, B-42 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-61…S-64 |
| Análise estática nos 3 módulos | B-41, B-43, B-44 | [09-code-quality](../../architecture/shared/09-code-quality.md) | S-65…S-70 |
| Validação reinicia do 1º portão | B-46, B-47 | [11-validation-protocol](../../architecture/shared/11-validation-protocol.md) | S-71…S-73 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
remote-claude/
├── README.md · AGENTS.md
├── package.json · pnpm-workspace.yaml · tsconfig.base.json
├── docker-compose.yml · .env.example
│
├── scripts/                       ← .mjs, executados direto pelo node
│   ├── lib/                       ui, exec, ports, markdown, docs-graph, env-example,
│   │                              plan-template, plan-progress, findFreePort, waitForHttp,
│   │                              startProc, kill, compose, purge
│   ├── doctor.mjs                 pré-requisitos do ambiente
│   ├── start-local.mjs            portas fixas, stack de desenvolvimento
│   ├── run-e2e-local.mjs          portas aleatórias, efêmero, roda Playwright
│   ├── verify.mjs                 portões 1-7
│   ├── verify-full.mjs            portões 1-11
│   ├── contracts.mjs              gera TS e Dart; --check
│   ├── i18n-check.mjs             paridade de chaves en ↔ pt-BR
│   ├── docs-check.mjs             links, âncoras e documento órfão
│   ├── secrets-scan.mjs           gitleaks; --staged no pre-commit
│   ├── db.mjs                     migrate · reset · seed
│   ├── clean.mjs                  volumes órfãos, build, coverage
│   ├── plan.mjs                   scaffold de plano · --progress
│   └── tsconfig.json              checkJs — tipagem sem build
│
├── test/{unit,integration}/       ← scripts e configurações da raiz: lógica e contrato de saída
├── infra/keycloak/realm-remote-claude.json
├── packages/contracts/{schema,src,scripts}
├── backend/{src,test}
├── web/{src,test}
├── mobile/{lib,test,integration_test}
└── e2e/{specs,scenarios,fixtures}
```

### Por que `.mjs` e não `.ts` nos scripts

Os scripts existem para **subir** o projeto. Se precisarem de build, passam a depender
daquilo que deveriam iniciar — e quebram exatamente quando mais se precisa deles (repositório
recém-clonado, `node_modules` pela metade, CI frio).

`.mjs` roda direto no `node`, sem passo de compilação. A tipagem vem por JSDoc com
`checkJs: true` num `scripts/tsconfig.json` próprio: o `pnpm typecheck` verifica os scripts
com o mesmo rigor do resto, e nada precisa ser compilado para rodar.

---

## Catálogo de scripts

**Tarefa repetitiva vira script.** O agente invoca e lê a saída, em vez de orquestrar passo a
passo — ver [o princípio](../../architecture/shared/11-validation-protocol.md#automação-script-não-orquestração-pelo-agente).

Todos em `.mjs`, executados direto pelo `node`, sem build.

| Script | Task | Faz | Comando |
|---|---|---|---|
| `doctor.mjs` | B-48 | verifica pré-requisitos: versão do node, pnpm, docker, flutter, portas livres | `pnpm doctor` |
| `start-local.mjs` | B-10 | sobe a stack de desenvolvimento, portas fixas | `pnpm dev` |
| `run-e2e-local.mjs` | B-37 | sobe stack efêmera, roda e2e, derruba tudo | `pnpm test:e2e` |
| `verify.mjs` | B-46 | portões 1-7 | `pnpm verify` |
| `verify-full.mjs` | B-46 | portões 1-11 | `pnpm verify:full` |
| `contracts.mjs` | B-12…B-14 | gera TS e Dart do schema; `--check` falha se dessincronizado | `pnpm contracts:generate` · `:check` |
| `i18n-check.mjs` | B-45 | paridade de chaves, órfãs, params entre idiomas | `pnpm i18n:check` |
| `docs-check.mjs` | B-49 | links e âncoras internas quebradas, documento órfão do índice | `pnpm docs:check` |
| `secrets-scan.mjs` | B-04 | `gitleaks` no repositório ou só no que está no índice; cai na imagem Docker quando o binário não existe | `pnpm scan:secrets` |
| `db.mjs` | B-51 | `migrate`, `reset`, `seed` | `pnpm db migrate` |
| `clean.mjs` | B-50 | purga projetos e volumes compose órfãos, build, coverage | `pnpm clean` |
| `plan.mjs` | B-52 | cria pasta de plano no [formato normativo](../README.md#formato-obrigatório); `--progress` recalcula os contadores | `pnpm plan new <nome>` |

Regras para todo script: utilidade compartilhada em `scripts/lib/`, **código de saída
honesto** (0 só quando passou), saída que diz **o que** falhou e **onde**, idempotente, e
cleanup que roda mesmo em erro.

Script novo entra neste catálogo e na seção **Comandos** do [README.md](../../../README.md#comandos) **na mesma entrega**.

### Dois deles merecem justificativa

**`docs-check.mjs`** — a documentação é um grafo de índices e links cruzados
([`AGENTS.md`](../../../AGENTS.md) → índice geral → índice de área → documento). Link quebrado
ou documento fora do índice torna o roteamento silenciosamente inútil para o agente, e isso
não aparece em nenhum outro portão. Conferir à mão a cada entrega é exatamente o tipo de
trabalho que não deve consumir contexto de ninguém.

**`plan.mjs`** — o [formato de plano](../README.md#formato-obrigatório) tem três arquivos
fixos, um arquivo por fase, e convenções de ID. Reproduzir isso à mão a cada plano novo é
repetição pura, e é onde o formato começa a divergir.

---

## Portas

| Serviço | `start-local` (fixa) | `run-e2e-local` |
|---|---|---|
| PostgreSQL | 5432 | aleatória |
| Keycloak | 8180 | aleatória |
| Backend | 3000 | aleatória |
| Web | 5173 | aleatória |

O `docker-compose.yml` lê **toda** porta de variável com default, e `run-e2e-local.mjs` usa
`--project-name` único por execução. É o que permite rodar e2e com a stack de desenvolvimento
de pé, e duas suítes em paralelo no CI.

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | `allow` de projeto em diretório confiado pode furar o `canUseTool` | **aberto** — verificar antes de produção ([§8.2](../../discovery/01-descoberta-claude-agent-sdk.md#82--a-assimetria-allow-vs-deny-entre-escopos)) |
| R-02 | `SESSION_ALREADY_RUNNING` (409) vs enfileirar o prompt | **aberto** — o SDK enfileira nativamente ([§8.6](../../discovery/01-descoberta-claude-agent-sdk.md#86--segundo-prompt-durante-um-turno-é-enfileirado-pelo-sdk)); decidir antes da F3 |
| R-03 | Cobertura de 90 % desde o primeiro commit | risco de teste de fachada para bater número — [cobertura não é qualidade](../../architecture/shared/06-testing-strategy.md#cobertura-não-é-qualidade) |
| R-04 | Flutter fora do workspace pnpm | o Dart gerado sai de sincronia em silêncio; B-14 precisa cobrir os dois |
| R-05 | Docker obrigatório no CI e no dev | testcontainers e compose não têm alternativa; aceito |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — a [matriz de cenários](scenarios.md) já existe. Revise-a antes de começar
   e acrescente o que faltar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. A fase F7 fecha com `pnpm verify:full` verde.
