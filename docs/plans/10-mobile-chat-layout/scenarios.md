# Plano 10 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

**Níveis no app** ([mobile/06](../../architecture/mobile/06-testing.md#os-três-níveis-no-flutter)): `unit`
é `test/unit/` (entities, mappers, notifiers), `integração` é o teste de widget em `test/widget/`, com
providers sobrescritos e i18n real, e `e2e` é o `integration_test/` no emulador, contra o backend
roteirizado.

**Erro esperado.** Este plano não cria código de erro. Os `err` que o sistema **responde** citam o `code`
do [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio). Um `err` com
`—` é recusa que não vem do servidor: um portão que reprova (`i18n:check`) ou um controle que o próprio
app desabilita, com o motivo.

---

## Normas — B-01…B-04

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | `mobile/04` e `mobile/03` descrevem as três faixas, a ordem real, o card inline, a tela da notificação, o teclado e o que fica fora do app; `docs:check` verde | eq | unit | — | B-01 | ⬜ |
| S-02 | toda chave nova existe nos ARB `en` e `pt-BR`; a chave cujo uso saiu sai dos dois; chave órfã reprova o `i18n:check` | err | unit | — | B-02 | ⬜ |
| S-03 | um texto do mapa que diverge entre o web e o app, em `en` ou em `pt-BR`, reprova o `i18n:check`, dizendo as duas chaves e os dois textos | err | unit | — | B-03 | ⬜ |
| S-04 | o vigésimo verbo existe no web e falta no app: o `i18n:check` reprova; com o mapa completo e igual, passa | fron | unit | — | B-03 | ⬜ |
| S-05 | `vertical_slice`, `permission_flow`, `rule_cycle`, `limits` e `history` passam pelo robô sem mudar o que afirmam, e o robô acha cada controle por semântica | eq | e2e | — | B-04 | ⬜ |

## A conversa e a moldura — B-05, B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-06 | mensagem, tool, mensagem: três entradas na ordem do `seq` (hoje a tool vai para depois das duas) | eq | unit | — | B-05 | ⬜ |
| S-07 | frame com `seq` repetido e replay depois de reconectar não duplicam entrada; `gap` limpa e recarrega | idem | unit | — | B-05 | ⬜ |
| S-08 | fragmentos de `thinking` viram uma entrada de thinking, e nunca entram no texto da resposta, nem quando o `message.completed` chega | est | unit | — | B-05 | ⬜ |
| S-09 | `blockType` que o app não conhece é ignorado com log em `debug`; texto de subagent (`parentToolUseId`) continua fora | err | unit | — | B-05 | ⬜ |
| S-10 | 300 entradas em 360×640: só a lista rola; a `AppBar` e o composer ficam na tela | fron | integração | — | B-06 | ⬜ |
| S-11 | teclado aberto em 360×400: o composer fica acima do teclado, a `AppBar` não sai, e a conversa tem área visível | fron | integração | — | B-06 | ⬜ |
| S-12 | rolado para cima, o delta que chega não puxa a lista; parado no fim, o fim acompanha | est | integração | — | B-06 | ⬜ |
| S-13 | nesta fase, a fila de permissão do topo fica recolhida numa linha ("*n* pedidos esperando") que expande | eq | integração | — | B-06 | ⬜ |

## Estados, rascunho e tela — B-07…B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-14 | desconectado → reconectando → conectado: a faixa aparece e some, a caixa não pula, e o texto escrito fica | est | integração | — | B-07 | ⬜ |
| S-15 | histórico que falhou: faixa com "tentar de novo", que recarrega sem apagar o que o stream mostrou | err | integração | — | B-07 | ⬜ |
| S-16 | aparelho pendente e push que não alcança: uma linha cada, e o toque abre a explicação inteira numa folha | eq | integração | — | B-07 | ⬜ |
| S-17 | sessão encerrada: faixa com o motivo e o aviso de que enviar retoma; enviar retoma pelo `resume_controller` e manda o prompt na sessão retomada | est | integração | — | B-07 | ⬜ |
| S-18 | retomar com o teto cheio: a recusa aparece acima da caixa com o tempo de espera, e o texto fica | err | integração | `SESSION_LIMIT_REACHED` | B-07 | ⬜ |
| S-19 | tocar na pasta abre o rascunho e não manda `session.start`; o primeiro envio manda `session.start` com modelo, modo, esforço e o prompt, e a tela passa à sessão no `session.started` | est | integração | — | B-08 | ⬜ |
| S-20 | dois toques em enviar no rascunho mandam um `session.start` | idem | integração | — | B-08 | ⬜ |
| S-21 | catálogo recusado ou ilegível no rascunho: os chips dizem o motivo, e o envio usa o padrão da instalação | err | integração | `SESSION_LIMIT_REACHED` | B-08 | ⬜ |
| S-22 | um `session.started` de outro comando no mesmo socket não leva este rascunho para a sessão errada; sair do rascunho não deixa sessão aberta | conc | integração | — | B-08 | ⬜ |
| S-23 | texto de 60 linhas: a caixa cresce até 40 % da altura e rola por dentro | fron | integração | — | B-09 | ⬜ |
| S-24 | fonte em 200 %: a `AppBar`, as faixas e o composer não cortam; a faixa longa termina em reticências e abre inteira num toque | fron | integração | — | B-09 | ⬜ |
| S-25 | girar a tela não perde o texto escrito, a rolagem nem o rascunho | est | integração | — | B-09 | ⬜ |
| S-26 | o app vai para background e volta: o socket reconecta, faz replay, e a caixa continua com o texto | est | e2e | — | B-09 | ⬜ |

## Composer — B-10…B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | a barra mostra `/`, modo, modelo, esforço (só para modelo que aceita), contexto e enviar, cada um com `Semantics` traduzido e alvo de 48 dp | eq | integração | — | B-10 | ⬜ |
| S-28 | turno rodando e caixa vazia: o botão é parar; dois toques mandam um `session.interrupt` | idem | integração | — | B-10 | ⬜ |
| S-29 | turno rodando com texto: enviar enfileira e diz isso, e o parar fica ao lado; sessão encerrada: o parar some, e enviar diz "retomar e enviar" | est | integração | — | B-10 | ⬜ |
| S-30 | abaixo da largura medida (D-06): modelo, esforço e contexto no menu de excesso; `/`, modo e enviar/parar na barra | fron | integração | — | B-10 | ⬜ |
| S-31 | o comando que não saiu (socket não pronto): a caixa não se limpa e diz por quê (01 · S-76 no componente novo) | err | integração | — | B-10 | ⬜ |
| S-32 | trocar modo ou modelo manda `session.setPermissionMode` / `session.setModel`; a recusa volta o chip ao valor anterior com o erro traduzido | err | integração | `INVALID_INPUT` | B-11 | ⬜ |
| S-33 | `bypassPermissions` nunca aparece; `acceptEdits` deixa o chip em aviso com ícone e texto | eq | unit | — | B-11 | ⬜ |
| S-34 | no rascunho, o esforço escolhe e vai no `session.start.effort`; na sessão viva, o chip é só leitura e a folha diz por quê | eq | integração | — | B-11 | ⬜ |
| S-35 | um segundo toque no chip com a troca pendente não manda outra troca | idem | integração | — | B-11 | ⬜ |
| S-36 | o botão `/` e o `/` digitado no início da caixa abrem a folha filtrada; escolher põe `/nome` e um espaço, com o cursor no fim, e nada é enviado | eq | integração | — | B-12 | ⬜ |
| S-37 | a folha de comandos que não carregou não impede enviar o que foi digitado | err | integração | — | B-12 | ⬜ |
| S-38 | `prompt.queued` acrescenta uma linha acima da caixa; `prompt.dequeued` a tira | est | integração | — | B-13 | ⬜ |
| S-39 | cancelar um prompt da fila duas vezes manda um `session.cancelQueuedPrompt` | idem | integração | — | B-13 | ⬜ |
| S-40 | cancelar o prompt que já virou turno: a recusa traduzida, e a linha sai | err | integração | `CONFLICT` | B-13 | ⬜ |
| S-41 | caixa vazia: o motivo de não enviar só no `Semantics` do botão; bloqueio real (aparelho offline, teto) na tela, acima da caixa | eq | integração | — | B-13 | ⬜ |
| S-42 | prompt recusado no meio de um desfazer: a faixa da recusa, que se fecha, e o texto preservado na caixa | err | integração | `SESSION_LOCKED` | B-13 | ⬜ |
| S-43 | o anel do contexto mostra a porcentagem; no limiar fica em aviso; a folha tem as categorias e Compactar | fron | integração | — | B-14 | ⬜ |
| S-44 | Compactar duas vezes manda um `/compact`; o `session.compacted` vira uma linha na conversa | idem | integração | — | B-14 | ⬜ |
| S-45 | medida ilegível: o anel some, a folha diz por quê, e os chips não mudam de lugar; no rascunho, o anel não aparece | err | integração | — | B-14 | ⬜ |

## Cabeçalho — B-15…B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | a `AppBar` tem título, status (cor e texto), histórico e `⋯`; os ícones de interromper, desfazer e encerrar e o texto de status do topo não existem | eq | integração | — | B-15 | ⬜ |
| S-47 | tocar no status abre a folha com o estado, o id (com copiar) e o custo; sessão sem turno não mostra "$0" | fron | integração | — | B-15 | ⬜ |
| S-48 | o histórico abre a lista de conversas da pasta; voltar devolve a sessão com a rolagem e o texto da caixa | est | integração | — | B-15 | ⬜ |
| S-49 | dono: encerrar pede confirmação, com o foco em cancelar; confirmar manda um `session.close`, mesmo com dois toques; cancelar não manda nada | idem | integração | — | B-16 | ⬜ |
| S-50 | quem não é dono: "Encerrar" desabilitado, dizendo por quê | err | integração | — | B-16 | ⬜ |
| S-51 | o menu tem desfazer (o `rewind_sheet`), regras, ajuda e copiar id; no rascunho, só regras e ajuda | eq | integração | — | B-16 | ⬜ |
| S-52 | a sessão é encerrada por outro cliente com o diálogo de encerrar aberto: o diálogo fecha, a faixa de encerrada aparece, e nada é enviado | conc | integração | — | B-16 | ⬜ |
| S-53 | a ajuda descreve a barra, o menu, o status, o indicador, o card inline, a pílula, as tarefas e as ações da mensagem, sem literal | eq | integração | — | B-17 | ⬜ |

## Processamento e thinking — B-18, B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-54 | turno começa: o indicador é a última entrada, com glifo, verbo e tempo; fim do turno, interrompido ou com erro: some, e o resumo aparece | est | integração | — | B-18 | ⬜ |
| S-55 | tool rodando: "Executando *tool*…"; pedido aberto: "Esperando sua resposta", e o toque leva ao card | eq | integração | — | B-18 | ⬜ |
| S-56 | o `liveRegion` anuncia só a troca de estado: um turno de 60 s com uma tool gera dois anúncios, não sessenta | fron | unit | — | B-18 | ⬜ |
| S-57 | `disableAnimations`: o glifo fica parado, e o texto e o tempo continuam | eq | integração | — | B-18 | ⬜ |
| S-58 | o verbo é o mesmo durante o turno inteiro, com o app indo para trás e voltando no meio; o próximo turno pode sortear outro | idem | unit | — | B-18 | ⬜ |
| S-59 | thinking: "Pensando…" animado; o bloco fecha e vira "Pensou por *n* s", recolhida, que expande num toque | est | integração | — | B-19 | ⬜ |
| S-60 | três blocos de thinking entre duas tools ficam como cinco entradas, na ordem em que vieram | eq | integração | — | B-19 | ⬜ |
| S-61 | no histórico, sem duração, a linha diz "Pensou", nunca "0 s" nem `NaN`; thinking redigido diz que existiu, sem conteúdo | fron | unit | — | B-19 | ⬜ |

## Permissão e plano inline — B-20, B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-62 | `permission.requested` de uma tool que está na conversa: o card aparece no lugar da linha dela | eq | integração | — | B-20 | ⬜ |
| S-63 | o pedido chega antes da linha da tool: o card fica na cauda e vai para o lugar dela quando a linha chega, sem duplicar | conc | integração | — | B-20 | ⬜ |
| S-64 | o card inline mostra o comando exato sem truncar em fonte de 200 %, o risco com ícone e texto, a contagem e estender o prazo | eq | integração | — | B-20 | ⬜ |
| S-65 | destrutivo e `project`/`always`: um toque não aprova, o segundo passo diz o padrão exato; com `defaultToNo`, aprovar não é o alvo mais fácil | eq | integração | — | B-20 | ⬜ |
| S-66 | o prazo vence: o card vira a linha "recusado — ninguém respondeu a tempo"; um toque depois é recusado e traduzido | est | integração | `PERMISSION_REQUEST_EXPIRED` | B-20 | ⬜ |
| S-67 | respondido no navegador: o card vira a linha com a decisão, quem respondeu e de onde, sem sumir | conc | integração | — | B-20 | ⬜ |
| S-68 | toque duplo em aprovar manda uma resposta | idem | integração | — | B-20 | ⬜ |
| S-69 | sem pedido, nada ocupa espaço, e a fila do topo não existe mais | eq | integração | — | B-20 | ⬜ |
| S-70 | `ExitPlanMode`: o plano inline; aprovar com um modo troca o chip da barra; recusar volta ao modo plan com o motivo | est | integração | — | B-21 | ⬜ |

## Nunca fora de vista, teclado e notificação — B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-71 | rolado para cima com o pedido fora de vista: a pílula "Claude espera sua resposta (*n*)" sobre a caixa; o toque rola e foca o mais antigo; com o card à vista, a pílula some | est | integração | — | B-22 | ⬜ |
| S-72 | o pedido chega com o teclado aberto e texto escrito: o teclado fica, o foco fica na caixa, e enviar manda o prompt | conc | integração | — | B-22 | ⬜ |
| S-73 | nenhum toque fora do card responde ao pedido: enviar, rolar e tocar na pílula nunca aprovam nem negam | err | integração | — | B-22 | ⬜ |
| S-74 | a notificação abre a `PermissionPage`, revalidada no servidor; "Abrir sessão" leva à conversa rolada até o card | est | e2e | — | B-22 | ⬜ |
| S-75 | push de um pedido já resolvido não abre card órfão: a tela diz como ele terminou | err | e2e | — | B-22 | ⬜ |
| S-76 | com a tela da sessão aberta, o pedido dela não gera notificação local; pedido de outra sessão notifica (D-10) | eq | integração | — | B-22 | ⬜ |

## Tarefas, linhas de sistema e ações da mensagem — B-23, B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-77 | lista do `TodoWrite`: uma linha sobre a caixa ("3/7 · tarefa atual"), que expande; sem lista, nada; com 0 e com todas concluídas, o texto certo | fron | integração | — | B-23 | ⬜ |
| S-78 | a lista atualiza ao vivo sem mexer na rolagem da conversa | est | integração | — | B-23 | ⬜ |
| S-79 | resumo do turno, compactação, replay parcial e resultado do desfazer são linhas de uma linha, na ordem em que aconteceram | eq | unit | — | B-23 | ⬜ |
| S-80 | pressionar e segurar o prompt do usuário mostra editar, bifurcar e desfazer até aqui | eq | integração | — | B-24 | ⬜ |
| S-81 | editar: a faixa "editando" acima da caixa; enviar manda `session.start` com `resumeSessionId` e `forkAt`, e a tela passa à sessão nova | est | integração | — | B-24 | ⬜ |
| S-82 | o ponto de fork que não é prompt da conversa é recusado e traduzido; o fork que o CLI recusa oferece a retomada simples | err | integração | `INVALID_INPUT`, `SESSION_FORK_REJECTED` | B-24 | ⬜ |
| S-83 | turno rodando: desfazer desabilitado com o motivo, e o backend recusando assim mesmo, o erro traduzido; sessão encerrada: a ação não aparece | err | integração | `SESSION_LOCKED` | B-24 | ⬜ |
| S-84 | as três ações existem como `Semantics` custom actions, e o TalkBack as oferece sem pressionar e segurar | eq | integração | — | B-24 | ⬜ |

## E2E — B-25…B-27

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-85 | `vertical_slice`, `permission_flow`, `rule_cycle`, `limits` e `history` verdes no layout novo, pelo robô, sem `skip` | eq | e2e | — | B-25 | ⬜ |
| S-86 | 360×640 e teclado aberto, com conversa longa: a caixa na tela no topo e no fim da rolagem, e só a conversa rola | fron | e2e | — | B-26 | ⬜ |
| S-87 | rascunho → escolher modelo, modo e esforço → enviar → a sessão nasce com eles | est | e2e | — | B-26 | ⬜ |
| S-88 | prompt → indicador → "Pensando…" → "Pensou por *n* s" → tool → card inline → aprovar (com o segundo passo, se destrutivo) → linha decidida → resumo, com a caixa visível o tempo todo | est | e2e | — | B-26 | ⬜ |
| S-89 | pedido respondido no navegador vira a linha com quem respondeu; o app vai para background no meio do pedido e volta sem duplicar nada | conc | e2e | — | B-26 | ⬜ |
| S-90 | `meetsGuideline` (alvo de toque, contraste, rótulo) sem violação em rascunho, rodando, pedindo permissão e encerrada | err | integração | — | B-27 | ⬜ |
| S-91 | rodar o `chat_layout_test` duas vezes seguidas dá o mesmo resultado, e o ciclo da S-88 em fonte de 200 % não corta o comando | idem | e2e | — | B-27 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Normas (B-01…B-04) | `est`, `conc`, `idem` | são documento, chaves, um mapa e um robô: não têm estado nem acesso concorrente, e rodar o `i18n:check` de novo é ler os mesmos arquivos. O que reprova é portão |
| Composer (B-10…B-14) | `conc` | a fila e o envio durante o turno são os do 08 (08 · S-156…S-160), provados no backend. Aqui muda só o lugar do controle, e a S-29 cobre o que muda na barra |
| Processamento e thinking (B-18, B-19) | `conc` | o indicador é derivado do status da sessão, um valor só. Dois clientes veem o mesmo status, coberto pela S-67 do lado da permissão |
| Plano inline (B-21) | `conc`, `idem` | o cartão do plano é um pedido de permissão como os outros, e a S-67 (respondido no navegador) e a S-68 (toque duplo) valem para ele sem mudar |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
