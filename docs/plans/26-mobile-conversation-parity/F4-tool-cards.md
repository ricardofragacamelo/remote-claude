# F4 — Card da tool e linha do turno

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-message-markdown.md).
**Entrega:** o card da tool e a linha do turno do app dizem o que os do web dizem:

- o rótulo por tool;
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

### B-13 — O rótulo por tool 🔲

O `toolLabel` do app hoje devolve o nome, ou "nome · título". Ele passa a seguir o mapa do
[tool-labels.ts](../../../web/src/features/session/lib/tool-labels.ts) do web:

- o caminho do `Read`, `Edit`, `MultiEdit` e `Write`, com +/− do `Edit`;
- o comando do `Bash`;
- o padrão do `Grep` e do `Glob`;
- o host do `WebFetch`;
- a busca do `WebSearch`;
- a descrição e o tipo do `Agent`/`Task`;
- o `TodoWrite` e os `Task*`;
- **`servidor · tool` para toda tool MCP**, com ou sem título.

O texto é traduzido. Cada par de chave entra no `i18n-shared.json`, e cada rótulo, no mapa de
paridade. A regra de parse do nome MCP (`mcp__srv__tool`) usa uma tabela de casos compartilhada.
Cenários S-46…S-50.

### B-14 — O `tool.progress` 🔲

O backend manda o tempo decorrido como `chunk` (`"Bash · 3s"`). O app hoje faz `output + chunk`
([conversation.dart](../../../mobile/lib/features/session/domain/entities/conversation.dart)) e mostra o
resultado como OUT de um Bash em andamento.

O app passa a fazer como o web: **substitui** um campo `elapsed` e mostra o tempo **na linha** do
card. O OUT de um Bash em andamento fica vazio até haver saída. O contrato documenta o que o `chunk`
carrega hoje, no [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md). O nome
`chunk` e a descrição dizem "saída", e a descrição é corrigida. Cenários S-51…S-53.

### B-15 — Saída colorida 🔲

O par do `AnsiText` do web. Ele usa:

- o mesmo subconjunto de SGR (cor de frente e de fundo, as 16 e as 256, negrito, sublinhado,
  reset);
- a mesma paleta, pelos tokens de tema;
- a mesma regra para sequência desconhecida, que é descartada sem sobrar lixo.

Vale no resumo e na saída inteira pedida sob demanda. O texto copiado sai sem as sequências.
Cenários S-54…S-56.

### B-16 — O diff de `Edit`, `MultiEdit` e `Write` 🔲

O par do `ToolDiffView`. Ele calcula o diff a partir dos mesmos dados que o web usa (o `DiffOf` sobre a
entrada da tool) e desenha:

- linhas removidas e acrescentadas, com as cores dos tokens de tema;
- os contadores +/− no rótulo (B-13);
- rolagem horizontal dentro da caixa.

Para o `Write` de arquivo novo, todo o conteúdo como acrescentado, com o mesmo teto do web. Decidido
pelo usuário pela R4 ([D-09](decisions.md#normas)). A view "Alterações" continua fora. Cenários
S-57…S-60.

### B-17 — Os tokens do turno 🔲

O `TurnSummary` ganha o `usage`, lido como o web lê:

- `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`;
- campo ausente ou que não é número não aparece.

O `TurnLine` mostra custo, segundos e tokens, no formato do `TurnRow`. Cenários S-61, S-62.

### B-32 — O link para a trilha 🔲

O card da tool do web tem o link "Trilha", que abre `/audit` filtrado pela sessão e pelo nome da tool
([ToolRow.tsx](../../../web/src/features/session/components/conversation/ToolRow.tsx)). Decidido pelo
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
