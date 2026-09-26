# Estrutura de pastas do app Flutter

Organização **por feature**, com as três camadas dentro de cada uma.

Voltar para o [índice do mobile](README.md).

---

## Por que por feature aqui, e por camada no backend

Escolha deliberada, não inconsistência.

No backend, a camada é a fronteira que o lint defende, e ela vem primeiro
([backend/02](../backend/02-folder-structure.md)). No Flutter, a fronteira que mais dói na
prática é a **feature**: uma tela é um conjunto coeso de widget, provider, use case e
repositório, e a comunidade inteira organiza assim — pacotes gerados, exemplos e ferramentas
assumem esse formato.

A Dependency Rule continua idêntica nos dois. O que muda é qual eixo vem primeiro na árvore.

---

## Árvore

```
mobile/
├── lib/
│   ├── main.dart
│   ├── app/
│   │   ├── app.dart                    MaterialApp, tema, i18n
│   │   ├── router.dart                 go_router
│   │   └── bootstrap.dart              init: logger, storage, config
│   │
│   ├── features/
│   │   ├── session/
│   │   │   ├── domain/
│   │   │   │   ├── entities/           session.dart, turn.dart
│   │   │   │   ├── repositories/       session_repository.dart  ← INTERFACE
│   │   │   │   ├── usecases/           start_session.dart
│   │   │   │   └── failures/
│   │   │   ├── data/
│   │   │   │   ├── datasources/        session_remote_datasource.dart
│   │   │   │   ├── dtos/               session_dto.dart  (+ .g.dart)
│   │   │   │   ├── mappers/
│   │   │   │   └── repositories/       session_repository_impl.dart
│   │   │   └── presentation/
│   │   │       ├── pages/              session_list_page.dart
│   │   │       ├── widgets/
│   │   │       └── providers/          session_list_provider.dart (+ .g.dart)
│   │   │
│   │   ├── permission/                 ← a feature mais importante do app; pedido, escopo e regras
│   │   ├── workspace/
│   │   ├── transcript/
│   │   └── auth/
│   │
│   ├── core/                           sem regra de negócio
│   │   ├── network/                    dio, ws_client, interceptors
│   │   ├── storage/                    secure storage
│   │   ├── session/                    passos que o logout roda enquanto a credencial vale
│   │   ├── logging/                    logger + formatter JSON
│   │   ├── error/                      Failure base, mapeamento
│   │   ├── theme/                      tokens, Material 3
│   │   ├── config/                     env validado
│   │   └── widgets/                    ErrorView, EmptyView, LoadingView
│   │
│   └── l10n/                           app_en.arb, app_pt.arb (+ gerado)
│
├── test/
│   ├── unit/                           espelha lib/
│   ├── widget/
│   └── support/                        builders, fakes, pumpApp()
│
└── integration_test/                   e2e do app
```

---

## Fronteira de feature

Feature importa outra feature **apenas pelo barril**:

```dart
// lib/features/session/session.dart
export 'domain/entities/session.dart';
export 'domain/usecases/start_session.dart';
export 'presentation/pages/session_list_page.dart';
```

Regras:

1. Import de outra feature só via `package:remote_claude/features/session/session.dart`.
2. **Nunca** importe `data/` de outra feature. Se precisou, ou é `core/`, ou as duas features
   são uma só.
3. Sem ciclo entre features.
4. `core/` **nunca** importa `features/`. A seta aponta sempre para `core/`.

Verificado por `import_lint` — ver [qualidade](../shared/09-code-quality.md).

---

## Convenções

| Item | Convenção | Exemplo |
|---|---|---|
| Arquivo | `snake_case.dart` | `permission_prompt_card.dart` |
| Classe | `UpperCamelCase` | `PermissionPromptCard` |
| Gerado | `*.g.dart`, `*.freezed.dart` | **nunca** edite; nunca commite desatualizado |
| Barril de feature | `<feature>.dart` na raiz da feature | `permission.dart` |
| Teste | `*_test.dart` em `test/` | **nunca** em `lib/` |

Um widget público por arquivo, com o mesmo nome do arquivo. Widget privado usado só ali pode
ficar abaixo, com prefixo `_`.

---

## Imports

Sempre `package:`, nunca relativo que sobe de pasta:

```dart
import 'package:remote_claude/core/logging/logger.dart';   ✅
import '../../../core/logging/logger.dart';                 ❌
```

Import relativo só dentro da **mesma camada da mesma feature**. Regra de lint
(`always_use_package_imports`) garante.

---

## Código gerado

`build_runner` gera `.g.dart` (json_serializable, riverpod) e `.freezed.dart`.

- **Commitado** no repositório — build reprodutível sem rodar codegen.
- CI valida que está em dia; gerado desatualizado **quebra o build**.
- Excluído da cobertura e da análise de duplicação — ver
  [qualidade](../shared/09-code-quality.md#duplicação-que-é-permitida).

O Dart do [contrato WS](../shared/05-websocket-protocol.md) também é gerado, a partir do
JSON Schema de `packages/contracts/`, e cai em `lib/core/network/contracts/`.

---

## Onde colocar o quê

| Vou criar… | Vai em |
|---|---|
| Regra de negócio | `features/<f>/domain/` |
| Caso de uso | `features/<f>/domain/usecases/` |
| Interface de repositório | `features/<f>/domain/repositories/` |
| Chamada HTTP / WS | `features/<f>/data/datasources/` |
| Tela | `features/<f>/presentation/pages/` |
| Provider | `features/<f>/presentation/providers/` |
| Widget reutilizável entre features | `core/widgets/` |
| Texto | `l10n/app_en.arb` **e** `app_pt.arb` |
