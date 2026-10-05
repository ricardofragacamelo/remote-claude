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
| Rascunho | **a rota** (`/draft?workspacePath=`) + um controller; nada no servidor até o primeiro envio | modelo, modo e esforço escolhidos antes da sessão |
| Texto escrito na caixa | o `TextEditingController` do widget, que sobrevive à rotação | o prompt ainda não enviado |
| Troca pendente de um chip | o controller do chip, que volta ao valor anterior na recusa | modo trocado esperando o `ack` |
| Fila de prompts | **derivada do stream** (`prompt.queued`/`prompt.dequeued`) | os prompts esperando o turno |

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

### Uma origem, escolhida no aparelho

O app fala com o servidor por **uma origem só**, e dela saem a API (`<origem>/api`), o WebSocket
(`wss://<host>/ws`, ou `ws://` para `http://localhost`) e o issuer do login (`<origem>` +
`RC_OIDC_REALM_PATH`) — [plano 10, D-13](../../plans/10-mobile-chat-layout/decisions.md#f5--endereço-de-conexão).
O encaminhamento por caminho é do servidor (o do web no dev e no e2e, a infraestrutura em produção).

| Peça | Onde | O que faz |
|---|---|---|
| `BuildConfig` | `core/config/app_config.dart` | o que o build traz: `RC_INTERNAL_URL` e `RC_EXTERNAL_URL` (vazio desliga o radio, D-12), o caminho do realm e o resto do OIDC |
| `checkOrigin` · `ConnectionEndpoints` | `core/config/connection_origin.dart` | valida e normaliza a origem — só `https`, exceto `http://localhost` e `http://127.0.0.1` (D-14) e, fora do release, `http://` para um IPv4 literal da rede privada — `10/8`, `172.16/12`, `192.168/16` ([D-20](../../plans/10-mobile-chat-layout/decisions.md#f6--instalação-por-usb)); sem caminho, query, fragmento nem usuário — e deriva os três endereços |
| `ConnectionChoice` · `DefinedOrigins.resolve` | `core/config/connection_choice.dart` | interno, externo ou outro; sem escolha, o interno, senão o externo, senão nenhum (D-17); escolha que o build não oferece mais volta ao padrão, dizendo por quê |
| `ConnectionStore` | `core/config/connection_store.dart` | a escolha e o texto do **Outro** no `flutter_secure_storage`, em `rc.connection.*` — fora de `CredentialKeys.all`, então o logout não os apaga (D-18); valor ilegível vale o padrão, com `warn` |
| `ConnectionController` · `appConfigProvider` | `core/config/app_config_provider.dart` | a escolha em memória; o `AppConfig` é **derivado** dela, e o transporte HTTP (`httpTransportProvider`), o socket e o OIDC o observam — trocar de origem reconstrói os três |
| `apiClientProvider` · `httpTransportProvider` | `core/network/api_client_provider.dart` | o `ApiClient` **não** segue a origem: pede o transporte (o `Dio` da origem em uso) a cada requisição. Se ele fosse refeito, todo data source, repositório e caso de uso sobre ele ficaria por refazer — preguiçosamente, na primeira leitura, no meio do build de uma tela —, e o Riverpod marca o escopo sujo durante o frame (achado pelo e2e do plano 10, S-111) |

**Trocar de origem com login aberto encerra o login antes de salvar**: o token é de outro issuer, e
nenhuma credencial velha chega à origem nova (S-101, S-102). Salvar a mesma escolha não faz nada. Sem
origem nenhuma, o roteador mantém o app na tela de endereço (`/connection`), a única rota fora do guard
de login — um endereço errado nunca tranca ninguém do lado de fora (R-13).

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
2. **`gap: true` → limpe o estado e recarregue o transcript por HTTP.** Não costure buraco. A
   conversa a recarregar é a que o ack nomeia em `claudeSessionId` (o `onGap` do `SessionSubscriber`
   a recebe), e a página é posta **por baixo** do que o stream trouxer enquanto ela carrega
   (`Conversation.withHistory`): mesmo `messageId`/`toolUseId` fica com o stream — salvo fragmento
   ainda em curso de uma mensagem que o histórico já tem inteira —, o resto do stream vem depois, e
   `lastSeq` não se move. O mesmo vale para uma sessão retomada: o que veio antes dela é lido da
   conversa em `resumedFrom`, nunca do ring buffer. O parsing da página roda em `compute()`.
3. **`message.delta` acumula por `messageId`.** O `message.completed` chega **por bloco**, com o mesmo
   `messageId`, e fecha o bloco em curso: o texto dele entra como bloco terminado, no lugar do que os
   deltas daquele bloco acumularam, e se **soma** aos blocos que a mensagem já tem. O bloco que fecha
   como `tool_use` ou thinking nunca apaga a resposta.

**Assinante novo só recebe evento depois da resposta ao `attach` dele.** A regra 1 supõe que o replay
chega antes do ao vivo. Na sessão que o próprio app abriu não chega: o socket já recebe a sessão desde o
`session.start`, e os eventos que caem entre o `attach` e o `session.attached` fariam o replay — a partir
do `session.started` — ser descartado como já visto. A tela perdia pasta, modelo, modo e o primeiro
prompt ([plano 10 · F10](../../plans/10-mobile-chat-layout/progress.md)). O `WsClient` segura os
`event` de um assinante até o `session.attached` que responde **ao `attach` dele** (pelo
`correlationId`), ou até a recusa desse comando: tudo o que chegou antes foi publicado antes de o
servidor ler o `attach`, e o replay traz, na ordem. `request` nunca é segurado — não faz parte de replay.

### A conversa como lista ordenada

A conversa é **uma lista ordenada de entradas** — mensagem, thinking, tool, resumo do turno e linha de
sistema —, na ordem do `seq`. É o mesmo modelo do web ([web/04](../web/04-state-and-data.md#o-painel-do-claude-dentro-da-aba)),
em Dart puro, em `domain/`. Duas listas desenhadas uma depois da outra põem toda tool depois de toda
mensagem, e não foi isso que aconteceu ([plano 10 · B-05](../../plans/10-mobile-chat-layout/F1-session-frame.md)).

As três regras acima valem para ela, e mais estas:

- **cada entrada tem um id** único entre os tipos (mensagem por `messageId`, tool por `toolUseId`,
  thinking pelo `messageId` e a posição do bloco). O `withHistory` põe a página do histórico por baixo do
  stream **por id de entrada**: a mesma entrada fica com a versão do stream, e nada aparece duas vezes;
- **um fragmento com `blockType: thinking` vira entrada de thinking**, nunca texto da resposta. O bloco
  `redacted_thinking` vira a entrada que diz que houve raciocínio, sem conteúdo;
- **um `blockType` que o app não conhece é ignorado** com log em `debug`, e o `lastSeq` anda do mesmo
  jeito — senão o replay o reentregaria para sempre;
- **o texto de subagent (`parentToolUseId`) fica fora** da conversa do app
  ([10 · D-01](../../plans/10-mobile-chat-layout/decisions.md#f0--normas));
- **a fila de prompts** é estado do stream: `prompt.queued` acrescenta, `prompt.dequeued` tira, e a
  sessão que fecha leva a fila junto, sem `prompt.dequeued` — o app a limpa no `session.closed`;
- **o modelo e o modo da sessão** vêm do `session.started` e da troca que o próprio app fez. O servidor
  confirma com `ack`, **não ecoa**: o chip muda na hora, e o `error` com o `correlationId` do comando o
  devolve ao valor anterior.

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
| O aparelho **aprovado** recebe `deviceApproved` (`{ kind, deviceId }`), no canal `device_status` | aprovado no navegador, o app pede o estado de novo e a faixa "esperando aprovação" some sem reiniciar; o toque só abre o app. Sem o push, voltar ao primeiro plano confere enquanto estiver pendente ([17 · F3](../../plans/17-devices/F3-approval-push.md)) |

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

### Várias sessões abertas ao mesmo tempo

O app mantém anexadas **todas** as sessões abertas nele, não só a da tela
([plano 10, F9](../../plans/10-mobile-chat-layout/F9-open-sessions.md), D-26, D-28):

- `OpenSessions` (`keepAlive`, em memória) guarda, por pasta, as sessões abertas no app, na ordem em
  que entraram. A tela da sessão se registra quando sabe a pasta em que roda — chegue ela pela pasta,
  pelo rascunho, pelo histórico ou por notificação. Sai só por **Fechar no app**, que não encerra nada.
- Enquanto está no registro, o `LiveSessionController` dela segura um `keepAlive`: sair da tela não o
  descarta, e o `follow` continua. Fechar no app solta o link, e o `onDispose` faz o `detach`.
- O `SessionWsDataSource` segue **uma sessão por inscrição**, cada uma com o seu ponto de retomada;
  seguir outra não solta a primeira, e seguir a mesma de novo substitui a anterior. No handshake —
  o primeiro e o de cada reconexão — o `WsClient` anexa de novo todas, cada uma do seu ponto.
- Cada evento chega carimbado com a sessão do frame (`EventReceived.sessionId`), e o gap com a sua
  (`StreamGap.sessionId`): cada controlador fica só com o que é dele. Um gap de uma sessão nunca
  limpa a tela de outra.

---

## Menu de comandos e desfazer

Os dois são consulta HTTP, cada um com seu controller, e abrem em bottom sheet a partir da tela da
sessão ([plano 04 · F3/F4](../../plans/04-transcript-and-resume/README.md)):

- **o menu** (`GET /sessions/:id/commands`) chega filtrado e ordenado pelo backend; a busca é local.
  Indisponível, mostra o erro com ação de tentar de novo, e o composer continua enviando;
- **a recusa de um prompt** é reconhecida pelo `correlationId` — `DriveSession.prompt` envia com
  `issue` e guarda o id —, e some no próximo envio;
- **a prévia do desfazer** (`GET /sessions/:id/checkpoints`) é relida depois de `turn.completed` e de
  `session.rewound`; o sheet só trata um `session.rewound` como resultado **dele** enquanto o seu
  desfazer está pendente e o `promptId` coincide. O `error` sem `correlationId`
  (`session.error.rewindIncomplete`) chega como `SessionFailed`.

---

## Rotas que a tela de sessão lê

A tela de sessão e o rascunho leem três perguntas por HTTP, cada uma num controller, e mandam quatro
comandos pelo socket. Tudo já existe no contrato (08 · F0); o app só passa a usar.

| Rota | Quem lê | Quando | Se falhar |
|---|---|---|---|
| `GET /catalog?workspacePath=` | o rascunho | ao abrir: comandos, modelos e tetos, sem sessão viva ([08 · D-13](../../plans/08-claude-panel/decisions.md#d-13--o-catálogo-antes-da-sessão)) | `429` `SESSION_LIMIT_REACHED` quando não há vaga para a consulta; os chips dizem por quê, e o envio usa o padrão da instalação |
| `GET /sessions/:id/models` | o chip de modelo | ao abrir a folha | o chip continua mostrando o modelo atual |
| `GET /sessions/:id/context` | o anel do contexto | ao abrir a sessão, e relida a cada `turn.completed` e `session.compacted` | o anel vira um ícone no mesmo lugar, e a folha diz por quê |

| Comando | Para quê |
|---|---|
| `session.start` com `model`, `permissionMode` e `effort` | o primeiro envio do rascunho; o `effort` só existe aqui ([08 · D-16](../../plans/08-claude-panel/decisions.md#d-16--esforço-na-sessão)) |
| `session.setModel` | o chip de modelo, na sessão viva |
| `session.setPermissionMode` | o chip de modo; `bypassPermissions` nunca sai do app |
| `session.cancelQueuedPrompt` | cancelar uma linha da fila |

### O rascunho vira sessão no primeiro prompt

Pela [D-05](../../plans/10-mobile-chat-layout/decisions.md#f1--moldura-da-sessão) (e a
[08 · D-07](../../plans/08-claude-panel/decisions.md#d-07--a-sessão-nasce-no-primeiro-prompt)), o
rascunho é estado do cliente: a pasta vem da rota, e o modelo, o modo e o esforço, do controller dele.
O primeiro envio manda `session.start` com o que foi escolhido e reconhece o **seu** `session.started` pelo
`correlationId` — nunca o de outro comando no mesmo socket —; só então manda o `session.prompt` com o
texto e navega para `/sessions/:id`. Enquanto o `session.start` está pendente, outro envio não manda
outro. A recusa (o teto, por exemplo) deixa o rascunho inteiro, com o texto. Sair do rascunho não deixa
nada aberto, porque nada foi aberto.

## Performance

- `const` em todo widget que puder. É a otimização de maior impacto e menor custo no Flutter.
- `ListView.builder` para lista longa — nunca `Column` dentro de `SingleChildScrollView` com
  N itens.
- `select` para escutar só o campo que interessa, em vez do objeto inteiro.
- Parsing de JSON grande (transcript longo) em `compute()`, fora da thread de UI.
- Nunca faça I/O dentro de `build()`.
