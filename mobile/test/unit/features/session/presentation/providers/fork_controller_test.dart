/// Editing a prompt and sending it again, and forking from one (plan 10, B-24): a new conversation
/// from before the prompt, the text sent there first, and the screen moving to it.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/fork_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/owned_sessions.dart';
import 'package:remote_claude/features/session/presentation/providers/resume_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

const Failure notAPrompt = ServerFailure(
  code: 'INVALID_INPUT',
  messageKey: 'session.error.forkPointUnknown',
  traceId: 'trace-1',
);

void main() {
  late FakeSessionRepository sessions;

  ProviderContainer build() {
    sessions = FakeSessionRepository();
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(sessions as SessionRepository),
      ],
    );
    final ProviderSubscription<ResumeState> held = container.listen(
      forkControllerProvider('session-1'),
      (ResumeState? previous, ResumeState next) {},
    );

    addTearDown(() async {
      held.close();
      container.dispose();
      await sessions.dispose();
    });

    return container;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  bool fork(ProviderContainer container, {String text = 'fix it properly'}) => container
      .read(forkControllerProvider('session-1').notifier)
      .fork(workspacePath: '/work', conversationId: 'conv-1', messageId: 'u1', text: text);

  ResumeState read(ProviderContainer container) =>
      container.read(forkControllerProvider('session-1'));

  test('S-81 · opens the fork once, however many taps', () {
    final ProviderContainer container = build();

    expect(fork(container), isTrue);
    expect(fork(container), isTrue);

    expect(sessions.commands.single.$2, <String, Object?>{
      'workspacePath': '/work',
      'resumeSessionId': 'conv-1',
      'forkAt': 'u1',
    });
    expect(read(container).isPending, isTrue);
  });

  test(
    'S-81 · its session opened: the text goes there first, the app owns it, the screen moves',
    () async {
      final ProviderContainer container = build();
      fork(container);

      sessions
        ..emit(arrivalOf(sessionStarted(sessionId: 'other', correlationId: 'command-9')))
        ..emit(arrivalOf(sessionStarted(sessionId: 'session-2', correlationId: 'command-1')));
      await settle();

      expect(read(container), const ResumeState(sessionId: 'session-2'));
      expect(sessions.commands.last.$2, <String, Object?>{
        'sessionId': 'session-2',
        'text': 'fix it properly',
      });
      expect(container.read(ownedSessionsProvider), contains('session-2'));

      container.read(forkControllerProvider('session-1').notifier).acknowledge();
      expect(read(container), const ResumeState());
    },
  );

  test('S-82 · a point that is not a prompt is refused, and the next fork may go', () async {
    final ProviderContainer container = build();
    fork(container);

    sessions
      ..emit(const CommandRefused(commandId: 'command-7', failure: notAPrompt))
      ..emit(const CommandRefused(commandId: 'command-1', failure: notAPrompt));
    await settle();

    expect(read(container), const ResumeState(failure: notAPrompt));
    expect(fork(container), isTrue);
    expect(sessions.commands, hasLength(2));
  });

  test('a socket that is not ready sends nothing, and says so', () {
    final ProviderContainer container = build();
    sessions.accepts = false;

    expect(fork(container), isFalse);
    expect(read(container), const ResumeState(wasNotSent: true));
  });

  test('with nothing in flight, what arrives is somebody else’s', () async {
    final ProviderContainer container = build();

    sessions.emit(arrivalOf(sessionStarted(sessionId: 'session-2', correlationId: 'command-1')));
    await settle();

    expect(read(container), const ResumeState());
  });
}
