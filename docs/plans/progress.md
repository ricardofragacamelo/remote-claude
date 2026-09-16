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

**Última atualização:** 2026-09-16

```
00-bootstrap             ████████████████████ 100%   ✅ concluído
01-live-session          ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciado
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
| [01 — Sessão viva](01-live-session/README.md) | 0/7 | 0/47 | 0/108 | 12/13 | 🔲 |
| [02 — Aprovação pelo celular](02-mobile-approval/README.md) | 0/5 | 0/34 | 0/67 | 16/17 | 🔲 |
| [03 — Regras e trilha](03-rules-and-audit/README.md) | 0/5 | 0/23 | 0/52 | 8/8 | 🔲 |
| [04 — Histórico e retomada](04-transcript-and-resume/README.md) | 0/6 | 0/25 | 0/67 | 7/7 | 🔲 |
| [05 — Endurecimento e operação](05-hardening-operations/README.md) | 0/5 | 0/24 | 0/46 | 0/8 | 🔲 |
| [06 — Distribuição](06-distribution/README.md) | 0/4 | 0/19 | 0/38 | 0/7 | 🔲 |
| **Total** | **8/40** | **52/224** | **118/497** | **48/66** | 🔄 |

Legenda: 🔲 não iniciado · 🔄 em andamento · ✅ concluído · ⛔ bloqueado

---

## Onde o projeto está

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
| [01 — Sessão viva](01-live-session/README.md) | conversar com o Claude, com toda tool auditada e aprovável pela web | 00 |
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
| O `allow` de projeto fura o `canUseTool` em diretório já confiado? | 01 · **F0 em diante** — o spike foi antecipado para antes da primeira fase | [01 · D-11](01-live-session/decisions.md) |
| Qual provedor OIDC real, e quem administra | 05 · F2 | [05 · D-05](05-hardening-operations/decisions.md) |
| Como o backend é alcançado de fora | 06 · F1 | [06 · D-04](06-distribution/decisions.md) |
| Quais sistemas operacionais entram no escopo inicial | 06 · F0 | [06 · D-01](06-distribution/decisions.md) |

A tabela acima é o recorte do que **trava** trabalho. A lista inteira, por fase e com o gap de
cada uma, vive no `decisions.md` de cada plano — e o contador de decisões do painel sai de lá.

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
