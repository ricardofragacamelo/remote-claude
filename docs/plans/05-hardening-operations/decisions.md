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
| D-06 | Quais escopos e claims são exigidos, e se a autorização local usa papel próprio | quantas pessoas usarão — depende de [D-03 do plano 01](../01-live-session/decisions.md) | B-12 | — | 🔲 |

### D-05 — o provedor real

É o [R-01](README.md#riscos-e-decisões-em-aberto) e bloqueia a fase. O que **não** está em
discussão: nenhum código conhece o nome dele, e o teste automatizado continua falando com o
Keycloak local — teste que depende de tenant externo é flaky e acopla o CI a um fornecedor
([08-authentication](../../architecture/shared/08-authentication.md#testes)).

---

## F3 — Portões

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| D-07 | SonarQube hospedado por nós ou SonarCloud, e quem administra o quality gate | custo e quem cuida — hoje ninguém levantou a infraestrutura | B-17 | — | 🔲 |
| D-08 | O runner do e2e mobile: máquina dedicada, CI hospedado com virtualização, ou segue só local | custo por execução, medido na primeira rodada | B-18 | — | 🔲 |

### D-08 — onde o emulador cabe

A decisão de que o e2e mobile **não bloqueia merge** não muda ([R-07 do bootstrap](../00-bootstrap/README.md#riscos-e-decisões-em-aberto)).
O que se decide aqui é se ele passa a rodar em algum lugar sem depender de alguém lembrar — e
enquanto não houver runner, a ausência fica **declarada**, não fingida de verde.

---

## F4 — E2E

| ID | Decisão | Gap — o que falta saber | Bloqueia | Resultado | Estado |
|---|---|---|---|---|---|
| — | *(nenhuma decisão em aberto — a fase depende só do que já está decidido)* | — | — | — | — |

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
