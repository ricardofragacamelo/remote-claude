# Plano 17 — Dispositivos

**Objetivo:** os celulares que respondem permissão ganham uma tela de gestão completa — aprovar
reconhecendo o aparelho, identificar, testar a notificação, renomear e revogar, um ou vários —,
que explica com todas as letras o que um aparelho aprovado pode fazer.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full      # portões 1-11, sai com código 0
pnpm test:e2e:mobile  # o integration_test do app contra a stack efêmera, sai com código 0
```

**Depende de:** [plano 02](../02-mobile-approval/README.md) (o `Device`, a aprovação só pelo
navegador, a revogação com `4401`, o pendente que expira, o push sem conteúdo — tudo continua
valendo, e cada garantia tem cenário de regressão aqui); [plano 06](../06-workbench/README.md)
(navegação global, tela de Configurações com a seção Dispositivos, screen frame com gaveta de
ajuda, command palette, registro de atalhos e centro de notificações). O
[plano 14](../14-audit-explained/README.md) é opcional: com ele, o histórico do aparelho abre a
invocação na trilha explicada; sem ele, abre `/audit` filtrado pela sessão. Os endpoints novos
entram nos limites do [plano 05](../05-hardening-operations/README.md).

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

O plano 02 entregou a **regra**: token prova *quem*, registro de aparelho prova *de onde*, e só o
navegador aprova. A **tela** que ele entregou é o mínimo que torna a regra operável — um cartão por
aparelho com nome, plataforma, "visto por último" e dois botões. Isso basta para aprovar o primeiro
celular. Não basta para responder as perguntas que aparecem depois:

- *"este pendente é mesmo o meu celular?"* — a lista mostra o nome que o próprio aparelho declarou,
  que qualquer um pode escolher, e nada que se possa conferir olhando para o telefone;
- *"por que a notificação não chegou?"* — a tela sabe só se existe token. Não sabe se o provedor o
  recusou, se o usuário negou a notificação no SO, nem quando foi a última entrega;
- *"o que este aparelho já aprovou?"* — a trilha diz `resolvedFrom: mobile`, e não **qual** celular;
- *"como tiro os três aparelhos velhos de uma vez?"* — um por um, com confirmação cada;
- *"o que aprovar deixa ele fazer?"* — a tela não diz.

Aprovar um aparelho é autorizar, de antemão, alguém que segura aquele telefone a mandar executar
comando na máquina. A tela onde isso se decide precisa ser a mais clara do produto, não a mais
magra.

### O que já existe — verificado no código em 2026-09-26

| Fato | Onde | Consequência aqui |
|---|---|---|
| Estados são só `pending`, `approved`, `revoked`; o pendente vencido é **apagado** e deixa `device.expired` na trilha — não existe estado "expirado" | `device-status.value-object.ts`, `ExpirePendingDevicesUseCase` | "Expirado" aparece no histórico e como contagem regressiva do pendente, nunca como linha da lista |
| `last_seen_at` existe, mas só muda no `POST /devices` (login e rotação de token); o handshake não o toca; o web mostra o ISO cru | `Device.refresh`, `devices.row.lastSeen` | "último acesso" precisa de definição ([D-02](decisions.md#d-02--último-acesso)) e de formatação |
| Estado do push é só `pushEnabled` (há token); o desfecho da entrega não é guardado; a permissão do SO o app conhece (`PushReachBanner`) e não informa | `devices.dto.ts`, `push-dispatcher.ts` | [D-05](decisions.md#d-05--o-estado-do-push), B-08, B-15 |
| O registro não traz modelo do aparelho nem versão do SO | `device-register.schema.json` | campos opcionais novos no contrato (B-03) |
| `resolvedFrom` é só `web` ou `mobile` — não diz **qual** aparelho respondeu | `permission.module.ts`, `audit_entries` | coluna nova para o histórico por aparelho ([D-08](decisions.md#d-08--histórico-do-aparelho)) |
| Não existe leitura de `audit_events` por HTTP — só `GET /audit-entries` | `adapter/inbound/http/` | o histórico do aparelho é endpoint deste plano (B-13) |
| O backend já revoga pendente; a tela só oferece revogar o aprovado; não há recusar nem lote | `RevokeDeviceUseCase`, `DeviceRow.tsx` | B-11, B-20 |
| Revogar fecha as connections daquele `installId` com `4401`, também quando já estava revogado | `RevokeDeviceUseCase`, `connection-registry.ts` | regressão obrigatória (S-40, S-112) |
| **`save()` é um upsert que reescreve `status`.** Reabrir o app (`refresh`) ou apagar um token recusado, concorrendo com uma revogação, grava o `approved` que tinham lido e **desfaz a revogação** | `drizzle-device.repository.ts`, `RegisterDeviceUseCase`, `ForgetPushTokenUseCase` | defeito real, fora do que o S-10 do plano 02 cobre (ele prova a entidade, não o banco) — B-05 é a primeira task do backend ([R-01](#riscos-e-decisões-em-aberto)) |
| [backend/03 · auth](../../architecture/backend/03-modules.md#auth) ainda diz que revogar "invalida seus refresh tokens" — contradiz a [D-18 do plano 02](../02-mobile-approval/decisions.md#d-18--o-que-a-revogação-consegue-prometer) — e não documenta os endpoints de `devices` | `docs/architecture/backend/03-modules.md` | B-01 corrige |

---

## Escopo

### Entra

| | |
|---|---|
| Documentos normativos, contrato HTTP, contrato compartilhado com o app e códigos de erro | F0 |
| Transições de estado com guarda no banco — a revogação não pode ser desfeita por corrida | F1 |
| Último acesso, "conectado agora", estado do push (token, permissão do SO, última entrega) | F1 |
| Renomear, recusar pendente, revogar em lote, push de teste, histórico do aparelho, aparelho inativo | F1 |
| O app informa modelo, versão do SO e permissão de notificação, mostra o código de verificação e recebe o push de teste | F1 |
| A tela: lista densa com filtros, busca e ordenação, painel de detalhe, aprovar com segundo passo, lote, atualização viva, aviso global de pendente | F2 |
| Usabilidade e ajuda da tela: gaveta de ajuda, tooltips, estados vazios que ensinam, atalhos, palette, axe | F2 |
| Aprovado no navegador, o celular fica sabendo: o push `deviceApproved` e a atualização viva | F3 |
| E2E pela porta do usuário — web e app —, com as garantias do plano 02 como regressão | F4 |

### Não entra

- **O app ganhar uma tela de gestão de aparelhos.** Aprovar é só pelo navegador
  ([08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile));
  reabrir isso é ADR, não plano. O app muda só no que o contrato exige (B-15) — sem tela nova,
  como os princípios do roteiro mandam.
- **Encerrar a sessão do usuário no provedor ao revogar.** O backend é Resource Server e nunca vê o
  refresh token do app ([02 · D-18](../02-mobile-approval/decisions.md#d-18--o-que-a-revogação-consegue-prometer));
  a tela **diz** isso na ajuda, em vez de prometer.
- **Reautenticação recente (step-up) para aprovar.** O mecanismo é do [plano 05](../05-hardening-operations/README.md)
  e do [plano 12](../12-integrated-terminal/README.md); aqui fica a
  [D-12](decisions.md#d-12--reautenticar-para-aprovar), com a recomendação de não bloquear.
- **Localização, IP ou endereço de rede do aparelho.** O último acesso guarda só o instante
  ([D-02](decisions.md#d-02--último-acesso)).
- **Revisão da trilha como tela.** A linha do tempo explicada é do
  [plano 14](../14-audit-explained/README.md); o histórico daqui é recortado **por aparelho** e
  leva para lá.
- **iOS.** Continua como o [plano 02 · D-12](../02-mobile-approval/decisions.md) fechou: compila,
  não é exercitado. Reabrir é do [plano 19](../19-distribution/README.md).

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Contrato](F0-contract.md) | normativos atualizados, contrato HTTP e do app, códigos de erro | B-01…B-04 | 🔲 |
| F1 | [Backend de dispositivos](F1-devices-backend.md) | guarda no banco, estado do push, renomear, lote, teste, histórico, inativo, e o app informando | B-05…B-15 | 🔲 |
| F2 | [Tela de dispositivos](F2-devices-screen.md) | a tela completa, com ajuda, atalhos e aviso global de pendente | B-16…B-23 | 🔲 |
| F3 | [O celular fica sabendo que foi aprovado](F3-approval-push.md) | o push `deviceApproved` e o app que se atualiza ao ser aprovado — antes da F0, pela D-13 | B-29…B-31 | ✅ |
| F4 | [E2E](F4-e2e.md) | os fluxos pela porta do usuário, no web e no app, e as regressões do plano 02 — sempre a última fase | B-24…B-28, B-32 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| O contrato do app cresce sem quebrar o app antigo | B-03, B-15 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos) | S-01…S-03, S-72…S-76 |
| Todo erro novo tem código, status com significado e tradução | B-04 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio) | S-04, S-05 |
| Revogado é terminal **no banco**, não só na entidade — nenhuma corrida o desfaz | B-05 | [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) | S-06…S-10 |
| O aparelho se reconhece: nome escolhido pelo dono, modelo, SO e código de verificação | B-06, B-10, B-15 | [backend/05-persistence](../../architecture/backend/05-persistence.md#o-device-do-celular) | S-11…S-14, S-33…S-39, S-73 |
| Último acesso e "conectado agora", sem guardar onde o aparelho estava | B-07 | [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) | S-15…S-20 |
| A tela sabe por que a notificação não chega | B-08, B-15 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) | S-21…S-26, S-72, S-75 |
| A lista é só do dono, pendentes primeiro, e nunca traz o token | B-09 | [backend/03-modules](../../architecture/backend/03-modules.md#auth) | S-27…S-32 |
| Revogar um, vários, ou recusar um pendente — cada um fecha o socket e entra na trilha | B-11 | [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake) | S-40…S-47 |
| Push de teste prova o caminho inteiro, sem conteúdo, auditado e limitado | B-12 | [backend/03-modules](../../architecture/backend/03-modules.md#notification) | S-48…S-58 |
| O histórico diz o que **este** aparelho fez | B-13 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) | S-59…S-67 |
| Aparelho esquecido na gaveta é sinalizado, e revogá-lo sozinho é escolha explícita | B-14 | [08-authentication](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile) | S-68…S-71 |
| A tela tem rota própria, e o link reproduz o que se vê | B-16 | [web/01-architecture](../../architecture/web/01-architecture.md) | S-77…S-80 |
| Lista densa com os quatro estados, filtros, busca e ordenação, responsiva | B-17 | [web/03-ui-system](../../architecture/web/03-ui-system.md#estados-de-tela--os-quatro-sempre) | S-81…S-86 |
| Detalhe que explica o que o aparelho pode fazer e diagnostica o push | B-18 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-87…S-89 |
| Aprovar é um segundo passo que mostra o código e o alcance | B-19 | [web/07-auth](../../architecture/web/07-auth.md) | S-90…S-93 |
| Revogar e recusar são destrutivos: confirmação com foco na saída; lote com resultado por item | B-20 | [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-94…S-97 |
| Teste de push e renomear com resposta que ensina, e desfazer em vez de confirmar | B-21 | [web/03-ui-system](../../architecture/web/03-ui-system.md) | S-98…S-101 |
| Aparelho novo aparece sem recarregar, e o pendente é avisado fora da tela | B-22 | [web/04-state-and-data](../../architecture/web/04-state-and-data.md) | S-102…S-105 |
| Ajuda de verdade, tooltips, atalhos, teclado e axe | B-23 | [02-i18n](../../architecture/shared/02-i18n.md), [web/03-ui-system](../../architecture/web/03-ui-system.md#acessibilidade--não-é-opcional) | S-106…S-110 |
| Os fluxos pela porta do usuário, e as garantias do plano 02 como regressão | B-24…B-28 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-111…S-118 |
| Aprovado no navegador, o celular fica sabendo: push e atualização viva | B-29…B-32 | [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md#push-notification--o-canal-que-torna-o-app-útil) | S-119…S-132 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
└── commands/    device-register        (+ model, osVersion, notificationPermission — opcionais)

backend/src/
├── domain/auth/
│   ├── entities/device.entity.ts                  rótulo, modelo, SO, estado do push, inativo
│   └── services/verification-code.ts              código curto derivado do installId
├── domain/notification/value-objects/push-kind    + 'test'
├── application/auth/
│   ├── rename-device.use-case.ts
│   ├── revoke-devices.use-case.ts                 lote, por item
│   ├── device-history.use-case.ts
│   ├── touch-device.use-case.ts                   último acesso, com janela
│   └── ports/device-history.port.ts
├── application/notification/
│   ├── send-test-push.use-case.ts
│   └── ports/push-outcome.port.ts                 o desfecho volta para o aparelho
├── adapter/inbound/http/devices/                  PATCH, revocations, test-push, history
├── adapter/outbound/persistence/auth/             UPDATE condicional por transição
├── infrastructure/database/migrations/            colunas de devices, resolved_by_device_id, kinds novos
└── shared/i18n/locales/{en,pt-BR}.json            push.test

web/src/features/devices/
├── components/   DevicesScreen · DeviceTable · DeviceCard · DeviceDetailPanel · ApproveDeviceDialog
│                 RevokeDevicesDialog · DeviceHistory · PushDiagnosis · DevicesHelp · PendingDevicesBadge
├── hooks/        useDevices · useDeviceDetail · useDeviceHistory · useDeviceActions · usePendingDevices
├── services/     device.service.ts
└── types/

mobile/lib/features/device/                        campos novos no registro, código no estado pendente
mobile/lib/core/notifications/                     kind 'test'

e2e/{scenarios,specs}/                             devices-*.json · devices.spec.ts
mobile/integration_test/                           device_management_test.dart
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | **A revogação pode ser desfeita por corrida hoje.** `save()` reescreve `status`; um `refresh` ou um token recusado lido antes da revogação grava `approved` depois dela | **aberto** — B-05 é a primeira task da F1: transição de estado por `UPDATE` condicional, e escrita que não é transição nunca toca `status` (S-06…S-10). Nenhuma task nova da F1 escreve no aparelho antes dela |
| R-02 | Último acesso é dado de rastreamento de uma pessoa | **aberto** — [D-02](decisions.md#d-02--último-acesso): só o instante, com janela de minutos, sem IP nem local; o que não é guardado está na ajuda |
| R-03 | Push de teste vira spam no celular, ou custo no provedor | **aberto** — limite por aparelho, auditado ([D-06](decisions.md#d-06--push-de-teste)), só para aprovado com token (S-50…S-56) |
| R-04 | O código de verificação ser lido como senha, ou como prova | **aberto** — ele **não** autentica nada; a ajuda e o segundo passo dizem que é para reconhecer o aparelho, não para provar ([D-04](decisions.md#d-04--código-de-verificação)) |
| R-05 | Revogar em lote o aparelho errado — revogar é terminal | **aberto** — confirmação que nomeia cada aparelho e diz que é irreversível, foco na saída, resultado por item (S-94…S-96) |
| R-06 | App antigo recebendo o push `test`, que não traz `sessionId`/`requestId` | **aberto** — o Dart de hoje descarta payload sem esses campos (`arrivalFrom` devolve `null`); o lado Android precisa ser conferido em B-15, e o teste só vai para `appVersion` que o suporte (S-76) |
| R-07 | O plano 06 não entregar a seção Dispositivos, o screen frame ou o centro de notificações a tempo | **aberto** — o 17 depende do 06 declaradamente; sem ele, a F2 não começa ([D-01](decisions.md#d-01--onde-a-tela-mora)) |
| R-08 | Histórico por aparelho sem as respostas antigas | **aceito** — entradas anteriores à coluna ficam como "aparelho não registrado nesta versão", nunca atribuídas a um aparelho por palpite (S-63) |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Feche as [decisões](decisions.md) que bloqueiam a fase antes de abri-la — D-01…D-07 bloqueiam
   a F0.
3. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`.
4. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
5. Três ciclos sem progresso no mesmo portão → **pare e escale**.
