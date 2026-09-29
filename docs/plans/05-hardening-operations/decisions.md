# Plano 05 — Decisões em aberto e gaps

Toda decisão que este plano ainda não tomou, e todo gap que impede tomá-la. Existe para
**facilitar a decisão** — e para que nenhuma seja tomada por omissão.

Plano: [README.md](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Estado:** 🔲 aberta · 🔄 em análise · ✅ decidida · ⛔ travada por terceiro

Decisão em aberto **não** impede planejar; impede **começar a fase** que depende dela.

---

## F0 — Limites

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-01 | A fórmula do limite por RAM: fração da memória livre ou da total, com que piso e que teto | os ~222 MB por sessão foram medidos em **uma** máquina só | B-01 | 2026-09-26 · **fração da RAM total, no boot**: `floor(RAM × 50 % / 256 MB)`, piso 1, teto `RC_SESSION_MAX_CONCURRENT`; o limite do cgroup, quando existe, vale como RAM. Fração e MB por sessão configuráveis | ✅ |
| D-02 | Qual o TTL da sessão ociosa, e o que conta como ociosa | quanto tempo alguém deixa uma sessão parada e ainda a quer viva | B-02 | 2026-09-26 · **30 min sem atividade**, contados do último evento do Claude ou da última ação humana; turno rodando ou permissão pendente nunca é ociosa; cliente anexado **não** segura a sessão — ela se retoma pela história (plano 04) | ✅ |
| D-09 | A política de nova tentativa do push: quantas, com que recuo, e quais `failed` são transitórios | o `PushSender` devolve um `failed` só, e hoje não distingue rede, `5xx` e `4xx` do provedor | B-25 | 2026-09-26 · **3 tentativas** (1 + 2), recuo exponencial 1 s → 4 s com jitter, `Retry-After` manda, nunca passa do `expiresAt`. O `PushSender` separa `failed` (transitório: rede, `408`, `429`, `5xx`, `401`) de `rejected` (demais `4xx`), e só o transitório é repetido | ✅ |

### D-02 — o que é ociosidade

Um ponto não é negociável: **esperar permissão não é ociosidade** — encerrar ali mataria
exatamente o fluxo que o produto existe para servir (S-05). O que falta é o prazo, e se ele
conta do último evento ou da última ação humana.

### D-09 — quando tentar de novo

Nasceu do ciclo 32 do [plano 02](../02-mobile-approval/progress.md): uma falha pontual do provedor
perdeu a notificação. O que **não** está em discussão: `tokenRejected` continua permanente
([D-13 do plano 02](../02-mobile-approval/decisions.md#d-13--o-token-que-morre-calado)), e
nenhuma tentativa passa do prazo do pedido. O que falta é o número, o recuo, e se o `PushSender`
passa a separar falha transitória (rede, `429`, `5xx`) de recusa definitiva do provedor (`4xx`),
que tentar de novo não resolve.

---

## F1 — Diagnóstico (nascida "Logs do cliente")

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-03 | Onde os logs do cliente são gravados e por quanto tempo: arquivo, tabela, ou só stdout | volume real, e se alguém vai consultá-los depois | B-08 | 2026-09-26 · stdout do backend. **Descartada em 2026-09-27**: o envio de log do cliente saiu do escopo, e com ele a pergunta — ver [progresso](progress.md#escopo-reduzido-ou-adiado) | ✅ |
| D-04 | O endpoint de ingestão exige autenticação sempre? | erro que acontece **antes** do login não teria como ser reportado | B-08 | 2026-09-26 · autenticado, com um caminho anônimo restrito. **Descartada em 2026-09-27**, junto com o endpoint que ela regia | ✅ |

### D-04 — o log de quem ainda não entrou

Exigir credencial é o default correto e cega justamente a falha de login — que é a que mais
aparece no bootstrap. Um caminho anônimo precisa de rate limit agressivo e de um payload mínimo,
ou vira porta de escrita para qualquer um que alcance a máquina.

---

## F2 — Identidade

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-05 | **Qual provedor OIDC real**: tenant, audience e quem administra | conta, custo, e quem responde quando alguém perde o acesso | B-12, e a F2 inteira | 2026-09-26 · **Keycloak próprio**, hospedado junto da instalação e administrado por quem a opera — decisão do usuário; emenda na ADR-010 (o Auth0 deixa de ser o alvo); o código, agnóstico, não muda | ✅ |
| D-12 | O que fazer com a aba que apresenta o refresh token antigo logo **depois** que a rotação terminou | achado no ciclo 19: sob carga, uma renovação que saiu do navegador antes da resposta da rotação chegou ao backend depois dela — o provedor viu reuso, revogou a família e todas as abas saíram. O single-flight só cobre quem chega **durante** a rotação | B-13 | 2026-09-27 · **janela de graça de 10 s**, decisão do usuário: a rotação bem-sucedida continua respondendo o token que substituiu por 10 s, sem nova chamada ao provedor; recusa nunca é lembrada. O preço, dito: uma cópia roubada do token antigo, usada nesses 10 s, recebe a sessão já emitida sem disparar a detecção de reuso. Alternativas descartadas: coordenar as abas no web (mais código, e não cobre janelas que não compartilham o lock) e manter estrito (a aba atrasada derruba a sessão) | ✅ |
| D-06 | Quais escopos e claims são exigidos, e se a autorização local usa papel próprio | quantas pessoas usarão — depende de [D-03 do plano 01](../01-live-session/decisions.md) | B-12 | 2026-09-27 · **claims mínimas, sem papel**: escopos `openid profile email` (mais `offline_access` nos clientes, para o refresh); o token precisa de `sub`, `email` e `email_verified: true`, com `iss` e `aud` validados. Nenhuma role ou grupo do provedor é lida; a autorização continua **toda** local (a raiz declara quem a usa, a regra é de um usuário). Papel próprio fica para quando houver um caso que o exija | ✅ |

### D-05 — o provedor real

É o [R-01](README.md#riscos-e-decisões-em-aberto) e bloqueia a fase. O que **não** está em
discussão: nenhum código conhece o nome dele, e o teste automatizado continua falando com o
Keycloak local — teste que depende de tenant externo é flaky e acopla o CI a um fornecedor
([08-authentication](../../architecture/shared/08-authentication.md#testes)).

---

## F3 — Portões

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | SonarQube hospedado por nós ou SonarCloud, e quem administra o quality gate | custo e quem cuida — hoje ninguém levantou a infraestrutura | B-17 | 2026-09-27 · **adiado — sem Sonar por ora**, decisão do usuário. O portão 12 fica **declarado ausente**, não fingido de verde; B-17 e S-36 saem da F3 ([progresso](progress.md#escopo-reduzido-ou-adiado)). Consequência dita: complexidade ficaria sem portão — coberta pela [D-10](#d-10--complexidade-sem-o-sonar); duplicação segue no `jscpd`, hotspot em parte no `semgrep` | ✅ |
| D-10 | Com o Sonar adiado, quem mede complexidade, e com que limite | quantas funções de hoje passam de cada limiar: acima de 10, 27 (backend 6, web 5, scripts 13, contracts 1, mobile 2); acima de 15, 5; acima de 20, 1 | B-28 | 2026-09-27 · **complexidade ciclomática ≤ 10 por função, nas três pontas e nos scripts**, decisão do usuário: `complexity` do ESLint e a métrica `cyclomatic-complexity` do `dart_code_linter`, as duas no portão 2 (`pnpm lint`). As 27 funções de hoje são refatoradas, não suprimidas | ✅ |
| D-11 | Onde o `smoke-live` da B-19 roda: nightly num runner hospedado (com a credencial do Claude num secret), num runner próprio, ou segue sob demanda | a B-19 pedia nightly, e a [D-12 do plano 01](../01-live-session/decisions.md) — "sob demanda, sem nightly, sem credencial do Claude no CI" — dizia o contrário: conflito entre documentos, levado ao usuário | B-19 | 2026-09-27 · **segue sob demanda**, decisão do usuário: a D-12 do plano 01 fica. Nenhum workflow agendado, nenhuma credencial do Claude no GitHub. A B-19 vira o **relatório** — `pnpm test:e2e:live:report` roda a suíte e, se ela falhar, abre issue (ou comenta na aberta) — e S-37, S-38 e S-40 passam a falar de execução, não de nightly | ✅ |
| D-08 | O runner do e2e mobile: máquina dedicada, CI hospedado com virtualização, ou segue só local | custo por execução, medido na primeira rodada | B-18 | 2026-09-27 · **segue só local, declarado**, decisão do usuário: `pnpm test:e2e:mobile` (e o `run-e2e-local`, que já cuida do emulador) continua sendo onde ele roda; nenhum job de CI. B-18 sai da F3; S-40, que é sobre jobs de CI simultâneos e não sobre o emulador, passa para B-19 | ✅ |

### D-10 — complexidade sem o Sonar

Nasceu da D-07: sem o Sonar, nenhum portão media complexidade. O limite é o padrão do Sonar para
complexidade de função (10), que é o alvo que o portão substitui; valor igual ao limite passa,
acima dele reprova, nas duas ferramentas.

Por que o `dart_code_linter` e não o `solid_lints`: o `solid_lints` exige `analyzer ^14.1` e o
`import_lint` 2.0.0, já em uso, exige `^12.1` — os plugins do analyzer são resolvidos juntos, e o
`dart analyze` recusa subir os dois. O `dart_code_linter` aceita as duas faixas. A métrica dele
roda pela CLI (`dart run dart_code_linter:metrics`), que sai 2 quando alguma função passa do
limite — o plugin só registra regras, não métricas.

No Dart, só `lib/` é medido: a métrica soma as closures à função que as contém, e o `main` de um
arquivo de teste (um `test(...)` é uma closure) cresceria a cada teste escrito — o limite puniria
escrever teste. O ESLint conta cada função à parte, e por isso os testes do backend, do web e dos
scripts continuam medidos.

### D-11 — o smoke-live continua sob demanda

Nasceu da execução da F3: a B-19 dizia "nightly que abre issue", e a D-12 do plano 01 dizia "sem
nightly", pelo motivo que continua valendo — não há credencial do Claude no CI, e pôr uma lá é pôr
o token da conta de alguém num secret de repositório. O que a B-19 queria de verdade era que a
falha **não se perdesse**; isso não depende de agendamento. Fica o relatório por issue, rodado à
mão; o agendamento, se um dia vier, é uma decisão nova sobre onde mora aquela credencial.

### D-08 — onde o emulador cabe

A decisão de que o e2e mobile **não bloqueia merge** não muda ([R-07 do bootstrap](../00-bootstrap/README.md#riscos-e-decisões-em-aberto)).
O que se decide aqui é se ele passa a rodar em algum lugar sem depender de alguém lembrar — e
enquanto não houver runner, a ausência fica **declarada**, não fingida de verde.

---

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-13 | Onde os limites apertados vivem no e2e: na stack principal, numa segunda execução inteira, ou numa segunda dupla backend + web da mesma execução | os números que os cenários de limite pedem (teto de 2, TTL de segundos, 20 frames/s) são o oposto dos que as outras specs pedem | B-21…B-23 | 2026-09-28 · **segunda dupla backend + web na mesma execução**, sobre o mesmo Postgres e o mesmo Keycloak (`LIMITS_STACK`), decidida na execução. Custa um boot de backend e um build de web (~2 s); a stack principal não muda. Descartadas: apertar a principal (TTL curto encerraria sessões de specs que param; 20/s faria três cenários levarem um minuto cada) e uma segunda execução (mais um Postgres e um Keycloak por nada) | ✅ |
| D-14 | O que a tela faz com o `Retry-After` de uma recusa por teto (`SESSION_LIMIT_REACHED`, 30 s) | a vaga pode liberar a qualquer momento — alguém encerra uma sessão — e ninguém anuncia isso a quem foi recusado | B-22 | 2026-09-28 · **mostra a recusa, traduzida, e libera o botão; não tenta de novo sozinha e não trava o botão pelos 30 s**, decidida na execução. Tentar sozinha é martelar; travar 30 s puniria justamente quem acabou de encerrar uma sessão para abrir outra (S-78). O `Retry-After` que o cliente **respeita** é o do ritmo (`4429`), que o servidor impõe | ✅ |

### D-13 — uma stack para os limites

Os cenários da F4 são sobre os limites **eles mesmos**, e precisam de números que o resto da suíte
não suporta. Na mesma execução, a segunda dupla herda tudo da efêmera — portas próprias, pastas
próprias, mesma base e mesmo provedor — e só aperta os cinco limites. A execução `--live` não a
sobe: a suíte dela é sobre o Claude real.

### D-14 — o `Retry-After` do teto não trava a tela

Há dois `Retry-After` no produto, e eles não pedem a mesma coisa. O do **ritmo** (`RATE_LIMITED`,
`4429`) é o servidor dizendo "pare": o cliente espera, e a tela diz que está esperando (S-43). O do
**teto** é uma estimativa de quando uma vaga pode abrir: a tela diz o motivo e deixa a próxima
tentativa com a pessoa, que é quem sabe se acabou de encerrar uma sessão.

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
