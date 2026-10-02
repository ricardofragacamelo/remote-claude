# F1 — Backend de dispositivos

Plano: [17 — Dispositivos](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md). Decisões [D-08…D-10](decisions.md#f1--backend-de-dispositivos)
fechadas.
**Entrega:** o backend responde tudo o que a tela vai perguntar — e a revogação deixa de poder ser
desfeita por corrida.

---

## Por que a guarda vem antes de tudo

Esta fase acrescenta **quatro** escritas novas no aparelho (último acesso, desfecho do push,
rótulo, permissão do SO). Hoje toda escrita passa por um `save()` que reescreve o `status` que o
use case leu. Cada escrita nova seria mais uma janela para gravar `approved` por cima de um
`revoked`. Por isso B-05 é a primeira task, e nenhuma outra da fase escreve antes dela.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-05 — Transição de estado com guarda no banco 🔲

O defeito, medido na leitura do código: `DrizzleDeviceRepository.save()` é um upsert que grava
`status`, `approvedAt` e `revokedAt` do objeto que o use case tem em mãos. `RegisterDeviceUseCase`
(o app abrindo, a rotação de token) e `ForgetPushTokenUseCase` (token recusado) leem o aparelho,
fazem outra coisa, e salvam — se uma revogação entrou entre a leitura e a escrita, ela é
**desfeita**. O S-10 do plano 02 prova a entidade (revoked é terminal em memória), não o banco.

A correção, sem mudar a regra:

- **transição de estado** (aprovar, revogar) é `UPDATE … WHERE status <> 'revoked'` (e, para
  aprovar, `AND status = 'pending'`), com o resultado dizendo se houve linha — é o banco que
  garante o terminal;
- **escrita que não é transição** (refresh, esquecer token, último acesso, desfecho do push,
  rótulo) é um `UPDATE` dos **seus** campos, e nunca toca `status`;
- esquecer um token recusado é *compare-and-clear*: só apaga se o token gravado ainda é o recusado
  — senão a rotação que chegou no meio perde o token novo;
- o registro novo continua sendo o `INSERT` com a chave `(user_id, install_id)`
  ([backend/05](../../architecture/backend/05-persistence.md#o-device-do-celular)).

Testes: integração com duas transações intercaladas (a leitura antes, a revogação no meio, a
escrita depois) para cada escrita existente — é o único nível que prova isto.

### B-06 — Migration e entidade: o aparelho se reconhece 🔲

Migration versionada nova em `devices`: `label` (do dono, anulável), `model`, `os_version`,
`notification_permission`, `last_push_at`, `last_push_outcome` — todas anuláveis, porque as linhas
de hoje não têm nada disso e nenhum aparelho muda de estado ao migrar. O `name` que existe passa a
ser lido como **nome informado** pelo app.

Na entidade `Device`: `displayName` (rótulo, senão o informado), `rename`/`clearLabel`, os campos
novos no `refresh` (que **nunca** escreve o rótulo).

O **código de verificação** ([D-04](decisions.md#d-04--código-de-verificação)) é função pura em
`domain/auth/services/`: derivado do `installId` por hash, curto (6 caracteres de um alfabeto sem
ambíguos, em dois grupos de 3), estável, e que não expõe o `installId`. Não é segredo, não
autentica, não é guardado — é recalculado.

### B-07 — Último acesso e "conectado agora" 🔲

Conforme [D-02](decisions.md#d-02--último-acesso): o handshake WS de um aparelho (e o
`POST /devices`, que já o faz) atualiza `last_seen_at`, com **janela** — uma escrita a cada 5
minutos por aparelho no máximo, em `UPDATE … SET last_seen_at = greatest(last_seen_at, $at)
WHERE last_seen_at < $at - janela`. Só o instante: nem IP, nem user agent, nem local.

"Conectado agora" **não** é persistido: é a pergunta ao registro de connections em memória, por
uma extensão da porta `DeviceConnections` (`countForDevice`). Handshake recusado (revogado,
desconhecido) não toca nada — o `4401` vem antes
([05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#handshake)).

Log `debug` da borda com o sufixo de 6 caracteres do `installId`, nunca o token.

### B-08 — Estado do push 🔲

Conforme [D-05](decisions.md#d-05--o-estado-do-push), três fontes, cada uma dizendo uma coisa:

- **token presente** — já existe;
- **permissão do SO** — o que o app informa no registro e a cada renovação (B-15);
- **última entrega** — o `PushDispatcher` devolve o desfecho de **cada** aparelho (`delivered`,
  `tokenRejected`, `rejected`, `failed`) por uma porta nova em `application/notification/ports/`,
  implementada por um use case de `auth` que grava `last_push_at`/`last_push_outcome` com
  `UPDATE` dos dois campos. Só o enum e o instante — nunca título, corpo nem pedido.

`pushConfigured` vem da configuração (o arquivo em `RC_PUSH_CREDENTIALS_FILE` existe e foi lido),
sem nomear fornecedor ([02 · D-20](../02-mobile-approval/decisions.md)).

A direção da dependência é a que já existe: `notification` pergunta a `auth` por use case
(`ListApprovedDevicesUseCase`, `ForgetPushTokenUseCase`), nunca pela tabela
([backend/03](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)).

### B-09 — Leitura enriquecida 🔲

`GET /devices` e `GET /devices/:id` no formato de B-02. Ordem: **pendentes primeiro** (são a ação
que a tela pede), depois último acesso. O pendente traz `pendingExpiresAt` (registro + 7 dias); o
vencido não aparece nem antes da varredura rodar — mesma regra que já protege a aprovação
([02 · D-11](../02-mobile-approval/decisions.md#d-11--o-pendente-esquecido)). Revogados continuam
na resposta ([D-10](decisions.md#d-10--revogados-na-lista)); o filtro padrão é da tela.

A resposta **nunca** traz o push token nem o `installId` inteiro (regressão do contrato de hoje).

### B-10 — Renomear 🔲

`PATCH /devices/:id { label }`, conforme [D-03](decisions.md#d-03--quem-renomeia): rótulo do dono,
1 a 60 caracteres depois de `trim`, sem caractere de controle; `null` limpa e volta ao nome
informado. Pedido com `x-install-id` → `403 FORBIDDEN`, pelo mesmo motivo da aprovação. Mesmo
rótulo de novo não grava nem audita. Rótulo novo entra na trilha como `device.renamed` (kind novo,
migration no `CHECK` de `audit_events`), com o rótulo anterior e o novo em `details`.

### B-11 — Revogar em lote e recusar pendente 🔲

`POST /devices/revocations`, conforme [D-07](decisions.md#d-07--revogar-em-lote): **por item**,
sobre o `RevokeDeviceUseCase` que existe — cada aparelho gravado, suas connections fechadas com
`4401` e a linha na trilha, **nessa ordem**, como hoje. Ids repetidos contam uma vez; id que não é
do usuário volta `notFound` no item, sem dizer se existe; já revogado volta `unchanged`, sem nova
linha na trilha, e o socket é fechado assim mesmo (02 · S-09). Teto de 50 por pedido.

Recusar um pendente **é** revogá-lo: o backend já aceita, e é o que impede o mesmo `installId` de
voltar como pendente ao reabrir o app — reinstalar gera outro `installId`, e isso a ajuda diz.

Trilha indisponível no meio do lote: o item falha com `INTERNAL_ERROR` e o resto continua — um
fato de conta que não se registra não se dá por feito
([backend/03 · audit](../../architecture/backend/03-modules.md#audit)).

### B-12 — Push de teste 🔲

`SendTestPushUseCase` em `application/notification` — é o módulo que sabe **como** notificar.
Conforme [D-06](decisions.md#d-06--push-de-teste):

- só para aparelho **aprovado com token**, com `appVersion` que reconhece o kind `test` (a versão
  mínima é constante do backend, fixada em B-15); senão `409 DEVICE_NOT_REACHABLE` com o motivo;
- credencial ausente → `503 SERVICE_UNAVAILABLE`, antes de qualquer coisa;
- **uma** tentativa, aguardada — o usuário está olhando para o celular esperando; `delivered` →
  `200`, `tokenRejected` → token apagado (compare-and-clear, B-05), aparelho segue aprovado, `409`;
  `failed`/`rejected` → `502 PUSH_PROVIDER_FAILED`. O desfecho grava a última entrega (B-08);
- limite de 1 a cada 30 s por aparelho, pelo limitador por chave que o `client-log` já tem
  (`keyed-rate-limiter.ts`); acima → `429 RATE_LIMITED` com `Retry-After`;
- tag própria, diferente da de qualquer pedido: o cancelamento de uma permissão nunca retira o
  teste, e o teste nunca substitui um pedido na bandeja;
- auditado como `device.pushTested`, com o desfecho em `details`;
- payload traduzido no `Device.locale`, **sem** conteúdo — o teste sobre "sem output de comando" do
  plano 02 cobre o kind novo. E o nome do fornecedor continua fora do código (`pnpm scan:security`).

### B-13 — Histórico do aparelho 🔲

Conforme [D-08](decisions.md#d-08--histórico-do-aparelho). Duas partes:

1. **Gravar quem respondeu.** Coluna nova `resolved_by_device_id` em `audit_entries` (migration
   `ADD COLUMN` anulável, com o `CHECK` de que `recorded` não a tem, e índice
   `(resolved_by_device_id, seq DESC)`). Preenchida na resolução, onde o módulo `permission` já sabe
   o `installId` da connection (`permission.module.ts`) e o resolve para o id do aparelho. As
   triggers append-only continuam recusando `UPDATE` de linha — `ADD COLUMN` não é reescrita.
2. **Ler.** `GET /devices/:id/history`: `events` — os `audit_events` com `subject_id` do aparelho
   (registrado, aprovado, renomeado, teste, revogado), completos, porque são poucos — e `answers` —
   as decisões de `audit_entries` daquele aparelho, com sessão, tool, decisão e instante,
   paginadas por cursor keyset sobre `seq`, como a trilha
   ([backend/03 · audit](../../architecture/backend/03-modules.md#audit)). Entrada anterior à
   coluna não é atribuída a ninguém. Leitura pela porta de leitura da trilha, no
   `AuditQueryModule` — quem escreve continua sem saber ler.

Aparelho apagado (pendente vencido) responde `404`: o histórico dele continua na trilha, e é o
plano 14 quem a mostra.

### B-14 — Aparelho inativo 🔲

Conforme [D-09](decisions.md#d-09--aparelho-inativo): `inactive: true` para aprovado sem acesso há
mais que o limiar (padrão 30 dias, configurável). Só sinaliza. A revogação automática é
configuração **desligada por padrão** (`RC_DEVICE_INACTIVE_REVOKE_DAYS` ausente = nunca); ligada,
roda na mesma varredura que expira os pendentes, revoga pelo mesmo use case (socket fechado,
trilha `device.revoked` com `details: { by: 'job', reason: 'inactive' }`) e é idempotente. Valor
abaixo de 7 dias impede o boot — mesma disciplina da retenção da trilha.

### B-15 — O app informa o que a tela mostra 🔲

A única mudança no app, e nenhuma tela nova:

- no registro e a cada renovação, manda `model`, `osVersion` e `notificationPermission` (o estado
  que o `PushReachBanner` já calcula) — e reenvia quando a permissão muda;
- o estado pendente, que já existe, mostra o **código de verificação** calculado pela mesma regra
  (o backend o devolve no `201` do registro — o app não reimplementa o hash);
- o kind `test` é reconhecido: notificação traduzida que, tocada, abre o app sem deep link de card.
  Conferir o lado Android com o app **antigo** ([R-06](README.md#riscos-e-decisões-em-aberto)) e
  fixar a versão mínima que o backend usa para recusar o teste com `appTooOld`.

Testes de widget e unit no Dart; o caminho real fica para a F3 (`pnpm test:e2e:mobile`).

---

## Cenários cobertos

S-06…S-76.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
pnpm scan:security
```
