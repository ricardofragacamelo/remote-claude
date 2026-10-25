# Plano 26 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** nenhuma — F0…F7 têm todas as tarefas e cenários prontos (2026-10-18…19; o plano 28 fechou em 10-18, liberando as F2…F7 pela [D-15](decisions.md#normas)), **mas o plano ainda não fechou**: falta um `pnpm verify:full` verde (ver Bloqueios). A F4 fechou com seis decisões ([D-18…D-25](decisions.md#f4--card-da-tool-e-linha-do-turno)), a maioria achada só ao implementar (o `AuditEntryRow` do web mostra o nome nativo da tool e um veredito rico que a regra núcleo-neutro proíbe replicar; a S-90 presumia rolagem infinita onde o web tem um botão; o `tool.inputScroll` da F1 ficou sem task própria até o portão 11 reprovar como obsoleto no fim da fase). A F5 fechou com três decisões ([D-26…D-28](decisions.md#f5--subagents)): a correção da própria B-18 (o `isSubagent` já vinha de `parentToolUseId` desde o plano 10), a escolha de lista plana + filtro por leitura (`entriesUnder`) em vez de árvore com buffer — confirmada por pesquisa como o desenho real do próprio web —, e a string nova `permissionSubagentTitle`, sem precedente no web. A F6 fechou com três decisões ([D-29…D-31](decisions.md#f6--portão-de-paridade)): a forma do JSON neutro (lista achatada de `Entry`, nunca os tipos internos de nenhum dos dois clientes, já que pensamento é bloco no web e entrada própria no app), a descoberta de que o prompt do usuário nunca aparece nas mensagens do SDK — só `handOverPrompt` o publica, fora do mapper —, e a isenção de `packages/contracts/fixtures/` no `jscpd`. O `render:check` não permite mais nenhum `pending` (`pendingAllowed: false`), e as cinco fixtures de paridade de conteúdo têm teste de unidade nos dois clientes, ao vivo e pelo histórico. A F7 fechou com três decisões ([D-32…D-34](decisions.md#f7--e2e)): uma fixture nova gravada (`ansi-output-turn`, a única com cor ANSI de verdade), a sonda `mcp` da B-31 ficando só na spike por `session.start` não aceitar servidor MCP avulso ainda, e quatro achados do próprio arnês de e2e do app que custaram catorze ciclos no emulador (o `SnackBar` de "Copiar mensagem" cobrindo o Enviar, `tester.pump(Duration)` não sendo tempo real no dispositivo, a busca de `seeInConversation` não alcançando um turno cedo numa conversa longa, e a paginação da tela de histórico). `pnpm test:e2e:mobile conversation_parity_test` e `pnpm test:e2e:live conversation-parity` verdes
**Última atualização:** 2026-10-19
**Bloqueios:** o fechamento do plano, por `pnpm verify:full` — reprovou **quatro** vezes seguidas no portão 9 (e2e do web), sempre com o mesmo `SessionLimitReachedError`. Nas três primeiras, a máquina estava sob carga, o que sustentava a hipótese de contenção; a quarta (2026-10-19, carga ~0,9 em 12 núcleos, nenhum outro processo de build na árvore) reproduziu o **mesmo padrão** — nada até ~12:22, depois `SessionLimitReachedError` (limite 10) a cada 15–30s, ininterrupto, até o fim da suíte às 12:28 — com a máquina livre. Isso derruba a hipótese de carga: 116 `session.start` e só uma fração de fechamentos correspondentes no log sugerem que specs anteriores do e2e do web não estão liberando a sessão ao final, e o registro fica saturado pelo resto da rodada — um vazamento real em `e2e/specs/` ou no arnês, não contenção. Ainda não investigado a fundo (fora do escopo desta rodada); é o próximo passo antes de tentar o `verify:full` de novo. Este plano bloqueia a F2 do [plano 13](../13-claude-settings/README.md), parada em 2026-10-09 à espera do plano 26 **inteiro** concluído ([13 · D-31](../13-claude-settings/decisions.md#decididas-durante-a-execução-b-01-2026-10-09)) — continua bloqueada até o `pnpm verify:full` fechar

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ████████████████████ 100%   ✅ concluída
F4 ████████████████████ 100%   ✅ concluída
F5 ████████████████████ 100%   ✅ concluída
F6 ████████████████████ 100%   ✅ concluída
F7 ████████████████████ 100%   ✅ concluída
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
| [F2](F2-shared-markdown.md) | B-07, B-08 | 2/2 | ✅ |
| [F3](F3-message-markdown.md) | B-09…B-12 | 4/4 | ✅ |
| [F4](F4-tool-cards.md) | B-13…B-17, B-32 | 6/6 | ✅ |
| [F5](F5-subagents.md) | B-18…B-21 | 4/4 | ✅ |
| [F6](F6-parity-gate.md) | B-27, B-28 | 2/2 | ✅ |
| [F7](F7-e2e.md) | B-29, B-31 | 2/2 | ✅ |
| **Total** | **B-01…B-21, B-27…B-29, B-31, B-32** | **26/26** | ✅ |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 78 | 0 | 0 | 78 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 35 | 0 | 0 | 35 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-10 | F0 | 5 — duplicação | o spike novo repetia do spike do plano 13 a cópia da credencial e o começo do `main()` (2 clones) | a cópia, a abertura e o laço inteiro do spike foram para `scripts/lib/spike-session.mjs` (`copyCredential`, `openSpike`, `runSpike`), e os dois scripts ficaram só com as sondas | reinício do portão 1 |
| 2 | 2026-10-10 | F0 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 1082 s) — **F0 concluída** |
| 3 | 2026-10-10 | F1 | — (interrompido) | o usuário parou o plano durante o portão 7 | — | portões 1–6 verdes; o ciclo não conta como fechamento da F1 |
| 4 | 2026-10-10 | F1 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 833 s), com o `render:check` e o `docs:check` verdes — **F1 concluída** |
| 5 | 2026-10-18 | F2 | 1 — formatação | `dart format` ainda não tinha rodado sobre `open_link.dart` (linha de 104 colunas) e os dois testes novos | `node scripts/mobile.mjs format:check` aplicado | reinício do portão 1 |
| 6 | 2026-10-18 | F2 | 5 — duplicação | três clones: a assinatura repetida de `visitElementAfterWithContext` entre `_MermaidBuilder`/`_CodeBuilder`, o `_Alternative` igual em `safe_markdown.dart` e em `markdown_viewer.dart`, e as linhas finais dos dois mapas de `highlight_theme.dart` | os dois builders viraram um `_ElementBuilder` com uma função por uso; `_Alternative` virou o `AlternativeText` público de `safe_markdown.dart`, reaproveitado pelo leitor; `highlight_theme.dart` passou a derivar `_light`/`_dark` de uma lista única de linhas (cor clara + cor escura por `scope`) | reinício do portão 1 |
| 7 | 2026-10-18 | F2 | 7 — cobertura (ambiente) | dois contêineres e dois processos `fake-tunnel` de uma rodada anterior interrompida ainda ocupavam a porta 5173 e o projeto Docker do `run-e2e-local`, derrubando o S-58 dele | contêineres, volumes e os dois processos `rc-tunnel` removidos à mão (não é causa no código) | reinício do portão 1 |
| 8 | 2026-10-18 | F2 | 7 — cobertura (teste instável) | S-118 (`session-changes.spec.ts`) e S-51 (`push.flow.spec.ts`) do backend — já catalogados como instáveis sob carga, sem relação com este plano | nenhuma — nova rodada | reinício do portão 1 |
| 9 | 2026-10-18 | F2 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 737 s), com o `render:check` sem as 14 entradas de F2 — **F2 concluída** |
| 10 | 2026-10-18 | F3 | — | — | — | `pnpm verify` verde de primeira, portões 1–7 (cobertura em 751 s), com o `render:check` sem as 8 entradas de F3 — **F3 concluída**. A implementação corrigiu dois achados próprios antes do portão: o toque longo do `PromptHold`/`MessageBubble` nunca disparava dentro da `SelectionArea` do novo `SafeMarkdown` (resolvido pelo `LongPressTrigger` por `Listener`, D-17), e o `Markdown` do balão pedia altura ilimitada dentro da lista (resolvido com `noScroll`/`shrinkWrap` no `SafeMarkdown`, sem portão vermelho — achados em teste local antes de rodar o portão) |
| 11 | 2026-10-18 | F4 | 2 — lint (complexidade) | `buildRouter` passou de 10 (o teto) ao ganhar a rota da B-32 (`auditTrailRoute`) inline | a rota virou `auditTrailPageRoute()`, função à parte, como `fileViewerPageRoute()` já era | reinício do portão 1 |
| 12 | 2026-10-18 | F4 | 5 — duplicação | cinco clones: `_DiffError`/o retry do `ToolOutputView` repetiam o mesmo `Semantics`+`Wrap`+botão; três variações do idioma Ícone+Coluna(Título, Texto) entre `AuditEntryTile` e `tool_card.dart`/`permission_card_view.dart`/`message_banner.dart`; e o `_text` de `session_event_mapper.dart` igual ao `wireText` de `wire_fields.dart` (da feature `permission`) | criado `core/widgets/retry_line.dart` (`RetryLine`), usado pelos dois retries; `AuditEntryTile` reescrito sobre `ListTile` (muda a forma, não só a ordem); `_text`/`_int` do mapper viraram `switch` de padrão, como o `_record` vizinho já fazia | reinício do portão 1 |
| 13 | 2026-10-18 | F4 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 762 s) — **F4 concluída** |
| 14 | 2026-10-18 | F5 | 2 — lint (complexidade) | `_drawEntry` chegou a 11 (o teto é 10) depois de reunir os seis parâmetros repetidos de `_drawEntry`/`_subagentOf`/`_nestedRows` num único `_RenderScope` — achado e corrigido em teste local antes deste ciclo, mas a extração somou um `if` a mais na própria função | o cálculo de `nested:` saiu para `_nestedOf(entry, scope)`, função à parte | reinício do portão 1 |
| 15 | 2026-10-18 | F5 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 762 s) — **F5 concluída**. Antes do portão, a duplicação (portão 5) já tinha sido corrigida localmente: os seis parâmetros repetidos entre `_drawEntry`/`_subagentOf`/`_nestedRows` em `conversation_view.dart` viraram o `typedef` de registro `_RenderScope`, sem mudar o comportamento (achado em teste local, não um ciclo de portão vermelho) |
| 16 | 2026-10-18 | F6 | 1 — formatação | `prettier` ainda não tinha rodado sobre o script novo (`record-conversation-parity-fixtures.ts`), o teste novo do web e quatro das fixtures geradas | `npx prettier --write` nos seis arquivos | reinício do portão 1 |
| 17 | 2026-10-18 | F6 | — | — | — | `pnpm verify` verde, portões 1–7 (cobertura em 746 s) — **F6 concluída**. Antes do portão, a duplicação (portão 5) já tinha sido corrigida localmente: as fixtures geradas de `packages/contracts/fixtures/conversation-parity/` repetiam blocos de texto entre `live-events.json`/`history-events.json`/`expected.json` — mesmo problema que `backend/test/fakes/agent-sdk/fixtures/` e `e2e/fixtures/` já tinham, resolvido do mesmo jeito: a pasta nova entrou no `ignore` do `.jscpd.json` (D-31) |
| 18 | 2026-10-19 | F7 | 5 — duplicação | o `smoke-live/conversation-parity.spec.ts` novo clonava o bloco de import + comentário do `commands-and-init.spec.ts` e o `finally` de teardown do `claude-panel.spec.ts` | o teardown virou `closedAfterTheRun(socket, folder)`, exportado de `e2e/fixtures/live-session.ts` e usado pelos dois specs; o comentário do topo trocou de `/** */` para linhas `//`, reescrito o bastante para não casar por token | reinício do portão 1 |
| 19 | 2026-10-19 | F7 | 7 — cobertura (`test/integration/scripts/cli.spec.mjs`) | `pnpm plan progress` (sem argumento) reprovava: faltava o marco "Plano 26 … concluído" no histórico de `docs/plans/progress.md`, e o link `13 · D-31` apontava para uma âncora (`#d-31`) que não existe — a D-31 do plano 13 é uma linha de tabela, sem `### D-31` próprio | o marco entrou no histórico geral; o link passou a apontar para `#decididas-durante-a-execução-b-01-2026-10-09`, a seção que a linha realmente mora | reinício do portão 1 |
| 20 | 2026-10-19 | F7 | — | — | — | **F7 concluída** (B-29, B-31: 26/26 tarefas, 78/78 cenários) — mas o **plano ainda não fecha**: `pnpm test:e2e:mobile conversation_parity_test` e `pnpm test:e2e:live conversation-parity` verdes, cada um rodado em separado como o critério da F7 pede (o e2e do app levou catorze ciclos no emulador, quatro achados do próprio arnês em D-34; o `smoke-live` achou um defeito do próprio teste, não do produto, corrigido em D-35) — mas `pnpm verify:full` reprovou três vezes seguidas no portão 9 (e2e do web) com o mesmo `SessionLimitReachedError`, de carga e não de regressão (nenhum `e2e/specs/` tocado). Três ciclos iguais no mesmo portão: parado e escalado ao usuário, que decidiu repetir mais tarde em vez de fechar sem o portão verde |

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
