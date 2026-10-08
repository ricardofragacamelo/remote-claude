/// A draft: nothing runs until its first send, which opens one session with what was chosen and
/// sends the prompt there (plan 10, B-08).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/presentation/providers/draft_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/first_prompts.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

const Failure full = ServerFailure(
  code: 'SESSION_LIMIT_REACHED',
  messageKey: 'session.error.limitReached',
  traceId: 'trace-1',
  params: <String, String>{'limit': '3'},
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

    addTearDown(() async {
      container.dispose();
      await sessions.dispose();
    });

    return container;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  ProviderSubscription<Draft> hold(ProviderContainer container) {
    final ProviderSubscription<Draft> held = container.listen(
      draftControllerProvider('/w'),
      (Draft? previous, Draft next) {},
    );
    addTearDown(held.close);
    return held;
  }

  Draft read(ProviderContainer container) => container.read(draftControllerProvider('/w'));
  DraftController drafts(ProviderContainer container) =>
      container.read(draftControllerProvider('/w').notifier);

  test('S-19 · opening a draft sends nothing at all', () {
    final ProviderContainer container = build();
    hold(container);

    expect(read(container), const Draft());
    expect(sessions.commands, isEmpty);
  });

  test(
    'S-19 · the first send opens the session with what was chosen, then sends the prompt',
    () async {
      final ProviderContainer container = build();
      hold(container);

      drafts(container)
        ..chooseModel('opus')
        ..chooseMode('plan')
        ..chooseEffort('high');

      expect(drafts(container).send('fix the build'), isTrue);
      expect(read(container).isStarting, isTrue);
      expect(sessions.commands.single.$1, 'session.start');
      expect(sessions.commands.single.$2, <String, Object?>{
        'workspacePath': '/w',
        'model': 'opus',
        'permissionMode': 'plan',
        'effort': 'high',
      });

      sessions.emit(arrivalOf(sessionStarted(sessionId: 'session-7', correlationId: 'command-1')));
      await settle();

      expect(read(container).sessionId, 'session-7');
      expect(read(container).isStarting, isFalse);
      expect(sessions.commands.last.$1, 'session.prompt');
      expect(sessions.commands.last.$2, <String, Object?>{
        'sessionId': 'session-7',
        'text': 'fix the build',
      });
      // The effort the session started with is remembered: the server never says it again.
      expect(container.read(firstPromptsProvider), <String, String?>{'session-7': 'high'});
    },
  );

  test('plan 23 · S-87 · a draft in Permitir tudo opens the session in it', () {
    final ProviderContainer container = build();
    hold(container);

    drafts(container).chooseMode('allowAll');

    expect(drafts(container).send('fix the build'), isTrue);
    expect(sessions.commands.single.$2, containsPair('permissionMode', 'allowAll'));
  });

  test('S-34 · choosing another model puts the effort back to the default', () {
    final ProviderContainer container = build();
    hold(container);

    drafts(container)
      ..chooseMode('acceptEdits')
      ..chooseEffort('high')
      ..chooseModel('sonnet');

    expect(read(container).choices.effort, isNull);
    expect(read(container).choices.permissionMode, 'acceptEdits');
    expect(read(container).choices.model, 'sonnet');
  });

  test('S-20 · two sends while the session opens open one session', () {
    final ProviderContainer container = build();
    hold(container);

    expect(drafts(container).send('one'), isTrue);
    expect(drafts(container).send('one'), isTrue);

    expect(sessions.commands, hasLength(1));
  });

  test('S-22 · a session another command opened on the same socket is not this one', () async {
    final ProviderContainer container = build();
    hold(container);

    drafts(container).send('mine');
    sessions.emit(arrivalOf(sessionStarted(sessionId: 'other', correlationId: 'command-99')));
    sessions.emit(arrivalOf(sessionStarted(sessionId: 'no-command')));
    sessions.emit(const CommandRefused(commandId: 'command-99', failure: full));
    await settle();

    expect(read(container).sessionId, isNull);
    expect(read(container).failure, isNull);
    expect(read(container).isStarting, isTrue);
    expect(sessions.commands, hasLength(1));
  });

  test(
    'S-18 · a refused start says why, and keeps the choices; closing the strip forgets it',
    () async {
      final ProviderContainer container = build();
      hold(container);
      drafts(container).chooseMode('plan');

      drafts(container).send('mine');
      sessions.emit(const CommandRefused(commandId: 'command-1', failure: full));
      await settle();

      expect(read(container).failure, full);
      expect(read(container).isStarting, isFalse);
      expect(read(container).choices.permissionMode, 'plan');

      drafts(container).dismiss();
      expect(read(container).failure, isNull);
      expect(read(container).choices.permissionMode, 'plan');

      // And a second send is a second start.
      drafts(container).send('mine');
      expect(sessions.commands, hasLength(2));
    },
  );

  test('a start that could not leave says so, and sends nothing later', () async {
    final ProviderContainer container = build();
    hold(container);
    sessions.accepts = false;

    expect(drafts(container).send('mine'), isFalse);
    expect(read(container).wasNotSent, isTrue);

    sessions.emit(arrivalOf(sessionStarted(sessionId: 'x', correlationId: 'command-1')));
    await settle();
    expect(read(container).sessionId, isNull);
  });

  test('S-22 · leaving the draft leaves nothing open, and no prompt goes anywhere later', () async {
    final ProviderContainer container = build();
    final ProviderSubscription<Draft> held = hold(container);

    drafts(container).send('mine');
    held.close();
    await settle();

    sessions.emit(arrivalOf(sessionStarted(sessionId: 'late', correlationId: 'command-1')));
    await settle();

    expect(sessions.commands.single.$1, 'session.start');
  });

  test('drafts compare by what they hold', () {
    expect(const Draft(isStarting: true), const Draft(isStarting: true));
    expect(const Draft(), isNot(const Draft(wasNotSent: true)));
  });
}
