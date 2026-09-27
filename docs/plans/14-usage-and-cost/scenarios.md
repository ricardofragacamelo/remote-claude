# Plano 14 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

Códigos **novos** deste plano, acrescentados ao catálogo na B-03: `USAGE_RANGE_TOO_LONG` (422),
`USAGE_EXPORT_TOO_LARGE` (422), `USAGE_BUDGET_NOT_FOUND` (404), `USAGE_BUDGET_CONFLICT` (409),
`USAGE_BUDGET_EXCEEDED` (429, com `Retry-After`). Os demais são do catálogo existente.

---

## Contrato — B-01…B-05

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `session` importando o interior de `usage` (ou `usage` importando `session`) → `lint:arch` reprova; só o barril e a porta passam | eq | unit | — | B-01 | ⬜ |
| S-02 | arquivo de `adapter/outbound/persistence/usage/` que alcance o que lê conversa → `lint:arch` (`transcript-is-never-persisted`) reprova | eq | unit | — | B-01 | ⬜ |
| S-03 | as tabelas `usage_*` não têm coluna de texto livre fora da lista permitida (caminho, id, modelo, base) — o teste lê o catálogo do Postgres | eq | integração | — | B-04 | ⬜ |
| S-04 | todo código `USAGE_*` tem status no `error-catalogue.ts`, linha no doc 04 e `messageKey` em en e pt-BR no web (e no app, para `USAGE_BUDGET_EXCEEDED`) | eq | unit | — | B-03 | ⬜ |
| S-05 | a migration nova aplica num banco com as anteriores, e a reversão descrita no topo volta ao estado anterior | est | integração | — | B-04 | ⬜ |
| S-06 | `/usage?preset=7d&model=…&folder=…&tab=folders` colado em outro navegador reproduz a tela; parâmetro desconhecido cai no padrão sem quebrar | eq | integração | — | B-05 | ⬜ |
| S-07 | fixture real de três turnos numa mesma `query()` prova que `total_cost_usd` e `modelUsage` são acumulados, e que `usage` é por turno — o teste documenta a semântica que o resto usa | eq | unit | — | B-02 | ⬜ |

## Domínio e captura — B-06, B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-08 | dois acumulados consecutivos → o delta do turno é a diferença, modelo a modelo, em tokens de cada tipo e em custo | eq | unit | — | B-06 | ⬜ |
| S-09 | a soma dos deltas de N turnos é **exatamente** o último acumulado, ao nano-dólar (propriedade, com floats gerados) | fron | unit | — | B-06 | ⬜ |
| S-10 | acumulado menor que o anterior (`/clear`) → base `reset`, delta igual ao acumulado atual, nunca negativo | est | unit | — | B-06 | ⬜ |
| S-11 | resultado de crash com tudo zerado e `is_error` → base `zeroed`, delta zero, e a linha de base anterior é mantida para o turno seguinte | est | unit | — | B-06 | ⬜ |
| S-12 | troca de modelo no meio da sessão (`session.setModel`) → o delta vai para o modelo novo; o antigo fica com delta zero e não aparece no turno | eq | unit | — | B-06 | ⬜ |
| S-13 | modelo que aparece pela primeira vez no acumulado (subagente em Haiku) entra com delta igual ao seu acumulado | fron | unit | — | B-06 | ⬜ |
| S-14 | custo com muitas casas (`0.1 + 0.2`, `1e-9`, `123.456789012`) vira `UsdAmount` sem erro acumulado de arredondamento | fron | unit | — | B-06 | ⬜ |
| S-15 | `costUSD` negativo, `NaN`, `Infinity`, campo ausente (`costBasis`, `thinkingTokens`) → custo `unknown` ou default documentado (`list`), sem exceção | fron | unit | — | B-06 | ⬜ |
| S-16 | em `America/Sao_Paulo` o dia começa às 03:00Z: 23:59:59.999 local pertence ao dia, 00:00:00 local ao seguinte | fron | unit | — | B-06 | ⬜ |
| S-17 | dia de mudança de horário (`America/New_York`: 23 h em março, 25 h em novembro) → um balde por dia local, sem dia duplicado nem faltando | fron | unit | — | B-06 | ⬜ |
| S-18 | fusos com deslocamento não inteiro (`Asia/Kolkata` +05:30, `Asia/Kathmandu` +05:45) cortam o dia no lugar certo | fron | unit | — | B-06 | ⬜ |
| S-19 | virada do mês (31/01 23:30 local × 01/02 00:10) e fevereiro bissexto (29/02/2028) no período mensal | fron | unit | — | B-06 | ⬜ |
| S-20 | o **segundo** turno da mesma sessão publica em `turn.completed.costUsd` só o custo dele — regressão do defeito em que o acumulado saía como custo do turno | eq | integração | — | B-07 | ⬜ |
| S-21 | retomada in-place de conversa nossa: o primeiro turno desconta o acumulado já gravado para a conversa, sem cobrar de novo os turnos anteriores | est | integração | — | B-07 | ⬜ |
| S-22 | fork de conversa externa: o primeiro turno é gravado com os tokens do `usage` do turno e custo desconhecido (base `baselineUnknown`); os seguintes são exatos | est | integração | — | B-07 | ⬜ |
| S-23 | resultados `error_max_budget_usd`, `error_max_turns` e `error_during_execution` com custo real também são contabilizados, com o desfecho gravado | eq | integração | — | B-07 | ⬜ |
| S-24 | turno interrompido que ainda emite `result` é contabilizado; subprocesso que morre sem `result` não grava nada e não corrompe a linha de base | est | integração | — | B-07 | ⬜ |
| S-25 | falha ao gravar o uso não derruba a sessão: `turn.completed` sai, e o log registra `error` com `turnId` — o cliente não recebe erro | err | integração | `INTERNAL_ERROR` (só no log) | B-07 | ⬜ |
| S-26 | o log da borda de uso carrega ids, modelo, contagens e custo — nunca texto de mensagem, prompt ou `result` | eq | integração | — | B-07 | ⬜ |

## Persistência, consultas e HTTP — B-08…B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | o mesmo `turnId` gravado duas vezes (reentrega) → uma linha, e nenhum segundo alerta | idem | integração | — | B-08 | ⬜ |
| S-28 | turnos de duas sessões do mesmo usuário terminando no mesmo instante → as duas linhas gravadas, e a soma do dia confere | conc | integração | — | B-08 | ⬜ |
| S-29 | dez sessões (o teto) gravando turnos em rajada → sem deadlock, contagem gravada igual à enviada | conc | integração | — | B-08 | ⬜ |
| S-30 | falha ao gravar os modelos do turno desfaz a linha do turno — nada fica pela metade | err | integração | `INTERNAL_ERROR` (só no log) | B-08 | ⬜ |
| S-31 | `0.000000001` e `99999.999999999` gravados e lidos de volta sem perda | fron | integração | — | B-08 | ⬜ |
| S-32 | resumo devolve hoje, 7 dias e mês corrente no fuso do usuário, cada um com o período anterior equivalente | eq | integração | — | B-09 | ⬜ |
| S-33 | turno às 23:59 e às 00:01 **locais** caem em dias diferentes — no fuso do usuário, não em UTC | fron | integração | — | B-09 | ⬜ |
| S-34 | dia sem uso dentro do período aparece na série com zero, sem buraco | fron | integração | — | B-09 | ⬜ |
| S-35 | acima de N modelos no período, os menores viram "outros" e a soma do balde continua igual ao total | fron | integração | — | B-09 | ⬜ |
| S-36 | período de um dia aceito; período no teto aceito; um dia acima do teto recusado | fron | integração | `USAGE_RANGE_TOO_LONG` | B-09 | ⬜ |
| S-37 | `from` depois de `to`, data malformada, `tz` desconhecido e `granularity` inválida no mesmo pedido → todos em `details[]` | err | integração | `INVALID_INPUT` | B-09 | ⬜ |
| S-38 | quebra por pasta, sessão, conversa e modelo; ordenação por cada coluna nos dois sentidos, com desempate estável | eq | integração | — | B-09 | ⬜ |
| S-39 | paginar a quebra enquanto turnos novos são gravados não pula nem duplica linha | conc | integração | — | B-09 | ⬜ |
| S-40 | com dados de A e B no banco, nenhum endpoint agregado de B soma, lista ou faceta linha de A | eq | integração | — | B-09 | ⬜ |
| S-41 | detalhe da sessão de outra pessoa → `FORBIDDEN`; sessão sem nenhum turno ou inexistente → `NOT_FOUND` | err | integração | `FORBIDDEN`, `NOT_FOUND` | B-10 | ⬜ |
| S-42 | filtro por uma pasta que só outra pessoa usou devolve vazio — nunca o dado dela | eq | integração | — | B-09 | ⬜ |
| S-43 | título da conversa vem do histórico; histórico indisponível ou conversa apagada → id curto, e a resposta sai assim mesmo | err | integração | `CLAUDE_UNAVAILABLE` (absorvido) | B-09 | ⬜ |
| S-44 | resumo, série e quebra usam os índices da migration sobre 1 M turnos sintéticos, abaixo do alvo de [D-06](decisions.md#d-06--agregar-na-leitura-ou-manter-um-acumulado) | fron | integração | — | B-09 | ⬜ |
| S-45 | cache hit = leitura de cache ÷ (entrada + leitura de cache + escrita de cache); zero tokens → nulo, nunca divisão por zero | fron | unit | — | B-09 | ⬜ |
| S-46 | turno de custo desconhecido fica fora do custo médio por turno e é contado à parte | fron | unit | — | B-09 | ⬜ |
| S-47 | a mesma consulta duas vezes, sem escrita no meio, devolve a mesma resposta | idem | integração | — | B-09 | ⬜ |
| S-48 | toda rota `/usage/*` sem token → `401` | err | integração | `UNAUTHENTICATED` | B-10 | ⬜ |
| S-49 | CSV: cabeçalho, RFC 4180, caminho com vírgula, aspas e quebra de linha bem escapados, UTF-8 com BOM, instantes ISO com deslocamento | eq | integração | — | B-10 | ⬜ |
| S-50 | célula que começa com `=`, `+`, `-` ou `@` (nome de pasta hostil) sai neutralizada contra injeção de fórmula | eq | integração | — | B-10 | ⬜ |
| S-51 | export acima do teto de linhas é recusado com o teto e a sugestão de agregar por dia | fron | integração | `USAGE_EXPORT_TOO_LARGE` | B-10 | ⬜ |
| S-52 | o export respeita exatamente os filtros — as somas do CSV batem com a quebra da mesma consulta | eq | integração | — | B-10 | ⬜ |
| S-53 | cliente que aborta o download encerra a consulta, sem cursor aberto no banco | conc | integração | — | B-10 | ⬜ |

## Limites de uso da conta — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-54 | `rate_limit_event` `allowed_warning`, `five_hour`, utilização 0,82 e `resetsAt` → estado gravado e devolvido por `GET /usage/rate-limits` com o instante da observação | eq | integração | — | B-11 | ⬜ |
| S-55 | `rateLimitType` que o código não conhece é guardado como `other`, com o nome cru, sem quebrar | fron | unit | — | B-11 | ⬜ |
| S-56 | dois eventos da mesma janela fora de ordem → vale o observado por último, nunca o mais antigo | conc | unit | — | B-11 | ⬜ |
| S-57 | o mesmo evento recebido duas vezes não muda o estado nem o instante | idem | unit | — | B-11 | ⬜ |
| S-58 | conta sem limites de plano (chave de API, Bedrock, Vertex) → `applicable: false` — nem erro, nem lista vazia que pareça "sem uso" | fron | integração | — | B-11 | ⬜ |
| S-59 | o `rate_limit_event` continua sem publicar `session.statusChanged` — regressão do ciclo 26 do plano 01 | est | integração | — | B-11 | ⬜ |

## Retenção e configurações — B-12, B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-60 | a purga remove turnos além da janela e mantém o turno exatamente na borda | fron | integração | — | B-12 | ⬜ |
| S-61 | purga rodando enquanto turnos são gravados não trava a gravação nem apaga o recente | conc | integração | — | B-12 | ⬜ |
| S-62 | duas purgas seguidas: a segunda não remove nada | idem | integração | — | B-12 | ⬜ |
| S-63 | sem preferência gravada, a primeira visita grava o fuso do navegador; `PUT` com fuso fora da base IANA é recusado | err | integração | `INVALID_INPUT` | B-13 | ⬜ |
| S-64 | trocar o fuso muda os baldes das consultas seguintes, e os alertas do período corrente não se repetem por causa da troca | est | integração | — | B-13 | ⬜ |
| S-65 | taxa de conversão manual zero, negativa ou com mais de 6 casas é recusada; válida aparece como aproximada, com a data em que foi informada | err | integração | `INVALID_INPUT` | B-13 | ⬜ |

## Tela de uso — B-14…B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-66 | cada bloco (cartões, gráfico, tabelas, limites) tem os quatro estados: skeleton com a forma, erro traduzido com ação, vazio que ensina, conteúdo | eq | integração | — | B-15 | ⬜ |
| S-67 | um `turn.completed` observado invalida as consultas de uso; a tela aberta atualiza sem recarga | est | integração | — | B-14 | ⬜ |
| S-68 | vários `turn.completed` em rajada produzem uma revalidação por consulta, não uma por evento | conc | integração | — | B-14 | ⬜ |
| S-69 | cartão com período anterior zero mostra "novo", nunca porcentagem infinita ou `NaN` | fron | integração | — | B-15 | ⬜ |
| S-70 | conta de assinatura: aviso de que o custo é equivalente a preço de lista e que o que limita são os limites de uso | eq | integração | — | B-15 | ⬜ |
| S-71 | as cores dos modelos vêm de tokens definidos nos dois temas; trocar o tema recolore o gráfico sem cor literal | eq | integração | — | B-16 | ⬜ |
| S-72 | gráfico navegável por teclado (foco em cada dia, valor e modelos anunciados) e "ver como tabela" com os mesmos números | eq | integração | — | B-16 | ⬜ |
| S-73 | com `prefers-reduced-motion`, o gráfico não anima | fron | integração | — | B-16 | ⬜ |
| S-74 | axe sem violação na tela de uso nos temas claro e escuro, incluindo o contraste dos segmentos do gráfico | eq | integração | — | B-16 | ⬜ |
| S-75 | filtros, ordenação e aba vivem na URL: colar o link reproduz a tela, e aplicar o mesmo filtro duas vezes não empilha histórico | idem | integração | — | B-18 | ⬜ |
| S-76 | `from` depois de `to` e intervalo acima do teto são avisados inline, antes de enviar | err | integração | `USAGE_RANGE_TOO_LONG` | B-18 | ⬜ |
| S-77 | tabelas: ordenar por coluna (`aria-sort`), buscar, paginar e as ações de linha (filtrar por esta pasta, abrir no workbench, abrir a conversa) | eq | integração | — | B-17 | ⬜ |
| S-78 | detalhe da sessão lista os turnos com a base de cada um explicada em texto (exato, reset, zerado, custo desconhecido após fork) | eq | integração | — | B-19 | ⬜ |
| S-79 | exportar a partir da tela usa os filtros correntes; recusa por teto aparece traduzida com a ação "agregar por dia" | err | integração | `USAGE_EXPORT_TOO_LARGE` | B-20 | ⬜ |
| S-80 | painel de limites mostra as janelas com utilização, estado e reset relativo e absoluto no fuso; "não se aplica" explicado | eq | integração | — | B-21 | ⬜ |
| S-81 | moeda por idioma (`US$ 1,23` em pt-BR, `$1.23` em en); gasto real abaixo de um centavo mostra "< US$ 0,01", nunca "US$ 0,00" | fron | unit | — | B-15 | ⬜ |
| S-82 | literal apresentável nas telas novas → `lint` e `i18n:check` reprovam | eq | unit | — | B-22 | ⬜ |
| S-83 | a gaveta de ajuda tem as seções (token, cache, estimativa, assinatura, o que não conta, fuso, retenção) em en e pt-BR, e cada "saiba mais" abre a seção certa | eq | integração | — | B-22 | ⬜ |
| S-84 | todo controle de ícone tem tooltip e `aria-label` traduzidos | eq | integração | — | B-22 | ⬜ |
| S-85 | os comandos da palette ("Uso: abrir", "Uso: exportar CSV", "Uso: novo orçamento") e o atalho da tela executam, e aparecem no editor de atalhos | eq | integração | — | B-22 | ⬜ |
| S-86 | abaixo de `md`: cartões empilhados, gráfico sem scroll horizontal, tabelas viram lista com o essencial | fron | integração | — | B-17 | ⬜ |
| S-87 | link de detalhe de sessão de outra pessoa aberto na tela → estado de erro traduzido, com caminho de volta | err | integração | `FORBIDDEN` | B-19 | ⬜ |

## Orçamentos — B-23…B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-88 | gasto exatamente igual ao limite conta como 100 % — o limiar de 100 % dispara | fron | unit | — | B-23 | ⬜ |
| S-89 | um turno que leva o gasto de 40 % para 110 % cruza 50 %, 80 % e 100 % — três alertas, na ordem | fron | unit | — | B-23 | ⬜ |
| S-90 | orçamento de pasta casa por segmento: `/a` cobre `/a/b`, não cobre `/ab` | fron | unit | — | B-23 | ⬜ |
| S-91 | orçamento diário recomeça à meia-noite do fuso do usuário; mensal, no dia 1 | est | unit | — | B-23 | ⬜ |
| S-92 | orçamento só de aviso nunca recusa; bloqueante recusa só a partir de 100 % | eq | unit | — | B-23 | ⬜ |
| S-93 | valor ≤ 0, acima do teto, com mais de 2 casas; limiares fora de 1–100 ou repetidos → todos em `details[]` | err | integração | `INVALID_INPUT` | B-24 | ⬜ |
| S-94 | orçamento de pasta fora da allowlist ou inexistente | err | integração | `WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND` | B-24 | ⬜ |
| S-95 | criar o mesmo orçamento duas vezes com os mesmos valores devolve o existente; com valores diferentes, conflito | idem | integração | `USAGE_BUDGET_CONFLICT` | B-24 | ⬜ |
| S-96 | editar ou apagar orçamento de outra pessoa → `FORBIDDEN`; id inexistente → `USAGE_BUDGET_NOT_FOUND` | err | integração | `FORBIDDEN`, `USAGE_BUDGET_NOT_FOUND` | B-24 | ⬜ |
| S-97 | apagar duas vezes → a segunda responde o mesmo orçamento apagado, sem erro | idem | integração | — | B-24 | ⬜ |
| S-98 | criar, editar e apagar entram na trilha **antes** de valer; trilha indisponível não muda o orçamento | err | integração | `INTERNAL_ERROR` | B-24 | ⬜ |
| S-99 | duas sessões cruzando o mesmo limiar no mesmo instante → um alerta só | conc | integração | — | B-25 | ⬜ |
| S-100 | baixar o limite para abaixo do já gasto gera o alerta na hora, uma vez | est | integração | — | B-25 | ⬜ |
| S-101 | o turno que cruza o orçamento bloqueante termina normalmente; o próximo `session.prompt` é recusado, com `retryAfterSeconds` até a virada do período | est | integração | `USAGE_BUDGET_EXCEEDED` | B-26 | ⬜ |
| S-102 | prompt aceito antes do cruzamento (na fila do SDK) roda; o que chega depois é recusado | conc | integração | `USAGE_BUDGET_EXCEEDED` | B-26 | ⬜ |
| S-103 | `session.start` com orçamento bloqueante estourado é recusado antes de subir subprocesso — sem órfão, com o slot devolvido | err | integração | `USAGE_BUDGET_EXCEEDED` | B-26 | ⬜ |
| S-104 | banco de uso indisponível na admissão: com orçamento bloqueante → `503` com `Retry-After`; sem orçamento bloqueante → segue, com `warn` | err | integração | `SERVICE_UNAVAILABLE` | B-26 | ⬜ |
| S-105 | aumentar o limite, trocar para só aviso, apagar o orçamento ou virar o período desbloqueia o próximo prompt | est | integração | — | B-26 | ⬜ |
| S-106 | orçamento de pasta estourado bloqueia só sessões daquela pasta e subpastas; as outras seguem | eq | integração | — | B-26 | ⬜ |
| S-107 | orçamento do usuário e da pasta valem juntos; o mais apertado decide, e a recusa diz qual e quanto | eq | unit | — | B-23 | ⬜ |
| S-108 | com push ligado no orçamento, o alerta vai a todos os aparelhos aprovados, traduzido no idioma de cada um, sem conteúdo, um por cruzamento | eq | integração | — | B-25 | ⬜ |
| S-109 | alerta marcado como visto num dispositivo não volta como novo em outro | idem | integração | — | B-25 | ⬜ |
| S-110 | status bar mostra o gasto de hoje e a porcentagem do orçamento mais apertado; clicar abre `/usage` na aba de orçamentos | eq | integração | — | B-27 | ⬜ |
| S-111 | a recusa por orçamento chega traduzida no composer, com o orçamento, o gasto, a hora da virada e o link para orçamentos | err | integração | `USAGE_BUDGET_EXCEEDED` | B-27 | ⬜ |
| S-112 | barra de progresso do orçamento com `role="progressbar"`, valor em texto e estado que não depende só de cor | eq | integração | — | B-28 | ⬜ |
| S-113 | apagar orçamento pela tela oferece desfazer no toast em vez de confirmação; desfazer restaura com os mesmos limiares | est | integração | — | B-28 | ⬜ |
| S-114 | ao criar, a prévia diz "com o gasto de hoje, este orçamento já estaria em X %" antes de salvar | eq | integração | — | B-28 | ⬜ |
| S-115 | ajuda da tela de orçamentos (limite suave, turno que cruza termina, fila, teto por sessão, fuso, push) traduzida; atalhos funcionam; axe sem violação | eq | integração | — | B-29 | ⬜ |

## E2E — B-30…B-33

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-116 | dois turnos roteirizados na mesma sessão → a tela de uso mostra cada turno com o seu custo, e os cartões somam os dois | eq | e2e | — | B-30 | ⬜ |
| S-117 | troca de modelo entre os turnos → o gráfico empilha os dois modelos no mesmo dia | eq | e2e | — | B-30 | ⬜ |
| S-118 | criar orçamento bloqueante pela tela → turno cruza → alerta no centro de notificações → próximo prompt recusado e traduzido → aumentar o limite libera | est | e2e | `USAGE_BUDGET_EXCEEDED` | B-31 | ⬜ |
| S-119 | dois usuários: B abre `/usage` e não vê nada de A; o link do detalhe de uma sessão de A mostra o erro traduzido | err | e2e | `FORBIDDEN` | B-32 | ⬜ |
| S-120 | navegador em `America/Sao_Paulo` (`timezoneId` do Playwright) com turno às 23:30 local → o turno cai no dia local | fron | e2e | — | B-32 | ⬜ |
| S-121 | o CSV baixado pela tela confere com a tabela filtrada | eq | e2e | — | B-32 | ⬜ |
| S-122 | axe nos temas claro e escuro, teclado no gráfico e nas tabelas, viewport de celular sem scroll horizontal | eq | e2e | — | B-33 | ⬜ |
| S-123 | criar e aumentar um orçamento aparece na trilha em `/audit` | eq | e2e | — | B-31 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato (B-01…B-05) | `fron`, `err`, `conc`, `idem` | a fase escreve documento, schema e migration; o comportamento com fronteira, erro, concorrência e repetição nasce na F1 e é provado lá (S-27…S-53). Aqui se prova que as regras são verificadas por máquina (S-01…S-04) e que a migration aplica e reverte (S-05) |
| Domínio e captura (B-06, B-07) | `conc` | o SDK emite os `result` de uma `query()` em ordem, e a diferença é calculada por sessão viva, em série. A concorrência real — várias sessões gravando ao mesmo tempo — é da persistência (S-28, S-29) |
| Domínio e captura (B-06, B-07) | `idem` | calcular o delta é função pura; a repetição que importa, o mesmo `turnId` reentregue, é da gravação (S-27) |
| Limites de uso da conta (B-11) | `err` | falha ao guardar o estado do limite é `warn` no log e nada muda para a sessão — não há código ao cliente para provar; a leitura sem estado é `applicable`/vazia (S-58) e o `401` da rota está em S-48 |
| Retenção e configurações (B-12, B-13) | `eq` | a leitura e a gravação da preferência no caminho feliz estão dentro de S-63 e S-64; a purga no caminho feliz é a borda de S-60 |
| E2E (B-30…B-33) | `conc` | a concorrência deste plano (turnos simultâneos, alerta único, fila do SDK) é determinística só em integração (S-28, S-99, S-102); pela porta do usuário vira teste instável sem provar nada a mais |
| E2E (B-30…B-33) | `idem` | a repetição — mesmo `turnId`, mesmo orçamento, apagar duas vezes, alerta visto — está em S-27, S-95, S-97 e S-109; no e2e só acrescentaria minutos |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
