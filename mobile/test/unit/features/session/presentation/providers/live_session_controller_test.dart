/// The session on screen: what it attaches to, what it sends, and what it lets go of.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
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

  /// Holds the provider alive for the length of a test.
  ///
  /// An `@riverpod` notifier is disposed as soon as nothing is listening, so a test that only
  /// `read`s it would build a new one for every assertion — and would prove nothing about the
  /// state accumulating across events.
  void hold(ProviderContainer container, String sessionId) {
    final ProviderSubscription<Conversation> subscription = container.listen(
      liveSessionControllerProvider(sessionId),
      (Conversation? previous, Conversation next) {},
    );
    addTearDown(subscription.close);
  }

  test('attaches to the session in the route as soon as it is watched', () {
    final ProviderContainer container = build();

    hold(container, 'session-1');

    expect(repository.followed, <String>['session-1']);
  });

  test('the resume point is this screen’s own progress, read at attach time', () async {
    final ProviderContainer container = build();
    hold(container, 'session-1');

    repository.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'hi', seq: 7)));
    await settle();

    // Read through the callback the attach captured, which is what a reconnection uses.
    expect(repository.lastSeq!(), 7);
  });

  test('S-36 · leaving the screen detaches', () async {
    final ProviderContainer container = build();
    final ProviderSubscription<Conversation> subscription = container.listen(
      liveSessionControllerProvider('session-1'),
      (Conversation? previous, Conversation next) {},
    );

    subscription.close();
    container.invalidate(liveSessionControllerProvider('session-1'));
    await settle();

    // Without it, moving between sessions piles up subscriptions and the screen starts
    // processing events for a session it no longer shows.
    expect(repository.unfollows, greaterThan(0));
  });

  test('S-29 · a gap clears everything rather than stitching the hole', () async {
    final ProviderContainer container = build();
    hold(container, 'session-1');

    repository.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'before', seq: 1)));
    await settle();
    expect(container.read(liveSessionControllerProvider('session-1')).messages, hasLength(1));

    repository.emit(const StreamGap());
    await settle();

    final Conversation after = container.read(liveSessionControllerProvider('session-1'));
    expect(after.messages, isEmpty);
    expect(after.lastSeq, 0);
  });

  test('applies the stream in order, and shows a tool with its command', () async {
    final ProviderContainer container = build();
    hold(container, 'session-1');

    repository.emit(arrivalOf(sessionStarted(sessionId: 'session-1')));
    repository.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'Hel', seq: 2)));
    repository.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'lo', seq: 3)));
    repository.emit(arrivalOf(toolStarted(toolUseId: 't1', seq: 4)));
    await settle();

    final Conversation state = container.read(liveSessionControllerProvider('session-1'));

    expect(state.status, SessionStatus.idle);
    expect(state.messages.single.text, 'Hello');
    expect(state.tools.single.input['command'], 'ls');
  });

  group('the commands', () {
    test('each one names the session in the route', () {
      final ProviderContainer container = build();
      hold(container, 'session-1');

      final LiveSessionController controller = container.read(
        liveSessionControllerProvider('session-1').notifier,
      );

      expect(controller.prompt('do the thing'), isTrue);
      expect(controller.interrupt(), isTrue);
      expect(controller.close(), isTrue);

      expect(repository.commands.map(((String, Map<String, Object?>) c) => c.$1), <String>[
        'session.prompt',
        'session.interrupt',
        'session.close',
      ]);
      expect(
        repository.commands.first.$2,
        equals(<String, Object?>{'sessionId': 'session-1', 'text': 'do the thing'}),
      );
    });

    test('S-76 · a socket that is not ready sends nothing, and says so', () {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      repository.accepts = false;

      // The screen keeps the text instead of clearing a composer whose prompt went nowhere.
      expect(
        container.read(liveSessionControllerProvider('session-1').notifier).prompt('lost'),
        isFalse,
      );
    });
  });
}
