# F3 — Criação de regras

Plano: [15 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-rules-screen.md); do [plano 06](../06-workbench/README.md), o seletor de
pasta (o diálogo "Abrir pasta" sobre `GET /workspaces/directories`); e da
[D-03](decisions.md#d-03--segundo-passo-e-step-up-ao-criar-pela-tela) e da
[D-19](decisions.md#d-19--rota-própria-para-o-assistente).
**Entrega:** criar regra pela tela — com prévia do que casa, teste de comando, simulação contra a
trilha e o alcance por extenso antes de gravar —, mais modelos, duplicar, exportar e importar.

---

## Por quê esta fase é a mais delicada da web

Até aqui, toda regra nascia de uma invocação real que alguém tinha na frente dos olhos, com o padrão
mais estreito que a cobria. Pela tela, a pessoa **escreve** o padrão. É o [R-01 do plano 03](../03-rules-and-audit/README.md)
em pessoa: a gramática deixa escrever largo, e a tela precisa mostrar o alcance real antes de gravar —
com o servidor recusando o que nenhuma tela deveria deixar passar ([D-09](decisions.md#d-09--o-que-é-largo-demais)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-27 — O assistente de criação ✅

Em `/rules/new`, com o rascunho na search ([D-19](decisions.md#d-19--rota-própria-para-o-assistente)):

1. **tipo** — pelo `kind` da gramática canônica (comando, leitura e edição de arquivo, busca, rede,
   MCP, subagente), com o nome traduzido e os mais usados primeiro; não há ferramenta do motor a
   escolher: a regra vale, por padrão, em todo motor que tenha o `kind` (`engine` nulo), e restringi-la
   a um motor registrado é uma opção do passo. O campo seguinte muda com o `kind` (comando, caminho,
   domínio); `mcp` só oferece a ferramenta ou o servidor inteiro, com o aviso de largura (S-186). O web
   não conhece nome de ferramenta do Claude ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect));
2. **padrão** — "exatamente este comando", "este comando e o que vier depois dele" (prefixo, só para
   `shell` — [D-08](decisions.md#d-08--prefixo-em-tool-de-caminho)) ou "qualquer uso da ferramenta";
   quem **escreve** o padrão é o domínio, na gramática canônica, pela **prévia** do servidor
   (debounced), a partir de `{ kind, subject, form }`: o padrão aparece em mono, editável, e a prévia mostra na hora a frase, a
   largura, os exemplos do que casa e não casa, e o erro de gramática traduzido antes de enviar
   (S-185);
3. **decisão** — Permitir sem perguntar / Bloquear sempre, com o que cada uma significa;
4. **onde vale** — em todo lugar, ou numa pasta escolhida **pelo seletor do plano 06**; não existe
   campo de texto para a pasta, e o seletor só anda dentro das raízes do usuário (S-187). O passo diz
   que `project` vale **nesta pasta e nas suas subpastas** — não na pasta-mãe acima dela — e, quando a
   pasta-mãe já tem regra, avisa que ela não alcança a de baixo
   ([D-10](decisions.md#d-10--project-alcança-as-subpastas), decidido em 2026-11-05 contra a
   recomendação original do plano, que propunha "só nesta pasta, não nas subpastas");
5. **validade** — atalhos e data livre, teto da decisão à vista, erro na linha acima dele (S-191);
6. **revisão — o segundo passo**, sempre, para `allow` e `deny` (S-188): o alcance por extenso
   (padrão, onde, até quando), os achados da análise ("idêntica à regra X" desabilita salvar e oferece
   abrir ou estender a que existe — S-190; "esta regra nunca responderia: a regra Y bloqueia tudo que
   ela cobre"), o resumo da simulação ("nas suas últimas 200 invocações, esta regra teria respondido
   12 que foram perguntadas a você") e, para `allow` `broad`, uma confirmação explícita que diz o
   quanto ela cobre; `unbounded` é bloqueado com a explicação e sugestões mais estreitas (S-189).
   Voltar não envia nada.

Criar tem a guarda de clique duplo (S-194). Erro do servidor mantém o assistente preenchido, com a
mensagem traduzida no passo certo — a pasta que saiu da allowlist volta ao passo 4 (S-195). A search
é dado não confiável: campo a campo validado, inválido descartado (S-192).

**Entradas**: o botão da tela, a paleta, o duplicar e os modelos (B-30), e **"criar regra a partir
desta invocação"** na trilha — em `AuditTrail` hoje, na tela do [plano 14](../14-audit-explained/README.md)
quando existir —, que preenche o padrão mais estreito daquela invocação (S-193); e o **Recriar** de uma
regra desligada pela migração do plano 28 (B-21), que preenche decisão, escopo e pasta e mostra o padrão
antigo só como referência (S-225).

**Nota de execução.** `/rules/new` (D-19) tem seis passos — `kind`, `padrão`, `decisão`, `pasta`,
`validade`, `revisão` — geridos por `useNewRuleFlow` (novo hook: `step`, `draft`, `canAdvance`,
`next`/`back`/`goTo`), nenhum envio ao servidor antes do Confirm da revisão. O campo do passo 2 muda
por `subjectFieldOf(kind)` (`lib/rule-kind-fields.ts`): comando para `shell`, caminho para `file.*`,
domínio para `web.fetch`, servidor+ferramenta para `mcp`, nenhum campo para `search`/`web.search`/`agent`
(sempre "a ferramenta inteira", S-186) — `mcp` nunca oferece um padrão de servidor inteiro sem avisar a
largura, porque isso é `broad` pela D-09. A prévia do padrão (S-185) é `useRulePreview`, debounced, sobre
`{kind, subject, form}` com `decision`/`scope` **placeholder** (`allow`/`always`) só para a frase/erro de
gramática — a prévia **autoritativa** (largura, achados) só acontece de novo na revisão, com os valores
reais, porque o passo 2 ainda não os tem. A pasta (passo 4, S-187) só vem do seletor do plano 06
(`FolderChooserBrowser`, extraído de `OpenFolderDialog`/`PluginFolderBrowseDialog` — nenhum campo de
texto em lugar nenhum); o passo explica que `project` alcança a pasta **e as subpastas** (D-10, a mesma
correção já repetida nas notas da B-22 e da B-26). A revisão (passo 6, S-188) sempre aparece, para
`allow` e `deny`, com a frase de alcance (`actionText`/`scopeText`, agora exportadas de
`rule-sentence.ts`), os achados (`RuleAlerts`, agora exportado de `RuleDetailPanel.tsx`) e o resumo da
simulação; `widthGate` (novo, `lib/new-rule-width.ts`) é a única fonte da regra da D-09: `unbounded`
bloqueia o Confirm com a explicação, `broad` exige `acknowledgeBroad` explícito, `narrow` nunca pede
nada (S-189) — um achado `identical` desabilita o Confirm e oferece só **abrir** a regra existente, sem
um atalho separado de "estender" (S-190, `🟡` — ver corte de escopo abaixo). Criar tem a guarda de clique
duplo de `useRuleMutations.grant` (S-194, que não tinha guarda nenhuma até esta tarefa — corrigido
também para as outras `grant`-only chamadas futuras), e uma pasta recusada entre o seletor e o envio
(`WORKSPACE_NOT_ALLOWED`/`WORKSPACE_NOT_FOUND`) devolve ao passo 4 com o erro traduzido, por
`useGrantSubmit` lendo o erro **assentado** num `useEffect`, nunca dentro do `.catch` do próprio clique —
o `.catch` roda antes de `guarded()` assentar a falha, e ler `failure` ali seria sempre o valor da
renderização anterior (S-195). A search (`readNewRuleSearch`) valida campo a campo, nunca lança — e
corrigiu, de passagem, um bug real e não deste código: o TanStack Router mescla o resultado do
`validateSearch` de uma rota com o das rotas-mãe por `Object.assign`, e `frameRoute`/`rootRoute` (sem
`validateSearch` próprio) repassam a search **crua** como sua própria contribuição; uma rota-filha que
só **omite** uma chave inválida (em vez de assentá-la como `undefined`) não a limpa — o valor cru da
URL sobrevive por baixo. `readRulesSearch` (B-21) tinha exatamente o mesmo defeito, nunca percebido
porque o teste que já existia não distinguia "ausente" de "vazou, mas não casou com nenhum chip" — os
dois lugares foram corrigidos juntos, assentando sempre todo campo (`| undefined` explícito, sob
`exactOptionalPropertyTypes`), com um teste de regressão novo no nível da rota real para os dois
(S-192).

**Cortes de escopo, registrados aqui e não no texto do plano**: (1) nenhuma restrição de motor no
assistente — só o Claude está instalado, `engine` fica sempre nulo em `GrantRuleInput`, como toda
concessão hoje; (2) "o que casa e o que não casa" da prévia do padrão não ganhou exemplos — o contrato
(`PermissionRulePreviewPayload`) não tem campo para eles, e gerá-los no cliente correria o mesmo risco
de segurança já registrado na nota da B-22 (reimplementar a gramática fora do domínio); (3) "criar regra
a partir desta invocação" (S-193) e os pontos de entrada de duplicar/modelos (S-203, S-204) continuam
fora — a tela do [plano 14](../14-audit-explained/README.md) ainda não existe, e duplicar/modelos são a
própria B-30; só os dois pontos de entrada já claramente pedidos (botão da tela, paleta) mais o Recriar
já prometido (S-225) foram construídos; (4) a pasta-mãe com regra avisando que ela não alcança a de baixo
(parte da D-10) não ganhou uma busca própria no cliente — a revisão já mostra isso como um achado comum
(`overlapsDeny`/`shadowedByDeny`) vindo do servidor, a mesma fonte de achados que todo o resto da tela
usa, em vez de uma segunda implementação só para o assistente; (5) nenhum erro de validade embutido na
linha existe ainda neste passo (S-191, `🟡`) — os atalhos e a data livre funcionam, mas o teto da decisão
não chega a `ExpiryPicker` por este passo (`error={null}` sempre), e "narrower suggestions" do bloqueio
`unbounded` (S-189) ainda é só a explicação, sem sugestão de padrão mais estreito nenhuma — os dois
ficam para a B-32, que é a própria tarefa de usabilidade/ajuda do assistente; (6) o teste de comando
dentro da revisão (S-198) é da B-28, que ainda não existe. **Nível de prova**: S-185…S-189, S-192,
S-194, S-195, S-225 provados em integração, com o servidor mockado só na borda (`api.post`/`api.get`) —
nunca um componente filho mockado — incluindo um teste de ponta a ponta pelo roteador real
(`/rules/new`, `NewRuleRoute.spec.tsx`) e um de teclado só, do primeiro passo à criação (S-210);
S-190, S-191 ficam `🟡`, pelos cortes acima.

### B-28 — Testar um comando ✅

Um painel (na tela, pela ação do cabeçalho e pela paleta; no assistente, dentro da revisão e ao lado
do padrão): o tipo (`kind`), o campo dele, pasta pelo seletor, modo canônico (`ask`, `readOnly`,
`acceptEdits`, com o nome traduzido).

O resultado é um veredito grande e em palavras — "seria permitido sem perguntar, pela regra X", "seria
bloqueado pela regra Y — ela vence a regra Z, que permitiria", "o `{agent}` perguntaria a você: nenhuma
regra casa", "perguntaria: no modo somente leitura, regras que permitem não respondem" —, a lista de
**todas** as regras que casam com link para cada uma, e as ressalvas do que o motor decide antes, que
vêm do backend pelo adapter (S-196, S-197). No
assistente, o teste inclui o rascunho (S-198). Pasta recusada mostra o erro traduzido (S-199).

**Nota de execução**: o painel (`CommandTestPanel`) é um único componente reutilizado, sem estado
ou rota própria além da que o hospeda — usado solto na rota nova `/rules/test` (ação do cabeçalho
`rules.test` + comando da paleta, ambos em `RulesScreenFrame.tsx`) e embutido dentro da revisão do
assistente (`NewRuleReviewStep.tsx`, atrás de um `<details>` colapsado, rotulado "Testar um
comando"), onde carrega o próprio rascunho do assistente (`pattern`+`decision`) como `draft` no
corpo da chamada — exatamente o que D-12/S-198 pedem. O veredito (`verdictOf`,
`lib/evaluation-verdict.ts`) é função pura sobre a resposta do servidor: lê `outcome`+`reasons`
para escolher entre cinco frases (permitido, bloqueado, bloqueado-vence-um-allow, perguntaria por
falta de regra, perguntaria por causa do modo somente leitura) — nunca recalcula o que o backend já
decidiu. O campo de assunto por `kind` (`lib/evaluate-subject.ts`) escreve o **assunto concreto**
de uma invocação real (`command`/`paths`/`url`/`server`+`tool`, os mesmos campos de
`toolSubjectSchema`), nunca um padrão com curinga — diferente do passo de padrão do assistente, que
escreve a gramática (B-27); os dois reaproveitam a mesma `subjectFieldOf(kind)` para decidir qual
campo mostrar, só divergem no que escrevem nele.

**Corte de escopo, registrado aqui e não no texto do plano**: o "nesta sessão" opcional do D-12 (a
sessão viva do usuário, com seu próprio modo atual, em vez do modo escolhido à mão) **não foi
construído**. A única forma de ler isso do lado do cliente é pelo próprio `@/features/session` —
cujo barril (`register-changes`/`register-context`) importa, por tabela, o barril de
`@/features/editor`, que se autorregistra como efeito de módulo (`registerEditor()`) assim que
**qualquer coisa** importa esse barril. Como `test/support/setup.ts` já importa
`@/features/permission` para todo arquivo de teste do repositório, e este painel precisaria estar
no barril público dessa feature (para a rota e para a revisão o importarem), construir "nesta
sessão" fazia esse efeito de módulo rodar em **todo** arquivo de teste da suíte — quebrando, sem
nenhuma relação com o plano 15, `settings-sections.spec.ts` (D-13/S-142 do plano 06) e
`EditorAreaAndKeepers.spec.tsx` (o próprio registro do plano 07), cada um assumindo um estado
global limpo que deixou de existir. Achado e revertido durante esta própria tarefa — a importação
cruzada `permission → session` foi removida por completo (o hook `useFolderLiveSession` que a
usava foi apagado), em vez de corrigido para a frente: uma task do plano 15 não é o lugar de mudar
a suposição de teste de outro plano, e um deep import contornando o barril de `session` é proibido
pelo próprio lint (`no-cross-feature-internals`). `EvaluateRuleInput.sessionId`/`draft` seguem no
tipo (combinam com o contrato do backend e `draft` já é usado por S-198); só o seletor de sessão
viva ficou de fora. Uma tarefa futura pode revisitar isso se abrir um caminho mais seguro para essa
leitura (um endpoint que liste sessões vivas do chamador, por exemplo, em vez do estado só-cliente
de hoje).

### B-29 — Simular contra a trilha ✅

Pela [D-15](decisions.md#d-15--quantas-invocações-a-simulação-lê-e-o-que-ela-conta):

- **"se esta regra existisse"** — no assistente, na revisão, e num painel próprio: contagens e a lista
  do que mudaria, cada item com a invocação, quando, onde, o que aconteceu e o que aconteceria (S-200);
- **"se eu revogar esta"** — no detalhe de uma regra, e sobre uma seleção: o que voltaria a ser
  perguntado (S-201);
- seletor de quantas invocações ler (50, 200, 1000), avisando que o modo da sessão não está na trilha e
  quantas não tinham pasta registrada (S-202); trilha vazia explica por que não há o que simular.

**Nota de execução**: um único componente (`SimulationPanel`), reutilizado em três lugares — dentro
da revisão do assistente (atrás de um `<details>`, substituindo o resumo de uma linha que já
existia desde a B-27), no detalhe de uma regra ativa (`RuleDetailPanel`, "Simular revogar esta",
atrás de outro `<details>`, só para `status === 'active'`) e no diálogo de revogação em lote
(`RuleBatchRevokeDialog`, "Simular revogar estas", sempre visível — ali já é um momento de confirmar
uma ação destrutiva, diferente dos outros dois, supletivos). O seletor de limite (50/200/1000)
mora dentro do próprio painel, não em cada lugar que o incorpora — `RadioOptionGroup` (B-28) foi
generalizado para `T extends string | number` para aceitar os três números sem conversão.
`isEmptyTrail` (`lib/simulation-input.ts`) distingue "a trilha está vazia" (nada foi lido, nem
sequer `withoutFolder`) de "nada mudaria" (a trilha tem invocações, mas nenhuma muda de veredito) —
duas mensagens diferentes, nunca confundidas. A coluna "onde" que o texto do plano menciona
(S-200) não entrou: o contrato de `/permission-rules/simulate` nunca devolveu pasta por item —
só agregada, no `withoutFolder` — e reimplementar esse join no cliente seria o mesmo risco já
registrado nas notas da B-22/B-28 (duplicar lógica do domínio). Cada item mostra tipo+quando
(`ruleInvocationLabel`, já existente desde a B-22) e antes→depois em palavras.

**Achado e corrigido durante a própria tarefa**: embutir `SimulationPanel` nos três lugares acima
expôs testes de tela já existentes (`RulesScreen.spec.tsx`, 4 testes do diálogo de revogação em
lote) que mockavam `api.post` de forma genérica (`mockResolvedValue`/`mockRejectedValue` para
**qualquer** chamada) — o novo painel, ao montar, chama `/permission-rules/simulate` também, e
recebia de volta a resposta pensada só para `/permission-rules/revoke`, quebrando em runtime
(`isEmptyTrail` lendo `counts` de um objeto que não tinha `counts`). Corrigido nos próprios testes,
trocando o mock genérico por um que decide pela rota (o mesmo padrão já usado em
`CommandTestPanel.spec.tsx`, B-28) — nenhuma mudança de produto, só os testes passaram a refletir
que agora há duas chamadas, não uma. `SimulationPanel` também ganhou o estado `failed` que faltava
(só tinha `loading`/`ready` na primeira versão) — sem ele, uma leitura recusada não mostrava nada.

### B-30 — Modelos e duplicar 🔲

- **Modelos** — um catálogo em cartões (nome, o que faz, as regras com a decisão), da
  [D-16](decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram). Escolher um abre a revisão
  de várias regras: cada uma desligável, a pasta escolhida uma vez pelo seletor (ou em todo lugar), a
  validade do lote, os achados e o segundo passo — e só então aplica, pela importação (S-203). Nada
  nasce antes de confirmar;
- **Duplicar** — do detalhe, do menu e da paleta: abre o assistente com os campos da regra e validade
  nova. Sem mudar nada, a revisão diz "idêntica à regra X" (S-204). É também o "editar o padrão" da
  [D-01](decisions.md#d-01--o-que-se-edita-numa-regra): ao salvar uma cópia alterada, o assistente
  oferece revogar a original, com desfazer.

### B-31 — Exportar e importar 🔲

- **Exportar** — da seleção ou do filtro atual, baixa `remote-claude-rules-AAAA-MM-DD.json` (S-205),
  e a ajuda diz o que o arquivo contém (padrões e pastas — não segredo, mas o mapa do que o `{agent}`
  pode fazer aqui) e que a exportação fica na trilha;
- **Importar** — escolher o arquivo abre a prévia em tabela: veredito por item (nova, já existe,
  inválida com o motivo traduzido), remapear pasta de outra máquina **pelo seletor** para os itens com
  pasta desconhecida, confirmação item a item dos `broad`, validade do lote, e o segundo passo com a
  contagem e o alcance (S-206). Importação recusada mostra os motivos por item, e nada nasceu (S-207);
  arquivo grande demais é recusado com a mensagem traduzida (S-208).

### B-32 — Usabilidade e ajuda do assistente, do teste, da simulação e da importação 🔲

- ajuda de cada passo na gaveta da moldura, com os exemplos do padrão e o "por que não posso
  permitir o shell inteiro" — a explicação da largura escrita para quem não conhece shell; os exemplos
  são da gramática canônica (`shell` inteiro, `shell(git:*)`), ajuda do núcleo;
- tooltip em todo controle de ícone; validação na linha antes de enviar; foco no primeiro campo com
  erro;
- só com o teclado se completa o assistente, do primeiro passo ao criar (S-210);
- axe sem violação em cada passo, no teste, na simulação e na prévia da importação; tudo traduzido
  (S-209).

---

## Cenários cobertos

S-185…S-210.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
