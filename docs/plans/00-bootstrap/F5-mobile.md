# F5 — Mobile esqueleto

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-contracts.md), [F3](F3-backend.md).
**Entrega:** app Flutter autenticando e consumindo o mesmo WS, com paridade de comportamento
com o web.

---

## Tarefas

### B-31 — Projeto Flutter ✅

Camadas por feature (`domain/`, `data/`, `presentation/`) —
[mobile/02](../../architecture/mobile/02-folder-structure.md). Features: `auth` e `session`.

`domain/` é **Dart puro**: sem `flutter/*`, nem `material.dart`. É o que torna o caso de uso
testável sem `WidgetTester`.

### B-32 — Riverpod + go_router ✅

`riverpod_generator` — erro de dependência aparece em build, não em runtime. `autoDispose` é
o default; `ref.watch` em `build`, `ref.read` só em callback.

`go_router` com rotas nomeadas e deep link. Não é conveniência: o push notification (plano
futuro) precisa abrir tela específica, e isso exige rota endereçável desde já.

### B-33 — `dio` + `WsClient` ✅

Interceptors: `Authorization`, `x-trace-id`, `Accept-Language`, renovação no `401`, logging de
I/O, conversão de `DioException` em `Failure`. **Nenhum data source trata isso sozinho.**

`WsClient` em `core/network/`, com as mesmas três regras de stream do
[F4](F4-web.md#b-26--apits-e-wsclient-). Paridade aqui não é elegância: divergência entre as
pontas vira bug que só aparece num dos canais.

Específico do mobile: no `AppLifecycleListener`, `paused` **fecha o socket** — e isso é
correto. Segurar socket em background drena bateria e o SO mata mesmo assim. No `resumed`,
revalida o token **antes** de reconectar.

### B-34 — l10n ARB ✅

`app_en.arb` e `app_pt.arb`, gerados e type-safe: chave inexistente vira **erro de
compilação**, não string crua na tela. É a razão de usar ARB em vez de lookup por string.

### B-35 — Logger estruturado ✅

Pacote `logging` (oficial do Dart) + formatter JSON próprio, com o mesmo schema de campos das
outras pontas e `service: "mobile"`.

Não usar `logger` nem `talker`: são orientados a legibilidade no console, não a JSON com
schema fixo — e o objetivo é correlacionar o evento do celular com o log do NestJS.

`lifecycle.changed` é `op` obrigatório: metade dos bugs de socket e push se explica pela
transição de ciclo de vida anterior.

### B-36 — Login OIDC em aba externa ✅

`flutter_appauth` com `ASWebAuthenticationSession` (iOS) e Custom Tabs (Android).
**WebView embutida é proibida** — não compartilha a sessão do SO, permite ao app ler a
credencial, e é motivo de rejeição em review de loja.

Retorno por deep link, `state` validado. Credencial em `flutter_secure_storage` (Keychain /
EncryptedSharedPreferences). **`SharedPreferences` é proibido para credencial.**

---

## Cenários cobertos

S-26…S-28 (stream e replay, no app), S-62 (e2e vertical no Flutter). Os cenários de auth do
mobile entram com o registro de device, em plano futuro.

---

## Critério de conclusão

```bash
pnpm --filter backend verify          # segue verde
node scripts/mobile.mjs analyze       # dart analyze, sem um único aviso
node scripts/mobile.mjs arch          # import_lint, com código de saída honesto
node scripts/mobile.mjs coverage      # flutter test --coverage + a barra por arquivo
```

E: um import de `package:flutter/material.dart` em `domain/` **quebra o portão** — provado por
`mobile/test/unit/architecture/import_rules_test.dart`, que escreve uma violação por regra e
vê cada uma reprovar.
