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

```bash
flutter run \
  --dart-define=RC_API_URL=http://localhost:3000 \
  --dart-define=RC_WS_URL=ws://localhost:3000/ws \
  --dart-define=RC_OIDC_ISSUER=http://localhost:8180/realms/remote-claude \
  --dart-define=RC_OIDC_CLIENT_ID=remote-claude-mobile \
  --dart-define="RC_OIDC_SCOPES=openid profile email offline_access" \
  --dart-define=RC_OIDC_REDIRECT_URL=com.remoteclaude://callback \
  --dart-define=RC_APP_VERSION=0.0.1
```
