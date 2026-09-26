# Estado e dados no Flutter

Voltar para o [índice do mobile](README.md).

---

## Onde cada estado mora

| Estado | Onde | Exemplo |
|---|---|---|
| Dado do servidor | provider Riverpod (async) | lista de sessões |
| Stream ao vivo (WS) | provider de stream + notifier | eventos da sessão |
| UI local de widget | `setState` | expandido/recolhido |
| UI compartilhada | provider | tema, locale |
| Navegação | **a rota** (`go_router`) | sessão ativa |
| Credencial | **armazenamento seguro do SO** | tokens |

Como no web: **não copie dado do servidor para dentro de estado local**. Isso cria uma
segunda fonte de verdade que envelhece sozinha.

---

## Rede

| Preocupação | Pacote |
|---|---|
| HTTP | `dio` |
| WebSocket | `web_socket_channel` |
| Serialização | `json_serializable` + `freezed` |
| Armazenamento seguro | `flutter_secure_storage` |

### `dio` — interceptors

Um cliente, com interceptors que cuidam de: `Authorization`, `x-trace-id`, `Accept-Language`,
renovação de token no `401` (uma vez), logging de I/O em `debug`, e conversão de
`DioException` em `Failure`.

**Nenhum data source trata isso individualmente** — é responsabilidade do cliente. Ver
[05-logging.md](05-logging.md) e [07-auth.md](07-auth.md).

---

## WebSocket

O ponto mais delicado do app, porque o celular perde conexão o tempo todo.

### `WsClient` — dono do socket

Conecta, autentica no handshake, **reconecta com backoff exponencial + jitter**, pede replay
com `resumeFromSeq`, valida frame contra o contrato gerado, renova credencial com
`connection.reauthenticate` e loga I/O. Vive em `core/network/`, não conhece widget.

Ver [contrato](../shared/05-websocket-protocol.md).

**Várias features observam a mesma sessão pelo único socket** — a conversa e a fila de permissão
([02 · D-24](../../plans/02-mobile-approval/decisions.md#d-24--duas-telas-um-socket)). O `WsClient`
anexa uma vez, re-anexa retomando do assinante **mais atrasado** quando chega outro (reentregar o
que alguém já aplicou custa nada, por causa da primeira regra abaixo), e só manda `session.detach`
quando sai o último. Ele entrega a quem assina tanto `event` quanto `request` — o
`permission.requested` é um `request` — e os frames `error` vão para os observadores, correlacionados
pelo `id` do comando que os causou (`WsClient.send` devolve esse `id`).

**`4401` é anunciado**, não só reconectado (`WsClient.rejections`). Reconectar basta para um token
que expirou; não basta para um aparelho **revogado** com o app aberto, que continuaria dizendo
"aprovado" na tela. O `app/` escuta e pede o status do aparelho de novo — por `GET /devices`, uma
leitura: re-registrar sobrescreveria o push token a cada token expirado (S-56).

### As três regras do stream

Idênticas às do web, porque o problema é o mesmo:

1. **Descarte evento com `seq <= lastSeq`** — replay reentrega; sem isso, mensagem duplica.
2. **`gap: true` → limpe o estado e recarregue o transcript por HTTP.** Não costure buraco.
3. **`message.delta` acumula por `messageId`**; `message.completed` substitui o acumulado.

### Ciclo de vida do app — o que é específico do mobile

```
resumed   → reconecta, attach com resumeFromSeq, revalida token
inactive  → mantém
paused    → fecha o socket. É esperado.
detached  → libera tudo
```

**O socket cai em background, e isso é correto** — segurar socket em background drena bateria
e o SO mata mesmo assim. É exatamente por isso que existe push notification.

Use `AppLifecycleListener`. Nunca assuma que o socket sobreviveu ao retorno do background:
sempre reconecte e peça replay.

---

## Push notification — o canal que torna o app útil

Quando o Claude pede permissão e ninguém está com o app aberto, o push é o que faz a sessão
não ficar parada até o timeout.

| Regra | Por quê |
|---|---|
| Payload **já traduzido**, no `Device.locale` | o SO não traduz. Única exceção de i18n — ver [i18n](../shared/02-i18n.md) |
| Traz `sessionId`, `requestId` e `expiresAt` | permite abrir direto no card certo |
| **Nunca** traz conteúdo de arquivo nem output de comando | push passa por servidor de terceiro |
| Toque abre direto na permissão pendente | deep link para `/sessions/:id/permissions/:reqId` |
| Push de permissão já resolvida é **cancelado** | notificação zumbi para ação que não existe mais |
| Device precisa estar **aprovado** | ver [07-auth.md](07-auth.md) |

**O fornecedor não atravessa a fronteira do Dart.** Receber push na Android exige a biblioteca de
quem entrega, e um `import` dela seria o nome do fornecedor dentro de `lib/` — que
[S-26](../../plans/02-mobile-approval/scenarios.md) proíbe por regra de máquina. Então o Dart
conhece **uma porta** (`PushGateway`, em `core/notifications/`) e um `MethodChannel` com nome do
produto; a biblioteca e o segredo vivem em `android/` e na configuração, como qualquer
dependência de plataforma. É a mesma divisão que o backend faz, onde `adapter/outbound/push/`
conhece um endpoint e uma credencial e nunca quem responde por eles
([02 · D-21](../../plans/02-mobile-approval/decisions.md#d-21--o-fornecedor-não-atravessa-a-fronteira-do-dart)).

Disso sai um estado que a UI precisa ter: **sem transporte configurado, o canal responde
"indisponível"**, e isso **não** é o mesmo que o usuário ter negado a notificação. Quem negou pode
voltar atrás nas configurações do SO; um build sem transporte não oferece nada para o usuário
mudar, e dizer "você negou" seria mentira. São duas frases diferentes, de propósito.

O que liga o transporte é **um arquivo**, de quem opera: `mobile/android/app/google-services.json`,
fora do git. O plugin do Gradle que o lê só é aplicado quando ele existe — sem ele o build compila,
o app roda e o canal responde "indisponível". A retirada de uma notificação usa o par
`(tag = requestId, id = 0)`, que é o que a biblioteca do fornecedor usa quando mostra a mensagem
sozinha com o app em background; assim a mesma chamada retira a notificação qualquer que seja
quem a pôs na tela.

Ao abrir pelo push, **revalide o estado no servidor**. O push pode ter atrasado, e a permissão
pode ter expirado ou sido resolvida em outro dispositivo — nunca renderize a partir do payload
da notificação.

A revalidação é uma **consulta**, `GET /sessions/:sessionId/permissions/:requestId`, e não o replay
do `attach`: o attach republica os pendentes sem dizer quando terminou, e "não chegou" não prova
"não existe" ([02 · D-22](../../plans/02-mobile-approval/decisions.md#d-22--revalidar-é-perguntar-não-esperar)).
Até ela responder a tela mostra que está conferindo — mesmo que o socket já tenha entregado o pedido.
Depois, o que o stream disser vence a resposta. Responder continua sendo pelo socket, e só depois
que o attach reentregar o frame, que é o que dá o `correlationId`.

---

## Offline e conectividade

O app **não** é offline-first: sem conexão não há Claude, e permissão precisa de resposta em
tempo real. O que é obrigatório:

- Estado de conexão **visível** na UI. Aprovar permissão achando que está online, e não estar,
  é a pior falha possível aqui.
- Ação que exige rede fica desabilitada, com explicação.
- Nada de fila de ação para "enviar depois": permissão respondida offline chegaria expirada,
  autorizando algo que o usuário já não vê contexto.

---

## Providers de stream

```dart
@riverpod
Stream<SessionEvent> sessionEvents(Ref ref, SessionId id) {
  final client = ref.watch(wsClientProvider);
  ref.onDispose(() => client.detach(id));   // obrigatório
  return client.attach(id);
}
```

`ref.onDispose` com `detach` não é opcional: sem ele, navegar entre sessões acumula
subscrição e o app passa a processar evento de tela que já saiu.

---

## Performance

- `const` em todo widget que puder. É a otimização de maior impacto e menor custo no Flutter.
- `ListView.builder` para lista longa — nunca `Column` dentro de `SingleChildScrollView` com
  N itens.
- `select` para escutar só o campo que interessa, em vez do objeto inteiro.
- Parsing de JSON grande (transcript longo) em `compute()`, fora da thread de UI.
- Nunca faça I/O dentro de `build()`.
