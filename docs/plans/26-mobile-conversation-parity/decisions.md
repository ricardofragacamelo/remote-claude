# Plano 26 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

As D-01…D-11 vêm da [discovery 08 §13](../../discovery/08-paridade-da-conversa-no-app.md#13-decisões-em-aberto),
com os mesmos IDs. Da D-12 em diante, nasceram neste plano. A **R4** citada nos resultados é a regra
do usuário, de 2026-10-09: "que o mobile não perdesse mensagens renderizadas no web, tanto no
conteúdo quanto no formato".

---

## Normas

Valem para o plano inteiro.

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Onde a paridade mora: plano próprio, ou fase nova do plano 13 | — | — | 2026-10-09 · **plano próprio, rodado antes da F2 do plano 13**. Decisão do usuário com a recomendação ("criar novo plano"); o usuário parou a execução do 13 na F2 para este rodar antes. O plano 13 registra a dependência, e a B-46 dele passa a exigir o portão deste plano com as fixtures dele (MCP pela composição, skill de usuário) | ✅ |
| D-03 | Subagent aninhado no app. Reverte o "fica fora: o subagent aninhado" do [plano 10 · D-01](../10-mobile-chat-layout/decisions.md#f0--normas) | — | F5 | 2026-10-09 · **aninhar**, ao vivo e no histórico, com o estado padrão e a profundidade do web. Decidido pelo usuário pela R4. A alternativa mínima (só o texto) perde formato e sai | ✅ |
| D-07 | Indicador de MCP da sessão no app (o do web é da [13 · B-22](../13-claude-settings/F2-mcp-servers.md#b-22--status-vivo-e-comandos-da-sessão-)) | — | — | 2026-10-09 · **chip só de leitura no app, entregue pelo plano 13** na B-22: status e erro de cada servidor no cabeçalho da sessão, sem ligar/desligar/reconectar. Decisão do usuário. Não é mensagem, então não entra neste plano; registrado no plano 13 como [D-32](../13-claude-settings/decisions.md#decididas-durante-a-execução-b-01-2026-10-09) | ✅ |
| D-08 | Cores ANSI na saída de tool do app | — | B-15 | 2026-10-09 · **sim, com a paleta do `AnsiText`**. Decidido pelo usuário pela R4 | ✅ |
| D-09 | Diff de `Edit`/`MultiEdit`/`Write` no card da tool. Reverte "os diffs" do plano 10 · D-01 | — | B-16 | 2026-10-09 · **entra**. Decidido pelo usuário pela R4. A view "Alterações" continua fora: não é mensagem | ✅ |
| D-11 | Link do card da tool para a trilha, e o "inserir no editor" do bloco de código | — | B-04, B-32 | 2026-10-09 · **o link entra**: abre no app uma **lista só de leitura** das entradas da trilha daquela sessão e tool, como o filtro que o link do web aplica, sem formulário de filtros nem entrada no menu (B-32). O "inserir no editor" fica fora (`excluded` no mapa): o app é só leitura ([ADR-015](../../architecture/shared/00-decisions.md#adr-015--o-humano-escreve-no-disco-pela-web)). Decisão do usuário; a recomendação era excluir os dois | ✅ |
| D-15 | As F2…F7 sobre o núcleo neutro do plano 28: ordem e forma das tasks | — | F2…F7 | 2026-10-10 · ajuste às diretivas do [plano 28](../28-agent-neutral-core/README.md) (isolamento, regras pelo dialeto, contrato canônico), pedido do usuário: a ordem passa a ser 26 · F1 → 28 → 26 · F2…F7 → 13 → 27, e a F1 fecha com o `pnpm verify` antes de o 28 começar (README, F2). As tasks 🔲 que acoplariam o app ao Claude foram reescritas no contrato canônico: **B-13** desenha o `label` do evento por `kind`, sem portar o mapa de nomes para o Dart nem parsear `mcp__srv__tool`; **B-14** monta a linha do progresso com o `label`, sem o nome nativo no `chunk`; **B-16** lê o diff da rota `GET /sessions/:id/tools/:toolUseId/diff`, sem calcular a partir do input; **B-17** usa o `usage` canônico e o `costUsd` opcional; **B-32** filtra a trilha pelo que o web usar depois do `tool_kind`, nunca pelo nome; **B-18…B-21** aninham pelo `kind` `agent` e leem `/transcripts/:engine/:id/…`; **B-11** põe o autor como `{agent}`; **B-12** escolhe a pergunta pelo `kind` `question`; **B-27** e **B-28** conferem o mapa rechaveado pelo `kind` na F2 do 28 (a B-05 lia o `tool-labels.ts` do fonte, que a B-18 do 28 apaga) e o JSON neutro como o modelo canônico de lá; **B-31** confere também o `kind` e o `label`. Cenários reescritos: S-41, S-45…S-50, S-52, S-57…S-60, S-62, S-64, S-66, S-69. As tasks ✅ (F0, F1) não mudam. 2026-10-10 (revisão dos gaps do 28): o `usage` canônico ganhou `reasoningTokens?` e `webSearches?` (28 · D-17), e a B-17 os lê como os outros campos opcionais | ✅ |

## F0 — Spike

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-02 | Markdown durante o streaming: re-parsear a cada delta (com limite de frequência) ou texto puro até o `message.completed` | — | B-10 | 2026-10-09 · **a cada delta, com limite de ~100 ms** e a cerca aberta fechada provisoriamente, como o web. A B-03 confirma que cabe no aparelho modesto e fixa o limite. Se não couber, a decisão volta ao usuário. Decisão do usuário com a recomendação. 2026-10-10 · **confirmada pela B-03, com o limite em 100 ms**: cabe nos dois perfis medidos **desde que** só a cauda do texto seja re-parseada ([D-14](#f0--spike)); re-parsear o bloco inteiro a cada 100 ms ocupa 35–55 % da linha de UI num bloco de 20 KB, e a cada delta, sem limite, a satura. Números em [progress.md](progress.md#medidas-do-spike-f0) | ✅ |
| D-04 | O que fazer com a mensagem sintética (corpo de skill, expansão de `/comando`) | — | — | 2026-10-09 · **fora deste plano**: vai para a [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md), com a F6 que saiu (D-06) | ✅ |
| D-05 | A forma do aviso de modelo reserva e do resultado MCP com `resource`/`resource_link` | — | — | 2026-10-09 · **fora deste plano**, com a D-04 e a D-06 | ✅ |
| D-06 | Quais perdas do backend entram, e a forma do contrato | — | — | 2026-10-09 · **nenhuma neste plano**: são da [discovery 09](../../discovery/09-perdas-do-backend-na-conversa.md), para depois implementar no web e no mobile. A F6 (Perdas do backend) saiu: as tasks B-22…B-26 e a B-30 (o e2e do web delas) e os cenários S-72…S-76, S-80, S-81 e S-85 ficam vagos. A F7 e a F8 passaram a F6 e F7. Decisão do usuário com a recomendação | ✅ |
| D-10 | Motor de realce de sintaxe no app | — | B-08 | 2026-10-10 · **`re_highlight`** (0.0.3, gramáticas do highlight.js 11.9, MIT), registrando só as 32 linguagens do `LANGUAGES` do web. Os dois candidatos cobrem as 32 (por alias: `bat`→`dos`, `html`→`xml`, `shell`→`bash`). O `highlight` (0.7.0) é mais leve e mais rápido — +262 KB no APK arm64 release e 10–35 ms num bloco de 500 linhas de TypeScript, contra +721 KB e 35–84 ms —, mas está **parado desde 2021**, com gramáticas do highlight.js 10 e restrição de SDK `<3.0.0`: a escolha dele seria um motor sem manutenção para o realce de linguagem que muda (TypeScript, Dart). Os números do `re_highlight` cabem: o custo é uma vez por bloco, e o **teto** do realce é **500 linhas** — acima disso, o bloco sai sem realce, com o mesmo texto (S-26). Os escopos do highlight.js vão para os tokens de cor do Monaco (`vs`/`remote-claude-dark`) que o `colorizeCode` do web usa, numa tabela só (B-08). Medido na B-03 ([progress.md](progress.md#medidas-do-spike-f0)) | ✅ |
| D-14 | Como o balão re-parseia o markdown que ainda chega | — | B-10 | 2026-10-10 · **em pedaços congelados**: o texto em streaming é cortado nas linhas em branco fora de cerca de código, em pedaços de pelo menos 2 KB; cada pedaço fechado é parseado uma vez (o `MarkdownBody` não re-parseia texto igual), e só a cauda é re-parseada, no limite de 100 ms da D-02. Com isso, 20 KB chegando em 5,2 s terminam em 7,0–7,7 s de relógio (o atraso é o do próprio bombeamento de deltas), com 10–15 % da linha de UI ocupada e o pior build entre 20 e 51 ms. Quando o bloco termina (`message.completed`), ele é desenhado inteiro, de uma vez: o corte só existe durante o streaming, e uma lista solta que o corte separasse volta a ser uma. Decidido pelo spike, dentro da D-02 do usuário (o markdown continua a cada delta, com o limite que ele escolheu) | ✅ |

## F1 — Mapa de paridade

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-12 | Onde mora o mapa e em que portão roda o `render:check` | — | B-04, B-05 | 2026-10-09 · **`scripts/render-parity.json`, ao lado do `i18n-shared.json`, e o `render:check` no portão 11** (`check:contracts-i18n`), com o teste do script no portão 6. Decisão do usuário com a recomendação | ✅ |

## F2 — Markdown compartilhado

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: o motor de realce é a D-10, da F0 | — | — | — | — |

## F3 — Markdown na mensagem

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-13 | O preview do `AskUserQuestion` no app continua em `SelectableText` ([24 · D-21](../24-structured-questions/decisions.md#f4--mobile)) | — | B-12 | 2026-10-09 · **passa ao `SafeMarkdown`**: o web o renderiza em markdown, e a R4 pede o mesmo formato. O motivo da D-21 de lá ("sem dependência de markdown no app") deixou de existir com o plano 25 | ✅ |

## F4 — Card da tool e linha do turno

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: ANSI, diff e trilha são a D-08, a D-09 e a D-11 | — | — | — | — |

## F5 — Subagents

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: o aninhamento é a D-03 | — | — | — | — |

## F6 — Portão de paridade

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto: o formato do conteúdo esperado está na B-28 | — | — | — | — |

## F7 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | nenhuma decisão em aberto | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
