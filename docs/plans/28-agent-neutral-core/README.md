# Plano 28 — Núcleo neutro de agente

**Objetivo:** nenhuma parte do núcleo do sistema, nas três pontas, depende de um agente de código.
Toda mensagem que o web e o app consomem é **canônica**, quem interpreta o agente é o adapter dele no
backend, e o que é de um agente só mora num anel `engines/<motor>/` isolado, conferido por máquina. O
Claude continua sendo o único motor de produção, e tudo funciona igual.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full         # portões 1-11, com o neutral:check no 11 e o baseline do núcleo vazio
pnpm test:e2e:mobile     # o e2e do app, que o verify:full não roda (o portão 9 é só do web)
pnpm test:e2e:live       # o Claude real continua igual: a forma das mensagens contra o CLI instalado
```

**Depende de:** [plano 26 — Paridade da conversa no app](../26-mobile-conversation-parity/README.md)
com a **F1 fechada**. A F0 e a F1 de lá já estão escritas, e a F1 só espera o `pnpm verify`. O mapa de
paridade (`render-parity.json`) que ela entrega é o que a [F2](F2-canonical-tools.md) daqui reescreve
pelo `kind`. Os planos 26 (F2…F7), 13 (F2…F4), 27, 14, 15, 16 e 18 **esperam este**
([D-01](decisions.md#f0--normas)). A ordem inteira está no [índice dos planos](../README.md#ordem-de-execução).

**Insumo:** [discovery 10 — Núcleo canônico e agentes isolados](../../discovery/10-nucleo-canonico-e-agentes-isolados.md),
que mediu o acoplamento em 2026-10-10. Ela detalha o M0 da
[discovery 03 — Múltiplos motores](../../discovery/03-multiplos-motores-de-agente.md#17-fatiamento-sugerido-em-planos).
A discovery explica o **porquê** e mede; este plano é o contrato. As decisões de lá mantêm os IDs
(D-01…D-16).

**Base das convenções:** o [plano 27 — Perdas da conversa](../27-conversation-losses/README.md), o único
escrito inteiro na forma canônica (pedido do usuário, 2026-10-10). O `origin { engine, native }`, o
`kind` aberto com a linha genérica, o `messageKey` ou `text`, o critério da
[27 · D-10](../27-conversation-losses/decisions.md#f2--contrato) e o teste de vocabulário da
[27 · B-07](../27-conversation-losses/F2-contract.md) deixam de valer só para os avisos e passam a valer
para o contrato inteiro ([discovery §6.1](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#61-o-que-vem-do-plano-27-e-vira-regra-de-todo-o-contrato)).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Os pedidos do usuário, de 2026-10-10 ([discovery §1](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#1-o-pedido)):

- **R1** — toda mensagem que o web e o app consomem é canônica;
- **R2** — o código dependente de agente fica isolado no backend, e a Clean Architecture é conferida;
- **R3** — nada no núcleo de visualização depende de um agente;
- **R4** — o web e o app também isolam o código que é de um agente só;
- **R5** — as dependências entre os planos e a ordem ficam registradas até tudo fechar;
- **R6** — o plano traz as mudanças de documentação, de ADR e do AGENTS;
- **R7** — o plano 27 é a base das decisões canônicas.

A medição ([discovery §2](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#2-a-resposta-curta)):
a Clean Architecture está respeitada no **import** (o SDK só é importado pelo adapter), mas não no
**vocabulário**:

- o `domain/permission` usa a gramática de regra e os nomes de ferramenta do Claude;
- o `domain/session` lê o input do `Edit`;
- `ClaudeSessionId` aparece em 29 arquivos fora do adapter;
- existe um módulo `claude-config` em todas as camadas;
- o contrato leva `toolName` e `input` crus, e os clientes os interpretam **duas vezes**, em 10 pares de
  lógica duplicada entre TypeScript e Dart.

Quatro escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **A catraca antes do código** ([F0](F0-norms.md)) | as normas, o portão de neutralidade e as regras de lint entram primeiro, com um baseline das violações de hoje que só pode encolher. A partir da F0, nenhum plano (nem este) acopla algo novo sem o portão 11 reprovar |
| **A interpretação vai para o adapter** ([F2](F2-canonical-tools.md), [F3](F3-interactions.md)) | o backend entrega o tipo, o rótulo (`messageKey` + `params`), o assunto, os caminhos que mudam, o diff, as tarefas, o plano e a pergunta. Isso apaga a duplicação entre as pontas, e a paridade do 26 vira consequência |
| **Cada fase é vertical** | contrato, backend, web e app na mesma entrega, como a [27 · F6](../27-conversation-losses/F6-clients.md). Contrato quebrado em uma ponta só é bug (AGENTS, gatilhos) |
| **A prova é um motor de teste** ([F7](F7-e2e.md)) | ausência de palavra não prova neutralidade. Um adapter falso, que não é o Claude, com outras ferramentas e menos capacidades, desenhado igual nas duas pontas é a prova do R3 ([D-14](decisions.md#f7--e2e)) |

---

## Escopo

### Entra

| | |
|---|---|
| ADR-025 e as notas nos ADRs que ele altera; AGENTS (regra 12, roteador, gatilhos, anti-padrões); `shared/12-engines.md`; a forma-alvo nos documentos de arquitetura; `pnpm neutral:check` com vocabulário e baseline; as regras de lint dos três anéis nas três pontas; os planos seguintes, ajustados na criação, conferidos contra as normas | F0 |
| `AgentEnginePort` e `EngineRegistry`; o adapter em `adapter/outbound/engines/claude/`; `ConversationRef` no lugar de `ClaudeSessionId` (portas, banco, contrato, web, app); erros neutros; `GET /engines`; capacidades em `session.started`; o contrato em `v+1` com a janela | F1 |
| O classificador exaustivo de ferramentas no adapter; `kind`, `label`, `subject`, `changes`, `origin` e `rawInput` no contrato; o domínio sobre o `kind` e o `FileChange`; o diff e a prévia pelo backend; os dois clientes sem nome de ferramenta | F2 |
| A interação `plan`; a pergunta e o subagent pelo `kind`; `session.tasksChanged`; o comando `session.compact`; o contexto canônico; a origem `agent` da mudança de arquivo | F3 |
| Os modos canônicos; os níveis de esforço anunciados; o `usage` canônico e o `costUsd` opcional; os blocos com nome nosso | F4 |
| A gramática canônica de regra (`shell(…)`, `file.edit(…)`, `mcp(srv:tool)`), com o `RuleDialect` só traduzindo por motor, e todas as regras gravadas migradas; a interação fora do alcance de regra pelo `kind`; `engine` e `tool_kind` no banco; os imports entre adapters por porta; o ADR-011 reescrito | F5 |
| A divisão do `claude-config` (padrões e MCP no núcleo, o resto em `engines/claude/`); as rotas `/engines/…`; o `web/src/engines/claude/`; os nomes, comandos e chaves de i18n do núcleo neutros, com `{agent}`; nenhum kind de auditoria com nome de motor; o app com `engines/` e os nomes neutros; todo o REST com tipos gerados no pacote `contracts` | F6 |
| O motor de teste e a suíte de contrato da porta; o e2e do web e do app com ele; a regressão com o Claude, inclusive o `smoke-live`; o baseline vazio | F7 |

### Não entra

- **Um segundo motor real** (Copilot, Codex, ACP): é a [discovery 03](../../discovery/03-multiplos-motores-de-agente.md)
  (M1…M4), depois deste plano.
- **Seletor de motor no "nova sessão" e selo de motor na aba:** só servem com dois motores reais. Este
  plano deixa `engine` no contrato e `displayName` no `GET /engines`.
- **Renomear o produto** (`remote-claude`, `remote_claude`, bundle ids): decisão de produto
  ([03 · ME-12](../../discovery/03-multiplos-motores-de-agente.md#18-decisões-em-aberto)). Esses nomes
  são exceção permanente do portão, com o motivo.
- **O conteúdo dos planos 12, 13, 14, 15, 16, 18, 19, 26 e 27:** as tasks ainda não executadas deles
  foram ajustadas na criação deste plano (2026-10-10, pedido do usuário). Mudou **onde** e **em que
  forma** elas constroem, e não **o que** entregam. Cada ajuste tem a sua decisão ✅ no plano de origem,
  e a B-07 confere os ajustes contra as normas da F0.
- **Mudar a proposta de workflow** ([discovery 02](../../discovery/02-workflow-de-sessoes.md)): os
  ajustes continuam os da [03 §10.13](../../discovery/03-multiplos-motores-de-agente.md#1013-resumo-do-impacto-no-wf).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Normas e catraca](F0-norms.md) | ADR, AGENTS, docs-alvo, `neutral:check` com baseline, lint dos três anéis, os planos ajustados conferidos | B-01…B-07 | 🔲 |
| F1 | [Porta de motor e conversa](F1-engine-port.md) | `AgentEnginePort`, `EngineRegistry`, `ConversationRef`, erros neutros, `GET /engines`, contrato `v+1` | B-08…B-13 | 🔲 |
| F2 | [Ferramentas canônicas](F2-canonical-tools.md) | o classificador no adapter, o `kind` no contrato e no domínio, o diff pelo backend, os clientes sem nome de ferramenta | B-14…B-19 | 🔲 |
| F3 | [Interações e estado](F3-interactions.md) | plano, pergunta, subagent, tarefas, compactação, contexto e origem da mudança, todos canônicos | B-20…B-25 | 🔲 |
| F4 | [Modos, esforço, uso e blocos](F4-modes-and-usage.md) | modos canônicos, esforço anunciado, `usage` canônico, blocos com nome nosso | B-26…B-30 | 🔲 |
| F5 | [Permissão pelo dialeto](F5-permission-dialect.md) | a gramática canônica de regra, o `RuleDialect` tradutor, as regras migradas, `engine` e `tool_kind` no banco, ADR-011 reescrito | B-31…B-35 | 🔲 |
| F6 | [Extensões isoladas](F6-engine-extensions.md) | o `claude-config` dividido, `engines/claude/` no backend e no web, nomes, kinds e i18n neutros nas três pontas, todo o REST no pacote | B-36…B-42, B-48 | 🔲 |
| F7 | [E2E](F7-e2e.md) | o motor de teste, os e2e com ele e com o Claude, o baseline vazio | B-43…B-47 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| As normas da mudança estão escritas antes do código (R6) | B-01, B-02, B-03 | [00-decisions](../../architecture/shared/00-decisions.md), [AGENTS.md](../../../AGENTS.md), [09-code-quality](../../architecture/shared/09-code-quality.md) | S-01…S-04 |
| Nenhum acoplamento novo entra no núcleo, e o de hoje só encolhe (R3, R4) | B-04, B-05 | [09-code-quality](../../architecture/shared/09-code-quality.md), [11-validation-protocol](../../architecture/shared/11-validation-protocol.md) | S-05…S-16 |
| O núcleo nunca importa uma extensão, nas três pontas (R2, R4) | B-06 | [09-code-quality](../../architecture/shared/09-code-quality.md#regras-de-arquitetura-como-lint) | S-17…S-22 |
| As dependências e a ordem dos planos estão escritas onde cada plano é lido (R5) | B-07 | [plans/README](../README.md#ordem-de-execução) | S-23, S-24 |
| A sessão fala com uma porta de motor, e a conversa é `{ engine, id }` em todo lugar (R1, R2) | B-08…B-13 | [backend/04](../../architecture/backend/04-claude-integration.md), [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md), [backend/05](../../architecture/backend/05-persistence.md) | S-25…S-40 |
| Toda ferramenta chega canônica, e nenhum cliente lê nome nem input cru (R1, R3) | B-14…B-19 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md), [ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso) | S-41…S-60 |
| Plano, pergunta, subagent, tarefas, compactação, contexto e origem são canônicos (R1, R3) | B-20…B-25 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-61…S-76 |
| Modos, esforço, uso e blocos são nossos, e o motor anuncia o que tem (R1) | B-26…B-30 | [ADR-022](../../architecture/shared/00-decisions.md#adr-022--permitir-tudo-é-um-modo-nosso-não-o-bypasspermissions-do-sdk), [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-77…S-90 |
| A regra de permissão é canônica, as gravadas foram migradas, e a segurança é contrato por motor (R2) | B-31…B-35 | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse), [backend/03](../../architecture/backend/03-modules.md) | S-91…S-103, S-131…S-134 |
| O que é de um motor só mora no anel de extensão, o núcleo tem nome neutro nas três pontas, e todo o REST tem tipo gerado (R1, R2, R4) | B-36…B-42, B-48 | [backend/02](../../architecture/backend/02-folder-structure.md), [web/02](../../architecture/web/02-folder-structure.md), [mobile/02](../../architecture/mobile/02-folder-structure.md), [02-i18n](../../architecture/shared/02-i18n.md) | S-104…S-119, S-135, S-136 |
| Um motor que não é o Claude é desenhado igual, e o Claude continua igual (R3) | B-43…B-47 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-120…S-130 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
AGENTS.md                                    F0 — regra 12, roteador, gatilhos, anti-padrões
docs/architecture/shared/12-engines.md       F0 — os três anéis, o kind, as capacidades, o portão
docs/architecture/backend/04-engine-integration.md + 04a-claude.md     F1 (ex-04-claude-integration)
scripts/
├── engine-neutrality.mjs                    F0 — pnpm neutral:check (portão 11)
├── engine-vocabulary.json                   F0 — o vocabulário proibido, com o motivo (o arquivo da 27 · B-07)
├── engine-neutrality-baseline.json          F0 — as violações de hoje e a fase que remove cada uma; vazio na F7
└── lib/engine-neutrality.mjs                F0
packages/contracts/schema/
├── events/session-tasks-changed.schema.json            F3
├── commands/session-compact.schema.json                F3
├── definitions/{tool-subject,tool-label,engine-origin,conversation-ref,…}.schema.json   F1, F2
└── http/                                    F1 — as rotas REST da conversa (D-09)
backend/src/
├── domain/engine/                           F1 — EngineId, ConversationRef, capacidades, ToolKind
├── domain/engines/claude/                   F6 — o que só o Claude tem como regra
├── application/session/ports/agent-engine.port.ts      F1 (ex-claude-session.port.ts)
├── application/engines/claude/              F6
├── adapter/inbound/http/engines/            F1, F6 — /engines, /engines/:engine/*, /engines/claude/*
├── adapter/outbound/engines/claude/         F1 (ex-adapter/outbound/claude/); F2 tool-classifier; F5 rule-dialect
└── infrastructure/modules/engines/claude.module.ts     F1 — a composição
backend/test/fakes/engine/                   F7 — o motor de teste
web/src/
├── engines/claude/                          F6 (ex-features/claude-settings/)
└── app/engines.ts                           F6 — a composição
mobile/lib/
├── engines/                                 F0 — vazio, com o lint (D-15)
└── app/engines.dart                         F6
```

Os nomes de arquivo novos são proposta. Cada fase confirma onde o arquivo mora pela estrutura normativa
de cada ponta (regra 11 do AGENTS).

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | A classificação canônica erra, e uma ferramenta que escreve sai como leitura | **aberto** — tabela exaustiva com `never`, desconhecido = `other`, que sempre pergunta e nunca tem regra larga (B-14, B-16) |
| R-02 | A neutralização muda o comportamento com o Claude (regressão silenciosa) | **aberto** — critério "tudo igual": os e2e de hoje e o `smoke-live` sem mudar cenário; as fixtures dos planos 22, 24 e 26 conferidas antes e depois (B-46) |
| R-03 | O app publicado quebra com o `v+1` | **aberto** — janela de `v-1` com os dois formatos ([D-08](decisions.md#f1--porta-de-motor-e-conversa)) |
| R-04 | O plano atrasa a paridade do app (26) e a configuração do Claude (13) | **aceito** pela ordem ([D-01](decisions.md#f0--normas)) — a alternativa custava retrabalho maior ([discovery §10.2](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#102-as-alternativas)) |
| R-05 | O baseline vira esconderijo de violação | **aberto** — só encolhe, cada entrada com a fase, e entrada vencida reprova (B-05) |
| R-06 | A F6 (centenas de renomes) conflita com outra sessão no mesmo working tree | **aberto** — a F6 roda sem outro plano em andamento no mesmo tree, e depois das fases de contrato |
| R-07 | A migração `claude_session_id` → `conversation_id` perde a ligação com checkpoint ou origem | **aberto** — migration nova com cópia e conferência; as antigas não mudam (B-11) |
| R-08 | O núcleo fica neutro no papel, mas as telas supõem a capacidade presente | **aberto** — o motor de teste com capacidades a menos, nas duas pontas (B-43…B-45) |
| R-09 | A migração das regras para a gramática canônica desliga ou muda o alcance de uma regra que a pessoa usa | **aberto** — a regra sem tradução é desligada, nunca apagada, e listada na tela com o padrão antigo; a migration confere a contagem; S-91 compara o casamento antes e depois ([D-18](decisions.md#f5--permissão-pelo-dialeto)) |

As decisões estão em [decisions.md](decisions.md), por fase.

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. **Toda fase atualiza os documentos que a tabela dela cita**, na mesma entrega
   ([discovery §8](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#8-mudanças-de-documentação-e-do-agents)).
   Documento atrás do código é norma errada.
