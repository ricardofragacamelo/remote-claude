# F4 — E2E

Plano: [13 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-rule-authoring.md).
**Entrega:** o ciclo inteiro da gestão provado pela porta do usuário — criar pela tela, testar,
a sessão seguinte respeitar, o uso subir, ajustar a validade, revogar em lote e desfazer, importar —,
com tudo na trilha, e as garantias do plano 03 de pé.

---

## Por quê

Cada peça tem integração; o que só o e2e prova é que a tela, o backend e uma sessão do Claude
**concordam**: que o que a tela diz que a regra faz é o que a sessão roteirizada faz na próxima
invocação, e que o número de usos que a tela mostra é o que a trilha mostra. É a mesma razão do
[plano 03 · F4](../03-rules-and-audit/F4-e2e.md), agora com a regra nascendo da tela.

As sessões são as roteirizadas de `e2e/scenarios/` (o Claude falso), com as fixtures de
`e2e/fixtures/rules.ts` — nenhuma chamada ao Claude real; o critério não inclui `test:e2e:live`,
porque nada aqui depende do que o CLI real faz além do que o plano 03 já provou.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-33 — O ciclo de autoria pela tela 🔲

Spec nova `rule-authoring.spec.ts`:

- testar `pnpm test` na pasta → "perguntaria"; criar pelo assistente `allow Bash(pnpm test:*)` na
  pasta, passando pelo segundo passo; testar de novo → "permitido, pela regra" (S-212);
- a sessão roteirizada pede `pnpm test --watch` → `permission.resolved` com `auto: true`, sem card;
  o uso da regra vai a 1 e as invocações dela mostram a linha; a trilha mostra a concessão com a origem
  (S-211);
- o modelo "Bloquear rede" aplicado → um `WebFetch` da sessão roteirizada é recusado sem pergunta
  (S-213).

### B-34 — Gestão: validade, lote, desfazer, importar 🔲

Spec nova `rule-management.spec.ts`:

- encurtar a validade (direto, com desfazer) e estender (segundo passo); `/audit` mostra os dois
  eventos (S-214);
- selecionar três regras, revogar em lote pela prévia → a próxima invocação da sessão viva pergunta;
  "desfazer" → volta a ser respondida; a aba Revogadas e a trilha mostram revogação e restauração
  (S-215);
- importar um arquivo com uma pasta de outra máquina: a prévia marca, o remapeamento pelo seletor
  corrige, as regras nascem e aparecem na lista (S-216).

### B-35 — Segurança pela porta do usuário 🔲

Spec nova `rule-authoring-security.spec.ts`:

- digitar `Bash` inteiro com "permitir" → bloqueado no assistente, e o `POST` direto com a mesma
  sessão também é recusado; a pasta fora da allowlist nem aparece no seletor (S-217);
- dois usuários: o segundo não vê as regras do primeiro na lista, e o teste de comando, a simulação e a
  exportação dele não refletem nada do primeiro (S-218);
- **regressão**: sessão no modo `plan` com a regra `allow` criada pela tela → o card aparece (S-219).

### B-36 — Regressões do plano 03, acessibilidade e o deep link 🔲

- `rules.spec.ts` (S-68 do plano 03), `rule-cycle.spec.ts` e `trail-isolation.spec.ts` continuam
  verdes, ajustados **só** nos seletores que a tela nova mudou — nunca no que afirmam; o segundo passo
  do card de permissão continua igual (S-220);
- axe em `/rules` (lista, painel, diálogo) e em `/rules/new` (cada passo); viewport de celular sem
  scroll horizontal, com o detalhe em `sheet` (S-221);
- o deep link `/rules/$ruleId` — o que a trilha usa — abre o painel da regra certa, e a revogada
  explica o estado (S-222).

---

## Cenários cobertos

S-211…S-222.

---

## Critério de conclusão

```bash
pnpm verify:full
```
