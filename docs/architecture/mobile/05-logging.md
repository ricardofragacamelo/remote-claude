# Logging no Flutter

Mesmo schema de campos do backend e do web. Leia [logging](../shared/03-logging.md) primeiro;
aqui está só o específico do Flutter.

Voltar para o [índice do mobile](README.md).

---

## `print()` e `debugPrint()` são proibidos

Regra de lint (`avoid_print`) em nível de **erro**, e ela quebra o build. `print` não tem
nível, não tem estrutura, não tem correlação, e no release vira ruído invisível.

---

## A biblioteca

`logging` — o pacote oficial do time do Dart — com um formatter JSON próprio em
`core/logging/`.

**Por quê não `logger` ou `talker`:** ambos são ótimos para leitura no console, mas orientados
a texto formatado, não a JSON estruturado com schema fixo. Precisamos correlacionar um evento
do celular com o log do NestJS e do subprocesso do Claude — e isso exige os mesmos nomes de
campo nas três pontas. Ver
[ADR-009](../shared/00-decisions.md#adr-009--logging-estruturado-com-paridade-entre-as-três-pontas).

---

## Campos

Os obrigatórios de [03-logging.md](../shared/03-logging.md), com `service: "mobile"`, mais:

| Campo | Conteúdo |
|---|---|
| `sessionId` | sessão do Claude, quando houver |
| `connectionId` | connection do WS |
| `route` | rota atual do `go_router` |
| `userId` | `sub` do token, nunca o e-mail |
| `deviceId` | device registrado |
| `appVersion`, `platform` | versão e plataforma |

`msg` em **inglês**, minúsculo, sem dado interpolado.

### Níveis

O pacote `logging` usa `Level`; mapeie para os nomes comuns na serialização:

| `Level` do Dart | Nosso `level` |
|---|---|
| `FINE` | `debug` |
| `INFO` | `info` |
| `WARNING` | `warn` |
| `SEVERE` | `error` |
| `SHOUT` | `fatal` |

---

## Saída

| Ambiente | Nível | Destino |
|---|---|---|
| Debug | `debug` | console, formatado e legível |
| Release | `info` | console do aparelho (`dart:developer`) |
| Release, com debug ligado pelo usuário | `debug` | idem |

O usuário liga `debug` numa tela de diagnóstico (`/diagnostics`, pelo ícone da tela inicial). Bug
de permissão intermitente em celular é quase impossível de reproduzir sem isso — e obrigar a
publicar build novo para investigar é inviável em app de loja. **O nível volta ao do build quando
a tela sai**: nível elevado esquecido é vazamento lento. A tela também mostra a conexão, se há
login e a versão do build.

### Nada sai do aparelho

O log do app fica no console do aparelho: nenhuma linha é enviada ao backend. O que liga um erro na
tela ao log do backend é o `traceId`, que o erro mostra e que o backend grava em toda linha da
requisição ([plano 05 · escopo reduzido](../../plans/05-hardening-operations/progress.md#escopo-reduzido-ou-adiado)).

---

## O que logar em `debug`

Toda borda de I/O, entrada **e** saída:

| `op` | Onde |
|---|---|
| `http.request` / `http.response` | interceptor do `dio` |
| `ws.inbound` / `ws.outbound` | `WsClient` |
| `ws.connection` | `WsClient` — estado, `closeCode`, tentativa |
| `push.received` / `push.opened` | handler de notificação |
| `lifecycle.changed` | `AppLifecycleListener` |
| `auth.token` | `sub`, `exp` — **nunca o token** |

Responsabilidade do `dio` e do `WsClient`, **não** de cada data source.

`lifecycle.changed` é específico do mobile e importa mais do que parece: metade dos bugs de
socket e de push se explica pela transição de ciclo de vida imediatamente anterior.

---

## Redação

Vale a lista de [03-logging.md](../shared/03-logging.md#redação-o-que-nunca-vai-para-o-log).
Específico do mobile:

- **Nunca** logue token, `code`, `code_verifier` nem push token completo (só os 6 últimos).
- Conteúdo de prompt só em `debug`, truncado em 2 KB.
- Nunca logue o `input` completo de uma tool em `info` — em `debug`, truncado.
- Payload acima de 8 KB é truncado com `truncated: true`.

---

## `traceId`

Nasce **aqui**, no toque do usuário. Vai no header `x-trace-id` e no campo `traceId` do frame
WS. Guarde o da última operação com erro e **mostre na tela de erro** — em app de loja, o
relato do usuário é frequentemente a única pista.

---

## Crash

`FlutterError.onError` e `PlatformDispatcher.instance.onError` vão para `logger.fatal`, com
`traceId` e rota atual, e o buffer é persistido antes de o processo morrer. Crash silencioso
em app publicado é dívida que ninguém paga.
