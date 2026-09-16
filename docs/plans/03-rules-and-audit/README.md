# Plano 03 — Regras e trilha

**Objetivo:** que o usuário não precise aprovar a mesma coisa duas vezes — e que tudo que foi
executado, com ou sem pergunta, possa ser consultado depois.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
```

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Os planos [01](../01-live-session/README.md) e [02](../02-mobile-approval/README.md) entregam um
produto correto e **cansativo**: toda tool sensível pergunta, toda vez. Na prática isso tem um
custo de segurança, não só de conforto — quem aprova trinta vezes por hora para de ler o que
está aprovando.

A resposta é a regra persistida, e ela só pode existir junto com duas coisas:

| | Por quê |
|---|---|
| Uma tela que **revoga** a regra | uma autorização que sobrevive à sessão e não pode ser retirada é uma porta que ninguém fecha |
| Uma trilha **consultável** | "o que foi executado sem me perguntar?" precisa ter resposta, ou a regra vira um cheque em branco |

Por isso os dois assuntos estão no mesmo plano: separá-los entregaria o poder sem o controle.

---

## Escopo

### Entra

| | |
|---|---|
| `PermissionRule` com escopo `project` e `always`, persistida e revogável | F0 |
| Auto-resolução **antes** de notificar, e `updatedPermissions` de volta ao SDK | F0 |
| Telas de regras no web e no app | F1 |
| Consulta da trilha de auditoria, com filtro, paginação e a tela | F2 |
| Retenção de 90 dias e a purga, ela própria auditada | F3 |
| E2E do ciclo: aprovar sempre → não pergunta mais → revogar → pergunta de novo | F4 |

### Não entra

- **Alerta e relatório sobre a trilha** (avisar que algo incomum executou). Precisa de
  linha de base do que é normal; não há uso suficiente para isso ainda.
- **Exportação da trilha para fora da máquina.** É superfície nova de vazamento e não tem
  demanda; se aparecer, vira ADR antes de virar task.
- **Transcript e histórico de conversa** — [plano 04](../04-transcript-and-resume/README.md).
  Trilha de tool e transcript são coisas diferentes, com fontes diferentes.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Regras](F0-rules.md) | regra persistida, casada, aplicada e revogável | B-01…B-06 | 🔲 |
| F1 | [Telas de regra](F1-rules-ui.md) | listar e revogar nas duas pontas | B-07…B-10 | 🔲 |
| F2 | [Consulta da trilha](F2-audit-query.md) | filtro, paginação, tela e correlação | B-11…B-15 | 🔲 |
| F3 | [Retenção](F3-retention.md) | 90 dias, purga idempotente e auditada | B-16…B-19 | 🔲 |
| F4 | [E2E](F4-e2e.md) | o ciclo completo da regra, pela porta do usuário | B-20…B-23 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Regra persistida resolve sem incomodar ninguém | B-01, B-03 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-01…S-04 |
| Casamento de regra não é comparação ingênua de prefixo | B-01 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#a-ponte-de-permissão) | S-05…S-07, S-12 |
| `deny` de projeto continua sendo aplicado | B-06 | [ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse) | S-08 |
| Regra é revogável, e a revogação vale na sessão viva | B-05 | [backend/03-modules](../../architecture/backend/03-modules.md#permission) | S-09…S-11 |
| Regra pertence a um usuário e nunca resolve o pedido de outro | B-01 | [08-authentication](../../architecture/shared/08-authentication.md#identidade-e-o-modelo-local) | S-13, S-14 |
| "Sempre permitir" vira regra também do lado do Claude | B-04 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#a-ponte-de-permissão) | S-01, S-02 |
| Revogar regra é operação de uma tela, nas duas pontas | B-07…B-10 | [web/01](../../architecture/web/01-architecture.md), [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-15…S-22 |
| A trilha é consultável, com filtro e paginação estável | B-11, B-14 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) | S-23…S-25, S-28, S-29 |
| A trilha de um usuário não vaza para outro, nem expõe conteúdo | B-12 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-26, S-27 |
| Da trilha se chega à sessão, ao log e à decisão | B-13, B-15 | [03-logging](../../architecture/shared/03-logging.md) | S-30…S-32 |
| Retenção mínima de 90 dias, e purga que não apaga demais | B-16, B-17, B-19 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) | S-33…S-39 |
| Purga é script, com código de saída honesto | B-18 | [11-validation-protocol](../../architecture/shared/11-validation-protocol.md#automação-script-não-orquestração-pelo-agente) | S-40 |
| O ciclo da regra provado pela porta do usuário | B-20…B-23 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-41…S-46 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
backend/src/
├── domain/permission/            PermissionRule · RuleMatcher (regra pura)
├── application/{permission,audit}/
├── adapter/
│   ├── inbound/http/{permission-rules,audit}/
│   └── outbound/persistence/{permission,audit}/
└── infrastructure/database/{schema,migrations}/   índices da consulta da trilha

web/src/features/{permission,audit}/{components,hooks,services}/
mobile/lib/features/permission/                    lista e revogação de regra
scripts/db.mjs                                     subcomando de purga da trilha
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **O casamento de regra é a superfície de ataque deste plano.** Uma regra larga demais (`Bash(*)`) reintroduz o problema que o `settingSources: ['project']` resolveu | mitigação: o matcher é regra **pura**, com cenários de fronteira próprios (S-05…S-07), e a UI mostra o alcance com todas as letras |
| R-02 | Escopo `always` é, na prática, "não me pergunte mais" | a tela precisa dizer isso sem eufemismo, e a revogação precisa estar a um clique — S-17 |
| R-03 | Trilha grande torna a consulta lenta e a purga longa | índice desenhado com a consulta (B-14), purga em lote que não bloqueia escrita (S-38) |
| R-04 | Purga e append-only convivem mal: quem pode apagar poderia reescrever | a trigger do plano 01 passa a barrar `DELETE` **dentro** do piso de 90 dias ([D-08](decisions.md#d-08--quem-pode-apagar-a-trilha-append-only)) — o piso vira invariante do banco. A purga apaga por janela, em lote, sob lock, e é ela mesma auditada (B-19) |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`.
3. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
4. Três ciclos sem progresso no mesmo portão → **pare e escale**.
