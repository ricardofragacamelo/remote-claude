# F4 — Card da tool e linha do turno

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-message-markdown.md), e com ela o [plano 28](../28-agent-neutral-core/README.md)
concluído: o card desenha o evento canônico de lá (`kind`, `label`, `subject`, `changes`), e não o nome
nem o input cru da tool ([D-15](decisions.md#normas)).
**Entrega:** o card da tool e a linha do turno do app dizem o que os do web dizem:

- o rótulo que o evento traz;
- o tempo decorrido;
- a saída colorida;
- o diff;
- os tokens;
- o link para a trilha daquela invocação.

O `tool.progress` deixa de sujar a saída.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-13 — O rótulo do evento 🔲

O app **não** porta o mapa de nomes do web para o Dart. Depois da
[F2 do plano 28](../28-agent-neutral-core/F2-canonical-tools.md), o `tool.started` e o
`permission.requested` trazem o `label { messageKey, params }`, montado pelo classificador do adapter
do Claude, e o `tool-labels.ts` do web e os dois `toolLabel` do app já deram lugar a ele. Esta task fecha
a paridade do card: o app traduz o `label` de cada `kind` com os mesmos parâmetros que o web desenha:

- o caminho do `file.read`, `file.edit` e `file.write`, com +/− do `file.edit`;
- o comando do `shell`;
- o padrão do `search`;
- o host ou a busca do `web`;
- a descrição e o tipo do `agent`;
- as tarefas do `tasks`;
- **`servidor · tool` para todo `mcp`**, com ou sem título, a partir do `subject.server` e do
  `subject.tool`;
- o `other` (ferramenta que o classificador não conhece): o `label` genérico que o backend mandar, com a
  entrada exata (`rawInput`) sob demanda.

Nenhum ramo do app lê `toolName`, `origin.native` ou um campo do `rawInput`: o portão de neutralidade
do plano 28 reprova. O parse do nome MCP (`mcp__srv__tool`) e a tabela de casos dele são do adapter, e
não do app. As chaves `sessions.tool.*` por `kind` são as do plano 28, já pareadas no `i18n-shared.json`.
Cada `kind` entra no mapa de paridade como `ok`, no `render-parity.json` que a F2 do plano 28 rechaveou
pelo `kind` (o mapa da B-04 lia os rótulos do `tool-labels.ts`, que aquela fase apaga).
Cenários S-46…S-50.

### B-14 — O `tool.progress` 🔲

O backend manda o tempo decorrido como `chunk`. Hoje o texto vem com o nome nativo (`"Bash · 3s"`);
depois do [plano 28](../28-agent-neutral-core/README.md), o `chunk` não traz nome nenhum, e o texto da
linha é montado com o `label` do `tool.started` (B-13). O app hoje faz `output + chunk`
([conversation.dart](../../../mobile/lib/features/session/domain/entities/conversation.dart)) e mostra o
resultado como OUT de um Bash em andamento.

O app passa a fazer como o web: **substitui** um campo `elapsed` e mostra o tempo **na linha** do
card. O OUT de um `shell` em andamento fica vazio até haver saída. O contrato documenta o que o `chunk`
carrega, no [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md). O nome
`chunk` e a descrição dizem "saída", e a descrição é corrigida, se o plano 28 não a tiver corrigido.
Cenários S-51…S-53.

### B-15 — Saída colorida 🔲

O par do `AnsiText` do web. Ele usa:

- o mesmo subconjunto de SGR (cor de frente e de fundo, as 16 e as 256, negrito, sublinhado,
  reset);
- a mesma paleta, pelos tokens de tema;
- a mesma regra para sequência desconhecida, que é descartada sem sobrar lixo.

Vale no resumo e na saída inteira pedida sob demanda. O texto copiado sai sem as sequências.
Cenários S-54…S-56.

### B-16 — O diff das tools de arquivo (`file.edit`, `file.write`) 🔲

O par do `ToolDiffView`. O app **não** calcula o diff a partir da entrada da tool: lê
`GET /sessions/:id/tools/:toolUseId/diff` ([backend/03](../../architecture/backend/03-modules.md)), a
rota do backend que o [plano 28](../28-agent-neutral-core/F2-canonical-tools.md) estendeu ao pedido
pendente e que o web também passou a ler. Vale para toda tool com `changes`, escolhida pelo `kind`, e
nunca pelo nome. O app desenha:

- linhas removidas e acrescentadas, com as cores dos tokens de tema;
- os contadores +/− no rótulo (os `params` do `label`, B-13);
- rolagem horizontal dentro da caixa;
- os estados da leitura: carregando, sem diff (a rota responde que não se aplica) e erro com tentar de
  novo.

Para o `file.write` de arquivo novo, todo o conteúdo como acrescentado, com o mesmo teto do web. Decidido
pelo usuário pela R4 ([D-09](decisions.md#normas)). A view "Alterações" continua fora. Cenários
S-57…S-60.

### B-17 — Os tokens do turno 🔲

O `TurnSummary` ganha o `usage` canônico do [plano 28](../28-agent-neutral-core/F4-modes-and-usage.md),
lido como o web lê:

- `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens` e `webSearches`
  (os dois últimos do [28 · D-17](../28-agent-neutral-core/decisions.md#f4--modos-esforço-uso-e-blocos)), todos opcionais;
- campo ausente ou que não é número não aparece;
- o `costUsd` é opcional: o motor que não informa custo não mostra custo, e o resto da linha não muda.

O `TurnLine` mostra custo, segundos e tokens, no formato do `TurnRow`. Cenários S-61, S-62.

### B-32 — O link para a trilha 🔲

O card da tool do web tem o link "Trilha", que abre `/audit` filtrado pela sessão e pela tool
([ToolRow.tsx](../../../web/src/features/session/components/conversation/ToolRow.tsx)). Hoje o filtro é o
nome da tool; depois do [plano 28](../28-agent-neutral-core/F5-permission-dialect.md), que põe o
`tool_kind` na trilha, o filtro é o que o web passar a usar (a invocação ou o `kind`), e o app usa o
mesmo, sem ler o nome nativo. Decidido pelo
usuário ([D-11](decisions.md#normas)): o app ganha o mesmo link, e ele abre uma **lista só de leitura** das
entradas da trilha daquela sessão e tool. A lista não tem formulário de filtros nem entrada no menu.

- É uma feature nova do app, `features/audit/`, na cadeia da [mobile/01](../../architecture/mobile/01-architecture.md),
  sobre a mesma rota que o web lê ([backend/03 · audit](../../architecture/backend/03-modules.md#audit)).
  Nenhum endpoint novo. Antes de escrever, confirmar se a rota aceita o token do app. Se pedir aparelho
  aprovado, vale a regra da [25 · D-12](../25-mobile-file-browser/decisions.md#f1--normas-e-a-sessão-encoberta).
- Cada entrada mostra o mesmo que a `AuditEntryRow` do web (quando, o quê, a decisão, quem decidiu, de
  onde), com os mesmos rótulos traduzidos. Os pares de chave vão para o `i18n-shared.json`, e o par
  `AuditEntryRow` ↔ widget, para o mapa.
- Os quatro estados: carregando, vazio, erro com tentar de novo, lista. A paginação é a da rota.

Cenários S-88…S-90.

---

## Cenários cobertos

S-46…S-62, S-88…S-90.

---

## Critério de conclusão

```bash
pnpm verify
pnpm render:check     # rótulos, ANSI, diff, linha do turno e o link da trilha deixam de ser `pending`
```
