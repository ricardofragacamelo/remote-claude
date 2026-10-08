# F5 — E2E

Plano: [23 — Permissões fluidas](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-web.md) e [F4](F4-mobile.md).
**Entrega:** os dois pedidos do usuário provados pela porta do usuário, no web e no app: ligar e
desligar Permitir tudo, e uma regra de prefixo respondendo o comando seguinte.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-18 — E2E no web ✅

Playwright, com o SDK falso dos planos 09 e 10 e o `tool-turn` gravado, que pergunta sobre um
`Write`. Liga Permitir tudo pelo chip, o `Write` roda sem card e a linha diz "Permitir tudo"; desliga,
e o próximo abre o card (S-95). Noutra sessão, aprova "nesta sessão" com o alcance da tool inteira, e
o `Write` seguinte roda sem card (S-96). Por que a tool inteira e não o prefixo:
[D-14](decisions.md#f5--e2e). Cenários compartilhados pelas duas pontas: `e2e/scenarios/mobile-fluid-allow-all.json` e
`mobile-fluid-rule-reach.json` — o prefixo `mobile-` é o que o runner compila no app.

### B-19 — E2E no app ✅

O mesmo, no `integration_test` do app (`pnpm test:e2e:mobile fluid_permissions`), contra a pilha
local: o navegador abre a sessão e manda os prompts, o celular troca o modo e responde (S-97, S-98).
Os ajudantes do navegador saem do `rule_cycle_test` para `integration_test/support/browser_turns.dart`,
usados pelos dois.

---

## Cenários cobertos

S-95, S-96, S-97, S-98.

---

## Critério de conclusão

```bash
pnpm verify:full && pnpm test:e2e:mobile
```
