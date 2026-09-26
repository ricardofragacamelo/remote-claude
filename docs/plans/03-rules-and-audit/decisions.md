# Plano 03 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Regras

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | Qual a sintaxe do padrão de input da regra: prefixo de comando, glob, ou expressão | o que os usuários realmente querem liberar — não há uso medido | B-01 | 2026-09-16 · **a gramática do próprio Claude Code**: `Bash(git status)` casa exato, `Bash(git status:*)` casa o prefixo. Sem glob, sem regex | ✅ |
| D-02 | Regra tem validade máxima (expira em N dias), ou vale até ser revogada | se "sempre" significa "para sempre" é uma escolha de segurança, não de UX | B-01 | 2026-09-16 · **expira**: `expiresAt` obrigatório, teto configurado, default 90 dias | ✅ |
| D-03 | `always` vale por usuário ou pela máquina | depende de [D-03 do plano 01](../01-live-session/decisions.md) — dono único ou vários | B-01 | 2026-09-16 · **por usuário** — herdado, não reaberto | ✅ |
| D-09 | B-04 manda devolver `updatedPermissions` ao SDK; B-05 exige que revogar valha na sessão já de pé. As duas cabem juntas? | descoberta ao começar a F0: pelos tipos do SDK `0.3.277`, regra entregue por `updatedPermissions` faz o CLI aprovar **sem** chamar `canUseTool`, e não há API para retirá-la de uma sessão viva | B-03, B-04, B-05 | 2026-09-24 · **não se devolve `updatedPermissions`**: a regra nossa é a única autoridade. Decidido pelo dono do produto | ✅ |
| D-10 | Por onde uma regra `project`/`always` nasce, e com que validade | a F0 cria a regra na aprovação, mas `PERMISSION_RULE_PATTERN_INVALID` (400) e `PERMISSION_RULE_EXPIRY_TOO_LONG` (422) pressupõem um pedido que traz padrão e validade | B-01, B-02 | 2026-09-24 · **dois caminhos, uma rotina**: `permission.resolve` com escopo `project`/`always` (padrão mais estreito, validade default) e `POST /permission-rules` (padrão e validade explícitos) | ✅ |
| D-11 | Como "o mais restritivo" entre regra e `permissionMode` se aplica | o que o CLI decide sozinho antes de nós — medido no plano 01 — não passa pelo `canUseTool` | B-06 | 2026-09-24 · **`deny` sempre nega; `allow` não auto-aprova em `plan`**. O que o CLI aprova sozinho em `acceptEdits` fica fora do alcance da regra, declarado | ✅ |

### D-01 — a sintaxe é a superfície de ataque

É o [R-01](README.md#riscos-e-decisões-em-aberto) deste plano. Quanto mais expressivo o padrão,
mais fácil escrever — e mais fácil escrever largo demais.

- **Prefixo de comando** (`Bash(git status)` casa só com o comando exato ou com argumento
  adicional explícito): previsível, verboso, e é o que S-06 cobra.
- **Glob**: cômodo, e `Bash(git *)` já libera `git push --force`.
- **Expressão regular**: poder demais para uma decisão de segurança tomada num toque de celular.

**Decidido:** a gramática das settings do próprio Claude Code — `Tool(conteúdo)` para casamento
exato, `Tool(conteúdo:*)` para prefixo explícito, `Tool` para a tool inteira. É a mais restrita
das três, e afrouxar depois é uma migration enquanto apertar depois é tirar permissão de quem já
se acostumou.

O argumento que fecha a escolha não é o de restrição, e ainda não estava registrado: a
[B-04](F0-rules.md) devolve a decisão ao Claude como
`PermissionUpdate`. Se a nossa sintaxe não for a **mesma**, as duas metades passam a casar
conjuntos diferentes de comando — a nossa regra libera o que a dele não libera, ou pior, o
contrário — e o produto passa a ter duas respostas para a mesma pergunta. Com a gramática dele,
a regra persistida é convertível em `PermissionUpdate` sem tradução, e o `ruleContent` guardado
é literalmente o que vai para o SDK.

O que a decisão cria:

- **o padrão é validado na criação**, não só no casamento: padrão fora da gramática é `400`, e
  não uma regra que nunca casa nada (ou que casa demais). Cenário novo — S-47;
- **o prefixo respeita fronteira de token**: `Bash(git status:*)` não cobre `git statusx`.
  Cenário novo — S-48. É o tipo de furo que passa despercebido num matcher escrito por igualdade
  de string;
- o matcher continua sendo **regra pura** no domínio, como o R-01 exige, e é dele que a UI tira
  o texto de alcance da F1.

### D-02 — regra que expira

Uma regra sem validade sobrevive à razão que a criou. Validade máxima (por exemplo, 90 dias,
como a retenção) força a revisão periódica; e obriga a UI a avisar antes de expirar, senão a
sessão volta a perguntar sem explicação.

**Decidido:** toda regra nasce com `expiresAt`. O default é **90 dias**, o mesmo horizonte da
retenção da [F3](F3-retention.md) — um usuário que revisa a trilha do trimestre revisa também o
que autorizou no trimestre. Valor e teto vêm de configuração; pedido acima do teto é recusado na
criação, não silenciosamente truncado.

O que a decisão cria:

- `expires_at timestamptz NOT NULL` na migration da B-02, e o matcher da B-01 ignorando regra
  expirada — que é o S-12, agora com uma data concreta para exercitar;
- **a UI avisa antes**: a lista da F1 mostra a validade, e a regra perto de expirar é sinalizada.
  Sem isso, a sessão volta a perguntar sem explicação, que é o pior dos dois mundos — perde a
  comodidade e não explica a perda. Afeta B-07 e B-09, e o S-15 passa a exigir a validade entre
  as colunas;
- cenário novo S-49: criação com validade acima do teto configurado é recusada;
- expiração **não** é revogação: a linha continua na lista, marcada como expirada, porque
  "sumiu" e "deixou de valer" são coisas diferentes para quem procura o que autorizou.

### D-03 — de quem é a regra

**Decidido por herança, não reaberto.** O [D-03 do plano 01](../01-live-session/decisions.md#d-03--um-dono-ou-vários)
resolveu o sistema inteiro como **multiusuário desde o dia 1**, e diz com todas as letras que
"regra de permissão é sempre de **um** usuário, nunca da máquina", com `userId` `NOT NULL` desde
a primeira migration.

Não há gap: `always` significa "em qualquer projeto **deste usuário**". A regra de um nunca
resolve o pedido de outro — que é o S-14, e o motivo de a B-01 carregar `userId` no casamento e
não só na criação.

### D-09 — a regra nossa é a única autoridade

Nasceu ao começar a F0, e é um conflito entre duas tarefas da mesma fase, não uma preferência.

A B-04 dizia: "sempre permitir" volta ao Claude por `updatedPermissions`, senão "o SDK continua
perguntando o que nós já decidimos". Os tipos do SDK `0.3.277` dizem o que isso faz: o
`PermissionUpdate` devolvido é gravado **do lado do CLI**, que passa a aprovar a invocação sem
chamar o `canUseTool`. E o `Query` não tem nenhum método que retire uma regra entregue assim —
`setPermissionMode` muda o modo, `applyFlagSettings` mexe noutra camada.

Com isso, três promessas da fase quebravam juntas:

- **B-05 / S-09 / S-42** — revogar só valeria na próxima sessão. "Regra revogada que continua
  valendo até reiniciar não é revogação", nas palavras da própria fase;
- **B-03** — a execução autorizada pela regra do CLI não emite `permission.resolved` com
  `auto: true`: o usuário deixa de ver o que foi autorizado em seu nome;
- **S-30 / S-50** — a história não registra qual regra resolveu, porque ninguém nosso resolveu.

**Decidido:** não se devolve `updatedPermissions`. O `canUseTool` continua sendo chamado, e a
regra responde na hora, sem incomodar ninguém. "O SDK continua perguntando" deixa de ser defeito:
a pergunta chega a nós, e quem responde é a regra — um acesso ao banco, não um humano.

O argumento da [D-01](#d-01--a-sintaxe-é-a-superfície-de-ataque) continua valendo, e é o que
permite reabrir esta decisão sem migration: o `ruleContent` guardado segue sendo **literalmente**
a gramática do CLI. Se um SDK futuro oferecer como retirar uma regra da sessão viva, devolvê-la
passa a ser uma linha na ponte, e a D-09 é revista.

### D-10 — dois caminhos para nascer, uma rotina

A aprovação é o caminho do dia a dia: quem escolhe `project` ou `always` num card cria uma regra
com o **padrão mais estreito** que cobre aquela invocação (`Bash(git status)`, nunca `Bash`) e
com a validade default da configuração. Invocação sem campo casável não vira regra da tool
inteira: é recusada com `INVALID_INPUT` (S-58), pelo mesmo motivo que o escopo `session` cai
para `once` — só que aqui, com uma autorização que sobrevive à sessão, cair em silêncio seria
dizer ao usuário algo falso sobre o que ele autorizou.

`POST /permission-rules` é o caminho explícito, e é dele que os dois erros da D-01 e da D-02
saem: padrão fora da gramática é `400`, validade acima do teto é `422`. As duas portas chamam a
**mesma** rotina de aplicação, que valida, grava, e audita — uma segunda implementação é a que
envelhece diferente.

O que a decisão cria:

- a API `GET`/`POST`/`DELETE /permission-rules`, no [catálogo de módulos](../../architecture/backend/03-modules.md#permission);
- `PERMISSION_RULE_NOT_FOUND` (404) no [catálogo de erros](../../architecture/shared/04-errors-and-http.md);
  regra de outro usuário é `PERMISSION_NOT_OWNED` (403), pela [D-17 do plano 01](../01-live-session/decisions.md#d-17--usar-o-código-http-que-cada-coisa-é);
- **criar a mesma regra duas vezes devolve a que existe** (S-10): a igualdade é usuário, escopo,
  projeto, padrão e decisão, entre as ativas. A expirada não conta — ela continua na lista,
  marcada, e a nova nasce ao lado;
- a validade tem default e teto próprios (`RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS`,
  `RC_PERMISSION_RULE_MAX_LIFETIME_MS`), com o teto limitado **no código** a 365 dias e o default
  ≤ teto, como a [configuração que falha fechada](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada)
  exige (S-60). O de `session` continua sendo o `RC_PERMISSION_RULE_LIFETIME_MS`;
- os `suggestions` do `permission.requested` **não** ganham `project`/`always` nesta fase: o
  backend aceita os quatro escopos, e oferecê-los na tela é da [F1](F1-rules-ui.md) (B-08, B-10),
  que é quem mostra o alcance com todas as letras. *(Feito na F1, com o padrão e a validade na
  própria sugestão — [D-12](#d-12--o-alcance-vem-na-pergunta).)*

### D-11 — o mais restritivo, até onde o `canUseTool` alcança

A regra só vale onde o `canUseTool` é chamado. Dentro disso:

- **`deny` vence `allow`**, e não só no mesmo escopo: qualquer regra `deny` que case nega, mesmo
  com um `allow` de escopo mais largo ou mais estreito ao lado (S-07). É a leitura mais restritiva
  de "`deny` vence `allow` no mesmo escopo", e não há caso em que a outra seja mais segura;
- **em `plan`, `allow` não auto-aprova** — o pedido vai para o humano. Quem pôs a sessão em modo de
  planejamento não quis que uma regra antiga executasse por ele (S-56);
- o `deny` das settings de projeto é aplicado pelo CLI **antes** de nós, e nenhuma regra nossa o
  desfaz: não devolvemos `updatedPermissions` (D-09) nem usamos `allowedTools`
  ([04-claude-integration](../../architecture/backend/04-claude-integration.md#diretório-confiado-fura-o-canusetool--medido)) (S-08).

**O que fica de fora, declarado:** em `acceptEdits`, o CLI aprova edição de arquivo **sem** chamar
o `canUseTool`, e uma regra `deny` sobre `Edit` não é consultada. Fechar isso exigiria decidir no
hook `PreToolUse`, que hoje só registra — e mudar isso é mexer na fronteira que a
[ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)
separou de propósito. O modo é escolha explícita do usuário ao abrir a sessão; a limitação está no
[progresso](progress.md#escopo-reduzido-ou-adiado).

---

## F1 — Telas de regra

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Onde a lista de regras mora na UI: tela própria, ou seção dentro das configurações | quantas regras um usuário terá | B-07 | 2026-09-16 · **tela própria nas duas pontas**, alcançável por link direto da aprovação e da trilha | ✅ |
| D-12 | Como a tela de aprovação sabe o alcance e a validade de `project`/`always` antes de alguém escolher | descoberta ao começar a F1: a sugestão do `permission.requested` só traz `scope` e `labelKey`, e a B-08 exige "a validade à vista" | B-08, B-10 | 2026-09-24 · **a sugestão carrega `pattern` e `lifetimeMs`**, opcionais no contrato e presentes nos escopos persistidos | ✅ |
| D-13 | O que é "perto de expirar" | a D-02 pede o sinal e não diz o limiar | B-07, B-09 | 2026-09-24 · **sete dias**, calculado no cliente — é aviso, não decisão de segurança | ✅ |
| D-14 | Escolher `project`/`always` pede segundo passo mesmo em tool não destrutiva? | a confirmação em dois passos do plano 02 vale só para `destructive` | B-08, B-10 | 2026-09-24 · **sim, nas duas pontas**: o segundo passo é onde o alcance aparece com todas as letras | ✅ |

### D-04 — onde a revogação mora

**Decidido:** rota própria no web (`/rules`) e tela própria no app — não uma seção de
configurações.

O motivo é o [R-02](README.md#riscos-e-decisões-em-aberto): `always` é, na prática, "não me
pergunte mais", e o plano promete que a revogação está **a um clique**. Dentro de configurações
ela fica a três toques, e — pior — longe dos dois lugares onde a dúvida de fato nasce: a tela de
aprovação, na hora de escolher o escopo, e a entrada auto-resolvida da trilha, na hora de
descobrir que algo executou sem perguntar.

O que a decisão cria:

- **dois pontos de entrada obrigatórios**, e não só a rota: da escolha de escopo (B-08, B-10) e
  da entrada com `auto: true` na trilha (B-15) se chega à regra;
- simetria entre as pontas, como o [plano 02](../02-mobile-approval/README.md) estabeleceu:
  quem aprovou de longe retira de longe, pelo mesmo caminho;
- cenário novo S-50: da trilha se chega à regra que resolveu, **inclusive quando ela já foi
  revogada** — e aí a tela explica o estado, em vez de devolver um vazio sem motivo.

### D-12 — o alcance vem na pergunta

Nasceu ao começar a F1. A B-08 pede que `project` e `always` apareçam "com a validade à vista", e
o S-17 pede o alcance com todas as letras. O `permission.requested` só dizia `scope` e `labelKey`.

Três saídas, e só uma não duplica nada:

- **o cliente deriva o padrão** do `input`: seriam três implementações do matcher (backend, web,
  Dart), e a [D-01](#d-01--a-sintaxe-é-a-superfície-de-ataque) diz que é do matcher do domínio
  que a UI tira o texto de alcance. A cópia que envelhece diferente é a que mostra um alcance e
  grava outro;
- **o cliente escreve "90 dias"**: a validade é configuração
  (`RC_PERMISSION_RULE_DEFAULT_LIFETIME_MS`), e o número na tela passaria a mentir na primeira
  instalação que o mudasse;
- **a sugestão carrega o que a regra vai ser.**

**Decidido:** cada sugestão persistida traz `pattern` — o padrão mais estreito, o mesmo que a
aprovação gravará — e `lifetimeMs` — a validade default, contada a partir da resposta. Os dois
campos são **opcionais** no schema e presentes em `project`/`always`; `once` e `session` seguem
como estavam. Invocação sem padrão possível não recebe as duas sugestões (S-64), pela mesma razão
que a aprovação com elas é recusada (S-58): oferecer o que o servidor recusaria é pior que não
oferecer.

O cliente que recebe um escopo persistido **sem** um dos dois campos não o oferece (S-67): um
botão que promete "não perguntar de novo" sem dizer o quê é o botão que o R-02 descreve.

### D-13 — perto de expirar é sete dias

A D-02 pediu o sinal e não o limiar. **Decidido:** sete dias, calculado no cliente sobre o
`expiresAt` que o servidor manda. O `status` (`active`/`expired`) continua sendo do servidor,
porque a lista mostra a expirada marcada e isso não pode depender do relógio do aparelho; o aviso
de "perto" pode, porque errar por minutos num aviso de dias não muda o que ninguém faz.

Sete e não trinta: com a validade default de 90 dias, trinta deixaria um terço da vida da regra
sob aviso, e aviso permanente é aviso que ninguém lê.

### D-14 — escopo persistido sempre pede o segundo passo

A confirmação em dois passos do [plano 02](../02-mobile-approval/decisions.md#d-08--dois-passos-para-quê)
vale só para `destructive`. A B-10 diz que escolher `always` num toque acidental é exatamente o
que a tela existe para impedir — e um `always` sobre um `Write` não destrutivo continua sendo
"não me pergunte mais sobre isto por 90 dias".

**Decidido:** `project` e `always` pedem o segundo passo **sempre**, nas duas pontas, qualquer que
seja o risco. O segundo passo é o lugar onde o alcance aparece por extenso — padrão, onde vale,
por quanto tempo — e de onde se chega à lista de regras, que é um dos dois pontos de entrada da
[D-04](#d-04--onde-a-revogação-mora). Voltar dele não envia nada (S-65).

---

## F2 — Consulta da trilha

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | A trilha é escopada por usuário ou pela máquina | mesma dependência de [D-03 do plano 01](../01-live-session/decisions.md) | B-12 | 2026-09-16 · **por usuário** — mesma herança da D-03 | ✅ |
| D-06 | Qual a ordenação estável da paginação por cursor: `(at, id)` ou um sequencial próprio | se o relógio pode voltar atrás na máquina do usuário | B-11 | 2026-09-16 · **sequencial próprio (`seq`), keyset descendente**; `at` só filtra | ✅ |
| D-15 | De onde a entrada tira o pedido, a regra e o `auto` que a B-15 exige | descoberta ao começar a F2: `audit_entries` não tem nenhuma das três colunas, e o que as tem é `permission_requests`, de outro módulo | B-15 | 2026-09-24 · **gravadas com a entrada de decisão**, em colunas novas e anuláveis; nada é juntado na leitura | ✅ |
| D-16 | Qual `traceId` a entrada carrega, se a sessão inteira roda no contexto do `session.start` | descoberta ao começar a F2: o hook herda o contexto assíncrono de quem abriu a sessão, e a trilha não tem `trace_id` | B-15 | 2026-09-24 · **o do turno**: capturado no `session.prompt`, adotado no `UserPromptSubmit`, gravado pelo adapter de persistência | ✅ |
| D-17 | O que é "a trilha de outro usuário" numa consulta que já é escopada por quem pergunta | não há tabela de sessões: o dono de uma sessão encerrada só existe na própria trilha | B-12 | 2026-09-24 · **filtrar pela sessão de outra pessoa** é `403`; sessão sem entrada é página vazia | ✅ |
| D-18 | Como a tela abre uma regra revogada, se `GET /permission-rules` só lista as que valem | a D-04 promete a regra revogada "com o estado explicado", e não há rota que a devolva | B-15 | 2026-09-24 · **`GET /permission-rules/:ruleId`**, em qualquer estado, e a rota `/rules/$ruleId` no web | ✅ |

### D-05 — de quem é a trilha

**Decidido por herança**, pela mesma [D-03 do plano 01](../01-live-session/decisions.md#d-03--um-dono-ou-vários):
cada usuário lê a própria trilha, `userId` `NOT NULL` desde a primeira migration, toda query
escopada.

**Trilha de outro responde `403`** — S-26, S-45. A formulação original desta decisão dizia `404`,
pela mesma razão que a D-13 do plano 01 dava para as raízes de workspace. As duas foram revertidas
em 2026-09-19 pela [D-17 do plano 01](../01-live-session/decisions.md#d-17--usar-o-código-http-que-cada-coisa-é):
`403` é falha de autorização e `404` é registro que não existe, e o produto usa a semântica HTTP
em vez de inventar uma própria.

### D-06 — paginar sobre o tempo

Ordenar por timestamp parece óbvio até dois registros caírem no mesmo milissegundo, ou o relógio
da máquina ser ajustado para trás — e então o cursor repete ou pula linha, que é exatamente o
que S-25 proíbe. Um sequencial próprio (ou o par `(at, id)`) resolve, ao custo de uma coluna.

**Decidido:** coluna sequencial própria (`seq bigint`, gerada pelo banco), cursor **keyset
descendente** sobre ela — do mais novo para o mais antigo. `at` continua existindo, e continua
sendo o que os filtros de período usam; o que ele deixa de ser é a ordenação.

```sql
WHERE user_id = $1 AND seq < $cursor
ORDER BY seq DESC
LIMIT $n
```

O par `(at, id)` resolveria o empate de milissegundo, mas não o relógio ajustado para trás: a
linha nova cairia **dentro** de uma janela já lida e sumiria da paginação. E há um segundo furo,
que só o sentido descendente fecha: um sequencial ascendente também pula linha, porque uma
transação com número menor pode commitar depois de uma maior, e o cursor já teria passado por
ali. Descendente é imune aos dois — escrita nova só entra **acima** da janela lida, nunca dentro
dela.

O que a decisão cria:

- **a coluna nasce na migration do plano 01** (B-22), não aqui. A tabela de auditoria é
  append-only e a [D-06 do plano 01](../01-live-session/decisions.md#d-06--append-only-de-verdade)
  a protege com trigger; acrescentar coluna depois é mexer onde o desenho manda não mexer. O
  plano 01 ainda não começou, então o custo agora é uma linha de DDL. **Item de propagação**;
- os índices da B-14 são desenhados sobre `seq`: `(user_id, seq DESC)` e `(session_id, seq DESC)`,
  com `at` como coluna de filtro — é isso que o S-28 confere no plano de execução;
- o S-25 deixa de ser vago: o teste escreve **durante** a leitura paginada e exige que nenhuma
  linha se repita nem desapareça.

### D-15 — a correlação nasce com a entrada

Nasceu ao começar a F2. A B-15 pede que da entrada se chegue à decisão, com `resolvedBy`, e à
regra, com `auto: true`. A entrada de decisão (`allowed`/`denied`) guardava o nome da tool, o
input e quem decidiu, e nada que a ligasse ao pedido nem à regra: isso mora em
`permission_requests`, que é do módulo `permission`.

Duas saídas:

- **juntar na leitura**: a consulta da trilha leria a tabela de outro módulo, ou chamaria uma
  porta dele a cada página. `audit` deixaria de ser independente justo na leitura, e a resposta a
  "quem autorizou isto?" passaria a depender de uma tabela que **é** reescrita — o pedido é gravado
  duas vezes, ao abrir e ao resolver;
- **gravar com a entrada** o que a decisão foi: o pedido, se foi automática, a regra, o escopo,
  quem e de onde.

**Decidido:** a segunda. É o que o próprio listener já dizia querer — "a pergunta *quem autorizou
este comando?* respondida por uma tabela só" —, e é o que torna a entrada um registro, e não um
índice para outro lugar.

O que a decisão cria:

- a migration `0009` acrescenta sete colunas **anuláveis** a `audit_entries` — as seis do veredito e o `trace_id` da [D-16](#d-16--o-traceid-é-o-do-turno). `ADD COLUMN` sem
  default não reescreve linha nem dispara a trigger de `UPDATE`: o append-only que a D-06 do
  plano 01 protege continua intacto. O motivo que fez o `seq` nascer na primeira migration — ele
  precisa de valor em toda linha — não vale para uma coluna que é nula no que já existe;
- duas `CHECK`: entrada `recorded` não carrega veredito (o hook não decidiu nada), e só decisão
  automática aponta regra — o banco repete o que o domínio garante;
- as entradas de decisão gravadas **antes** da migration continuam sem veredito. A tela diz que a
  ligação não existe, em vez de inventar uma.

### D-16 — o `traceId` é o do turno

O S-31 pede que o `traceId` ligue a entrada ao log e ao evento. A trilha não gravava nenhum, e o
que estava em escopo quando o hook disparava era o do `session.start`: o SDK roda o laço inteiro
no contexto assíncrono de quem abriu a sessão. Uma sessão de dois dias teria um `traceId` só, que
é o trabalho do `sessionId` ([03-logging](../../architecture/shared/03-logging.md#traceid--como-propaga)).

**Decidido:**

- o runner guarda o `traceId` de cada `session.prompt`, em ordem, e o **adota** quando o CLI diz
  que o turno começou (`UserPromptSubmit`). Hook, `canUseTool` e mensagens do stream rodam sob ele;
- o `traceId` da entrada é gravado **pelo adapter de persistência**, a partir do contexto. Domínio
  e aplicação continuam sem conhecer observabilidade, como o 03-logging exige;
- o hub carimba o `traceId` em escopo em todo evento que publica. É a regra 5 do 03-logging — todo
  evento emitido por causa de um comando carrega o `traceId` daquele comando —, que o stream ainda
  não cumpria;
- a entrada de uma decisão humana carrega o `traceId` do `permission.resolve` de quem respondeu,
  e não o do turno. É o que ela registra: a resposta, que tem o seu próprio log.

### D-17 — a trilha de outro é a sessão de outro

A consulta é sempre escopada por quem pergunta, e ninguém recebe linha alheia. "A trilha de outro
usuário" só tem forma quando o pedido **aponta** para algo de outra pessoa — e o que a consulta
aceita como apontador é o filtro de sessão.

Não há tabela de sessões: o dono de uma sessão encerrada só está escrito na própria trilha.
**Decidido:** a sessão é de outra pessoa quando a trilha tem entrada dela e nenhuma é de quem
pergunta — `403 FORBIDDEN`, pela [D-05](#d-05--de-quem-é-a-trilha). Sessão sem nenhuma entrada é
página vazia (S-73): não há de quem ela seja, e `404` diria que se procurou uma coisa que não
existe, quando o que não existe ainda é só a primeira linha.

O texto antigo da B-12 e do S-26 dizia `404`. A D-05 já tinha registrado a reversão para `403`,
pela D-17 do plano 01, e as duas linhas não tinham acompanhado — corrigidas na mesma entrega.

### D-18 — a regra revogada tem endereço

A [D-04](#d-04--onde-a-revogação-mora) promete que da trilha se abre a regra, "inclusive quando
já foi revogada, e aí a tela explica o estado". `GET /permission-rules` lista as que ainda valem,
e a revogada sai dela de propósito.

**Decidido:** `GET /permission-rules/:ruleId` devolve a regra em **qualquer** estado —
`active`, `expired` ou `revoked`, com `revokedAt` —, com os mesmos `404` e `403` do `DELETE`. No
web, a rota `/rules/$ruleId`, que mostra a regra e, se ela ainda vale, o botão de revogar: da
entrada que surpreendeu alguém à revogação é um clique.

A regra `session` nunca é gravada, e o id dela não leva a lugar nenhum depois que a sessão acaba.
A entrada resolvida por uma delas não oferece link: diz que a regra valia só naquela sessão (S-75).

---

## F3 — Retenção

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | Quem dispara a purga: agendador do SO, job do backend, ou comando manual | como o produto é instalado — o que só se decide no [plano 06](../06-distribution/README.md) | B-18 | 2026-09-16 · **job interno do backend**, com lock; o subcomando do `db.mjs` é o mesmo código, disparado à mão | ✅ |
| D-08 | A trigger append-only do [plano 01](../01-live-session/decisions.md#d-06--append-only-de-verdade) aborta todo `DELETE`. Como a purga apaga? | descoberta ao propagar a D-07: os dois documentos se contradizem, e do jeito que estão a purga não roda | B-17, B-19 | 2026-09-16 · **a trigger passa a barrar `DELETE` só dentro do piso de 90 dias**; `UPDATE` continua sempre abortado | ✅ |
| D-19 | Onde o registro da purga mora, e o que acontece se ele não puder ser gravado depois de apagar | descoberta ao começar a F3: `audit_events` exige `user_id` e sujeito, e uma purga não é fato de ninguém; e um registro gravado **depois** do `DELETE` deixa uma janela em que a trilha perde linhas sem rastro | B-19 | 2026-09-24 · **tabela própria, `audit_purges`, uma linha por lote, gravada na mesma instrução que apaga** | ✅ |
| D-20 | O que "a trilha" é, para a purga | há duas tabelas com o mesmo piso (`audit_entries` e `audit_events`), e a F3 fala de uma | B-17 | 2026-09-24 · **as duas**, com a mesma janela; `audit_purges` e `permission_requests` ficam de fora | ✅ |
| D-21 | O piso de "90 dias" da trigger e a janela do código medem a mesma coisa? | descoberta ao começar a F3: `now() - interval '90 days'` é aritmética de calendário no fuso da sessão, e o código conta 90 × 24 h | B-16, B-17 | 2026-09-24 · **o piso são 2160 horas**: a `0010` reescreve as duas funções da trigger, sem tocar a trigger | ✅ |
| D-22 | Quando o job roda pela primeira vez, como se desliga, e o que o comando precisa do ambiente | a D-07 diz "intervalo configurado" e "desligável por configuração", e não diz nenhum dos três | B-17, B-18 | 2026-09-24 · **um minuto depois do boot**, e depois a cada intervalo; desligar é o valor literal `off`; o comando lê só as variáveis que usa | ✅ |

### D-07 — quem varre a trilha

O gap dizia que a decisão dependia do [plano 06](../06-distribution/README.md). Depende **só se**
a purga for do agendador do SO: um job dentro do próprio backend não sabe nem precisa saber como
o produto foi instalado.

**Decidido:** job interno, em intervalo configurado, e o subcomando da B-18 chamando **a mesma
rotina de aplicação** — não uma segunda implementação que envelhece diferente. O plano 03 deixa
de depender do 06, e a F3 destrava agora.

O que a decisão cria:

- **lock** (advisory lock do Postgres) em volta da rotina: o job e o comando manual podem cair no
  mesmo minuto, e duas purgas simultâneas sobre a mesma janela é a receita para o lote perdido
  que o S-37 proíbe. Cenário novo — S-51: a segunda sai com código 0 sem apagar nada, e diz por
  quê;
- a B-19 registra **quem disparou** — `job` ou `cli` —, junto da janela e da contagem. Purga sem
  rastro é o buraco óbvio do desenho (R-04), e "não sei quem mandou" é meio rastro;
- o job é **desligável por configuração, nunca por acidente**: desligado, o backend loga em
  `warn` no boot que a retenção de 90 dias passou a depender de alguém rodar o comando. A
  promessa da F3 não pode morrer em silêncio;
- o [plano 06](../06-distribution/README.md) **não** ganha dependência. Se o instalador quiser um
  timer do SO depois, ele chama o mesmo comando — e é decisão dele, não deste plano.

### D-08 — quem pode apagar a trilha append-only

Nasceu ao propagar a D-07, e é um conflito entre dois documentos, não uma preferência: a
[D-06 do plano 01](../01-live-session/decisions.md#d-06--append-only-de-verdade) garante o
append-only com uma trigger que aborta `UPDATE` e `DELETE` **para quem quer que** esteja
conectado — e a F3 deste plano apaga. Do jeito que estavam, a purga não rodava. O R-04 falava em
"papel próprio", que é exatamente o que aquela decisão rejeitou (papel novo, segunda string de
conexão, e o CI tendo que conseguir criá-lo).

**Decidido:** a trigger deixa de ser "nenhum `DELETE`" e passa a ser "nenhum `DELETE` dentro do
piso":

```
BEFORE UPDATE → aborta sempre
BEFORE DELETE → aborta se OLD.at > now() - <piso de 90 dias>
```

O piso de retenção deixa de ser promessa do código e vira **invariante do banco**. Purga com bug,
migration distraída ou `DELETE` digitado à mão esbarram todos na mesma barreira — e nenhum papel
novo, nenhuma segunda conexão, nada da D-06 do plano 01 é reaberto.

A divisão de trabalho que isso cria, e que é o ponto:

- **o piso (90 dias) vive na trigger** e é imutável em tempo de execução;
- **a janela configurada vive na configuração** e só pode ser ≥ piso (B-16, S-33). Ela decide o
  que a purga *tenta* apagar; a trigger decide o que o banco *deixa* apagar.

O que a decisão cria:

- S-35 e S-36 deixam de provar só o comportamento da purga e passam a provar a barreira: um
  `DELETE` direto dentro da janela é recusado **pelo banco**, com o papel da aplicação;
- **item de propagação para o plano 01**: a trigger da B-22 nasce já com a condição de janela no
  `DELETE`, senão a F3 daqui esbarra nela;
- o R-04 deste plano é reescrito: a mitigação não é "papel próprio", é janela na trigger + lote +
  lock + a própria purga auditada.

### D-19 — a purga se registra na mesma instrução que apaga

Nasceu ao começar a F3. A B-19 pede "janela, contagem e quem disparou", e havia duas perguntas
que ela não respondia.

**Onde.** `audit_events` é a tabela dos fatos de conta, e cada linha dela é **de alguém**:
`user_id`, `subject_id` e `subject_label` são `NOT NULL`. Uma purga apaga por janela, a trilha de
todo mundo de uma vez, e não tem dono nem sujeito. Preencher as três com um usuário "sistema"
seria o mesmo erro que a própria `audit_events` evitou ao não alargar `audit_entries`: transformar
um `NOT NULL` em talvez, na tabela cuja razão de existir é poder ser confiada.

**Quando.** Um registro gravado **depois** de apagar tem uma janela entre as duas coisas: o banco
cai, o processo morre, e as linhas saíram sem que nada diga quem as tirou. É o buraco do R-04,
aberto por um instante a cada purga.

**Decidido:** tabela própria, `audit_purges`, com **uma linha por lote**, e a linha é gravada **na
mesma instrução** que apaga o lote:

```sql
WITH doomed AS (SELECT id FROM audit_entries WHERE at < $cutoff ORDER BY at LIMIT $n),
     gone   AS (DELETE FROM audit_entries WHERE id IN (SELECT id FROM doomed) RETURNING 1)
INSERT INTO audit_purges (…, deleted) SELECT …, count(*) FROM gone HAVING count(*) > 0
```

Uma instrução é uma transação: ou o lote sai **e** o registro entra, ou nenhum dos dois. Não há
instante em que a trilha tenha perdido linhas sem rastro.

O que a decisão cria:

- cada linha diz `purge_id` (a execução, que agrupa os lotes), `triggered_by` (`job`/`cli`),
  `trail`, `retention_days`, `cutoff` e `deleted` — a janela, a contagem e quem, como a B-19 pede;
- `audit_purges` recusa `UPDATE` **e** `DELETE`, sempre: o registro do que a purga apagou não é
  ele mesmo purgável. Cresce uma linha a cada mil apagadas;
- **purga que não apaga nada não deixa linha** (S-86): não há o que prestar contas, e o job diário
  encheria a tabela de zeros. Que o job está rodando é o log dele que diz, em `info`;
- **a purga que perdeu o lock também não deixa linha** (S-51): não apagou nada. O motivo vai no
  relatório e no log;
- lote que o banco recusa não apaga nem registra (S-85) — e é isso que torna "reexecutar" seguro
  (S-37): o que ficou é exatamente o que não saiu.

### D-20 — a trilha são as duas tabelas

`audit_entries` e `audit_events` nasceram com a mesma trigger e o mesmo piso, e a
[D-08](#d-08--quem-pode-apagar-a-trilha-append-only) deu passagem à purga nas duas. **Decidido:**
a purga varre as duas, com a mesma janela, uma depois da outra, e a falha de uma não impede a
outra (S-87) — uma purga que desiste de tudo porque uma tabela recusou um lote deixa a outra
crescendo por um defeito que não é dela.

Ficam de fora, declarado:

- **`audit_purges`**, pela D-19;
- **`permission_requests`**, que não é trilha — é o estado de um pedido, reescrito ao resolver — e
  não tem trigger nem piso. Crescer para sempre é um problema dela, sem dono ainda, registrado no
  [progresso](progress.md#escopo-reduzido-ou-adiado).

### D-21 — o piso são 2160 horas, não 90 dias de calendário

Nasceu ao começar a F3. A trigger da `0003` e da `0007` compara `OLD.at > now() - interval '90 days'`.
Para `timestamptz`, somar dias é aritmética **de calendário, no fuso da sessão**: numa sessão cujo
fuso tem horário de verão, e numa janela que atravessa a volta do relógio, "90 dias" são 2161
horas. O código conta 90 × 24 h. Com a janela no piso — que é o default —, a purga tentaria apagar
uma faixa de uma hora que o banco considera dentro do piso, e **todo lote daquela faixa falharia**,
todo dia, durante meses por ano, numa instalação cujo PostgreSQL herdou o fuso da máquina.

**Decidido:** a `0010` reescreve as duas funções com `interval '2160 hours'` — aritmética absoluta,
igual em qualquer fuso, e igual ao que o código conta. As triggers não mudam; as migrations já
aplicadas não são editadas. O piso passa a ser **sempre** 90 × 24 h: em sessão UTC nada muda; em
fuso com horário de verão ele deixa de oscilar uma hora para cada lado conforme a data, que é a
oscilação que o código não tinha como acompanhar.

O S-88 prova a fronteira sob um fuso que não é UTC.

### D-22 — o job, o botão de desligar, e o que o comando lê

A D-07 decidiu "job interno, em intervalo configurado, desligável por configuração". Faltavam três
respostas.

- **Quando roda pela primeira vez: um minuto depois do boot**, e dali em diante a cada intervalo.
  Esperar o intervalo inteiro — como o job de aparelhos pendentes faz — significaria que um backend
  reiniciado todo dia, com intervalo de 24 h, nunca purga. Um minuto, e não no boot, porque o boot
  já faz trabalho de banco (as migrations) e porque uma suíte que sobe o app não precisa de uma
  purga no meio do teste.
- **Desligar é o valor literal `off`** em `RC_AUDIT_PURGE_INTERVAL_MS`. `0`, vazio ou a variável
  ausente **derrubam o boot** (S-82): o desligamento que a D-07 quer "por configuração, nunca por
  acidente" não pode ser o resultado de um número digitado errado. O mínimo é um minuto.
- **O comando lê só as variáveis que usa** — `LOG_LEVEL`, `DATABASE_URL` e
  `RC_AUDIT_RETENTION_DAYS` —, validadas pelo **mesmo** schema do boot. `pnpm db purge` não precisa
  de endpoint de push para apagar linha velha, e exigir o ambiente inteiro do backend faria o
  comando falhar pelo motivo errado justo quando o backend está fora do ar.

---

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — a fase depende só do que já está decidido)* | — | — | — | — |

---

## Propagação

Decisão registrada só aqui é decisão que o resto do repositório não conhece. Todas viraram
**regra** no documento normativo correspondente, em 2026-09-16:

| Decisão | Onde virou regra |
|---|---|
| D-01 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa) — a gramática, a validação na criação e a fronteira de token |
| D-01, D-02, D-03 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) — `PermissionRule` com padrão validado, `expiresAt` e `userId` no casamento |
| D-01, D-02 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) — `PERMISSION_RULE_PATTERN_INVALID` e `PERMISSION_RULE_EXPIRY_TOO_LONG` |
| D-02, D-07 | [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada) — teto de validade, piso de retenção e o job |
| D-04 | [web/03-ui-system](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada), [web/02-folder-structure](../../architecture/web/02-folder-structure.md) e [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-regras) — rota própria e os dois pontos de entrada |
| D-05, D-06, D-07 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) — escopo de leitura, ordenação por `seq` e a purga |
| D-06, D-08 | [backend/05-persistence](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) — o sequencial e a trigger com janela |
| **D-06, D-08** | **[F3 do plano 01](../01-live-session/F3-audit.md) (B-22)** — a coluna e a trigger nascem lá, na mesma migration |
| D-12 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão) e o schema `permission-requested` — `pattern` e `lifetimeMs` na sugestão; [backend/03-modules](../../architecture/backend/03-modules.md#permission) — quando os dois escopos são oferecidos (2026-09-24) |
| D-13, D-14 | [web/03-ui-system](../../architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada) e [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) — sete dias, e o segundo passo de todo escopo persistido (2026-09-24) |
| D-19, D-20, D-22 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) — o registro por lote na mesma instrução, as duas trilhas, a porta própria e quando o job roda (2026-09-24) |
| D-19, D-21 | [backend/05-persistence](../../architecture/backend/05-persistence.md#a-trilha-de-auditoria) — `audit_purges`, os índices em `at` e o piso em horas (2026-09-24) |
| D-22 | [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada) — `RC_AUDIT_RETENTION_DAYS`, `RC_AUDIT_PURGE_INTERVAL_MS` e o `off` literal (2026-09-24) |

Uma propagação ficou **pendente por instrução do próprio plano** até a entrega da
[B-18](F3-retention.md): `pnpm db purge` na seção **Comandos** do [README.md](../../../README.md#comandos)
e no [catálogo de scripts](../00-bootstrap/README.md#catálogo-de-scripts) — documentar comando que
ainda não existe é o tipo de documentação que o leitor descobre estar errada ao rodá-la. **Feita em
2026-09-24**, na mesma entrega do comando.

Cenários novos que as decisões criaram, já na [matriz](scenarios.md): **S-47**, **S-48** (D-01),
**S-49** (D-02), **S-50** (D-04), **S-51** (D-07) e **S-52** (D-08).

Nenhuma tarefa nova: todas cabem em tarefa existente. **D-06 e D-08 mudam o plano 01** — as duas
na mesma migration da B-22, e as duas já levadas ao arquivo da fase de lá.

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md).
3. Rode `pnpm plan progress`: o contador sai daqui, no [progresso do plano](progress.md) e no
   [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; o efeito dela no plano vai para o
  [progresso](progress.md).
