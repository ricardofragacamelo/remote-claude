# Plano 26 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F1 — mapa de paridade, **parada em 2026-10-10 por decisão do usuário**. As três tasks da F1 estão escritas, e o `render:check` passa na árvore; o `pnpm verify` que a fecha foi interrompido no portão 7, com os portões 1–6 verdes. Retomar = rodar o `pnpm verify` de novo desde o portão 1. A F0 fechou em 2026-10-10, com o `pnpm verify` verde no ciclo 2
**Última atualização:** 2026-10-10
**Bloqueios:** nenhum. A D-10 fechou com o spike ([decisions.md](decisions.md)), e nenhuma decisão está aberta. Este plano **bloqueia** a F2 do [plano 13](../13-claude-settings/README.md), parada em 2026-10-09 ([D-01](decisions.md#normas)). A F2 espera o [plano 28](../28-agent-neutral-core/README.md) concluído: a F1 fecha com o `pnpm verify`, o 28 roda inteiro, e só então as F2…F7 ([D-15](decisions.md#normas))

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F7 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

## Medidas do spike (F0)

**B-01** (2026-10-09, contra o Claude real, `haiku`, CLI 2.1.277, SDK 0.3.277): na
[descoberta do SDK §12](../../discovery/01-descoberta-claude-agent-sdk.md#12--sexta-rodada-de-spikes-2026-10-09).
Nenhuma surpresa contra o que o plano assume: tudo o que o subagent emite leva `parent_tool_use_id`,
sem delta; o `canUseTool` do `Write` dele vem com o id da chamada **do subagent** e com `agentID`; o
histórico do subagent mora fora da conversa, achado pelo `parent_tool_use_id`; a tool MCP sem título é
`mcp__fixture__echo`; e cada bloco de texto de uma resposta chega numa mensagem de API própria.

**B-02**: as cinco fixtures gravadas do Claude real, com o histórico; a do subagent também com o dele
(`subagents`, por agent id). O gravador passou a recusar a gravação que não tem o que os testes
pedem — e recusou três: o subagent no modelo padrão delegou sem pensar (gravada em `haiku`, como o
spike), e a primeira do `Explanatory` rodou `ls -la` e trouxe o nome de usuário da máquina (regravada
pedindo só o `Read`).

**B-03** (2026-10-10). Um app mínimo fora da árvore (no scratchpad, como a
[25 · D-23](../25-mobile-file-browser/decisions.md#f0--spike-dos-motores)), APK **release** x86_64 no
emulador do e2e (`remote_claude_api35`, API 35, `swiftshader_indirect`) em dois perfis — o do e2e (4
núcleos, 2 GB) e um **modesto** (2 núcleos, 1,5 GB) —, duas rodadas em cada. O conteúdo: um balão de
**20 KB** de markdown com títulos, listas, tabelas, **10 blocos de código** e **3 diagramas** (o Mermaid
como o marcador sob demanda; o desenho é o `DiagramEngine` do plano 25, já medido lá); deltas de 20
caracteres a cada 5 ms (5,2 s de texto). Os tempos de quadro no emulador são de rasterização por
software: o que vale aqui é o tempo de **build** e a ocupação da linha de UI, não o raster.

Balão inteiro, construído de uma vez (mediana de 5, depois de um aquecimento): **~80 ms** de build e
layout até o fim do quadro, nos dois perfis, com ou sem realce (71–104 ms; uma amostra de 160 ms).

Streaming do mesmo balão (S-07):

| Como re-parseia | Relógio (e2e) | Relógio (modesto) | Build somado | Pior build |
|---|---|---|---|---|
| o bloco inteiro, a cada delta | 25,0–30,5 s | 26,6–32,5 s | 18–24 s | 90–150 ms |
| o bloco inteiro, a cada 100 ms | 10,6–15,8 s | 9,9–13,9 s | 2,9–8,2 s | 74–148 ms |
| em pedaços congelados, a cada delta | 12,5–14,1 s | 14,3–15,1 s | 5,9–7,5 s | 45–73 ms |
| **em pedaços congelados, a cada 100 ms** | **7,5–7,7 s** | **7,0–7,6 s** | **0,65–1,15 s** | **20–51 ms** |

O piso do relógio é o bombeamento: 1000 esperas de 5 ms são ~7 s no Android. Só a última linha fica
nele — a decisão da [D-14](decisions.md#f0--spike), que cumpre a [D-02](decisions.md#f0--spike) com o
limite de 100 ms.

Motor de realce (S-08), as 32 linguagens do `LANGUAGES` do web registradas e nenhuma outra:

| | `highlight` 0.7.0 | `re_highlight` 0.0.3 |
|---|---|---|
| Linguagens do web cobertas | 32/32 (`c` e `csharp` por alias) | 32/32 |
| APK arm64 release, a mais que sem motor (16,24 MB) | +262 KB | +721 KB |
| 500 linhas de TypeScript, mediana (primeira chamada) | 10–35 ms (13–243 ms) | 35–84 ms (45–134 ms) |
| Gramáticas | highlight.js 10, publicado em 2021-03, SDK `<3.0.0` | highlight.js 11.9, publicado em 2024-02 |

Escolha: `re_highlight`, com teto de 500 linhas por bloco ([D-10](decisions.md#f0--spike)). Os
escopos dos dois são os do highlight.js, então a tabela escopo → token do Monaco é a mesma tarefa
qualquer que fosse o motor.

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-spike.md) | B-01…B-03 | 3/3 | ✅ |
| [F1](F1-parity-map.md) | B-04…B-06 | 3/3 | ✅ |
| [F2](F2-shared-markdown.md) | B-07, B-08 | 0/2 | 🔲 |
| [F3](F3-message-markdown.md) | B-09…B-12 | 0/4 | 🔲 |
| [F4](F4-tool-cards.md) | B-13…B-17, B-32 | 0/6 | 🔲 |
| [F5](F5-subagents.md) | B-18…B-21 | 0/4 | 🔲 |
| [F6](F6-parity-gate.md) | B-27, B-28 | 0/2 | 🔲 |
| [F7](F7-e2e.md) | B-29, B-31 | 0/2 | 🔲 |
| **Total** | **B-01…B-21, B-27…B-29, B-31, B-32** | **6/26** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 78 | 66 | 0 | 12 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 15 | 0 | 0 | 15 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-10 | F0 | 5 — duplicação | o spike novo repetia do spike do plano 13 a cópia da credencial e o começo do `main()` (2 clones) | a cópia, a abertura e o laço inteiro do spike foram para `scripts/lib/spike-session.mjs` (`copyCredential`, `openSpike`, `runSpike`), e os dois scripts ficaram só com as sondas | reinício do portão 1 |
| 2 | 2026-10-10 | F0 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 1082 s) — **F0 concluída** |
| 3 | 2026-10-10 | F1 | — (interrompido) | o usuário parou o plano durante o portão 7 | — | portões 1–6 verdes; o ciclo não conta como fechamento da F1 |

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-10 | D-15: as F2…F7 esperam o [plano 28](../28-agent-neutral-core/README.md) e foram reescritas no contrato canônico (rótulo, diff, `usage`, subagent e pergunta pelo `kind`, autor como `{agent}`, rotas por `engine`) | as diretivas de isolamento, de regras e de canonicidade do plano 28, pedido do usuário; a ordem 26 · F1 → 28 → 26 · F2…F7 → 13 → 27 | README, F2…F7 (B-11…B-14, B-16…B-21, B-27, B-28, B-31, B-32), scenarios (S-41, S-45…S-50, S-52, S-57…S-60, S-62, S-64, S-66, S-69). 2026-10-10 (revisão dos gaps do 28): B-17 com `reasoningTokens?` e `webSearches?` do `usage` canônico (28 · D-17) |
| 2026-10-10 | O `render:check` entra no `check:contracts-i18n`, que mantém o nome (D-12 decidiu o portão, não o nome); o mapa cobre também os rótulos de `tool-labels.ts`, lidos do fonte, e as entradas `ok` nomeiam o widget por `arquivo#Nome`, conferido no arquivo | o F1 deixava o nome para a D-12; um rótulo novo do web sem par tem de reprovar como um componente novo | B-05, `package.json`, 11-validation-protocol |
| 2026-10-10 | D-10: `re_highlight`, com teto de 500 linhas; D-02 confirmada a 100 ms; D-14 nova: o streaming re-parseia só a cauda, em pedaços congelados | os números da B-03 | B-08, B-10 |
| 2026-10-09 | Decididas pelo usuário: D-02 (markdown a cada delta), D-07 (chip de MCP só leitura no app, pelo plano 13), D-11 (link da trilha com lista filtrada; "inserir no editor" fora), D-12 (mapa em `scripts/`, portão 11); D-04…D-06 saem com a F6 | perguntas das decisões em aberto | F4 ganha a B-32; F6 removida; plano 13 ganha a D-32 |
| 2026-10-09 | Plano criado a partir da [discovery 08](../../discovery/08-paridade-da-conversa-no-app.md), antes da F2 do plano 13 (D-01) | o usuário pediu a paridade da conversa no app, no conteúdo e no formato (R4), e parou o plano 13 na F2 para este rodar antes | plano 13: README, F2, F4 (B-46), decisions (D-31) e progress |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-09 | A F6 "Perdas do backend" inteira: tasks B-22…B-26 e a B-30 (o e2e do web delas), cenários S-72…S-76, S-80, S-81 e S-85. Da F0, as sondas da B-01 que mediam perda do backend (mensagem sintética, `/comando`, hook, modelo reserva, resultado MCP com mídia), as fixtures `mcp-media-result-turn`, `skill-turn`, `project-command-turn`, `hook-message-turn` e `fallback-turn` da B-02 e os cenários S-01…S-04. Os IDs ficam vagos. A F7 e a F8 passaram a F6 e F7 | este plano só deixa o app igual ao web de hoje; as perdas do backend e todo desconhecido são da [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md) ([D-06](decisions.md#f0--spike)) | a [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | Markdown malicioso no chat | 🔲 aberto | o renderizador do plano 25 (B-07, B-10) |
| R-02 | Conversa longa com muito markdown e diagramas trava o app | 🔲 aberto | medido na B-03; D-02 |
| R-03 | Mover o renderizador quebra o leitor do plano 25 | 🔲 aberto | testes do leitor sem edição (B-07) |
| R-04 | A forma das mensagens novas muda numa versão do CLI | 🔲 aberto | fixtures gravadas (B-02) e `smoke-live` (B-31) |
| R-05 | Subagent de subagent ilegível no celular | 🔲 aberto | a profundidade do web (B-19) |
| R-06 | O mapa vira lista de exclusões para passar | 🔲 aberto | exclusão só com decisão ✅ (B-05) |
| R-07 | O plano 13 retomar a F2 antes deste fechar | 🔲 aberto | dependência escrita no plano 13 |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
