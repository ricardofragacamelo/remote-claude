# F6 — Portão de paridade

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-subagents.md).
**Entrega:**

- o `render:check` sem nenhuma pendência;
- a prova, por fixture, de que o web e o app tiram o **mesmo conteúdo** da mesma conversa;
- o critério do plano 13 usando esse portão.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-27 — O mapa sem pendência 🔲

O `render:check` passa a reprovar **qualquer** entrada `pending`. Depois desta fase, só existem `ok`
e `excluded` com decisão ✅. Um componente novo da conversa no web exige o par no app na mesma
entrega, ou uma decisão. Cenários S-77…S-79.

### B-28 — A paridade de conteúdo por fixture 🔲

Em `packages/contracts/fixtures/conversation-parity/`, uma pasta por fixture da B-02. Cada pasta tem:

- a sequência de eventos WS que o backend publica para ela, gerada pelo mapper real a partir da
  fixture do SDK e conferida pelo `contracts:check`;
- o **conteúdo esperado**, um JSON neutro: por mensagem, o autor e os blocos em ordem; por tool, o
  dono, o rótulo (chave e parâmetros), o status e a mídia; os avisos; o pensamento; os tokens do turno.

Os dois lados conferem a mesma pasta:

- o web, um teste de unidade que passa os eventos pelo `conversation-reducer` e projeta o estado no
  JSON neutro;
- o app, um teste de unidade que passa os mesmos eventos pelo mapper e pela `Conversation`.

Os dois comparam com o mesmo esperado. Um cliente que descarta o que o outro guarda reprova.

O mesmo vale para o histórico: os eventos do `historyEventFrom` para a mesma fixture. As fixtures do
plano 13 (MCP pela composição, skill de usuário pelo plugin sintético) entram aqui quando o plano 13
as gravar ([13 · B-46](../13-claude-settings/F4-e2e.md)). Cenários S-82, S-83.

---

## Cenários cobertos

S-77…S-79, S-82, S-83.

---

## Critério de conclusão

```bash
pnpm verify
pnpm render:check     # sem nenhuma entrada `pending`
```
