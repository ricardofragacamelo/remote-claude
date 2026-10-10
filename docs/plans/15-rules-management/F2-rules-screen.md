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

### B-20 — Service e hooks da gestão 🔲

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

### B-21 — A tela: moldura, abas, filtros, tabela 🔲

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

### B-22 — O painel de detalhe 🔲

Lateral em `md+`, mantido na URL (`/rules/$ruleId` continua sendo o deep link, agora abrindo o painel
sobre a lista — S-222):

- **a frase** do que a regra faz, montada do `reach` do servidor por chave de i18n com interpolação
  (S-163): "Permite que o `{agent}` rode `pnpm test`, e o que vier depois dele separado por espaço —
  mas não um comando encadeado com `&&`, `;` ou `|` —, **só** em `/home/…/remote-claude` (não nas
  subpastas), sem perguntar, até 12/10";
- **o que casa e o que não casa**: exemplos gerados do `reach` (o próprio conteúdo, uma continuação,
  a palavra colada que **não** casa, o encadeado que **não** casa);
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
- **ações**: Testar um comando com esta regra, Simular "se eu revogar esta" (B-29), Duplicar (B-30),
  Exportar, Revogar. Revogada: estado e data, e só Duplicar e — na janela — Restaurar (S-166).

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
