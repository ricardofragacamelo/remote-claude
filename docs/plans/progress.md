# Planos — progresso geral

O [índice](README.md) diz **quais** planos existem e qual é o formato. Este arquivo diz **em que
pé o projeto está**, somando todos eles.

Cada plano tem o seu próprio `progress.md`, que é o diário daquele trabalho. Este é o de cima:
uma linha por plano, e o total. Ele não substitui nenhum — responde a outra pergunta.

Os **contadores** — barras, linha de cada plano e total — são gerados por `pnpm plan progress`,
lidos dos arquivos de fase e das matrizes de cenário de **todos** os planos. O resto é escrito
à mão, e o comando não toca nele.

---

## Panorama

**Última atualização:** 2026-09-25

```
00-bootstrap             ████████████████████ 100%   ✅ concluído
01-live-session          ████████████████████ 100%   ✅ concluído
02-mobile-approval       ████████████████████ 100%   ✅ concluído
03-rules-and-audit       ████████████████████ 100%   ✅ concluído
04-transcript-and-resume ████░░░░░░░░░░░░░░░░  20%   🔄 em andamento
05-hardening-operations  ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
06-distribution          ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
```

---

## Por plano

Fases concluídas · tarefas concluídas · cenários passando · decisões tomadas.

| Plano | Fases | Tarefas | Cenários | Decisões | Estado |
|---|---|---|---|---|---|
| [00 — Bootstrap](00-bootstrap/README.md) | 8/8 | 52/52 | 118/119 | 5/6 | ✅ |
| [01 — Sessão viva](01-live-session/README.md) | 7/7 | 47/47 | 105/108 | 17/17 | ✅ |
| [02 — Aprovação pelo celular](02-mobile-approval/README.md) | 5/5 | 34/34 | 89/89 | 25/26 | ✅ |
| [03 — Regras e trilha](03-rules-and-audit/README.md) | 5/5 | 23/23 | 92/92 | 22/22 | ✅ |
| [04 — Histórico e retomada](04-transcript-and-resume/README.md) | 1/6 | 5/25 | 22/74 | 7/7 | 🔄 |
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | 0/5 | 0/25 | 0/53 | 0/9 | 🔲 |
| [06 — Distribuição](06-distribution/README.md) | 0/4 | 0/19 | 0/38 | 0/7 | 🔲 |
| **Total** | **26/40** | **161/225** | **426/573** | **76/94** | 🔄 |

Legenda: 🔲 não iniciado · 🔄 em andamento · ✅ concluído · ⛔ bloqueado

---

## Onde o projeto está

**O produto conversa com o Claude, e nenhuma tool sensível roda sem um humano dizer sim.**

O [plano 01](01-live-session/README.md) fechou em 2026-09-19: uma `query()` do Agent SDK roda de
verdade na máquina, o stream chega ao web como eventos do nosso contrato, **toda** invocação de
tool é gravada numa trilha que o próprio banco recusa reescrever, uma tool sensível **bloqueia o
loop do agente** até um humano responder — com o silêncio negando, porque o nosso prazo é o único
que existe —, existe a tela onde esse humano responde, e os nove cenários obrigatórios alcançáveis
por este plano rodam em todo PR.

O [plano 02](02-mobile-approval/README.md) está em andamento: **um aparelho já prova de onde
vem**. A F0 fechou em 2026-09-19 nas três pontas — registro, aprovação a partir do navegador,
revogação que alcança o socket aberto com `4401`, e o pendente que ninguém aprovou saindo da
lista. A metade backend da F1 fechou junto: o módulo `notification` decide a quem contar e
quando, o adapter fala com um provedor cujo nome não existe fora da configuração, e o payload
carrega três campos e nenhum output de comando.

Em 2026-09-20 a **F2 fechou**: o celular acompanha uma sessão viva — o socket com o conjunto
completo de comandos, as três regras do stream, a lista de pastas de onde uma sessão nasce e a
tela da sessão com os quatro estados, `detach` obrigatório e nada de string literal. Na F1,
B-31 e B-32 fecharam junto: o token que o sistema operacional troca se reenvia sozinho, e quando
a notificação **não** vai chegar o app diz isso — com palavras diferentes para "você negou" e
para "esta versão não recebe".

Em 2026-09-23 a **F1 fechou**: o transporte de push da plataforma, a parte de B-13 que por
[D-21](02-mobile-approval/decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart)
vive em `android/` e nunca no Dart, passou a existir. O arquivo de credencial é de quem opera, e
sem ele o build compila e o app diz que não recebe notificação.

Em 2026-09-24 **F3 e F4 fecharam**, e com elas o plano: o celular responde permissão com o comando
inteiro na tela, dois passos para o destrutivo, biometria e revalidação no servidor ao abrir pela
notificação; os cenários de duas pontas rodam em todo PR, e o `integration_test` do app passou no
emulador fixado. A entrega real do push e o diálogo do SO estão provados numa variante opt-in, que sai da
máquina; a suíte padrão continua hermética. O próximo é o [plano 03](03-rules-and-audit/README.md).

Ainda em 2026-09-24 a **F0 do [plano 03](03-rules-and-audit/README.md) fechou**: quem aprovou
"neste projeto" ou "sempre" não é perguntado de novo — a regra responde antes de qualquer card ou
push, e toda tela vê que ela agiu. A regra é de uma pessoa, expira, e revogar vale na próxima
invocação da sessão já aberta; por isso ela **não** é devolvida ao SDK
([D-09](03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade)). Por enquanto
a regra se vê e se revoga pela API; as telas são a F1.

Ainda em 2026-09-24 a **F1 do plano 03 fechou**: o que foi autorizado antes se vê e se retira
nas duas pontas — `/rules` no web e a tela de regras no app, com escopo, padrão, autor, data e
validade, aviso a menos de sete dias, a expirada marcada e revogar a um toque. A pergunta passou a
oferecer "não perguntar de novo" **com** a regra que deixaria — padrão e validade vêm do servidor
([D-12](03-rules-and-audit/decisions.md#d-12--o-alcance-vem-na-pergunta)) —, e escolher `project`
ou `always` pede sempre um segundo passo que diz o alcance por extenso. O próximo é a trilha (F2).

Ainda em 2026-09-24 a **F2 do plano 03 fechou**: "o que rodou na minha máquina sem me perguntar?"
tem resposta. `GET /audit-entries` pagina a trilha por cursor sobre `seq`, com filtro por sessão,
tool, decisão e período, sobre os índices que o plano de execução confirma; `/audit` no web mostra
cada entrada com o `input` exato e diz em palavras quem a deixou rodar. A entrada de decisão passou
a gravar o próprio veredito — pedido, regra, `auto`, quem e de onde
([D-15](03-rules-and-audit/decisions.md#d-15--a-correlação-nasce-com-a-entrada)) — e o `traceId` do
turno ([D-16](03-rules-and-audit/decisions.md#d-16--o-traceid-é-o-do-turno)); da entrada se abre a
regra, inclusive revogada. O próximo é a retenção (F3).

Ainda em 2026-09-24 a **F3 do plano 03 fechou**: a trilha guarda no mínimo 90 dias, e o que passa
disso sai por uma purga que se registra. O backend purga sozinho — um minuto depois do boot e
depois a cada intervalo, desligável só com `off` — e `pnpm db purge` é a mesma rotina à mão, sob o
mesmo advisory lock. Cada lote é apagado **e** registrado em `audit_purges` pela mesma instrução
([D-19](03-rules-and-audit/decisions.md#d-19--a-purga-se-registra-na-mesma-instrução-que-apaga)),
as duas trilhas são varridas de forma independente
([D-20](03-rules-and-audit/decisions.md#d-20--a-trilha-são-as-duas-tabelas)), e o piso da trigger
passou a 2160 horas, igual em qualquer fuso
([D-21](03-rules-and-audit/decisions.md#d-21--o-piso-são-2160-horas-não-90-dias-de-calendário)).
O próximo é o e2e do ciclo da regra (F4).

Ainda em 2026-09-24 a **F4 fechou, e com ela o [plano 03](03-rules-and-audit/README.md)**: o ciclo da
regra está provado pela porta do usuário — conceder "não perguntar de novo", a escrita seguinte
rodar sem ninguém ser perguntado (numa **outra** sessão, para não confundir com regra de sessão),
a trilha mostrar essa escrita ligada à regra, revogar pela tela e a sessão já aberta voltar a
perguntar. A regra concedida no celular vale para a sessão do navegador, pelo contrato e pelas
telas do app. Escrever os cenários achou três defeitos: duas revogações simultâneas gravavam duas
vezes na trilha e respondiam instantes diferentes; o link de uma trilha filtrada perdia o filtro
no login; e o app chamava toda resolução automática de "regra desta sessão". Os três estão
corrigidos, com teste. O próximo é o [plano 04](04-transcript-and-resume/README.md).

Em 2026-09-25 a **F0 do [plano 04](04-transcript-and-resume/README.md) fechou**: o backend lê o
histórico — inclusive o que começou no VSCode — só pelas funções do SDK, e `lint:arch` reprova
parser próprio. A mesma allowlist que cerca onde o Claude roda cerca o que se lê, sobre o `cwd`
que o SDK devolve; conversa aberta aqui por outra pessoa responde `404`, igual à que não existe.
A página vem pela cauda, com cursor que não pula nem repete sob escrita viva, e no formato dos
eventos vivos. E a sessão aberta aqui passou a gravar a **procedência antes do subprocesso**, com
um id que nós cunhamos e o SDK usa — é o que rotula "nossa" e "externa", e o que a F2 vai usar para
decidir entre continuar o arquivo e fazer fork.

O parágrafo abaixo descreve o ponto de partida, e continua valendo para o que ainda não foi feito.

---

**O trilho existe e está provado; o produto ainda não fala com o Claude.**

O [plano 00](00-bootstrap/README.md) fechou com `pnpm verify:full` saindo 0 — os onze portões
verdes — e com `pnpm test:e2e:mobile` também verde. O que existe é um walking skeleton
atravessando autenticação, contrato WS, as quatro camadas do backend, o banco, o web e o app.

O que **não** existe ainda: nenhuma chamada a `query()` do Agent SDK, nenhum fluxo de permissão,
nenhum push. Isso é escopo declarado, não omissão — ver o
[escopo do bootstrap](00-bootstrap/README.md#escopo).

Os planos 01 a 06 constroem o produto sobre esse trilho, nesta ordem, e cada um depende do
anterior:

| Plano | Entrega a capacidade de… | Depende de |
|---|---|---|
| [01 — Sessão viva](01-live-session/README.md) | conversar com o Claude, com toda tool auditada e aprovável pela web ✅ | 00 |
| [02 — Aprovação pelo celular](02-mobile-approval/README.md) | decidir de longe, com device aprovado e push | 01 |
| [03 — Regras e trilha](03-rules-and-audit/README.md) | não repetir a mesma aprovação, e consultar o que foi executado | 01, 02 |
| [04 — Histórico e retomada](04-transcript-and-resume/README.md) | continuar o que começou antes, inclusive no VSCode | 01 |
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | ficar ligado sem vazar recurso nem credencial | 01…04 |
| [06 — Distribuição](06-distribution/README.md) | instalar e atualizar na máquina de quem usa | 05 |

---

## Decisões em aberto que bloqueiam plano

Decisão em aberto não impede planejar; impede **começar a fase** que depende dela. Cada uma
está registrada no risco do seu plano.

| Decisão | Bloqueia | Onde |
|---|---|---|
| Qual provedor OIDC real, e quem administra | 05 · F2 | [05 · D-05](05-hardening-operations/decisions.md) |
| Como o backend é alcançado de fora | 06 · F1 | [06 · D-04](06-distribution/decisions.md) |
| Quais sistemas operacionais entram no escopo inicial | 06 · F0 | [06 · D-01](06-distribution/decisions.md) |

A tabela acima é o recorte do que **trava** trabalho. A lista inteira, por fase e com o gap de
cada uma, vive no `decisions.md` de cada plano — e o contador de decisões do painel sai de lá.

O plano 01 saiu desta tabela em 2026-09-19: a [D-11](01-live-session/decisions.md#d-11--o-furo-que-invalidaria-o-produto)
foi medida, a resposta foi a ruim — em diretório confiado o `canUseTool` **não é chamado** — e a
mitigação está entregue e provada pela porta do usuário (S-98).

### Duas escolhas que o plano 01 deixou, e que não travam ninguém

Cenários que ficaram fora do que ele entregou. Nenhum bloqueia um plano; os dois têm dono.

O terceiro — **S-38** — foi decidido em 2026-09-19 pela
[D-17](01-live-session/decisions.md#d-17--usar-o-código-http-que-cada-coisa-é): o produto usa a
semântica HTTP que cada código já tem, `403` para falha de autorização e `404` para registro que
não existe. A regra antiga, que respondia `404` também para "existe e não é seu", foi revertida em
workspace, sessão, `attach` e ping — e a [D-05 do plano 03](03-rules-and-audit/decisions.md#d-05--de-quem-é-a-trilha),
que a herdava, foi corrigida junto.

| O quê | Por quê ficou | Quem assume |
|---|---|---|
| **S-36** — fila estourada fecha com `1013` | o fan-out já é fire-and-forget, então o loop do SDK nunca fica preso; falta o limite de fila e o código de fechamento | [05 — endurecimento](05-hardening-operations/README.md), com o resto dos limites |
| **S-89, S-90** — os números da fixture gravada | a assimetria que a ADR-011 afirma se confirma; os números não se repetem, porque o prompt é outro. S-89 não é testável como escrita: o modelo não repete o mesmo stream | reescrever ou remover, no [plano 04](04-transcript-and-resume/README.md), que volta a mexer em fixture |

---

## Dívida do bootstrap, e quem a assumiu

O [plano 00](00-bootstrap/progress.md#escopo-reduzido-ou-adiado) registrou o que adiou. Nada
ficou órfão:

| Dívida | Assumida por |
|---|---|
| `session.detach` fora do contrato (S-119) | [01 · B-01](01-live-session/F0-contract.md) |
| Redutor de `message.delta` por `messageId` | [01 · B-32](01-live-session/F5-web-session.md) |
| `e2e/smoke-live/` vazio | [01 · B-41](01-live-session/F6-e2e.md) |
| Tela de device, cenários de auth do mobile, teto do Gradle | [02](02-mobile-approval/progress.md) |
| `LogBuffer` sem endpoint, tela de diagnóstico, `osv-scanner`, Sonar, CI do e2e mobile | [05](05-hardening-operations/progress.md) |

---

## Histórico

Um registro por marco — plano concluído, escopo movido de um plano para outro, plano criado.
Ciclo de validação é diário do plano, e fica **lá**, não aqui.

| Data | O quê | Detalhe |
|---|---|---|
| 2026-09-24 | **Plano 03 concluído — F3 e F4** | F3: retenção de 90 dias (2160 h), purga que se registra na mesma instrução, job e `pnpm db purge`. F4: o ciclo da regra pela porta do usuário, S-41…S-46 e S-92, no Playwright e — S-44, S-46 — no `integration_test` do app. Corrigidos no caminho: revogação simultânea registrada duas vezes, filtro da trilha perdido no login, e a frase do app para resolução por regra. `pnpm verify:full` 0 (e2e 36/36); `pnpm test:e2e:mobile` 8/8 |
| 2026-09-24 | **Plano 03, F2 concluída** | a trilha é consultável: filtro, paginação por cursor estável sob escrita concorrente, índices verificados por plano de execução, e a tela `/audit`. O veredito e o `traceId` nascem com a entrada (D-15, D-16, migration `0009`); da entrada auto-resolvida se abre a regra, inclusive revogada (D-18). `pnpm verify:full` 0. E2E da trilha segue na F4; a trilha no app não tem dono |
| 2026-09-24 | **Plano 03, F1 concluída** | as regras têm tela nas duas pontas, e a aprovação oferece `project`/`always` com o padrão e a validade na própria sugestão (D-12, mudança de contrato nas três pontas); escopo persistido sempre em dois passos (D-14). `pnpm verify:full` 0, com o e2e novo (S-68) revogando pelo navegador |
| 2026-09-24 | **Plano 03, F0 concluída** | a aprovação deixa de ser repetitiva: regra `project`/`always` persistida, com validade e teto, resolvendo antes de notificar e publicando `permission.resolved` com `auto: true`; revogar vale na próxima invocação da sessão já de pé; `deny` sempre vence. [D-09](03-rules-and-audit/decisions.md#d-09--a-regra-nossa-é-a-única-autoridade): **não** se devolve `updatedPermissions` ao SDK. Telas de regra são a F1 |
| 2026-09-24 | **Plano 02 concluído — F3 e F4** | o celular decide: card de permissão, dois passos, biometria, deep link que revalida por `GET /sessions/:id/permissions/:reqId`, extensão de prazo, logout completo e revogação que a tela explica. `pnpm verify:full` 0 (11 portões) e `pnpm test:e2e:mobile` 0 (6/6, API 35). S-54 e S-67 provados com push de verdade, numa variante opt-in (`pnpm test:e2e:mobile:push`, D-26) |
| 2026-09-23 | **Plano 02, F1 concluída** | o transporte de push da plataforma existe em `android/`: canal, serviço, notificação com `tag` e permissão do SO. O plugin de credencial só entra quando o arquivo existe, então o build sem ele segue verde. A lógica sem Android ganhou teste de JVM no portão de unit |
| 2026-09-20 | **Plano 02, F2 concluída; F1 quase** | o celular acompanha uma sessão viva: comandos completos, as três regras do stream, lista de pastas e tela de sessão com os quatro estados. A F1 fechou B-31 e B-32 — o token rotacionado se reenvia sozinho, e o app **diz** quando a notificação não vai chegar. Falta de B-13 só o transporte da plataforma, que por [D-21](02-mobile-approval/decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart) mora fora do Dart. `pnpm verify:full` saiu 0 |
| 2026-09-19 | **Plano 02, F0 concluída; F1 pela metade** | um aparelho prova de onde vem: registro com `(user_id, install_id)`, aprovação a partir do navegador, revogação que fecha o socket já aberto, e a trilha `audit_events` recusando UPDATE por trigger. Do push, só o backend — **B-13, B-31 e B-32 e a F2 inteira ficaram de fora**, com motivo no [diário do plano](02-mobile-approval/progress.md#escopo-reduzido-ou-adiado). `pnpm verify:full` saiu 0 |
| 2026-09-19 | **D-17: o produto usa a semântica HTTP, não uma própria** | `403` é falha de autorização e `404` é registro inexistente. Reverteu a regra de "404 para não confirmar existência" em workspace, sessão, `attach` e ping de diagnóstico, e fechou o S-38 |
| 2026-09-19 | **Plano 01 concluído** | os onze portões verdes, `pnpm test:e2e:live` saiu 0 contra o Claude real (respondeu "pong", US$ 0,274) e `pnpm test:e2e:mobile` saiu 0 com o contrato novo. Quatro cenários ficaram de fora, todos registrados com dono |
| 2026-09-19 | **Plano 01, F5 concluída** | a sessão tem tela: `/sessions/:id` reproduz a conversa a partir do link, o comando de cada tool aparece inteiro, e a fila de permissão conta o tempo, recusa o segundo clique e some sozinha quando outro dispositivo responde. `pnpm verify` saiu 0 |
| 2026-09-19 | **Plano 01, F4 concluída** | o produto pede permissão: `canUseTool` bloqueia o loop, o prazo nega em silêncio, a decisão é auditada e o pedido pendente sobrevive a uma reconexão sem `reinitialize()`. `pnpm verify` saiu 0 |
| 2026-09-19 | **Plano 01, F1 a F3 concluídas** | o produto fala com o Claude: workspace com allowlist em arquivo, sessão viva sobre o Agent SDK, e trilha de auditoria append-only garantida por trigger. `pnpm verify:full` saiu 0 |
| 2026-09-14 | **Plano 00 concluído** | `pnpm verify:full` e `pnpm test:e2e:mobile` saíram 0; onze portões verdes |
| 2026-09-15 | Planos 01…06 criados | o roteiro do produto, do Agent SDK à distribuição |
| 2026-09-15 | `decisions.md` entrou no formato | decisão em aberto e gap passaram a ser rastreados por plano, com contador |
| 2026-09-15 | **Plano 02 sem decisão em aberto** | 16 decisões fechadas, incluindo o provedor de push (FCM direto) e o escopo em Android; só D-17 segue travada pelo plano 06 |

---

## Como atualizar

1. **Nunca edite um contador à mão.** Marque a task com ✅ no arquivo da fase e rode
   `pnpm plan progress` — ele atualiza o `progress.md` do plano **e** este arquivo.
2. Plano novo: `pnpm plan new <nome>` já o adiciona ao [índice](README.md) e a este arquivo.
3. Marco (plano concluído, escopo movido, decisão destravada): uma linha no histórico acima.
4. Decisão em aberto que passou a bloquear — ou deixou de bloquear — entra e sai da tabela de
   bloqueios **na mesma hora**; é ela que diz onde o trabalho pode começar.
