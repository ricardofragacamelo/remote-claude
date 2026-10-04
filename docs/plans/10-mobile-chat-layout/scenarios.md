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
| S-01 | `mobile/04` e `mobile/03` descrevem as três faixas, a ordem real, o card inline, a tela da notificação, o teclado e o que fica fora do app; `docs:check` verde | eq | unit | — | B-01 | ✅ |
| S-02 | toda chave nova existe nos ARB `en` e `pt-BR`; a chave cujo uso saiu sai dos dois; chave órfã reprova o `i18n:check` | err | unit | — | B-02 | ✅ |
| S-03 | um texto do mapa que diverge entre o web e o app, em `en` ou em `pt-BR`, reprova o `i18n:check`, dizendo as duas chaves e os dois textos | err | unit | — | B-03 | ✅ |
| S-04 | o vigésimo verbo existe no web e falta no app: o `i18n:check` reprova; com o mapa completo e igual, passa | fron | unit | — | B-03 | ✅ |
| S-05 | `vertical_slice`, `permission_flow`, `rule_cycle`, `limits` e `history` passam pelo robô sem mudar o que afirmam, e o robô acha cada controle por semântica | eq | e2e | — | B-04 | ✅ |

## A conversa e a moldura — B-05, B-06

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-06 | mensagem, tool, mensagem: três entradas na ordem do `seq` (hoje a tool vai para depois das duas) | eq | unit | — | B-05 | ✅ |
| S-07 | frame com `seq` repetido e replay depois de reconectar não duplicam entrada; `gap` limpa e recarrega | idem | unit | — | B-05 | ✅ |
| S-08 | fragmentos de `thinking` viram uma entrada de thinking, e nunca entram no texto da resposta, nem quando o `message.completed` chega | est | unit | — | B-05 | ✅ |
| S-09 | `blockType` que o app não conhece é ignorado com log em `debug`; texto de subagent (`parentToolUseId`) continua fora | err | unit | — | B-05 | ✅ |
| S-10 | 300 entradas em 360×640: só a lista rola; a `AppBar` e o composer ficam na tela | fron | integração | — | B-06 | ✅ |
| S-11 | teclado aberto em 360×400: o composer fica acima do teclado, a `AppBar` não sai, e a conversa tem área visível | fron | integração | — | B-06 | ✅ |
| S-12 | rolado para cima, o delta que chega não puxa a lista; parado no fim, o fim acompanha | est | integração | — | B-06 | ✅ |
| S-13 | nesta fase, a fila de permissão do topo fica recolhida numa linha ("*n* pedidos esperando") que expande | eq | integração | — | B-06 | ✅ |

## Estados, rascunho e tela — B-07…B-09

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-14 | desconectado → reconectando → conectado: a faixa aparece e some, a caixa não pula, e o texto escrito fica | est | integração | — | B-07 | ✅ |
| S-15 | histórico que falhou: faixa com "tentar de novo", que recarrega sem apagar o que o stream mostrou | err | integração | — | B-07 | ✅ |
| S-16 | aparelho pendente e push que não alcança: uma linha cada, e o toque abre a explicação inteira numa folha | eq | integração | — | B-07 | ✅ |
| S-17 | sessão encerrada: faixa com o motivo e o aviso de que enviar retoma; enviar retoma pelo `resume_controller` e manda o prompt na sessão retomada | est | integração | — | B-07 | ✅ |
| S-18 | retomar com o teto cheio: a recusa aparece acima da caixa com o tempo de espera, e o texto fica | err | integração | `SESSION_LIMIT_REACHED` | B-07 | ✅ |
| S-19 | tocar na pasta abre o rascunho e não manda `session.start`; o primeiro envio manda `session.start` com modelo, modo, esforço e o prompt, e a tela passa à sessão no `session.started` | est | integração | — | B-08 | ✅ |
| S-20 | dois toques em enviar no rascunho mandam um `session.start` | idem | integração | — | B-08 | ✅ |
| S-21 | catálogo recusado ou ilegível no rascunho: os chips dizem o motivo, e o envio usa o padrão da instalação | err | integração | `SESSION_LIMIT_REACHED` | B-08 | ✅ |
| S-22 | um `session.started` de outro comando no mesmo socket não leva este rascunho para a sessão errada; sair do rascunho não deixa sessão aberta | conc | integração | — | B-08 | ✅ |
| S-23 | texto de 60 linhas: a caixa cresce até 40 % da altura e rola por dentro | fron | integração | — | B-09 | ✅ |
| S-24 | fonte em 200 %: a `AppBar`, as faixas e o composer não cortam; a faixa longa termina em reticências e abre inteira num toque | fron | integração | — | B-09 | ✅ |
| S-25 | girar a tela não perde o texto escrito, a rolagem nem o rascunho | est | integração | — | B-09 | ✅ |
| S-26 | o app vai para background e volta: o socket reconecta, faz replay, e a caixa continua com o texto | est | e2e | — | B-09 | ✅ |

## Composer — B-10…B-14

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | a barra mostra `/`, modo, modelo, esforço (só para modelo que aceita), contexto e enviar, cada um com `Semantics` traduzido e alvo de 48 dp | eq | integração | — | B-10 | ✅ |
| S-28 | turno rodando e caixa vazia: o botão é parar; dois toques mandam um `session.interrupt` | idem | integração | — | B-10 | ✅ |
| S-29 | turno rodando com texto: enviar enfileira e diz isso, e o parar fica ao lado; sessão encerrada: o parar some, e enviar diz "retomar e enviar" | est | integração | — | B-10 | ✅ |
| S-30 | abaixo da largura medida (D-06): modelo, esforço e contexto no menu de excesso; `/`, modo e enviar/parar na barra | fron | integração | — | B-10 | ✅ |
| S-31 | o comando que não saiu (socket não pronto): a caixa não se limpa e diz por quê (01 · S-76 no componente novo) | err | integração | — | B-10 | ✅ |
| S-32 | trocar modo ou modelo manda `session.setPermissionMode` / `session.setModel`; a recusa volta o chip ao valor anterior com o erro traduzido | err | integração | `INVALID_INPUT` | B-11 | ✅ |
| S-33 | `bypassPermissions` nunca aparece; `acceptEdits` deixa o chip em aviso com ícone e texto | eq | unit | — | B-11 | ✅ |
| S-34 | no rascunho, o esforço escolhe e vai no `session.start.effort`; na sessão viva, o chip é só leitura e a folha diz por quê | eq | integração | — | B-11 | ✅ |
| S-35 | um segundo toque no chip com a troca pendente não manda outra troca | idem | integração | — | B-11 | ✅ |
| S-36 | o botão `/` e o `/` digitado no início da caixa abrem a folha filtrada; escolher põe `/nome` e um espaço, com o cursor no fim, e nada é enviado | eq | integração | — | B-12 | ✅ |
| S-37 | a folha de comandos que não carregou não impede enviar o que foi digitado | err | integração | — | B-12 | ✅ |
| S-38 | `prompt.queued` acrescenta uma linha acima da caixa; `prompt.dequeued` a tira | est | integração | — | B-13 | ✅ |
| S-39 | cancelar um prompt da fila duas vezes manda um `session.cancelQueuedPrompt` | idem | integração | — | B-13 | ✅ |
| S-40 | cancelar o prompt que já virou turno: a recusa traduzida, e a linha sai | err | integração | `CONFLICT` | B-13 | ✅ |
| S-41 | caixa vazia: o motivo de não enviar só no `Semantics` do botão; bloqueio real (aparelho offline, teto) na tela, acima da caixa | eq | integração | — | B-13 | ✅ |
| S-42 | prompt recusado no meio de um desfazer: a faixa da recusa, que se fecha, e o texto preservado na caixa | err | integração | `SESSION_LOCKED` | B-13 | ✅ |
| S-43 | o anel do contexto mostra a porcentagem; no limiar fica em aviso; a folha tem as categorias e Compactar | fron | integração | — | B-14 | ✅ |
| S-44 | Compactar duas vezes manda um `/compact`; o `session.compacted` vira uma linha na conversa | idem | integração | — | B-14 | ✅ |
| S-45 | medida ilegível: o anel some, a folha diz por quê, e os chips não mudam de lugar; no rascunho, o anel não aparece | err | integração | — | B-14 | ✅ |

## Cabeçalho — B-15…B-17

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-46 | a `AppBar` tem título, status (cor e texto), histórico e `⋯`; os ícones de interromper, desfazer e encerrar e o texto de status do topo não existem | eq | integração | — | B-15 | ✅ |
| S-47 | tocar no status abre a folha com o estado, o id (com copiar) e o custo; sessão sem turno não mostra "$0" | fron | integração | — | B-15 | ✅ |
| S-48 | o histórico abre a lista de conversas da pasta; voltar devolve a sessão com a rolagem e o texto da caixa | est | integração | — | B-15 | ✅ |
| S-49 | dono: encerrar pede confirmação, com o foco em cancelar; confirmar manda um `session.close`, mesmo com dois toques; cancelar não manda nada | idem | integração | — | B-16 | ✅ |
| S-50 | quem não é dono: "Encerrar" desabilitado, dizendo por quê | err | integração | — | B-16 | ✅ |
| S-51 | o menu tem desfazer (o `rewind_sheet`), regras, ajuda e copiar id; no rascunho, só regras e ajuda | eq | integração | — | B-16 | ✅ |
| S-52 | a sessão é encerrada por outro cliente com o diálogo de encerrar aberto: o diálogo fecha, a faixa de encerrada aparece, e nada é enviado | conc | integração | — | B-16 | ✅ |
| S-53 | a ajuda descreve a barra, o menu, o status, o indicador, o card inline, a pílula, as tarefas e as ações da mensagem, sem literal | eq | integração | — | B-17 | ✅ |

## Processamento e thinking — B-18, B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-54 | turno começa: o indicador é a última entrada, com glifo, verbo e tempo; fim do turno, interrompido ou com erro: some, e o resumo aparece | est | integração | — | B-18 | ✅ |
| S-55 | tool rodando: "Executando *tool*…"; pedido aberto: "Esperando sua resposta", e o toque leva ao card | eq | integração | — | B-18 | ✅ |
| S-56 | o `liveRegion` anuncia só a troca de estado: um turno de 60 s com uma tool gera dois anúncios, não sessenta | fron | unit | — | B-18 | ✅ |
| S-57 | `disableAnimations`: o glifo fica parado, e o texto e o tempo continuam | eq | integração | — | B-18 | ✅ |
| S-58 | o verbo é o mesmo durante o turno inteiro, com o app indo para trás e voltando no meio; o próximo turno pode sortear outro | idem | unit | — | B-18 | ✅ |
| S-59 | thinking: "Pensando…" animado; o bloco fecha e vira "Pensou por *n* s", recolhida, que expande num toque | est | integração | — | B-19 | ✅ |
| S-60 | três blocos de thinking entre duas tools ficam como cinco entradas, na ordem em que vieram | eq | integração | — | B-19 | ✅ |
| S-61 | no histórico, sem duração, a linha diz "Pensou", nunca "0 s" nem `NaN`; thinking redigido diz que existiu, sem conteúdo | fron | unit | — | B-19 | ✅ |

## Permissão e plano inline — B-20, B-21

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-62 | `permission.requested` de uma tool que está na conversa: o card aparece no lugar da linha dela | eq | integração | — | B-20 | ✅ |
| S-63 | o pedido chega antes da linha da tool: o card fica na cauda e vai para o lugar dela quando a linha chega, sem duplicar | conc | integração | — | B-20 | ✅ |
| S-64 | o card inline mostra o comando exato sem truncar em fonte de 200 %, o risco com ícone e texto, a contagem e estender o prazo | eq | integração | — | B-20 | ✅ |
| S-65 | destrutivo e `project`/`always`: um toque não aprova, o segundo passo diz o padrão exato; com `defaultToNo`, aprovar não é o alvo mais fácil | eq | integração | — | B-20 | ✅ |
| S-66 | o prazo vence: o card vira a linha "recusado — ninguém respondeu a tempo"; um toque depois é recusado e traduzido | est | integração | `PERMISSION_REQUEST_EXPIRED` | B-20 | ✅ |
| S-67 | respondido no navegador: o card vira a linha com a decisão, quem respondeu e de onde, sem sumir | conc | integração | — | B-20 | ✅ |
| S-68 | toque duplo em aprovar manda uma resposta | idem | integração | — | B-20 | ✅ |
| S-69 | sem pedido, nada ocupa espaço, e a fila do topo não existe mais | eq | integração | — | B-20 | ✅ |
| S-70 | `ExitPlanMode`: o plano inline; aprovar com um modo troca o chip da barra; recusar volta ao modo plan com o motivo | est | integração | — | B-21 | ✅ |

## Nunca fora de vista, teclado e notificação — B-22

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-71 | rolado para cima com o pedido fora de vista: a pílula "Claude espera sua resposta (*n*)" sobre a caixa; o toque rola e foca o mais antigo; com o card à vista, a pílula some | est | integração | — | B-22 | ✅ |
| S-72 | o pedido chega com o teclado aberto e texto escrito: o teclado fica, o foco fica na caixa, e enviar manda o prompt | conc | integração | — | B-22 | ✅ |
| S-73 | nenhum toque fora do card responde ao pedido: enviar, rolar e tocar na pílula nunca aprovam nem negam | err | integração | — | B-22 | ✅ |
| S-74 | a notificação abre a `PermissionPage`, revalidada no servidor; "Abrir sessão" leva à conversa rolada até o card | est | e2e | — | B-22 | ✅ |
| S-75 | push de um pedido já resolvido não abre card órfão: a tela diz como ele terminou | err | e2e | — | B-22 | ✅ |
| S-76 | com a tela da sessão aberta, o pedido dela não gera notificação local; pedido de outra sessão notifica (D-10) | eq | integração | — | B-22 | ✅ |

## Tarefas, linhas de sistema e ações da mensagem — B-23, B-24

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-77 | lista do `TodoWrite`: uma linha sobre a caixa ("3/7 · tarefa atual"), que expande; sem lista, nada; com 0 e com todas concluídas, o texto certo | fron | integração | — | B-23 | ✅ |
| S-78 | a lista atualiza ao vivo sem mexer na rolagem da conversa | est | integração | — | B-23 | ✅ |
| S-79 | resumo do turno, compactação, replay parcial e resultado do desfazer são linhas de uma linha, na ordem em que aconteceram | eq | unit | — | B-23 | ✅ |
| S-80 | pressionar e segurar o prompt do usuário mostra editar, bifurcar e desfazer até aqui | eq | integração | — | B-24 | ✅ |
| S-81 | editar: a faixa "editando" acima da caixa; enviar manda `session.start` com `resumeSessionId` e `forkAt`, e a tela passa à sessão nova | est | integração | — | B-24 | ✅ |
| S-82 | o ponto de fork que não é prompt da conversa é recusado e traduzido; o fork que o CLI recusa oferece a retomada simples | err | integração | `INVALID_INPUT`, `SESSION_FORK_REJECTED` | B-24 | ✅ |
| S-83 | turno rodando: desfazer desabilitado com o motivo, e o backend recusando assim mesmo, o erro traduzido; sessão encerrada: a ação não aparece | err | integração | `SESSION_LOCKED` | B-24 | ✅ |
| S-84 | as três ações existem como `Semantics` custom actions, e o TalkBack as oferece sem pressionar e segurar | eq | integração | — | B-24 | ✅ |

## Endereço de conexão — B-25…B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-85 | o spike registra o `iss`, a JWKS e o discovery pela origem do proxy e pela porta direta, e a D-15 fecha com a medida | eq | integração | — | B-25 | ✅ |
| S-86 | token emitido pela origem interna e token emitido pela externa são aceitos no HTTP e no handshake do WS | eq | integração | — | B-26 | ✅ |
| S-87 | token de issuer fora da lista: `401`, e o passo que falhou só no log | err | integração | `UNAUTHENTICATED` | B-26 | ✅ |
| S-88 | a lista com um issuer só se comporta como a configuração de hoje; lista vazia ou issuer inválido não deixa o processo subir | fron | unit | — | B-26 | ✅ |
| S-89 | rajada de tokens dos dois issuers no boot: cada discovery e cada JWKS é lido uma vez | conc | unit | — | B-26 | ✅ |
| S-90 | o discovery de um issuer cai: ele mantém o último documento bom, e o outro issuer não é afetado | est | unit | — | B-26 | ✅ |
| S-91 | no modo local, o servidor do web encaminha `/api` (sem o prefixo), `/ws`, `/realms` e `/resources`; o console admin não passa | eq | integração | — | B-27 | ✅ |
| S-92 | o dev e o e2e geram `RC_INTERNAL_URL`, `RC_EXTERNAL_URL` e `RC_OIDC_REALM_PATH`, e não geram mais `RC_API_URL`, `RC_WS_URL` nem `RC_OIDC_ISSUER`; o `adb reverse` inclui a porta do web | eq | unit | — | B-27 | ✅ |
| S-93 | `https://x.example` dá API `https://x.example/api`, WS `wss://x.example/ws` e issuer `https://x.example/realms/<realm>`; `http://localhost:5173` dá `ws://` | eq | unit | — | B-28 | ✅ |
| S-94 | barra no fim, porta explícita, host em maiúsculas e IPv6 entre colchetes dão a mesma origem normalizada | fron | unit | — | B-28 | ✅ |
| S-95 | no release, `http://` para `192.168.0.10`, `10.0.0.5` ou um nome qualquer é recusado com o motivo; `http://localhost` e `http://127.0.0.1` passam (a rede privada no debug é a [S-121](#f6--instalação-por-usb)) | fron | unit | — | B-28 | ✅ |
| S-96 | caminho, query, fragmento, usuário, esquema que não é http(s) ou texto vazio são recusados, cada um com o seu motivo | err | unit | — | B-28 | ✅ |
| S-97 | sem escolha guardada: com o interno definido, vale o interno; só o externo, o externo; nenhum dos dois, a tela de endereço abre | eq | integração | — | B-28 | ✅ |
| S-98 | a escolha e o texto do **Outro** sobrevivem a reiniciar o app e ao logout; o `clear()` das credenciais não toca nas chaves `rc.connection.*`; o texto do **Outro** fica com outro radio marcado | est | unit | — | B-28 | ✅ |
| S-99 | valor guardado ilegível ou de versão desconhecida: vale o padrão, com um `warn`, e o app não cai | err | unit | — | B-28 | ✅ |
| S-100 | a escolha guardada é o interno, e o build novo não o define: vale o padrão, e a tela diz por quê | fron | integração | — | B-28 | ✅ |
| S-101 | trocar de origem com o login aberto: confirmação; ao confirmar, as credenciais saem, o socket e o cliente HTTP vão para a origem nova e a tela volta ao login | est | integração | — | B-28 | ✅ |
| S-102 | trocar de origem com um pedido e uma reconexão em voo: a resposta da origem velha é descartada, e nenhum token velho chega à origem nova | conc | unit | — | B-28 | ✅ |
| S-103 | salvar a mesma escolha de novo não encerra o login nem reconecta | idem | unit | — | B-28 | ✅ |
| S-104 | três radios com o endereço por extenso; o radio de define vazio fica desabilitado, com o motivo | eq | integração | — | B-29 | ✅ |
| S-105 | o campo do **Outro** só se habilita com o radio dele; Salvar fica desabilitado com endereço inválido, e o motivo fica à vista | est | integração | — | B-29 | ✅ |
| S-106 | Testar: health e discovery ok dá sucesso; servidor fora do alcance e login indisponível dão cada um a sua mensagem traduzida | err | integração | — | B-29 | ✅ |
| S-107 | tocar Testar duas vezes, ou Salvar com o teste em voo, faz um pedido só, e o botão fica desabilitado enquanto isso | conc | integração | — | B-29 | ✅ |
| S-108 | sem login, a tela abre pela tela de entrada (o `redirectFor` não a desvia); com login, pelo menu; voltar devolve a tela de origem | eq | integração | — | B-29 | ✅ |
| S-109 | a ajuda da tela, as chaves nos dois ARB e `meetsGuideline` sem violação, também em fonte de 200 % | eq | integração | — | B-29 | ✅ |

## F6 — Instalação por USB

### A origem da rede privada — B-34

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-121 | no debug, `http://192.168.0.10:5173`, `http://10.0.0.5` e `http://172.20.1.2:80` são origens válidas, normalizadas | eq | unit | — | B-34 | ✅ |
| S-122 | as bordas das faixas: `10.0.0.0`, `10.255.255.255`, `172.16.0.0`, `172.31.255.255`, `192.168.0.0`, `192.168.255.255` passam; `9.255.255.255`, `11.0.0.0`, `172.15.255.255`, `172.32.0.0`, `192.167.255.255`, `192.169.0.0` não | fron | unit | `plainText` | B-34 | ✅ |
| S-123 | no debug, `http://` para IP público, para nome (`server.local`), para IPv4 malformado (`10.0.0.256`, `10.0.0`) e para IPv6 é recusado | err | unit | `plainText` | B-34 | ✅ |
| S-124 | no release, `http://192.168.0.10` é recusado — a D-14 inteira — e o build compilado com ele não sobe, dizendo qual define | est | unit | `plainText` · `ConfigurationError` | B-34 | ✅ |
| S-125 | na tela de endereço, o **Outro** com `http://10.0.0.5:5173` habilita Salvar; com `http://203.0.113.10` mostra o motivo, que fala da rede local | eq | integração | — | B-34 | ✅ |
| S-126 | o debug libera texto puro na plataforma e o release continua sem config de rede nenhuma | est | unit | — | B-34 | ✅ |

### A stack pela rede — B-35

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-127 | `lanAddress` pula `docker0`, `br-*`, `veth*`, `tun0`, `wg0` e escolhe o IPv4 privado da interface física, mesmo listada depois | eq | unit | — | B-35 | ✅ |
| S-128 | só loopback e interfaces virtuais, ou nenhuma interface: não há IP da rede (`null`) | fron | unit | — | B-35 | ✅ |
| S-129 | `RC_LAN_ADDRESS` válido vence a descoberta; inválido (`10.0.0`, `nope`) é recusado com o nome da variável | err | unit | — | B-35 | ✅ |
| S-130 | `withWebIssuer` com o IP da rede soma o issuer do web pela rede ao do `localhost`; aplicado duas vezes, não repete | idem | unit | — | B-35 | ✅ |
| S-131 | o servidor do web escuta em todas as interfaces no modo local, e no público continua só com o host do túnel | eq | unit | — | B-35 | ✅ |
| S-132 | a origem do túnel gravada em `.run/public-origin` é lida de volta; arquivo ausente, vazio ou com algo que não é origem `https` vira "nenhuma" | err | unit | — | B-35 | ✅ |

### `pnpm mobile:install` — B-36

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-133 | interno: `RC_INTERNAL_URL` do `.env` vence; sem ele, `http://<IP da rede>:<RC_WEB_PORT>`. Externo: `RC_EXTERNAL_URL` → `RC_PUBLIC_URL` → origem gravada → vazio. Cada um com a sua origem dita | eq | unit | — | B-36 | ✅ |
| S-134 | sem IP da rede e sem `RC_INTERNAL_URL`, e sem externo nenhum: recusa antes do build, dizendo o que configurar | fron | unit | — | B-36 | ✅ |
| S-135 | externo que não é origem `https` (`http://x.example`, `x.example/path`) é recusado, com a variável ou o arquivo de onde veio | err | unit | — | B-36 | ✅ |
| S-136 | `adb devices -l`: só aparelho USB conta; emulador fica de fora, `unauthorized` e `offline` são recusados com o motivo; zero, um, dois com e sem `--device`, `--device` que não está ligado | fron | unit | — | B-36 | ✅ |
| S-137 | `--dry-run` imprime interno, externo e realm, com a origem de cada um, e não chama `flutter` nem `adb install` | eq | integração | — | B-36 | ✅ |
| S-138 | com `flutter` e `adb` entregues ao `buildAndInstall`: compila o APK de debug com os defines e instala com `adb -s <serial> install -r`; rodar de novo faz o mesmo. Pelo processo, o build real pararia os daemons do Gradle de quem mais estiver compilando na máquina | idem | unit | — | B-36 | ✅ |
| S-139 | nenhum aparelho no cabo, aparelho `unauthorized`, SDK sem `adb` ou Flutter fora do PATH: sai 1 com o motivo e a dica, antes do build (integração); build que falha não instala, e o `adb install` recusado (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) diz o que fazer (unit) | err | integração | — | B-36 | ✅ |
| S-140 | num celular de verdade no cabo: instala; sem o cabo, na mesma rede, o app entra pelo interno e abre uma sessão; com o `pnpm dev:public` de pé, entra pelo externo | est | e2e (manual) | — | B-37 | ⬜ |


## F7…F9 — Pastas e sessões no app

### As pastas abertas — B-38…B-40

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-141 | `GET /workspaces/open-folders` vira a lista na ordem do servidor, com o rótulo da raiz e o estado; `recent` vira as recentes com fixada, data e disponível | eq | unit | — | B-38 | ✅ |
| S-142 | corpo fora do formato (campo faltando, estado desconhecido, data inválida) vira `Failure` de dados malformados, e o log diz qual campo | err | unit | — | B-38 | ✅ |
| S-143 | abrir: `201` e `200` dão a mesma aba; `409` vira a recusa com o teto (`OPEN_FOLDERS_LIMIT_REACHED`, `params.limit`); `403`/`404`/`422` viram o motivo da pasta | err | unit | `OPEN_FOLDERS_LIMIT_REACHED` · `WORKSPACE_NOT_ALLOWED` · `WORKSPACE_NOT_FOUND` · `WORKSPACE_NOT_A_DIRECTORY` | B-38 | ✅ |
| S-144 | fechar e esquecer respondem `204` também para o que não estava lá: chamar duas vezes dá o mesmo resultado | idem | unit | — | B-38 | ✅ |
| S-145 | o seletor: as raízes, depois um nível de subpastas por vez, "subir" até a raiz e nunca acima (`parent` nulo); listagem cortada diz que foi cortada | fron | integração | `WORKSPACE_DIRECTORY_UNREADABLE` | B-39 | ✅ |
| S-146 | a tela Pastas é a rota inicial depois do login; o ping fica no diagnóstico | est | integração | — | B-39 | ✅ |
| S-147 | abertas no alto, na ordem; recentes que não estão abertas abaixo, fixadas primeiro; vazio das duas diz o que fazer | eq | integração | — | B-39 | ✅ |
| S-148 | pasta aberta `missing` ou `notAllowed` aparece marcada, com o motivo, e não abre | err | integração | — | B-39 | ✅ |
| S-149 | fechar uma pasta diz que nenhuma sessão é encerrada, e a tira da lista; tocar numa recente a abre e a move para as abertas | est | integração | — | B-39 | ✅ |
| S-150 | carregando, erro com tentar de novo e conteúdo; puxar relê; ajuda da tela; a tela passa nas diretrizes de acessibilidade em fonte 200 % | err | integração | — | B-39 | ✅ |
| S-151 | cada pasta aberta mostra suas sessões vivas e a soma dos pedidos; uma contagem que falhou vira "—" sem derrubar as outras | conc | integração | — | B-40 | ✅ |
| S-152 | as contagens são relidas ao voltar à tela; uma resposta que chega depois de uma releitura mais nova é descartada | conc | unit | — | B-40 | ✅ |

### A tela da pasta — B-41…B-43

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-153 | `GET /sessions` vira a lista de `LiveSessionSummary`, com todos os campos; lista vazia é resposta, não erro | eq | unit | — | B-41 | ✅ |
| S-154 | status ou origem que o app não conhece vira "desconhecido", e o log diz qual; corpo malformado vira `Failure` | err | unit | — | B-41 | ✅ |
| S-155 | pasta fora das raízes, sumida ou arquivo: o motivo, traduzido, no lugar da lista | err | unit | `WORKSPACE_NOT_ALLOWED` · `WORKSPACE_NOT_FOUND` · `WORKSPACE_NOT_A_DIRECTORY` | B-41 | ✅ |
| S-156 | a linha diz status · modelo · há quanto tempo, a subpasta quando não é a própria, de onde foi aberta e "*n* esperando você" | eq | integração | — | B-42 | ✅ |
| S-157 | Nova sessão abre o rascunho da pasta; sem conexão, fica desligada com o motivo | est | integração | — | B-42 | ✅ |
| S-158 | tocar numa sessão aberta a abre e a põe no registro (F9) | est | integração | — | B-42 | ✅ |
| S-159 | o histórico mostra a primeira página e "Ver todas"; a falha do histórico não esconde as abertas, e o contrário | err | integração | — | B-42 | ✅ |
| S-160 | nenhuma sessão aberta: "Nenhuma sessão aberta nesta pasta", com Nova sessão à vista | fron | integração | — | B-42 | ✅ |
| S-161 | a lista é relida ao voltar da sessão e ao puxar; voltar duas vezes não duplica linhas | idem | integração | — | B-42 | ✅ |
| S-162 | o rascunho e a sessão abertos da pasta voltam a ela; o que se abre por endereço (a sessão, o pedido de uma notificação) tem as Pastas por baixo ([D-29](decisions.md#f7f9--pastas-e-sessões-no-app)) | est | integração | — | B-43 | ✅ |

### Várias sessões abertas — B-44…B-47

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-163 | abrir da pasta, nascer do rascunho, retomar do histórico e chegar por notificação põem a sessão no registro da pasta, na ordem | eq | unit | — | B-44 | ✅ |
| S-164 | pôr a mesma sessão duas vezes não a duplica | idem | unit | — | B-44 | ✅ |
| S-165 | sair da tela de uma sessão do registro **não** solta o `follow`; fechar no app solta, e o `unfollow` sai uma vez | est | unit | — | B-44 | ✅ |
| S-166 | uma sessão encerrada fica no registro, encerrada, até ser fechada | est | unit | — | B-44 | ✅ |
| S-167 | o painel abre pela borda e pelo ícone da pasta, lista só as sessões da mesma pasta, na ordem, com a da tela marcada; com uma sessão só, existe e oferece Nova sessão | fron | integração | — | B-45 | ✅ |
| S-168 | tocar numa linha do painel troca de sessão sem empilhar telas e fecha o painel: voltar sai para a pasta, não para a sessão anterior | est | integração | — | B-45 | ✅ |
| S-169 | pressionar e segurar: Fechar no app (diz que não encerra) e Encerrar (com a confirmação); Nova sessão abre o rascunho da pasta; Todas as sessões leva à tela da pasta | eq | integração | — | B-45 | ✅ |
| S-170 | dez sessões abertas: o painel rola, e em 360×640 com fonte 200 % nenhuma linha corta o texto; o painel passa nas diretrizes de acessibilidade | fron | integração | — | B-45 | ✅ |
| S-171 | um pedido numa sessão fora da tela acende a linha dela no painel e o ponto do ícone da pasta; trocar para ela rola até o card | conc | integração | — | B-46 | ✅ |
| S-172 | eventos de duas sessões abertas chegando juntos vão cada um para a sua conversa, sem mistura | conc | unit | — | B-46 | ✅ |
| S-173 | reconectar o socket refaz o `follow` de todas as sessões do registro, cada uma do seu ponto | est | unit | — | B-46 | ✅ |
| S-174 | as chaves novas nos dois ARB, sem órfã, e a ajuda das três telas | eq | unit | — | B-47 | ✅ |
| S-175 | e2e: abrir uma pasta pelo seletor a abre no app e nas abas do navegador; fechar no app tira das duas e não encerra sessão | conc | e2e | — | B-48 | ⬜ |
| S-176 | e2e: a tela da pasta lista a sessão aberta no navegador, e tocar nela anexa | eq | e2e | — | B-48 | ⬜ |
| S-177 | e2e: duas sessões da pasta no painel lateral; um pedido na que não está na tela acende a linha dela, e trocar leva ao card | conc | e2e | — | B-48 | ⬜ |
| S-178 | e2e: no teto de pastas abertas, abrir mais uma é recusado com o teto e a saída | err | e2e | `OPEN_FOLDERS_LIMIT_REACHED` | B-48 | ⬜ |

## E2E — B-30…B-33

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-110 | primeira abertura no emulador: o interno, pelo encaminhamento, entra e abre uma sessão | eq | e2e | — | B-30 | ⬜ |
| S-111 | **Outro** com a mesma origem: o login encerra, entrar de novo funciona, e depois de fechar e reabrir o app o **Outro** continua escolhido, com o texto | est | e2e | — | B-30 | ⬜ |
| S-112 | `http://` para um IP público ou um nome é recusado com o motivo (o IP da rede privada passa no debug, [D-20](decisions.md#f6--instalação-por-usb)), e testar uma origem fora do alcance mostra o erro | err | e2e | — | B-30 | ⬜ |
| S-113 | todas as suítes do app verdes com a forma nova de subir, rodadas duas vezes seguidas com o mesmo resultado | idem | e2e | — | B-30 | ⬜ |
| S-114 | `vertical_slice`, `permission_flow`, `rule_cycle`, `limits` e `history` verdes no layout novo, pelo robô, sem `skip` | eq | e2e | — | B-31 | ⬜ |
| S-115 | 360×640 e teclado aberto, com conversa longa: a caixa na tela no topo e no fim da rolagem, e só a conversa rola | fron | e2e | — | B-32 | ⬜ |
| S-116 | rascunho → escolher modelo, modo e esforço → enviar → a sessão nasce com eles | est | e2e | — | B-32 | ⬜ |
| S-117 | prompt → indicador → "Pensando…" → "Pensou por *n* s" → tool → card inline → aprovar (com o segundo passo, se destrutivo) → linha decidida → resumo, com a caixa visível o tempo todo | est | e2e | — | B-32 | ⬜ |
| S-118 | pedido respondido no navegador vira a linha com quem respondeu; o app vai para background no meio do pedido e volta sem duplicar nada | conc | e2e | — | B-32 | ⬜ |
| S-119 | `meetsGuideline` (alvo de toque, contraste, rótulo) sem violação em rascunho, rodando, pedindo permissão e encerrada | err | integração | — | B-33 | ⬜ |
| S-120 | rodar o `chat_layout_test` duas vezes seguidas dá o mesmo resultado, e o ciclo da S-117 em fonte de 200 % não corta o comando | idem | e2e | — | B-33 | ⬜ |

---

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| Normas (B-01…B-04) | `est`, `conc`, `idem` | são documento, chaves, um mapa e um robô: não têm estado nem acesso concorrente, e rodar o `i18n:check` de novo é ler os mesmos arquivos. O que reprova é portão |
| Composer (B-10…B-14) | `conc` | a fila e o envio durante o turno são os do 08 (08 · S-156…S-160), provados no backend. Aqui muda só o lugar do controle, e a S-29 cobre o que muda na barra |
| Processamento e thinking (B-18, B-19) | `conc` | o indicador é derivado do status da sessão, um valor só. Dois clientes veem o mesmo status, coberto pela S-67 do lado da permissão |
| Plano inline (B-21) | `conc`, `idem` | o cartão do plano é um pedido de permissão como os outros, e a S-67 (respondido no navegador) e a S-68 (toque duplo) valem para ele sem mudar |
| Spike do login (B-25) | `fron`, `err`, `est`, `conc`, `idem` | é uma medida, não um comportamento: o que ela produz é a D-15, e os cenários do comportamento são os da B-26 |
| Encaminhamento (B-27) | `est`, `conc`, `idem` | o encaminhamento não guarda estado; a concorrência e a repetição do caminho são as do plano 20, que ele reusa sem mudar |
| Instalação por USB (B-34…B-37) | `conc` | duas instalações no mesmo aparelho ao mesmo tempo são o `adb` contra ele mesmo, e o `install -r` é atômico do lado do Android. A stack do `pnpm dev` de pé ou não durante a instalação é a S-137…S-139: instalar não depende dela |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
