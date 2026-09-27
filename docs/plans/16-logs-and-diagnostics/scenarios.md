# Plano 16 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Motivos de check** (`HEALTH_*`) não são status HTTP: são o `reason` de um item do relatório de
saúde, com `messageKey` e `fixKey` próprios. São **novos**, e entram no catálogo pela B-06 numa
seção própria, ao lado dos erros de domínio. Onde a coluna "Erro esperado" cita um `HEALTH_*`, o
pedido HTTP deu certo (`200`) e a falha é o conteúdo do relatório.

---

## Contrato e documentos — B-01…B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | o `backend/03` descreve `diagnostics`, `diag` e `health` no catálogo e no diagrama de fronteiras, com quem guarda e quem lê o log — `docs:check` verde | eq | unit | — | B-01 | ⬜ |
| S-02 | `code` ou motivo `HEALTH_*` usado pelas rotas novas sem linha no catálogo, ou sem `messageKey` em `en` e `pt-BR` → `i18n:check` falha | err | unit | — | B-06 | ⬜ |
| S-03 | kind `diagnostics.*` gravado em `audit_events` antes da migration nova → o CHECK `audit_events_kind_known` recusa | err | integração | `INTERNAL_ERROR` | B-06 | ⬜ |
| S-04 | `/diagnostics/logs?…` e `/diagnostics/health` abrem a sub-tela certa com os filtros da search; `/diagnostics` cai na saúde | eq | integração | — | B-07 | ⬜ |
| S-05 | parâmetro inválido na search (nível desconhecido, data impossível) é descartado com aviso traduzido; a tela abre com o resto | err | integração | — | B-07 | ⬜ |

## Operador — B-02, B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-06 | `sub` listado como operador recebe `operator: true` em `GET /diagnostics/capabilities` e lê os logs; o não listado recebe `false` | eq | integração | — | B-12 | ⬜ |
| S-07 | lista de operadores vazia (o default) → ninguém lê os logs, e a resposta diz por quê (`operatorsConfigured: false`) | fron | integração | — | B-12 | ⬜ |
| S-08 | não operador pede a consulta de logs | err | integração | `FORBIDDEN` | B-12 | ⬜ |
| S-09 | claim de papel vinda do provedor (`roles`, `groups`, `permissions`) é ignorada — não faz de ninguém operador | err | unit | — | B-12 | ⬜ |
| S-10 | configuração de operadores malformada (não é lista de `sub`) → o boot falha com mensagem clara; nunca vira "todos" | err | unit | — | B-12 | ⬜ |
| S-11 | `sub` retirado da configuração e backend reiniciado → o pedido seguinte do mesmo usuário já é recusado | est | integração | `FORBIDDEN` | B-12 | ⬜ |

## Buffer de logs — B-08, B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-12 | linha do `pino` vira `LogRecord`: `level`, `time`, `service`, `module`, `op`, `traceId`, `sessionId`, `userId`, `durationMs`; o resto em `fields` | eq | unit | — | B-08 | ⬜ |
| S-13 | linha que não é JSON (lixo no destino) é guardada como texto marcado `unparsed`, sem derrubar o logger | err | unit | — | B-08 | ⬜ |
| S-14 | o filtro puro: nível mínimo e lista de níveis, módulo, `op`, usuário, período, termos sem caixa e `!exclusão` — tabela de casos | eq | unit | — | B-08 | ⬜ |
| S-15 | cursor de outra época (o backend reiniciou) → a consulta responde da linha mais antiga com `reset: true`, não com erro | est | unit | — | B-08 | ⬜ |
| S-16 | cursor malformado ou forjado | err | integração | `INVALID_INPUT` | B-13 | ⬜ |
| S-17 | buffer no teto de bytes descarta as mais antigas, soma `evicted` e informa a linha mais antiga ainda disponível | fron | unit | — | B-09 | ⬜ |
| S-18 | inundação de `debug` não expulsa o último `error`: a reserva `warn+` o mantém depois de o anel geral girar | fron | unit | — | B-09 | ⬜ |
| S-19 | linha acima do teto por linha é cortada com `truncated: true`, nunca descartada em silêncio | fron | unit | — | B-09 | ⬜ |
| S-20 | buffer desligado por configuração (teto `0`) → a consulta responde vazia com `disabled: true`, e a tela diz como ligar | fron | integração | — | B-09 | ⬜ |
| S-21 | milhares de appends enquanto uma consulta pagina: nenhuma linha duplicada ou pulada entre páginas — o cursor é monotônico | conc | unit | — | B-09 | ⬜ |
| S-22 | a mesma consulta com o mesmo cursor devolve as mesmas linhas enquanto elas não saíram do buffer | idem | unit | — | B-09 | ⬜ |

## O tee do `pino` — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-23 | com o tee ligado, o stdout recebe exatamente as mesmas linhas, na mesma ordem — o store não altera nem atrasa | eq | integração | — | B-10 | ⬜ |
| S-24 | store que lança ao receber uma linha não derruba o logger nem a requisição; a falha é contada e aparece na saúde | err | unit | — | B-10 | ⬜ |
| S-25 | **ler os logs não gera logs que se leem**: as rotas `diagnostics` logam só metadados (contagem, cursor, `durationMs`), e dez consultas seguidas não acrescentam ao buffer o conteúdo que serviram | idem | integração | — | B-10 | ⬜ |

## Consulta — redação — B-13, B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-31 | segredo com forma de credencial (JWT, `Bearer …`, `token=…`) no `msg` ou num campo de uma linha **do backend** — que só passou pela redação por nome — sai `[REDACTED]` na consulta | err | integração | — | B-13 | ⬜ |
| S-32 | o mesmo segredo plantado não aparece no rastreio, nos valores das facetas, na exportação nem na resposta do tail | err | integração | — | B-14 | ⬜ |
| S-33 | campo sensível por nome (`password`, `authorization`, `apiKey`) chega ao cliente só como `[REDACTED]`, e a linha traz `redacted: <n>` | eq | integração | — | B-13 | ⬜ |
| S-34 | nenhuma rota, parâmetro ou cabeçalho devolve a linha antes da redação — teste de contrato percorre todo parâmetro aceito pelos DTOs | err | unit | — | B-13 | ⬜ |

## Consulta — só o operador lê — B-13, B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-35 | não operador não recebe linha por nenhuma rota de leitura — facetas, rastreio pelo `traceId` que o próprio erro mostrou, exportação e tail —: `403`, e nenhuma linha no corpo | err | integração | `FORBIDDEN` | B-13 | ⬜ |
| S-38 | o operador vê as linhas de todos os usuários, com a coluna de usuário, e filtra por `userId` | eq | integração | — | B-13 | ⬜ |

## Consulta — rastreio, fronteiras e ritmo — B-13, B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-39 | o rastreio junta as linhas do backend do mesmo `traceId` em ordem, casa os pares entrada/saída (`http.request`/`http.response`, `ws.inbound`/`ws.outbound`, `claude.input`/`claude.output`) com `durationMs`, e marca a entrada sem saída como pendurada | eq | unit | — | B-13 | ⬜ |
| S-40 | rastreio de um `traceId` que não existe, ou que já saiu do buffer → `200` com cadeia vazia, nunca `404` | fron | integração | — | B-13 | ⬜ |
| S-41 | `limit` acima do teto é recusado; `limit=1` e o teto exato passam | fron | integração | `INVALID_INPUT` | B-14 | ⬜ |
| S-42 | período invertido (`from` depois de `to`) | err | integração | `INVALID_INPUT` | B-14 | ⬜ |
| S-43 | long-poll: sem linha nova, responde vazio ao fim de `wait`; com linha nova, responde assim que ela chega | est | integração | — | B-13 | ⬜ |
| S-44 | long-polls simultâneos do mesmo usuário acima do teto → recusa com `Retry-After` (`params.scope: 'logTail'`) | conc | integração | `RATE_LIMITED` | B-13 | ⬜ |
| S-45 | **tail sob carga**: 10 000 linhas/s por 10 s — cada resposta respeita o teto de página, o cursor avança sem perder o que ainda está no buffer, e o que saiu antes de ser lido vem como `gap` com a contagem | conc | integração | — | B-13 | ⬜ |
| S-46 | o append é síncrono, sem I/O e de custo constante: 100 000 linhas não aumentam o tempo por append (medido por lote, não por relógio absoluto) | fron | unit | — | B-09 | ⬜ |
| S-47 | a exportação respeita os filtros e o teto; acima dele, corta e termina com a linha `export.truncated` e a contagem | fron | integração | — | B-14 | ⬜ |
| S-48 | toda exportação grava `diagnostics.logsExported` na trilha com o filtro e a contagem — nunca as linhas | eq | integração | — | B-14 | ⬜ |
| S-49 | qualquer rota `diagnostics` sem credencial | err | integração | `UNAUTHENTICATED` | B-14 | ⬜ |
| S-50 | a busca é literal: `.*` casa o texto `.*`, não "tudo"; termo acima de 200 caracteres é recusado | fron | integração | `INVALID_INPUT` | B-13 | ⬜ |

## Nível do backend em execução — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-51 | o operador eleva o backend a `debug` por 15 min: linhas `debug` passam a chegar, **inclusive dos loggers filhos criados no boot** | eq | integração | — | B-15 | ⬜ |
| S-52 | o prazo expira e o nível volta ao `LOG_LEVEL`; a trilha tem a mudança e a volta | est | integração | — | B-15 | ⬜ |
| S-53 | duração acima do teto, ou nível fora da lista | fron | integração | `INVALID_INPUT` | B-15 | ⬜ |
| S-54 | não operador tenta mudar o nível | err | integração | `FORBIDDEN` | B-15 | ⬜ |
| S-55 | o mesmo `PUT` repetido renova o prazo sem empilhar timers, e só grava na trilha quando o nível muda de fato | idem | integração | — | B-15 | ⬜ |
| S-56 | dois operadores mudam ao mesmo tempo: o último vence, há um timer só, e a resposta diz quem mudou e até quando | conc | unit | — | B-15 | ⬜ |
| S-57 | reinício do backend durante o prazo → o nível nasce no `LOG_LEVEL`; nível elevado não sobrevive ao processo | est | integração | — | B-15 | ⬜ |

## Tela de logs — lista e filtros — B-16…B-18

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-58 | a lista mostra hora, nível, módulo, `op`, mensagem, duração e `traceId` curto; expandir mostra o JSON em árvore, com copiar valor, caminho e linha | eq | integração | — | B-17 | ⬜ |
| S-59 | 20 000 linhas carregadas rolam virtualizadas: o DOM mantém só as visíveis mais a margem | fron | integração | — | B-17 | ⬜ |
| S-60 | `[REDACTED]` aparece como marca com tooltip "removido pela redação — não é recuperável", e não existe ação de revelar | eq | integração | — | B-17 | ⬜ |
| S-61 | os quatro estados: skeleton que mantém o layout; erro traduzido com ação; vazio que ensina (alargar o período, tirar um filtro, ligar `debug`); conteúdo | est | integração | — | B-17 | ⬜ |
| S-62 | resposta de uma consulta antiga chegando depois da troca de filtro é descartada — a lista nunca mistura dois filtros | conc | unit | — | B-16 | ⬜ |
| S-63 | os filtros vivem na search da URL: copiar o link e abrir em outra aba reproduz a mesma lista | idem | integração | — | B-18 | ⬜ |
| S-64 | não operador que abre a tela de logs vê, no lugar da lista, por que o log do backend é do operador, e a ajuda | eq | integração | — | B-17 | ⬜ |
| S-65 | módulos e `op` escolhidos em seletores com contagem (facetas), sem digitar nome técnico; termo `!health` exclui as linhas que casam | eq | integração | — | B-18 | ⬜ |

## Tela de logs — seguir ao vivo — B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-66 | seguir ao vivo: linhas novas entram no fim; rolar para cima pausa a rolagem automática e mostra "N linhas novas", que devolve ao fim | est | integração | — | B-19 | ⬜ |
| S-67 | aba do navegador oculta pausa o long-poll; ao voltar, retoma do cursor sem perder o que ainda está no buffer | est | integração | — | B-19 | ⬜ |
| S-68 | a vista guarda no máximo o teto de linhas; as mais antigas saem com aviso, e a página continua respondendo | fron | integração | — | B-19 | ⬜ |
| S-69 | `reset` (backend reiniciou) e `gap` (linhas saíram antes de lidas) viram divisores traduzidos na lista, com hora e contagem | est | integração | — | B-19 | ⬜ |
| S-70 | `429` ou `503` no tail: recua respeitando `Retry-After`, mostra o estado na barra da lista e não martela | err | integração | `RATE_LIMITED`, `SERVICE_UNAVAILABLE` | B-19 | ⬜ |
| S-71 | desligar e religar o seguir ao vivo duas vezes não duplica linha na lista | idem | unit | — | B-19 | ⬜ |

## Tela de logs — rastreio, níveis, ações — B-20…B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-72 | clicar num `traceId` abre a cadeia: linha do tempo por camada, pares com duração, a operação pendurada e os erros destacados | eq | integração | — | B-20 | ⬜ |
| S-73 | um estado de erro qualquer do app mostra o `traceId` com "copiar" e, para o operador, "ver nos logs", que abre `/diagnostics/logs?traceId=` | eq | integração | — | B-20 | ⬜ |
| S-74 | o operador eleva o nível do backend escolhendo a duração; o contador regressivo e "voltar agora" aparecem, e a tela reflete a volta quando o prazo acaba | est | integração | — | B-21 | ⬜ |
| S-75 | "debug neste navegador" eleva o logger do web, acende o indicador na status bar e desliga sozinho no prazo | est | integração | — | B-21 | ⬜ |
| S-77 | menu de contexto da linha: copiar linha, copiar JSON, filtrar por este trace/módulo/`op`, excluir este módulo, abrir rastreio | eq | integração | — | B-22 | ⬜ |
| S-78 | os comandos na palette ("Logs: seguir ao vivo", "Logs: limpar filtros", "Logs: exportar", "Logs: definir nível do backend") executam a mesma ação do botão | eq | integração | — | B-22 | ⬜ |
| S-79 | exportar baixa um arquivo `.jsonl` com os filtros da vista e o nome com período | eq | integração | — | B-22 | ⬜ |

## Tela de logs — usabilidade e ajuda — B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-80 | a ajuda existe e está traduzida em `en` e `pt-BR` — o que é a tela, por que o log do web e do app não aparece nela, níveis, redação, retenção "desde o reinício", quem vê o quê, o que é `traceId` —; todo controle de ícone tem tooltip | eq | integração | — | B-23 | ⬜ |
| S-81 | literal apresentável nas telas de logs ou de saúde → `lint` e `i18n:check` falham | err | unit | — | B-23, B-31 | ⬜ |
| S-82 | teclado: `/` foca a busca, `F` alterna seguir, setas navegam as linhas, `Enter` expande, `Esc` fecha o rastreio; foco sempre visível | eq | integração | — | B-23 | ⬜ |
| S-83 | axe sem violação na tela de logs, com o rastreio aberto, nos dois temas | eq | integração | — | B-23 | ⬜ |

## Saúde — executor e rotas — B-24, B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-84 | os checks rodam em paralelo, cada um com prazo; o que não responde vira `timeout` sem atrasar os outros | conc | unit | `HEALTH_CHECK_TIMEOUT` | B-24 | ⬜ |
| S-85 | check que lança vira `fail` naquele item, e o relatório sai com os outros | err | unit | `HEALTH_CHECK_CRASHED` | B-24 | ⬜ |
| S-86 | agregação: qualquer `fail` → `fail`; só `warn` → `warn`; `skipped` e `unknown` não rebaixam | eq | unit | — | B-24 | ⬜ |
| S-87 | dentro do prazo do cache, dois `GET` seguidos rodam os checks uma vez | idem | unit | — | B-24 | ⬜ |
| S-88 | "verificar de novo" acima do ritmo → recusa com `Retry-After` (`params.scope: 'health'`) | fron | integração | `RATE_LIMITED` | B-28 | ⬜ |
| S-89 | dois "verificar de novo" simultâneos fazem uma execução só; o segundo recebe o mesmo resultado | conc | unit | — | B-24 | ⬜ |

## Saúde — checks falhando um a um — B-25, B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-90 | banco inalcançável → `database` em `fail`, com explicação e o que fazer | err | integração | `HEALTH_DATABASE_UNREACHABLE` | B-25 | ⬜ |
| S-91 | migration do journal ainda não aplicada → `fail`, nomeando quais | err | integração | `HEALTH_MIGRATIONS_PENDING` | B-25 | ⬜ |
| S-92 | banco com migration que o código não conhece → `fail` "o backend é mais antigo que o banco" | err | integração | `HEALTH_MIGRATIONS_AHEAD` | B-25 | ⬜ |
| S-93 | arquivo da allowlist ilegível ou fora do schema → `fail` | err | integração | `HEALTH_ALLOWLIST_INVALID` | B-25 | ⬜ |
| S-94 | raiz da allowlist que sumiu do disco → `warn` nomeando a raiz (para quem a tem, e para o operador) | err | integração | `HEALTH_ALLOWLIST_ROOT_MISSING` | B-25 | ⬜ |
| S-95 | sessões vivas no limite derivado da RAM → `warn` com o limite e o uso; uma abaixo → `ok` | fron | integração | `HEALTH_SESSIONS_AT_LIMIT` | B-25 | ⬜ |
| S-96 | credencial de push ausente → `warn` "o celular não será avisado de pedido de permissão" | err | integração | `HEALTH_PUSH_UNCONFIGURED` | B-25 | ⬜ |
| S-97 | discovery do provedor OIDC inalcançável → `fail` | err | integração | `HEALTH_IDENTITY_UNREACHABLE` | B-25 | ⬜ |
| S-98 | buffer de logs descartando por teto acima do limiar → `warn` com a janela que ele guarda | fron | unit | `HEALTH_LOG_BUFFER_EVICTING` | B-25 | ⬜ |
| S-99 | disco do store de checkpoint abaixo do mínimo → `warn`; abaixo do crítico → `fail` | fron | unit | `HEALTH_DISK_LOW` | B-25 | ⬜ |
| S-100 | CLI do Claude não encontrado ou não executável → `fail` com como instalar | err | integração | `HEALTH_CLAUDE_CLI_MISSING` | B-26 | ⬜ |
| S-101 | `CLAUDE_CONFIG_DIR` apontando para diretório sem login → `fail` "não logado", com o comando para logar | err | integração | `HEALTH_CLAUDE_NOT_LOGGED_IN` | B-26 | ⬜ |

## Saúde — sonda do Claude, recursos e rotas — B-26…B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-102 | sonda ativa do Claude pedida por não operador | err | integração | `FORBIDDEN` | B-26 | ⬜ |
| S-103 | sonda ativa pedida com outra ainda em curso | conc | integração | `CONFLICT` | B-26 | ⬜ |
| S-104 | a sonda ativa grava `diagnostics.claudeProbed` na trilha, com resultado e duração — nunca o texto trocado | eq | integração | — | B-26 | ⬜ |
| S-105 | recurso de plano ausente (watchers do 07, terminais do 10) não aparece; presente, mostra contagem e teto | eq | unit | — | B-27 | ⬜ |
| S-106 | `GET /health` público continua devolvendo só `status` e `database` — `503` com `Retry-After` quando fora —, e nada do relatório detalhado vaza por ele | err | integração | `SERVICE_UNAVAILABLE` | B-28 | ⬜ |
| S-107 | `GET /diagnostics/health` responde `200` com o relatório mesmo com itens em `fail` — a leitura deu certo, a falha é o conteúdo —, e `401` sem credencial | eq | integração | `UNAUTHENTICATED` | B-28 | ⬜ |
| S-108 | não operador recebe o relatório sem os detalhes da máquina: caminho de raiz que não é dele, pid, memória, sessões de outras pessoas | err | integração | — | B-28 | ⬜ |

## Tela de saúde — B-29…B-31

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-109 | cada item em `fail` ou `warn` mostra a explicação e "o que fazer" traduzidos em `en` e `pt-BR` — um caso por motivo dos S-84…S-101 | err | integração | `HEALTH_*` | B-29 | ⬜ |
| S-110 | resumo no topo ("tudo certo" ou "N problemas"), itens por categoria, os com problema primeiro | eq | integração | — | B-29 | ⬜ |
| S-111 | backend inalcançável: a tela diz, do lado do cliente, "o backend não responde", mostra a última verificação boa e tenta de novo com recuo | err | integração | `SERVICE_UNAVAILABLE` | B-29 | ⬜ |
| S-112 | ping de ponta a ponta (`diag.ping`): ida e volta com tempo medido e histórico; com o socket caído, o botão explica por que está desabilitado | est | integração | — | B-29 | ⬜ |
| S-113 | "Este navegador": versões do web e do backend, protocolo, conectado desde, reconexões, último `gap`, limites anunciados, diferença de relógio com o servidor | eq | integração | — | B-29 | ⬜ |
| S-114 | atualização automática só com a tela visível; oculta, pausa; de volta, verifica na hora | est | integração | — | B-29 | ⬜ |
| S-115 | o relatório de diagnóstico copiado passa pela redação e não contém caminho de raiz alheia; linha de log só entra no relatório do operador | err | unit | — | B-30 | ⬜ |
| S-116 | ajuda por item (o que é, por que importa, o que fazer), tooltips, teclado e axe sem violação na tela de saúde | eq | integração | — | B-31 | ⬜ |

## E2E — B-32…B-35

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-117 | um segredo digitado num campo e num prompt nunca aparece na tela de logs, no rastreio nem no arquivo exportado | err | e2e | — | B-32 | ⬜ |
| S-118 | dois usuários: B, não operador, não lê linha nenhuma — a tela explica que o log é do operador —; o operador vê as linhas de B pelo `userId` | err | e2e | `FORBIDDEN` | B-32 | ⬜ |
| S-119 | tail sob carga pela porta do usuário: rajada roteirizada no backend, a tela acompanha, mostra o divisor de `gap` e segue respondendo ao clique | conc | e2e | — | B-33 | ⬜ |
| S-120 | elevar o nível do backend com prazo curto e vê-lo voltar sozinho, na tela e na trilha | est | e2e | — | B-33 | ⬜ |
| S-121 | checks falhando um a um no backend roteirizado — banco, allowlist, CLI, push, identidade —, cada um com a explicação traduzida, em `en` e em `pt-BR` | err | e2e | `HEALTH_*` | B-34 | ⬜ |
| S-122 | ping de ponta a ponta pela tela de saúde | eq | e2e | — | B-34 | ⬜ |
| S-123 | viewport de celular nas duas telas, axe sem violação, ajuda aberta pelo ícone e pela palette | eq | e2e | — | B-35 | ⬜ |
| S-124 | um erro provocado pela UI → "ver nos logs" → a cadeia do `traceId` no backend, da requisição do clique à resposta | eq | e2e | — | B-32 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Contrato e documentos (B-01…B-07) | `fron`, `conc`, `idem` | a fase escreve documento e catálogo; o que ela promete tem fronteira e concorrência nos grupos que o implementam (S-17…S-22, S-41…S-50). Aqui não há estado nem carga para variar |
| Operador (B-02, B-12) | `conc`, `idem` | a lista é lida no boot e é imutável no processo (S-11 prova a transição pelo reinício); ler um papel é leitura pura, repetir não muda nada |
| O tee (B-10) | `fron`, `conc`, `est` | o teto e a carga do buffer são do S-17, S-45 e S-46; o tee só repassa a linha, sem estado próprio |
| Redação (B-13, B-14) | `fron`, `conc`, `est`, `idem` | a redação é uma função pura sobre a linha servida: não tem estado, e a fronteira de tamanho (truncagem) é do S-19. Repetir a consulta é o S-22 |
| Só o operador lê (B-13, B-14) | `fron`, `conc`, `est`, `idem` | quem lê é decidido pelo papel, a cada chamada, sem estado; a transição de papel é o S-11 e a concorrência do tail é o S-44/S-45 |
| Tela — rastreio, níveis, ações (B-20…B-22) | `fron`, `err`, `conc`, `idem` | a fronteira e a recusa do nível são do backend (S-53, S-54) e a tela só as mostra (S-74); o erro da cadeia é o estado de erro comum do S-61 |
| Tela — usabilidade e ajuda (B-23) | `fron`, `conc`, `est`, `idem` | ajuda, atalhos e axe são presença e comportamento de teclado; estados e carga são dos grupos acima |
| Sonda, recursos e rotas (B-26…B-28) | `fron`, `est`, `idem` | o ritmo é o S-88, a execução única o S-89 e o cache o S-87 — a sonda usa o mesmo executor |
| Tela de saúde (B-29…B-31) | `fron`, `conc`, `idem` | o limite, a concorrência e o cache moram no backend (S-87…S-89, S-95); a tela os mostra sem regra própria |
| E2E (B-32…B-35) | `fron`, `idem` | as fronteiras (teto de página, prazo, ritmo) e a repetição (mesmo cursor, mesmo `PUT`) são determinísticas e baratas em unit e integração (S-17, S-22, S-41, S-55, S-87); pela porta do usuário só acrescentariam minutos |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md) — ou o
  motivo de check `HEALTH_*` que a B-06 acrescenta a ele.
