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

### B-36 — Regressões do plano 03, acessibilidade e o deep link ✅

- `rules.spec.ts` (S-68 do plano 03), `rule-cycle.spec.ts` e `trail-isolation.spec.ts` continuam
  verdes, ajustados **só** nos seletores que a tela nova mudou — nunca no que afirmam; o segundo passo
  do card de permissão continua igual (S-220);
- axe em `/rules` (lista, painel, diálogo) e em `/rules/new` (cada passo); viewport de celular sem
  scroll horizontal, com o detalhe em `sheet` (S-221);
- o deep link `/rules/$ruleId` — o que a trilha usa — abre o painel da regra certa, e a revogada
  explica o estado (S-222).

**Nota de execução — os seletores que mudaram, e por quê**: `rules.spec.ts` e o teste `revokedLive`
de `rule-cycle.spec.ts` liam `getByRole('listitem', {name: 'Rule …'})` e um botão "Revoke" sempre
visível na própria linha — a tela do plano 03. A tela atual (B-21) é uma tabela densa
(`RuleTableRow.tsx`), e `SelectableTableRow.tsx` envolve cada linha num `ContextMenu` do Radix —
as ações da linha (`rules.action.revoke`) só existem hoje atrás de um clique direito, como
`role="menuitem"`. Em vez de simular o clique direito (frágil, e o mesmo escrutínio que o próprio
teste já faz do detalhe), as duas specs passaram a abrir a regra pelo seu próprio link
(`/rules/$ruleId`, a mesma prova que S-222 já teria que montar de qualquer jeito) e revogar pelo
botão "Revoke" sempre visível do painel de detalhe (`RuleActions`, B-22) — a mesma afirmação
("revogar pela tela tira da lista"), só pela porta que o produto de verdade oferece hoje. `/rules`
sozinho redireciona para a sua própria busca padrão ao carregar (B-21) — toda chamada a
`openSignedIn`/`page.goto` ganhou a busca explícita (`?tab=active&sort=grantedAt&order=desc`), o
mesmo cuidado que as specs da B-33…B-35 já registram cada uma a sua vez. `rules.spec.ts`'s
`'In one project'` também não existe mais na célula da pasta — `RuleFolderCell.tsx` mostra o nome
real da pasta (com o caminho inteiro num tooltip), não mais o rótulo genérico do seletor de escopo
— a asserção passou a ler o nome da pasta de verdade. `rule-cycle.spec.ts`'s `trail`'s própria
`revokedStatus` ("Revoked", comparado com `exact: true`) nunca bateu com o que a tela realmente
mostra desde a B-23: a frase inteira (`rules.row.revokedOn`, "Revoked on {{at}}. It no longer
answers anything.") — trocado por uma correspondência de substring contra a parte que explica o
estado, não a data. `trail-isolation.spec.ts` não toca `/rules` nem `/rules/$ruleId` em lugar
nenhum — zero mudanças ali.

**Nova spec `rules-a11y.spec.ts` (S-221, S-222)**: o próprio axe sobre um navegador de verdade
achou dois bugs de contraste reais, nunca pegos pelos testes `jest-axe` deste plano (jsdom não tem
cor nem layout — o mesmo motivo que já justificou esta tarefa) nem pela própria varredura de
`/rules` que o plano 06 já faz (`workbench-a11y.spec.ts`, que só visita a lista vazia, nunca um
chip de decisão ou de validade): `--success` (oklch 52%→44%) e `--warning` (oklch 58%→48%) em
`globals.css`, o par `bg-<cor>/15 text-<cor>` que `RuleDecisionChip`/`RuleValidityCell` e outros
componentes já reaproveitam — a razão de contraste subia de ~4.1/3.54 para acima de 4.5:1 contra o
próprio fundo claro que a cor gera. Achado de passagem, fora de escopo desta tarefa e não mexido:
o teto de validade deste stack de e2e (`RC_PERMISSION_RULE_MAX_LIFETIME_MS`, um dia) deixa toda
regra que esta spec cria dentro da janela de sete dias do lembrete (B-25) — o toast de notificação
que isso dispara apareceu uma vez pego pelo axe a meio de uma animação (cores quase idênticas,
~1.3:1), um instantâneo transitório e não um bug de verdade; a spec dispensa esse toast (um único
clique, tolerante à ausência, nunca um laço) antes de cada varredura em vez de reescrever a
animação. O deep link (S-222) abre a regra ativa e uma revogada pelo mesmo link antigo; o painel
de desktop abre ao lado da lista, não por cima — o mesmo padrão pode aparecer duas vezes na tela,
então toda prova é restrita ao painel (`getByLabel('Details of the rule')`), nunca à página
inteira.

**Achado só ao rodar o `pnpm verify:full` por inteiro — além das três specs que o texto da própria
tarefa já nomeava**: duas outras specs do plano 06, nunca atualizadas para o B-21, navegavam direto
para `/rules` só como "qualquer tela já logada" (`screens.spec.ts`'s S-148, `workbench-routes.spec.ts`'s
"the removed ones") — o próprio redirecionamento as travava esperando uma URL que nunca chega.
Trocadas para `/`, que não redireciona e não é o que nenhuma das duas realmente testa.
`workbench-routes.spec.ts`'s própria "the screens that stay" também lia um `h1` "A rule you
granted" que não existe mais (o painel de detalhe é `h2`, "Rule") — trocado pela mesma prova
restrita ao painel que `rules-a11y.spec.ts` já usa.

**Achado de verdade, não desta tarefa, mas bloqueando o próprio portão dela**: `rule-management.spec.ts`
(B-34) tinha uma checagem "estas três regras aparecem na aba Revogadas" por texto solto
(`page.getByText(pattern)`) — nunca um problema rodando só aquele arquivo, mas o suite inteiro
revelou que **outras especificações, de outros planos, concedem de verdade uma regra
`file.write(summary.md)`** como efeito colateral de escrever esse arquivo de exemplo comum (plano
07/09/12, vários `.spec.ts` e `.json` próprios usam o mesmo nome) — e nunca a revogam, porque não
têm por que saber que regras existem. Regra revogada nunca volta sozinha (D-01), e várias dessas
specs deixam a sua própria cópia revogada para trás; `dev` é o único usuário que o suite inteiro
compartilha. Corrigido só no que B-36 pode corrigir sem arquitetar isolamento entre planos:
`batch`'s próprias três checagens passaram a mirar a linha pelo próprio id da regra
(`#rule-row-<id>`, o mesmo id que `ruleRowElementId` já gera), nunca um texto solto que outra linha
qualquer, de outro plano, pode coincidentemente repetir; mais um `test.beforeEach` que já recolhe
qualquer regra **ativa** à toa antes de cada caso (não alcança uma já revogada — essa não volta
nunca, D-01 — mas uma ativa de sobra atrapalharia a própria seleção "3 regras" do lote). Arquitetar
isolamento de verdade entre specs de planos diferentes que compartilham workspace e usuário fica de
fora, explicitamente — não é o que esta tarefa pede, e mexer nisso seria arquitetura de harness de
e2e, não uma regressão desta tela.

**Não mexido, fora de escopo**: `rich-previews.spec.ts` (plano 21, busca dentro do leitor de PDF)
falhou uma vez no `pnpm verify:full` (um contador de busca vazio) — nada no diff desta tarefa toca
PDF, editor ou busca; a releitura confirmou verde, e tudo aponta para instabilidade sob carga do
suite inteiro (já documentada noutra sessão para testes de backend), não uma regressão.

---

## Cenários cobertos

S-211…S-222.

---

## Critério de conclusão

```bash
pnpm verify:full
```
