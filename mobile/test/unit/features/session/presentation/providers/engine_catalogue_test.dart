/// The engines of the installation, as the screens read them (plan 28, B-13).
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/presentation/providers/engine_catalogue.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/conversations.dart';
import '../../../../../support/fakes/fake_engine_repository.dart';

void main() {
  ProviderContainer containerOver(FakeEngineRepository repository) {
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[engineRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('reads the engines once, and keeps them', () async {
    final FakeEngineRepository repository = FakeEngineRepository();
    final ProviderContainer container = containerOver(repository);

    final EngineCatalogue first = await container.read(engineCatalogueProvider.future);
    final EngineCatalogue again = await container.read(engineCatalogueProvider.future);

    expect(first.displayNameOf(anEngine), anEngineName);
    expect(again, same(first));
    expect(repository.asked, 1);
  });

  test('a list that did not come is an error, and is not asked again on its own', () async {
    final FakeEngineRepository repository = FakeEngineRepository(
      failure: const NetworkFailure(traceId: 't'),
    );
    final ProviderContainer container = containerOver(repository);
    final ProviderSubscription<AsyncValue<EngineCatalogue>> held = container.listen(
      engineCatalogueProvider,
      (AsyncValue<EngineCatalogue>? previous, AsyncValue<EngineCatalogue> next) {},
    );
    addTearDown(held.close);

    await expectLater(
      container.read(engineCatalogueProvider.future),
      throwsA(isA<NetworkFailure>()),
    );
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(container.read(engineCatalogueProvider).hasError, isTrue);
    expect(repository.asked, 1);
  });

  test('read again when asked to — a new sign-in', () async {
    final FakeEngineRepository repository = FakeEngineRepository();
    final ProviderContainer container = containerOver(repository);

    await container.read(engineCatalogueProvider.future);
    container.invalidate(engineCatalogueProvider);
    await container.read(engineCatalogueProvider.future);

    expect(repository.asked, 2);
  });

  group('plan 28, B-27 · what a screen offers, by engine', () {
    const EngineCapabilities other = EngineCapabilities(
      resume: false,
      fork: 'none',
      history: false,
      images: false,
      promptWhileBusy: false,
      questions: false,
      planApproval: false,
      taskList: false,
      subagents: false,
      thinking: false,
      slashCommands: false,
      modelSwitch: false,
      effortLevels: <String>[],
      contextUse: false,
      mcp: false,
      compaction: false,
      cost: 'none',
      permissionModes: <String>['ask'],
    );

    /// What [read] answers, under a scope whose list of engines is the fake's.
    Future<EngineCapabilities?> answer(
      WidgetTester tester,
      EngineCapabilities? Function(WidgetRef ref) read,
    ) async {
      EngineCapabilities? seen;
      await tester.pumpWidget(
        ProviderScope(
          overrides: <Override>[engineRepositoryProvider.overrideWithValue(FakeEngineRepository())],
          child: Consumer(
            builder: (BuildContext context, WidgetRef ref, Widget? _) {
              seen = read(ref);
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      return seen;
    }

    testWidgets('a session that declared its capabilities offers those', (
      WidgetTester tester,
    ) async {
      expect(
        await answer(
          tester,
          (WidgetRef ref) =>
              sessionCapabilities(ref, const SessionFacts(engine: anEngine, capabilities: other)),
        ),
        other,
      );
    });

    testWidgets('before it declared, the list says what its engine can do', (
      WidgetTester tester,
    ) async {
      expect(
        await answer(
          tester,
          (WidgetRef ref) => sessionCapabilities(ref, const SessionFacts(engine: anEngine)),
        ),
        someCapabilities,
      );
      expect(
        await answer(
          tester,
          (WidgetRef ref) => sessionCapabilities(ref, const SessionFacts(engine: 'engine-z')),
        ),
        isNull,
      );
    });

    testWidgets('a draft offers what the default engine can do', (WidgetTester tester) async {
      expect(await answer(tester, draftCapabilities), someCapabilities);
    });
  });
}
