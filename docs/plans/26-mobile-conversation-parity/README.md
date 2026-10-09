# Plano 26 — Paridade da conversa no app

**Objetivo:** o app mostra cada mensagem da conversa (do usuário, do Claude, dos subagents, das tools
e as linhas do turno) com o **mesmo conteúdo e o mesmo formato** que o web, incluindo o markdown. A
paridade é conferida por máquina, não por revisão.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full         # portões 1-11, sai com código 0 (o 11 passa a conferir a paridade de formato)
pnpm test:e2e:mobile     # o e2e do app, que o verify:full não roda (o portão 9 é só do web)
pnpm test:e2e:live       # a forma das mensagens novas contra o Claude real (F0 repetida por versão do CLI)
```

**Depende de:**

- [plano 10 — Layout do chat no app](../10-mobile-chat-layout/README.md): a conversa do app;
- [plano 22 — Histórico ao vivo](../22-live-history/README.md): o mapeamento único ao vivo e no
  histórico, o rótulo de autor (D-16 de lá);
- [plano 25 — Navegador de arquivos no app](../25-mobile-file-browser/README.md): o renderizador de
  markdown, o Mermaid e o leitor que o link de arquivo abre.

Os três estão concluídos.

**Bloqueia:** a [F2 do plano 13](../13-claude-settings/F2-mcp-servers.md), parada em 2026-10-09 por
decisão do usuário para este plano rodar antes ([D-01](decisions.md#normas)). O plano 13 traz para
a conversa tools MCP, skills, subagents do projeto, hooks e output styles, e cada um cai num ponto em
que o app perde informação hoje. A [B-46 do plano 13](../13-claude-settings/F4-e2e.md) passa a exigir
o portão deste plano com as fixtures dele.

**Insumo:** [discovery 08 — Paridade da conversa no app](../../discovery/08-paridade-da-conversa-no-app.md).
A discovery explica o **porquê** e mede o que existe; este plano é o contrato. Onde os dois divergem,
vale o plano, e a divergência está em [decisions.md](decisions.md). As decisões da discovery mantêm
os IDs (D-01…D-11).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

A regra do usuário, de 2026-10-09: "que o mobile não perdesse mensagens renderizadas no web, tanto no
conteúdo quanto no formato". Conferido contra o código no mesmo dia
([discovery §4](../../discovery/08-paridade-da-conversa-no-app.md#4-estado-atual-a-conversa-nas-três-pontas)),
o app hoje:

- **descarta** o texto e o pensamento de subagent: o mapper devolve `UnreadEvent` para todo frame com
  `parentToolUseId`;
- desenha a mensagem como `Text` puro, **sem markdown**, e cola os blocos de texto com `''`;
- descarta o `usage` do turno;
- concatena o `tool.progress` no OUT: `Bash · 1sBash · 2s…`;
- mostra a tool pelo nome cru (`mcp__srv__tool`), sem o rótulo por tool, o diff, as cores ANSI nem o
  realce de código que o web tem.

Antes das duas pontas, o backend também descarta coisas: a imagem do resultado de tool, a saída de hook
e de slash command, o aviso de troca de modelo, a compactação no histórico. E talvez publique como prompt
a mensagem sintética de uma skill. Isso **não** é deste plano: é perda das duas pontas, e vai para a [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md)
([D-06](decisions.md#f0--spike)).

Três escolhas dão forma ao plano:

| Escolha | Por quê |
|---|---|
| **Medir antes** ([F0](F0-spike.md)) | a forma das mensagens do subagent e da tool MCP sem título não está no `sdk.d.ts`: é o CLI que decide, e muda por versão. A F0 grava do Claude real e as fixtures saem dela |
| **O formato é regra de máquina** ([F1](F1-parity-map.md), [F6](F6-parity-gate.md)) | "mesmo formato" só se sustenta se um elemento novo no web sem par no app reprovar. Um mapa declarado web ↔ app, no molde do [i18n-shared.json](../../../scripts/i18n-shared.json), conferido pelo portão 11 |
| **O renderizador é um só** ([F2](F2-shared-markdown.md)) | o markdown do plano 25 sobe para `core/widgets/markdown/`, e o leitor de arquivos e o balão da conversa usam o mesmo. Dois renderizadores divergem, e a regra de segurança (HTML como texto, link confirmado, nada remoto) passaria a ter duas cópias |

---

## Escopo

### Entra

| | |
|---|---|
| Spike das mensagens que o CLI emite para skill, slash command, hook, modelo reserva e resultado MCP com imagem; as fixtures gravadas; o custo do markdown no app e o motor de realce | F0 |
| O mapa de paridade de formato (`render-parity.json`) com o inventário dos componentes da conversa do web, e o `render:check` com as pendências declaradas por fase | F1 |
| O renderizador de markdown movido para `core/widgets/markdown/`, e o bloco de código com realce, copiar e rolagem própria | F2 |
| Markdown no balão do Claude e do usuário, blocos e ordem preservados, rótulo de autor, selecionar e copiar, nome de arquivo como link para o leitor | F3 |
| Card da tool e linha do turno: rótulo por tool, `tool.progress` corrigido, cores ANSI, diff de `Edit`/`MultiEdit`/`Write`, tokens do turno, e o link para a trilha com a lista filtrada só de leitura | F4 |
| Subagent aninhado no app, ao vivo e no histórico, e o card de permissão com o dono | F5 |
| O portão: `render:check` sem pendência, e a paridade de conteúdo por fixture nas duas pontas | F6 |
| E2E do app e o `smoke-live` da forma das mensagens | F7 |

### Não entra

- **As features do plano 13 no app** (tela de configuração, servidores MCP, plugins, skills) e o
  indicador de MCP da sessão: não são mensagem. O web responde no celular. O indicador entra no app como
  chip só de leitura pelo [plano 13](../13-claude-settings/F2-mcp-servers.md#b-22--status-vivo-e-comandos-da-sessão-) ([D-07](decisions.md#normas)).
- **A view "Alterações"** e a **busca na conversa**: ferramentas da tela, não formato da mensagem.
  Continuam fora pelo [plano 10 · D-01](../10-mobile-chat-layout/decisions.md#f0--normas).
- **Ações de editor**: o "inserir no editor" do bloco de código, e abrir o arquivo no editor. No app,
  o link abre o leitor do plano 25. O app é só leitura ([ADR-015](../../architecture/shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web), [D-11](decisions.md#normas)).
- **A tela da trilha completa** no app, com filtros e entrada no menu: o link do card abre só a lista
  filtrada daquela sessão e tool ([D-11](decisions.md#normas)).
- **As perdas do backend** (mensagem sintética, mídia em resultado de tool, avisos de hook, modelo e
  comando, compactação no histórico): perda das duas pontas, que vai para a [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md)
  ([D-04, D-05, D-06](decisions.md#f0--spike)). Saiu deste plano em 2026-10-09; as tasks B-22…B-26 e a B-30
  ficaram vagas.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Spike](F0-spike.md) | a forma medida das mensagens novas, as fixtures gravadas, o custo do markdown e o motor de realce | B-01…B-03 | 🔲 |
| F1 | [Mapa de paridade](F1-parity-map.md) | o `render-parity.json`, o `render:check` com as pendências por fase, e o normativo | B-04…B-06 | 🔲 |
| F2 | [Markdown compartilhado](F2-shared-markdown.md) | o renderizador em `core/widgets/markdown/` e o bloco de código com realce | B-07, B-08 | 🔲 |
| F3 | [Markdown na mensagem](F3-message-markdown.md) | o balão com markdown, blocos em ordem, autor, selecionar e copiar | B-09…B-12 | 🔲 |
| F4 | [Card da tool e linha do turno](F4-tool-cards.md) | rótulo por tool, `tool.progress`, ANSI, diff, tokens, trilha | B-13…B-17, B-32 | 🔲 |
| F5 | [Subagents](F5-subagents.md) | o subagent aninhado, ao vivo e no histórico, e a permissão com o dono | B-18…B-21 | 🔲 |
| F6 | [Portão de paridade](F6-parity-gate.md) | `render:check` sem pendência e a paridade de conteúdo por fixture | B-27, B-28 | 🔲 |
| F7 | [E2E](F7-e2e.md) | a conversa pela porta do usuário no app, e a forma das mensagens contra o Claude real | B-29, B-31 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O desenho se apoia na forma medida das mensagens, não em leitura de tipo | B-01, B-02, B-31 | [descoberta do SDK](../../discovery/01-descoberta-claude-agent-sdk.md) | S-05, S-06, S-86, S-87 |
| O markdown do app cabe num celular modesto, e o realce tem motor escolhido por número | B-03 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-07, S-08 |
| Todo elemento que o web desenha numa mensagem tem par no app, ou exclusão nomeada — verificado por máquina | B-04, B-05, B-27 | [09-code-quality](../../architecture/shared/09-code-quality.md), [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-09…S-15, S-77…S-79 |
| A paridade é norma escrita, não costume | B-06 | [mobile/04-ui](../../architecture/mobile/04-ui.md), [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-16 |
| Um renderizador de markdown só, seguro, nas duas features do app | B-07 | [mobile/02-folder-structure](../../architecture/mobile/02-folder-structure.md) | S-17…S-21 |
| Código com realce, copiar e rolagem própria, com as cores do web | B-08 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-22…S-26 |
| A mensagem preserva os blocos e a ordem deles | B-09 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-27…S-30 |
| A mensagem do Claude e a do usuário com markdown, ao vivo e no histórico, sem conteúdo inseguro | B-10 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-31…S-40 |
| Autor, selecionar e copiar como no web | B-11 | [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-41…S-44 |
| O preview da pergunta estruturada pelo mesmo renderizador | B-12 | [plano 24 · D-21](../24-structured-questions/decisions.md#f4--mobile) | S-45 |
| O card da tool diz o que a tool fez, como o web | B-13 | [shared/02-i18n](../../architecture/shared/02-i18n.md) | S-46…S-50 |
| O progresso de uma tool é o tempo decorrido, não lixo no OUT | B-14 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-51…S-53 |
| Saída colorida, diff e tokens como no web | B-15, B-16, B-17 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-54…S-62 |
| O card da tool leva à trilha daquela invocação, como no web | B-32 | [backend/03 · audit](../../architecture/backend/03-modules.md#audit), [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-88…S-90 |
| Nenhuma mensagem de subagent se perde, ao vivo ou no histórico | B-18, B-19, B-20 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) | S-63…S-70 |
| A permissão de uma tool de subagent diz de quem é | B-21 | [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-71 |
| A mesma fixture produz o mesmo conteúdo nas duas pontas | B-28 | [shared/06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-82, S-83 |
| A conversa pela porta do usuário | B-29 | [shared/06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-84 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
scripts/
├── conversation-parity-spike.mjs        F0 — pnpm spike:conversation-parity
├── render-parity.json                   F1 — o mapa web ↔ app, com exclusões e pendências
└── render-check.mjs                     F1 — pnpm render:check, no portão 11
backend/test/fakes/agent-sdk/fixtures/   F0 — as fixtures gravadas (markdown, MCP, subagent…)
packages/contracts/
└── fixtures/conversation-parity/                     F6 — fixture → conteúdo esperado, lido pelas duas pontas
mobile/lib/core/widgets/markdown/        F2 — safe_markdown, markdown_syntaxes, mermaid_block, code_block
mobile/lib/features/session/
├── data/mappers/session_event_mapper.dart            F3, F5 — blocos, subagent
├── domain/entities/                                   F3, F4, F5 — blocos, usage, filhos de subagent
└── presentation/widgets/                              F3…F5 — balão, autor, rótulo, ANSI, diff, aninhamento
mobile/lib/features/audit/                F4 — a lista da trilha filtrada por sessão e tool, só leitura
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | Markdown malicioso no chat: link `javascript:`, imagem de rastreio, HTML | **aberto** — o renderizador do plano 25, com as regras e os testes dele (B-07, B-10) |
| R-02 | Conversa longa com muito markdown e diagramas trava o app | **aberto** — medido na B-03; lista preguiçosa, diagrama sob demanda, limite de frequência no streaming (D-02) |
| R-03 | Mover o renderizador quebra o leitor de arquivos do plano 25 | **aberto** — os testes do leitor rodam sem mudança (B-07) |
| R-04 | A forma das mensagens do subagent ou da tool MCP muda numa versão do CLI | **aberto** — fixture gravada do Claude real (B-02) e `smoke-live` (B-31) |
| R-05 | Subagent de subagent ilegível no celular | **aberto** — o mesmo aninhamento do web, com o estado padrão dele (B-19) |
| R-06 | O mapa de paridade vira lista que todo mundo marca como exclusão para passar | **aberto** — exclusão só com ID de decisão que existe e está ✅ (B-05) |
| R-07 | O plano 13 retomar a F2 antes deste fechar | **aberto** — a dependência está escrita no plano 13 (README, F2, progresso) |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Fase é a unidade do ciclo de validação.
3. Ao fim de cada fase: `pnpm verify`. Vermelho → corrige e **reinicia do primeiro portão**.
4. Registre cada ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
