# F4 — E2E

Plano: [12 — Auditoria explicada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-events-and-export.md).
**Entrega:** a trilha explicada provada pela porta do usuário, com o SDK falso roteirizado — e as
garantias do plano 03 provadas de novo, depois desta mudança, pelo mesmo caminho.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-35 — Roteiros do SDK falso para os desfechos 🔲

Cenários novos em `e2e/scenarios/` (ex.: `audit-outcomes.json`), montados das fixtures que a B-01 gravou:
tool que conclui, `Bash` que sai com código 1, `Bash` interrompido no meio (S-149), tool negada, e a ordem
medida em que o desfecho chega em relação à decisão. É o que dá às specs abaixo uma história inteira para
contar sem o Claude real.

### B-36 — A tela, pela porta do usuário 🔲

Spec Playwright:

- prompt → `Bash` pede permissão → aprovado no web → sai com código 1: a linha mostra o comando, a
  decisão e o desfecho, e o detalhe conta a história em frases (S-140);
- filtrar a sessão pelo seletor, agrupar por turno, abrir o detalhe pelo teclado, copiar o link,
  recarregar → o mesmo item aberto (S-141);
- viewport de celular: cartões, detalhe em tela cheia, voltar à mesma posição (S-142);
- axe na tela com detalhe e ajuda abertos (S-143);
- visão salva sobrevive à recarga e a um segundo contexto de navegador do mesmo usuário (S-144).

### B-37 — Eventos, conversa e exportação 🔲

- desfazer arquivos numa sessão → o evento aparece na linha do tempo com os arquivos (S-145);
- conceder e revogar uma regra → dois eventos, e a regra abre deles no estado certo (S-146);
- da invocação à conversa, no ponto exato (S-147);
- exportar CSV → o arquivo baixado tem as linhas do recorte, e `audit.exported` aparece (S-148).

### B-38 — As garantias do plano 03, depois desta mudança 🔲

- endereço permanente da invocação de outra pessoa → erro traduzido, `FORBIDDEN` (S-150) — a
  `trail-isolation.spec.ts` que já existe ganha as rotas novas;
- invocação purgada — fixture antiga e `pnpm db purge`, como a `retention.spec.ts` já faz → a tela mostra
  a retenção pelo endereço permanente, `AUDIT_ENTRY_PURGED` (S-151).

---

## Cenários cobertos

S-140…S-151.

---

## Critério de conclusão

```bash
pnpm verify:full
```
