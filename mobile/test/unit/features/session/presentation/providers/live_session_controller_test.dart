/// The session on screen: what it attaches to, what it sends, what it lets go of — and the
/// history it reads when the stream alone cannot say everything.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_history_repository.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

const Failure unavailable = ServerFailure(
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'transcript.error.claudeUnavailable',
  traceId: 'trace-9',
);

/// A page of history holding one question and its answer.
HistoryPage pageOf(String conversationId) => HistoryPage(
  conversationId: conversationId,
  workspacePath: '/home/someone/project',
  events: historyOf(<String>[
    messageCompleted(messageId: 'h1', text: 'what broke?', role: 'user', seq: 1),
    messageCompleted(messageId: 'h2', text: 'the build', seq: 2),
  ]),
);

void main() {
  late FakeSessionRepository repository;
  late FakeHistoryRepository history;

  ProviderContainer build() {
    repository = FakeSessionRepository();
    history = FakeHistoryRepository();

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(repository as SessionRepository),
        historyRepositoryProvider.overrideWithValue(history as HistoryRepository),
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
    final ProviderSubscription<LiveSession> subscription = container.listen(
      liveSessionControllerProvider(sessionId),
      (LiveSession? previous, LiveSession next) {},
    );
    addTearDown(subscription.close);
  }

  LiveSession read(ProviderContainer container) =>
      container.read(liveSessionControllerProvider('session-1'));

  List<String> texts(ProviderContainer container) => read(
    container,
  ).conversation.messages.map((StreamMessage message) => message.text).toList(growable: false);

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
    final ProviderSubscription<LiveSession> subscription = container.listen(
      liveSessionControllerProvider('session-1'),
      (LiveSession? previous, LiveSession next) {},
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
    expect(read(container).conversation.messages, hasLength(1));

    repository.emit(const StreamGap());
    await settle();

    final LiveSession after = read(container);
    expect(after.conversation.messages, isEmpty);
    expect(after.conversation.lastSeq, 0);
    // A stream that is not a conversation has nothing to reload from, and asks for nothing.
    expect(history.reads, isEmpty);
    expect(after.isLoadingHistory, isFalse);
  });

  test('applies the stream in order, and shows a tool with its command', () async {
    final ProviderContainer container = build();
    hold(container, 'session-1');

    repository.emit(arrivalOf(sessionStarted(sessionId: 'session-1')));
    repository.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'Hel', seq: 2)));
    repository.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'lo', seq: 3)));
    repository.emit(arrivalOf(toolStarted(toolUseId: 't1', seq: 4)));
    await settle();

    final Conversation state = read(container).conversation;

    expect(state.status, SessionStatus.idle);
    expect(state.messages.single.text, 'Hello');
    expect(state.tools.single.input['command'], 'ls');
    // A fresh session continues nothing, so there is no history to read.
    expect(history.reads, isEmpty);
  });

  group('B-11 · a session that continues a conversation', () {
    test('reads what was said before from the conversation it continues', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history.answer(pageOf('conv-1'));

      repository.emit(
        arrivalOf(
          sessionStarted(sessionId: 'session-1', claudeSessionId: 'conv-2', resumedFrom: 'conv-1'),
        ),
      );
      await settle();

      expect(history.reads, <(String, String?)>[('conv-1', null)]);
      expect(texts(container), <String>['what broke?', 'the build']);
    });

    test('S-21 · the history never moves the resume point, and live comes after it', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history.answer(pageOf('conv-1'));

      repository.emit(arrivalOf(sessionStarted(sessionId: 'session-1', resumedFrom: 'conv-1')));
      await settle();
      repository.emit(arrivalOf(messageCompleted(messageId: 'n1', text: 'fixed it', seq: 2)));
      await settle();

      // The resumed session numbers its own events from one; the history has no `seq` at all.
      expect(read(container).conversation.lastSeq, 2);
      expect(repository.lastSeq!(), 2);
      expect(texts(container), <String>['what broke?', 'the build', 'fixed it']);
    });

    test('a replay of the opening asks for the history once, not twice', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');

      final String opened = sessionStarted(sessionId: 'session-1', resumedFrom: 'conv-1');
      repository
        ..emit(arrivalOf(opened))
        ..emit(arrivalOf(opened));
      await settle();

      expect(history.reads, hasLength(1));
    });

    test('says it is reading while the history is on its way', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history.gate = Completer<void>();

      repository.emit(arrivalOf(sessionStarted(sessionId: 'session-1', resumedFrom: 'conv-1')));
      await settle();
      expect(read(container).isLoadingHistory, isTrue);

      history.gate!.complete();
      await settle();
      expect(read(container).isLoadingHistory, isFalse);
    });
  });

  group('S-14 · a gap reloads the history of the conversation the ack named', () {
    test('clears the stream, then shows the tail of that conversation', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history.answer(pageOf('conv-7'));

      repository.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'stale', seq: 40)));
      await settle();
      repository.emit(const StreamGap(claudeSessionId: 'conv-7'));
      await settle();

      expect(history.reads, <(String, String?)>[('conv-7', null)]);
      expect(texts(container), <String>['what broke?', 'the build']);
      expect(read(container).conversation.lastSeq, 0);
    });

    test('S-15 · the replay arriving while the history loads never duplicates a message', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history
        ..answer(pageOf('conv-7'))
        ..gate = Completer<void>();

      repository.emit(const StreamGap(claudeSessionId: 'conv-7'));
      await settle();
      // What the buffer still had, replayed while the transcript is being read — and the
      // transcript holds the same answer, under the same id.
      repository
        ..emit(arrivalOf(messageCompleted(messageId: 'h2', text: 'the build', seq: 30)))
        ..emit(arrivalOf(messageCompleted(messageId: 'n1', text: 'and now?', seq: 31)));
      await settle();
      history.gate!.complete();
      await settle();

      expect(texts(container), <String>['what broke?', 'the build', 'and now?']);
    });

    test('an answer that arrives after a newer gap is dropped', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history
        ..answer(pageOf('conv-7'))
        ..gate = Completer<void>();

      repository.emit(const StreamGap(claudeSessionId: 'conv-7'));
      await settle();
      repository.emit(const StreamGap());
      await settle();
      history.gate!.complete();
      await settle();

      // The second gap made the first reading pointless; showing it would stitch two states.
      expect(read(container).conversation.messages, isEmpty);
      expect(read(container).isLoadingHistory, isFalse);
    });
  });

  group('S-17 · a history that could not be read', () {
    test('says why, and reads it again on retry', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history
        ..answer(pageOf('conv-7'))
        ..failure = unavailable;

      repository.emit(const StreamGap(claudeSessionId: 'conv-7'));
      await settle();

      expect(read(container).historyFailure, unavailable);
      expect(read(container).isLoadingHistory, isFalse);

      history.failure = null;
      await container.read(liveSessionControllerProvider('session-1').notifier).retryHistory();

      expect(read(container).historyFailure, isNull);
      expect(texts(container), <String>['what broke?', 'the build']);
      expect(history.reads, hasLength(2));
    });

    test('something that is not a failure is still said as one', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      history.failure = StateError('not a failure');

      repository.emit(const StreamGap(claudeSessionId: 'conv-7'));
      await settle();

      expect(read(container).historyFailure, isA<UnexpectedFailure>());
    });

    test('a retry with nowhere to read from reads nothing', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');

      await container.read(liveSessionControllerProvider('session-1').notifier).retryHistory();

      expect(history.reads, isEmpty);
    });

    test('a screen that left before the answer came is not written to', () async {
      final ProviderContainer container = build();
      final ProviderSubscription<LiveSession> subscription = container.listen(
        liveSessionControllerProvider('session-1'),
        (LiveSession? previous, LiveSession next) {},
      );
      history.gate = Completer<void>();

      repository.emit(const StreamGap(claudeSessionId: 'conv-7'));
      await settle();
      subscription.close();
      container.invalidate(liveSessionControllerProvider('session-1'));
      await settle();

      history.gate!.complete();
      await settle();

      expect(history.reads, hasLength(1));
    });
  });

  test('answers to other screens’ commands change nothing here', () async {
    final ProviderContainer container = build();
    hold(container, 'session-1');
    final LiveSession before = read(container);

    repository
      ..emit(const SessionJoined(sessionId: 'session-9', claudeSessionId: 'conv-9'))
      ..emit(const CommandRefused(commandId: 'command-1', failure: unavailable))
      ..emit(const SessionFailed(unavailable));
    await settle();

    expect(read(container), before);
  });

  group('S-34 · a prompt the server refused', () {
    const Failure unknownCommand = ServerFailure(
      code: 'INVALID_INPUT',
      messageKey: 'session.error.unknownCommand',
      traceId: 'trace-3',
      params: <String, String>{'command': '/heapdumb'},
    );

    test('is recognised by the id it left with, and said beside the composer', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');

      container.read(liveSessionControllerProvider('session-1').notifier).prompt('/heapdumb');
      repository.emit(const CommandRefused(commandId: 'command-1', failure: unknownCommand));
      await settle();

      expect(read(container).promptFailure, unknownCommand);
    });

    test('a refusal of somebody else’s command is not this prompt’s', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');

      container.read(liveSessionControllerProvider('session-1').notifier).prompt('/init');
      repository.emit(const CommandRefused(commandId: 'command-7', failure: unknownCommand));
      await settle();

      expect(read(container).promptFailure, isNull);
    });

    test('is forgotten by the next prompt', () async {
      final ProviderContainer container = build();
      hold(container, 'session-1');
      final LiveSessionController controller = container.read(
        liveSessionControllerProvider('session-1').notifier,
      );

      controller.prompt('/heapdumb');
      repository.emit(const CommandRefused(commandId: 'command-1', failure: unknownCommand));
      await settle();
      controller.prompt('/init');

      expect(read(container).promptFailure, isNull);
    });
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
