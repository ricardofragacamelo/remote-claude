# Plano 01 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão, que é como um plano acaba
construído sobre uma resposta que ninguém deu.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Contrato

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | `session.ping` continua no contrato depois que a sessão real existir? | se algum teste, script ou monitor passa a depender dele como health do WS | B-01 | 2026-09-15 · **manter, fora do namespace de sessão**: vira `diag.ping`/`diag.pong` | ✅ |

### D-01 — o destino da fatia vertical do bootstrap

`session.ping`/`session.pong` foi construído para provar o trilho **sem** o Agent SDK, e é hoje
o teste mais barato do gateway inteiro ([F3 do plano 00](../00-bootstrap/F3-backend.md)).

**Decidido:** fica, renomeado para `diag.ping`/`diag.pong`. O smoke mais barato do WS continua
existindo sem exigir subprocesso do Claude, e o risco que a opção "manter" carregava — virar API
pública sem dono — morre no nome: `diag` diz que é diagnóstico, não sessão.

A renomeação custa nada **agora**, porque a F0 é a fase do contrato e nada foi construído em
cima. Efeito: B-01 registra os dois schemas no namespace novo, e B-43 leva a mudança ao mobile
na mesma entrega — contrato quebrado em uma ponta só é bug.

---

## F1 — Workspace

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-02 | De onde vem a allowlist de raízes: variável de ambiente, arquivo de configuração ou tabela administrável pela UI | se ela muda sem reiniciar o processo, e quem tem permissão de mudá-la | B-08 | 2026-09-15 · **arquivo de configuração**, validado no boot, com recarga explícita | ✅ |
| D-03 | O sistema tem **dono único** ou vários usuários? | se duas pessoas usarão a mesma instalação — hoje não há caso conhecido | B-07, B-09 | 2026-09-15 · **multiusuário desde o dia 1**: `userId` escopa workspace, audit e permission desde a primeira migration | ✅ |
| D-13 | Com vários usuários, quem pode usar qual raiz? | nasceu de D-03: allowlist global com multiusuário anula metade do escopo | B-08, B-09 | 2026-09-15 · **o arquivo declara a raiz e quem a usa** (subject OIDC) | ✅ |

### D-02 — onde mora a allowlist

É a primeira linha de defesa do produto, e onde ela mora decide quem pode ampliá-la.

**Decidido:** arquivo de configuração. Mudar exige acesso ao disco da máquina, como a variável
de ambiente exigiria, e a lista fica legível e comentável quando crescer — que é o caso real com
multiusuário (D-03).

Duas regras herdadas da opção que ele substitui, e que não são opcionais:

- **Falha rápido.** Arquivo ausente, ilegível ou fora do schema derruba o processo no boot, não
  na primeira sessão ([configuração falha rápido](../../architecture/shared/07-repository-layout.md#configuração-e-segredo)).
- **Recarga é explícita.** Nunca um watch silencioso: allowlist que encolhe debaixo de uma sessão
  aberta muda a fronteira de segurança sem ninguém decidir isso.

### D-03 — um dono ou vários

Atravessa `auth`, `workspace` e `audit`: com dono único, `userId` é quase decorativo e a trilha
é da máquina; com vários, cada consulta e cada regra precisam ser escopadas desde o primeiro
dia — e retrofitar escopo depois é caro.

**Decidido:** multiusuário desde o dia 1. É a escolha mais cara das três agora e a única que não
cobra juros depois — trilha de auditoria é append-only, e retrofitar escopo nela seria migration
de dados em tabela que a F3 proíbe reescrever.

Efeitos imediatos, todos na primeira migration: `userId` `NOT NULL` em workspace, audit e
permission; toda query escopada; regra de permissão é sempre de **um** usuário, nunca da máquina.
O [plano 03](../03-rules-and-audit/README.md) e o [05](../05-hardening-operations/README.md)
herdam a resposta em vez de a reabrir.

### D-13 — a raiz e o seu dono

Consequência direta de D-03: allowlist global com vários usuários significa que qualquer pessoa
autenticada alcança toda raiz, e o escopo passaria a existir na trilha e na permissão mas não no
acesso — que é onde ele importa.

**Decidido:** cada entrada do arquivo traz o caminho **e** a lista de usuários autorizados
(subject OIDC). Mantém a defesa inteira no disco, como D-02 decidiu, sem reintroduzir a tabela
administrável que D-02 rejeitou.

Raiz que existe mas não é do usuário responde **404, não 403** — 403 confirma a existência de um
caminho que o usuário não deveria saber que existe.

---

## F2 — Runtime da sessão

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-04 | Como o Agent SDK é fakeado no teste: fake roteirizado nosso, ou o CLI real guiado por script | quanto do comportamento o fake precisa reproduzir para a cobertura ser honesta | B-12 | 2026-09-15 · **fake nosso, com roteiros gravados do SDK real** — exige um gravador de fixtures (B-12b) | ✅ |
| D-05 | Qual o limite de sessões simultâneas configurado por default | RAM típica da máquina alvo; a derivação automática é o [plano 05](../05-hardening-operations/F0-limits.md) | B-17 | 2026-09-15 · **10 sessões** (~2,2 GB, ~222 MB × 10) | ✅ |

### D-04 — o fake, e o que ele pode mentir

Sem fake não há integração determinística nem e2e; com um fake otimista demais, toda a suíte
passa a provar que **o fake** funciona. Ver [R-02](README.md#riscos-e-decisões-em-aberto).

**Decidido:** fake roteirizado nosso — rápido, controlável, sem cota nem rede —, mas os roteiros
**não são escritos à mão**: são capturados de execuções reais do SDK e commitados como fixtures,
inclusive o `6 tool calls → 6 hooks → 2 canUseTool` medido no spike.

Ataca o R-02 na raiz: o fake não pode ser otimista a respeito de um stream que ele não inventou.
O `smoke-live` (B-41) continua sendo quem confronta a escolha com a realidade, agora como segunda
linha e não como única.

**Tarefa que esta decisão cria:** o gravador de fixtures, que hoje não existe no plano. Entra
como **B-12b** na F2, antes de B-12 poder fechar.

### D-05 — o teto por default

**Decidido:** 10 sessões. O spike mediu ~222 MB e exatamente 1 processo por sessão, crescimento
linear ([descoberta §8.5](../../discovery/01-descoberta-claude-agent-sdk.md)) — o default assume
uma máquina alvo folgada.

É número **configurado**, então o risco é reversível; o que ele deixa de ser é teórico. O cenário
**limite atingido** (11ª sessão recusada, com erro traduzido e sem subprocesso órfão) passa a ser
obrigatório na F2, não um caso de borda improvável. Derivar o limite da RAM continua sendo o
[plano 05](../05-hardening-operations/F0-limits.md).

---

## F3 — Auditoria

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-06 | Como o append-only é garantido no banco: papel sem `UPDATE`/`DELETE`, trigger, ou os dois | o que o setup de migration e o usuário do CI permitem (o teste precisa ver a recusa) | B-22 | 2026-09-15 · **trigger na tabela**; a aplicação segue com o papel que já tem, sem papel restrito e sem segunda conexão | ✅ |
| D-07 | Falha de escrita da auditoria bloqueia a autorização — e **também** encerra a sessão? | se uma sessão parada com o banco fora é mais segura ou só mais confusa | B-24 | 2026-09-15 · **nega sempre; encerra na segunda falha consecutiva**, com motivo explícito | ✅ |

### D-06 — append-only de verdade

A regra é que nem o próprio sistema reescreva a trilha
([backend/03](../../architecture/backend/03-modules.md#audit)).

**Decidido:** trigger na tabela de auditoria — `UPDATE` e `DELETE` abortam para **quem quer que**
esteja conectado. Nenhum papel novo, nenhuma segunda string de conexão, nenhuma mudança na
configuração do backend: a aplicação continua conectando com o papel que já usa.

O que a decisão aceita conscientemente: trigger é barreira, não permissão. Quem tem o papel de
owner — que é o nosso caso — pode desligá-la com um comando. Ela impede o acidente e o bug, não
o ato deliberado de quem já controla o banco.

O gap prático do enunciado está fechado: S-43 e S-44 conseguem ver a recusa conectando como
qualquer papel, sem depender de o CI conseguir criar um papel restrito.

### D-07 — banco fora, sessão viva?

**Decidido:** a falha de escrita **sempre** bloqueia a autorização — sem trilha, não autoriza,
como manda o [catálogo](../../architecture/backend/03-modules.md#audit). Sobre encerrar:

- **primeira falha** → nega a tool, `error` no log, evento de erro na UI, sessão viva. Um blip de
  rede ou um restart de container em dev não derruba o trabalho de ninguém;
- **segunda falha consecutiva** → encerra a sessão com motivo explícito.

Evita os dois extremos que o gap levantava: a sessão zumbi (parece viva, nenhuma tool passa, o
usuário fica tentando) e a morte por soluço. Cenário obrigatório na F3: as duas falhas seguidas,
e o contador zerando quando uma escrita volta a passar.

---

## F4 — Permissão

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-08 | Quem classifica o `riskHint`, e com qual regra: lista por tool, heurística sobre o input, ou os dois | quais comandos precisam ser marcados como destrutivos para o destaque valer algo | B-30 | 2026-09-15 · **lista por tool + heurística sobre o input, falhando fechado** | ✅ |
| D-09 | O timeout de 120 s é por pedido; o usuário pode estendê-lo pela UI? | com que frequência 120 s é pouco na prática — não há uso medido ainda | B-27 | 2026-09-15 · **sim, com valor e teto configuráveis** — o comando nasce na **F0** | ✅ |

### D-08 — classificar risco sem mentir

`riskHint` existe para a UI destacar o que é perigoso, e o caso que importa é `Bash`: um falso
negativo aqui é um `rm -rf` com a mesma aparência de um `ls`.

**Decidido:** os dois, com uma regra que fecha o furo — a lista por tool dá o piso previsível, a
heurística sobre o input trata o `Bash`, e **comando que a heurística não reconhece é marcado
como destrutivo**, não como seguro. Falso positivo incomoda; falso negativo é o acidente.

Seja qual for, ela é **derivada no backend** — as duas pontas não podem divergir.

### D-09 — estender o que já é o único timeout

O CLI não impõe timeout próprio: permissão ficou 150 s pendurada sem que nada desistisse
([descoberta §8.4](../../discovery/01-descoberta-claude-agent-sdk.md)). O nosso é o único que
existe, e por isso mexer nele é mexer na única proteção contra sessão pendurada.

**Decidido:** existe extensão pela UI, com **valor e teto vindos de configuração** — o contrato
carrega só o comando, e o operador decide os números.

Duas consequências que mudam o plano:

1. **O comando novo nasce na F0**, junto com o resto do contrato, e não na F4 — contrato alterado
   no meio do plano é quebra, e o mobile (B-43) precisa vê-lo na mesma entrega.
2. **Cada cenário fixa o valor** que usa, ou deixa de ser determinístico. A F4 ganha os casos de
   concorrência: estender que chega depois do deny, teto atingido, e duas pontas (web e celular)
   estendendo o mesmo pedido.

---

## F5 — Web da sessão

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-10 | O que a UI mostra ao abrir `/sessions/:id` de uma sessão já encerrada | depende do histórico, que só existe no [plano 04](../04-transcript-and-resume/README.md) | B-34 | 2026-09-15 · **replay do que o ring buffer ainda tiver**, rotulado como parcial | ✅ |

### D-10 — abrir o que já acabou

**Decidido:** a UI mostra o estado terminal (motivo, hora) **e** faz replay do que o ring buffer
ainda tiver. Duas exigências que a decisão cria, e sem as quais ela não se sustenta:

- **o buffer sobrevive ao encerramento** — até o restart do processo ou até o ring reciclar;
- **o conteúdo é rotulado como parcial** na UI. Sem o rótulo, ausência de conteúdo é lida como
  ausência de atividade, que é pior do que não mostrar nada.

Os cenários da F5 passam a ter **dois ramos**: buffer presente e buffer perdido. O segundo não é
caso de borda — é o que acontece depois de todo restart do backend.

O histórico de verdade continua sendo o [plano 04](../04-transcript-and-resume/README.md).

---

## F6 — E2E e smoke-live

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-11 | **Um `allow` de projeto volta a dispensar o `canUseTool` em diretório já confiado?** | só um spike responde: marcar `hasTrustDialogAccepted` no CLI interativo e repetir a medição | B-42, e toda sessão real | 2026-09-15 · **spike agendado para antes da F0**, e a mitigação é adotada de qualquer forma. A resposta técnica continua **não medida** | 🔄 |
| D-12 | Onde o `smoke-live` roda, contra qual workspace descartável, e quem paga a execução | custo por execução e a máquina que terá o Claude logado no nightly | B-41 | 2026-09-15 · **sob demanda, sem nightly** — R-02 fica mitigado por disciplina | ✅ |

### D-11 — o furo que invalidaria o produto

**É a decisão mais importante deste plano, e é técnica: só um spike responde.** Está aberta
desde o bootstrap ([R-01](README.md#riscos-e-decisões-em-aberto)), e a
[descoberta §8.2](../../discovery/01-descoberta-claude-agent-sdk.md#82--a-assimetria-allow-vs-deny-entre-escopos)
diz o que se sabe: `deny` de projeto é aplicado, `allow` de projeto **não** dispensa o
`canUseTool` — em diretório **não** confiado.

Se em diretório confiado o `allow` passar a valer, toda a aprovação humana escapa em silêncio.

**Decidido — o quando, não o quê:**

- o spike roda **antes da F0**, não em B-42. Descobrir um furo de premissa depois da F4 pronta
  custa o plano inteiro; o spike custa um diretório descartável, um backup do `~/.claude.json` e
  a restauração no fim;
- **a mitigação é adotada de qualquer forma** — o backend limpa ou recusa a marca de confiança
  antes de abrir sessão. A medição decide apenas se ela é obrigatória ou redundante, nunca se
  ela existe.

A linha continua 🔄 porque o que está decidido é a agenda: o resultado da medição entra aqui
quando o spike rodar, e é ele que fecha o R-01.

### D-12 — onde o smoke-live roda

**Decidido:** sob demanda, sem nightly. `pnpm test:e2e:live` continua nascendo na F6 e continua
fora do portão de PR; o que não existe é agendamento — sem credencial do Claude em CI e sem
máquina ligada à noite.

O preço, registrado para não ser esquecido: o R-02 (o fake divergir do SDK real) passa a ser
mitigado por **disciplina**, não por automação. Rodar o `smoke-live` vira item explícito do
Definition of Done de qualquer mudança em `adapter/outbound/claude/` — se não estiver escrito lá,
não acontece.

---

## Propagação pendente

Decisão registrada só aqui é decisão que o resto do repositório não conhece. Estas ainda **não**
foram levadas ao documento normativo:

| Decisão | Documento a atualizar |
|---|---|
| D-01, D-09 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) — `diag.*` e o comando de extensão |
| D-03, D-13 | [backend/03-modules](../../architecture/backend/03-modules.md) (`workspace`, escopo por usuário) e [08-authentication](../../architecture/shared/08-authentication.md) |
| D-02, D-13 | [07-repository-layout](../../architecture/shared/07-repository-layout.md#configuração-e-segredo) — o arquivo de allowlist e o seu schema |
| D-06, D-07 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) e [backend/05-persistence](../../architecture/backend/05-persistence.md) |
| D-04, D-12 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) — fixtures gravadas e `smoke-live` sob demanda |
| D-05, D-08, D-10 | as fases correspondentes ([F2](F2-session-runtime.md), [F4](F4-permission.md), [F5](F5-web-session.md)) e a [matriz de cenários](scenarios.md) |

Tarefas novas que as decisões criaram, e que ainda não estão nas fases: **B-12b** (gravador de
fixtures do SDK, F2) e o **spike de D-11** (antes da F0).

---

## Ao decidir

1. Marque a linha com ✅ e preencha **Resultado**: a data, a escolha e o que ela muda.
2. Atualize o documento normativo correspondente — ou abra uma
   [ADR](../../architecture/shared/00-decisions.md), quando a decisão muda uma escolha de
   arquitetura. Decisão registrada só aqui é decisão que o resto do repositório não conhece.
3. Rode `pnpm plan progress`: o contador desta tabela sai daqui, no
   [progresso do plano](progress.md) e no [progresso geral](../progress.md).
4. Decisão que **bloqueia** fase sai da tabela de bloqueios do
   [progresso geral](../progress.md) no mesmo momento.

## Convenções

- `D-nn` é sequencial **no plano inteiro** e nunca é reaproveitado — decisão descartada mantém
  o número, com o motivo em **Resultado**.
- Fase sem decisão em aberto **diz isso**, com uma linha própria. Silêncio não é ausência.
- Decisão descoberta durante a execução entra aqui; a mudança que ela causou no plano vai para o
  [progresso](progress.md). Uma é a escolha, a outra é o efeito.
