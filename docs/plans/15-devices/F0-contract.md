# F0 — Contrato

Plano: [15 — Dispositivos](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 02](../02-mobile-approval/README.md) concluído e [plano 06 · F0](../06-workbench/README.md)
(as rotas das Configurações e o screen frame desenhados). Decisões [D-01…D-07](decisions.md#f0--contrato)
fechadas.
**Entrega:** o que o aparelho mostra e o que se faz com ele está escrito nos normativos, nos
contratos (HTTP e o compartilhado com o app) e no catálogo de erros — antes de uma linha de
implementação.

---

## Por que primeiro

Porque três pontas leem o mesmo aparelho: o backend grava, o web mostra, o app informa. Os campos
novos do registro são contrato compartilhado — mudar o schema numa ponta só é bug
([05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md#versionamento-e-geração-de-tipos)).
E os normativos de hoje contêm uma promessa que a implementação não cumpre (revogar "invalida os
refresh tokens"): planejar a tela em cima de um documento errado é construir a ajuda em cima dele.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — Normativos: o que o aparelho mostra e o que se faz com ele 🔲

Atualizar, na mesma entrega:

- [08-authentication § Device](../../architecture/shared/08-authentication.md#device-e-o-canal-mobile):
  rótulo do dono × nome informado ([D-03](decisions.md#d-03--quem-renomeia)), código de
  verificação e o que ele **não** é ([D-04](decisions.md#d-04--código-de-verificação)), último
  acesso e o que não se guarda ([D-02](decisions.md#d-02--último-acesso)), recusar pendente,
  revogar em lote, aparelho inativo ([D-09](decisions.md#d-09--aparelho-inativo)).
- [backend/03 · auth](../../architecture/backend/03-modules.md#auth): **corrigir** "revogar
  invalida seus refresh tokens" para a promessa da
  [02 · D-18](../02-mobile-approval/decisions.md#d-18--o-que-a-revogação-consegue-prometer), e
  documentar **todos** os endpoints de `devices` com a tabela de status — os quatro que existem e
  não estão lá, e os novos de B-02, como a seção `audit` já faz para `GET /audit-entries`.
- [backend/03 · notification](../../architecture/backend/03-modules.md#notification): o kind
  `test`, e que o desfecho de cada entrega volta para o aparelho (sem conteúdo).
- [backend/05-persistence § O device do celular](../../architecture/backend/05-persistence.md#o-device-do-celular):
  as colunas novas e por que cada transição de estado é `UPDATE` condicional (B-05).
- [web/03-ui-system](../../architecture/web/03-ui-system.md): seção nova "Dispositivos", no molde
  de "Regras" — o que a tela mostra, segundo passo de aprovar, destrutivos com foco na saída, lote.
- [web/07-auth § Registro de device](../../architecture/web/07-auth.md): aponta para a seção nova.

**Por quê:** decidir sem atualizar o normativo é decisão que o resto do repositório não conhece
([README dos planos](../README.md)). Critério: `pnpm docs:check`.

### B-02 — Contrato HTTP de `devices` 🔲

Escrito em [backend/03 · auth](../../architecture/backend/03-modules.md#auth), com status de cada
caso. O desenho, a confirmar pelas decisões:

| Rota | O que faz | Status |
|---|---|---|
| `GET /devices` | a lista enriquecida: `displayName`, `label`, `reportedName`, `model`, `osVersion`, `platform`, `appVersion`, `locale`, `status`, `verificationCode`, `connected`, `lastSeenAt`, `registeredAt`, `approvedAt`, `revokedAt`, `pendingExpiresAt`, `inactive`, `push { tokenPresent, osPermission, lastDelivery { at, outcome } \| null }`; e, no nível da lista, `pushConfigured` | `200` |
| `GET /devices/:id` | um aparelho, mesmo formato | `200`, `404 NOT_FOUND` (inexistente **ou** de outro) |
| `PATCH /devices/:id` | `{ label: string \| null }` — só o rótulo | `200`, `400 INVALID_INPUT`, `403 FORBIDDEN` (chamador é aparelho, se [D-03](decisions.md#d-03--quem-renomeia) confirmar), `404` |
| `POST /devices/revocations` | `{ deviceIds: string[] }` (1…50) — revoga ou recusa cada um | `200 { results: [{ deviceId, outcome: revoked \| unchanged \| notFound \| failed, error? }] }`, `400 INVALID_INPUT` |
| `POST /devices/:id/test-push` | manda o push de teste e espera a primeira tentativa | `200 { outcome: 'delivered', at }`, `409 DEVICE_NOT_REACHABLE`, `502 PUSH_PROVIDER_FAILED`, `503 SERVICE_UNAVAILABLE`, `429 RATE_LIMITED`, `404` |
| `GET /devices/:id/history` | fatos do aparelho (da trilha) e respostas de permissão dadas por ele, paginadas | `200 { events, answers, nextCursor }`, `400 INVALID_INPUT`, `404` |

Regras que o contrato carrega, e que viram cenário:

- **O push token e o `installId` inteiro nunca cruzam** — como hoje (`devices.dto.ts`). O código de
  verificação é derivado, e não é prefixo nem sufixo do `installId` (S-14, S-30).
- **`POST`/`DELETE /devices/:id/approval` continuam como estão** — o `x-install-id` presente
  continua recusando a aprovação com `403 FORBIDDEN`
  ([02 · D-02](../02-mobile-approval/decisions.md#d-02--quem-aprova)).
- Um `200` com desfecho de falha no corpo **não** existe: falha do provedor é `502`, token recusado
  é `409` — [04-errors-and-http](../../architecture/shared/04-errors-and-http.md). O lote é a
  exceção declarada: o pedido deu certo, e cada item diz o que aconteceu com ele
  ([D-07](decisions.md#d-07--revogar-em-lote)).

### B-03 — Contrato compartilhado com o app 🔲

`packages/contracts/schema/commands/device-register.schema.json` ganha três campos **opcionais**:
`model` (texto curto, ex.: "Pixel 8"), `osVersion` (ex.: "Android 15") e `notificationPermission`
(`granted` \| `denied` \| `notAsked` \| `unavailable` — as mesmas quatro palavras que o
`PushPermission` do app já usa). Opcional porque app antigo continua registrando
([D-05](decisions.md#d-05--o-estado-do-push)).

O kind de push `test` entra em `domain/notification` e no que o app reconhece. O payload dele
carrega `kind`, `deviceId` e o texto já traduzido — e **nada** de sessão, pedido, comando ou
arquivo ([02 · B-12](../02-mobile-approval/F1-push.md)).

TypeScript e Dart regerados na mesma entrega (`pnpm contracts:generate`, `pnpm contracts:check`).

### B-04 — Códigos de erro e chaves de tradução 🔲

No [catálogo](../../architecture/shared/04-errors-and-http.md#catálogo-de-erros-de-domínio)
**antes** do código, e em `error-catalogue.ts`:

| `code` | HTTP | Novo? | Quando |
|---|---|---|---|
| `DEVICE_NOT_REACHABLE` | 409 | **novo** | o push de teste não tem para onde ir: `params.reason` = `notApproved` \| `noPushToken` \| `tokenRejected` \| `appTooOld` |
| `PUSH_PROVIDER_FAILED` | 502 | **novo** | o provedor falhou ou recusou a mensagem: `params.delivery` = `failed` \| `rejected` — upstream, não bug nosso |
| `SERVICE_UNAVAILABLE` | 503 | existente | credencial de push ausente — `messageKey` nova `devices.error.pushNotConfigured`, com `Retry-After` como o catálogo exige |
| `RATE_LIMITED` | 429 | existente | teste repetido dentro da janela — `params.scope: 'testPush'` |
| `INVALID_INPUT` | 400 | existente | rótulo inválido, lote vazio ou acima do teto, cursor malformado |
| `NOT_FOUND` | 404 | existente | aparelho inexistente ou de outra pessoa — a mesma resposta |
| `FORBIDDEN` | 403 | existente | aparelho aprovando aparelho; aparelho renomeando (se D-03 confirmar) |

Chaves `devices.error.*` en/pt-BR no web e `push.test.*` no catálogo do backend, que existe **só**
para push ([02-i18n](../../architecture/shared/02-i18n.md)). Escreva primeiro em `en`.

---

## Cenários cobertos

S-01…S-05.

---

## Critério de conclusão

```bash
pnpm verify
pnpm contracts:check
pnpm docs:check
```
