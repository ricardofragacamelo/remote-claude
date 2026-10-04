# F3 — O celular fica sabendo que foi aprovado

Plano: [17 — Dispositivos](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** nada deste plano. É a exceção declarada à ordem das fases
([D-13](decisions.md#f3--o-celular-fica-sabendo-que-foi-aprovado)): o usuário pediu antes da F0, e
nada aqui usa o que a F0…F2 vão construir. Do [plano 02](../02-mobile-approval/README.md) vêm a
aprovação pelo navegador, o push e o canal nativo.
**Entrega:** aprovar o celular no navegador manda a ele um push "Este celular foi liberado", no idioma
do aparelho, e o app, aberto, atualiza o próprio estado na hora — a faixa "esperando aprovação" some
sem reiniciar. Aberto sem o push (token ausente, provedor fora), o app confere de novo ao voltar ao
primeiro plano.

**Decisões que precisam estar fechadas para começar:** [D-13…D-16](decisions.md#f3--o-celular-fica-sabendo-que-foi-aprovado).

---

## Por quê

Hoje aprovar só grava e audita (`ApproveDeviceUseCase`). O app descobre na próxima vez que se registra
— reabrir o app, ou o provedor girar o token —, então a pessoa aprova no navegador, olha o celular, e
ele continua dizendo "esperando aprovação".

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-29 — O push `deviceApproved`, do lado do backend ✅

- `PUSH_KINDS` ganha `deviceApproved`. O `PushMessage` passa a ter um **assunto**: o pedido de
  permissão de hoje, ou o aparelho (`deviceId`) — com a sua tag (`device:<id>`), nunca silencioso.
- O `PushTranslator` ganha `deviceApproved(locale)`: `push.device.approved.title` e `.body`, em `en` e
  `pt-BR`, sem conteúdo nenhum além do fato.
- O `HttpPushSender` monta `data = { kind, deviceId }` para ele, com bloco `notification` (D-14) e o
  canal `device_status` no Android; o log diz o `deviceId` no lugar do `requestId`.
- `ApproveDeviceUseCase` publica, **só numa aprovação de verdade** (não na segunda), o fato
  "aparelho aprovado" por uma porta de eventos — o `AuthModule` não pode importar o `NotificationModule`.
  Um listener em `adapter/outbound/notification` chama `NotifyDeviceApprovedUseCase`, que manda **uma**
  tentativa ao token do aparelho aprovado (D-15). Sem token, nada sai, e o log diz. Token recusado pelo
  provedor é esquecido, como no plano 02. Falha do push nunca desfaz nem atrasa a aprovação.

### B-30 — O app recebe, mostra e se atualiza ✅

- Android: o `PushPayload` aceita `deviceApproved` com `deviceId` (os campos obrigatórios passam a
  depender do kind). Em primeiro plano, o serviço mostra a notificação no canal novo
  `device_status` ("Estado do aparelho"), criado junto com o de pedidos. Tocar abre o app, sem deep link.
- Dart: a chegada vira um tipo próprio (`DeviceApprovedArrival`); o `PushController` chama
  `DeviceController.recheck()`, e a faixa do aparelho troca para aprovado.
- Sem push: com o aparelho pendente, voltar ao primeiro plano confere o estado de novo (D-16).

### B-31 — Documentação ✅

`mobile/03` (a tabela do push ganha o kind e o canal), `backend/03` (`notification`: o fato do aparelho
aprovado e a porta), e o README do app.

---

## Cenários cobertos

S-119…S-131. O e2e (S-132) é a B-32, na [F4](F4-e2e.md).

## Critério de conclusão

```bash
pnpm verify:full        # portões 1-11, sai com código 0 (o e2e é a B-32, na F4)
```
