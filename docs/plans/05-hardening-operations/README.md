# Plano 05 — Endurecimento e operação

**Objetivo:** o sistema aguenta ficar ligado — com limites que a máquina sustenta, credencial
de provedor real, logs do cliente chegando, e os portões que o bootstrap deixou anotados.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, agora com osv-scanner no 10, sai com código 0
pnpm test:e2e:live   # a suíte smoke-live, sai com código 0
```

E o portão 12 — o quality gate do Sonar — passa a existir no CI, onde ele mora.

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Os planos 01 a 04 constroem o produto. Este trata do que só aparece **depois** de ele ficar
ligado por algumas horas: subprocesso órfão, memória, socket que expira, cliente que martela,
log que ninguém coleta, dependência que ficou vulnerável ontem.

Três números que já foram medidos e ainda não viraram comportamento:

| Medido | Onde está registrado | O que falta |
|---|---|---|
| ~222 MB de RSS por sessão, 1 processo cada | [descoberta §8.5](../../discovery/01-descoberta-claude-agent-sdk.md#85--custo-de-recurso-por-sessão) | derivar o limite da RAM da máquina, em vez de um número fixo |
| O CLI não impõe timeout no `canUseTool` | [descoberta §8.4](../../discovery/01-descoberta-claude-agent-sdk.md#84--o-cli-não-impõe-timeout-próprio-no-canusetool) | o timeout já existe; falta o TTL da sessão ociosa |
| `query.close()` devolve tudo ao baseline | [descoberta §8.5](../../discovery/01-descoberta-claude-agent-sdk.md#85--custo-de-recurso-por-sessão) | e quando o backend morre sem chamar `close()`? |

Este plano também é onde a dívida do bootstrap termina: `LogBuffer` sem endpoint nas duas
pontas, tela de diagnóstico, `osv-scanner`, Sonar e o job de e2e mobile no CI
([progresso do plano 00](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado)).

---

## Escopo

### Entra

| | |
|---|---|
| Limite derivado da RAM, TTL de ociosa, sessão órfã, shutdown ordeiro | F0 |
| Rate limit e limites anunciados por connection | F0 |
| Ingestão dos logs do web e do app, e a tela de diagnóstico | F1 |
| Provedor de identidade real como **configuração**, rotação e revogação | F2 |
| `osv-scanner`, quality gate do Sonar, e2e mobile no CI, nightly do smoke-live | F3 |
| E2E dos limites e da expiração de credencial | F4 |

### Não entra

- **Empacotar, instalar e expor** o sistema na máquina do usuário —
  [plano 06](../06-distribution/README.md).
- **Métrica e painel** (Prometheus, dashboards). Log estruturado já responde às perguntas que
  temos hoje; painel sem pergunta é enfeite.
- **Multi-máquina.** Um backend, uma máquina, um Claude. Mudar isso é ADR, não task.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Limites](F0-limits.md) | RAM, TTL, órfã, shutdown, rate limit | B-01…B-07 | 🔲 |
| F1 | [Logs do cliente](F1-client-logs.md) | ingestão dos dois shippers e diagnóstico | B-08…B-11 | 🔲 |
| F2 | [Identidade](F2-identity.md) | provedor real por configuração, rotação, revogação | B-12…B-15 | 🔲 |
| F3 | [Portões](F3-gates.md) | osv-scanner, Sonar, CI do mobile, nightly | B-16…B-20 | 🔲 |
| F4 | [E2E](F4-e2e.md) | limites e credencial pela porta do usuário | B-21…B-24 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Limite de sessões derivado da RAM, não fixo | B-01 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos) | S-01…S-03, S-13 |
| Sessão ociosa libera recurso; sessão ativa não é morta | B-02 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#ciclo-de-vida-e-recursos) | S-04, S-05 |
| Subprocesso não sobrevive ao backend | B-03, B-04 | [backend/06-realtime](../../architecture/backend/06-realtime.md#shutdown) | S-06…S-09, S-14 |
| Cliente que martela é contido, com `Retry-After` | B-05, B-06, B-07 | [backend/06-realtime](../../architecture/backend/06-realtime.md#heartbeat-e-limites) | S-10…S-12 |
| Log do cliente tem para onde ir, sem virar vazamento | B-08…B-10 | [03-logging](../../architecture/shared/03-logging.md) | S-15…S-20, S-22 |
| `debug` em release é ligável sem recompilar | B-11 | [mobile/05-logging](../../architecture/mobile/05-logging.md) | S-21 |
| Trocar de provedor é trocar configuração | B-12 | [08-authentication](../../architecture/shared/08-authentication.md#configuração) | S-23, S-24, S-32 |
| Validação de token não confia no token | B-12 | [08-authentication](../../architecture/shared/08-authentication.md#validação-no-backend) | S-25, S-26 |
| Refresh rotaciona, e reuso revoga a família | B-13 | [08-authentication](../../architecture/shared/08-authentication.md#renovação-e-expiração) | S-27, S-28 |
| Expiração com socket aberto não derruba a conexão | B-14 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) | S-29, S-30 |
| Logout encerra também no provedor | B-15 | [web/07-auth](../../architecture/web/07-auth.md) | S-31 |
| Dependência vulnerável não entra | B-16 | [09-code-quality](../../architecture/shared/09-code-quality.md) | S-33, S-34 |
| Quality gate e portões caros existem onde cabem | B-17, B-18 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#portões-de-ci) | S-35, S-36, S-40 |
| Quebra do SDK vira aviso automático | B-19 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#portões-de-ci) | S-37, S-38 |
| Pré-requisito novo é detectado pelo `doctor` | B-20 | [11-validation-protocol](../../architecture/shared/11-validation-protocol.md#automação-script-não-orquestração-pelo-agente) | S-39 |
| Os limites provados pela porta do usuário | B-21…B-24 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-41…S-46 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
backend/src/
├── application/session/           session-reaper (TTL) · capacity (RAM)
├── adapter/inbound/http/logs/     ingestão dos lotes do cliente
├── infrastructure/websocket/      rate limit por connection, limites anunciados
└── infrastructure/lifecycle/      boot: varredura de órfã · shutdown ordeiro

web/src/shared/logging/            shipper apontando para o endpoint
mobile/lib/core/logging/           idem · tela de diagnóstico

.github/workflows/                 osv-scanner · sonar · e2e mobile · nightly smoke-live
scripts/doctor.mjs                 pré-requisitos novos
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Qual provedor OIDC de verdade** (tenant, audience, escopos) e quem administra | **decisão em aberto, bloqueia a F2.** Nenhum teste automatizado fala com tenant real — o Keycloak continua sendo o dono do teste ([08-authentication](../../architecture/shared/08-authentication.md#testes)) |
| R-02 | Derivar o limite da RAM pode ficar otimista em máquina compartilhada | o limite tem piso e teto configuráveis; a fórmula é regra pura e testada (S-01) |
| R-03 | Matar "sessão órfã" no boot pode matar processo que não é nosso | a varredura casa por marca própria do processo, e S-07 existe para provar que ela não passa disso |
| R-04 | Ingestão de log é uma porta que aceita texto do cliente | limite de tamanho, rate limit próprio e redação antes de gravar (S-17…S-19) |
| R-05 | Sonar e o runner de e2e mobile exigem infraestrutura que ninguém levantou | é parte da F3, e enquanto não existir o job fica **declarado como ausente**, não fingido como verde |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. **Feche o R-01 antes da F2.**
3. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`.
4. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
