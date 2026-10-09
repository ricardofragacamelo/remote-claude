# F7 — E2E

Plano: [26 — Paridade da conversa no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F6](F6-parity-gate.md).
**Entrega:** o plano provado pela porta do usuário no app, e a forma das mensagens que as fixtures
assumem conferida contra o Claude real a cada versão do CLI.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-29 — E2E do app 🔲

No `pnpm test:e2e:mobile`, com o SDK roteirizado e as fixtures da B-02, abrir uma sessão pelo app e
ver na tela:

- a tabela, a lista, o código com realce e o Mermaid da `markdown-rich-turn`;
- o texto do subagent aninhado da `subagent-permission-turn`, com a permissão respondida de dentro dele;
- o rótulo `fixture · echo` da tool MCP;
- o diff de um `Edit`;
- a saída colorida;
- os tokens do turno;
- o link da trilha abrindo a lista daquela tool;
- "Copiar mensagem" pondo o markdown na área de transferência.

Depois, reabrir a mesma conversa pelo histórico e ver o mesmo conteúdo, com o subagent carregado ao
abrir. Cenário S-84.

### B-31 — `smoke-live` da forma das mensagens 🔲

No `pnpm test:e2e:live`, contra o Claude real, as sondas da B-01 que as fixtures deste plano assumem: o
`parent_tool_use_id` em tudo o que o subagent emite, o nome da tool MCP sem título e os vários blocos de
texto numa mensagem. Se uma versão nova do CLI muda a forma, o smoke reprova antes de o app perder a mensagem
(R-04). Cenários S-86, S-87.

---

## Cenários cobertos

S-84, S-86, S-87.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
pnpm test:e2e:live
```
