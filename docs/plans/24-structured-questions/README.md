# Plano 24 — Perguntas estruturadas

**Objetivo:** quando o Claude chama `AskUserQuestion`, o web e o app mostram as perguntas e as
opções, o humano responde, e o Claude recebe as respostas, e não mais
`The user did not answer the questions.`

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full         # portões 1-11, sai com código 0
pnpm test:e2e:mobile     # o e2e do app, que o verify:full não roda
```

**Depende de:** [plano 03 — Regras e trilha](../03-rules-and-audit/README.md) (o pedido, a
resolução, a trilha), [plano 09](../09-chat-layout/README.md) e
[plano 10](../10-mobile-chat-layout/README.md) (o card inline nas duas pontas),
[plano 23 — Permissões fluidas](../23-fluid-permissions/README.md) (`HUMAN_ONLY_TOOLS`, `reaches`,
`reach` e `via`) e [plano 22 — Histórico ao vivo](../22-live-history/README.md) (o seguidor e a
linha de ferramenta com IN/OUT, que a [F5](F5-history.md) estende). A F5 só começa com o 22
fechado.

**Insumo:** [proposta — Perguntas estruturadas](../../discovery/05-perguntas-estruturadas.md). A
proposta é o **porquê** e a referência (como a extensão do VS Code faz); este plano é o contrato.
Onde os dois divergem, vale o plano, e a divergência está em [decisions.md](decisions.md).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Em 2026-10-04 o Claude perguntou, no painel, "Qual tipo de avaliação você quer?" com quatro
opções. A tela mostrou o JSON num card de Permitir/Recusar. O usuário permitiu, e o Claude recebeu
`The user did not answer the questions.` A cadeia inteira está no
[diagnóstico da proposta](../../discovery/05-perguntas-estruturadas.md#4-estado-atual-o-diagnóstico).
Conferida em 2026-10-08, ela continua valendo, com duas mudanças trazidas pelo plano 23:

| O que mudou | Efeito neste plano |
|---|---|
| `HUMAN_ONLY_TOOLS` (`AskUserQuestion`, `ExitPlanMode`) já existe no domínio, e Permitir tudo não responde por elas ([23 · D-05](../23-fluid-permissions/decisions.md#f1--permitir-tudo)) | a lista de "ferramentas interativas" da proposta **é** essa constante; não nasce outra ([D-25](decisions.md#f1--backend)) |
| o card genérico oferece o alcance "a tool inteira" para tool que não é shell | um "sempre" no card de um `AskUserQuestion` grava a regra de allow `AskUserQuestion`, e toda pergunta seguinte é "respondida" sem ninguém. O achado colateral 1 da proposta piorou: era só pela API, agora é por um toque |

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **A pergunta continua sendo um pedido de permissão**, com uma `interaction` do tipo `question` | herda o que já vale: `requestId`, idempotência, a primeira resposta vence, prazo que nega, só o dono responde, trilha. Um fluxo paralelo teria de reimplementar cada garantia |
| **O protocolo é nosso** ([D-02](decisions.md#f0--normas-e-contrato), [D-03](decisions.md#f0--normas-e-contrato)) | o backend normaliza as perguntas, o cliente responde por **id** de pergunta, com a lista de rótulos e o "Outro" em campo separado. A string unida por `", "` do SDK só existe no adapter. É a forma canônica da [proposta de múltiplos motores §6.4](../../discovery/03-multiplos-motores-de-agente.md) |
| **Resposta inválida não chega ao Claude** | o backend valida contra as perguntas que ele mesmo publicou. `allow` sem respostas, rótulo inexistente ou duas escolhas numa pergunta de escolha única são `PERMISSION_ANSWERS_INVALID`, e o pedido continua aberto |

---

## Escopo

### Entra

| | |
|---|---|
| As normas (05, 04, backend/04, web e mobile), o contrato (`interaction`, `answers` na resposta e no resolvido, dois códigos de erro) e as chaves i18n e ARB | F0 |
| O backend: normalizar, validar, traduzir para o SDK, regras de allow que não respondem perguntas, prazo próprio, respostas gravadas e auditadas, push e `GET` de estado | F1 |
| O gravador de fixtures respondendo às perguntas, o `plan-turn` regravado, o `question-turn` novo e o fake SDK registrando o veredito | F2 |
| O web: o card de pergunta, a pergunta respondida na linha da tool, o rótulo e os avisos "aguardando sua resposta" | F3 |
| O mobile: os mesmos, com uma pergunta por passo e a chegada pelo push | F4 |
| O histórico: as respostas na linha da tool de uma sessão reaberta ou seguida ao vivo, casadas pelo `toolUseId` | F5 |
| E2E: escolha única, múltipla, "Outro", recusa, prazo e dois clientes, no web e no app; o `claude-panel-changes` respondendo pelo card novo | F6 |

### Não entra

- **A caixa de decisões, recomendação com evidência e respondedor automático** — são da
  [proposta de workflow §10.3 e §13](../../discovery/02-workflow-de-sessoes.md). O ponto de encaixe
  fica pronto: a validação da [B-05](F1-backend.md#b-05--validar-a-resposta-) é a que um
  respondedor automático vai usar.
- **`ExitPlanMode` como `interaction.kind = 'plan'`.** O `PlanApprovalCard` continua como está.
- **O modo estendido do CLI** (`extendedQuestions`: perguntas abertas e numéricas, resposta
  parcial, "me pergunte mais"). Não está nos tipos públicos ([D-18](decisions.md#f0--normas-e-contrato)).
- **Notas por pergunta** (`annotations`) e o envio do preview escolhido ([D-06](decisions.md#f0--normas-e-contrato)).
- **Responder depois, com a sessão caída** (o "replay" da extensão). Depende do estacionamento de
  sessão da proposta de workflow ([D-17](decisions.md#f0--normas-e-contrato)).
- **`previewFormat: 'html'`** e **markdown completo no app** ([D-21](decisions.md#f4--mobile)).
- **Apresentar na tela de regras as regras de allow que deixaram de valer.** São ignoradas na
  leitura; como aparecem é do [plano 15](../15-rules-management/README.md) ([D-26](decisions.md#f1--backend)).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde. A exceção declarada: **F2, F3 e F4** dependem só da F1, e podem correr em qualquer ordem
entre si.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Normas e contrato](F0-norms.md) | 05, 04, backend/04, web e mobile emendados; schemas e tipos gerados; i18n e ARB | B-01…B-03 | ✅ |
| F1 | [Backend](F1-backend.md) | normalização, validação, veredito com respostas, regras, prazo, persistência, trilha, push, `GET` | B-04…B-10 | ✅ |
| F2 | [Fixtures](F2-fixtures.md) | gravador que responde, `plan-turn` regravado, `question-turn`, fake SDK que registra o veredito | B-11…B-12 | ✅ |
| F3 | [Web](F3-web.md) | serviço e hook, `QuestionCard`, `AnsweredQuestions` na linha da tool, avisos | B-13…B-16 | ✅ |
| F4 | [Mobile](F4-mobile.md) | dados e controller, `question_card` em passos, chegada pelo push, linha respondida, avisos | B-17…B-20 | ✅ |
| F5 | [Histórico](F5-history.md) | respostas no transcript e no seguidor, pelo `toolUseId` | B-21…B-22 | ✅ |
| F6 | [E2E](F6-e2e.md) | tudo acima pela porta do usuário, no web e no app | B-23…B-25 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| As normas dizem o que é uma pergunta, como se responde e onde mora a exceção ao `x-required-when` | B-01 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) · [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) · [backend/04](../../architecture/backend/04-claude-integration.md) | S-01 |
| O contrato carrega a `interaction`, as `answers` e os dois códigos novos, igual em TS e Dart | B-02 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-02, S-03 |
| Os textos novos nas três pontas, presos pelo mapa | B-03 | [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-04 |
| As perguntas do SDK viram uma `interaction` nossa, truncada ou marcada como malformada | B-04 | [backend/04](../../architecture/backend/04-claude-integration.md) | S-05…S-12 |
| Resposta inválida é recusada sem tocar o SDK | B-05 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-13…S-23 |
| O pedido de pergunta: risco, sugestões, alcances, título e prazo próprios | B-06 | [05 §permissão](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) | S-24…S-28 |
| Regra de allow não responde pergunta; a API e o card não criam uma | B-07 | [backend/04 §gramática](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa) | S-29…S-34 |
| A resolução com respostas: validada, gravada, auditada, publicada, idempotente | B-08 | [05 §permissão](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) · [backend/05-persistence](../../architecture/backend/05-persistence.md) | S-35…S-45 |
| O Claude recebe as respostas no formato do SDK, e uma mensagem clara no vencimento | B-09 | [backend/04](../../architecture/backend/04-claude-integration.md) | S-46…S-51 |
| Push e `GET` de estado dizem que é pergunta, sem o texto dela | B-10 | [shared/08-authentication](../../architecture/shared/08-authentication.md) · [05](../../architecture/shared/05-websocket-protocol.md) | S-52…S-55 |
| As fixtures mostram uma pergunta respondida, e o veredito é verificável | B-11, B-12 | [shared/06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-56…S-59 |
| O web lê a pergunta e envia as respostas, com rascunho que sobrevive a reconexão | B-13 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md) | S-60…S-63 |
| O web mostra o card de pergunta | B-14 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-64…S-76 |
| O web mostra a pergunta respondida na linha da tool | B-15 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-77…S-79 |
| O web avisa "aguardando sua resposta" | B-16 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-80, S-81 |
| O app lê a pergunta e envia as respostas | B-17 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-82…S-85 |
| O app mostra o card de pergunta, inline e pela chegada do push | B-18 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-86…S-94 |
| O app mostra a pergunta respondida na linha da tool | B-19 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-95, S-96 |
| O app avisa "aguardando sua resposta" | B-20 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-97 |
| O histórico traz as respostas, casadas pelo `toolUseId` | B-21, B-22 | [backend/04](../../architecture/backend/04-claude-integration.md) | S-98…S-103 |
| Tudo pela porta do usuário, nas duas pontas | B-23…B-25 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-104…S-111 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
├── events/permission-requested.schema.json      + interaction
├── events/permission-resolved.schema.json       + answers
└── responses/permission-resolve.schema.json     + answers
backend/src/
├── domain/permission/value-objects/question.ts  QuestionInteraction, QuestionAnswer
├── domain/permission/services/question.ts       normalizeQuestion, validateAnswers
├── domain/permission/services/rule-precedence.ts   allow não responde HUMAN_ONLY_TOOLS
├── application/permission/                      request, resolve, settle, payloads, settings
├── application/session/ports/permission-gate.port.ts   PermissionVerdict.answers
├── adapter/outbound/claude/                     permission-bridge, session-runner (updatedInput)
└── infrastructure/database/migrations/          permission_requests.answers
backend/test/fakes/agent-sdk/
├── scripted-query.ts                            registra o veredito
└── fixtures/{plan-turn,question-turn}.json
web/src/features/permission/components/
├── QuestionCard.tsx
└── AnsweredQuestions.tsx
mobile/lib/features/permission/presentation/widgets/
├── question_card.dart
└── answered_questions.dart
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **O SDK muda o formato de `answers`** (o binário já aceita array) ou o texto do `tool_result`. Mitigação: a tradução isolada no runner, com teste unit do `updatedInput`; o histórico não lê o texto ([D-13](decisions.md#f0--normas-e-contrato)); o gravador detecta a mudança | **aberto** |
| R-02 | **O modo estendido vira padrão** e chegam perguntas `text`/`number`, sem opções. Mitigação: pergunta sem opções é malformada (card só de recusa), com cenário (S-10) | **aberto** |
| R-03 | **O gerador de contratos não tem `oneOf`**, e uma segunda `interaction` (`plan`) não cabe. Fora deste plano; registrado para quando o `plan` entrar | **aceito** |
| R-04 | **A regravação depende do modelo cooperar** (duas perguntas, uma múltipla, uma com preview). Mitigação: o gravador confere a forma e falha alto | **aberto** |
| R-05 | **Um app desatualizado** mostra o card genérico. Mitigação: falha fechada, `PERMISSION_ANSWERS_INVALID` ao permitir (S-23) | **aberto** |
| R-06 | **Rascunho perdido** por reconexão ou replay. Mitigação: estado por `requestId`, com cenários (S-62, S-84) | **aberto** |
| R-07 | **Regras de allow para `AskUserQuestion` já gravadas**, inclusive pelo alcance "a tool inteira" do plano 23. Mitigação: ignoradas na leitura ([D-26](decisions.md#f1--backend)) | **aberto** |
| R-08 | **Texto da pergunta enorme ou com marcação estranha.** Mitigação: `maxLength` com truncamento na normalização; tudo é texto, exceto o preview, que usa o markdown seguro | **aberto** |
| R-09 | **O spec e a fixture atuais quebram** na mesma mudança (`claude-panel-changes`, `plan-turn`). Previsto: F2 e B-23 | **aberto** |
| R-10 | **O plano 22 ainda está aberto** e mexe nos mesmos arquivos (`sdk-message.mapper.ts`, `transcript.adapter.ts`, `ToolRow.tsx`, `tool_card.dart`), possivelmente noutra sessão na mesma árvore. Mitigação: a F5 só começa com o 22 fechado; antes de cada `pnpm verify`, conferir se outra sessão está rodando | **aberto** |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar, e feche as
   decisões 🔲 de [decisions.md](decisions.md) que bloqueiam a fase.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
