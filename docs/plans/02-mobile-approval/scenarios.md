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
| S-01 | registro de aparelho novo nasce **pendente** | eq | integração | — | B-03 | ⬜ |
| S-02 | registro repetido do mesmo `installId` **do mesmo usuário** atualiza, não duplica | idem | integração | — | B-02 | ⬜ |
| S-03 | device pendente **pode** observar sessão | eq | integração | — | B-05 | ⬜ |
| S-04 | device pendente tentando resolver permissão | err | integração | `DEVICE_NOT_REGISTERED` | B-05 | ⬜ |
| S-05 | device revogado tentando resolver permissão | err | integração | `DEVICE_REVOKED` | B-05 | ⬜ |
| S-06 | aparelho tentando aprovar a si mesmo | err | integração | `FORBIDDEN` | B-06 | ⬜ |
| S-07 | revogar fecha as connections daquele device **na hora**, com `4401` | est | integração | — | B-04 | ⬜ |
| S-08 | revogar invalida os refresh tokens daquele device | est | integração | — | B-04 | ⬜ |
| S-09 | revogar device já revogado é no-op bem-sucedido | idem | integração | — | B-04 | ⬜ |
| S-10 | aprovar e revogar concorrentes terminam num estado determinístico | conc | integração | — | B-03 | ⬜ |
| S-11 | device sem `locale` cai no fallback `en` | fron | unit | — | B-01 | ⬜ |
| S-12 | registro sem push token é aceito — o aparelho ainda serve para observar | fron | unit | — | B-01 | ⬜ |
| S-13 | registro, aprovação e revogação entram em `audit` | eq | integração | — | B-03 | ⬜ |
| S-14 | push token nunca aparece inteiro no log — só os seis últimos | err | unit | — | B-07 | ⬜ |
| S-59 | mesmo `installId` de **outro** usuário cria linha própria, sem herdar aprovação | err | integração | — | B-02 | ⬜ |
| S-60 | pendente no 6º dia continua aprovável; no 8º sumiu, e expirar duas vezes não muda nada | fron | integração | — | B-30 | ⬜ |

## Push — B-08…B-13

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-15 | permissão com **nenhuma** connection observando dispara push | eq | integração | — | B-10 | ⬜ |
| S-16 | permissão com alguém observando **não** dispara push | eq | integração | — | B-10 | ⬜ |
| S-17 | payload chega traduzido no `Device.locale` | eq | integração | — | B-11 | ⬜ |
| S-18 | locale não suportado cai em `en`, nunca em string vazia | fron | unit | — | B-11 | ⬜ |
| S-19 | payload **nunca** carrega conteúdo de arquivo nem output de comando | err | unit | — | B-12 | ⬜ |
| S-20 | payload carrega `sessionId`, `requestId` e `expiresAt` | eq | unit | — | B-12 | ⬜ |
| S-21 | permissão resolvida cancela o push pendente | est | integração | — | B-10 | ⬜ |
| S-22 | permissão expirada cancela o push pendente | est | integração | — | B-10 | ⬜ |
| S-23 | falha do provedor de push é `warn` e **não** derruba a permissão | err | integração | — | B-09 | ⬜ |
| S-24 | o mesmo `requestId` não gera dois pushes | idem | integração | — | B-10 | ⬜ |
| S-25 | dois aparelhos aprovados do mesmo usuário recebem o push | conc | integração | — | B-10 | ⬜ |
| S-26 | nome do provedor de push fora da configuração → `scan:security` falha | err | unit | — | B-09 | ⬜ |
| S-61 | token recusado pelo provedor é apagado e o **device continua aprovado** | err | integração | — | B-09 | ⬜ |
| S-62 | reenviar o mesmo token não duplica linha | idem | integração | — | B-31 | ⬜ |
| S-63 | três pedidos pendentes geram três notificações, cada uma cancelada com o seu `requestId` | conc | integração | — | B-10 | ⬜ |
| S-64 | notificação negada no SO → o app explica e oferece o atalho, sem bloquear o uso | est | integração | — | B-32 | ⬜ |

## Sessão no app — B-14…B-19

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-27 | app conecta, autentica no handshake e faz `attach` | eq | integração | — | B-14 | ⬜ |
| S-28 | evento com `seq <= lastSeq` é descartado | idem | unit | — | B-15 | ⬜ |
| S-29 | `gap: true` limpa o estado e recarrega por HTTP | est | unit | — | B-15 | ⬜ |
| S-30 | `message.delta` acumula por `messageId`; `completed` substitui | eq | unit | — | B-15 | ⬜ |
| S-31 | duas mensagens em voo não misturam texto | conc | unit | — | B-15 | ⬜ |
| S-32 | `paused` fecha o socket — e isso **não** é erro | est | unit | — | B-16 | ⬜ |
| S-33 | `resumed` revalida o token **antes** de reconectar | est | unit | — | B-16 | ⬜ |
| S-34 | token expira com o socket aberto → `reauthenticate`, sem derrubar | est | integração | — | B-14 | ⬜ |
| S-35 | reconexão usa backoff com jitter e nunca entra em laço apertado | fron | unit | — | B-14 | ⬜ |
| S-36 | sair da tela da sessão chama `detach` | est | widget | — | B-18 | ⬜ |
| S-37 | toda tela que carrega dado trata carregando, erro, vazio e conteúdo | eq | widget | — | B-17 | ⬜ |
| S-38 | chave de l10n ausente em um idioma quebra o build | err | unit | — | B-19 | ⬜ |

## Permissão no app — B-20…B-25

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-39 | o comando exato aparece inteiro, monoespaçado e rolável | eq | widget | — | B-20 | ⬜ |
| S-40 | `riskHint: destructive` usa `colorScheme.error`, e funciona no tema escuro | eq | widget | — | B-20 | ⬜ |
| S-41 | tool destrutiva exige confirmação em dois passos | est | widget | — | B-21 | ⬜ |
| S-42 | com `defaultToNo`, aprovar não é o alvo de toque mais fácil | fron | widget | — | B-21 | ⬜ |
| S-43 | biometria recusada **não** aprova | err | widget | — | B-22 | ⬜ |
| S-44 | biometria indisponível cai no PIN, nunca em "aprovar direto" | err | widget | — | B-22 | ⬜ |
| S-45 | deep link revalida no servidor **antes** de renderizar | est | integração | — | B-23 | ⬜ |
| S-46 | deep link de permissão já resolvida mostra o estado real, não o payload | err | integração | `PERMISSION_REQUEST_NOT_FOUND` | B-23 | ⬜ |
| S-47 | abrir o mesmo deep link duas vezes não reenvia resposta | idem | integração | — | B-23 | ⬜ |
| S-48 | card em `pending` não aceita segundo toque | est | widget | — | B-24 | ⬜ |
| S-49 | resolvida em outro aparelho → o card se atualiza sozinho | conc | integração | — | B-24 | ⬜ |
| S-50 | logout desregistra o push token, fecha o socket e invalida os providers | est | integração | — | B-25 | ⬜ |
| S-65 | estender pelo card adia o prazo, e o teto atingido desabilita a ação com motivo | fron | integração | — | B-33 | ⬜ |
| S-66 | estender pedido já resolvido não revive o card | err | integração | `PERMISSION_REQUEST_NOT_FOUND` | B-33 | ⬜ |

## E2E — B-26…B-29

| ID | Cenário | Dim | Nível | Erro esperado | Tarefa | Estado |
|---|---|---|---|---|---|---|
| S-51 | permissão pelo celular, com o web só observando `permission.resolved` | eq | e2e | — | B-27 | ⬜ |
| S-52 | web e mobile respondem juntos → vence a primeira, a segunda recebe `ack` | conc | e2e | — | B-27 | ⬜ |
| S-53 | multi-cliente: ambos veem o mesmo stream, na mesma ordem | eq | e2e | — | B-27 | ⬜ |
| S-54 | app em background recebe push, abre pelo deep link e aprova | est | e2e | — | B-28 | ⬜ |
| S-55 | device pendente: controles desabilitados **com explicação visível** | err | e2e | `DEVICE_NOT_REGISTERED` | B-28 | ⬜ |
| S-56 | revogar com o app aberto → socket cai com `4401` e a UI explica | est | e2e | `DEVICE_REVOKED` | B-28 | ⬜ |
| S-57 | push que chega depois do `expiresAt` não abre card acionável | fron | e2e | `PERMISSION_REQUEST_EXPIRED` | B-28 | ⬜ |
| S-58 | `pnpm test:e2e:mobile` sai 0 dentro do teto de memória novo | idem | e2e | — | B-29 | ⬜ |
| S-67 | a suíte sobe na imagem fixada (API 35), e o diálogo de notificação do SO aparece | eq | e2e | — | B-34 | ⬜ |

---

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
