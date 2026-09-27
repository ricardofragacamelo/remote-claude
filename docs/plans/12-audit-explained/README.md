# Plano 12 — Auditoria explicada

**Objetivo:** que a trilha conte, em palavras e com todos os detalhes, **o que aconteceu** em cada
invocação — pedido, decisão, resultado —, em qual pasta e conversa, e explique na própria tela o que ela
é.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

**Depende de:** [plano 03](../03-rules-and-audit/README.md) (a trilha consultável e a retenção, que
continuam valendo) · [plano 06](../06-workbench/README.md) (navegação global, moldura de tela com
propósito e ajuda, command palette) · [plano 04](../04-transcript-and-resume/README.md) (o título e o
ponto da conversa vêm do `transcript`). O [plano 07](../07-explorer-and-editor/README.md) e os seguintes
acrescentam tipos de evento que esta tela mostra quando existirem — **não** depende deles. O
[plano 08](../08-claude-panel/README.md) e o [plano 13](../13-rules-management/README.md) melhoram dois
vínculos (diff completo, `evaluate`), e a tela funciona sem eles.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O usuário abriu `/audit` e achou "muito pobre, tem que ter mais detalhes, ajuda, o que faz, explicação
do que aconteceu". Olhando a tela e o código, ele tem razão por cinco motivos concretos:

| O que existe hoje | O que isso custa |
|---|---|
| Filtros de texto cru: o id da sessão digitado à mão, o nome técnico da tool | ninguém sabe o `sessionId` de nada; o filtro existe e não serve |
| A mesma invocação em dois cartões (`recorded` e `allowed`), sem ligação visível | a pergunta "o que aconteceu com este comando?" exige juntar cartões de cabeça |
| O comando escondido num expansor; o cartão diz "Run a shell command · Recorded" | o que rodou — a única coisa que importa — é o que menos aparece |
| **O desfecho não é gravado**: executou, falhou, foi interrompida, quanto demorou | a trilha sabe o que se pretendia e quem deixou, e não sabe o que aconteceu |
| Pasta, conversa e fatos de conta (`audit_events`) não aparecem | "concedeu a regra às 10:02 → às 10:15 rodou sem perguntar" não se lê em lugar nenhum |

O [plano 03](../03-rules-and-audit/README.md) fez a trilha **confiável**: append-only por trigger,
piso de 2160 horas no banco, purga que se registra na mesma instrução que apaga, leitura escopada,
`Read` que nunca devolve conteúdo. Este plano a faz **legível** — e a regra do plano inteiro é que
nenhuma dessas garantias afrouxa. Por isso o desfecho mora na mesma tabela, pelas mesmas triggers
([D-01](decisions.md#d-01--onde-mora-o-desfecho)); por isso a pasta e a conversa são gravadas com a
entrada, e não juntadas na leitura ([D-04](decisions.md#d-04--pasta-conversa-turno-e-título)); por isso o
título da conversa é lido na hora, e nunca copiado para o banco.

E por isso a invocação vira **unidade no backend** ([D-02](decisions.md#d-02--a-invocação-como-unidade)):
agrupar no cliente corta invocações ao meio na paginação e torna impossível filtrar "só as que falharam".

---

## Escopo

### Entra

| | |
|---|---|
| O desfecho medido (quais hooks disparam, com que campos) e o contrato escrito nos documentos normativos | F0 |
| Códigos de erro novos e o contrato dos tipos de evento que outros planos acrescentam | F0 |
| Gravar o desfecho (status, duração, código de saída — nunca a saída) e o vínculo pasta/conversa/turno/aparelho | F1 |
| A invocação como unidade, a linha do tempo com os eventos, resumo, facetas, detalhe, endereço permanente, busca no input | F1 |
| A tela: cabeçalho com propósito e ajuda, resumo do período, lista densa agrupável, filtros por seletor, detalhe com a história em frases | F2 |
| Visões salvas, entradas novas com a tela aberta, teclado, menu de contexto, command palette, celular | F2 |
| Eventos explicados por tipo; ir ao ponto exato da conversa; diff da invocação; comparar com a regra | F3 |
| Exportar o recorte (com ADR, auditado); "ver na trilha" a partir do workbench e das outras telas | F3 |
| E2E da tela, dos eventos e da exportação, e as garantias do plano 03 provadas de novo | F4 |

### Não entra

- **Guardar a saída das tools** (`tool_response`, `stderr`). A trilha guarda o que foi pedido, quem
  deixou e como terminou; a saída carrega conteúdo de arquivo e segredo, e a regra do
  [backend/03 · audit](../../architecture/backend/03-modules.md#audit) é não guardar conteúdo. Ver a
  saída de uma tool é do painel do [plano 08](../08-claude-panel/README.md), enquanto a sessão existe.
- **Exportação agendada ou para fora da máquina automaticamente** — recusada na
  [D-14](decisions.md#d-14--exportar): a história inteira da máquina saindo sozinha, sem ninguém olhando,
  é o oposto do que a trilha garante.
- **Alertas e relatórios sobre a trilha** ("algo incomum rodou") — continua fora pelo motivo do plano 03:
  precisa de linha de base do que é normal.
- **Ordenar por duração, tool ou pasta** — a paginação por keyset da
  [D-06 do plano 03](../03-rules-and-audit/decisions.md#d-06--paginar-sobre-o-tempo) não admite; o que o
  usuário quer com isso é resolvido por agrupar e por "ir para data" ([D-11](decisions.md#d-11--ordenar-por-outra-coisa)).
- **Criar e ajustar regras** — [plano 13](../13-rules-management/README.md); daqui a regra se **abre** e
  se **compara**.
- **Gerir aparelhos** — [plano 15](../15-devices/README.md); daqui o aparelho que respondeu se abre.
- **Os logs do sistema e o `traceId` navegável** — [plano 16](../16-logs-and-diagnostics/README.md); daqui
  o `traceId` se copia, e leva à tela de logs quando ela existir.
- **O app Flutter ganhar a tela de auditoria** — fora dos planos 06–16; o web responde no celular.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | o desfecho medido e o contrato nos documentos normativos | B-01…B-06 | 🔲 |
| F1 | [Backend da trilha](F1-trail-backend.md) | desfecho e vínculo gravados; invocação, linha do tempo, resumo, facetas, detalhe e busca | B-07…B-15 | 🔲 |
| F2 | [Tela da trilha](F2-trail-screen.md) | a tela que conta a história, com filtros por seletor, visões e ajuda | B-16…B-25 | 🔲 |
| F3 | [Eventos e exportação](F3-events-and-export.md) | eventos explicados, conversa, diff, regra, exportação e "ver na trilha" | B-26…B-34 | 🔲 |
| F4 | [E2E](F4-e2e.md) | a trilha explicada pela porta do usuário, e as garantias do plano 03 de novo | B-35…B-38 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O desfecho é medido antes de ser desenhado | B-01 | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | S-01, S-02 |
| O contrato está nos documentos normativos antes do código | B-02, B-03, B-05 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit), [web/03](../../architecture/web/03-ui-system.md#trilha-de-auditoria) | S-27, S-42, S-56, S-76 |
| Todo erro novo tem código, status com significado e mensagem que diz o que fazer | B-04 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-03, S-04, S-58, S-59, S-100, S-101, S-104, S-114, S-128 |
| Tipo de evento novo de outro plano nunca aparece sem explicação | B-06, B-26 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit) | S-05, S-46, S-115…S-118 |
| O desfecho é gravado — status, duração, código de saída — e **nunca** a saída | B-08 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit) | S-06…S-13, S-17…S-19 |
| O append-only, o piso de 2160 horas e a purga continuam valendo depois da migration | B-07, B-38 | [backend/05 · a trilha](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) | S-14…S-16, S-20, S-151 |
| Cada entrada diz a pasta, a conversa, o turno e o aparelho — gravados com ela, o título nunca | B-09 | [backend/05 · a trilha](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) | S-21…S-26 |
| A invocação é uma unidade, com estado derivado e paginação que não pula nem repete | B-10 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit) | S-27…S-37, S-39, S-40 |
| A trilha de outra pessoa continua fora de alcance, em toda rota nova | B-10, B-13, B-31, B-38 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-38, S-47, S-57, S-87, S-102, S-134, S-150 |
| Um `Read` nunca devolve conteúdo — na lista, na busca e na exportação | B-10, B-14, B-31 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit) | S-41, S-65, S-131 |
| Eventos de conta e invocações numa linha do tempo só | B-11 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit) | S-42…S-48 |
| O período se resume em números que batem com a lista, e os seletores têm de onde escolher | B-12 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit) | S-49…S-55 |
| Toda invocação tem um endereço que sobrevive — e diz quando a retenção a levou | B-13, B-22 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#tabela-de-status-http) | S-56…S-62, S-94…S-97 |
| Busca de texto em todo o input, com índice medido | B-14 | [backend/05](../../architecture/backend/05-persistence.md#convenções-de-schema) | S-63…S-67 |
| Rotas novas logadas em `debug`, isoladas no lado de leitura, sem quebrar a rota antiga | B-15 | [03-logging](../../architecture/shared/03-logging.md#a-regra-do-io-em-debug) | S-68…S-71 |
| Tools com nome de gente, ícone e o comando à vista — MCP inclusive | B-16 | [02-i18n](../../architecture/shared/02-i18n.md) | S-72…S-75 |
| A tela é um link: filtros, agrupamento e item aberto na URL | B-17 | [web/04](../../architecture/web/04-state-and-data.md#a-url-é-estado) | S-76…S-78, S-89 |
| Cabeçalho com propósito, resumo que filtra, presets de período | B-18 | [web/03](../../architecture/web/03-ui-system.md#trilha-de-auditoria) | S-79, S-80 |
| Lista densa, agrupável, de teclado, com menu de contexto e sem scroll horizontal | B-19 | [web/03](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-81…S-83, S-85, S-86, S-90 |
| Nenhum filtro pede um id | B-20 | [web/03](../../architecture/web/03-ui-system.md#trilha-de-auditoria) | S-84, S-87, S-88 |
| O detalhe conta a história em frases e diz o que ela significa | B-21 | [web/03](../../architecture/web/03-ui-system.md#trilha-de-auditoria) | S-91…S-93, S-98 |
| Visões salvas | B-23 | [web/04](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora) | S-99…S-105 |
| A tela aberta fica sabendo das entradas novas sem perder o lugar | B-24 | [web/04](../../architecture/web/04-state-and-data.md) | S-106…S-108 |
| Ajuda de verdade, tooltips, atalhos, estados vazios que ensinam, acessibilidade | B-25, B-34 | [web/03 · acessibilidade](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-109…S-114, S-139 |
| Da invocação ao ponto exato da conversa | B-27 | [backend/03 · transcript](../../architecture/backend/03-modules.md#transcript) | S-119…S-122 |
| O diff e a regra que respondeu, a partir da invocação | B-28, B-29 | [backend/03 · permission](../../architecture/backend/03-modules.md#permission) | S-123…S-126 |
| Exportar o recorte sob as regras da tela, com ADR, teto e a exportação na própria trilha | B-30…B-32 | [00-decisions](../../architecture/shared/00-decisions.md) | S-127…S-136 |
| "Ver na trilha" a partir do workbench, das regras e dos aparelhos | B-33 | [web/04](../../architecture/web/04-state-and-data.md#a-url-é-estado) | S-137, S-138 |
| O ciclo inteiro provado pela porta do usuário | B-35…B-38 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-140…S-151 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
backend/src/
├── domain/audit/                     desfecho (outcome), estado da invocação, explicação por kind
├── application/audit/
│   ├── record-tool-outcome.use-case.ts
│   ├── query-audit-timeline.use-case.ts · audit-invocation.use-case.ts · summary · facets · export
│   └── ports/                        AuditInvocationReader · AuditEventReader · LiveSessionLookup
│                                     · ConversationTitleLookup · (AuditViewStore, se D-10 = servidor)
├── adapter/
│   ├── inbound/http/audit/           /audit/timeline · invocations/:id · events/:id · summary
│   │                                 · facets · export · views   (e /audit-entries, intacto)
│   └── outbound/
│       ├── claude/session-runner.ts  PostToolUse · PostToolUseFailure (· PermissionDenied)
│       └── persistence/audit/        leitores novos
└── infrastructure/database/migrations/   uma migration nova: desfecho, vínculo, audit.exported, índices

web/src/
├── shared/tools/                     catálogo: nome amigável, ícone, campo principal
├── features/audit/{components,hooks,services,types}/
│                                     resumo · lista · filtros · detalhe · história · visões · exportar
│                                     · registro de tipos de evento
└── app/                              /audit · /audit/invocations/$invocationId · /audit/events/$eventId

e2e/{scenarios,specs}/                audit-outcomes · audit-screen · audit-events-export
docs/architecture/                    backend/03 · backend/05 · web/03 · web/04 · shared/04 · ADR-019
docs/discovery/                       a seção do spike de desfecho
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **A migration toca a tabela mais protegida do produto.** Um `ADD COLUMN` com default, um `UPDATE` de preenchimento ou uma função de trigger reescrita afrouxam o que o plano 03 fechou | **aberto** — mitigação: só colunas anuláveis sem default, nenhum `UPDATE`, triggers intactas, e S-14…S-16 provando no banco (não no papel) que append-only, piso e purga continuam iguais |
| R-02 | **O desfecho pode vazar conteúdo.** `tool_response` tem o arquivo lido; o `error` do `Bash` tem o `stderr`, com o segredo que estiver nele | **aberto** — mitigação: grava só status, duração e código de saída ([D-01](decisions.md#d-01--onde-mora-o-desfecho)); o código sai de um prefixo exato e o texto é descartado; S-10 planta um segredo e o procura no banco, no log e na resposta |
| R-03 | **A exportação é superfície nova de vazamento** — o input de um `Write` é um arquivo inteiro, e um CSV aberto numa planilha executa fórmula | **aberto** — ADR antes da task (B-30), teto, neutralização de CSV (S-130), `Read` pela lista de permissão (S-131), e a própria exportação gravada na trilha antes do primeiro byte (S-129) — [D-14](decisions.md#d-14--exportar) |
| R-04 | **Consultas de agregação sobre uma tabela que só cresce** (agrupar por invocação, resumo, busca de texto) funcionam no primeiro mês e param no sexto | **aberto** — plano de execução verificado com 100 mil linhas em cada combinação de filtro (S-36, S-67), índices desenhados com a consulta na mesma migration, busca medida antes de escolher o índice ([D-08](decisions.md#d-08--a-busca-no-input)) |
| R-05 | **O título da conversa é o primeiro prompt** — copiá-lo para o banco "para ficar rápido" é a tentação óbvia, e fura a regra do plano 04 | **aberto** — lido na hora pelo `transcript`, com o cache que ele já tem; `lint:arch` reprova a cópia (S-26); falta de título degrada, não falha (S-52) |
| R-06 | **"Não concluiu" pode ser dito errado** — uma tool longa que ainda roda, lida como morta | **aberto** — o estado vem da sessão viva, perguntada na hora, não de um tempo limite ([D-05](decisions.md#d-05--o-que-uma-invocação-sem-desfecho-quer-dizer)); S-32 prova os dois lados |
| R-07 | **Os planos 06, 08, 13 e 15 são escritos em paralelo** — a moldura de tela, o painel de conversa, o `evaluate` e o histórico de aparelho podem chegar depois desta fase | **aberto** — cada vínculo tem um caminho que funciona sem o outro plano (histórico no lugar do painel, comparação local no lugar do `evaluate`, "pelo celular" no lugar do link); a moldura do 06 é dependência declarada da F2 |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
