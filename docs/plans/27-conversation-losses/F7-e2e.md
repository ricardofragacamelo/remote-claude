# F7 — E2E

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F6](F6-clients.md).
**Entrega:** o plano provado pela porta do usuário, no web e no app, e as medições da F0 repetidas
contra o Claude real a cada versão do CLI.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-25 — E2E do web 🔲

No `pnpm test:e2e`, com o SDK roteirizado e as fixtures da B-02, abrir uma sessão e ver na tela:

- depois de um `/compact`, **nenhum** balão "Você" que a pessoa não escreveu, e a linha de compactação
  com o resumo ao abrir;
- a saída de um comando local como aviso;
- o aviso de um hook que falhou;
- a imagem de uma tool MCP no card, e o `resource_link` como texto;
- a tool negada por regra, com o motivo;
- a linha genérica de uma variante inventada (`nunca_visto`).

Depois, reabrir a mesma conversa pelo histórico e ver o mesmo. Cenário S-103.

### B-26 — E2E do app 🔲

No `pnpm test:e2e:mobile`, o mesmo roteiro da B-25 pelo app, e o mesmo ao reabrir pelo histórico.
Cenário S-104.

### B-27 — `smoke-live` das medições 🔲

No `pnpm test:e2e:live`, contra o Claude real, as sondas da B-01 que as fixtures assumem: a mensagem
sintética e o eco do `/compact`, o `local_command_output` de um comando local, os subtipos de `system`
do JSONL com `includeSystemMessages` e onde chega o `systemMessage` de hook. Se uma versão nova do CLI
muda a forma, o smoke reprova antes de a conversa perder a mensagem (R-04). Cenários S-105, S-106.

### B-28 — As fixtures do plano 13 na paridade 🔲

O que a [D-11](decisions.md#normas) tirou da B-46 do plano 13: a skill de usuário "com a mensagem que o
CLI acrescenta" e a tool MCP "com imagem no resultado" passam na paridade de conteúdo do plano 26 (a
B-28 de lá), agora com a sintética como `injected` e a imagem como anexo. Cenário S-107.

---

## Cenários cobertos

S-103…S-107.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
pnpm test:e2e:live
```
