# Plano 27 — Perdas da conversa

**Objetivo:** toda mensagem que o agente emite tem um destino declarado e conferido pelo compilador. O
que o backend hoje descarta antes do WS (saída de comando, avisos de hook, de modelo e de erro, a
mídia no resultado de tool, a compactação no histórico) chega às duas pontas por eventos canônicos.
E o que nenhuma ponta conhece **aparece na conversa**, no web e no app, com o mesmo elemento.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full         # portões 1-11, sai com código 0
pnpm test:e2e:mobile     # o e2e do app, que o verify:full não roda (o portão 9 é só do web)
pnpm test:e2e:live       # a forma das mensagens medidas na F0, contra o Claude real, por versão do CLI
```

**Depende de**, concluídos **antes da F0** ([D-01](decisions.md#normas)):

- [plano 26 — Paridade da conversa no app](../26-mobile-conversation-parity/README.md): o app igual ao
  web de hoje. Daqui saem o `SafeMarkdown` do app, o aninhamento de subagent (F5 de lá) e o
  `render-parity.json` em que cada elemento novo entra como `ok`;
- [plano 13 — Configuração do Claude](../13-claude-settings/README.md): traz para a sessão o que gera a
  maior parte das perdas (tool MCP pela composição, skill de usuário pelo plugin sintético, slash
  command, hook e subagent de projeto). Com ele pronto, as fixtures da F0 são gravadas **pela via
  real**, e não por um ambiente de spike que imita a composição;
- [plano 28 — Núcleo neutro de agente](../28-agent-neutral-core/README.md): o contrato canônico inteiro
  (`kind`, `label`, `origin`, `conversation { engine, id }`, `usage`), os três anéis
  (`engines/claude/` nas três pontas) e o portão de neutralidade, que confere o vocabulário deste plano.
  As convenções que nasceram aqui (`origin`, `kind` aberto com a linha genérica, `messageKey` ou `text`,
  o critério da [D-10](decisions.md#f2--contrato)) passaram a valer para o contrato inteiro lá, e o teste
  de vocabulário da [B-07](F2-contract.md) foi absorvido pelo portão de lá ([D-14](decisions.md#normas)).

A ordem decidida pelo usuário em 2026-10-09 era 26 → 13 → 27. Em 2026-10-10, o usuário pôs o plano 28
no meio: 26 · F1 → 28 → 26 · F2…F7 → 13 · F2…F4 → 27 ([D-14](decisions.md#normas)).

**Insumo:** [discovery 09 — O que o backend perde da conversa](../../discovery/09-perdas-do-backend-na-conversa.md).
A discovery explica o **porquê** e mede o que existe; este plano é o contrato. Onde os dois divergem,
vale o plano, e a divergência está em [decisions.md](decisions.md). As decisões da discovery mantêm
os IDs (D-01…D-11).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Os pedidos do usuário, de 2026-10-09 ([discovery §1](../../discovery/09-perdas-do-backend-na-conversa.md#1-o-pedido)):

- **R1** — levantar e corrigir as perdas do backend que a antiga F6 do plano 26 citava;
- **R2** — o que o web passar a mostrar, o app mostra igual, no conteúdo e no formato;
- **R3** — "mensagens que são desconhecidas, tem que de alguma forma aparecer no chat mobile e web, tem
  que ter uma saída, não só log";
- **R4** — o 26 faz a paridade do que existe; este plano complementa o que falta nas duas pontas;
- **R5** — mensagens, comandos e eventos são **canônicos**: outro agente de código pode entrar depois.

Medido no código e no `sdk.d.ts` 0.3.277
([discovery §2](../../discovery/09-perdas-do-backend-na-conversa.md#2-a-resposta-curta)): o
`SDKMessage` tem 39 variantes, o mapper converte 8, cala 9 de propósito e **22 caem no `default`**, que
só escreve um `warn`. E uma perda já acontece hoje: o `/compact` desenha **dois balões "Você"** que a
pessoa não escreveu, um com o resumo inteiro e outro com a tag `<local-command-stdout>` crua.

Quatro escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **Medir antes** ([F0](F0-spike.md)) | três premissas da antiga F6 caíram na medição (o `systemMessage` do hook, o modelo reserva por sobrecarga, a compactação no histórico). O que o CLI emite muda por versão e não está todo no `sdk.d.ts` |
| **Destino de compilador** ([F3](F3-backend-notices.md)) | cada variante está em exatamente uma lista (mapeada, aviso, quieta com motivo). Um `switch` exaustivo com `never` quebra o `tsc` quando o SDK acrescenta uma variante, e o que escapar aparece na tela como `unknown` |
| **Um aviso canônico** ([F2](F2-contract.md)) | um evento `session.notice` com `kind` nosso cobre os 16 casos, em vez de um evento por variante do Claude. O vocabulário do SDK fica no adapter ([ADR-006](../../architecture/shared/00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru), [discovery 03 §3](../../discovery/03-multiplos-motores-de-agente.md#3-princípios)) |
| **Silêncio declarado antes da regra nova** ([F1](F1-known-silent.md)) | mostrar o evento desconhecido (D-02) sem uma lista explícita de "conhecidos e calados" desenharia uma linha a cada `session.mcpStatusChanged`. A lista sai numa versão do app **antes** de a regra mudar (R-05) |

---

## Escopo

### Entra

| | |
|---|---|
| Spike das medições da D-05, os uuids da retirada (D-06), e as fixtures gravadas pela via real do plano 13 | F0 |
| A lista de eventos "conhecidos e calados", numa fonte só do contrato, adotada pelos dois clientes sem mudar o comportamento | F1 |
| O contrato: `session.notice`, `message.retracted`, e os campos novos de `message.completed`, `tool.completed`, `turn.completed` e `session.compacted`, com os `kind` e campos novos no vocabulário do portão de neutralidade do plano 28 | F2 |
| Backend ao vivo: o `switch` exaustivo, os avisos do §4, o desfecho do turno, o `denied`, a mensagem sintética e o eco, a troca de modelo com retirada, a linha `unknown` | F3 |
| Backend: imagem, `resource` e `resource_link` no resultado de tool, e a rota de imagem servindo a imagem aninhada | F4 |
| Backend: o histórico lido com as mensagens de sistema, pelas mesmas funções do ao vivo, com ids estáveis | F5 |
| Web e app **juntos**: a linha de aviso, todo desconhecido U-05…U-11, o resumo da compactação, a mídia no card, a retirada, o `denied`, o turno com erro, o i18n pareado, e o 05 com a regra nova | F6 |
| E2E do web, do app e o `smoke-live` das medições, e a conferência das fixtures do plano 13 (D-11) | F7 |

### Não entra

- **A paridade do que o web já mostra:** é do [plano 26](../26-mobile-conversation-parity/README.md) (R4).
- **As features que algumas variantes sugerem:** a lista de slash commands (`commands_changed`), a
  elicitação MCP, a Files API, as sugestões de prompt e o `SessionStore`. Ficam quietas com o motivo
  escrito, e voltam a ser discutidas se a feature entrar
  ([discovery §11](../../discovery/09-perdas-do-backend-na-conversa.md#11-fora-do-escopo)).
- **O `tool_use_result` estruturado do MCP:** o texto basta.
- **O zoom no diálogo de imagem do web:** diferença conhecida, registrada na [D-08](decisions.md#normas).
- **Nenhum comando novo** do cliente para o servidor: tudo aqui são eventos e campos de evento.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Spike](F0-spike.md) | as medições da D-05, os uuids da retirada e as fixtures gravadas | B-01, B-02 | 🔲 |
| F1 | [Conhecidos e calados](F1-known-silent.md) | a lista de eventos calados no contrato, adotada pelos dois clientes | B-03, B-04 | 🔲 |
| F2 | [Contrato](F2-contract.md) | `session.notice`, `message.retracted`, os campos novos e o teste canônico | B-05…B-07 | 🔲 |
| F3 | [Avisos no backend](F3-backend-notices.md) | o `switch` exaustivo, os avisos, o desfecho do turno, a sintética, a retirada, o `unknown` | B-08…B-13 | 🔲 |
| F4 | [Mídia no resultado de tool](F4-tool-media.md) | os anexos do `tool.completed` e a rota da imagem aninhada | B-14, B-15 | 🔲 |
| F5 | [Histórico](F5-history.md) | o histórico com as mensagens de sistema, igual ao ao vivo, com ids estáveis | B-16…B-18 | 🔲 |
| F6 | [Web e app](F6-clients.md) | cada elemento novo com o par web/app, o desconhecido na tela e a regra nova no 05 | B-19…B-24 | 🔲 |
| F7 | [E2E](F7-e2e.md) | a conversa pela porta do usuário nas duas pontas, e as medições contra o Claude real | B-25…B-28 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O desenho se apoia na forma medida, não em leitura de tipo (R1) | B-01, B-02, B-27 | [descoberta do SDK](../../discovery/01-descoberta-claude-agent-sdk.md) | S-01…S-04, S-105, S-106 |
| Evento que não é conversa é calado por lista explícita, nas duas pontas, antes da regra nova (R3, R-05) | B-03, B-04 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-05…S-09 |
| O contrato novo é aditivo, canônico e o mesmo em TS e Dart (R5) | B-05, B-06, B-07 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md), [ADR-006](../../architecture/shared/00-decisions.md#adr-006--protocolo-próprio-não-sdkmessage-cru) | S-10…S-17 |
| Toda variante do SDK tem destino declarado, conferido pelo compilador (R1, R3) | B-08 | [backend/03-modules](../../architecture/backend/03-modules.md) | S-18…S-21 |
| O que o agente avisa chega à conversa como aviso canônico, com texto não confiável cortado (R1, R5) | B-09 | [shared/03-logging](../../architecture/shared/03-logging.md), [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-22…S-31 |
| O turno com erro e a tool negada pelo CLI dizem o que houve (R1) | B-10 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-32…S-36 |
| O que o agente injeta na conversa nunca vira prompt (R1) | B-11 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-37…S-43 |
| A resposta recusada sai da tela quando o agente a retira (R1) | B-12 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-44…S-47 |
| A variante desconhecida aparece, sem o JSON, e o `warn` continua (R3) | B-13 | [shared/03-logging](../../architecture/shared/03-logging.md) | S-48…S-52 |
| Imagem, recurso e link no resultado de tool chegam sem bytes no WS (R1) | B-14, B-15 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md), [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-53…S-62 |
| O histórico mostra o mesmo que o ao vivo mostrou, sem duplicar nem sobrescrever (R1) | B-16, B-17, B-18 | [backend/05-persistence](../../architecture/backend/05-persistence.md), [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#acompanhar-um-transcript--transcript) | S-63…S-71 |
| Cada elemento novo tem o mesmo par no web e no app (R2) | B-19, B-21, B-22, B-23 | [web/03-ui-system](../../architecture/web/03-ui-system.md), [mobile/04-ui](../../architecture/mobile/04-ui.md), [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-72…S-77, S-88…S-101 |
| Todo desconhecido U-05…U-11 aparece na conversa, nas duas pontas (R3) | B-20 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-78…S-87 |
| A regra nova do contrato é norma escrita (R3) | B-24 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-102 |
| A conversa pela porta do usuário, nas duas pontas, e as fixtures do plano 13 conferidas (R1, R2, D-11) | B-25, B-26, B-28 | [shared/06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-103, S-104, S-107 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
scripts/
└── conversation-losses-spike.mjs        F0 — pnpm spike:conversation-losses (sobre o lib/spike-session.mjs)
backend/test/fakes/agent-sdk/fixtures/   F0 — compact-failed, local-command, project-command, skill,
                                              hook-message, mcp-media-result, denied-by-rule, refusal-fallback
packages/contracts/
├── schema/                              F1, F2 — session.notice, message.retracted, campos novos, a lista de calados
└── src/protocol.ts                      F1, F2 — gerado; o protocol.g.dart do app sai do mesmo schema
backend/src/adapter/outbound/engines/claude/     (o adapter do Claude, movido pela F1 do plano 28)
├── sdk-message.mapper.ts                F3 — o switch exaustivo e as três listas
├── sdk-notices.ts                       F3 — variante do Claude → kind canônico (só no adapter)
├── sdk-tool-result.ts                   F4 — anexos do tool_result
├── transcript-contents.ts               F4 — o índice de imagens olha dentro do tool_result
└── transcript.adapter.ts                F5 — includeSystemMessages
web/src/features/session/
├── services/conversation-reducer.ts     F1, F6 — calados, aviso, desconhecido, retirada
└── components/conversation/             F6 — NoticeRow, UnknownRow, resumo da compactação, mídia no ToolRow
mobile/lib/features/session/
├── data/mappers/                        F1, F6 — calados, aviso, desconhecido, o histórico sem descarte
├── domain/entities/                     F6 — NoticeLine, UnknownLine, retirada
└── presentation/widgets/                F6 — as mesmas linhas, o resumo, a mídia no ToolCard
```

Os nomes de arquivo novos do backend são proposta; a B-08 confirma onde a classificação mora pela
[backend/02-folder-structure](../../architecture/backend/02-folder-structure.md). Tudo o que conhece o
Claude fica no anel `engines/claude/`, e os clientes não têm nada deste plano fora do núcleo.

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | A linha `unknown` vira ruído (uma variante nova a cada turno) | **aberto** — contador em sequência, lista de quietas com motivo, e o `never` que obriga a decidir na atualização do SDK (B-08, B-20) |
| R-02 | Texto de hook ou de comando com conteúdo sensível chega ao buffer de replay e ao celular | **aberto** — corte, nunca o JSON, só campo de texto conhecido; revisão de segurança no fim do plano (B-09, B-13, D-03) |
| R-03 | `includeSystemMessages` deixa a leitura do histórico mais lenta | **aberto** — medido na B-01; o cache por versão do plano 22 continua (B-16) |
| R-04 | A forma do `systemMessage`, do aviso de troca de modelo ou do JSONL muda numa versão do CLI | **aberto** — fixtures gravadas (B-02) e `smoke-live` (B-27) |
| R-05 | Mudar "cliente ignora" quebra o app da loja | **aberto** — a lista de calados sai na F1, antes da regra nova da F6 (D-02) |
| R-06 | A retirada remove a mensagem errada | **aberto** — os ids medidos na B-01 (D-06); a retirada é idempotente e ignora id desconhecido (B-12, B-23) |
| R-07 | Entre o fim do 13 e este plano, as sessões com MCP, skill, hook e comando de projeto rodam com as perdas | **aceito** pela ordem (D-01); a D-11 tirou da B-46 do 13 o que só este plano corrige |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
