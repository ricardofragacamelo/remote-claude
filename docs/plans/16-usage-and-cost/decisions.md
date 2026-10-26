# Plano 16 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> Os fatos citados abaixo foram lidos no `sdk.d.ts` do `@anthropic-ai/claude-agent-sdk` 0.3.277 e
> no código em 2026-09-26. Os gaps marcados "medir" pedem execução contra o CLI real, na B-02.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | De onde sai o custo de um turno, e com que precisão ele é mostrado | se a soma dos `costUSD` de `modelUsage` bate com `total_cost_usd` em sessões reais com subagente e compactação (medir). Restrição do [28](../28-agent-neutral-core/README.md): o cálculo mora no adapter do Claude, que entrega o delta canônico, e a linha de base por conversa é chaveada por `conversation { engine, id }` | B-02, B-06 | — | 🔲 |
| D-02 | Linha de base da `query()` retomada ou bifurcada, e como tratar `/clear` e resultado zerado | se o primeiro `result` de uma retomada in-place carrega exatamente o último acumulado que gravamos; o que o fork de conversa externa carrega (medir). Restrição do [28](../28-agent-neutral-core/README.md): a linha de base por conversa é chaveada por `conversation { engine, id }` (não pelo `claudeSessionId`), e o núcleo a guarda opaca (`engine_baseline`) | B-07 | — | 🔲 |
| D-03 | Como o dinheiro é representado no domínio, no banco e no fio | resolução mínima que não perde turno de Haiku; custo de `numeric` nas agregações | B-04, B-06 | — | 🔲 |
| D-04 | Moeda: só USD, ou conversão | se há demanda real de ver em real; de onde viria a taxa | B-13, B-15 | — | 🔲 |
| D-05 | Fuso das agregações e dos períodos de orçamento, e a que dia pertence um turno | onde a preferência mora quando nenhum cliente está aberto (o orçamento vira à meia-noite sem navegador) | B-04, B-06, B-09, B-13 | — | 🔲 |
| D-16 | Ajuste às diretivas do plano 28: o que é núcleo e o que é da extensão do Claude neste plano | — (as normas estão no [plano 28](../28-agent-neutral-core/README.md) e na [discovery 10](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#9-planos-afetados)) | B-02…B-07, B-11, B-15, B-19, B-21…B-23, B-26 | 2026-10-10 · ajuste às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico), pedido do usuário: rotas por `conversation { engine, id }` (B-03, B-05); `engine` + `conversation_id` no lugar de `claude_session_id`, tokens nas categorias canônicas, `outcome` canônico do 27 em vez do subtipo do SDK, `cost_usd`/`price_basis` só com `cost: 'usd'`, `engine_baseline` opaco (B-04); `modelUsage`/`total_cost_usd` e o `turnDelta` ficam no adapter e no anel do Claude, que emitem o delta canônico (B-02, B-06, B-07); os limites da conta (`rate_limit_event`, `RateLimitStore`, `claude_rate_limits`, `/engines/claude/usage/rate-limits`, o painel e o aviso de assinatura) são da extensão `engines/claude/` (B-11, B-15, B-21, B-22); textos neutros com `{agent}` e `engines.claude.usage.*` (B-05, B-15, B-21, B-22); orçamento em US$ só para motor com `cost: 'usd'`, senão em tokens (B-23, B-26). 2026-10-10 (revisão dos gaps do 28): o usuário pôs `reasoningTokens?` e `webSearches?` no `usage` canônico ([28 · D-17](../28-agent-neutral-core/decisions.md#f4--modos-esforço-uso-e-blocos)), e o corte condicional de pensamento e buscas web **não vale** — viram as colunas anuláveis `reasoning_tokens` e `web_searches` (B-04) e categorias do `TokenCounts` (B-06), vindas do `usage` canônico; e decidiu que toda rota REST tem tipo gerado ([28 · D-09](../28-agent-neutral-core/decisions.md#f1--porta-de-motor-e-conversa)) — as `/usage/*` e a `/engines/claude/usage/rate-limits` da extensão nascem em `packages/contracts/schema/http/` (B-03). Nenhum kind de auditoria deste plano tem nome de motor: são os `usage.budget*` | ✅ |

### D-01 — de onde sai o custo, e quão preciso ele é

O `result` do SDK traz três coisas parecidas, e só uma serve:

- `total_cost_usd` — **acumulado por `query()`**, em USD, "uma estimativa, não uma fatura". Hoje é
  publicado como custo do turno, o que está errado a partir do segundo turno (R-01 do plano);
- `usage` — tokens **só do loop principal**, e por turno. Deixa de fora subagentes, sidechains e
  compactação. O próprio SDK diz: "prefira `modelUsage` para contabilidade";
- `modelUsage` — por modelo, **acumulado**, com tudo que passou pelo pipeline (principal,
  subagentes, compactação), cada entrada com tokens por tipo, `webSearchRequests`, `costUSD` e
  `costBasis` (`list`, `managed` — preço contratado via managed settings —, ou `unknown`).

Opções: (a) diferenciar `modelUsage` por modelo entre `result` consecutivos; (b) diferenciar só
`total_cost_usd` e usar `usage` para tokens; (c) tabela de preços nossa, multiplicando tokens —
duplicaria a do CLI, envelheceria a cada modelo novo e ignoraria o preço contratado.

**Recomendação:** (a). O custo e os tokens do turno são a diferença de `modelUsage`, modelo a
modelo; `total_cost_usd` diferenciado serve de **conferência** (divergência acima de 1 µUSD é
`warn`, não bloqueio). Nunca uma tabela de preços nossa. `costBasis` é gravado por turno e por
modelo, e a tela diz quando o custo é chute (`unknown`). Conta de assinatura (Pro/Max) mostra o
número como "equivalente a preço de lista" — ela não paga por token. Precisão de exibição: 2 casas
a partir de 1 dólar, 4 abaixo, e "< US$ 0,01" para gasto real que arredondaria a zero.

### D-02 — linha de base na retomada, e os resets do acumulado

O comentário do SDK diz que uma sessão retomada ou bifurcada "continua do total que o transcript
salvou" (o primeiro `result` já traz os turnos anteriores), que `/clear` zera o acumulado no meio da
sessão e que resultado de crash "pode vir zerado". Diferença ingênua cobraria de novo todos os turnos
anteriores a cada retomada.

Opções: (a) linha de base por conversa, guardada por nós: retomada **in-place** (conversa nossa)
parte do último acumulado gravado para aquela `conversation { engine, id }`; **fork** de conversa externa não tem
base conhecida — o primeiro turno grava os tokens do `usage` do turno e custo desconhecido (base
`baselineUnknown`), e os seguintes diferenciam dele; (b) perguntar o total antes do primeiro prompt
com `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` — o nome diz tudo; (c) aceitar
a supercontagem.

**Recomendação:** (a), com duas regras de reset no domínio: acumulado **menor** que o anterior é
`reset` (delta = acumulado atual); `result` com `is_error` e tudo zerado é `zeroed` (delta zero, base
mantida). A conversa nossa continuada no VS Code entre duas retomadas nossas faz o primeiro turno
absorver o gasto de lá — o acumulado maior que o esperado em mais que o `usage` do turno marca a base
como `baselineUnknown` também. Gap a medir na B-02, com fixtures reais: retomada in-place, fork de
conversa externa e `/clear`.

**Implementação parcial, fora do ciclo deste plano (2026-10-25):** o sintoma de D-02 — turnos de uma
conversa retomada somando o acumulado bruto do `query()`, não o gasto do turno — apareceu em uso real
(uma sessão de horas, `sicredi-clm-pd`) e foi corrigido em `SdkMessageMapper.turnCostOf()`
(`backend/src/adapter/outbound/engines/claude/sdk-message.mapper.ts`): uma linha de base **em
memória, por instância do mapper** (uma por sessão viva do processo atual), nunca persistida. Cobre
exatamente a opção (a) para o **segundo turno em diante de um processo vivo**; não cobre: o primeiro
turno de uma retomada (continua cobrando o acumulado inteiro, como sempre foi — sem base conhecida
entre reinícios do backend), a distinção `reset`/`zeroed` desta decisão (aqui as duas colapsam: um
acumulado menor que o anterior cobra o valor absoluto, sem marcar qual dos dois motivos foi), e
`baselineUnknown`/fork de conversa externa (D-02 continua 🔲 por isso). Sem matriz de cenários
própria — os testes que existem (`sdk-message.mapper.spec.ts`) cobrem o delta normal e o caso do
acumulado caindo, não as fixtures reais de retomada/fork que a B-02 pede. **`pnpm verify`/`verify:full`
não foram rodados** para esta mudança — só `tsc`, `eslint` e os testes unitários do arquivo tocado.

### D-03 — representação do dinheiro

Um turno curto de Haiku custa frações de milésimo de dólar; um mês de Opus, centenas. Float soma
errado onde ninguém olha — o motivo pelo qual o `costUsd` já viaja como string.

Opções: (a) domínio em inteiro de **nano-dólares** (`bigint`), banco em `numeric(20,9)`, fio em
string decimal; (b) micro-dólares; (c) `numeric` direto no domínio via biblioteca decimal.

**Recomendação:** (a). O float do SDK é convertido **uma vez**, na borda, arredondando cada
acumulado a nano-dólar; como o delta é diferença de acumulados arredondados, a soma dos deltas é
exatamente o último acumulado (S-09). No fio, string com 6 casas, como o `costUsd` de hoje; os
agregados também.

### D-04 — moeda

O SDK só fala USD. Converter exige uma cotação.

Opções: (a) só USD, formatado pelo idioma; (b) USD e, **opcionalmente**, um valor aproximado em outra
moeda por uma taxa **informada pelo usuário**, com a data em que foi informada; (c) cotação online —
egresso de rede do backend e dado que envelhece sem aviso.

**Recomendação:** (b). USD é sempre o número principal e o único que orçamento e export usam; a taxa
manual é conveniência de leitura, rotulada "aproximado", guardada nas configurações de uso (B-13).
Cotação online não entra.

### D-05 — fuso, e a que dia pertence um turno

"Hoje" e "este mês" dependem do fuso; o orçamento diário vira à meia-noite **de alguém**, inclusive
sem navegador aberto.

Opções: (a) fuso do navegador a cada consulta; (b) preferência do usuário **no servidor**, iniciada
com o fuso do navegador na primeira visita e editável; (c) UTC para tudo.

**Recomendação:** (b). Consultas aceitam `tz` explícito (para o link reproduzir a tela), com a
preferência como padrão; os períodos de orçamento usam só a preferência. O turno pertence ao dia do
seu **fim** (`completed_at`), quando o custo passa a existir. Trocar o fuso vale para as consultas na
hora e para os orçamentos a partir do próximo período — sem reemitir alerta do período corrente
(S-64).

### D-16 — ajuste às diretivas do plano 28

O [plano 28](../28-agent-neutral-core/README.md) roda antes deste e muda **onde** e **em que forma**
ele constrói, não **o que** ele entrega. A linha de corte:

- **núcleo** (`usage`, `/usage/*`, `web/src/features/usage/`): tokens por turno e por modelo nas
  categorias do `usage` canônico, custo quando o motor anuncia `cost: 'usd'`, agregações, export,
  orçamentos, alertas; a conversa é sempre `conversation { engine, id }`; o desfecho é o `outcome`
  canônico do [27](../27-conversation-losses/README.md); nenhum nome de motor, de campo do SDK nem
  texto com "Claude" — o nome é `{agent}`;
- **adapter do Claude** (`adapter/outbound/engines/claude/`, anel `domain/engines/claude/usage/`): a
  semântica de `modelUsage`/`total_cost_usd`, o `turnDelta` com `reset`/`zeroed`/`baselineUnknown`, o
  subtipo do `result` → `outcome`; a linha de base volta a ele como `engine_baseline` opaco;
- **extensão do Claude** (`*/engines/claude/`, `/engines/claude/usage/rate-limits`,
  `web/src/engines/claude/usage/`, chaves `engines.claude.usage.*`): as janelas de limite da conta, o
  tipo de assinatura e as seções de ajuda que falam deles, registradas no slot da tela de uso e na
  gaveta pelo `web/src/app/engines/index.ts`;
- **orçamento**: em US$ só para motor com `cost: 'usd'`; para motor que só informa tokens, em tokens
  ([discovery 03 §6.8](../../discovery/03-multiplos-motores-de-agente.md#68-uso-e-custo)). Com o Claude
  como único motor, a tela só oferece US$.

Pensamento e buscas web, que o Claude informa, só ficam no esquema se o `usage` canônico do 28 · F4 os
tiver; senão saem do núcleo, registrado no [progresso](progress.md#escopo-reduzido-ou-adiado) — e
têm: o [28 · D-17](../28-agent-neutral-core/decisions.md#f4--modos-esforço-uso-e-blocos) os pôs no `usage` canônico como `reasoningTokens?` e `webSearches?`, e o corte não vale. D-01 e
D-02 continuam abertas — o ajuste só muda a chave da linha de base e onde o cálculo mora.

## F1 — Backend de uso

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | Agregar na leitura sobre as linhas por turno, ou manter um acumulado diário | tempo das agregações sobre volume realista, com o plano de execução (medir) | B-09 | — | 🔲 |
| D-07 | Por quanto tempo o uso por turno é guardado | se alguém compara com o mesmo mês do ano anterior | B-12 | — | 🔲 |
| D-08 | O que se mostra das sessões externas (VS Code, CLI) | — (os fatos estão no código e no SDK) | B-09, B-22 | — | 🔲 |
| D-09 | Limites de uso da conta: de onde vêm, como chegam ao web, e quem vê | se o `rate_limit_event` chega em toda conta de assinatura, e com que frequência (medir) | B-11, B-21 | — | 🔲 |
| D-10 | Formato, teto e trilha do export | tamanho típico de um ano de turnos de um usuário pesado | B-10, B-20 | — | 🔲 |

### D-06 — agregar na leitura, ou manter um acumulado

Um usuário pesado faz algumas centenas de turnos por dia — ordem de 10⁵ linhas por ano, poucas vezes
isso em linhas por modelo.

Opções: (a) agregar na leitura, com índices `(user_id, completed_at)` e
`(user_id, workspace_path, completed_at)`; (b) tabela de acumulado diário por usuário, pasta e
modelo, atualizada com `ON CONFLICT DO UPDATE` na gravação; (c) visão materializada.

**Recomendação:** (a), com o plano de execução verificado sobre 1 M turnos sintéticos como no plano
03 (S-44) e alvo de 200 ms por consulta no p95. Sem segunda fonte para divergir. Se a medição
reprovar, (b) entra como otimização, com cenário que prova igualdade entre as duas.

### D-07 — retenção

Opções: (a) 13 meses — cobre "o mesmo mês do ano passado"; (b) 90 dias, como a trilha; (c) para
sempre.

**Recomendação:** (a), configurável (`RC_USAGE_RETENTION_DAYS`, default 400), purgada por job
explícito como o `SnapshotPurgeJob`. Orçamentos e alertas do período corrente nunca são alcançados.

### D-08 — o que se mostra das sessões externas

O custo só aparece no `result` da `query()` que o gerou. Uma conversa do VS Code nunca passa por
aqui. Estimar a partir do transcript exigiria interpretar o JSONL (proibido — só as funções do SDK,
[backend/05](../../architecture/backend/05-persistence.md#o-que-vai-no-banco-e-o-que-não-vai)) e
uma tabela de preços nossa (recusada em D-01). A varredura de transcripts do `/usage` experimental
existe, mas é instável e aproximada.

Opções: (a) não entram, e a tela diz isso; (b) entram só os tokens, lidos do histórico; (c)
entram pela API experimental.

**Recomendação:** (a). A ajuda e o rodapé do resumo dizem: "conta só o que foi executado por aqui;
conversas do VS Code ou do terminal não aparecem". O fork que continua aqui uma conversa externa passa
a contar a partir do segundo turno (D-02).

### D-09 — limites de uso da conta: fonte, transporte e quem vê

O `rate_limit_event` (estável) traz, por janela (`five_hour`, `seven_day`, `seven_day_opus`,
`seven_day_sonnet`, `overage`…), `status` (`allowed`, `allowed_warning`, `rejected`), `utilization`,
`resetsAt` e o estado de overage. Hoje o mapper o descarta de propósito — publicá-lo como status
mentia que a sessão tinha parado (ciclo 26 do plano 01). As janelas completas só existem na API
experimental. A conta é **da máquina**: todos os usuários do produto usam o mesmo login do CLI.

Opções de fonte: (a) só o `rate_limit_event`; (b) também a API experimental. Transporte: (a) estado
guardado no backend e lido por `GET /engines/claude/usage/rate-limits` (rota da extensão do Claude,
[D-16](#d-16--ajuste-às-diretivas-do-plano-28)); (b) evento WS novo. Visibilidade: (a) todo
usuário autenticado, rotulado como da conta da máquina; (b) só quem gerou o evento.

**Recomendação:** fonte (a), transporte (a), visibilidade (a). O estado mais recente por janela é
guardado com o instante da observação (sobrevive a reinício); a tela mostra "visto às HH:MM" e
nunca finge tempo real. Sem evento WS novo — evita mudar o contrato nas três pontas por um painel.
Plano 05 recebe nota de que a exposição saiu daqui.

**Implementação parcial, fora do ciclo deste plano (2026-10-26):** a tela de uso do Claude foi pedida
direto, no web e no mobile, sem passar pelo ciclo deste plano — por isso só a parte de limites de uso
(este D-09) saiu; nada do resto da F1 (custo por turno, agregações, export, orçamentos da F3).

Fonte (a) foi seguida — e estendida: o `rate_limit_event` ao vivo continua a única fonte que dá o
`status` categórico (`allowed`/`allowed_warning`/`rejected`), mas só atualiza uma janela havendo
sessão aberta; por isso foi somada uma segunda fonte que esta decisão **não recomendou, e chega a
descartar no texto acima** — a API experimental
(`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`), por um probe efêmero (o mesmo
mecanismo do probe de instalação), com cache de 30 s e deduplicação de chamadas concorrentes —
pedido explícito do usuário, depois de notar que a tela não mostrava nada sem uma sessão viva. Essa
fonte trouxe de graça as janelas por modelo (`model_scoped`, ex. "Fable") e o overage, que o
`rate_limit_event` nunca carregou.

Transporte (a) — `GET /engines/claude/usage/rate-limits` — e visibilidade (a) — todo usuário
autenticado — seguidos à risca. **Não seguido:** o estado não sobrevive a reinício — é um mapa em
memória (`InMemoryRateLimitStore`,
`backend/src/adapter/outbound/engines/claude/rate-limit-store.ts`), nunca a tabela
`claude_rate_limits`/migration que a B-11 descreve. Nenhuma relação com o tipo de assinatura ou com
uma futura `GET /engines/claude/account` do plano 13: a B-11 previa `applicable: false` quando a
conta não tem limite de plano — não implementado, uma conta sem leitura simplesmente não mostra a
janela, sem dizer por quê.

Sem matriz de cenários própria — os únicos testes são os que o código ganhou ad hoc:
`rate-limit-window.spec.ts` e `read-rate-limits.use-case.spec.ts` no backend, mais os do mapeador e
da tela no web e no mobile (commit `96aff81`). `pnpm verify`/`verify:full` não foram rodados — só
`tsc`, `eslint` e os testes unitários tocados no backend e no web, `dart analyze`/`format`/o
`import_lint` e os testes do Flutter no mobile, e `pnpm i18n:check` nas três pontas. D-09 continua
🔲 por isso: a fonte (b), que a decisão rejeitava, entrou pela porta dos fundos sem que a decisão
tenha sido revista para admiti-la — revisão pendente para quando este plano começar de verdade.

### D-10 — formato, teto e trilha do export

Opções: (a) CSV, com teto e recusa acima dele; (b) CSV em stream sem teto; (c) CSV e JSON. O gap é
o tamanho: um usuário pesado gera algumas dezenas de milhares de linhas por ano no nível por turno.

**Recomendação:** CSV RFC 4180, UTF-8 com BOM (abre certo no Excel em pt-BR), vírgula, ponto
decimal, instantes ISO 8601 com deslocamento, neutralização de fórmula nas células de texto; dois
níveis — por turno e por dia; teto de 100 000 linhas, acima disso `USAGE_EXPORT_TOO_LARGE` sugerindo
o nível por dia. Não vai para a trilha: é o próprio usuário lendo números dele, sem conteúdo. JSON
não entra agora — a API já é JSON.

## F2 — Tela de uso

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | Com o que o gráfico é desenhado | peso no bundle da rota (carregada sob demanda), qualidade da camada de acessibilidade, testabilidade em jsdom | B-16 | — | 🔲 |

### D-11 — com o que o gráfico é desenhado

Opções: (a) o componente `chart` do shadcn/ui, que é Recharts com as cores vindas de tokens CSS
(`--chart-n`) — entra pelo mesmo caminho dos outros primitivos
([web/03](../../architecture/web/03-ui-system.md#como-o-shadcnui-funciona-e-por-que-isso-importa));
(b) SVG próprio, só barras empilhadas; (c) outra biblioteca (visx, ECharts).

**Recomendação:** (a), com a rota `/usage` carregada sob demanda e o bundle medido antes e depois.
As exigências de acessibilidade e tema da B-16 valem qualquer que seja a escolha — se (a) não
cumprir alguma (navegação por teclado entre barras, por exemplo), (b) é o plano B, não o
afrouxamento da exigência.

## F3 — Orçamentos

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | O que acontece quando o orçamento estoura | — | B-26 | — | 🔲 |
| D-13 | Mudança de orçamento vai para a trilha | — | B-24 | — | 🔲 |
| D-14 | Push do alerta de orçamento | se a notificação sem `requestId` aparece no aparelho sem mudar o app | B-25 | — | 🔲 |
| D-15 | Orçamento de pasta: alcance e convivência com o do usuário | — | B-23 | — | 🔲 |

### D-12 — o que acontece quando o orçamento estoura

O custo só é conhecido no fim do turno. O SDK enfileira nativamente o prompt que chega durante um
turno ([backend/03](../../architecture/backend/03-modules.md#session)), e o `maxBudgetUsd` é fixo por
`query()` — não há como mudá-lo numa sessão viva.

Opções: (a) só avisar; (b) opção por orçamento — avisar, ou **recusar novos turnos**
(`session.prompt` e `session.start`) a partir de 100 %; (c) (b) e ainda interromper o turno em
curso; (d) (b) e iniciar cada sessão com `maxBudgetUsd` igual ao que resta.

**Recomendação:** (b). Interromper no meio (c) deixa arquivo editado pela metade para economizar
centavos; (d) fica velho no instante em que outra sessão gasta. As regras:

- o turno que cruzou **termina**; prompts já aceitos rodam; a recusa vale para o que chega depois
  (S-101, S-102);
- código novo `USAGE_BUDGET_EXCEEDED`, `429` com `Retry-After` até a virada do período — é "limite
  nosso", como o doc 04 define o `429`; `params`: orçamento, gasto, limite, `resetsAt`,
  `retryAfterSeconds`;
- banco de uso indisponível na admissão: **fechado** se existe orçamento bloqueante
  (`SERVICE_UNAVAILABLE`), aberto com `warn` se não (S-104) — quem pediu para ser bloqueado não é
  desbloqueado por uma falha;
- o teto por sessão (`RC_SESSION_MAX_BUDGET_USD`) continua como rede rígida, e a ajuda explica a
  diferença.

**Implementação parcial, fora do ciclo deste plano (2026-10-25):** a rede rígida acima deixou de ter
piso obrigatório. `RC_SESSION_MAX_BUDGET_USD` e `RC_SESSION_MAX_TURNS`
(`backend/src/infrastructure/config/environment.ts`, `sdk-options.factory.ts`) aceitam `0` como
sentinela explícito de "sem teto" — a opção do SDK correspondente simplesmente não é enviada — e o
padrão do `.env`/`.env.example` deste repositório passou a ser `0` para os dois, por pedido do
usuário (uma sessão de horas bateu no teto de US$ 10 no meio do trabalho). A variável continua
obrigatória (sem o valor, o boot recusa, como antes); só o `0` passou a ser um valor válido em vez de
recusado. Nenhuma trilha nova, nenhum aviso de aproximação do teto — isso é o D-11/D-12 acima, ainda
🔲.

Na mesma mudança, duas variáveis novas, sem decisão formal própria por não terem gap a decidir —
`RC_SESSION_AUTO_COMPACT_ENABLED` (`true` por padrão) e `RC_SESSION_AUTO_COMPACT_WINDOW` (`0` =
janela do próprio motor): ligam `autoCompactEnabled`/`autoCompactWindow` do SDK pela mesma camada de
flags que já leva `outputStyle` (`flag-settings.ts`), igualando o comportamento ao padrão do CLI
interativo e da extensão do VS Code — pedido do mesmo usuário, mesma sessão.

**`pnpm verify`/`verify:full` não foram rodados** para nenhuma das duas mudanças acima — só `tsc`,
`eslint` e os testes unitários dos arquivos tocados.

### D-13 — mudança de orçamento na trilha

Opções: (a) mudanças de orçamento em `audit_events`; (b) só log; (c) trilha também para cada recusa
de prompt por orçamento.

**Recomendação:** (a). Criar, editar e apagar orçamento bloqueante é mexer num controle sobre as
sessões; `audit_events` ganha `usage.budgetCreated`, `usage.budgetUpdated`, `usage.budgetDeleted`
por migration nova, gravados antes de valer, com `details` (escopo, período, limite antes/depois,
modo) — trilha indisponível não muda o orçamento (S-98). A recusa de um prompt **não** vai para a
trilha: é log `warn` e erro traduzido, e ela se repetiria a cada tentativa.

### D-14 — push do alerta de orçamento

O domínio de `notification` hoje só conhece push de permissão (`PushMessage` carrega uma
`PermissionReference`), e o app descarta, sem quebrar, dado de push sem `sessionId`/`requestId`
(`arrivalFrom` em `mobile/lib/core/notifications/platform_push_gateway.dart` devolve `null`) — mas
isso não diz se o sistema operacional **mostra** a notificação.

Opções: (a) push opcional por orçamento, se o aviso aparecer sem mudar o app; (b) só no web; (c)
push com mudança no app.

**Recomendação:** (a), com o gap fechado por um teste manual registrado no progresso antes da B-25.
Se o app precisar mudar para mostrar, a parte de push sai para um plano do app e o alerta fica no web
— registrado como escopo reduzido, não omitido.

### D-15 — orçamento de pasta: alcance e convivência

Opções de alcance: (a) a pasta e as subpastas; (b) só o caminho exato da sessão. Convivência: (a)
todos os orçamentos que casam valem juntos; (b) o de pasta substitui o do usuário.

**Recomendação:** alcance (a) e convivência (a). O orçamento de pasta cobre a pasta e as subpastas, casando por **segmento** de
caminho (`/a` cobre `/a/b`, não `/ab`); a pasta é escolhida pelo seletor do plano 06, nunca digitada,
e precisa estar na allowlist ao criar. Orçamentos do usuário e de pasta valem **juntos**; o mais
apertado decide, e a recusa diz qual (S-107). Pasta que saiu da allowlist depois continua contando o
histórico — o orçamento não some, e a tela mostra o aviso.

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto — a fase exercita o que as anteriores decidiram | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 15`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
