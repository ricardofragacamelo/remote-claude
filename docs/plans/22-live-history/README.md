# Plano 22 — Histórico ao vivo

**Objetivo:** tudo o que o Claude Code mostra de uma conversa chega ao remote-claude **ao vivo**, no web
e no mobile, mesmo quando a conversa está sendo conduzida em outro cliente (VS Code, terminal), e
chega **como** o Claude Code mostra: pensamento, título e saída da ferramenta, imagem do prompt e
uma linha do tempo sem cabeçalho repetido.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full         # portões 1-11, sai com código 0
pnpm test:e2e:mobile     # o e2e do app, que o verify:full não roda
```

**Depende de:** [plano 04 — Histórico e retomada](../04-transcript-and-resume/README.md) (o leitor de
transcript pelo SDK, o redutor único da B-03, o cache e o limitador da D-02),
[plano 08 — Painel do Claude](../08-claude-panel/README.md) (o leitor "Do histórico", a `activity`, a
D-17 que este plano revê) e [plano 10 — Layout do chat no app](../10-mobile-chat-layout/README.md) (o mapa
[i18n-shared.json](../../../scripts/i18n-shared.json) da D-04). **Não depende** dos planos 11…21
([D-01](decisions.md#f0--normas-e-contrato)).

**Origem:** a proposta [Histórico ao vivo e fiel ao Claude Code](../../propostas/historico-ao-vivo-e-fiel.md),
de 2026-10-04, que tem a evidência de cada lacuna, as medições e as referências de linha. Este plano não a
repete: aponta para ela.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Em 2026-10-04 o usuário abriu a mesma conversa no leitor do remote-claude e na extensão do Claude Code
no VS Code, e viu duas telas diferentes. O leitor parou na leitura inicial enquanto o VS Code seguia, e
o que chegou não era o que o VS Code mostra ([proposta §4.1](../../propostas/historico-ao-vivo-e-fiel.md#41-comparação-lado-a-lado)).

| O que o usuário vê | Causa no código | O que este plano faz |
|---|---|---|
| o leitor para na leitura inicial (web e mobile) | ninguém relê a conversa: o web não tem `refetchInterval`, o mobile lê uma vez, e o contrato não tem como acompanhar um transcript | assinatura por WebSocket, com uma sondagem barata por conversa no backend (F2), nas duas pontas (F3, F4) |
| nada diz que o Claude está trabalhando | o transcript não grava o estado do turno | "Trabalhando em outro cliente…", inferido da última entrada (F2…F4) |
| "Pensou — o modelo não mostrou" em ⅔ dos pensamentos | o pensamento omitido (o padrão do CLI) é rotulado como ausência; o histórico não tem duração; dois omitidos iguais viram um | rótulo de pensamento, "Pensou por até N s" e deduplicação por `blockId` (F1, F5, F6) |
| o pensamento resumido some sob "Pensou" | a D-17 do 08 manda recolher | à vista, atenuado, como o VS Code ([D-15](decisions.md#f5--fidelidade-no-web)) |
| "Bash: cd /home/… && p…" em vez da descrição | `tool.started.title` existe no contrato e nunca é preenchido | o backend preenche `title` com a `description` (F1) |
| a saída da ferramenta: 200 caracteres do **início**, às vezes JSON | `summarise` corta pela cabeça e não usa `resultText` | `summary` em texto, pela cauda; a saída completa por rota, sob demanda; IN/OUT (F1, F5, F6) |
| um "CLAUDE" antes de cada passo, até vazio | o autor é desenhado por resposta da API | autor por turno, sem cabeçalho vazio ([D-16](decisions.md#f5--fidelidade-no-web)) |
| prompt com imagem vira "Você" vazio | o bloco de imagem chega só com `type` | marcador "imagem anexada", e a imagem aberta sob demanda ([D-09](decisions.md#f1--mapeamento-e-leituras)) |
| o mobile não avisa que a conversa está ativa em outro cliente | o mapper do app não lê `activity` | aviso vivo e confirmação antes do fork (F4) |

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **Assinatura WS com sondagem no backend, não `fs.watch` nem reconsulta no cliente** ([D-02](decisions.md#f0--normas-e-contrato)) | o transcript só é lido pelo Agent SDK (S-09 do plano 04, `pnpm lint:arch`), então observar o arquivo está fora. Reconsultar do cliente custa uma página inteira por aba por tick. A sondagem é por conversa, compartilhada por todos que a acompanham, e o `getSessionInfo` custa ~2 ms; a releitura cara só acontece quando o `lastModified` muda ([proposta §5.4](../../propostas/historico-ao-vivo-e-fiel.md#54-custo-medido-em-2026-10-04-na-conversa-ebfc173a)) |
| **Um evento, um formato** | o que chega pelo acompanhamento tem a forma do histórico e da sessão viva, e é dobrado pelo **mesmo** redutor (B-03 do 04) no web e pela mesma `Conversation` no app. Não nasce um terceiro formato |
| **A ordem é a do SDK, nunca a do relógio** | o SDK devolve a cadeia `parentUuid`, que é o que o modelo viu; o prompt enfileirado tem timestamp anterior ao resultado que o precede ([proposta §4.7](../../propostas/historico-ao-vivo-e-fiel.md#47-prompts-do-usuário-enfileirados-e-com-imagem)). Um cenário prende isso (S-21) |

---

## Escopo

### Entra

| | |
|---|---|
| O contrato WS e REST, as normas das telas, as chaves i18n e ARB, os pares do mapa compartilhado e as gravações de fixture | F0 |
| O mapeamento no backend (`blockId`, `at`, `title`, `summary` pela cauda, bloco de imagem, `lastMessageId`), as rotas da saída completa e da imagem, e a deduplicação por `blockId` nas duas pontas | F1 |
| O seguidor no backend: cauda, `working` inferido, sondagem compartilhada e adaptativa, reset, tetos, handler WS | F2 |
| Acompanhar no web: serviço, hook, junção, rolagem e pílula "N novas", aviso vivo e "trabalhando" | F3 |
| Acompanhar no mobile: data source, controller, ciclo de vida, aviso, confirmação de fork e "trabalhando" | F4 |
| Fidelidade no web: pensamento, autor por turno, IN/OUT com a saída completa, imagem | F5 |
| Fidelidade no mobile: os mesmos itens, com o card de ferramenta recolhível | F6 |
| E2E: conversa externa crescendo com o leitor aberto, reset e os rótulos, no web e no app | F7 |

### Não entra

- **Acompanhar subagente em execução em outro cliente.** Continua carregado ao abrir o card, como no 08
  · B-21 ([D-13](decisions.md#f2--seguidor-no-backend)).
- **Linha do tempo com marcadores, como a do VS Code.** Mexe em toda a tela da sessão; este plano faz o
  autor por turno ([D-16](decisions.md#f5--fidelidade-no-web)).
- **Subagente aninhado no mobile.** Fora por decisão do usuário no [10 · D-01](../10-mobile-chat-layout/decisions.md#f0--normas).
- **Markdown nas mensagens do mobile.** Não foi pedido aqui e muda toda a tela da sessão
  ([proposta §4.9](../../propostas/historico-ao-vivo-e-fiel.md#49-outras-divergências-entre-web-e-mobile-e-a-relação-com-o-plano-10)).
- **Dizer qual é o outro cliente.** A origem `external` não diz se é VS Code ou terminal; o texto é
  "outro cliente".
- **Mudar a listagem de conversas.** Continua com a sondagem de 10 s no web e "puxar para atualizar" no app.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde. A exceção declarada: **F3 e F4** dependem só da F2, e **F5 e F6** só da F1; os pares podem correr
em qualquer ordem entre si.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Normas e contrato](F0-norms.md) | o 05 e o REST escritos, schemas, normas das telas, i18n e ARB, pares do mapa, fixtures | B-01…B-05 | ✅ |
| F1 | [Mapeamento e leituras](F1-mapping.md) | `blockId`, `at`, `title`, `summary`, imagem, `lastMessageId`, as duas rotas, deduplicação por `blockId` | B-06…B-13 | ✅ |
| F2 | [Seguidor no backend](F2-follower.md) | `transcriptTail`, `inferWorking`, `TranscriptFollower`, handler WS, tetos, configuração, medição | B-14…B-19 | ✅ |
| F3 | [Acompanhar no web](F3-web-follow.md) | serviço, hook, junção, pílula, aviso vivo, "trabalhando" | B-20…B-23 | ✅ |
| F4 | [Acompanhar no mobile](F4-mobile-follow.md) | data source, controller, ciclo de vida, aviso e confirmação de fork, "trabalhando" | B-24…B-26 | ✅ |
| F5 | [Fidelidade no web](F5-web-fidelity.md) | pensamento, autor por turno, IN/OUT, imagem | B-27…B-30 | ✅ |
| F6 | [Fidelidade no mobile](F6-mobile-fidelity.md) | pensamento, card recolhível com IN/OUT, imagem | B-31…B-33 | ✅ |
| F7 | [E2E](F7-e2e.md) | tudo acima pela porta do usuário, no web e no app | B-34…B-37 | ✅ |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O contrato de acompanhar escrito antes do código, nas três pontas | B-01 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) · [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-01, S-02 |
| As rotas e os campos novos do transcript documentados | B-02 | [backend/03-modules §transcript](../../architecture/backend/03-modules.md) | S-03 |
| As regras das telas escritas antes das telas; a D-17 revista com rastro | B-03 | [web/03-ui-system](../../architecture/web/03-ui-system.md) · [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-04 |
| Os textos novos e alinhados nas duas pontas, presos pelo mapa | B-04 | [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-05, S-06 |
| Fixtures gravadas de execuções reais para cada forma nova | B-05 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-07 |
| Cada bloco tem identidade, e o histórico tem o instante | B-06 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-08…S-11 |
| O título da ferramenta é a descrição que o modelo deu | B-07 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-12, S-13 |
| O resumo da saída é texto, e guarda o fim | B-08 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-14…S-17 |
| A imagem do prompt chega como marcador, sem os dados | B-09 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-18, S-19 |
| A página diz até onde vai, e a ordem é a do SDK | B-10 | [backend/03-modules §transcript](../../architecture/backend/03-modules.md) | S-20, S-21 |
| A saída completa de uma ferramenta, sob demanda, no cercado de leitura | B-11 | [backend/03-modules §transcript](../../architecture/backend/03-modules.md) · [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-22…S-28 |
| A imagem do prompt, sob demanda, no cercado de leitura | B-12 | [backend/03-modules §transcript](../../architecture/backend/03-modules.md) | S-29…S-34 |
| Nenhum bloco some nem duplica | B-13 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md) · [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-35…S-39 |
| A cauda depois de um id, ou o aviso de cadeia reescrita | B-14 | [backend/01-clean-architecture](../../architecture/backend/01-clean-architecture.md) | S-40…S-44 |
| "Trabalhando" inferido da última entrada | B-15 | [backend/03-modules §transcript](../../architecture/backend/03-modules.md) | S-45…S-50 |
| Uma sondagem por conversa, adaptativa, com reset e tetos | B-16 | [backend/03-modules §transcript](../../architecture/backend/03-modules.md) | S-51…S-64 |
| O handler WS: ack antes de tudo, soltura na queda | B-17 | [backend/06-realtime](../../architecture/backend/06-realtime.md) | S-65…S-70 |
| Configuração e log de cada borda | B-18 | [shared/03-logging](../../architecture/shared/03-logging.md) | S-71, S-72 |
| O custo medido no transcript grande e com várias conversas | B-19 | [proposta §5.4](../../propostas/historico-ao-vivo-e-fiel.md#54-custo-medido-em-2026-10-04-na-conversa-ebfc173a) | S-73 |
| O web assina, junta, solta e reassina | B-20, B-21, B-22 | [web/01](../../architecture/web/README.md) · [web/04-state-and-data](../../architecture/web/04-state-and-data.md) | S-74…S-82 |
| O leitor do web acompanha o fim, conta as novas e diz o estado | B-23 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-83…S-88 |
| O app assina, junta, solta e reassina | B-24, B-25 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-89…S-95 |
| O leitor do app avisa, confirma o fork e diz "trabalhando" | B-26 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-96…S-100 |
| Pensamento como o VS Code, com honestidade sobre a duração | B-27, B-31 | [web/03-ui-system](../../architecture/web/03-ui-system.md) · [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-101…S-107 |
| O autor uma vez por turno | B-28 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-108…S-110 |
| Ferramenta com título, IN/OUT e a saída completa | B-29, B-32 | [web/03-ui-system](../../architecture/web/03-ui-system.md) · [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-111…S-117 |
| Imagem do prompt marcada e aberta sob demanda | B-30, B-33 | [web/03-ui-system](../../architecture/web/03-ui-system.md) · [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-118…S-122 |
| Tudo pela porta do usuário, nas duas pontas | B-34…B-37 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário) | S-123…S-130 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/
├── schema/commands/transcript-follow.schema.json, transcript-unfollow.schema.json
├── schema/acks/transcript-following.schema.json
├── schema/events/transcript-appended.schema.json, transcript-reset.schema.json
├── schema/responses/transcript-tool-result.schema.json
└── src/protocol.ts                          os tipos novos e os campos aditivos

backend/src/
├── domain/transcript/services/
│   ├── transcript-tail.ts                   a cauda depois de um id, ou "fora da cadeia"
│   └── infer-working.ts                     "trabalhando", da última entrada
├── application/transcript/
│   ├── follow-transcript.use-case.ts        o TranscriptFollower: assinaturas, tick, diff, tetos
│   ├── read-tool-result.use-case.ts
│   └── read-prompt-image.use-case.ts
├── adapter/inbound/ws/transcript/           transcript.follow / transcript.unfollow
├── adapter/inbound/http/transcript/         as duas rotas novas
└── adapter/outbound/claude/
    ├── sdk-message.mapper.ts                blockId, at, title, summary, imagem
    └── transcript.adapter.ts                toolResult, promptImage

web/src/features/session/
├── services/transcript-follow.service.ts
├── hooks/useConversationFollow.ts, useToolResult.ts, usePromptImage.ts
└── components/…                             ConversationReader, ThinkingBlock, ToolRow, MessageItem

mobile/lib/features/session/
├── data/…                                   comandos, eventos, rotas novas
├── domain/entities/history_page.dart        activity, lastMessageId
└── presentation/…                           controller, página, thinking_line, tool_card

scripts/transcript-follow-bench.mjs          a medição da B-19
backend/test/e2e/scripted-main.ts            a porta que faz a conversa externa crescer
e2e/specs/live-history.spec.ts
e2e/scenarios/live-history.json
mobile/integration_test/live_history_test.dart
```

Os nomes são indicativos. A fase decide o arquivo pela estrutura normativa de cada ponta
([backend/02](../../architecture/backend/02-folder-structure.md), [web/02](../../architecture/web/02-folder-structure.md),
[mobile/02](../../architecture/mobile/02-folder-structure.md)).

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | O SDK muda a forma de `SessionMessage` ou passa a esconder entradas | **aberto** — o leitor só depende do SDK; as fixtures gravadas pegam a mudança no teste do adapter (B-05) |
| R-02 | Transcript muito grande torna cada releitura cara (o SDK relê o arquivo inteiro) | **aberto** — releitura só quando o `lastModified` muda, uma por conversa, pelo `ReadLimiter`; medição acima de 50 MB na B-19, que pode rever a [D-11](decisions.md#f2--seguidor-no-backend) |
| R-03 | Compactação ou rewind no VS Code reescreve a cadeia | **aberto** — `transcript.reset` (B-16, S-55, S-56) |
| R-04 | `working` inferido errado (o VS Code fechado no meio de um turno) | **aberto** — só com `activity = 'activeElsewhere'`, expira com a janela, e a ajuda diz que é inferência ([D-12](decisions.md#f2--seguidor-no-backend)) |
| R-05 | Assinaturas órfãs (cliente some sem `unfollow`) | **aberto** — soltura no `disconnect`; conversa sem assinante para o tick (S-67, S-68) |
| R-06 | Alguém "corrige" a ordem pelos timestamps | **aberto** — S-21 prende a ordem do SDK com o prompt enfileirado da fixture |
| R-07 | O `blockId` muda a deduplicação também da sessão viva | **aberto** — desde a revisão da D-06 o id ao vivo e o do histórico coincidem; a junção do histórico com o vivo continua por `messageId` (S-38) |
| R-08 | As rotas de saída e de imagem expõem conteúdo (um `Read` de arquivo, um print) a quem não deveria | **aberto** — o mesmo cercado de leitura do transcript; nada do conteúdo no log; tetos; imagem só de tipos permitidos, sem SVG, com `nosniff` ([D-10](decisions.md#f1--mapeamento-e-leituras)) |
| R-09 | O plano 10 está em andamento e toca os mesmos widgets do app (`tool_card.dart`, `thinking_line.dart`, `conversation_view.dart`) | **aberto** — F6 começa depois de conferir o estado do 10; conflito vira linha no `progress.md` dos dois planos |
| R-10 | Outras sessões do agente trabalham na mesma árvore | **aberto** — conferir `ps` e `git status` antes de cada `pnpm verify` |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
6. A F7 fecha o plano com `pnpm verify:full` **e** `pnpm test:e2e:mobile`.
