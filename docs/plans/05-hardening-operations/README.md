# Plano 05 — Endurecimento e operação

**Objetivo:** o sistema aguenta ficar ligado — com limites que a máquina sustenta, credencial
de provedor real, `debug` ligável em release, e os portões que o bootstrap deixou anotados.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, agora com osv-scanner no 10, sai com código 0
pnpm test:e2e:live   # a suíte smoke-live, sai com código 0
```

O portão 12 — o quality gate do Sonar — **não** entra: foi adiado ([D-07](decisions.md)) e fica
declarado ausente.

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
| Nova tentativa do push quando o provedor falha | F0 |
| Rate limit e limites anunciados por connection | F0 |
| Tela de diagnóstico: `debug` em release sem recompilar | F1 |
| Provedor de identidade real como **configuração**, rotação e revogação | F2 |
| `osv-scanner`, relatório do smoke-live por issue e limite de complexidade | F3 |
| E2E dos limites e da expiração de credencial | F4 |

### Não entra

- **Empacotar, instalar e expor** o sistema na máquina do usuário —
  [plano 17](../17-distribution/README.md).
- **Enviar o log do web e do app ao backend.** Saiu em 2026-09-27: o log do cliente fica no
  cliente, e o `traceId` é o que liga os dois lados.
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
| F0 | [Limites](F0-limits.md) | RAM, TTL, órfã, shutdown, rate limit, nova tentativa do push, e o que o plano 04 deixou | B-01…B-07, B-25…B-27 | ✅ |
| F1 | [Diagnóstico](F1-diagnostics.md) | `debug` em release, e de volta ao sair | B-11 | ✅ |
| F2 | [Identidade](F2-identity.md) | provedor real por configuração, rotação, revogação | B-12…B-15 | ✅ |
| F3 | [Portões](F3-gates.md) | osv-scanner, relatório do smoke-live, complexidade | B-16, B-19, B-20, B-28 | ✅ |
| F4 | [E2E](F4-e2e.md) | limites e credencial pela porta do usuário | B-21…B-23 | 🔲 |

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
| Uma falha pontual do provedor não perde a notificação | B-25 | [plano 02 · D-05](../02-mobile-approval/decisions.md#d-05--quando-o-push-não-sai) | S-47…S-53 |
| Retomada sem resposta não deixa a tela esperando para sempre | B-26 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#retomada) | S-56, S-57 |
| Prompt não entra enquanto um desfazer devolve os arquivos | B-27 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#desfazer-arquivos) | S-54, S-55, S-58 |
| Anexar e heartbeat sob carga dentro dos limites | B-05, B-07 | [backend/06-realtime](../../architecture/backend/06-realtime.md#heartbeat-e-limites) | S-59, S-60 |
| `debug` em release é ligável sem recompilar | B-11 | [mobile/05-logging](../../architecture/mobile/05-logging.md) | S-21 |
| Trocar de provedor é trocar configuração | B-12 | [08-authentication](../../architecture/shared/08-authentication.md#configuração) | S-23, S-24, S-32 |
| Validação de token não confia no token | B-12 | [08-authentication](../../architecture/shared/08-authentication.md#validação-no-backend) | S-25, S-26, S-61, S-70, S-71 |
| Refresh rotaciona, e reuso revoga a família | B-13 | [08-authentication](../../architecture/shared/08-authentication.md#renovação-e-expiração) | S-27, S-28, S-75, S-76 |
| Expiração com socket aberto não derruba a conexão | B-14 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) | S-29, S-30, S-69, S-72, S-77 |
| Logout encerra também no provedor | B-15 | [web/07-auth](../../architecture/web/07-auth.md) | S-31, S-73 |
| Dependência vulnerável não entra | B-16 | [09-code-quality](../../architecture/shared/09-code-quality.md) | S-33, S-34, S-74 |
| Scanner que não verificou não aprova | B-16 | [09-code-quality](../../architecture/shared/09-code-quality.md) | S-35 |
| Falha do smoke-live não se perde | B-19 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#portões-de-ci) | S-37, S-38, S-40 |
| Complexidade tem limite, nas três pontas | B-28 | [09-code-quality](../../architecture/shared/09-code-quality.md) | S-62…S-68 |
| Pré-requisito novo é detectado pelo `doctor` | B-20 | [11-validation-protocol](../../architecture/shared/11-validation-protocol.md#automação-script-não-orquestração-pelo-agente) | S-39 |
| Os limites provados pela porta do usuário | B-21…B-23 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-41…S-45 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
backend/src/
├── domain/session/services/       session-capacity (a regra da RAM)
├── application/session/           reaper (TTL) · session-ender · shutdown-sessions
├── application/notification/      push-dispatcher: nova tentativa, com recuo
├── infrastructure/websocket/      rate limit por connection, limites anunciados (WsSettings)
├── infrastructure/jobs/           session-reaper.job
└── infrastructure/lifecycle/      boot: capacidade · varredura de órfã · shutdown ordeiro

mobile/lib/core/logging/           log_level
mobile/lib/features/diagnostics/   tela de diagnóstico

scripts/lib/osv.mjs                o osv-scanner do portão 10, e a leitura da saída dele
scripts/report-smoke-live.mjs      o smoke-live, com a falha registrada como issue
scripts/doctor.mjs                 pré-requisitos novos
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Qual provedor OIDC de verdade** (tenant, audience, escopos) e quem administra | **decidido em 2026-09-26** ([D-05](decisions.md)): Keycloak próprio, administrado por quem opera a instalação; nenhum teste automatizado fala com a instância real |
| R-02 | Derivar o limite da RAM pode ficar otimista em máquina compartilhada | o limite tem piso e teto configuráveis; a fórmula é regra pura e testada (S-01) |
| R-03 | Matar "sessão órfã" no boot pode matar processo que não é nosso | a varredura casa por marca própria do processo, e S-07 existe para provar que ela não passa disso |
| R-04 | Ingestão de log é uma porta que aceita texto do cliente | **descartado em 2026-09-27**: a ingestão saiu do escopo |
| R-05 | Sonar e o runner de e2e mobile exigem infraestrutura que ninguém levantou | **decidido em 2026-09-27** ([D-07, D-08](decisions.md)): nenhum dos dois é levantado; o portão 12 fica **declarado ausente** e o e2e mobile segue local — nunca fingidos verdes |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. **Feche o R-01 antes da F2.**
3. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`.
4. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
