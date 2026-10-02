# Plano 09 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Erro esperado.** Este plano não cria código de erro. Os `err` que o sistema **responde** citam o `code`
do [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio). Um `err` com
`—` é recusa que não vem do servidor: um portão que reprova (`i18n:check`, `contracts:check`) ou um
controle que o próprio cliente desabilita, com o motivo.

---

## Normas — B-01…B-03

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `web/03` descreve as três faixas, o lugar de cada controle, a permissão inline, o foco e o indicador; `docs:check` verde | eq | unit | — | B-01 | ⬜ |
| S-02 | toda chave nova existe em `en` e `pt-BR`; a chave cujo uso saiu sai dos dois locales; chave órfã ou literal reprova o `i18n:check` | err | unit | — | B-02 | ⬜ |
| S-03 | os specs de hoje passam pelo page object, sem mudar o que afirmam, e o page object acha cada controle por papel e nome | eq | e2e | — | B-03 | ⬜ |
| S-04 | o contrato só muda com as três pontas: `contracts:check` verde, e um schema que mude regenera o TypeScript e o Dart na mesma mudança; hoje nenhum muda | idem | unit | — | B-01 | ⬜ |

## Moldura — B-04…B-08

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-05 | conversa com 300 entradas: o documento e a side bar não rolam, só o scroller da conversa | fron | e2e | — | B-04, B-05 | ⬜ |
| S-06 | conversa vazia, com uma entrada e com 300: a caixa está inteira no viewport, no topo e no fim da rolagem | fron | e2e | — | B-05 | ⬜ |
| S-07 | parado no fim, o delta que chega mantém o fim à vista; rolado para cima, a posição não muda e o follow volta ao descer até o fim | est | integração | — | B-05 | ⬜ |
| S-08 | abrir "Alterações" troca só o scroller; o texto escrito, o contexto e a fila continuam; voltar ao chat devolve a rolagem | est | integração | — | B-05 | ⬜ |
| S-09 | sessão encerrada: faixa acima da caixa com o motivo e o aviso de que enviar retoma; a caixa continua ativa (D-05) | est | integração | — | B-06 | ⬜ |
| S-10 | desconectado → reconectando → conectado: a faixa aparece e some, e a caixa não pula | est | unit | — | B-06 | ⬜ |
| S-11 | replay parcial, histórico carregando e histórico que falhou ficam no topo do scroller; "tentar de novo" recarrega sem apagar o que o stream mostrou | err | unit | — | B-06 | ⬜ |
| S-12 | rascunho e sessão usam a mesma moldura: o rascunho mostra as dicas no scroller e a caixa ancorada | eq | unit | — | B-07 | ⬜ |
| S-13 | painel na largura mínima da D-04: sem scroll horizontal, e as abas rolam na própria faixa | fron | e2e | — | B-08 | ⬜ |
| S-14 | texto de 60 linhas: a caixa cresce até o teto da D-04 e rola por dentro; a conversa continua com área visível | fron | unit | — | B-08 | ⬜ |
| S-15 | celular, 360×640 e 360×400: a caixa fica acima da barra de views e dentro do `visualViewport` | fron | e2e | — | B-08 | ⬜ |
| S-16 | cruzar `md` nos dois sentidos não perde o texto, a rolagem nem a aba do painel | est | e2e | — | B-08 | ⬜ |
| S-17 | duas abas de pasta com conversas: a rolagem e o rascunho de uma não vazam para a outra | conc | integração | — | B-05 | ⬜ |

## Sessão encerrada que retoma — B-06, B-10, e o esforço — B-11

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-87 | sessão encerrada: escrever e enviar retoma a conversa pelo fluxo do 04/08 e manda o prompt na sessão retomada; a faixa some quando a sessão volta | est | integração | — | B-06 | ⬜ |
| S-88 | dois Enters seguidos na sessão encerrada: uma retomada, um prompt, nenhum segundo subprocesso | idem | integração | — | B-10 | ⬜ |
| S-89 | retomar com o teto cheio: a recusa aparece acima da caixa com o tempo de espera, e o texto e o contexto continuam na caixa | err | integração | `SESSION_LIMIT_REACHED` | B-10 | ⬜ |
| S-90 | na sessão viva, o chip de esforço é só leitura, com o motivo no tooltip; no rascunho, ele escolhe, e o valor vai no `session.start` | eq | unit | — | B-11 | ⬜ |

## Composer — B-09…B-15

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-18 | a barra mostra `+`, `/`, modo, modelo, esforço (só para modelo que aceita), contexto e enviar, nessa ordem, cada um com nome acessível; o rótulo "PROMPT" visível não existe | eq | unit | — | B-09 | ⬜ |
| S-19 | turno rodando e caixa vazia: o botão é "Parar" e interrompe; dois cliques mandam um `session.interrupt` | idem | unit | — | B-10 | ⬜ |
| S-20 | turno rodando com texto: enviar enfileira e diz isso, e o parar continua ao lado | est | unit | — | B-10 | ⬜ |
| S-21 | `Esc` com menu aberto fecha o menu e não interrompe; sem menu, interrompe uma vez por turno (08 · S-183, S-184 no componente novo) | est | unit | — | B-10 | ⬜ |
| S-22 | sessão encerrada: o parar some, e enviar fica ativo com o nome acessível "retomar e enviar" | est | unit | — | B-10 | ⬜ |
| S-23 | trocar modo ou modelo pela barra manda `session.setPermissionMode` / `session.setModel`; a recusa volta o chip ao valor anterior com o erro traduzido | err | integração | `INVALID_INPUT` | B-11 | ⬜ |
| S-24 | `acceptEdits`: o chip fica em tom de aviso, e o aviso por extenso está no menu | eq | unit | — | B-11 | ⬜ |
| S-25 | `bypassPermissions` nunca aparece no menu de modo (08 · S-170) | eq | unit | — | B-11 | ⬜ |
| S-26 | `/` insere `/` no cursor e abre a completion de comandos e skills; o botão "Commands" não existe | eq | unit | — | B-12 | ⬜ |
| S-27 | `+` oferece arquivo ou pasta, anexo do computador e seleção do editor, e cada item leva ao fluxo do 08 | eq | integração | — | B-12 | ⬜ |
| S-28 | caixa vazia sem contexto: enviar desabilitado, motivo no nome acessível e no tooltip, sem linha visível | eq | unit | — | B-14 | ⬜ |
| S-29 | contexto bloqueado (arquivo sumiu, upload pendente, teto): o motivo aparece acima da caixa | err | unit | — | B-14 | ⬜ |
| S-30 | primeiro prompt do rascunho recusado pelo teto de sessões: faixa acima da caixa, e o texto e o contexto continuam | err | integração | `SESSION_LIMIT_REACHED` | B-14 | ⬜ |
| S-31 | fila com três prompts acima da caixa; cancelar um tira só ele, e cancelar duas vezes manda um cancelamento | idem | integração | — | B-14 | ⬜ |
| S-32 | editando uma mensagem: a faixa "editando" acima da caixa; `Esc` cancela a edição antes de interromper o turno | est | unit | — | B-14 | ⬜ |
| S-33 | o anel do contexto mostra a porcentagem; no limiar fica em aviso; o popover abre para cima com as categorias e "Compactar" | fron | unit | — | B-13 | ⬜ |
| S-34 | medida ilegível: o anel some com o motivo no tooltip, e os chips não mudam de posição | err | unit | — | B-13 | ⬜ |
| S-35 | Enter envia, Shift+Enter quebra a linha, Enter compondo com IME não envia (08 · S-214 no componente novo) | eq | unit | — | B-15 | ⬜ |
| S-36 | só teclado: Tab percorre caixa → barra na ordem visual; o menu abre com Enter, fecha com `Esc` e devolve o foco ao chip | eq | e2e | — | B-15 | ⬜ |

## Cabeçalho — B-16…B-20

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-37 | o cabeçalho é uma faixa: abas, nova conversa, histórico, alterações e `⋯`; a linha de ícones solta não existe | eq | unit | — | B-16 | ⬜ |
| S-38 | o status mostra conectado, reconectando, rodando e encerrado por cor **e** texto no tooltip, com o id da sessão | eq | unit | — | B-18 | ⬜ |
| S-39 | dono: encerrar pede confirmação; confirmar manda um `session.close`, mesmo com dois cliques; cancelar não manda nada | idem | integração | — | B-17 | ⬜ |
| S-40 | quem não é dono: "Encerrar" desabilitado, dizendo por quê | err | unit | — | B-17 | ⬜ |
| S-41 | o menu tem exportar, desfazer, notificações, regras, ajuda e copiar o id, e cada item faz o que o controle antigo fazia; no rascunho, só o que vale sem sessão | eq | integração | — | B-17 | ⬜ |
| S-42 | notificações negadas pelo navegador: o item diz como devolver, e nenhuma linha solta aparece no cabeçalho | err | unit | — | B-17 | ⬜ |
| S-43 | o custo da sessão aparece onde a D-11 manda; sessão sem turno não mostra "$0" | fron | unit | — | B-18 | ⬜ |
| S-44 | MCP: todos conectados → ícone neutro; um falhou → aviso; lista ilegível → item que diz isso, sem quebrar a faixa | err | unit | — | B-18 | ⬜ |
| S-45 | o histórico abre as sessões da pasta; abrir uma conversa a põe numa aba; voltar ao chat mantém a aba e a rolagem | est | e2e | — | B-19 | ⬜ |
| S-46 | painel estreito com dez abas: as abas rolam na faixa, e os botões da direita continuam visíveis | fron | e2e | — | B-16 | ⬜ |
| S-47 | a ajuda descreve a barra, o menu, o indicador, o card inline, a pílula e as ações da mensagem, sem literal | eq | unit | — | B-20 | ⬜ |

## Processamento e thinking — B-21, B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-48 | turno começa: o indicador aparece como última linha da conversa, com o glifo, um verbo e o tempo; o topo do painel não mostra estado do turno | est | unit | — | B-21 | ⬜ |
| S-49 | com tool rodando diz "Executando *tool*…"; com pedido aberto diz "Esperando sua resposta" e leva ao card | eq | unit | — | B-21 | ⬜ |
| S-50 | fim do turno, interrompido ou com erro: o indicador some e o resumo do turno aparece no lugar | est | unit | — | B-21 | ⬜ |
| S-51 | `prefers-reduced-motion`: o glifo fica parado, e o texto e o tempo continuam | eq | unit | — | B-21 | ⬜ |
| S-52 | o `aria-live` anuncia só a troca de estado: um turno de 60 s com uma tool gera dois anúncios, não sessenta | fron | unit | — | B-21 | ⬜ |
| S-53 | o verbo é o mesmo durante o turno inteiro, com re-render e reconexão no meio; o próximo turno pode sortear outro | idem | unit | — | B-21 | ⬜ |
| S-54 | deltas de `thinking`: a linha diz "Pensando…" animada; o bloco fecha e ela vira "Pensou por *n* s", recolhida, que expande para o texto | est | integração | — | B-22 | ⬜ |
| S-55 | três blocos de thinking entre duas tools ficam como cinco linhas, na ordem em que vieram | eq | integração | — | B-22 | ⬜ |
| S-56 | thinking redigido diz que existiu, sem conteúdo inventado | err | unit | — | B-22 | ⬜ |
| S-57 | no histórico, sem duração por bloco, a linha diz "Pensou", nunca "0 s" nem `NaN` | fron | unit | — | B-22 | ⬜ |

## Permissão e plano inline — B-23, B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-58 | `permission.requested` de uma tool que está na conversa: o card inteiro aparece no lugar da linha dela | eq | integração | — | B-23 | ⬜ |
| S-59 | o pedido chega antes da linha da tool: o card fica na cauda e, quando a linha chega, vai para o lugar dela sem duplicar | conc | integração | — | B-23 | ⬜ |
| S-60 | o card inline mantém o comando exato sem truncar, o risco, a contagem, os escopos, o segundo passo e o caminho para as regras | eq | unit | — | B-23 | ⬜ |
| S-61 | o prazo vence: o card vira a linha "recusado — ninguém respondeu a tempo"; uma resposta que chega depois é recusada e traduzida | est | integração | `PERMISSION_REQUEST_EXPIRED` | B-23 | ⬜ |
| S-62 | respondido no celular: o card vira a linha com a decisão, quem respondeu e de onde, sem sumir | conc | integração | — | B-23 | ⬜ |
| S-63 | dois pedidos de tools em paralelo: dois cards, cada um no lugar da sua tool, com respostas independentes | conc | integração | — | B-23 | ⬜ |
| S-64 | duplo clique em aprovar manda uma resposta (a regra do card do 03) | idem | unit | — | B-23 | ⬜ |
| S-65 | sem pedido, nada ocupa espaço: "Waiting for you" e "Nothing to decide" não existem | eq | unit | — | B-23 | ⬜ |
| S-66 | `ExitPlanMode`: o plano para aprovar fica no lugar da tool; aprovar com um modo troca o chip da barra | est | integração | — | B-24 | ⬜ |

## Nunca fora de vista — B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-67 | rolado para cima com pedido fora de vista: a pílula "Claude espera sua resposta (*n*)" aparece sobre a caixa; clicar rola e foca o pedido mais antigo; com o card à vista, a pílula some | est | e2e | — | B-25 | ⬜ |
| S-68 | pedido com "Alterações" aberto: a pílula aparece; clicar volta ao chat e foca o card | est | integração | — | B-25 | ⬜ |
| S-69 | pedido chega com o foco na caixa e texto escrito: o foco fica na caixa, e o Enter envia o prompt (ou enfileira), nunca responde o pedido | conc | unit | — | B-25 | ⬜ |
| S-70 | pedido `defaultToNo` chega sem ninguém na caixa: o foco vai ao negar do card | eq | unit | — | B-25 | ⬜ |
| S-71 | o comando "Ir para o pedido de permissão" da palette leva ao pedido mais antigo; sem pedido, diz que não há | eq | unit | — | B-25 | ⬜ |
| S-72 | pedido numa aba de pasta inativa: o badge da aba continua (08 · B-42), e abrir a aba mostra o card inline | conc | e2e | — | B-25 | ⬜ |

## Tarefas, ações da mensagem e linhas de sistema — B-26…B-28

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-73 | lista de tarefas: uma linha sobre a caixa ("3/7 · tarefa atual"), que expande para todas; sem lista, nada; com 0 e com todas concluídas, o texto certo | fron | unit | — | B-26 | ⬜ |
| S-74 | a lista atualiza ao vivo sem mexer na rolagem da conversa | est | integração | — | B-26 | ⬜ |
| S-75 | o prompt do usuário mostra editar, bifurcar e desfazer até aqui ao passar o mouse e com o foco do teclado | eq | unit | — | B-27 | ⬜ |
| S-76 | desfazer pela mensagem: o diálogo mostra o alcance arquivo a arquivo; confirmar desfaz e o resultado vira linha na conversa | est | integração | — | B-27 | ⬜ |
| S-77 | turno rodando: desfazer desabilitado com o motivo; o backend recusando assim mesmo, o erro traduzido aparece | err | integração | `SESSION_LOCKED` | B-27 | ⬜ |
| S-78 | sessão encerrada: a ação de desfazer não aparece, e a ajuda diz por quê | err | unit | — | B-27 | ⬜ |
| S-79 | `Ctrl/Cmd+F`: a barra de busca fica fixa no topo do scroller enquanto a conversa rola | eq | unit | — | B-28 | ⬜ |
| S-80 | resumo do turno, compactação, replay parcial e resultado do desfazer são linhas de uma linha, na ordem | eq | unit | — | B-28 | ⬜ |

## E2E — B-29…B-32

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-81 | `commands-and-undo`, `limits`, `live-session`, `session-stream`, `rule-cycle`, `mobile-approval` e os specs da F6 do 08 verdes no layout novo, sem `skip` | eq | e2e | — | B-29 | ⬜ |
| S-82 | 1280×800, 1024×600 e 360×640, com conversa longa: a caixa no viewport, o documento sem rolar, nada na horizontal | fron | e2e | — | B-30 | ⬜ |
| S-83 | prompt → indicador → "Pensando…" → "Pensou por *n* s" → tool → card inline → aprovar → linha decidida → resumo, com a caixa visível o tempo todo | est | e2e | — | B-31 | ⬜ |
| S-84 | `axe` sem violação no painel em rascunho, rodando, pedindo permissão e encerrada | err | e2e | — | B-32 | ⬜ |
| S-85 | celular 360×640: o ciclo da S-83 na view Claude; no desktop, o mesmo ciclo só por teclado | eq | e2e | — | B-32 | ⬜ |
| S-86 | rodar o `chat-layout.spec` duas vezes seguidas dá o mesmo resultado: nada de rolagem, rascunho ou pedido vaza entre execuções | idem | e2e | — | B-32 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Normas (B-01…B-03) | `fron`, `est`, `conc` | são documento, chaves e um page object: não têm limite numérico, estado nem acesso concorrente. O que reprova é portão (`docs:check`, `i18n:check`, `contracts:check`) |
| Moldura (B-04…B-08) | `idem` | layout não tem operação repetível. Repetir é re-renderizar, coberto pela S-16 (redimensionar ida e volta) |
| Cabeçalho (B-16…B-20) | `conc` | as ações do menu reaproveitam os comandos do 08, cuja concorrência já está coberta lá (08 · S-145…S-150). Aqui muda só onde o controle fica |
| Composer (B-09…B-15) | `conc` | a fila e o envio durante o turno são os do 08 (08 · S-156…S-160). A S-20 cobre o que muda na barra |
| Processamento e thinking (B-21, B-22) | `conc` | o indicador é derivado do status da sessão, um valor só. Dois clientes veem o mesmo status, coberto pela S-62 do lado da permissão |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
