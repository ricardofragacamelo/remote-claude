# Plano 02 — Matriz de cenários

Exigida pelo [Estágio 0 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-0--plano-e-matriz-de-cenários).
**Escrita antes do código**, enumerada pelas seis dimensões.

Plano: [README.md](README.md) · Progresso: [progress.md](progress.md)

**Dimensões:** `eq` equivalência · `fron` fronteira · `err` erro · `est` transição de estado ·
`conc` concorrência · `idem` idempotência

**Estado:** ⬜ não escrito · 🟡 escrito, falhando · ✅ passando · ⛔ bloqueado

---

## Device — B-01…B-07

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-01 | registro de aparelho novo nasce **pendente** | eq | integração | — | B-03 | ✅ |
| S-02 | registro repetido do mesmo `installId` **do mesmo usuário** atualiza, não duplica | idem | integração | — | B-02 | ✅ |
| S-03 | device pendente **pode** observar sessão | eq | integração | — | B-05 | ✅ |
| S-04 | device pendente tentando resolver permissão | err | integração | `DEVICE_NOT_REGISTERED` | B-05 | ✅ |
| S-05 | device revogado tentando resolver permissão | err | integração | `DEVICE_REVOKED` | B-05 | ✅ |
| S-06 | aparelho tentando aprovar a si mesmo | err | integração | `FORBIDDEN` | B-06 | ✅ |
| S-07 | revogar fecha as connections daquele device **na hora**, com `4401` | est | integração | — | B-04 | ✅ |
| S-08 | revogar faz a credencial daquele device parar de valer aqui, em todo transporte ([D-18](decisions.md#d-18--o-que-a-revogação-consegue-prometer)) | est | integração | — | B-04 | ✅ |
| S-09 | revogar device já revogado é no-op bem-sucedido | idem | integração | — | B-04 | ✅ |
| S-10 | aprovar e revogar concorrentes terminam num estado determinístico | conc | integração | — | B-03 | ✅ |
| S-11 | device sem `locale` cai no fallback `en` | fron | unit | — | B-01 | ✅ |
| S-12 | registro sem push token é aceito — o aparelho ainda serve para observar | fron | unit | — | B-01 | ✅ |
| S-13 | registro, aprovação e revogação entram em `audit` | eq | integração | — | B-03 | ✅ |
| S-14 | push token nunca aparece inteiro no log — só os seis últimos | err | unit | — | B-07 | ✅ |
| S-59 | mesmo `installId` de **outro** usuário cria linha própria, sem herdar aprovação | err | integração | — | B-02 | ✅ |
| S-60 | pendente no 6º dia continua aprovável; no 8º sumiu, e expirar duas vezes não muda nada | fron | integração | — | B-30 | ✅ |

## Push — B-08…B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-15 | permissão com **nenhuma** connection observando dispara push | eq | integração | — | B-10 | ✅ |
| S-16 | permissão com alguém observando **não** dispara push | eq | integração | — | B-10 | ✅ |
| S-17 | payload chega traduzido no `Device.locale` | eq | integração | — | B-11 | ✅ |
| S-18 | locale não suportado cai em `en`, nunca em string vazia | fron | unit | — | B-11 | ✅ |
| S-19 | payload **nunca** carrega conteúdo de arquivo nem output de comando | err | unit | — | B-12 | ✅ |
| S-20 | payload carrega `sessionId`, `requestId` e `expiresAt` | eq | unit | — | B-12 | ✅ |
| S-21 | permissão resolvida cancela o push pendente | est | integração | — | B-10 | ✅ |
| S-22 | permissão expirada cancela o push pendente | est | integração | — | B-10 | ✅ |
| S-23 | falha do provedor de push é `warn` e **não** derruba a permissão | err | integração | — | B-09 | ✅ |
| S-24 | o mesmo `requestId` não gera dois pushes | idem | integração | — | B-10 | ✅ |
| S-25 | dois aparelhos aprovados do mesmo usuário recebem o push | conc | integração | — | B-10 | ✅ |
| S-26 | nome do provedor de push fora da configuração → `scan:security` falha | err | unit | — | B-09 | ✅ |
| S-61 | token recusado pelo provedor é apagado e o **device continua aprovado** | err | integração | — | B-09 | ✅ |
| S-62 | reenviar o mesmo token não duplica linha | idem | integração | — | B-31 | ✅ |
| S-63 | três pedidos pendentes geram três notificações, cada uma cancelada com o seu `requestId` | conc | integração | — | B-10 | ✅ |
| S-64 | notificação negada no SO → o app explica e oferece o atalho, sem bloquear o uso | est | widget | — | B-32 | ✅ |
| S-68 | a permissão do SO é pedida **depois** de o aparelho existir, nunca no primeiro segundo do app | est | unit | — | B-13 | ✅ |
| S-69 | push recebido com o app aberto entra no log como `push.received`, com o token só nos seis últimos | eq | unit | — | B-13 | ✅ |
| S-70 | toque na notificação abre o deep link do pedido e loga `push.opened` | est | unit | — | B-13 | ✅ |
| S-71 | notificação de pedido já resolvido é retirada pelo `tag`, que é o `requestId` | idem | unit | — | B-13 | ✅ |
| S-72 | build sem transporte de push diz **indisponível**, não "você negou" ([D-21](decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart)) | err | widget | — | B-32 | ✅ |
| S-73 | token rotacionado pelo SO reenvia o registro sozinho, sem o usuário fazer nada | est | unit | — | B-31 | ✅ |
| S-74 | rotação que falha não derruba nada e não some calada — fica `warn` e o estado diz | err | unit | — | B-31 | ✅ |

## Sessão no app — B-14…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | app conecta, autentica no handshake e faz `attach` | eq | integração | — | B-14 | ✅ |
| S-28 | evento com `seq <= lastSeq` é descartado | idem | unit | — | B-15 | ✅ |
| S-29 | `gap: true` limpa o estado e recarrega por HTTP | est | unit | — | B-15 | ✅ |
| S-30 | `message.delta` acumula por `messageId`; `completed` substitui | eq | unit | — | B-15 | ✅ |
| S-31 | duas mensagens em voo não misturam texto | conc | unit | — | B-15 | ✅ |
| S-32 | `paused` fecha o socket — e isso **não** é erro | est | unit | — | B-16 | ✅ |
| S-33 | `resumed` revalida o token **antes** de reconectar | est | unit | — | B-16 | ✅ |
| S-34 | token expira com o socket aberto → `reauthenticate`, sem derrubar | est | unit | — | B-14 | ✅ |
| S-35 | reconexão usa backoff com jitter e nunca entra em laço apertado | fron | unit | — | B-14 | ✅ |
| S-36 | sair da tela da sessão chama `detach` | est | widget | — | B-18 | ✅ |
| S-37 | toda tela que carrega dado trata carregando, erro, vazio e conteúdo | eq | widget | — | B-17 | ✅ |
| S-38 | chave de l10n ausente em um idioma quebra o build | err | unit | — | B-19 | ✅ |
| S-75 | `session.started` de uma sessão que este aparelho abriu leva a tela para ela | est | widget | — | B-17 | ✅ |
| S-76 | prompt com o socket caído não sai, e a tela diz por quê em vez de engolir | err | widget | — | B-17 | ✅ |
| S-77 | evento que o app não conhece deixa o estado intacto — cliente publicado sobrevive a contrato novo | eq | unit | — | B-15 | ✅ |
| S-78 | `tool.started` reentregue no replay substitui a invocação, não duplica | idem | unit | — | B-15 | ✅ |

## Permissão no app — B-20…B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-39 | o comando exato aparece inteiro, monoespaçado e rolável | eq | widget | — | B-20 | ✅ |
| S-40 | `riskHint: destructive` usa `colorScheme.error`, e funciona no tema escuro | eq | widget | — | B-20 | ✅ |
| S-41 | tool destrutiva exige confirmação em dois passos | est | widget | — | B-21 | ✅ |
| S-42 | com `defaultToNo`, aprovar não é o alvo de toque mais fácil | fron | widget | — | B-21 | ✅ |
| S-43 | biometria recusada **não** aprova | err | widget | — | B-22 | ✅ |
| S-44 | biometria indisponível cai no PIN, nunca em "aprovar direto" | err | widget | — | B-22 | ✅ |
| S-45 | deep link revalida no servidor **antes** de renderizar | est | integração | — | B-23 | ✅ |
| S-46 | deep link de permissão já resolvida mostra o estado real (quem resolveu, de onde), não o payload; a que o servidor já esqueceu diz que não existe mais | err | integração | `PERMISSION_REQUEST_NOT_FOUND` | B-23 | ✅ |
| S-47 | abrir o mesmo deep link duas vezes não reenvia resposta | idem | integração | — | B-23 | ✅ |
| S-48 | card em `pending` não aceita segundo toque | est | widget | — | B-24 | ✅ |
| S-49 | resolvida em outro aparelho → o card se atualiza sozinho | conc | integração | — | B-24 | ✅ |
| S-50 | logout desregistra o push token, fecha o socket e invalida os providers | est | integração | — | B-25 | ✅ |
| S-65 | estender pelo card adia o prazo, e o teto atingido desabilita a ação com motivo | fron | integração | — | B-33 | ✅ |
| S-66 | estender pedido já resolvido não revive o card | err | integração | `PERMISSION_REQUEST_NOT_FOUND` | B-33 | ✅ |
| S-79 | revalidar pedido de outro usuário é recusado, e o card não aparece | err | integração | `PERMISSION_NOT_OWNED` | B-23 | ✅ |
| S-80 | revalidar com um `sessionId` que não é o do pedido não encontra nada | err | integração | `PERMISSION_REQUEST_NOT_FOUND` | B-23 | ✅ |
| S-81 | a contagem chega a zero → o card sai como negado, sem pedir confirmação | fron | unit | — | B-20 | ✅ |
| S-82 | conversa e fila observam a mesma sessão: o socket anexa uma vez, e só desanexa com o último | conc | unit | — | B-24 | ✅ |
| S-83 | aparelho sem biometria **e** sem PIN recusa aprovar com o motivo — e negar continua possível | err | widget | — | B-22 | ✅ |
| S-84 | aparelho pendente vê o card com os controles desabilitados e a explicação | err | widget | `DEVICE_NOT_REGISTERED` | B-24 | ✅ |
| S-85 | texto a 200 % não corta o comando; alvo de toque ≥ 48 dp e contraste AA | fron | widget | — | B-20 | ✅ |
| S-86 | sem conexão, as ações de rede ficam desabilitadas e a tela diz por quê | err | widget | — | B-24 | ✅ |
| S-87 | resposta que não saiu (socket caído) devolve o card ao estado anterior, sem prender o botão | err | unit | — | B-24 | ✅ |
| S-88 | logout sem rede: o desregistro do push falha como `warn`, e o logout local se completa | err | unit | — | B-25 | ✅ |
| S-89 | depois do logout, entrar de novo abre o socket com a credencial nova | est | unit | — | B-25 | ✅ |

## E2E — B-26…B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-51 | permissão pelo celular, com o web só observando `permission.resolved` | eq | e2e | — | B-27 | ✅ |
| S-52 | web e mobile respondem juntos → vence a primeira, a segunda recebe `ack` | conc | e2e | — | B-27 | ✅ |
| S-53 | multi-cliente: ambos veem o mesmo stream, na mesma ordem | eq | e2e | — | B-27 | ✅ |
| S-54 | app em background recebe push, abre pelo deep link e aprova | est | e2e | — | B-28 | ✅ |
| S-55 | device pendente: controles desabilitados **com explicação visível** | err | e2e | `DEVICE_NOT_REGISTERED` | B-28 | ✅ |
| S-56 | revogar com o app aberto → socket cai com `4401` e a UI explica | est | e2e | `DEVICE_REVOKED` | B-28 | ✅ |
| S-57 | push que chega depois do `expiresAt` não abre card acionável | fron | e2e | `PERMISSION_REQUEST_EXPIRED` | B-28 | ✅ |
| S-58 | `pnpm test:e2e:mobile` sai 0 dentro do teto de memória novo | idem | e2e | — | B-29 | ✅ |
| S-67 | a suíte sobe na imagem fixada (API 35), e o diálogo de notificação do SO aparece | eq | e2e | — | B-34 | ✅ |

---

**S-54 e S-67 são provados pela variante com push de verdade**, `pnpm test:e2e:mobile:push`
([D-26](decisions.md#d-26--o-push-de-verdade-sem-sujar-a-suíte-de-todo-dia)): o `patrol` responde o
diálogo do SO, manda o app para o fundo, um socket que não observa dispara o pedido, o provedor
entrega, e o toque na notificação abre, revalida e aprova. A suíte padrão continua hermética.

## Dimensões sem cenário — justificativa

O protocolo exige justificar dimensão vazia, não omiti-la.

**Nenhum agrupamento deste plano ficou com dimensão vazia.** As seis aparecem em todos os
cinco, o que é esperado: este plano é quase todo máquina de estados (device, push pendente,
ciclo de vida do app, card de permissão) e disputa entre duas pontas.

| Requisito | Dimensão ausente | Por quê |
|---|---|---|
| — | nenhuma | as seis dimensões têm cenário em Device, Push, Sessão no app, Permissão no app e E2E |

---

## Regras

- Cenário descoberto durante a implementação **entra aqui**, não vira teste órfão.
- Cenário coberto muda de estado **na mesma entrega** que o cobriu.
- Todo `err` cita o `code` do [catálogo](../../architecture/shared/04-errors-and-http.md).
