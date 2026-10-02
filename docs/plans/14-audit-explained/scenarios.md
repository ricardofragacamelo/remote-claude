# Plano 14 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

As garantias do [plano 03](../03-rules-and-audit/README.md) — append-only por trigger, piso de 2160
horas, purga por janela registrada em `audit_purges`, leitura escopada por quem pergunta, `403` para
a sessão de outra pessoa, e um `Read` que nunca devolve conteúdo — **continuam valendo** e têm
cenário próprio aqui (S-10, S-14, S-15, S-16, S-38, S-41, S-57, S-131, S-150, S-151): mudança que
toca a trilha e não reprova esses testes quando quebra uma garantia é mudança não testada.

Códigos novos, acrescentados ao catálogo pela [B-04](F0-contract.md): `AUDIT_ENTRY_NOT_FOUND` (404),
`AUDIT_ENTRY_PURGED` (410), `AUDIT_EXPORT_TOO_LARGE` (422), `AUDIT_VIEW_NOT_FOUND` (404),
`AUDIT_VIEW_NAME_TAKEN` (409) e `AUDIT_VIEW_LIMIT_REACHED` (422). Os demais já existem no
[catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio).

---

## Spike e contrato — B-01…B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | o spike registra, para sucesso, falha, `Bash` com saída ≠ 0, interrupção, negação pelo `canUseTool`, `deny` de projeto e timeout de pergunta, **quais hooks disparam e com que campos** — e a fixture gravada reproduz o mesmo em CI | eq | integração | — | B-01 | ⬜ |
| S-02 | o hook de desfecho de uma invocação cujo `PreToolUse` foi recusado (trilha indisponível) é observado e documentado: dispara ou não, e com que `tool_use_id` | est | integração | — | B-01 | ⬜ |
| S-03 | código novo sem linha no catálogo do `04-errors-and-http` **e** no `error-catalogue.ts` → o teste do catálogo reprova | err | unit | — | B-04 | ⬜ |
| S-04 | código novo sem `messageKey` em `en` **e** `pt-BR` → `i18n:check` reprova | err | unit | — | B-04 | ⬜ |
| S-05 | tipo de evento novo que outro plano acrescenta sem explicação registrada na tela → o teste do registro de tipos reprova (a lista do domínio e a do web são comparadas) | err | unit | — | B-06 | ⬜ |

## Desfecho da invocação — B-07, B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-06 | tool que conclui grava a linha de desfecho `succeeded`, com `durationMs` vindo do hook | eq | integração | — | B-08 | ⬜ |
| S-07 | tool que falha grava `failed` — e **nenhum** texto do `error` do hook chega ao banco | eq | integração | — | B-08 | ⬜ |
| S-08 | tool interrompida (`is_interrupt: true`) grava `interrupted`, distinta de `failed` | eq | integração | — | B-08 | ⬜ |
| S-09 | `Bash` com saída ≠ 0 grava o código de saída quando a D-01 diz de onde ele vem, e `null` quando o SDK não o dá — nunca um número inventado | fron | unit | — | B-08 | ⬜ |
| S-10 | `tool_response` e `error` com um segredo plantado não aparecem no banco, no log nem na resposta HTTP | err | integração | — | B-08 | ⬜ |
| S-11 | falha ao gravar o desfecho não recusa nada nem encerra a sessão: a tool já rodou; loga `error` e o item mostra "desfecho não registrado" | err | integração | `INTERNAL_ERROR` (só no log) | B-08 | ⬜ |
| S-12 | o mesmo desfecho entregue duas vezes (reentrega do SDK) grava **uma** linha — o índice único `(session_id, tool_use_id, decision)` segura | idem | integração | — | B-08 | ⬜ |
| S-13 | o desfecho que chega **antes** da linha `allowed` (a decisão é gravada sem esperar) monta a mesma invocação, na ordem certa da história | conc | integração | — | B-08 | ⬜ |
| S-14 | `UPDATE` numa linha de desfecho é recusado pela trigger, com o papel da aplicação | err | integração | `restrict_violation` do banco | B-07 | ⬜ |
| S-15 | `DELETE` de linha de desfecho dentro de 2160 h é recusado pelo banco; fora, a purga apaga e `audit_purges` registra o lote | fron | integração | `restrict_violation` do banco | B-07 | ⬜ |
| S-16 | a migration não reescreve linha: contagem, `seq` e conteúdo das linhas anteriores iguais antes e depois, e a trigger de `UPDATE` não dispara | est | integração | — | B-07 | ⬜ |
| S-17 | `duration_ms` ausente (opcional no SDK) grava `null`; `0` grava `0` — as duas coisas não se confundem | fron | unit | — | B-08 | ⬜ |
| S-18 | sessão encerrada entre a tool e o `PostToolUse` ainda grava o desfecho com o dono certo, não `unknown` | est | integração | — | B-08 | ⬜ |
| S-19 | invocação que o CLI recusou sem passar pelo `canUseTool` (`deny` de projeto) tem um desfecho que diz isso, conforme a D-01 — não fica "em execução" para sempre | eq | integração | — | B-08 | ⬜ |
| S-20 | as `CHECK` novas: só a linha de desfecho carrega `outcome`, e linha de desfecho não carrega veredito | err | integração | `check_violation` do banco | B-07 | ⬜ |

## Pasta, conversa, turno e aparelho — B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-21 | entrada nova carrega a pasta, a conversa (`claude_session_id`) e o turno (`prompt_id`) em que nasceu | eq | integração | — | B-09 | ⬜ |
| S-22 | sessão retomada **in-place** grava pasta e conversa na entrada — o caso que `session_origins` não cobre, porque a retomada in-place não escreve linha lá | est | integração | — | B-09 | ⬜ |
| S-23 | entrada anterior à migration: a pasta vem de `session_origins` quando há linha, e sai "não registrada" quando não há | fron | integração | — | B-09 | ⬜ |
| S-24 | decisão respondida pelo celular grava o aparelho; pela web, grava a origem sem aparelho | eq | integração | — | B-09 | ⬜ |
| S-25 | hook sem `prompt_id` (o SDK o omite antes do primeiro input) grava turno nulo, sem falhar a gravação | fron | unit | — | B-09 | ⬜ |
| S-26 | o título da conversa **nunca** é gravado no Postgres → `lint:arch` (`transcript-is-never-persisted`) reprova quem tentar | err | unit | — | B-09 | ⬜ |

## A invocação como unidade — B-10

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | registrada → perguntada → aprovada → concluída vira **um** item, com a linha do tempo das quatro etapas | eq | integração | — | B-10 | ⬜ |
| S-28 | invocação que ninguém foi perguntado (um `Read` que o CLI liberou) é um item com "sem pergunta" e o desfecho | eq | integração | — | B-10 | ⬜ |
| S-29 | linhas sem `toolUseId` não se agrupam entre si: cada uma é um item | fron | integração | — | B-10 | ⬜ |
| S-30 | parte da invocação passou da retenção (o registro saiu, o desfecho ficou) → o item aparece ancorado no que restou, marcado "parte do registro passou dos 90 dias" | fron | integração | — | B-10 | ⬜ |
| S-31 | invocação anterior a esta versão: "desfecho não registrado — anterior a esta versão" | est | integração | — | B-10 | ⬜ |
| S-32 | sem desfecho com a sessão viva → "em execução"; com a sessão encerrada → "não concluiu — a sessão terminou antes" | est | integração | — | B-10 | ⬜ |
| S-33 | pergunta pendente → "esperando resposta", e o item muda de estado na próxima leitura quando alguém responde | est | integração | — | B-10 | ⬜ |
| S-34 | escrita durante a leitura paginada não repete nem pula item — keyset descendente sobre o `seq` da âncora | conc | integração | — | B-10 | ⬜ |
| S-35 | a mesma página pedida duas vezes, sem escrita no meio, devolve os mesmos itens na mesma ordem | idem | integração | — | B-10 | ⬜ |
| S-36 | com 100 mil linhas, o plano de execução de cada combinação de filtro usa índice e para depois de `limit + 1` âncoras | fron | integração | — | B-10 | ⬜ |
| S-37 | filtro por decisão **e** desfecho devolve só as invocações que têm as duas linhas | eq | integração | — | B-10 | ⬜ |
| S-38 | filtro pela sessão de outra pessoa | err | integração | `FORBIDDEN` | B-10 | ⬜ |
| S-39 | cursor malformado, período que termina antes de começar, `limit` fora de 1…100, desfecho desconhecido | err | integração | `INVALID_INPUT` | B-10 | ⬜ |
| S-40 | página que termina exatamente no último item devolve `nextCursor: null`, sem página vazia depois | fron | integração | — | B-10 | ⬜ |
| S-41 | de uma invocação de `Read` saem só `file_path`, `offset`, `limit` e `pages` — a lista de permissão do plano 03 vale nas rotas novas | eq | integração | — | B-10 | ⬜ |

## Linha do tempo com os eventos — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-42 | eventos e invocações intercalados por momento numa página só, cada item com `type` | eq | integração | — | B-11 | ⬜ |
| S-43 | cursor composto: escrita em qualquer das duas tabelas durante a leitura não repete nem pula item | conc | integração | — | B-11 | ⬜ |
| S-44 | filtro que só invocações têm (tool, decisão, desfecho, busca) tira os eventos; `types=events` traz só eventos | eq | integração | — | B-11 | ⬜ |
| S-45 | relógio ajustado para trás entre duas escritas: a ordem de apresentação pode inverter, e nenhum item some — declarado na ajuda | fron | integração | — | B-11 | ⬜ |
| S-46 | linha de `audit_events` com um `kind` que esta versão não conhece sai com o `kind` cru, sem derrubar a página | err | unit | — | B-11 | ⬜ |
| S-47 | evento de outra pessoa nunca aparece, nem com filtro de pasta que coincide | eq | integração | — | B-11 | ⬜ |
| S-48 | cursor composto adulterado (uma metade válida, outra não) | err | integração | `INVALID_INPUT` | B-11 | ⬜ |

## Resumo e facetas — B-12

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-49 | o resumo conta por decisão, desfecho, tool e pasta — e cada contagem é igual ao número de itens que a lista devolve com o mesmo filtro | eq | integração | — | B-12 | ⬜ |
| S-50 | período sem nada devolve contagens zero, não erro nem `404` | fron | integração | — | B-12 | ⬜ |
| S-51 | facetas trazem as sessões do período com pasta, título da conversa e data, e as tools vistas com contagem | eq | integração | — | B-12 | ⬜ |
| S-52 | SDK indisponível ao buscar títulos → as facetas saem sem título, com pasta e data; nada falha | err | integração | `CLAUDE_UNAVAILABLE` absorvido (só no log) | B-12 | ⬜ |
| S-53 | cem pedidos simultâneos de facetas fazem **uma** leitura do SDK por pasta — cache e coalescência do `transcript` reaproveitados | conc | unit | — | B-12 | ⬜ |
| S-54 | período maior que a retenção devolve o que existe e diz a data mais antiga disponível | fron | integração | — | B-12 | ⬜ |
| S-55 | o resumo não expõe contagem de purga (que é da máquina inteira, de todos) — só a data da última | eq | integração | — | B-12 | ⬜ |

## Detalhe e endereço permanente — B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-56 | o detalhe traz a linha do tempo inteira e os vínculos: regra, sessão, pasta, conversa, turno, aparelho e `traceId` | eq | integração | — | B-13 | ⬜ |
| S-57 | invocação de outra pessoa | err | integração | `FORBIDDEN` | B-13 | ⬜ |
| S-58 | id que nunca existiu | err | integração | `AUDIT_ENTRY_NOT_FOUND` (novo, 404) | B-13 | ⬜ |
| S-59 | id cujo momento (o ULID) é anterior ao corte da última purga | fron | integração | `AUDIT_ENTRY_PURGED` (novo, 410) | B-13 | ⬜ |
| S-60 | id que não é um ULID | err | integração | `INVALID_INPUT` | B-13 | ⬜ |
| S-61 | evento pelo id responde os mesmos `403`/`404`/`410` da invocação | eq | integração | — | B-13 | ⬜ |
| S-62 | a busca por `(sessionId, toolUseId)` resolve para a mesma invocação que o id — é o que o "ver na trilha" usa | idem | integração | — | B-13 | ⬜ |

## Busca no input — B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-63 | a busca acha o texto em qualquer campo do input: comando, caminho, padrão, URL, conteúdo de um `Write` | eq | integração | — | B-14 | ⬜ |
| S-64 | termo com menos de três caracteres | fron | integração | `INVALID_INPUT` | B-14 | ⬜ |
| S-65 | a busca não acha nada que a leitura não mostraria — resultado de `Read` não é gravado, e campos fora da lista do `Read` não entram no texto buscado | eq | integração | — | B-14 | ⬜ |
| S-66 | `%`, `_`, `\` e aspas no termo são literais, não curinga | fron | unit | — | B-14 | ⬜ |
| S-67 | com a fixture grande, a busca usa o índice escolhido na D-08 (plano de execução verificado) e respeita o período | fron | integração | — | B-14 | ⬜ |

## Rotas e módulo — B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-68 | cada rota nova loga entrada e saída em `debug` — filtros, contagem, duração —, sem o input de tool na linha de log | eq | integração | — | B-15 | ⬜ |
| S-69 | rota nova sem credencial | err | integração | `UNAUTHENTICATED` | B-15 | ⬜ |
| S-70 | `GET /audit-entries` continua respondendo exatamente como antes (compatibilidade com quem já o chama) | idem | integração | — | B-15 | ⬜ |
| S-71 | nenhum módulo que **escreve** na trilha recebe os leitores novos → `lint:arch` reprova | err | unit | — | B-15 | ⬜ |

## Catálogo de tools no web — B-16

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-72 | cada tool conhecida tem nome amigável, ícone e campo principal, em `en` e `pt-BR` | eq | unit | — | B-16 | ⬜ |
| S-73 | `mcp__github__create_issue` vira "create_issue, do servidor MCP github", com ícone de MCP | eq | unit | — | B-16 | ⬜ |
| S-74 | tool desconhecida vira "Usar X" com ícone genérico, sem quebrar a linha | err | unit | — | B-16 | ⬜ |
| S-75 | nome MCP malformado (`mcp__`, `mcp__srv`) cai no desconhecido; campo principal ausente mostra o input resumido | fron | unit | — | B-16 | ⬜ |

## A tela: dados, cabeçalho, lista e filtros — B-17…B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-76 | os filtros, o agrupamento e o item aberto vivem na search: o link colado reproduz a tela, inclusive depois do login | eq | integração | — | B-17 | ⬜ |
| S-77 | search malformada é descartada campo a campo, e a tela mostra o que consegue — nunca um erro que ninguém causou | err | unit | — | B-17 | ⬜ |
| S-78 | filtro novo descarta a resposta que ainda chegava do anterior | conc | integração | — | B-17 | ⬜ |
| S-79 | clicar num cartão do resumo aplica o filtro dele, e o chip do filtro aparece removível | est | integração | — | B-18 | ⬜ |
| S-80 | presets (última hora, hoje, 7 dias, 30 dias) no fuso do navegador, com `from` incluído e `to` excluído; "hoje" na virada do horário de verão | fron | unit | — | B-18 | ⬜ |
| S-81 | agrupado por sessão, o grupo que atravessa páginas continua o mesmo ao carregar mais — não abre um segundo cabeçalho | fron | integração | — | B-19 | ⬜ |
| S-82 | teclado: ↑/↓ e `j`/`k` movem, `Enter` abre o detalhe, `Esc` fecha e devolve o foco à linha | est | integração | — | B-19 | ⬜ |
| S-83 | menu de contexto da linha e command palette oferecem as mesmas ações (copiar input, copiar link, filtrar por esta sessão/tool/pasta, abrir conversa, abrir regra) | eq | integração | — | B-19 | ⬜ |
| S-84 | o seletor de sessão mostra pasta + título + data, busca por texto, e nunca pede um id | eq | integração | — | B-20 | ⬜ |
| S-85 | "carregar mais" que falha mantém o que já está na tela, com o erro e "tentar de novo" ao lado | err | integração | `NETWORK_UNREACHABLE` | B-19 | ⬜ |
| S-86 | os quatro estados em cada região (resumo, lista, detalhe), com skeleton que mantém o layout | eq | integração | — | B-19 | ⬜ |
| S-87 | filtro pela sessão de outra pessoa vindo da URL mostra o erro traduzido, com caminho de volta à trilha inteira | err | integração | `FORBIDDEN` | B-20 | ⬜ |
| S-88 | a busca no input espera o usuário parar de digitar (uma requisição, não uma por tecla), e o termo curto avisa inline antes de enviar | fron | integração | — | B-20 | ⬜ |
| S-89 | literal apresentável nas telas novas → `lint` e `i18n:check` reprovam | err | unit | — | B-17 | ⬜ |
| S-90 | em tela estreita a lista vira cartões compactos com o mesmo conteúdo das colunas, sem scroll horizontal | fron | integração | — | B-19 | ⬜ |

## Detalhe e endereço permanente na tela — B-21, B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-91 | a história em frases cobre cada combinação: por regra, por regra de sessão, por pessoa, por ninguém a tempo, sem pergunta; concluiu, falhou, interrompida, com código de saída, sem desfecho, anterior à versão, em execução | eq | unit | — | B-21 | ⬜ |
| S-92 | decisão gravada antes da `0009` (sem veredito) diz que a ligação não existe, em vez de inventá-la | fron | unit | — | B-21 | ⬜ |
| S-93 | copiar input copia o JSON exato; copiar link copia o endereço permanente; os dois avisam que copiaram | eq | integração | — | B-21 | ⬜ |
| S-94 | endereço permanente aberto deslogado volta ao mesmo item depois do login | est | integração | — | B-22 | ⬜ |
| S-95 | endereço de invocação purgada mostra "removida pela retenção de 90 dias", com caminho para a trilha | err | integração | `AUDIT_ENTRY_PURGED` | B-22 | ⬜ |
| S-96 | endereço de invocação inexistente mostra o erro com caminho para a trilha | err | integração | `AUDIT_ENTRY_NOT_FOUND` | B-22 | ⬜ |
| S-97 | em tela pequena o detalhe abre em tela cheia, e voltar devolve a lista na mesma posição de rolagem | est | integração | — | B-22 | ⬜ |
| S-98 | "o que isso significa" aparece para cada caso da história, com o "saiba mais" levando à seção certa da ajuda | eq | unit | — | B-21 | ⬜ |

## Visões salvas — B-23

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-99 | salvar uma visão guarda filtros e agrupamento; abri-la aplica os dois e põe o id dela na URL | eq | integração | — | B-23 | ⬜ |
| S-100 | nome repetido | err | integração | `AUDIT_VIEW_NAME_TAKEN` (novo, 409) | B-23 | ⬜ |
| S-101 | visão apagada aberta por link | err | integração | `AUDIT_VIEW_NOT_FOUND` (novo, 404) | B-23 | ⬜ |
| S-102 | visão de outra pessoa | err | integração | `FORBIDDEN` | B-23 | ⬜ |
| S-103 | duplo clique em salvar cria uma visão, não duas (chave de idempotência do pedido) | idem | integração | — | B-23 | ⬜ |
| S-104 | acima do teto de visões por usuário | fron | integração | `AUDIT_VIEW_LIMIT_REACHED` (novo, 422) | B-23 | ⬜ |
| S-105 | renomear e apagar pela lista de visões, com desfazer no aviso em vez de confirmação | est | integração | — | B-23 | ⬜ |

## Entradas novas com a tela aberta — B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-106 | entrada nova com a tela aberta mostra "N novas" sem mexer na rolagem; clicar insere no topo sem duplicar o que já estava | conc | integração | — | B-24 | ⬜ |
| S-107 | aba do navegador oculta não consulta; ao voltar a ficar visível, consulta uma vez | est | unit | — | B-24 | ⬜ |
| S-108 | com um filtro de período fechado no passado, não há consulta de novidades | fron | unit | — | B-24 | ⬜ |

## Usabilidade e ajuda da tela — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-109 | a gaveta de ajuda existe, traduzida em `en` e `pt-BR`, com glossário, o porquê do registro antes da decisão, a retenção de 90 dias e o que **não** é gravado | eq | integração | — | B-25 | ⬜ |
| S-110 | todo controle só de ícone tem tooltip e nome acessível | eq | integração | — | B-25 | ⬜ |
| S-111 | cada atalho da tela está na command palette e funciona pelo teclado | eq | integração | — | B-25 | ⬜ |
| S-112 | estado vazio ensina o próximo passo: sem filtro, "abra uma pasta e peça algo ao Claude"; com filtro, "limpar filtros" como ação | fron | integração | — | B-25 | ⬜ |
| S-113 | axe sem violação na tela, com o detalhe e a ajuda abertos, nos dois temas | eq | integração | — | B-25 | ⬜ |
| S-114 | mensagem de erro de cada código novo diz o que fazer, não só o que falhou | err | unit | `AUDIT_ENTRY_PURGED`, `AUDIT_EXPORT_TOO_LARGE` | B-25 | ⬜ |

## Eventos explicados — B-26

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-115 | cada tipo conhecido tem frase e vínculo: aparelho (tela de dispositivos), regra (`/rules/$ruleId`), retomada e fork (a conversa), desfazer (a lista de arquivos e o que aconteceu a cada um) | eq | unit | — | B-26 | ⬜ |
| S-116 | tipo desconhecido vira frase genérica com o nome técnico e "esta versão não sabe explicar este tipo" | err | unit | — | B-26 | ⬜ |
| S-117 | desfazer de cinquenta arquivos mostra os primeiros e "mais N", expansível | fron | unit | — | B-26 | ⬜ |
| S-118 | regra aberta a partir de um evento, já revogada, mostra o estado — nunca página vazia | est | integração | — | B-26 | ⬜ |

## Conversa, diff e regra — B-27…B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-119 | "ir ao ponto da conversa" abre a conversa rolada até a mensagem que pediu a tool, destacada | eq | integração | — | B-27 | ⬜ |
| S-120 | conversa que o SDK não acha mais (transcript apagado do disco) | err | integração | `NOT_FOUND` | B-27 | ⬜ |
| S-121 | `aroundToolUseId` que não está no transcript | err | integração | `INVALID_INPUT` | B-27 | ⬜ |
| S-122 | invocação sem conversa registrada (anterior à versão) não oferece o link e diz por quê | fron | unit | — | B-27 | ⬜ |
| S-123 | o diff de `Edit`/`MultiEdit` é montado do próprio input; `Write` sem "antes" diz isso e oferece o diff completo quando o plano 08 existir | eq | unit | — | B-28 | ⬜ |
| S-124 | comparar com a regra mostra o padrão, o comando e a parte que casou | eq | unit | — | B-29 | ⬜ |
| S-125 | regra de sessão (nunca gravada) não oferece comparação, e diz por quê | fron | unit | — | B-29 | ⬜ |
| S-126 | regra apontada que não existe | err | integração | `PERMISSION_RULE_NOT_FOUND` | B-29 | ⬜ |

## Exportação — B-30…B-32

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-127 | exportar o recorte filtrado em JSON Lines e em CSV traz exatamente as invocações que a lista traria | eq | integração | — | B-31 | ⬜ |
| S-128 | recorte acima do teto | fron | integração | `AUDIT_EXPORT_TOO_LARGE` (novo, 422) | B-31 | ⬜ |
| S-129 | a exportação grava `audit.exported` **antes** do primeiro byte; trilha indisponível não exporta | err | integração | `INTERNAL_ERROR` (`audit.error.unavailable`) | B-31 | ⬜ |
| S-130 | célula CSV que começa com `=`, `+`, `-`, `@`, tab ou CR é neutralizada | err | unit | — | B-31 | ⬜ |
| S-131 | no arquivo exportado, um `Read` traz só caminho e janela — a mesma lista de permissão da tela | eq | integração | — | B-31 | ⬜ |
| S-132 | cliente que aborta o download no meio: o servidor para de ler, e o `audit.exported` já gravado diz o que foi pedido | conc | integração | — | B-31 | ⬜ |
| S-133 | exportar o mesmo recorte duas vezes gera o mesmo conteúdo e **dois** `audit.exported` — cada exportação é um fato | idem | integração | — | B-31 | ⬜ |
| S-134 | exportar com filtro pela sessão de outra pessoa | err | integração | `FORBIDDEN` | B-31 | ⬜ |
| S-135 | a tela mostra, antes de exportar, quantas invocações o arquivo terá e o formato; acima do teto, sugere estreitar o filtro | eq | integração | — | B-32 | ⬜ |
| S-136 | a ADR da exportação existe e é citada pelo contrato da rota → `docs:check` e revisão | eq | unit | — | B-30 | ⬜ |

## "Ver na trilha" e a ajuda do que a F3 acrescenta — B-33, B-34

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-137 | o link a partir de `(sessionId, toolUseId)` — card de tool do plano 08, detalhe de regra do 15, histórico de aparelho do 17 — abre a invocação certa | eq | integração | — | B-33 | ⬜ |
| S-138 | par que ainda não foi gravado (o card é mais rápido que a trilha) | err | integração | `AUDIT_ENTRY_NOT_FOUND` | B-33 | ⬜ |
| S-139 | a ajuda explica cada tipo de evento, o que a exportação contém e por que ela própria fica na trilha | eq | integração | — | B-34 | ⬜ |

## E2E — B-35…B-38

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-140 | prompt → `Bash` pede permissão → aprovado no web → sai com código 1: a trilha conta a história inteira, em frases, no detalhe | eq | e2e | — | B-36 | ⬜ |
| S-141 | filtrar pela sessão pelo seletor, agrupar por turno, abrir o detalhe pelo teclado, copiar o link, recarregar → o mesmo item aberto | est | e2e | — | B-36 | ⬜ |
| S-142 | viewport de celular: lista em cartões, detalhe em tela cheia, voltar à mesma posição | eq | e2e | — | B-36 | ⬜ |
| S-143 | axe na tela com o detalhe e a ajuda abertos | eq | e2e | — | B-36 | ⬜ |
| S-144 | visão salva sobrevive à recarga e a um segundo navegador do mesmo usuário | idem | e2e | — | B-36 | ⬜ |
| S-145 | desfazer arquivos numa sessão → o evento aparece na linha do tempo com os arquivos | eq | e2e | — | B-37 | ⬜ |
| S-146 | conceder e revogar uma regra → dois eventos, e a regra abre deles no estado certo | est | e2e | — | B-37 | ⬜ |
| S-147 | da invocação à conversa, no ponto exato | eq | e2e | — | B-37 | ⬜ |
| S-148 | exportar CSV → o arquivo baixado tem as linhas do recorte, e `audit.exported` aparece na trilha | eq | e2e | — | B-37 | ⬜ |
| S-149 | interromper um `Bash` em execução → desfecho "interrompida" | est | e2e | — | B-35 | ⬜ |
| S-150 | endereço permanente da invocação de outra pessoa mostra o erro traduzido | err | e2e | `FORBIDDEN` | B-38 | ⬜ |
| S-151 | invocação purgada (fixture antiga + `pnpm db purge`) → a tela mostra a retenção, pelo endereço permanente | err | e2e | `AUDIT_ENTRY_PURGED` | B-38 | ⬜ |
---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Spike e contrato (B-01…B-06) | `fron`, `conc`, `idem` | são documento e medição; as fronteiras, corridas e repetições que eles desenham são provadas nas tasks que os implementam (S-09, S-13, S-12, S-35) |
| Pasta, conversa, turno e aparelho (B-09) | `conc`, `idem` | o vínculo viaja **na mesma linha** que o registro ou a decisão: a corrida e a reentrega são as da linha, já cobertas por S-13 e S-12 |
| Linha do tempo (B-11) | `est`, `idem` | evento de conta é fato imutável, sem ciclo de vida; a repetição da mesma página é a mesma keyset da S-35, aplicada a cada metade do cursor |
| Resumo e facetas (B-12) | `est`, `idem` | contagem é função pura do período e do filtro; repetir o pedido sem escrita no meio devolve o mesmo número por construção, e o que importa — bater com a lista — é a S-49 |
| Detalhe (B-13) | `est`, `conc` | o detalhe é leitura de linhas imutáveis; a transição que existe (pendente → respondida → concluída) é a do item, provada em S-31…S-33 |
| Busca no input (B-14) | `err`, `est`, `conc`, `idem` | a busca é um filtro a mais da mesma consulta: erro de entrada é a fronteira de tamanho (S-64), e corrida e repetição são as da paginação (S-34, S-35) |
| Rotas e módulo (B-15) | `fron`, `est`, `conc` | as fronteiras são de cada leitor (B-10…B-14); a rota só valida e traduz |
| Catálogo de tools (B-16) | `est`, `conc`, `idem` | função pura de nome para rótulo — sem estado, sem corrida, e repetir é, por definição, o mesmo resultado |
| A tela: dados, lista e filtros (B-17…B-20) | `idem` | aplicar o mesmo filtro duas vezes é a mesma URL, que o TanStack Query serve do cache; não há efeito a repetir |
| Detalhe na tela (B-21, B-22) | `conc`, `idem` | o detalhe só lê; a corrida de filtro e resposta é a S-78, e copiar duas vezes não tem efeito a proteger |
| Visões salvas (B-23) | `conc` | a única corrida que alcança um usuário é o duplo clique, tratado como idempotência (S-103); duas abas salvando nomes diferentes são duas visões legítimas |
| Entradas novas (B-24) | `eq`, `err`, `idem` | a consulta de novidades é a mesma rota da lista (seus erros são os da S-85), e o que ela garante — não duplicar — é a S-106 |
| Usabilidade e ajuda (B-25) | `est`, `conc`, `idem` | ajuda, tooltip e atalho são conteúdo e acessibilidade; as transições de foco estão na S-82 |
| Eventos explicados (B-26) | `conc`, `idem` | a explicação é função pura do evento; a paginação que os traz é a S-43 |
| Conversa, diff e regra (B-27…B-29) | `est`, `conc`, `idem` | leitura de coisa que já existe: o estado da regra é a S-118, e a leitura do transcript herda o cache e a coalescência do plano 04 |
| Exportação (B-30…B-32) | `est` | a exportação não tem ciclo de vida: é um pedido, um fato gravado e um arquivo |
| "Ver na trilha" e ajuda (B-33, B-34) | `fron`, `est`, `conc`, `idem` | o link é a busca por par da S-62 (que já é `idem`); a ajuda é conteúdo, coberta como na B-25 |
| E2E (B-35…B-38) | `fron`, `conc` | as fronteiras (teto, retenção, página) e as corridas (paginação sob escrita, desfecho antes da decisão) são exatas e baratas em integração (S-13, S-34, S-128); pela porta do usuário custariam minutos para provar o mesmo |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
