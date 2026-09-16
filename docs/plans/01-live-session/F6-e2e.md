# F6 — E2E e smoke-live

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-web-session.md).
**Entrega:** os cenários e2e obrigatórios que este plano alcança, rodando com SDK fake em todo
PR, **e** a primeira suíte que fala com o Claude de verdade.

---

## Os dois tipos de e2e, e por que ambos existem

| Suíte | Roda | Usa | Prova |
|---|---|---|---|
| `e2e/specs/` | todo PR, é portão | SDK **fake** roteirizado | que o nosso sistema se comporta |
| `e2e/smoke-live/` | sob demanda e no nightly | Claude **real** | que o SDK ainda é o que achamos que é |

A primeira precisa ser determinística, e o Claude não é — além de custar dinheiro por execução.
A segunda é a única coisa que avisa quando uma variante nova de `SDKMessage` aparece, ou quando
o comportamento do `canUseTool` muda numa atualização. Ver
[a estratégia](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-39 — Cenários compartilhados em `e2e/scenarios/` 🔲

Os fluxos novos escritos **uma vez**, lidos pelo Playwright e pelo `integration_test` do
Flutter, que os recebe por `--dart-define`. Expectativa nova chega às duas pontas de uma vez;
cenário duplicado é cenário que diverge.

### B-40 — Os cenários obrigatórios alcançáveis por este plano 🔲

Da [lista obrigatória](../../architecture/shared/06-testing-strategy.md#cenários-e2e-obrigatórios):
1 (fluxo completo), 2 (permissão pelo web), 5 (timeout), 6 (replay), 7 (`gap`), 8 (interrupt) e
9 (workspace negado).

Os de número 3, 4 e 10 exigem o celular e são a [F4 do plano 02](../02-mobile-approval/F4-e2e.md).

### B-41 — `e2e/smoke-live/` e o script `pnpm test:e2e:live` 🔲

A primeira spec contra o Claude real: abre sessão num workspace descartável, manda um prompt
trivial, e **falha se qualquer `SDKMessage` cair no ramo "variante desconhecida"** do mapper.
É esse ramo que transforma quebra de contrato do SDK em aviso, em vez de bug silencioso.

O script `scripts/run-smoke-live.mjs` sobe a stack efêmera, roda a suíte e derruba tudo, com
código de saída honesto. Ele entra na seção **Comandos** do [README.md](../../../README.md#comandos)
e no [catálogo de scripts](../00-bootstrap/README.md#catálogo-de-scripts) **na mesma entrega** —
script que ninguém encontra é reescrito por outra pessoa daqui a um mês.

Fora do portão de PR, por decisão: custa dinheiro e não é determinístico.

### B-42 — R-01 fechado: o diretório confiado 🔲

**Bloqueante, e a primeira coisa a rodar nesta fase.** Verificar, num diretório já marcado como
confiado (`hasTrustDialogAccepted`) pelo CLI interativo, se um `allow` de projeto volta a
dispensar o `canUseTool`.

Se voltar, o produto tem um furo por onde toda a aprovação escapa, e o plano **para** até
existir mitigação. O resultado — qualquer que seja — vira registro em
[progress.md](progress.md) e atualização de
[04-claude-integration](../../architecture/backend/04-claude-integration.md#a-armadilha-do-settingsources).

### B-43 — O app segue verde contra o contrato novo 🔲

`pnpm test:e2e:mobile` continua saindo 0. O app não ganha tela neste plano; o que se prova é
que o contrato novo não quebrou o que já estava entregue — e que `session.detach` deixou de
voltar como `INVALID_INPUT`.

Roda com o emulador cercado por cgroup, pela receita da
[F6 do bootstrap](../00-bootstrap/F6-scripts-e2e.md#como-rodar-sem-derrubar-a-máquina).

---

## Cenários cobertos

S-76…S-84.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:live
pnpm test:e2e:mobile
```
