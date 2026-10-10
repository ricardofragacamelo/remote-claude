# Plano 18 — Logs e diagnóstico

**Objetivo:** duas telas que respondem "o que o sistema está fazendo, e por que isto falhou" — um
visualizador do log do backend, com filtros, rastreio por `traceId` e acompanhamento ao vivo, e
uma tela de saúde da instalação que diz, item por item e em palavras, o que está quebrado e o que
fazer.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

**Depende de:** [plano 06](../06-workbench/README.md) (a navegação global, a moldura de tela com
ajuda e a rota `/diagnostics`, que nasce lá com o ping), e do
[plano 28 — Núcleo neutro de agente](../28-agent-neutral-core/README.md) **concluído**: o estado de
cada motor vem do `describe()` da porta de motor e do `GET /engines`, os logs da borda do motor são
`engine.*`, e o que é só do Claude (os checks dele e a sonda ativa) é um `HealthCheck` registrado pela
extensão `engines/claude/` ([D-17](decisions.md#d-17--ajuste-às-diretivas-do-plano-28)). Não depende dos planos 07, 12 e 13: o que
eles acrescentam à saúde entra por registro, quando existir ([D-15](decisions.md#d-15--a-fronteira-com-os-planos-07-12-e-13)).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Hoje, quando algo falha, o usuário recebe uma mensagem traduzida com um `traceId` — e não tem onde
colar esse id. O log existe, completo e estruturado, mas só no **stdout do backend**: quem não tem um
terminal aberto na máquina não o lê, e quem está no celular nunca vai ler. O log do web e do app
fica no console de cada um, por decisão ([03-logging](../../architecture/shared/03-logging.md#por-quê-o-mesmo-schema-nas-três-pontas)):
o que liga um erro na tela ao que o backend fez é o `traceId`, e é por ele que se chega às linhas
do backend. E a saúde da instalação se resume a `GET /health` — `{ status, database }`, feito para
o script de partida, não para uma pessoa.

O que já existe e este plano aproveita, em vez de refazer:

| Existe | Onde | O que falta |
|---|---|---|
| Log JSON com o mesmo schema nas três pontas, `traceId` propagado do clique ao subprocesso | [03-logging](../../architecture/shared/03-logging.md) | um lugar de onde o **produto** leia as linhas |
| Redação por nome de campo em toda linha do backend | [03-logging](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log) | redação por **forma de texto** (JWT, `Bearer …`, `token=…`) **na leitura**, antes de uma linha sair da máquina pela tela — não existe hoje; é trabalho deste plano (B-13) |
| Logger do web (`pino` de browser), só no console do navegador | `web/src/shared/logging/logger.ts` | ligar `debug` neste navegador em execução — só o app tem a tela que liga |
| `diag.ping` — o smoke mais barato do gateway | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#diag-é-diagnóstico-não-sessão) | virar um item da saúde, com ida e volta medida |
| `DatabaseProbe` (`SELECT 1`) e `scripts/doctor.mjs` | `backend/src/application/health`, `scripts/` | uma saúde de **execução** — o doctor verifica o ambiente de desenvolvimento, não a instalação ligada ([D-13](decisions.md#d-13--rodar-o-doctor-no-servidor)) |

Três escolhas dão a forma do plano:

- **o que se lê é um buffer em memória, e o stdout continua sendo o registro durável**
  ([D-03](decisions.md#d-03--onde-os-logs-ficam-para-serem-lidos)). É o que mantém o stdout como a
  fonte da verdade e evita uma tabela que receberia todo o I/O em `debug`;
- **log de backend é de quem opera a instalação**
  ([D-02](decisions.md#d-02--quem-vê-log-de-backend-o-papel-de-operador)). Uma linha de backend em
  `debug` carrega prompt truncado e input de tool de **qualquer** usuário — mostrá-la a todos seria
  a tela virando o vazamento que a redação existe para impedir. Como o visualizador só mostra o
  backend, ele inteiro é do operador;
- **acompanhar ao vivo é HTTP com cursor e espera longa, não um stream novo no WebSocket**
  ([D-04](decisions.md#d-04--seguir-ao-vivo-long-poll-http-stream-no-websocket-ou-sse)). O contrato
  WS não muda — por isso `pnpm test:e2e:mobile` não entra no critério.

---

## Escopo

### Entra

| | |
|---|---|
| Módulo `diagnostics` documentado (e os `diag`/`health` que o catálogo omite), papel de operador, contratos HTTP de logs e saúde, trilha e rotas | F0 |
| Buffer de logs em memória alimentado pelo `pino` sem laço, consulta com redação na leitura e só para o operador, rastreio por `traceId`, exportação, nível do backend mudado em execução com prazo | F1 |
| Tela de logs: lista densa virtualizada, JSON expansível, filtros na URL, seguir ao vivo, cadeia do `traceId`, "ver nos logs" a partir de todo erro do app, nível do backend e `debug` neste navegador, exportar, menu de contexto, palette, ajuda | F2 |
| Saúde: executor de checks com prazo e cache, checks do núcleo (processo, banco e migrations, allowlist, sessões e memória, push, identidade, gateway, buffer de logs, disco, trilha), um item por motor pelo `describe()`, os checks do Claude e a sonda ativa registrados pela extensão dele, recursos de outros planos por registro, tela com explicação e "o que fazer" por item, ping, "Este navegador", relatório de diagnóstico, ajuda | F3 |
| E2E: redação e isolamento pela porta do usuário, tail sob carga, rastreio, nível com prazo, checks falhando um a um traduzidos, celular e axe | F4 |

### Não entra

- **Log do web e do app.** Fica no console de cada um: o envio ao backend saiu do
  [plano 05](../05-hardening-operations/progress.md#escopo-reduzido-ou-adiado) em 2026-09-27, por
  decisão do usuário, e não volta por aqui. O visualizador mostra só as linhas do backend; o
  `traceId` é o que leva de um erro na tela até elas ([D-01](decisions.md#d-01--a-fronteira-com-o-plano-05--f1)).
- **A tela de diagnóstico do app Flutter.** Existe (plano 05 · B-11) e fica como está: o app não
  ganha as telas novas (princípio global do roteiro); o `debug` que ela liga vai para o console do
  aparelho.
- **Log durável consultável (arquivo rotativo, tabela, journald).** O buffer vive até o reinício e a
  tela diz isso; guardar em disco na instalação real é do [plano 19](../19-distribution/README.md),
  que decide como o backend roda como serviço ([D-03](decisions.md#d-03--onde-os-logs-ficam-para-serem-lidos)).
- **Métrica e painel** (Prometheus, séries temporais). Mesmo motivo do plano 05: log estruturado e
  saúde respondem às perguntas que temos; a tela de saúde é o **estado agora**, não um histórico.
- **Busca por expressão regular no servidor.** Regex do usuário no event loop que roda as sessões é
  ReDoS à espera de acontecer; a busca é por termos, com exclusão, como o filtro do painel Output do
  VS Code ([D-05](decisions.md#d-05--busca-termos-literais-ou-regex)).
- **Diagnóstico completo da instalação do Claude** (conta, plano, modelos). É do
  [plano 13](../13-claude-settings/README.md), na extensão `engines/claude/`; a saúde mostra o mínimo
  e usa o dele quando existir ([D-15](decisions.md#d-15--a-fronteira-com-os-planos-07-12-e-13)).
- **Editor de atalhos.** Saiu do roteiro por decisão do usuário; os atalhos desta tela entram na
  command palette do [plano 06](../06-workbench/README.md).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | módulo, operador, contratos HTTP, trilha e rotas documentados | B-01…B-07 | 🔲 |
| F1 | [Backend dos logs](F1-log-backend.md) | buffer, tee sem laço, consulta redigida e só do operador, rastreio, exportação, nível em execução | B-08…B-10, B-12…B-15 | 🔲 |
| F2 | [Tela de logs](F2-logs-screen.md) | visualizador, filtros, tail, cadeia do trace, níveis, exportar, ajuda | B-16…B-23 | 🔲 |
| F3 | [Tela de saúde](F3-health-screen.md) | checks com prazo e cache, um item por motor, sonda do Claude pela extensão, tela explicada, ping, relatório, ajuda | B-24…B-31 | 🔲 |
| F4 | [E2E](F4-e2e.md) | redação, isolamento, carga e saúde pela porta do usuário | B-32…B-35 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O catálogo de módulos descreve quem guarda e quem lê log | B-01 | [backend/03-modules](../../architecture/backend/03-modules.md#o-catálogo) | S-01 |
| Erros e motivos de check novos existem no catálogo, traduzidos, antes do código | B-06 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-02, S-03 |
| As telas têm rota própria e o link reproduz a vista | B-07, B-16, B-18 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-04, S-05, S-63 |
| Log de backend só para o operador, configurado localmente, nunca por claim do provedor | B-02, B-12 | [08-authentication](../../architecture/shared/08-authentication.md#identidade-e-o-modelo-local) | S-06…S-11 |
| O buffer é limitado, conta o que perdeu e não deixa um `debug` expulsar o último `error` | B-03, B-08, B-09 | [03-logging](../../architecture/shared/03-logging.md) | S-12…S-22 |
| Ler os logs não altera o stdout, não trava quem loga e não gera logs que se leem | B-10 | [03-logging](../../architecture/shared/03-logging.md#a-regra-do-io-em-debug) | S-23…S-25 |
| **Um segredo nunca aparece no visualizador** — consulta, rastreio, facetas, exportação, tail | B-13, B-14, B-17 | [03-logging](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log) | S-31…S-34, S-60, S-117 |
| **Quem não é operador não lê linha nenhuma** — consulta, facetas, rastreio, exportação, tail | B-13, B-14 | [08-authentication](../../architecture/shared/08-authentication.md#identidade-e-o-modelo-local) | S-35, S-38, S-118 |
| O `traceId` leva de um erro na tela à cadeia do backend, com a operação pendurada visível | B-13, B-20 | [03-logging](../../architecture/shared/03-logging.md#traceid--como-propaga) | S-39, S-40, S-72, S-73, S-124 |
| Consulta, long-poll e exportação com fronteiras, ritmo e trilha | B-04, B-13, B-14 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-41…S-50 |
| **Tail sob carga** acompanha sem perder o que o buffer tem e sem martelar | B-13, B-19 | [03-logging](../../architecture/shared/03-logging.md) | S-45, S-46, S-66…S-71, S-119 |
| Nível do backend muda em execução, com prazo, auditado, e volta sozinho | B-15, B-21 | [03-logging](../../architecture/shared/03-logging.md#níveis--quando-usar-cada-um) | S-51…S-57, S-74, S-120 |
| `debug` neste navegador, com prazo | B-21 | [web/05-logging](../../architecture/web/05-logging.md#configuração) | S-75 |
| A tela de logs é densa, legível, completa nos quatro estados e explica a quem não é operador por que não lê | B-17, B-18, B-22 | [web/03-ui-system](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-58…S-65, S-77…S-79 |
| Ajuda, atalhos, foco e axe na tela de logs | B-23 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-80…S-83 |
| Checks com prazo, sem travar uns aos outros, com cache e ritmo | B-24, B-28 | [backend/03-modules](../../architecture/backend/03-modules.md) | S-84…S-89 |
| **Checks falhando um a um, com explicação traduzida e o que fazer** | B-25, B-26, B-29 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-90…S-101, S-109, S-121 |
| O estado de cada motor vem do `describe()`; a sonda ativa do Claude, registrada pela extensão, custa, e por isso é do operador, única e auditada | B-26 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md) | S-102…S-104 |
| Recursos de outros planos aparecem só quando existem | B-27 | [backend/03-modules](../../architecture/backend/03-modules.md) | S-105 |
| O `GET /health` público não vaza o relatório; o detalhado é autenticado e filtrado por papel | B-28 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-106…S-108 |
| A tela de saúde explica, resume, mede o ping e sobrevive ao backend fora | B-29, B-30, B-31 | [web/03-ui-system](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-81, S-109…S-116, S-122, S-123 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/http/    as rotas novas de /diagnostics/* e a da sonda (28 · D-09)

backend/src/
├── domain/diagnostics/            LogRecord · LogFilter (níveis, termos, período) · LogCursor (época + seq)
│                                  HealthResult · HealthStatus · agregação
├── application/diagnostics/
│   ├── ports/                     log-store · log-level-control · health-check · resource-gauge · operator-policy
│   ├── query-logs.use-case        consulta, facetas, rastreio — operador e redação por forma na leitura
│   ├── export-logs.use-case
│   ├── change-log-level.use-case  prazo, volta sozinho, trilha
│   └── run-health-checks.use-case executor: paralelo, prazo por check, cache, execução única
├── adapter/
│   ├── inbound/http/diagnostics/  GET /diagnostics/logs · /facets · /traces/:id · /export · /capabilities
│   │                              GET|PUT|DELETE /diagnostics/log-level · GET /diagnostics/health · POST …/run
│   ├── inbound/http/engines/claude/diagnostics/   POST /engines/claude/diagnostics/probe (a sonda da extensão)
│   └── outbound/
│       ├── logging/               in-memory-log-store (ring + reserva warn+) · pino-log-level-control
│       ├── health/                um adapter por check do núcleo, e o check "motores" sobre o EngineRegistry
│       └── engines/claude/health/ o HealthCheck do Claude e a sonda, registrados pela extensão
├── infrastructure/logging/        o tee: stdout + store, no destino do pino
└── infrastructure/database/migrations/   kinds `diagnostics.*` e `engine.diagnosticsProbed` em audit_events (migration nova)

web/src/features/diagnostics/
├── services/ · hooks/             logs, tail, facetas, rastreio, nível, capacidades, saúde, ping
└── components/                    LogsScreen · LogList · LogLine · LogFilters · TraceDrawer · LogLevelControl
                                   HealthScreen · HealthCheckCard · BrowserPanel · PingCheck · DiagnosticReport
web/src/engines/claude/diagnostics/   a ação da sonda e a ajuda própria, registradas pelo web/src/app/engines.ts
web/src/shared/components/         TraceLink (o "ver nos logs" de todo estado de erro)
web/src/shared/logging/            nível do navegador em execução

e2e/specs/diagnostics/             logs · redação · isolamento · tail · saúde
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **A tela vira o vazamento**: uma linha de backend em `debug` carrega prompt (truncado em 2 KB) e input de tool; o que era stdout local passa a atravessar a rede até um navegador ou um celular | **aberto** — redação por forma na leitura (B-13), backend só para operador ([D-02](decisions.md#d-02--quem-vê-log-de-backend-o-papel-de-operador)), nenhuma rota que devolva a linha antes da redação (S-34), e a ajuda diz o que o operador vê |
| R-02 | **Laço de amplificação**: a resposta da consulta é logada em `debug` com payload, entra no buffer, é lida pelo próximo poll, que a loga de novo | **aberto** — as rotas `diagnostics` logam só metadados (B-10, S-25); o tail tem teto de página e de concorrência (S-44, S-45) |
| R-03 | O append no buffer está no caminho de **toda** linha do backend; se for lento, a sessão do Claude espera o log | **aberto** — append síncrono, sem I/O, custo constante, e falha do store nunca chega ao logger (S-24, S-46) |
| R-04 | O buffer some no reinício — justamente depois de um crash, quando mais se quer ler | **aberto**, declarado — a tela e a ajuda dizem "desde o reinício às HH:MM" e onde está o registro durável; persistir é do [plano 19](../19-distribution/README.md) ([D-03](decisions.md#d-03--onde-os-logs-ficam-para-serem-lidos)) |
| R-05 | Nível elevado esquecido é vazamento lento e disco cheio de quem coleta o stdout | **aberto** — todo nível elevado tem prazo e volta sozinho, inclusive no reinício ([D-06](decisions.md#d-06--mudar-o-nível-do-backend-em-execução), [D-12](decisions.md#d-12--debug-neste-navegador-prazo-e-alcance)) |
| R-06 | A sonda ativa do Claude gasta cota do plano de quem é dono da máquina | **aberto** — só operador, clique explícito com aviso, uma de cada vez, auditada ([D-14](decisions.md#d-14--a-sonda-do-claude-o-que-ela-faz-e-quem-a-dispara)) |
| R-07 | Linha do cliente abaixo do `LOG_LEVEL` do backend é descartada hoje pelo `pino` — o `debug` que o app liga não chega a lugar nenhum com o backend em `info` | **encerrado** em 2026-09-27 — as linhas do cliente não chegam mais ao backend ([D-11](decisions.md#d-11--o-nível-das-linhas-do-cliente-contra-o-log_level-do-backend), descartada) |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. **Feche as decisões da F0** ([decisions.md](decisions.md)) antes de começar a fase — a D-02 muda
   o que o contrato promete.
3. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`. Vermelho → corrige e **reinicia do
   primeiro portão**. Registre o ciclo em [progress.md](progress.md).
4. Três ciclos sem progresso no mesmo portão → **pare e escale**.
