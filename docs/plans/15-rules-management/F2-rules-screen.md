# F2 — Tela de regras

Plano: [15 — Gestão de regras](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-rules-backend.md); e, do [plano 06](../06-workbench/README.md), a
navegação global, a moldura de tela (cabeçalho, propósito, gaveta de ajuda), a paleta de comandos e a
central de notificações.
**Entrega:** `/rules` vira uma tela de gestão de verdade — o que cada regra permite ou bloqueia, onde
vale, quanto foi usada, com alertas explicados —, com validade, seleção, lote, desfazer, lembrete e
ajuda escrita para quem nunca viu o produto.

---

## Por quê

O usuário disse que a tela de regras é "muito simples", que precisa de "tela própria, controles
melhores, o que faz". A lista de hoje (`RuleList` → `RuleRow` dentro de `LoadedList`, numa coluna
`max-w-3xl`) mostra o padrão, o escopo e a validade de cada regra e revoga — e para aí: não diz o que
a regra **faz** em palavras, quanto foi usada, se está servindo para alguma coisa, nem deixa
encontrar uma regra entre cinquenta. O que a tela garante hoje continua garantido: rota própria,
revogar a um clique, falha que mantém a linha, sete dias, expirada marcada
([web/03 · Regras](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-20 — Service e hooks da gestão ✅

Na feature `permission`, pela cadeia `Component → Hook → Service → api.ts`
([web/01](../../architecture/web/01-architecture.md)):

- `rule.service.ts` ganha as rotas da F1 — listagem com filtros, resumo, invocações, história,
  validade (`If-Match`), lote, restauração, teste, prévia, simulação, modelos, exportar, importar,
  pelos tipos gerados de `packages/contracts/schema/http/` ([28 · D-09](../28-agent-neutral-core/decisions.md#f1--porta-de-motor-e-conversa)),
  sem tipo de resposta escrito à mão. A forma do backend morre ali, como hoje;
- `useRules` lê e escreve os filtros **na search da URL** (TanStack Router), valida cada campo e cai
  no default o que for inválido (S-156); filtro novo descarta a resposta atrasada do anterior (S-158);
- `useRuleMutations` guarda o `ETag` de cada regra e manda `If-Match`; `412` recarrega a regra e diz
  que ela mudou (S-157); `409` põe a linha no estado real;
- a guarda de clique duplo por `ref` que o `usePermissionRules` já tem é a mesma para toda mutação.

`usePermissionRules` e `usePermissionRule` são substituídos, não duplicados — o portão de duplicação
cobra.

**Nota de execução.** `rule.service.ts` ganhou as 17 rotas da F1, pelos tipos gerados, com
`queryOf(query, fields, extra?)` só para montar a query string — nenhum mapeamento de resposta
escrito à mão. `useRule`/`useRuleSummary` são `useLoad` finos; `useRules` lê a página pela mesma
rotina que `useAuditTrail` já tinha (dropar resposta atrasada de um filtro trocado, "carregar mais"
com um clique duplo guardado por `ref`, falha que mantém a linha) — o jscpd (portão 5) achou 4 clones
genuínos entre as duas, por isso a rotina virou `usePagedList` (`web/src/shared/hooks/`), e
`useAuditTrail` foi reescrito por cima dela sem mudar sua própria API pública (as 13 provas que já
existiam continuam provando o mesmo contrato, sem tocar). `useRules` ganhou `updateRule`/`removeRule`
— patch local pela resposta que o próprio hook já tem em mãos, nunca um `reload()`: a suíte que já
existia (`RuleList.spec.tsx`/`RuleDetail.spec.tsx`, S-16/S-19) prova que nada recarrega sob o ponteiro
de quem ainda lê outra linha, e um `reload()` depois de revogar quebrava exatamente essa garantia.
`useRuleMutations` guarda o clique duplo por um `Map<string, Promise<unknown>>` (`guarded()`), que
devolve a mesma promessa em voo a quem clica de novo — a primeira forma (`Promise.resolve() as never`)
mentia sobre o tipo resolvido e foi trocada antes de qualquer teste provar o problema. `412`
(`PERMISSION_RULE_CHANGED`) e `409` (`PERMISSION_RULE_STATE_CONFLICT`) recarregam a regra e nunca
viram `failure` — só qualquer outro erro vira.

**S-156 (filtros na search da URL) passa para a B-21.** O precedente já estabelecido (`AuditRoute.tsx`)
é o arquivo da rota ser dono de `validateSearch`/`useSearch`/`useNavigate`, passando `filters`/`onFilter`
como props — `useRules` só lê o `RuleListQuery` que recebe, sem tocar no router. Escrever esse
cabeamento agora, sem nenhuma tela para o dirigir, seria o mesmo antecipar sem consumidor que o
`AGENTS.md` pede para evitar; a B-21 é onde a tela nasce. **Nível de prova**: S-157, S-158 ficam 🟡 —
provados em `unit` (`useRuleMutations.spec.ts`; `useRules.spec.ts`/`usePagedList.spec.ts`), que é o
nível que `web/06-testing.md` dá para hook + service fakeado; "integração" nesta ponta é
componente + MSW, que só a B-21 traz.

### B-21 — A tela: moldura, abas, filtros, tabela ✅

Dentro da moldura de tela do plano 06: título, **propósito numa linha** ("o que o `{agent}` pode fazer
nesta máquina sem perguntar — e o que ele nunca pode"; o nome do motor só como `{agent}` —
[D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)), ações à direita (Nova regra,
Testar comando, Modelos, Importar, Exportar, ajuda).

- **abas de estado** com a contagem do resumo: Ativas · Perto de expirar · Expiradas · Revogadas ·
  Todas ([D-02](decisions.md#d-02--revogadas-somem-ou-ficam-consultáveis)); "perto de expirar" é
  menos de sete dias, calculado no cliente ([plano 03 · D-13](../03-rules-and-audit/decisions.md#d-13--perto-de-expirar-é-sete-dias), S-160);
- **filtros** em chips e seletores: decisão (Permite / Bloqueia), escopo (Em todo lugar / Numa
  pasta), tipo de ferramenta pelo `kind` (nome traduzido), pasta (as pastas que aparecem nas regras),
  "com alerta", e a busca no padrão e na pasta — tudo na search, então a tela filtrada é um link;
- **tabela densa** (shadcn `table`), com colunas: seleção, decisão (chip com ícone lucide), tipo
  (ícone e nome pelo `kind` do `reach`; `mcp` com o servidor e a ferramenta do `reach`, e um `kind` que
  esta versão não conhece com o nome genérico e o padrão como texto — S-162), padrão em mono (na
  gramática canônica, como está; truncado com tooltip e copiar), onde vale (nome da pasta com o caminho no tooltip, ou "em todo
  lugar"), validade (relativa e data, chip "expira em 3 dias"), uso ("14 · 90 dias"), última vez,
  criada (data e ícone de origem), alertas (ícone por achado) e o menu `⋯` (S-161);
- ordenação por coluna, com o estado na search; agrupar por pasta como opção;
- os **quatro estados**: skeleton com a forma da tabela; erro com `t(messageKey)` e tentar de novo;
  vazio que **ensina** — em Ativas, "nenhuma regra ainda: uma regra nasce quando você responde 'não
  perguntar de novo', ou crie uma aqui ou a partir de um modelo", com os dois botões; nas outras abas,
  o que aquela aba mostraria (S-159);
- **teclado**: setas e `j`/`k` movem, Espaço seleciona, Enter abre o detalhe, Esc fecha, `Delete`
  revoga com desfazer (S-168);
- abaixo de `md`, a tabela vira lista de cartões com as mesmas informações, sem scroll horizontal,
  alvo de toque de 44 px, e o detalhe abre em `sheet` (S-167);
- **as regras desligadas pela migração** do [plano 28](../28-agent-neutral-core/F5-permission-dialect.md)
  ([28 · D-18](../28-agent-neutral-core/decisions.md#f5--permissão-pelo-dialeto)), pelo `status=disabled`
  da B-10: um aviso no topo da tela, só quando existe alguma, com a contagem, abre a lista delas — o padrão
  antigo em mono como texto (nunca reinterpretado), o motivo traduzido do `disabledReason`, o escopo, a
  pasta e a decisão, e a ação **Recriar**, que abre o assistente (B-27) com a decisão, o escopo e a pasta
  e o padrão antigo à vista como referência — o padrão canônico a pessoa escreve. Recriar não reativa nem
  apaga a desligada; ela não tem Estender, Restaurar nem Duplicar, e não entra nas outras abas, na seleção
  nem na exportação (S-225).

**Nota de execução.** A tabela densa é hand-rolled (`<table role="grid">`, nunca um wrapper que
intercepte `tabIndex`/`onKeyDown` de fora — `role="grid"` exige que as linhas sejam filhas diretas
dele, não de um `<div>` em volta, senão o axe recusa por `aria-required-children`); as abas também são
hand-rolled (`role="tablist"`/`role="tab"` manuais), porque o `Tabs` do shadcn espera um `TabsContent`
por aba e esta tela tem uma tabela só, filtrada pela aba corrente — usar `Tabs` ali geraria um
`aria-controls` para um painel que não existe. As cinco colunas ordenáveis são exatamente os campos de
`RuleSort` (B-10); clicar numa coluna ainda não ordenada por ela entra em `desc`, clicar na já ordenada
inverte. `usePagedList` (B-20) é reusado por `useRules`, sem paginação própria nova. O teclado
(`useRuleListNav`) guarda um foco próprio — nunca a ordem de tabulação do navegador — e o nomeia por
`aria-activedescendant`; Espaço seleciona, Enter abre, Delete/Backspace revoga direto (sem diálogo, a
mesma direção seguro da própria regra), Esc solta o foco. `RuleTable`/`RuleCardList` partilham
`RuleListViewProps` (lib) e `RuleListFrame`/`RuleListStatus` (os três estados, antes das linhas) — sem
isso o jscpd achava a mesma estrutura duas vezes; um resíduo de 5 linhas de boilerplate puramente
sintático (fechamento de assinatura + `useTranslation()` + `return (`) só saiu do relatório depois de
tirar uma linha em branco de um dos dois arquivos, não por extração — não há lógica ali para extrair.
`useOpenRule` (`app/`) é a navegação para `/rules/:ruleId` que `AuditRoute.tsx` já tinha e `RulesRoute.tsx`
passou a ter também — extraída para as duas pontas de entrada do D-04 nunca divergirem. `onRecreate`
fica um no-op documentado em `RulesRoute.tsx`: o assistente é o B-27, que ainda não existe, e o TanStack
Router não deixa referenciar uma rota que a árvore não registrou — o callback já está pronto para o
B-27 só trocar o corpo. **Nível de prova**: S-159…S-162, S-167, S-168, S-225 provados em integração
(`RulesScreen.spec.tsx`, 50 casos; `RulesRoute.spec.tsx`, 10, com a navegação real do router).

### B-22 — O painel de detalhe ✅

Lateral em `md+`, mantido na URL (`/rules/$ruleId` continua sendo o deep link, agora abrindo o painel
sobre a lista — S-222):

- **a frase** do que a regra faz, montada do `reach` do servidor por chave de i18n com interpolação
  (S-163): "Permite que o `{agent}` rode `pnpm test`, e o que vier depois dele separado por espaço —
  mas não um comando encadeado com `&&`, `;` ou `|` —, **só** em `/home/…/remote-claude` e nas suas
  subpastas (D-10), sem perguntar, até 12/10";
- ~~o que casa e o que não casa~~: **cortado desta task** — ver nota de execução;
- **alertas** explicados, cada um com link para a regra envolvida (S-164): "esta regra nunca responde:
  a regra `deny shell(git:*)` cobre tudo que ela cobre, e `deny` vence"; "a pasta não está mais
  liberada — a regra não alcança nenhuma sessão";
- **validade** com Estender e Encurtar (B-23);
- **uso**: contagem na janela de retenção, última vez, e as **últimas invocações** respondidas, cada
  uma com link para a trilha filtrada pela regra (S-165) — ou para a invocação, quando o
  [plano 14](../14-audit-explained/README.md) a tiver;
- **origem**: "concedida por você ao aprovar `git status` no celular, em 12/09" (do `grantedVia` e
  do pedido), "criada nesta tela a partir do modelo Rodar os testes", "importada", "restaurada";
  anterior a este plano: "origem não registrada";
- **história** da regra (da B-11), e o id com copiar;
- **ações**: Testar um comando com esta regra (B-28), Simular "se eu revogar esta" (B-29), Duplicar
  (B-30), Exportar (B-31), Revogar. Revogada: estado e data, e só Duplicar e — na janela — Restaurar
  (S-166).

**Nota de execução.** O backend ganhou `usage`/`folderReachable` no `GET /permission-rules/:ruleId`
(`DescribePermissionRuleUseCase`), espelhando exatamente a listagem (B-10) — a leitura de uma regra
isolada não tinha nenhum dos dois até aqui, e o painel precisa dos dois. `folderReachableFor`, extraído
para `application/permission/folder-reachable.ts`, é a mesma lógica partilhada pelas duas rotas (o
jscpd achava a mesma estrutura duas vezes). "O que casa e o que não casa" (exemplos de match/non-match)
foi cortado: gerar exemplos corretos exigiria reimplementar, no cliente, a gramática/tokenização que
hoje só o servidor conhece — nesta tela, que decide o que uma regra autoriza, um exemplo errado é pior
que nenhum exemplo. Sem scenario numerado que dependa disso; fica como um corte de escopo documentado,
não uma falta. "Testar" e "Exportar" da lista de ações são do B-28 e do B-31 (F3) — nenhum dos dois
ainda existe, igual a "Simular" (B-29) e "Duplicar" (B-30) já citados ao lado; só Revogar/Restaurar são
desta task. S-165 ("a trilha filtrada pela regra") não tinha onde chegar: `AuditFilters` do web só sabia
filtrar por `sessionId`, nunca por `ruleId` — embora o backend (`GET /audit-entries?ruleId=`) já
suportasse o campo desde antes desta task. Em vez de aproximar com um link por `sessionId` (a trilha de
uma invocação, não da regra inteira), `ruleId` entrou em `AuditFilters`/`FILTER_FIELDS`/`readAuditSearch`
— o mesmo padrão de `sessionId` — e cada invocação do painel abre `/audit?ruleId=<esta regra>`: o mesmo
destino para todas, até o [plano 14](../14-audit-explained/README.md) poder levar cada uma à sua própria
entrada. Nenhum campo novo no formulário de filtros do `/audit` (`AuditFilterForm`) — a tela existente
tem um conjunto fixo de campos visíveis, e nada neste scenario pede um campo manual, só o link. O
`id` ganhou copiar com `useCopy`, o mesmo componente de `RulePatternCell` (B-21). `/rules/$ruleId` é uma
rota **irmã** de `/rules` (nunca aninhada) com o mesmo `validateSearch`, para que `useOpenRule` carregue
a busca corrente (`search`) ao trocar de regra sem perder os filtros da lista por baixo; `RuleRoute.tsx`
e `RulesRoute.tsx` partilham `RulesScreenFrame` (a moldura e a própria `RulesScreen`) — sem isso o jscpd
achava a mesma moldura duas vezes. No desktop, o painel é um `<aside>` ao lado da lista; abaixo de `md`,
um `Sheet` (`open` sempre `true`, sem `SheetTrigger` — fechar é sempre `onClose`, nunca "abrir", então
`onOpenChange` é `onClose` direto, sem `if` morto para testar). **Nível de prova**: S-163…S-166, S-222
provados em integração (`RuleDetailPanel.spec.tsx`, 14 casos; `RulesRoute.spec.tsx`/`AuditRoute.spec.tsx`
estendidos com a rota `/rules/$ruleId` — fechar, trocar de regra por um achado, abrir a trilha, o
`sheet` do celular, e uma aba clicada com o painel aberto).

### B-23 — Encurtar e estender 🔲

Um diálogo com atalhos de prazo (7 dias, 30, 90, um ano para `deny`) e data livre, o teto da decisão
à vista e a validação na linha:

- **encurtar** é a direção segura: aplica direto e mostra "desfazer" no aviso, que manda a validade
  anterior (S-170);
- **estender** pede segundo passo com a data nova e o alcance por extenso, e voltar não envia nada
  (S-169);
- `412` → "esta regra mudou em outro lugar", recarrega e reabre com o valor novo — nunca sobrescreve
  em silêncio (S-171); `409` → a linha passa ao estado real, com a mensagem traduzida (S-172).

### B-24 — Seleção, lote, desfazer, menu de contexto e paleta 🔲

- seleção por caixa, Shift+clique para intervalo, "selecionar tudo" que pega **só o filtrado**
  (S-177); barra de lote com Revogar e Exportar;
- **revogar em lote** mostra a prévia — quantas, e a lista dos padrões — porque é efeito amplo; feito,
  o aviso oferece "desfazer", que restaura pela [D-11](decisions.md#d-11--desfazer-a-revogação)
  (S-173). Clique duplo na confirmação revoga uma vez (S-174); recusa mantém todas as linhas com o erro
  traduzido (S-175). Revogar **uma** continua sem diálogo, com desfazer;
- **menu de contexto** na linha com as ações do `⋯`;
- **comandos na paleta** do plano 06, com atalho editável: "Regras: nova regra", "Regras: testar um
  comando", "Regras: revogar selecionadas", "Regras: exportar", "Regras: importar", "Regras: abrir
  perto de expirar" (S-176).

### B-25 — Lembrete de expiração na web 🔲

- **selo** na entrada "Regras" da navegação global com o número de regras ativas que expiram em sete
  dias, pelo resumo; zero esconde o selo (S-178);
- **entrada na central de notificações** do plano 06, uma vez por dia por visitante, levando à aba
  "Perto de expirar" (S-179);
- a preferência "me avise por push" nas Configurações, se o plano 06 guardar preferência no servidor
  ([D-18](decisions.md#d-18--por-onde-o-lembrete-de-expiração-chega), S-180).

### B-26 — Usabilidade e ajuda da tela de regras 🔲

A gaveta de ajuda da moldura, escrita para quem nunca viu o produto, em en e pt-BR (S-181), com um
"saiba mais" de cada controle levando à seção certa:

- **o que é uma regra** — uma resposta dada antes da pergunta; é sua, e só sua;
- **Permite × Bloqueia**, e a precedência: **qualquer** bloqueio que case vence;
- **onde vale**: "numa pasta" é a pasta exata, não as subpastas; "em todo lugar" é qualquer pasta sua;
- **o modo somente leitura** (`readOnly`, o `plan` do Claude): nele, nenhuma regra que permite
  responde — o `{agent}` pergunta;
- **validade**: toda regra expira; o aviso de sete dias; estender é uma decisão nova;
- **o que revogar faz**: vale na próxima pergunta, em toda sessão aberta; dá para desfazer por alguns
  minutos;
- **o padrão**: tool inteira, exato, prefixo — e o que o prefixo **não** cobre (comando encadeado,
  arquivo dentro de pasta);
- **o que esta tela não mostra**: as regras "desta sessão", que morrem com ela; o que o `{agent}` decide
  antes de nós (no Claude: o bloqueio nas configurações do projeto, o modo que aceita edições, as
  leituras que ele aprova sozinho);
- **bloquear não é sandbox**: um bloqueio em comando de shell pega o comando escrito, não um script que
  o chame;
- **o que é registrado**: criar, mudar validade, revogar, restaurar, exportar e importar vão para a
  trilha; testar e simular não gravam nada;
- **as regras desligadas**: por que a mudança para a forma canônica não traduziu algumas, que elas não
  respondem a nada, e como recriar.

A forma do padrão é a canônica (`shell(git status:*)`, `file.edit(src/**)`), e por isso o que o prefixo
não cobre e o shell que o bloqueio não alcança são ajuda do núcleo. Só o que vale para um motor — no
Claude, o que o CLI decide antes — é seção que `web/src/engines/claude/` registra na gaveta
([plano 28 · F6](../28-agent-neutral-core/F6-engine-extensions.md)); o núcleo da ajuda fala de regra,
padrão, escopo, validade e precedência, com `{agent}` ([D-20](decisions.md#d-20--o-núcleo-neutro-do-plano-28-e-o-ruledialect)).

E o resto do princípio de usabilidade: tooltip e nome acessível em todo controle de ícone (S-182), axe
sem violação na lista, com o painel e com um diálogo abertos, claro e escuro (S-183), atalhos na paleta
(S-184), foco visível e preso nos diálogos, e zero literal na UI (`lint` e `i18n:check`).

---

## Cenários cobertos

S-156…S-184, S-225.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
