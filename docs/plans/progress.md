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

**Última atualização:** 2026-09-19

```
00-bootstrap             ████████████████████ 100%   ✅ concluído
01-live-session          ████████████████████ 100%   ✅ concluído
02-mobile-approval       ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
03-rules-and-audit       ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
04-transcript-and-resume ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
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
| [02 — Aprovação pelo celular](02-mobile-approval/README.md) | 0/5 | 0/34 | 0/67 | 16/17 | 🔲 |
| [03 — Regras e trilha](03-rules-and-audit/README.md) | 0/5 | 0/23 | 0/52 | 8/8 | 🔲 |
| [04 — Histórico e retomada](04-transcript-and-resume/README.md) | 0/6 | 0/25 | 0/67 | 7/7 | 🔲 |
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | 0/5 | 0/24 | 0/46 | 0/8 | 🔲 |
| [06 — Distribuição](06-distribution/README.md) | 0/4 | 0/19 | 0/38 | 0/7 | 🔲 |
| **Total** | **15/40** | **99/224** | **223/497** | **53/70** | 🔄 |

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

O próximo é o [plano 02](02-mobile-approval/README.md): decidir de longe, com device aprovado e
push. O que ele herda já está de pé — o contrato de permissão inteiro, a fila, o prazo extensível
e a trilha.

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
