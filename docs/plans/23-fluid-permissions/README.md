# Plano 23 — Permissões fluidas

**Objetivo:** o usuário para de responder a mesma pergunta: um modo **Permitir tudo** que liga e
desliga pelo chip da sessão no web e no mobile, e regras de aprovação que alcançam mais do que o
comando exato que as criou.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full         # portões 1-11, sai com código 0
pnpm test:e2e:mobile     # o e2e do app, que o verify:full não roda
```

**Depende de:** [plano 03 — Regras e trilha](../03-rules-and-audit/README.md) (o livro de regras, a
precedência da D-11, a trilha), [plano 09](../09-chat-layout/README.md) e
[plano 10](../10-mobile-chat-layout/README.md) (o chip de modo e o card nas duas pontas). **Não
depende** dos planos 11…22. Conversa com o [plano 15](../15-rules-management/README.md), ainda não
iniciado: este plano emenda a 15 · D-07 e cria a lista de "largo demais" que a 15 · D-09 vai ler
([D-07](decisions.md#f2--alcance-das-regras), [D-08](decisions.md#f2--alcance-das-regras)).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Em 2026-10-07 o usuário relatou que, apesar de aprovar e criar regras, o web e o mobile pedem
aprovação o tempo todo. O banco de desenvolvimento mostrou o motivo:

| O que o usuário vê | Causa no código | O que este plano faz |
|---|---|---|
| aprovou "sempre" e a pergunta volta | o card grava o **padrão mais estreito**: a linha inteira, como `Bash(git push 2>&1 \| tail -5 && echo …)`. Nenhuma das 11 regras guardadas voltou a casar | o card oferece um **alcance**: o comando exato, os comandos que começam igual (`Bash(git push:*)`, `Bash(tail:*)`) ou a tool inteira (F2) |
| 47 aprovações de Bash "para esta sessão" em 14 dias | a regra de sessão também é a linha exata | o mesmo alcance vale para `session` (F2) |
| linha com `2>&1`, `\|` ou `&&` nunca é coberta por prefixo | a 15 · D-07 manda o `allow` de prefixo cobrir só linha de um comando | a linha composta é coberta quando **cada** comando dela é coberto por um `allow`, e só sem substituição nem redirecionamento real ([D-07](decisions.md#f2--alcance-das-regras)) |
| WebSearch "para esta sessão" pergunta de novo | o input não tem campo casável, então nenhuma regra de sessão nasce | o alcance "a tool inteira" para tool que não é shell (F2) |
| não há como dizer "pare de perguntar" | `bypassPermissions` nunca é oferecido, por decisão repetida dos planos 08, 09, 10 e 13 | o modo **Permitir tudo**, implementado por nós e não pelo SDK ([ADR-022](../../architecture/shared/00-decisions.md#adr-022--permitir-tudo-é-um-modo-nosso-não-o-bypasspermissions-do-sdk)) |

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **Permitir tudo é um modo nosso, e o SDK continua em `default`** ([D-01](decisions.md#f0--normas-e-contrato)) | o `canUseTool` continua sendo chamado para toda tool. Por isso uma regra `deny` ainda recusa, cada aprovação fica no histórico como automática, e desligar vale na **próxima** tool, inclusive no meio de uma sessão. Com o `bypassPermissions` do SDK, o CLI para de consultar o backend, e nada disso vale |
| **O servidor calcula os alcances, o cliente só escolhe um** | o cliente manda `reach`, nunca um padrão. Os padrões são recalculados no backend a partir do pedido, e um alcance que não foi oferecido é recusado. Assim não nasce um segundo matcher no cliente, e um cliente adulterado não grava padrão algum |
| **Pergunta ao humano continua sendo pergunta** ([D-05](decisions.md#f1--permitir-tudo)) | `AskUserQuestion` e `ExitPlanMode` não são permissões: são o Claude pedindo uma resposta. Permitir tudo não responde por ninguém |

---

## Escopo

### Entra

| | |
|---|---|
| A ADR-022, as normas emendadas (backend/04, web e mobile), o contrato (`allowAll`, `reaches`, `reach`, `via`) e as chaves i18n | F0 |
| O modo `allowAll` no backend: o SDK em `default`, a aprovação automática depois do `deny`, as tools que continuam perguntando e os cards pendentes resolvidos ao ligar | F1 |
| O alcance das regras: a linha composta coberta por pedaços, os alcances exato, prefixo e tool, e a resposta com `reach` em `session`, `project` e `always` | F2 |
| O web: Permitir tudo no chip de modo, o seletor de alcance no card e a marca de aprovação automática na linha da tool | F3 |
| O mobile: os mesmos três | F4 |
| E2E: ligar e desligar, e o alcance de prefixo respondendo o segundo comando, no web e no app | F5 |

### Não entra

- **Permitir tudo como modo padrão** nas configurações por usuário ou por pasta. O usuário escolheu
  o chip da sessão ([D-02](decisions.md#f0--normas-e-contrato)); o plano 13 continua recusando
  `bypassPermissions` como padrão, e `allowAll` não entra lá.
- **Permitir tudo no card de aprovação de plano.** O card do `ExitPlanMode` continua oferecendo
  `default` e `acceptEdits`. Dá para trocar para Permitir tudo pelo chip logo depois.
- **Gramática de caminho** (`Edit(src/**)`). Continua candidata a plano futuro
  ([15 · D-08](../15-rules-management/decisions.md#d-08--prefixo-em-tool-de-caminho)). Para tool de
  caminho, o alcance é o arquivo exato ou a tool inteira.
- **Devolver regra ao SDK** (`updatedPermissions`). A regra nossa continua sendo a única autoridade
  ([03 · D-09](../03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade)).
- **Gerir regras pela tela** (listar, revogar, criar à mão). Isso é o plano 15.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde. A exceção declarada: **F3 e F4** dependem só da F2, e podem correr em qualquer ordem entre si.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Normas e contrato](F0-norms.md) | ADR-022, normas emendadas, schemas e tipos gerados, i18n | B-01…B-03 | ✅ |
| F1 | [Permitir tudo](F1-allow-all.md) | `allowAll` no domínio e no SDK, aprovação automática, pendentes resolvidos ao ligar, handlers | B-04…B-07 | ✅ |
| F2 | [Alcance das regras](F2-rule-reach.md) | linha composta, alcances, resposta com `reach`, `via` | B-08…B-11 | ✅ |
| F3 | [Web](F3-web.md) | chip, seletor de alcance, marca na linha da tool | B-12…B-14 | ✅ |
| F4 | [Mobile](F4-mobile.md) | chip, seletor de alcance, marca na linha da tool | B-15…B-17 | ✅ |
| F5 | [E2E](F5-e2e.md) | tudo acima pela porta do usuário, no web e no app | B-18…B-19 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| A reversão do "nunca permitir tudo" registrada, e as normas dizendo o novo | B-01 | [00-decisions · ADR-022](../../architecture/shared/00-decisions.md) · [backend/04](../../architecture/backend/04-claude-integration.md) | S-01 |
| O contrato carrega o modo, os alcances, o alcance escolhido e quem respondeu | B-02 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-02, S-03 |
| Os textos novos nas duas pontas, presos pelo mapa | B-03 | [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-04 |
| `allowAll` existe no domínio, e o SDK nunca o recebe | B-04 | [backend/04](../../architecture/backend/04-claude-integration.md) | S-05…S-08 |
| Em Permitir tudo, toda tool roda sem pergunta, exceto as que são perguntas e as que uma regra recusa | B-05 | [backend/04](../../architecture/backend/04-claude-integration.md) · [backend/03 §permission](../../architecture/backend/03-modules.md) | S-09…S-21 |
| Ligar resolve os pendentes; desligar vale na próxima tool | B-06 | [05-websocket-protocol §permissão](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) | S-22…S-27, S-99 |
| Os handlers aceitam `allowAll` e recusam o resto | B-07 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) · [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-28…S-30, S-100 |
| Linha composta coberta quando cada comando é coberto | B-08 | [backend/04 §gramática](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa) | S-31…S-44 |
| Os alcances de uma invocação | B-09 | [backend/04 §gramática](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa) | S-45…S-54 |
| A resposta com alcance, em todo escopo | B-10 | [05-websocket-protocol §permissão](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) | S-55…S-66 |
| Quem respondeu sem perguntar: regra ou modo | B-11 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-67, S-68 |
| O web liga e desliga Permitir tudo no chip | B-12 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-69…S-74 |
| O web escolhe o alcance no card | B-13 | [web/03-ui-system](../../architecture/web/03-ui-system.md) · [web/04-state-and-data](../../architecture/web/04-state-and-data.md) | S-75…S-80 |
| O web marca a aprovação automática | B-14 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-81, S-82 |
| O app liga e desliga Permitir tudo no chip | B-15 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-83…S-87 |
| O app escolhe o alcance no card | B-16 | [mobile/04-ui](../../architecture/mobile/04-ui.md) · [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-88…S-92 |
| O app marca a aprovação automática | B-17 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-93, S-94 |
| Tudo pela porta do usuário, nas duas pontas | B-18, B-19 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-95…S-98 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
├── commands/session-start.schema.json            permissionMode: + allowAll
├── commands/session-set-permission-mode.schema.json   mode: + allowAll
├── events/session-started.schema.json            permissionMode: + allowAll
├── events/permission-requested.schema.json       + reaches
├── events/permission-resolved.schema.json        + via
└── responses/permission-resolve.schema.json      + reach
backend/src/
├── domain/session/value-objects/permission-mode.value-object.ts   allowAll, sdkPermissionMode
├── domain/permission/services/shell-syntax.ts    neutralise, commandsOf
├── domain/permission/services/rule-reach.ts      reachesFor, commandPrefix, UNBOUNDED_COMMANDS
├── domain/permission/services/rule-precedence.ts linha composta, allowAll
└── application/permission/                       request, resolve, settle, payloads
web/src/features/
├── session/components/composer/SessionChoices.tsx   Permitir tudo
├── session/lib/panel-modes.ts
└── permission/components/PermissionCard.tsx      seletor de alcance
mobile/lib/features/
├── session/presentation/widgets/session_choices.dart
└── permission/presentation/widgets/permission_card_view.dart
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Permitir tudo esquecido ligado.** A sessão roda qualquer comando sem perguntar. Mitigação: o chip fica em tom de alerta com ícone e texto, vale só para a sessão, e o atalho que gira os modos não passa por ele ([D-10](decisions.md#f3--web)) | **aberto** |
| R-02 | **Pedaço de linha que não é o comando que o shell roda.** Sem parser, aspas e barra invertida enganam o corte. Mitigação: pedaço com aspas desbalanceadas ou barra invertida faz a linha toda perguntar ([D-07](decisions.md#f2--alcance-das-regras)) | **aberto** |
| R-03 | **Prefixo largo demais escolhido num toque.** `Bash(rm:*)` sai de `rm -rf build`. Mitigação: os padrões aparecem por extenso antes de confirmar, e interpretador ou lançador nunca vira prefixo ([D-08](decisions.md#f2--alcance-das-regras)) | **aberto** |
| R-04 | **O CLI decide antes de nós.** Um `deny` nas settings do projeto continua recusando em Permitir tudo, e é o comportamento certo, mas a tela não sabe dizer por quê | **aceito** — é o mesmo R-03 do plano 15 |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
