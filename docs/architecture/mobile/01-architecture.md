# Arquitetura do app Flutter

Clean Architecture com a nomenclatura idiomática do Flutter, e **Riverpod** como injeção de
dependência e gerenciamento de estado.

Voltar para o [índice do mobile](README.md).

---

## As camadas

A mesma Dependency Rule do backend, com os nomes que a comunidade Flutter usa — `data`,
`domain`, `presentation`:

```
┌──────────────────────────────────────────────────┐
│ presentation/   widgets, páginas, providers de UI │
│   ┌────────────────────────────────────────────┐ │
│   │ domain/   entities, use cases, repository   │ │
│   │           interfaces, failures              │ │
│   └────────────────────────────────────────────┘ │
│ data/           repository impl, data sources,    │
│                 DTOs, mappers                     │
└──────────────────────────────────────────────────┘
     presentation → domain ← data
     (as duas pontas dependem do centro)
```

O ponto que costuma ser feito errado: **`data` depende de `domain`**, não o contrário. O
repositório é uma **interface** em `domain/`, implementada em `data/`. É isso que permite
testar todo o caso de uso sem rede.

### `domain/` — Dart puro

| Pode | Não pode |
|---|---|
| Dart puro, `equatable`/`freezed` | `flutter/*` — **nem `material.dart`** |
| Entities, use cases, failures | `dio`, `riverpod`, `web_socket_channel` |
| Interfaces de repositório | Saber o que é JSON, HTTP ou widget |

```dart
// lib/features/permission/domain/entities/permission_request.dart
class PermissionRequest {
  const PermissionRequest({required this.id, required this.toolName, required this.expiresAt});
  final PermissionRequestId id;
  final String toolName;
  final DateTime expiresAt;

  bool isExpiredAt(DateTime now) => !now.isBefore(expiresAt);
}
```

`isExpiredAt(now)` recebe o tempo em vez de chamar `DateTime.now()`. Regra que lê o relógio
por dentro é regra que não se testa.

### `data/` — o mundo externo

Repository impl, data sources (REST, WS, armazenamento seguro), DTOs e mappers.

- **DTO nunca sai de `data/`.** O repositório devolve entity de domínio.
- Toda exceção de infraestrutura é convertida em `Failure` de domínio **aqui**. Nenhuma
  `DioException` atravessa para `domain/` ou `presentation/`.

### `presentation/` — widgets e providers

Páginas, widgets e os providers Riverpod que expõem estado pronto para render.

- Widget **não** chama repositório. Widget lê provider.
- Provider chama **use case**, não repositório direto — o use case é onde a regra de
  aplicação mora.

---

## A cadeia

```
Widget
  └── watch → Provider (Riverpod: estado + orquestração)
                └── chama → UseCase (domain)
                              └── usa → Repository (interface em domain, impl em data)
                                            └── DataSource (REST / WS / secure storage)
```

É a mesma ideia da [cadeia do web](../web/01-architecture.md), com os nomes do Flutter. Cada
elo isola uma razão de mudar.

---

## Riverpod — injeção e estado

Use sempre o gerador (`riverpod_generator`): ele elimina boilerplate e faz o erro de
dependência aparecer em **build**, não em runtime.

```dart
@riverpod
PermissionRepository permissionRepository(Ref ref) =>
    PermissionRepositoryImpl(ref.watch(wsClientProvider), ref.watch(apiClientProvider));

@riverpod
class PermissionQueue extends _$PermissionQueue {
  @override
  Stream<List<PermissionRequest>> build(SessionId sessionId) =>
      ref.watch(watchPermissionsUseCaseProvider)(sessionId);
}
```

Regras:

1. **Provider é declarado no arquivo do que ele provê**, não num arquivo central de DI.
2. **Nunca `ref.read` dentro de `build`.** Use `ref.watch` — `read` não reage a mudança e
   produz tela que não atualiza. `read` é para callbacks (`onPressed`).
3. **`autoDispose` é o default** (o gerador já faz). Mantenha vivo só o que precisa
   sobreviver à navegação, com `keepAlive`.
4. **Widget escuta o provider mais específico possível.** `watch` de um objeto grande
   reconstrói a tela inteira a cada campo alterado; use `select`.

---

## Erros — `Failure`, não exceção

Exceção atravessando camada é como erro vira crash em produção. A conversão acontece em
`data/`, e o resto do app trabalha com um tipo selado:

```dart
sealed class Failure {
  const Failure({required this.code, required this.messageKey, this.params});
  final String code;        // WORKSPACE_NOT_ALLOWED — igual ao backend
  final String messageKey;  // para tradução
  final Map<String, String>? params;
}
```

`code` e `messageKey` são **os mesmos** do backend — ver
[erros](../shared/04-errors-and-http.md). A UI traduz `messageKey`; a lógica decide por `code`.

`sealed` permite `switch` exaustivo: adicionar um `Failure` novo e esquecer de tratá-lo em
alguma tela vira **erro de compilação**. É a razão de ser `sealed`.

---

## Estado assíncrono

Use `AsyncValue` do Riverpod, e trate os três casos:

```dart
ref.watch(sessionListProvider).when(
  loading: () => const SessionListSkeleton(),
  error:   (e, _) => ErrorView(failure: e as Failure),
  data:    (sessions) => SessionListView(sessions: sessions),
);
```

**Nunca** use `.value!` nem ignore `error`. O `!` aqui é a forma mais comum de crash em app
Flutter com Riverpod.

---

## O que é proibido

```dart
// ❌ material dentro de domain
import 'package:flutter/material.dart';   // em lib/features/*/domain/

// ❌ widget falando com repositório
final repo = ref.read(permissionRepositoryProvider);
await repo.resolve(id);                    // passe por um use case

// ❌ DTO vazando para a UI
Text(sessionDto.workspace_path);           // use a entity

// ❌ regra lendo o relógio por dentro
bool get isExpired => DateTime.now().isAfter(expiresAt);

// ❌ ref.read dentro de build
final x = ref.read(someProvider);          // use watch
```

As duas primeiras são verificadas por `import_lint` no CI — ver
[qualidade](../shared/09-code-quality.md).
