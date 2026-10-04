/// The catalogue, the models and the context the composer reads, and when they are read again.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/insight_controllers.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_insight_repository.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

void main() {
  late FakeSessionRepository sessions;
  late FakeInsightRepository insight;
  late ProviderContainer container;

  setUp(() {
    sessions = FakeSessionRepository();
    insight = FakeInsightRepository();
    container = ProviderContainer(
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(sessions as SessionRepository),
        insightRepositoryProvider.overrideWithValue(insight as InsightRepository),
      ],
    );
  });

  tearDown(() async {
    container.dispose();
    await sessions.dispose();
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('the catalogue of a folder, read again on demand', () async {
    final ProviderSubscription<AsyncValue<InstallationCatalog>> held = container.listen(
      catalogControllerProvider('/w'),
      (AsyncValue<InstallationCatalog>? previous, AsyncValue<InstallationCatalog> next) {},
    );
    addTearDown(held.close);

    await container.read(catalogControllerProvider('/w').future);
    container.read(catalogControllerProvider('/w').notifier).reload();
    await container.read(catalogControllerProvider('/w').future);

    expect(insight.asked, <String>['catalog:/w', 'catalog:/w']);
  });

  test('the models of a session, read again on demand', () async {
    final ProviderSubscription<AsyncValue<SessionModels>> held = container.listen(
      sessionModelsControllerProvider('s-1'),
      (AsyncValue<SessionModels>? previous, AsyncValue<SessionModels> next) {},
    );
    addTearDown(held.close);

    expect((await container.read(sessionModelsControllerProvider('s-1').future)).current, 'sonnet');
    container.read(sessionModelsControllerProvider('s-1').notifier).reload();
    await container.read(sessionModelsControllerProvider('s-1').future);

    expect(insight.asked, <String>['models:s-1', 'models:s-1']);
  });

  test(
    'B-14 · the context is read again when a turn ends or the conversation is compacted',
    () async {
      final ProviderSubscription<AsyncValue<ContextUse>> held = container.listen(
        sessionContextControllerProvider('s-1'),
        (AsyncValue<ContextUse>? previous, AsyncValue<ContextUse> next) {},
      );
      addTearDown(held.close);
      await container.read(sessionContextControllerProvider('s-1').future);

      sessions.emit(arrivalOf(messageDelta(messageId: 'm', delta: 'x', seq: 1)));
      await settle();
      expect(insight.asked, <String>['context:s-1']);

      sessions.emit(arrivalOf(turnCompleted(seq: 2)));
      await settle();
      await container.read(sessionContextControllerProvider('s-1').future);
      sessions.emit(arrivalOf(sessionCompacted(seq: 3)));
      await settle();
      await container.read(sessionContextControllerProvider('s-1').future);

      expect(insight.asked, <String>['context:s-1', 'context:s-1', 'context:s-1']);
    },
  );

  test('S-45 · a measure that could not be read is an error, not zero', () async {
    insight.contextFailure = StateError('unreadable');
    final Completer<void> done = Completer<void>();
    final ProviderSubscription<AsyncValue<ContextUse>> held = container.listen(
      sessionContextControllerProvider('s-1'),
      (AsyncValue<ContextUse>? previous, AsyncValue<ContextUse> next) {
        if (next.hasError && !done.isCompleted) {
          done.complete();
        }
      },
    );
    addTearDown(held.close);

    await done.future;
    expect(container.read(sessionContextControllerProvider('s-1')).value, isNull);
  });
}
