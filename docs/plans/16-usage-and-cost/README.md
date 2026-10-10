# Plano 16 — Uso e custo

**Objetivo:** uma tela própria que responde "quanto estou gastando, onde e com o quê" — tokens e
custo por dia, modelo, pasta, sessão e conversa —, com os limites de uso da conta à vista e
orçamentos que avisam e, se o usuário pedir, recusam novos turnos.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

**Depende de:** [06 — Workbench](../06-workbench/README.md) (navegação global, moldura de tela com
ajuda, centro de notificações, status bar, command palette). O
[08 — Painel do Claude](../08-claude-panel/README.md) mostra o custo **da sessão aberta**; este plano
é dono do **agregado** e da correção do custo por turno que os dois usam. O
[13 — Configuração do Claude](../13-claude-settings/README.md) é dependência opcional: quando existir,
o tipo de conta (assinatura ou chave de API) vem dele. E do
[28 — Núcleo neutro de agente](../28-agent-neutral-core/README.md) **concluído**: a conversa é
`conversation { engine, id }`, o `turn.completed.usage` é canônico com `costUsd?` opcional, o motor
anuncia `cost` (`usd` · `tokens` · `requests` · `none`) nas capacidades, e o que é da conta do Claude
(janelas de limite, tipo de assinatura) mora na extensão `engines/claude/`. O desfecho do turno é o
`turn.completed.outcome` do [27 — Perdas da conversa](../27-conversation-losses/README.md), que roda
antes deste ([D-16](decisions.md#d-16--ajuste-às-diretivas-do-plano-28)).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Hoje cada turno termina com um `turn.completed` que carrega `usage`, `costUsd` e `durationMs`
([05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente)),
a tela da sessão mostra o número, e ele **evapora**: nada é gravado. Não existe resposta para
"quanto gastei esta semana", "qual pasta custa mais" ou "o Opus está valendo o preço".

A verificação no código e no SDK, feita ao escrever este plano, mudou o desenho:

| Fato verificado | Onde | Consequência aqui |
|---|---|---|
| Uso e custo **não são persistidos** em lugar nenhum — `grep costUsd` em `backend/src` só acha o mapper | `backend/src/adapter/outbound/claude/sdk-message.mapper.ts` (`fromResult`) | tabela nova, migration versionada nova (B-04, B-08) |
| O `total_cost_usd` do `result` é **acumulado por `query()`** em sessão de streaming input, não do turno. O mapper o publica como `costUsd` do turno, e o schema diz "Cost of the turn" — **o número mostrado hoje a partir do segundo turno está errado** | `sdk.d.ts` (`SDKResultSuccess.total_cost_usd`), `packages/contracts/schema/events/turn-completed.schema.json` | o custo do turno passa a ser a **diferença** entre acumulados (B-06, B-07), e o contrato continua o mesmo — quem estava errado era o backend |
| `modelUsage` (por modelo, acumulado, com subagentes e compactação) é "o campo certo para contabilidade"; `usage` é **só o loop principal** e por turno | `sdk.d.ts` (`ModelUsage`, `SDKResultSuccess.usage`) | a contabilidade é por modelo, diferenciada ([D-01](decisions.md#d-01--de-onde-sai-o-custo-e-quão-preciso-ele-é)) |
| Sessão retomada ou bifurcada **continua do total que o transcript salvou**; `/clear` zera o acumulado; resultado de crash pode vir zerado | `sdk.d.ts` (comentário de `total_cost_usd` e `modelUsage`) | linha de base por conversa e detecção de reset ([D-02](decisions.md#d-02--linha-de-base-na-retomada-e-os-resets-do-acumulado)) |
| `ModelUsage.costBasis` diz se o preço é de lista, contratado (`managed`) ou chute (`unknown`); o custo é "uma estimativa, não uma fatura" | `sdk.d.ts` | a base é gravada e a ajuda diz o que o número é |
| `rate_limit_event` (5 h, 7 dias, por modelo, overage; `allowed`/`allowed_warning`/`rejected`, `utilization`, `resetsAt`) chega no stream — e o mapper o **descarta** de propósito desde o [ciclo 26 do plano 01](../01-live-session/progress.md), com "expor rate limit é do plano 05"; o plano 05 não tem task para isso | `sdk-message.mapper.ts` (`case 'rate_limit_event'`) | este plano assume a exposição, sem evento WS novo ([D-09](decisions.md#d-09--limites-de-uso-da-conta-fonte-transporte-e-quem-vê)) |
| `accountInfo()` dá `subscriptionType` e `apiProvider`; `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` dá as janelas de limite, mas é declaradamente instável | `sdk.d.ts` (`Query`) | só a fonte estável entra; a experimental fica registrada e recusada |
| Já existe um teto **por sessão**: `maxBudgetUsd` (`RC_SESSION_MAX_BUDGET_USD`, default 10) e o resultado `error_max_budget_usd` | `sdk-options.factory.ts`, `.env.example` | o orçamento por usuário/pasta deste plano é outra coisa, e o teto por sessão continua como rede de proteção ([D-12](decisions.md#d-12--o-que-acontece-quando-o-orçamento-estoura)) |

Três escolhas definem o plano:

- **O `usage` é um módulo próprio, a jusante do `session`**, que chama por porta
  ([backend/03](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)).
  Custo não é fronteira de segurança como a trilha: falha ao gravar uso é `error` no log e a sessão
  segue (S-25) — exceto quando o usuário **pediu** para ser bloqueado (S-104).
- **O banco guarda números, nunca texto.** Nenhuma coluna de mensagem ou prompt; a regra
  `transcript-is-never-persisted` continua valendo
  ([backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai)).
- **Só entra o que passou por aqui.** Sessões externas (VS Code, CLI) não têm o custo visível para
  nós, e a tela diz isso em vez de inventar ([D-08](decisions.md#d-08--o-que-se-mostra-das-sessões-externas)).

---

## Escopo

### Entra

| | |
|---|---|
| Módulo `usage` documentado, semântica do custo do SDK medida com fixtures reais, contrato HTTP, esquema, rotas web | F0 |
| Custo do turno corrigido (diferença de acumulados, no adapter do Claude), gravação por turno e por modelo, agregações no fuso do usuário, export CSV, limites de uso da conta (na extensão do Claude), retenção, fuso e taxa de conversão manual | F1 |
| Tela "Uso e custo": cartões (hoje, 7 dias, mês), gráfico diário empilhado por modelo acessível e ciente do tema, tabelas por pasta/sessão/conversa/modelo, filtros na URL, detalhe de sessão e conversa com turnos, cache hit, custo médio, export, painel de limites, ajuda completa | F2 |
| Orçamentos por usuário e por pasta (diário/mensal), limiares, alerta no centro de notificações e na status bar, push opcional, recusa de novos turnos opcional, trilha das mudanças, tela de orçamentos com ajuda | F3 |
| E2E do ciclo, do orçamento, do isolamento entre usuários, do fuso e da acessibilidade | F4 |

### Não entra

- **Custo da sessão aberta no painel do chat e na status bar da sessão** — é do
  [08](../08-claude-panel/README.md); ele passa a receber o custo do turno certo por causa da B-07.
- **Modelo e permission mode padrão, conta do CLI** — tela do [13](../13-claude-settings/README.md).
- **Custo de sessões externas** (VS Code, CLI) — o SDK não o informa fora da `query()` que o gerou,
  e ler o transcript para estimá-lo fere a regra de nunca interpretar o JSONL
  ([D-08](decisions.md#d-08--o-que-se-mostra-das-sessões-externas)).
- **Fatura real da Anthropic ou do console** — não há API para isso no SDK; o que existe é a
  estimativa, e a tela a chama assim.
- **Conversão de moeda por cotação online** — egresso de rede e dado que envelhece; entra só a taxa
  manual informada pelo usuário ([D-04](decisions.md#d-04--moeda)).
- **Telas no app Flutter** — o web é mobile-first; o app só ganha a tradução do código de erro novo
  (B-26).
- **Rate limit das nossas bordas** (frames, ingestão de log) — é do
  [05](../05-hardening-operations/README.md); aqui são os limites **da conta do Claude**, que moram na
  extensão dele.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | módulo documentado, semântica do custo medida, contrato HTTP, esquema e rotas | B-01…B-05 | 🔲 |
| F1 | [Backend de uso](F1-usage-backend.md) | custo do turno certo, gravação, agregações, export, limites da conta, retenção | B-06…B-13 | 🔲 |
| F2 | [Tela de uso](F2-usage-screen.md) | a tela "Uso e custo" completa, com gráfico acessível e ajuda | B-14…B-22 | 🔲 |
| F3 | [Orçamentos](F3-budgets.md) | orçamentos, alertas, recusa opcional, tela de orçamentos | B-23…B-29 | 🔲 |
| F4 | [E2E](F4-e2e.md) | o ciclo pela porta do usuário | B-30…B-33 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Módulo `usage` com fronteira por porta, sem ciclo, sem alcançar o transcript | B-01 | [backend/03-modules](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem) | S-01, S-02 |
| A semântica do custo do SDK medida e escrita, antes de gravar um centavo | B-02 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#o-mapper--a-tradução-que-protege-o-contrato) | S-07 |
| Contrato HTTP e códigos novos no catálogo, com `messageKey` en/pt-BR | B-03 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-04 |
| Esquema só com números, migration versionada nova, índices com a query que os justifica | B-04 | [backend/05-persistence](../../architecture/backend/05-persistence.md#convenções-de-schema) | S-03, S-05 |
| Rotas web com o estado na URL | B-05, B-18 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md#a-url-é-estado) | S-06, S-75 |
| O custo do turno é o do turno — diferença de acumulados por modelo, exata ao nano-dólar | B-06, B-07 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente) | S-08…S-15, S-20, S-23 |
| Retomada, fork, `/clear` e crash não duplicam nem apagam custo | B-06, B-07 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#retomada--fork-fora-in-place-dentro) | S-10, S-11, S-21, S-22, S-24 |
| Dia, semana e mês no fuso do usuário — DST, meia hora e virada do mês | B-06, B-09, B-13 | [backend/05-persistence](../../architecture/backend/05-persistence.md#convenções-de-schema) | S-16…S-19, S-33, S-63, S-64, S-120 |
| Gravação idempotente e concorrente, sem perda e sem nada pela metade | B-08 | [backend/05-persistence](../../architecture/backend/05-persistence.md#transações) | S-27…S-31 |
| Uso não é fronteira: falha ao gravar não derruba a sessão, e nenhum texto vai para log | B-07, B-08 | [03-logging](../../architecture/shared/03-logging.md) | S-25, S-26 |
| Agregações corretas, paginadas, sobre índice | B-09 | [backend/05-persistence](../../architecture/backend/05-persistence.md#convenções-de-schema) | S-32, S-34…S-39, S-44…S-47 |
| Isolamento: ninguém vê o uso de outra pessoa | B-09, B-10, B-32 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#regras-de-tratamento) | S-40…S-43, S-48, S-87, S-119 |
| Export CSV fiel aos filtros, seguro contra injeção, com teto | B-10, B-20 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-49…S-53, S-79, S-121 |
| Limites de uso da conta a partir do `rate_limit_event`, na extensão do Claude, sem mentir o status da sessão | B-11, B-21 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#o-mapper--a-tradução-que-protege-o-contrato) | S-54…S-59, S-80 |
| Retenção com purga explícita | B-12 | [backend/05-persistence](../../architecture/backend/05-persistence.md) | S-60…S-62 |
| Fuso e taxa manual do usuário no servidor | B-13 | [backend/05-persistence](../../architecture/backend/05-persistence.md) | S-63…S-65 |
| Tela com os quatro estados, cartões, tabelas, filtros, detalhe — atualizada pelo stream | B-14, B-15, B-17…B-19 | [web/03-ui-system](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre), [web/04-state-and-data](../../architecture/web/04-state-and-data.md#tanstack-query--dado-do-servidor) | S-66…S-70, S-75…S-78, S-86 |
| Gráfico acessível e ciente do tema | B-16 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-71…S-74 |
| Moeda formatada por idioma, sem "US$ 0,00" para gasto real | B-15, B-19 | [02-i18n](../../architecture/shared/02-i18n.md) | S-81 |
| Usabilidade e ajuda da tela de uso | B-22 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto), [02-i18n](../../architecture/shared/02-i18n.md) | S-82…S-85 |
| Orçamento: períodos no fuso, limiares, pasta por segmento, sobreposição | B-23 | [backend/03-modules](../../architecture/backend/03-modules.md) | S-88…S-92, S-107 |
| CRUD de orçamento validado, idempotente, isolado e na trilha | B-24 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio), [backend/05-persistence](../../architecture/backend/05-persistence.md#auditoria--append-only) | S-93…S-98 |
| Alerta exatamente uma vez por limiar e período, mesmo com sessões concorrentes | B-25 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) | S-99, S-100, S-108, S-109 |
| Recusa de novos turnos só quando pedida, sem interromper o turno que cruzou | B-26 | [backend/03-modules](../../architecture/backend/03-modules.md#session) | S-101…S-106 |
| Alerta no web: centro de notificações, status bar, recusa traduzida no composer | B-27 | [web/03-ui-system](../../architecture/web/03-ui-system.md#padrões-de-ui-deste-produto) | S-110, S-111 |
| Tela de orçamentos com desfazer, prévia e progresso acessível | B-28 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-112…S-114 |
| Usabilidade e ajuda da tela de orçamentos | B-29 | [02-i18n](../../architecture/shared/02-i18n.md) | S-115 |
| O ciclo provado pela porta do usuário | B-30…B-33 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-116…S-123 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/          sem evento novo — o `usage` canônico (com `reasoningTokens?` e
                                    `webSearches?`) e o `costUsd?` são do 28 · F4; aqui o `costUsd`
                                    passa a ser o do turno (B-07)
└── http/                           as rotas /usage/* e /engines/claude/usage/rate-limits (28 · D-09)

backend/src/
├── domain/usage/                   UsdAmount · TokenCounts (categorias canônicas) · UsagePeriod
│                                   Budget · evaluateBudgets                       (núcleo, neutro)
├── domain/engines/claude/usage/    CumulativeUsage · turnDelta · RateLimitWindow  (só o Claude)
├── application/usage/              RecordTurnUsage · QueryUsage · ExportUsage · ManageBudgets
│   │                               AdmitTurn · UsageSettings
│   └── ports/                      UsageRepository · BudgetRepository · ConversationTitles
│                                   BudgetAlertNotifier · UsageAuditTrail
├── application/engines/claude/usage/   RateLimitState · ports/RateLimitStore
├── application/session/ports/      UsageRecorder · TurnAdmission       (session → usage, por porta)
├── adapter/
│   ├── inbound/http/usage/         /usage/* (resumo, série, quebra, detalhe, facetas, export,
│   │                               configurações, orçamentos, alertas)
│   ├── inbound/http/engines/claude/usage/   /engines/claude/usage/rate-limits
│   ├── outbound/engines/claude/    o mapper diferencia o acumulado e emite o uso canônico (B-07)
│   └── outbound/persistence/usage/
└── infrastructure/
    ├── database/migrations/        migration versionada nova: usage_*, claude_rate_limits e os
    │                               kinds usage.budget*
    ├── jobs/                       usage-purge.job
    └── modules/usage.module.ts

web/src/features/usage/             components · hooks · services · types — o slot de painéis da tela
web/src/engines/claude/usage/       o painel de limites e o aviso de assinatura, registrados pelo
                                    web/src/app/engines.ts no slot da tela de uso
web/src/app/                        UsageRoute · UsageSessionRoute · BudgetsRoute
web/src/shared/components/ui/       chart (se D-11 escolher o do shadcn)
mobile/lib/l10n/                    só a chave de `USAGE_BUDGET_EXCEEDED`
e2e/{scenarios,specs}/              usage-and-cost · budgets
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | O custo mostrado hoje a partir do segundo turno é o **acumulado** rotulado como do turno — e o 08 vai construir em cima dele | **aberto** — a B-07 corrige no backend, sem mudar o contrato; o 08 é avisado por esta linha e pela nota da B-03 |
| R-02 | A semântica de `modelUsage`/`total_cost_usd` é documentada em comentário e muda sem aviso (os campos `costBasis`, `thinkingTokens` já são "ausentes em builds antigos") | **aberto** — fixtures reais gravadas na B-02, mapper tolerante a campo ausente (S-15), e a base do custo gravada por turno |
| R-03 | O orçamento é **limite suave**: o turno que cruza termina, prompts já aceitos rodam, sessões concorrentes podem passar juntas. Quem espera um teto rígido é surpreendido | **aberto** — dito na ajuda e na recusa; o teto rígido por sessão (`maxBudgetUsd`) continua ([D-12](decisions.md#d-12--o-que-acontece-quando-o-orçamento-estoura)) |
| R-04 | Agregação na leitura fica lenta com o volume | **aberto** — índice decidido com a query, plano de execução medido sobre volume sintético ([D-06](decisions.md#d-06--agregar-na-leitura-ou-manter-um-acumulado)) |
| R-05 | Uso por pasta revela atividade — é dado pessoal do usuário | **aberto** — toda consulta filtra por `user_id` do token, sem texto, cenários de isolamento em integração e e2e (S-40…S-43, S-119) |
| R-06 | Falha ao gravar uso faz o orçamento contar menos que o gasto real | **aberto** — `error` no log com o `turnId`; a admissão com orçamento bloqueante falha fechada (S-104) |
| R-07 | O primeiro turno depois de um fork de conversa externa não tem custo separável | **aberto** — gravado com tokens do turno e custo desconhecido, dito na tela ([D-02](decisions.md#d-02--linha-de-base-na-retomada-e-os-resets-do-acumulado)) |
| R-08 | Moldura, navegação, centro de notificações e status bar vêm do 06; sem ele a F2 e a F3 não fecham | **aberto** — F0 e F1 não dependem do 06 e podem andar antes |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
