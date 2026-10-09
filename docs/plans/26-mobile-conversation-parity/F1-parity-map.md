# F1 — Mapa de paridade

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-spike.md): as fixtures que o mapa cita.
**Entrega:**

- o inventário de tudo o que o web desenha numa mensagem, com o par no app;
- o `render:check` no portão 11, que reprova componente novo sem par e aceita só pendência
  declarada com a fase que a fecha;
- a regra escrita no normativo.

---

## Por quê

"O mesmo formato" só existe se a máquina reprovar a divergência (regra 9 do
[AGENTS.md](../../../AGENTS.md)). A F1 vem antes do código do app de propósito. O mapa nasce com a
lista do que falta, e cada fase seguinte tira linhas dela. Na F6 a lista tem de estar vazia.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-04 — O inventário: `render-parity.json` 🔲

Em `scripts/render-parity.json`, ao lado do [i18n-shared.json](../../../scripts/i18n-shared.json) (local
na [D-12](decisions.md#f1--mapa-de-paridade)). Cada entrada tem:

- o elemento;
- o componente do web que o desenha (`web/src/features/session/components/conversation/…`);
- o widget do app;
- o widget test do app que o desenha a partir de uma fixture da B-02;
- um destes estados:
  - `ok`;
  - `pending` com a fase (`F2`…`F5`);
  - `excluded` com o ID de uma decisão ✅.

O inventário parte de `web/src/features/session/components/conversation/` inteiro e do `Markdown`
compartilhado. Ele cobre:

- os blocos (`text`, `thinking`, `redacted_thinking`, `image`);
- os nós de markdown (título, lista, tabela, código, citação, link, imagem, HTML, Mermaid);
- `CodeBlock`, `AnsiText`, `ToolDiffView`, `ToolRow` e cada rótulo de `tool-labels.ts`;
- `ThinkingBlock`, `TurnRow`, `CompactedRow`, `RewoundRow`, `SubagentChildren`, `ImageMarker`;
- `InlinePermission`, `PlanApprovalCard`, `AnsweredQuestions`;
- o rótulo de autor e o copiar.

O ponto de partida dos estados é a tabela da [discovery §4](../../discovery/08-paridade-da-conversa-no-app.md#4-estado-atual-a-conversa-nas-três-pontas).
Exclusão inicial: a ação "inserir no editor" ([D-11](decisions.md#normas)). O link para a trilha entra
como `pending` da F4 (B-32). As mensagens que o backend descarta não chegam a nenhum dos dois clientes e
não entram no mapa: são da discovery das perdas do backend.
Cenários S-09, S-10.

### B-05 — `render:check` 🔲

`scripts/render-check.mjs`, `pnpm render:check`, entra no portão 11 junto do `contracts` e do `i18n`
(`check:contracts-i18n` passa a ser `check:contracts-i18n-render`; o nome final fica na D-12).
O script reprova quando:

- um componente `.tsx` de `components/conversation/` ou de `shared/components/markdown/` não está no mapa;
- o widget ou o teste citados não existem no app;
- uma entrada `excluded` cita uma decisão que não existe no `decisions.md` deste plano ou que não está ✅;
- uma entrada `pending` cita uma fase já ✅ no `progress.md`. Assim a pendência não sobrevive à
  fase que prometeu fechá-la.

A saída lista o que falta, por fase, para o agente ler. Os testes do script ficam em
`test/unit/scripts/render-check.spec.mjs`, com árvores falsas. Cenários S-11…S-15.

### B-06 — A regra no normativo 🔲

- [mobile/04-ui](../../architecture/mobile/04-ui.md): uma seção "A conversa é a mesma do web". Ela
  diz o princípio (conteúdo e formato; só o layout se adapta), aponta o mapa e o portão, e tira da
  lista "o que o app não tem" o markdown no chat, o subagent aninhado e o diff na tool.
- [web/03-ui-system](../../architecture/web/03-ui-system.md): um componente novo na conversa entra
  no mapa na mesma entrega.
- [09-code-quality](../../architecture/shared/09-code-quality.md): o `render:check` na lista dos portões.
- [plano 10 · D-01](../10-mobile-chat-layout/decisions.md#f0--normas): uma nota no resultado dizendo
  que o subagent aninhado e o diff na tool foram revistos por este plano. A linha não é apagada.

Cenário S-16.

---

## Cenários cobertos

S-09…S-16.

---

## Critério de conclusão

```bash
pnpm verify
pnpm render:check     # sai com 0: nenhum componente sem entrada; as pendências citam F2…F5
```
