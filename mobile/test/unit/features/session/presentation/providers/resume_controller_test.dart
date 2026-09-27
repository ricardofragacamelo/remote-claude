/// Continuing a conversation of the history, and learning which session continues it.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/resume_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

const Failure notFound = ServerFailure(
  code: 'SESSION_NOT_FOUND',
  messageKey: 'session.error.notFound',
  traceId: 'trace-4',
);

void main() {
  late FakeSessionRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = FakeSessionRepository();
    container = ProviderContainer(
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(repository as SessionRepository),
      ],
    );

    final ProviderSubscription<ResumeState> held = container.listen(
      resumeControllerProvider('conv-1'),
      (ResumeState? previous, ResumeState next) {},
    );

    addTearDown(() async {
      held.close();
      container.dispose();
      await repository.dispose();
    });
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  ResumeController controller() => container.read(resumeControllerProvider('conv-1').notifier);
  ResumeState state() => container.read(resumeControllerProvider('conv-1'));

  test('B-10 · a resume is a start that names the conversation, in the workspace it ran in', () {
    controller().resume('/home/someone/project');

    expect(repository.commands.single.$1, 'session.start');
    expect(
      repository.commands.single.$2,
      equals(<String, Object?>{
        'workspacePath': '/home/someone/project',
        'resumeSessionId': 'conv-1',
      }),
    );
    expect(state().isPending, isTrue);
  });

  test('a second tap while one is in flight sends one command, not two', () {
    controller()
      ..resume('/p')
      ..resume('/p');

    expect(repository.commands, hasLength(1));
  });

  test('a socket that is not ready sends nothing, and says so', () {
    repository.accepts = false;

    controller().resume('/p');

    expect(state(), const ResumeState(wasNotSent: true));
  });

  test('S-59 · a conversation of ours continues in place: the new session names it', () async {
    controller().resume('/p');

    repository.emit(
      arrivalOf(
        sessionStarted(sessionId: 'session-7', claudeSessionId: 'conv-1', resumedFrom: 'conv-1'),
      ),
    );
    await settle();

    expect(state().sessionId, 'session-7');
    expect(state().isPending, isFalse);
  });

  test('S-58 · a conversation begun elsewhere is forked: only resumedFrom names it', () async {
    controller().resume('/p');

    repository.emit(
      arrivalOf(
        sessionStarted(sessionId: 'session-8', claudeSessionId: 'conv-new', resumedFrom: 'conv-1'),
      ),
    );
    await settle();

    expect(state().sessionId, 'session-8');
  });

  test('S-24 · a conversation already live is joined, never opened twice', () async {
    controller().resume('/p');

    repository.emit(const SessionJoined(sessionId: 'session-3', claudeSessionId: 'conv-1'));
    await settle();

    expect(state().sessionId, 'session-3');
  });

  test('a join of a fork that is live names it by what it continues', () async {
    controller().resume('/p');

    repository.emit(
      const SessionJoined(sessionId: 'session-4', claudeSessionId: 'x', resumedFrom: 'conv-1'),
    );
    await settle();

    expect(state().sessionId, 'session-4');
  });

  test('somebody else’s session opening or joining is not this resume', () async {
    controller().resume('/p');

    repository
      ..emit(arrivalOf(sessionStarted(sessionId: 'fresh', claudeSessionId: 'other')))
      ..emit(const SessionJoined(sessionId: 'joined', claudeSessionId: 'other'))
      ..emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'x', seq: 2)));
    await settle();

    expect(state().isPending, isTrue);
    expect(state().sessionId, isNull);
  });

  test('S-22 · a refusal of this command says why, and ends the wait', () async {
    controller().resume('/p');

    repository.emit(const CommandRefused(commandId: 'command-1', failure: notFound));
    await settle();

    expect(state(), const ResumeState(failure: notFound));
  });

  test('a refusal of another command is not this resume’s', () async {
    controller().resume('/p');

    repository.emit(const CommandRefused(commandId: 'command-99', failure: notFound));
    await settle();

    expect(state().isPending, isTrue);
  });

  test('nothing is taken while no resume is in flight', () async {
    repository.emit(arrivalOf(sessionStarted(sessionId: 's', claudeSessionId: 'conv-1')));
    await settle();

    expect(state(), const ResumeState());
  });

  test('once the screen has moved to the session, it is forgotten', () async {
    controller().resume('/p');
    repository.emit(const SessionJoined(sessionId: 'session-3', claudeSessionId: 'conv-1'));
    await settle();

    controller().acknowledge();

    expect(state(), const ResumeState());
  });
}
