# F2 — Ferramentas canônicas

Plano: [28 — Núcleo neutro de agente](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-engine-port.md): o adapter no lugar novo, o `ToolKind` no domínio e o contrato já em `v+1`.
**Entrega:**

- toda ferramenta chega ao web e ao app com `kind`, `label`, `subject`, `changes` e `origin`;
- o domínio decide risco, diff, desfazer e o que a auditoria mostra pelo `kind`;
- o diff, inclusive a prévia antes de aprovar, vem do backend;
- nenhum cliente conhece nome de ferramenta nem lê input cru.

---

## Por quê

É a maior fonte de acoplamento do inventário ([discovery §4](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#4-inventário-de-2026-10-10)):

- 7 arquivos do domínio e da aplicação decidem pelo nome;
- o web tem 6 arquivos que decidem pelo nome e 6 que leem o input;
- o app tem 4 e 3;
- e 3 dos 10 pares duplicados entre TypeScript e Dart são daqui.

Levar a interpretação para o adapter é o que faz a F4 do [26](../26-mobile-conversation-parity/README.md)
encolher para "desenhar o rótulo do evento e chamar a rota do diff". O rótulo é montado no backend
([D-02](decisions.md#f2--ferramentas-canônicas)), como os avisos do 27 e a regra 2 do AGENTS.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-14 — O classificador exaustivo do Claude 🔲

Em `adapter/outbound/engines/claude/tool-classifier.ts`, a tabela nome nativo → `kind`, com um
`switch` exaustivo e `never`, no molde da [27 · B-08](../27-conversation-losses/F3-backend-notices.md).
Para cada ferramenta, ela devolve:

- o `kind`, da tabela da [discovery §6.2](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#62-ferramenta), com o `web`
  dividido em `web.fetch` (URL) e `web.search` (consulta), porque a regra de permissão os distingue
  ([F5 · B-31](F5-permission-dialect.md#b-31--a-gramática-canônica-de-regra-e-o-ruledialect-));
- o `label` (`messageKey` + `params`): caminho, `+n −m`, comando, padrão, URL, consulta, servidor e tool MCP, descrição;
- o `subject` normalizado;
- os `changes` (`FileChange { path, op, edits?, content? }`).

Ela absorve o que hoje está espalhado: os conjuntos do `risk.classifier.ts`, o `file-tools.ts`, o
`LABELLERS` do `tool-labels.ts` do web e o `mcp__srv__tool`.

Nome que não está na tabela vira `other`, com o nome no `label` como texto do motor, e **sempre pede
permissão** ([R-01](README.md#riscos-e-decisões-em-aberto)). O teste percorre a lista de ferramentas que
o catálogo da instalação anuncia e falha com nome sem destino. Cenários S-41…S-45.

### B-15 — O contrato da ferramenta 🔲

`tool.started`, `tool.completed` e `permission.requested` ganham:

- `kind`, `label`, `subject`, `changes` e `origin { engine, native }`, com as definições em
  `definitions/` (`tool-label`, `tool-subject`, `file-change`, `engine-origin`), a forma da
  [discovery §6.2](../../discovery/10-nucleo-canonico-e-agentes-isolados.md#62-ferramenta);
- `rawInput`, opaco, só para a entrada exata ([D-04](decisions.md#f2--ferramentas-canônicas)).

`toolName` e `input` ficam só em `v-1`. O `tool.progress.chunk` perde o nome nativo, e o histórico
(`transcript.appended`, `GET /transcripts/…/messages`) leva a mesma forma, pelas mesmas funções do ao
vivo. O 05 é reescrito na mesma entrega: "Identidade do bloco, instante, título e saída" e uma seção nova
"Ferramenta canônica". Cenários S-46…S-48.

### B-16 — O domínio pelo `kind` e pelo `FileChange` 🔲

- O `risk.classifier.ts` classifica pelo `kind`, e o comando do `shell` continua parseado no domínio,
  porque é neutro.
- O `session-diff.ts` faz o diff sobre o `FileChange`, e o `DIFFABLE_TOOLS` sai.
- O `disclosed-input.ts` decide pelo `kind` `file.read` e pelo `subject`.
- O `session-changes.use-cases.ts` perde o `'Write'`.
- O desfazer guarda os caminhos dos `changes` ([ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso),
  com a nota da F0 virando texto).
- `ToolInvocation` e `PermissionQuestion` levam a forma canônica, e o `input` cru vai só para a
  auditoria, que já o guarda.

A gramática de regra **não** muda aqui: ela é da [F5](F5-permission-dialect.md). Cenários S-49…S-52.

### B-17 — O diff e a prévia pelo backend 🔲

A rota `GET /sessions/:id/tools/:toolUseId/diff` passa a servir também o pedido de permissão
**pendente**: o diff contra o disco do que a ferramenta vai fazer, a partir dos `changes`. O
`edit-preview.ts` e o `useEditPreview.ts` do web deixam de calcular a prévia a partir do input, e a
`DiffNotApplicableError` vale para `kind` sem `changes`. A rota entra no `schema/http/` da B-12. É ela
que a B-16 do [26](../26-mobile-conversation-parity/README.md) chama no app. Cenários S-53, S-54.

### B-18 — O web pelo `kind` 🔲

Saem `tool-labels.ts` (o `LABELLERS`, `mcpOf` e `opensSubagent`), o `DIFFABLE` e o `commandOf` do
`ToolRow.tsx`, e o `permission.tool.${toolName}` do `PermissionCard.tsx` e do `RuleRow.tsx`. Entram:

- o `label` do evento, traduzido;
- o diff ligado pelos `changes`;
- o IN/OUT ligado pelo `subject.command`;
- a entrada exata por um componente só, que desenha o `rawInput`.

As chaves `sessions.tool.*` e `permission.tool.*` passam a ser por `kind`, pareadas no
`i18n-shared.json`.

O `render-parity.json` e o `render:check` da [26 · F1](../26-mobile-conversation-parity/F1-parity-map.md),
que hoje leem os rótulos do `tool-labels.ts` no fonte, passam a ler os `kind` e as chaves do classificador.
O mapa continua com os mesmos estados, chaveado pelo `kind`. Cenários S-55…S-57.

### B-19 — O app pelo `kind` 🔲

Saem os dois `toolLabel` (o de `tool_card.dart` e o de `permission_card_view.dart`, também usado em
`rules_page.dart`), o `_mcp`, o `commandOf` e o `runningTool.toolName` da `session_page.dart`. Entram o
`label` do evento e o `subject`. As famílias `permissionTool*` do ARB viram chaves por `kind`, com o par
no `i18n-shared.json`.

O app **não** ganha diff nesta fase. O diff no app é a B-16 do 26, que passa a ser só chamar a rota da
B-17. O baseline perde as entradas desta fase. Cenários S-58…S-60.

---

## Cenários cobertos

S-41…S-60.

---

## Critério de conclusão

```bash
pnpm verify
```
