# F2 — Atualização

Plano: [19 — Distribuição](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-exposure.md).
**Entrega:** atualizar sem perder dado e sem descobrir tarde que o SDK mudou — e poder voltar.

---

## O que faz a atualização ser arriscada aqui

O produto depende de um SDK em `0.3.x`, que fala com um CLI que evolui rápido. Uma atualização
pode trazer variante nova de `SDKMessage`, mudança no `canUseTool`, ou comportamento diferente
de `settingSources`. Nada disso aparece nos testes com SDK fake — **por construção**.

Por isso o portão da atualização é o `smoke-live`, que fala com o Claude real
([F6 do plano 01](../01-live-session/F6-e2e.md)). Com o [plano 28](../28-agent-neutral-core/README.md),
isso vale **por motor**: cada motor habilitado tem o seu SDK ou CLI e o seu `smoke-live`, e a
atualização de um não depende do portão de outro ([D-09](decisions.md#d-09--ajuste-às-diretivas-do-plano-28)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-12 — Atualizar o SDK com portão 🔲

O portão é **por motor**: subir a versão do SDK de um motor (no Claude, o
`@anthropic-ai/claude-agent-sdk`) roda o `smoke-live` **daquele** motor. Vermelho **interrompe**
a atualização dele — e a saída diz qual variante ou comportamento mudou, porque o mapper do adapter
já registra `warn` para o que não conhece. Os outros motores habilitados não são afetados.

### B-13 — Migration na atualização 🔲

Migration nova é aplicada na subida; migration já aplicada **nunca** é alterada — é regra do
[AGENTS.md](../../../AGENTS.md), e o portão precisa reprová-la se alguém tentar.

O caminho de volta é documentado: qual backup, qual versão, o que se perde.

### B-14 — Backup e restauração 🔲

Script com dump e restauração do Postgres, rodável com o sistema no ar, sem corromper.
Restaurar devolve a trilha de auditoria intacta — trilha perdida no restore é trilha que não
serve como trilha.

Backup de versão mais nova em binário mais velho é **recusado**, não tentado.

### B-15 — Versões visíveis 🔲

Backend, web, app e, **por motor habilitado**, a versão do SDK e do CLI que a descrição dele
informa (`GET /engines`), na UI e no log (`engine` e `engineVersion`). Quando alguém reportar um problema, a primeira
pergunta é "qual versão" — e a resposta precisa estar à mão, não num arquivo de build.

---

## Cenários cobertos

S-23…S-32.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:e2e:live
```
