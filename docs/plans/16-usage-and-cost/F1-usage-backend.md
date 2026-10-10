# F1 — Backend de uso

Plano: [16 — Uso e custo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md).
**Entrega:** o custo do turno publicado é o do turno; cada turno fica gravado por modelo; o
backend responde resumo, série, quebra, detalhe, facetas, export, limites da conta e configurações,
sempre só com o dado de quem pergunta; a retenção roda sozinha.

**Decisões que bloqueiam:** [D-02](decisions.md#d-02--linha-de-base-na-retomada-e-os-resets-do-acumulado) (B-07),
[D-06](decisions.md#d-06--agregar-na-leitura-ou-manter-um-acumulado) (B-09), D-07 (B-12),
[D-08](decisions.md#d-08--o-que-se-mostra-das-sessões-externas) (B-09),
[D-09](decisions.md#d-09--limites-de-uso-da-conta-fonte-transporte-e-quem-vê) (B-11),
[D-10](decisions.md#d-10--formato-teto-e-trilha-do-export) (B-10), D-04 e D-05 (B-13).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-06 — Domínio `usage`: dinheiro, acumulado, delta e período 🔲

Puro, sem framework ([backend/01](../../architecture/backend/01-clean-architecture.md)):

- `UsdAmount` sobre inteiro de nano-dólares ([D-03](decisions.md#d-03--representação-do-dinheiro)),
  com a conversão do float do SDK num lugar só, e formatação decimal para o fio;
- `TokenCounts` nas categorias do `usage` canônico do [28](../28-agent-neutral-core/README.md)
  (entrada, saída, leitura e escrita de cache, raciocínio e buscas web — estas duas dos opcionais
  `reasoningTokens?` e `webSearches?`, [28 · D-17](../28-agent-neutral-core/decisions.md#f4--modos-esforço-uso-e-blocos)), cada uma opcional — categoria que o motor não informa
  é ausente, nunca zero;
- no anel do Claude (`domain/engines/claude/usage/`), porque a semântica de acumulado é do SDK dele:
  `CumulativeUsage` (por modelo) e `turnDelta(previous, current, outcome)` → delta por modelo e a base
  (`exact`, `reset`, `zeroed`, `baselineUnknown`), com as regras de D-02. Campo ausente ou valor
  inválido do SDK vira `unknown` ou o default documentado, nunca exceção (S-15). O núcleo recebe só o
  delta canônico;
- `UsagePeriod`: início e fim de dia, semana e mês num fuso IANA, com DST e deslocamentos não
  inteiros (S-16…S-19).

Os testes de propriedade (S-09) geram sequências de acumulados em float e provam que a soma dos deltas
é o último acumulado. Três níveis: o domínio é unit; a integração e o e2e vêm nas tasks seguintes.

### B-07 — Captura no `session`, e o `costUsd` do turno corrigido 🔲

O `modelUsage`, o `total_cost_usd` e o subtipo do `result` **não saem do adapter do Claude**
(`adapter/outbound/engines/claude/`): o mapper guarda o acumulado anterior da `query()` viva, calcula
o delta com `turnDelta` e emite o turno já canônico — `turn.completed.usage` nas categorias canônicas,
`costUsd` do turno, `outcome` canônico do 27 — e, fora do contrato, o `TurnUsage` por modelo (tokens
canônicos, custo, `price_basis`, `cost_basis`) e o `engine_baseline` opaco. A sessão não interpreta
nada disso, só repassa:

- `turn.completed.costUsd` publica o **delta** — hoje publica `total_cost_usd`, o acumulado (S-20);
  motor sem `cost: 'usd'` não publica `costUsd`, e o turno é gravado só com tokens;
- a linha de base de uma retomada in-place vem da porta `UsageRecorder` (o último `engine_baseline`
  gravado da mesma `conversation { engine, id }`), entregue ao adapter ao retomar; fork de conversa
  externa começa sem base (S-21, S-22);
- o turno vai para `UsageRecorder.record()` com ids, `conversation`, pasta, dono da sessão e delta. **Falha ao
  gravar não derruba a sessão**: `turn.completed` sai, e o log registra `error` com `turnId` (S-25)
  — o uso não é a fronteira de segurança, a trilha é
  ([backend/03 · audit](../../architecture/backend/03-modules.md#audit)).

Resultado de erro com custo real conta (S-23); turno sem `result` não grava (S-24). O log de I/O
da borda leva ids, `engine`, modelo, contagens e custo — nunca texto (S-26,
[03-logging](../../architecture/shared/03-logging.md)). Web e app não mudam: passam a mostrar o
número certo.

### B-08 — Gravação idempotente 🔲

Repositório Drizzle em `adapter/outbound/persistence/usage/`: o turno e as linhas por modelo numa
transação só ([backend/05 · Transações](../../architecture/backend/05-persistence.md#transações)),
`INSERT … ON CONFLICT (turn_id) DO NOTHING` — reentrega não duplica nem reavalia orçamento (S-27).
Sem contador atualizado: a soma é feita na leitura (D-06), então turnos concorrentes de sessões
diferentes não disputam linha (S-28, S-29). Falha no meio desfaz tudo (S-30). Log `debug` de entrada
e saída do banco, sem conteúdo.

### B-09 — Consultas agregadas 🔲

Casos de uso de leitura, sempre filtrados pelo `user_id` do token — nenhum parâmetro escolhe o dono
(S-40, S-42):

- **resumo**: totais do período e os cartões hoje / 7 dias / mês corrente no fuso, cada um com o
  período anterior equivalente (S-32);
- **série**: `date_trunc` sobre `completed_at AT TIME ZONE` o fuso pedido, com `generate_series`
  para o dia sem uso aparecer com zero (S-33, S-34); top N modelos e "outros" (S-35); teto de
  período com `USAGE_RANGE_TOO_LONG` (S-36);
- **quebra**: por pasta, sessão, conversa e modelo, com turnos, tokens por tipo, cache hit, custo,
  custo médio por turno (sem os de custo desconhecido, contados à parte — S-46), última atividade;
  ordenação por qualquer coluna com desempate estável e cursor que não pula sob escrita (S-38, S-39);
- **detalhe** de sessão e de conversa, com os turnos e a base de cada um;
- **facetas**: modelos e pastas presentes nos dados do usuário no período.

Título de conversa pela porta `ConversationTitles` sobre o módulo `transcript`, com cache; falha ou
conversa apagada → id curto, e a resposta sai (S-43). Sessões externas não aparecem, e a resposta do
resumo diz que o recorte é "só o que passou por aqui" (D-08). Validação de parâmetros com todos os
erros em `details[]` (S-37). O plano de execução de cada consulta é verificado sobre 1 M turnos
sintéticos, como no plano 03 (S-44).

### B-10 — Rotas HTTP e o export 🔲

Controllers em `adapter/inbound/http/usage/` com as rotas da B-03, guarda Bearer (S-48), `403`
para sessão ou conversa de outra pessoa e `404` para inexistente (S-41).

Export conforme [D-10](decisions.md#d-10--formato-teto-e-trilha-do-export): streaming com cursor do
banco, RFC 4180, BOM, instantes ISO com deslocamento, neutralização de fórmula (S-49, S-50), teto com
`USAGE_EXPORT_TOO_LARGE` (S-51), as mesmas consultas da quebra — o CSV nunca soma diferente da tela
(S-52) —, e requisição abortada fecha o cursor (S-53). Nome do arquivo com o período e o fuso.

### B-11 — Limites de uso da conta 🔲

As janelas de limite e o tipo de assinatura são da conta do Claude, então a task inteira mora na
**extensão do Claude** (`domain/`, `application/` e `adapter/…/engines/claude/`), e o núcleo `usage`
não a conhece. O `case 'rate_limit_event'` do mapper continua sem publicar nada no stream (S-59) e
passa a entregar o evento à porta `RateLimitStore` da extensão, que guarda o estado mais recente
**por janela** (tabela `claude_rate_limits`) com o instante da observação — evento fora de ordem ou
repetido não regride o estado (S-56, S-57); janela desconhecida vira `other` com o nome cru (S-55).
`GET /engines/claude/usage/rate-limits` devolve as janelas (utilização, estado, `resetsAt`, overage)
ou `applicable: false` quando a conta não tem limites de plano (S-58).

Conforme [D-09](decisions.md#d-09--limites-de-uso-da-conta-fonte-transporte-e-quem-vê): só a fonte
estável, sem evento WS novo, visível a todo usuário autenticado como "limites da conta desta
máquina". Quando o plano 13 existir, o tipo de conta vem do `GET /engines/claude/account` dele (a rota
que a F6 do 28 move de `/claude/*`); antes disso,
"se aplica" é inferido de já ter chegado um evento. Nota ao plano 05 no progresso: a exposição que o
ciclo 26 do plano 01 atribuiu a ele saiu daqui.

### B-12 — Retenção 🔲

`UsagePurgeJob` em `infrastructure/jobs/`, no molde do `SnapshotPurgeJob`: remove `usage_turns` (e,
por cascata, os modelos) além de `RC_USAGE_RETENTION_DAYS` ([D-07](decisions.md#d-07--retenção)),
em lotes que não seguram a gravação (S-60, S-61), idempotente (S-62), com log do que removeu. Nunca
toca orçamentos, alertas do período corrente nem configurações. A variável entra no `.env.example` e
no schema de ambiente.

### B-13 — Configurações de uso: fuso e taxa manual 🔲

`GET`/`PUT /usage/settings`: fuso IANA validado contra a base do Postgres (`pg_timezone_names`) —
fuso inválido é `INVALID_INPUT` (S-63); sem preferência, o web grava o do navegador na primeira
visita. A troca vale na hora para as consultas e no próximo período para os orçamentos, sem reemitir
alerta (S-64, [D-05](decisions.md#d-05--fuso-e-a-que-dia-pertence-um-turno)). Taxa de conversão
manual opcional ([D-04](decisions.md#d-04--moeda)): moeda ISO 4217, valor positivo com até 6 casas,
data da informação (S-65).

---

## Cenários cobertos

S-08…S-65.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
