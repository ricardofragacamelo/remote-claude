# mobile — o app Flutter

App que observa sessões do Claude e, principalmente, **aprova permissões de tool à distância**.

As regras vivem na documentação, não aqui. Leia, nesta ordem:

| # | Documento |
|---|---|
| — | [AGENTS.md](../AGENTS.md) — o que vale em qualquer lugar deste repositório |
| 01 | [Arquitetura](../docs/architecture/mobile/01-architecture.md) — camadas, Riverpod, a Dependency Rule |
| 02 | [Estrutura de pastas](../docs/architecture/mobile/02-folder-structure.md) |
| 03 | [Estado e dados](../docs/architecture/mobile/03-state-and-data.md) — o socket e o ciclo de vida |
| 04 | [UI](../docs/architecture/mobile/04-ui.md) · 05 [Logging](../docs/architecture/mobile/05-logging.md) · 06 [Testes](../docs/architecture/mobile/06-testing.md) · 07 [Auth](../docs/architecture/mobile/07-auth.md) |

---

## Comandos

Este módulo **não** faz parte do workspace pnpm ([ADR-007](../docs/architecture/shared/00-decisions.md)).
Da raiz do repositório:

```bash
cd mobile && flutter pub get      # a primeira vez, e depois de mexer no pubspec

node scripts/mobile.mjs analyze   # dart analyze — nenhum aviso é aceito
node scripts/mobile.mjs arch      # import_lint, com código de saída honesto
node scripts/mobile.mjs test:unit # test/unit
node scripts/mobile.mjs coverage  # flutter test --coverage + a barra por arquivo
```

Os mesmos portões rodam dentro de `pnpm verify`, junto com as outras duas pontas.

Por que um invólucro: `dart run import_lint` lista as violações e **sai 0 de qualquer jeito**, e
`flutter test --coverage` escreve um relatório que nada lê. Portão que não consegue reprovar é
pior que portão nenhum.

### Código gerado

```bash
dart run build_runner build       # providers do Riverpod (*.g.dart)
flutter gen-l10n                  # lib/l10n/*.arb → lib/l10n/generated/
pnpm contracts:generate           # do repositório: JSON Schema → lib/core/network/contracts/
```

Tudo isso é **commitado**, e `pnpm contracts:check` reprova quando o contrato sai de sincronia.
Gerado não se edita à mão.

### Configuração

Não há `.env` em runtime: os valores entram por `--dart-define`, e falta de qualquer um deles
**impede o app de subir** — de propósito.

Para rodar contra a stack local, use o script — ele lê os valores do `.env` do repositório,
liga o emulador, faz o `adb reverse` e limpa tudo na saída
([README, `pnpm dev:mobile`](../README.md#o-app-mobile-local--pnpm-devmobile)):

```bash
pnpm dev            # em um terminal: a stack
pnpm dev:mobile     # em outro: o app, com hot reload
```

O app abre nas **Pastas**: as pastas abertas — as mesmas das abas do navegador —, cada uma com as
sessões que rodam nela e os pedidos que esperam, as recentes e "Abrir outra pasta". Tocar numa pasta
mostra Nova sessão, as sessões abertas (de qualquer aparelho) e o histórico. Na tela da sessão, o ícone
da pasta abre o **painel lateral** com as sessões da pasta abertas no app — todas continuam anexadas, e
o ícone acende quando outra espera resposta ([plano 10, F7…F9](../docs/plans/10-mobile-chat-layout/F7-open-folders.md)).

Para deixar o app **instalado** no celular e usá-lo sem o cabo, pela rede local — o interno vira
`http://<IP desta máquina>:5173` e o externo, a origem do `pnpm dev:public` —, use
`pnpm mobile:install` ([README](../README.md#o-app-no-celular-sem-o-cabo--pnpm-mobileinstall)). Ele
diz no console quais endereços usou.

À mão, o mesmo `flutter run` fica assim (com `adb reverse tcp:5173 tcp:5173` feito antes, para o
`localhost` do aparelho chegar à máquina). O app fala com o servidor por **uma origem só** — o
servidor do web, que encaminha `/api`, `/ws`, `/realms` e `/resources` ([plano 10, D-13 e D-16](../docs/plans/10-mobile-chat-layout/decisions.md#f5--endereço-de-conexão))
— e dela derivam a API, o socket e o issuer. `RC_INTERNAL_URL` e `RC_EXTERNAL_URL` são os dois
endereços que a tela de endereço oferece; vazio desliga o radio. O **Outro** cobre o resto:

```bash
flutter run \
  --dart-define=RC_INTERNAL_URL=http://localhost:5173 \
  --dart-define=RC_EXTERNAL_URL= \
  --dart-define=RC_OIDC_REALM_PATH=/realms/remote-claude \
  --dart-define=RC_OIDC_CLIENT_ID=remote-claude-mobile \
  --dart-define="RC_OIDC_SCOPES=openid profile email offline_access" \
  --dart-define=RC_OIDC_REDIRECT_URL=br.com.remoteclaude.app://oauth/callback \
  --dart-define=RC_APP_VERSION=0.0.1
```
