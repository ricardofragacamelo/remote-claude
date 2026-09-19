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

---

## F1 — Telas de regra

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Onde a lista de regras mora na UI: tela própria, ou seção dentro das configurações | quantas regras um usuário terá | B-07 | 2026-09-16 · **tela própria nas duas pontas**, alcançável por link direto da aprovação e da trilha | ✅ |

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

---

## F2 — Consulta da trilha

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | A trilha é escopada por usuário ou pela máquina | mesma dependência de [D-03 do plano 01](../01-live-session/decisions.md) | B-12 | 2026-09-16 · **por usuário** — mesma herança da D-03 | ✅ |
| D-06 | Qual a ordenação estável da paginação por cursor: `(at, id)` ou um sequencial próprio | se o relógio pode voltar atrás na máquina do usuário | B-11 | 2026-09-16 · **sequencial próprio (`seq`), keyset descendente**; `at` só filtra | ✅ |

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

---

## F3 — Retenção

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | Quem dispara a purga: agendador do SO, job do backend, ou comando manual | como o produto é instalado — o que só se decide no [plano 06](../06-distribution/README.md) | B-18 | 2026-09-16 · **job interno do backend**, com lock; o subcomando do `db.mjs` é o mesmo código, disparado à mão | ✅ |
| D-08 | A trigger append-only do [plano 01](../01-live-session/decisions.md#d-06--append-only-de-verdade) aborta todo `DELETE`. Como a purga apaga? | descoberta ao propagar a D-07: os dois documentos se contradizem, e do jeito que estão a purga não roda | B-17, B-19 | 2026-09-16 · **a trigger passa a barrar `DELETE` só dentro do piso de 90 dias**; `UPDATE` continua sempre abortado | ✅ |

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

Uma propagação segue **pendente por instrução do próprio plano**: `pnpm db purge` entra na seção
**Comandos** do [README.md](../../../README.md#comandos) e no
[catálogo de scripts](../00-bootstrap/README.md#catálogo-de-scripts) na entrega da
[B-18](F3-retention.md), não antes — documentar comando que ainda não existe é o tipo de
documentação que o leitor descobre estar errada ao rodá-la.

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
