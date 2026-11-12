# F4 — E2E

Plano: [15 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

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

### B-33 — O ciclo de autoria pela tela ✅

Spec nova `rule-authoring.spec.ts`:

- testar `pnpm test` na pasta → "perguntaria"; criar pelo assistente `allow shell(pnpm test:*)` na
  pasta, passando pelo segundo passo; testar de novo → "permitido, pela regra" (S-212);
- a sessão roteirizada pede `pnpm test --watch` → `permission.resolved` com `auto: true`, sem card;
  o uso da regra vai a 1 e as invocações dela mostram a linha; a trilha mostra a concessão com a origem
  (S-211);
- o modelo "Bloquear rede" aplicado → um `WebFetch` da sessão roteirizada é recusado sem pergunta
  (S-213).

**Nota de execução**: nenhuma das três cenas tinha turno roteirizado — o motor neutro de teste
(`backend/test/fakes/engine/test-tool-classifier.ts`, plano 28) só sabia `write_file`/`run_shell`/
`ask_user`; ganhou `web_fetch` (mesma forma do classificador real do Claude, `tool('web.fetch',
'sessions.tool.webFetch', {host}, {url})`), e `script.ts` ganhou `pnpm-watch-turn`/`web-fetch-turn`.
`writeTurn` (`e2e/fixtures/rules.ts`) ganhou um quinto parâmetro opcional `fixture` (era fixo em
`'tool-turn'`); `startSession` (`e2e/fixtures/live-session.ts`) ganhou um `engine` opcional, para
abrir a sessão roteirizada no motor de teste em vez do padrão da instalação. Novo
`expectAllowedUnasked` ao lado do já existente `expectRanUnasked` (que checa especificamente um par
`Write`, errado para um shell/web fetch) e novo `expectDeniedUnasked` para a recusa automática.

**Achado e corrigido durante a própria tarefa — uma lacuna real de contrato**: `POST
/permission-rules/evaluate` (o teste de comando, B-14) exigia `engine` no corpo, mas o tipo do web
(`EvaluateRuleInput.engine?`) sempre o declarou opcional — e a tela nunca o manda, pois um teste
hipotético não nomeia sessão nenhuma para lê-lo dali. Nenhum teste de integração existente notou,
porque todos os seus já mandavam `engine` explícito; só o primeiro teste e2e de verdade bateu nisso.
Corrigido tornando `engine` opcional no schema (`permission-rules.dto.ts`) e expondo um getter
`default` em `RuleDialects` (já injetada no controller, zero wiring novo) para resolver o padrão da
instalação quando a tela não manda nenhum — o mesmo fallback `translate` já fazia internamente.

**Achado e corrigido, um bug de i18n de passagem**: `rules.templates.heading` do catálogo em inglês
dizia "Modelos" (português vazado na B-30) em vez de "Templates" — bateu direto na tela que este
teste dirige; `pnpm i18n:check` nunca notou porque só compara paridade estrutural, não o conteúdo.

**Achado durante a execução, não a escrita**: a validade da instalação de e2e tem teto de um dia
(`RC_PERMISSION_RULE_MAX_LIFETIME_MS=86400000`, `scripts/lib/stack.mjs`) — mais curto que o menor
atalho fixo da tela (7 dias). Os dois casos usam a data livre do próprio passo (`ExpiryPicker`,
"Or pick a date"), com a data de hoje — que `dateInputToExpiresAt` já resolve para o **fim** do dia
de hoje, sempre à frente de "agora" e sempre dentro do teto, qualquer que seja a hora da corrida.

### B-34 — Gestão: validade, lote, desfazer, importar ✅

Spec nova `rule-management.spec.ts`:

- encurtar a validade (direto, com desfazer) e estender (segundo passo); `/audit` mostra os dois
  eventos (S-214);
- selecionar três regras, revogar em lote pela prévia → a próxima invocação da sessão viva pergunta;
  "desfazer" → volta a ser respondida; a aba Revogadas e a trilha mostram revogação e restauração
  (S-215);
- importar um arquivo com uma pasta de outra máquina: a prévia marca, o remapeamento pelo seletor
  corrige, as regras nascem e aparecem na lista (S-216).

**Nota de execução — "os dois eventos" não é o `/audit`**: `/audit` (`GET /audit-entries`) só lista
invocações de ferramenta — nunca um evento de gestão de regra (concessão, revogação, validade
mudada). Esses vivem só na própria história da regra (`GET /permission-rules/:id/history`,
`RuleHistorySection` no painel de detalhe, B-12/B-22) — é lá que S-214 lê as duas mudanças de
validade. Documentado aqui porque o texto original da tarefa lia como se fosse o mesmo lugar.

**Achado e corrigido durante a própria tarefa — um bug real, não um ajuste de teste**: `PATCH
/permission-rules/:ruleId` (encurtar/estender) responde a regra **crua** (`toPermissionRuleDto`,
sem `usage`/`findings`/`folderReachable`/`expiryCeiling` — essas são a despesa só do `describe`,
B-22/B-23, deliberadamente fora de todo escrita). `RuleDetailPanel.tsx` substituía o estado inteiro
por essa resposta crua, e `RuleExpiryDialog`'s própria `DialogDescription` lê
`new Date(rule.expiryCeiling!)` sem guarda — `expiryCeiling` ausente (não `null`, ausente de
verdade) é `undefined`, e `new Date(undefined)` formatado derruba a tela inteira ("Something went
wrong!"), achado só pelo e2e de verdade: nenhum teste de integração existente notou porque todo
mock ali espalhava (`spread`) o fixture rico, nunca a resposta crua real. Corrigido com um
`mergedWith` em `RuleDetailPanel.tsx` — o resultado de uma escrita (encurtar/estender, revogar) é
mesclado **sobre** o estado já lido, nunca o substitui por inteiro — e um teste de regressão novo
em `RuleDetailPanel.spec.tsx` que, ao contrário de todo mock existente no arquivo, responde a forma
crua de verdade.

**Achado durante a escrita do próprio e2e — restaurar nasce com id novo**: `POST
/permission-rules/restore` não reativa a mesma linha — grava uma `permission.ruleGranted` nova,
com `restoredFrom` apontando pra original, que fica `revoked` para sempre (D-01, já documentado em
`rule-history-label.ts`). A prova de "desfazer" funcionou não é reler o id original (que nunca
volta a `active`) — é achar a regra ativa pelo próprio padrão (`rulesOf` já exclui as revogadas).

### B-35 — Segurança pela porta do usuário ✅

Spec nova `rule-authoring-security.spec.ts`:

- escolher `shell` inteiro com "permitir" → bloqueado no assistente, e o `POST` direto com a mesma
  sessão também é recusado; a pasta fora da allowlist nem aparece no seletor (S-217);
- dois usuários: o segundo não vê as regras do primeiro na lista, e o teste de comando, a simulação e a
  exportação dele não refletem nada do primeiro (S-218);
- **regressão**: sessão no modo `readOnly` (o `plan` do Claude) com a regra `allow` criada pela tela →
  o card aparece (S-219).

**Nota de execução — o mecanismo da regressão (S-219), já achado no próprio domínio**:
`decide-outcome.ts`'s own precedência (B-08/D-20) já faz exatamente isso de propósito — passo 3 é
"um `allow` que casa, a não ser que o modo seja `readOnly` (nenhuma regra permite ali)". Nenhum
código novo no domínio; só faltava a prova pela porta do usuário. O `web_fetch` do motor de teste
(B-33) e seu `'web-fetch-turn'` já serviam — `web.fetch` não está em `READ_ONLY_REFUSED_KINDS`
(`mode-approval.ts`), que só recusa `file.*`/`shell` antes mesmo da regra ser lida; `startSession`
(`e2e/fixtures/live-session.ts`) ganhou um `permissionMode` opcional, enviado no próprio
`session.start`.

**Achado durante a própria tarefa — a lacuna real estava em `/permission-rules/evaluate`, não na
pasta**: `folder: null` no corpo de uma chamada direta (S-218) é `400 INVALID_INPUT` — o schema só
aceita `folder` ausente (`z.string().optional()`), nunca `null`; a chamada do teste de comando pela
tela nunca manda o campo quando não há pasta nenhuma, só a chamada direta do teste precisou do
ajuste.

**Achado de passagem — duplicação entre as três specs de F4 que já dirigem o assistente pela
tela**: `rule-authoring.spec.ts` (B-33) e a própria `rule-authoring-security.spec.ts` repetiam a
mesma sequência de cliques passo a passo — extraído para `e2e/fixtures/wizard.ts`
(`pickKind`/`typeSubjectPrefix`/`pickAnyUseOf`/`skipSubjectStep`/`pickRadioThenNext`/
`pickValidityToday`/`confirmRuleCreated`, e um `createRuleThroughWizard` composto para o desenho
mais comum — kind com assunto, allow, sempre, hoje); `rule-authoring.spec.ts` foi refatorado para
usar as mesmas funções, sem mudar nada do que afirma. Um `runScriptedTurn` novo em `rules.ts`
(socket + sessão + turno roteirizado + fechamento, sempre) substitui o mesmo bloco repetido nos
dois turnos de `rule-authoring.spec.ts` e nos dois de `rule-authoring-security.spec.ts`. `pnpm
jscpd` (gate 5) não ignora `e2e/` como ignora `**/test/**` — zero clones depois, confirmado em todo
o repositório.

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
