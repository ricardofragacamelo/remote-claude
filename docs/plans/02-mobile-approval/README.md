# Plano 02 — Aprovação pelo celular

**Objetivo:** aprovar (ou negar) a execução de uma tool a partir do celular, com o aparelho
registrado e aprovado, e com push avisando quando ninguém está com o app aberto.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full      # portões 1-11, sai com código 0
pnpm test:e2e:mobile  # o integration_test do app contra a stack efêmera, sai com código 0
```

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O [plano 01](../01-live-session/README.md) deixou o produto utilizável **na mesa**. Este é o
que o torna útil **fora dela** — e é a razão de o app existir: quando o Claude para esperando
uma permissão, alguém precisa ser avisado onde quer que esteja, ou a sessão fica parada até o
timeout negar sozinho.

Duas coisas precisam ser verdade antes de um toque no celular autorizar `rm -rf`:

| | Prova o quê | Onde nasce |
|---|---|---|
| Token OIDC | **quem** é | já existe, desde o bootstrap |
| Registro de device aprovado | **de onde** | F0 deste plano |

Por isso o device vem antes do push, e o push antes da tela: notificar um aparelho que não
pode decidir nada é ruído, e telefone aprovando sem registro é shell remoto sem dono
([08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile)).

---

## Escopo

### Entra

| | |
|---|---|
| Entidade `Device`, registro, aprovação, revogação, e a tela de devices no web | F0 |
| Módulo `notification`: push traduzido, disparado só quando ninguém observa | F1 |
| App: WebSocket, ciclo de vida, stream da sessão e as telas de sessão | F2 |
| App: a tela de permissão, biometria, deep link e logout completo | F3 |
| Os cenários e2e obrigatórios que exigem duas pontas | F4 |

### Não entra

- **Regra de permissão persistida** (`project`, `always`) e a tela que a revoga —
  [plano 03](../03-rules-and-audit/README.md).
- **Histórico e retomada de sessão no app** — [plano 04](../04-transcript-and-resume/README.md).
- **Job de e2e mobile no CI** — entra junto com o runner que o suporte, no
  [plano 05](../05-hardening-operations/README.md). Aqui ele continua rodando sob demanda, como
  [decidido no bootstrap](../00-bootstrap/README.md#riscos-e-decisões-em-aberto).
- **Publicação em loja.** Assinatura, perfis e revisão são o
  [plano 06](../06-distribution/README.md).
- **iOS.** [D-12](decisions.md) fechou o escopo em **Android**: o app continua compilando para
  iOS, e push, biometria e `integration_test` não são exercitados lá. Reabrir é decisão do
  [plano 06](../06-distribution/README.md).
- **Como o celular alcança o backend fora da rede local** — túnel, VPN ou porta com TLS é o
  [plano 06 · D-04](../06-distribution/decisions.md). A F4 prova o fluxo com `adb reverse`, na
  mesma máquina.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Device](F0-device.md) | registro, aprovação, revogação, expiração do pendente e a tela de devices | B-01…B-07, B-30 | 🔲 |
| F1 | [Push](F1-push.md) | notificação traduzida, disparada e cancelada na hora certa | B-08…B-13, B-31, B-32 | 🔲 |
| F2 | [Sessão no app](F2-mobile-session.md) | socket, ciclo de vida e o stream nas telas | B-14…B-19 | 🔲 |
| F3 | [Permissão no app](F3-mobile-permission.md) | a tela que autoriza, com biometria, deep link e extensão do prazo | B-20…B-25, B-33 | 🔲 |
| F4 | [E2E](F4-e2e.md) | permissão pelo celular, corrida e multi-cliente, em imagem fixada | B-26…B-29, B-34 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Device precisa de aprovação explícita antes do primeiro uso | B-01…B-05, B-07 | [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) | S-01…S-06, S-11…S-13 |
| O mesmo aparelho em duas contas não herda aprovação | B-02 | [backend/05-persistence](../../architecture/backend/05-persistence.md#o-device-do-celular) | S-02, S-59 |
| Pendente que ninguém aprovou não envelhece na lista | B-30 | [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) | S-60 |
| Revogação alcança socket aberto e mata a credencial | B-04 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) | S-07…S-10 |
| Aprovação parte de uma sessão já confiável | B-06 | [mobile/07-auth](../../architecture/mobile/07-auth.md) | S-06 |
| Push só quando ninguém está observando, e some quando resolve | B-08, B-10 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) | S-15, S-16, S-21…S-25 |
| Push vai traduzido — a única exceção da regra de i18n | B-11 | [02-i18n](../../architecture/shared/02-i18n.md) | S-17, S-18 |
| Push nunca carrega conteúdo de arquivo nem output | B-12 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-19, S-20 |
| Nome de provedor não vaza para fora da configuração | B-09 | [AGENTS.md](../../../AGENTS.md) | S-26 |
| Token rotacionado não derruba a aprovação nem some calado | B-09, B-31 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) | S-61, S-62 |
| Vários pedidos na bandeja continuam abrindo o card certo | B-10 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) | S-63 |
| Negar a notificação do SO não deixa o produto mudo | B-32 | [mobile/04-ui](../../architecture/mobile/04-ui.md#quando-o-usuário-nega-a-notificação-do-so) | S-64 |
| As três regras do stream, também no app | B-15 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-28…S-31 |
| O socket cai em background, e isso é correto | B-16 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-32…S-35 |
| Telas do app com os quatro estados e sem literal | B-17…B-19 | [mobile/04-ui](../../architecture/mobile/04-ui.md), [02-i18n](../../architecture/shared/02-i18n.md) | S-36…S-38 |
| A tela de permissão do celular, e o toque acidental | B-20…B-22, B-24 | [mobile/04-ui](../../architecture/mobile/04-ui.md#a-tela-de-permissão) | S-39…S-44, S-48, S-49 |
| Abrir pelo push revalida no servidor, nunca renderiza o payload | B-23 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) | S-45…S-47 |
| Logout desregistra o push e não deixa dado do usuário anterior | B-25 | [mobile/07-auth](../../architecture/mobile/07-auth.md) | S-50 |
| Quem decide de longe pode pedir mais prazo, sem escolher o número | B-33 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#estender-o-prazo-é-mexer-na-única-proteção-que-existe) | S-65, S-66 |
| Os cenários e2e que só existem com duas pontas | B-26…B-28 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md#cenários-e2e-obrigatórios) | S-51…S-57 |
| O e2e do app roda sem inviabilizar a máquina | B-29 | [F6 do bootstrap](../00-bootstrap/F6-scripts-e2e.md) | S-58 |
| O resultado do e2e é comparável entre duas máquinas | B-34 | [mobile/06-testing](../../architecture/mobile/06-testing.md#e2e) | S-67 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
└── commands/    device-register (HTTP, mas o payload é contrato compartilhado)

backend/src/
├── domain/{auth,notification}/          Device · PushMessage
├── application/{auth,notification}/     ports/push.port.ts
├── adapter/
│   ├── inbound/http/devices/
│   └── outbound/push/                   o ÚNICO lugar que conhece o provedor
├── infrastructure/database/{schema,migrations}/
└── shared/i18n/locales/{en,pt-BR}.json  catálogo do backend — só para push

web/src/features/devices/{components,hooks,services}/

mobile/lib/
├── core/network/                        WsClient com o contrato completo
├── core/notifications/                  recebimento, canal, deep link
└── features/{session,permission}/{data,domain,presentation}/

mobile/integration_test/                 registro pendente, permissão, deep link
e2e/scenarios/                           os cenários de duas pontas
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **Qual provedor de push** — FCM + APNs direto, ou um intermediário | **decidido em 2026-09-15** ([D-03](decisions.md), com [D-12](decisions.md) fixando Android): **FCM direto**. O nome dele não sai da configuração e o adapter é o único que o conhece |
| R-02 | Push é um terceiro no caminho de uma decisão de segurança | mitigado por desenho: o payload não carrega conteúdo, e a tela **revalida no servidor** antes de renderizar |
| R-03 | Biometria não existe em emulador de CI de forma confiável | a regra é testada por widget com o autenticador fakeado; o caminho real fica no `integration_test`, que não é portão |
| R-04 | Notificação entregue com atraso pelo SO, depois do `expiresAt` | tratado como caso normal, não como erro: S-57 exige que o app mostre o estado real |
| R-05 | O e2e do app é caro e já derrubou uma máquina | receita de cgroup da [F6 do bootstrap](../00-bootstrap/F6-scripts-e2e.md), mais o teto de memória do Gradle (B-29) |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. As decisões deste plano estão fechadas — só D-17 segue ⛔, travada pelo
   [plano 06](../06-distribution/decisions.md), e não bloqueia fase nenhuma daqui.
3. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`.
4. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
