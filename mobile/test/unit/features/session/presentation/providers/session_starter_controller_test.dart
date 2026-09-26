/// Opening a session, and learning which one was opened.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/session_starter_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

void main() {
  late FakeSessionRepository repository;

  ProviderContainer build() {
    repository = FakeSessionRepository();

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(repository as SessionRepository),
      ],
    );

    addTearDown(() async {
      container.dispose();
      await repository.dispose();
    });

    return container;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('S-75 · the id arrives on the event, not from the command', () async {
    final ProviderContainer container = build();
    container.read(sessionStarterControllerProvider);

    final bool sent = container
        .read(sessionStarterControllerProvider.notifier)
        .start('/home/someone/project');

    expect(sent, isTrue);
    expect(repository.commands.single.$1, 'session.start');
    expect(
      repository.commands.single.$2,
      equals(<String, Object?>{'workspacePath': '/home/someone/project'}),
    );
    expect(container.read(sessionStarterControllerProvider), isNull);

    repository.emit(arrivalOf(sessionStarted(sessionId: 'session-42')));
    await settle();

    expect(container.read(sessionStarterControllerProvider), 'session-42');
  });

  test('a start that the socket refused opens nothing', () {
    final ProviderContainer container = build();
    container.read(sessionStarterControllerProvider);
    repository.accepts = false;

    expect(
      container.read(sessionStarterControllerProvider.notifier).start('/home/someone/project'),
      isFalse,
    );
    expect(container.read(sessionStarterControllerProvider), isNull);
  });

  test('a second start forgets the first, so the screen cannot open the wrong session', () async {
    final ProviderContainer container = build();
    container.read(sessionStarterControllerProvider);

    repository.emit(arrivalOf(sessionStarted(sessionId: 'old')));
    await settle();
    expect(container.read(sessionStarterControllerProvider), 'old');

    container.read(sessionStarterControllerProvider.notifier).start('/home/someone/other');

    expect(container.read(sessionStarterControllerProvider), isNull);
  });

  test('an event that is not a session opening is ignored', () async {
    final ProviderContainer container = build();
    container.read(sessionStarterControllerProvider);

    repository.emit(arrivalOf(messageDelta(messageId: 'm', delta: 'x', seq: 1)));
    repository.emit(const StreamGap());
    await settle();

    expect(container.read(sessionStarterControllerProvider), isNull);
  });

  test('once the screen has acted on it, it is forgotten', () async {
    final ProviderContainer container = build();
    container.read(sessionStarterControllerProvider);

    repository.emit(arrivalOf(sessionStarted(sessionId: 'session-1')));
    await settle();

    container.read(sessionStarterControllerProvider.notifier).acknowledge();

    // Without this, every rebuild would navigate again, and the screen would keep yanking
    // itself back to the session that was opened once.
    expect(container.read(sessionStarterControllerProvider), isNull);
  });
}
