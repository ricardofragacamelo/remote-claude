# Testes do app Flutter

Leia primeiro a [estratégia geral](../shared/06-testing-strategy.md) — regras comuns, as seis
dimensões de cenário e a regra de cobertura estão lá.

Voltar para o [índice do mobile](README.md).

---

## Onde mora

```
mobile/
├── lib/                        nenhum arquivo de teste aqui. Nunca.
├── test/
│   ├── unit/                   espelha lib/
│   │   ├── features/permission/domain/entities/permission_request_test.dart
│   │   └── features/session/data/repositories/session_repository_impl_test.dart
│   ├── widget/
│   │   └── features/permission/presentation/permission_prompt_card_test.dart
│   └── support/
│       ├── builders/           aPermissionRequest(), aSession()
│       ├── fakes/              FakeSessionRepository, FakeWsClient
│       └── pump_app.dart       pumpApp() com providers, i18n e tema
└── integration_test/           e2e no app real
```

`test/` e `integration_test/` já são separados de `lib/` por convenção do Flutter — a regra de
[teste fora do fonte](../shared/06-testing-strategy.md) está atendida por construção. O que
precisa de disciplina é a subdivisão `unit/` e `widget/`.

Stack: `flutter_test` · `mocktail` · `integration_test` · `patrol` (quando precisar de
interação com o SO).

---

## Os três níveis no Flutter

| Nível | Pasta | Testa | Roda em |
|---|---|---|---|
| Unit | `test/unit/` | entities, use cases, repositories, mappers, notifiers | Dart VM — milissegundos |
| Widget | `test/widget/` | widget renderiza, reage a toque, mostra os 4 estados | Dart VM, sem device |
| E2E | `integration_test/` | app real contra backend real | emulador/aparelho |

Teste de widget **não** precisa de device: roda na VM, é rápido, e é onde a maior parte do
valor está. Não o trate como se fosse caro.

---

## Unit

```dart
test('marks request as expired when now is at expiresAt', () {
  final request = aPermissionRequest(expiresAt: DateTime.utc(2026, 1, 1, 12));
  expect(request.isExpiredAt(DateTime.utc(2026, 1, 1, 12)), isTrue);
});
```

Repare que a entity recebe `now` como parâmetro
([01-architecture.md](01-architecture.md)) — é o que torna o teste determinístico sem
manipular relógio.

**Fake, não mock.** Prefira `FakeSessionRepository` a `MockSessionRepository` com
`verify(...)`. Mock verifica *como* foi feito e quebra em refactor; fake verifica *o que*
aconteceu. Use `mocktail` onde o fake não compensar.

`sealed class Failure` permite `switch` exaustivo: teste **cada** variante. O compilador avisa
quando surge uma nova sem tratamento — aproveite isso.

---

## Widget

```dart
testWidgets('shows the exact command without truncating', (tester) async {
  await tester.pumpApp(PermissionPromptCard(request: aPermissionRequest(
    input: {'command': 'rm -rf build/'})));

  expect(find.text('rm -rf build/'), findsOneWidget);
});
```

Regras:

- Use `pumpApp()` de `test/support/` — traz providers, i18n e tema. Sem ele, cada teste
  remonta o mundo e diverge.
- **Sobrescreva providers**, não injete mock manualmente: `overrides: [repoProvider.overrideWithValue(fake)]`.
- Encontre por **semântica**, não por tipo interno: `find.byTooltip`, `find.text`,
  `find.bySemanticsLabel`. `find.byType(_InternalRow)` acopla ao detalhe.
- Renderize com i18n **real**, em `en`. Nunca mocke a tradução — isso esconde chave faltando.
- `await tester.pumpAndSettle()` depois de animação; nunca `Future.delayed`.

---

## E2E

`integration_test/`, contra backend real com Agent SDK **fake** e provedor OIDC **fake**.
Nunca contra o Claude real nem contra tenant real de Auth0.

Os **cenários** vivem em `e2e/scenarios/` e são compartilhados com o web — as duas pontas
precisam provar o mesmo comportamento. Ver
[estratégia](../shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário).

`patrol` quando o cenário exige o SO: permissão de notificação, toque na notificação, aba de
login externa do OIDC.

**A suíte roda em Android, e só.** O app continua compilando para iOS, mas push, biometria e
`integration_test` **nunca são exercitados lá** — é escopo declarado, não descuido: iOS exigiria
conta de desenvolvedor paga, certificado APNs e um runner próprio. Tratar iOS como coberto
porque compila é a forma mais fácil de descobrir o contrário na mão do usuário.

**A imagem do emulador é fixada: API 35.** Resultado comparável entre duas máquinas depende
disso — API level diferente muda permissão de notificação, biometria e deep link, que é
exatamente o que esta suíte exercita. API 33 é o piso para o diálogo de permissão de notificação
existir; em imagem mais antiga, o cenário simplesmente não aparece e a suíte passa sem provar
nada. Uma imagem só, não duas: a suíte já é a mais cara do repositório.

---

## Cenários obrigatórios do mobile

Enumerados pelas [seis dimensões](../shared/06-testing-strategy.md#como-enumerar-cenários):

1. Os quatro estados (loading, erro, vazio, conteúdo) em toda tela que carrega dado.
2. Card de permissão mostra o **comando exato**, sem truncar, inclusive com texto longo.
3. Confirmação em dois passos para tool destrutiva — um toque só **não** aprova.
4. Contagem regressiva chega a zero → card sai como negado, sem pedir confirmação.
5. Permissão resolvida em **outro dispositivo** some sozinha, mostrando quem resolveu.
6. Toque duplo em aprovar envia **uma** resposta.
7. Evento com `seq <= lastSeq` descartado — mensagem não duplica no replay.
8. `gap: true` limpa o estado e recarrega o transcript.
9. **App vai para background e volta:** socket reconecta, faz replay, nada se perde.
10. **Push de permissão:** toque abre o card certo, **revalidando no servidor**.
11. Push de permissão já resolvida não abre card órfão.
12. Sem conexão: estado visível, ações de rede desabilitadas.
13. Token expira com o socket aberto → `reauthenticate` sem derrubar a tela.
14. Device revogado → sessão encerrada e usuário informado.
15. Alvo de toque ≥ 48 dp e contraste AA, via `meetsGuideline`.
16. Texto em escala 200 % não corta o comando no card de permissão.

Os itens 9, 10 e 11 são os que mais quebram na prática — e não existem no web.

---

## Acessibilidade em teste

```dart
await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
await expectLater(tester, meetsGuideline(textContrastGuideline));
await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
```

Obrigatório em toda tela principal, e a violação **quebra o build**.

---

## Cobertura

**≥ 90 % em statements, branches, functions e lines**, medido sobre unit + widget somados,
via `flutter test --coverage` com verificação do `lcov.info` no CI.

Excluídos: `*.g.dart`, `*.freezed.dart`, `l10n/` gerado, `main.dart`. Regra completa:
[cobertura](../shared/06-testing-strategy.md#cobertura).

---

## O que não testar

- Widget do Material/Cupertino. Teste o **seu** uso.
- Código gerado.
- Layout pixel a pixel. Golden test só onde a regressão visual for risco real — golden é
  frágil entre plataformas e vira ruído aprovado no automático.
