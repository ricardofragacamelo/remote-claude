# F0 — Contrato

Plano: [16 — Uso e custo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada neste plano. Precisa do plano 04 concluído (retomada e `session_origins`,
que dão a conversa de cada sessão), do [28](../28-agent-neutral-core/README.md) concluído
(`conversation { engine, id }`, `usage` canônico, capacidade `cost`, o anel `engines/claude/`) e do
`turn.completed.outcome` do [27](../27-conversation-losses/README.md)
([D-16](decisions.md#d-16--ajuste-às-diretivas-do-plano-28)).
**Entrega:** o módulo `usage` existe no papel e nas regras de máquina; a semântica do custo do SDK
está medida e escrita; o contrato HTTP, os códigos de erro, o esquema e as rotas web estão fechados.

**Por quê primeiro:** o defeito do custo acumulado (R-01) mostra o preço de gravar antes de medir.
Um centavo gravado com a semântica errada é um centavo errado em todo agregado, para sempre.

**Decisões que bloqueiam:** [D-01](decisions.md#d-01--de-onde-sai-o-custo-e-quão-preciso-ele-é),
[D-03](decisions.md#d-03--representação-do-dinheiro), D-05 (B-04).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — O módulo `usage` em `backend/03` e `backend/05` 🔲

Registrar o módulo seguindo
[Criando um módulo novo](../../architecture/backend/03-modules.md#criando-um-módulo-novo): linha no
catálogo ("uso e custo por turno, agregados, orçamentos, limites da conta" — **não** é responsável
por decidir se uma tool roda nem por custo de sessão externa), e o diagrama de fronteiras com as
setas novas:

- `session ──► usage` por porta (`UsageRecorder`, `TurnAdmission` em `application/session/ports/`):
  a sessão entrega o turno terminado e pergunta se um prompt pode entrar. `usage` nunca importa
  `session` — sem ciclo;
- `usage ──► workspace` (validar a pasta de um orçamento), `usage ──► notification` (push do
  alerta, se D-14), `usage ──► audit` (mudança de orçamento, D-13), `usage ──► transcript` (título
  da conversa para exibir — só leitura, por porta).

Em [backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai):
"uso por turno — números, nunca texto" entra na coluna do que vai ao Postgres, com a justificativa de
que não duplica transcript. A regra `transcript-is-never-persisted` do `lint:arch` passa a cobrir
`adapter/outbound/persistence/usage/` (S-02), e a fronteira `session`/`usage` ganha regra de
dependência (S-01).

### B-02 — A semântica do custo do SDK, medida 🔲

A semântica é do SDK do Claude, então a medição e o teste moram no adapter dele
(`adapter/outbound/engines/claude/`); o núcleo só conhece o uso canônico que ele emite. Gravar
fixtures reais com `scripts/record-agent-sdk-fixtures.mjs`: uma `query()` com três turnos,
um deles com subagente (Task) e troca de modelo; uma retomada in-place de conversa nossa; um fork de
conversa externa; um `/clear` no meio. Com elas, fechar os gaps de
[D-01](decisions.md#d-01--de-onde-sai-o-custo-e-quão-preciso-ele-é) e
[D-02](decisions.md#d-02--linha-de-base-na-retomada-e-os-resets-do-acumulado) e registrar os números
na descoberta (`docs/discovery/01-descoberta-claude-agent-sdk.md`, seção nova), como os planos 01 e
04 fizeram.

Escrever em [backend/04](../../architecture/backend/04-claude-integration.md#o-mapper--a-tradução-que-protege-o-contrato)
uma seção "Uso e custo — o que o `result` diz": `total_cost_usd` e `modelUsage` acumulados por
`query()`, `usage` só do loop principal e por turno, `costBasis`, reset por `/clear`, resultado
zerado, linha de base da retomada, e que o custo é estimativa. O teste de S-07 lê a fixture e
afirma a semântica — se uma versão do SDK mudar, é ele que quebra primeiro.

### B-03 — Contrato HTTP, códigos de erro e o `turn.completed` corrigido 🔲

Documentar em [backend/03](../../architecture/backend/03-modules.md) a tabela HTTP do módulo (Bearer
em tudo, o usuário sai do token — nunca do parâmetro):

| Rota | Devolve |
|---|---|
| `GET /usage/summary?from&to&tz&model&folder` | totais do período e cartões hoje / 7 dias / mês, cada um com o período anterior |
| `GET /usage/timeseries?from&to&tz&granularity&model&folder` | baldes `day`·`week`·`month` empilhados por modelo (top N + "outros") |
| `GET /usage/breakdown?dimension&from&to&tz&model&folder&q&sort&order&cursor&limit` | linhas por `folder`·`session`·`conversation`·`model` |
| `GET /usage/sessions/:sessionId` e `GET /usage/conversations/:engine/:id` | detalhe com turnos paginados; a conversa é sempre `{ engine, id }` |
| `GET /usage/facets?from&to` | modelos e pastas que existem nos dados do usuário, para os filtros |
| `GET /usage/export.csv?level&…filtros` | CSV ([D-10](decisions.md#d-10--formato-teto-e-trilha-do-export)) |
| `GET` · `PUT /usage/settings` | fuso e taxa de conversão manual |
| `GET` · `POST /usage/budgets`, `PATCH` · `DELETE /usage/budgets/:id`, `GET /usage/budgets/status` | orçamentos e o estado de cada um no período |
| `GET /usage/alerts?since`, `POST /usage/alerts/:id/seen` | alertas de orçamento para o centro de notificações |

As janelas de limite (`five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `overage`) e o
tipo de assinatura são conceitos da conta do Claude, e não do núcleo: a rota é da extensão,
`GET /engines/claude/usage/rate-limits` (janelas com o instante da observação), documentada em
`backend/03` na seção da extensão. Ela e as rotas da tabela nascem com o tipo gerado em
`packages/contracts/schema/http/`, como toda rota REST ([28 · D-09](../28-agent-neutral-core/decisions.md#f1--porta-de-motor-e-conversa)).
O núcleo (`/usage/*`) só fala de tokens por categoria canônica e de custo, este quando o motor o
informa (`cost: 'usd'`).

Status com significado ([04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http)):
`400` validação, `401`, `403` recurso de outra pessoa ou pasta fora da allowlist, `404` inexistente,
`409` conflito, `422` semântica impossível, `429` orçamento estourado, `503` admissão sem banco.

Códigos novos no catálogo (doc 04 **e** `error-catalogue.ts`, com `messageKey` en/pt-BR — S-04):
`USAGE_RANGE_TOO_LONG` (422, `params.maxDays`), `USAGE_EXPORT_TOO_LARGE` (422, `params.limit`),
`USAGE_BUDGET_NOT_FOUND` (404), `USAGE_BUDGET_CONFLICT` (409), `USAGE_BUDGET_EXCEEDED` (429,
`params: { budgetId, scope, period, unit, limit, spent, resetsAt, retryAfterSeconds }`, com `unit`
`usd` ou `tokens` — B-23).

Em [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#eventos-servidor--cliente):
a linha do `turn.completed` passa a dizer que `costUsd` é o custo **do turno**, calculado pelo adapter
do motor (no Claude, a partir dos acumulados do SDK) — o `usage` canônico e o `costUsd?` opcional já
vêm do 28 · F4; o que muda é a implementação (B-07), e o `costUsd` só vem quando o motor anuncia
`cost: 'usd'` — e
`session.prompt`/`session.start` ganham `USAGE_BUDGET_EXCEEDED` entre os erros possíveis. Não há
schema novo nem campo novo: `v` não muda. Nota ao plano 08 no progresso deste plano: o custo por
turno que ele soma passa a ser o certo.

### B-04 — Esquema e migration 🔲

Migration versionada nova ([backend/05 · Migrations](../../architecture/backend/05-persistence.md#migrations)),
com as [convenções de schema](../../architecture/backend/05-persistence.md#convenções-de-schema) e
reversão descrita no topo (S-05):

- `usage_turns` — `turn_id` (único, o id do turno), `user_id`, `session_id`, `engine` e
  `conversation_id` (a `conversation { engine, id }` do 28, no lugar do `claude_session_id`),
  `workspace_path`, `completed_at`, `duration_ms`, `duration_api_ms`, `num_turns`, `outcome` (o
  desfecho canônico do turno do 27 — `completed`·`failed`·`limitReached`·`budgetExceeded`·`cancelled`,
  CHECK; nunca o subtipo do `result` do SDK), `cost_usd` `numeric(20,9)` anulável, `cost_basis`
  (`exact`·`reset`·`zeroed`·`baselineUnknown`, CHECK), `engine_baseline jsonb` (opaco ao núcleo: o
  estado que o adapter do motor devolve, só números — no Claude, o acumulado por modelo que é a linha
  de base da próxima retomada in-place da mesma conversa);
- `usage_turn_models` — por `(turn_id, model)`: `canonical_model` e os tokens nas categorias do
  `usage` canônico — `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`,
  `reasoning_tokens` e `web_searches` (estes dois dos opcionais `reasoningTokens?` e `webSearches?` do
  `usage` canônico, [28 · D-17](../28-agent-neutral-core/decisions.md#f4--modos-esforço-uso-e-blocos)), todos anuláveis (o motor que não informa a categoria grava nulo, nunca
  zero) —, `cost_usd` e `price_basis` (`list`·`managed`·`unknown`), estes dois só quando o motor
  informa USD (`cost: 'usd'`);
- `usage_budgets` (escopo, pasta, período, unidade, limite, limiares, modo, push, `deleted_at`),
  `usage_budget_alerts` (único por `(budget_id, period_start, threshold)` — é o que faz o alerta sair
  uma vez), `usage_alert_views`, `usage_settings`;
- na extensão do Claude, `claude_rate_limits` (uma linha por janela) — o prefixo é o da extensão;
- os kinds `usage.budgetCreated`/`Updated`/`Deleted` no CHECK de `audit_events.kind` (se D-13);
- índices com a query que os justifica: `(user_id, completed_at)`,
  `(user_id, workspace_path, completed_at)`, `(session_id)`, `(engine, conversation_id, completed_at)`.

Nenhuma coluna de texto livre além de caminho, ids e nomes de modelo (S-03).

### B-05 — Rotas web e o lugar na navegação 🔲

`/usage` (abas Visão geral · Pastas · Sessões · Conversas · Modelos · Orçamentos),
`/usage/sessions/$sessionId`, `/usage/conversations/$engine/$conversationId`, com filtros, ordenação e aba
na search ([web/04 · A URL é estado](../../architecture/web/04-state-and-data.md#a-url-é-estado)).
Entrada "Uso e custo" na navegação global do plano 06, fora das abas de pasta; comandos na palette e
atalho registrados no registro de comandos do 06; namespace de i18n `usage.*` no núcleo (o nome do
agente como `{agent}`, do `displayName` do `GET /engines`) e `engines.claude.usage.*` para o que só
o Claude tem (limites da conta, assinatura). Parâmetro inválido ou
desconhecido cai no padrão (S-06) — a validação que avisa é a da B-18.

---

## Cenários cobertos

S-01…S-07.

---

## Critério de conclusão

```bash
pnpm verify
pnpm docs:check
```
