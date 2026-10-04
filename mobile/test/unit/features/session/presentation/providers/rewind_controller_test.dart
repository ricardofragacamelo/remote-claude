/// Undoing a session's files: the points, the undo in flight, and what it did (B-19, B-21).
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/rewind_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/builders/undo.dart';
import '../../../../../support/fakes/fake_checkpoint_repository.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

const Failure locked = ServerFailure(
  code: 'SESSION_LOCKED',
  messageKey: 'session.error.locked',
  traceId: 'trace-1',
);

const Failure incomplete = ServerFailure(
  code: 'INTERNAL_ERROR',
  messageKey: 'session.error.rewindIncomplete',
  traceId: 'trace-2',
  params: <String, String>{'failed': '1'},
);

void main() {
  late FakeSessionRepository sessions;
  late FakeCheckpointRepository points;
  late ProviderContainer container;

  final RewindControllerProvider provider = rewindControllerProvider('session-1');

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<ProviderSubscription<AsyncValue<RewindBoard>>> open() async {
    final ProviderSubscription<AsyncValue<RewindBoard>> subscription = container.listen(
      provider,
      (AsyncValue<RewindBoard>? previous, AsyncValue<RewindBoard> next) {},
    );
    addTearDown(subscription.close);
    await container.read(provider.future);
    return subscription;
  }

  RewindBoard board() => container.read(provider).value!;
  RewindController controller() => container.read(provider.notifier);

  setUp(() {
    sessions = FakeSessionRepository();
    points = FakeCheckpointRepository()..answer = <Checkpoint>[aCheckpoint()];
    container = ProviderContainer(
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(sessions as SessionRepository),
        checkpointRepositoryProvider.overrideWithValue(points as CheckpointRepository),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await sessions.dispose();
    });
  });

  test('S-38 · reads the points of the session, with what going back would do', () async {
    await open();

    expect(board().checkpoints, <Checkpoint>[aCheckpoint()]);
    expect(points.reads, <String>['session-1']);
  });

  group('undoing', () {
    test('B-18 · sends the undo for the point, and is pending until it answers', () async {
      await open();

      controller().rewind('prompt-1');

      expect(sessions.commands.single.$1, 'session.rewindFiles');
      expect(
        sessions.commands.single.$2,
        equals(<String, Object?>{'sessionId': 'session-1', 'promptId': 'prompt-1'}),
      );
      expect(board().isPending, isTrue);
      expect(board().pendingPromptId, 'prompt-1');
    });

    test('a second tap while one is in flight sends nothing', () async {
      await open();

      controller()
        ..rewind('prompt-1')
        ..rewind('prompt-1');

      expect(sessions.commands, hasLength(1));
    });

    test('S-37 · the outcome of its own undo is shown, and the points are read again', () async {
      await open();
      controller().rewind('prompt-1');

      sessions.emit(arrivalOf(sessionRewound(seq: 5, payload: rewoundPayload())));
      await settle();

      expect(board().outcome, anOutcome());
      expect(board().isPending, isFalse);
      expect(points.reads, hasLength(2));
    });

    test('somebody else’s undo refreshes the points but is not this sheet’s outcome', () async {
      await open();

      sessions.emit(arrivalOf(sessionRewound(seq: 5, payload: rewoundPayload())));
      await settle();

      expect(board().outcome, isNull);
      expect(points.reads, hasLength(2));
    });

    test('S-43 · a refusal of its own undo is said, and it is no longer pending', () async {
      await open();
      controller().rewind('prompt-1');

      sessions.emit(const CommandRefused(commandId: 'command-1', failure: locked));
      await settle();

      expect(board().refusal, locked);
      expect(board().isPending, isFalse);
    });

    test('a refusal of another command changes nothing here', () async {
      await open();
      controller().rewind('prompt-1');

      sessions.emit(const CommandRefused(commandId: 'command-99', failure: locked));
      await settle();

      expect(board().refusal, isNull);
      expect(board().isPending, isTrue);
    });

    test('S-44 · an undo that could not put every file back says so after its outcome', () async {
      await open();
      controller().rewind('prompt-1');

      sessions
        ..emit(
          arrivalOf(
            sessionRewound(seq: 5, payload: rewoundPayload(failed: const <String>['/d.ts'])),
          ),
        )
        ..emit(const SessionFailed(incomplete));
      await settle();

      expect(board().outcome?.failed, <String>['/d.ts']);
      expect(board().incomplete, incomplete);
    });

    test('a failure the session reports with no failed undo on screen is not shown here', () async {
      await open();

      sessions.emit(const SessionFailed(incomplete));
      await settle();

      expect(board().incomplete, isNull);
    });

    test('S-76 · a socket that is not ready sends nothing, and says so', () async {
      await open();
      sessions.accepts = false;

      controller().rewind('prompt-1');

      expect(board().wasNotSent, isTrue);
      expect(board().isPending, isFalse);
    });

    test('a new undo forgets the answer to the last one', () async {
      await open();
      controller().rewind('prompt-1');
      sessions.emit(const CommandRefused(commandId: 'command-1', failure: locked));
      await settle();

      controller().rewind('prompt-1');

      expect(board().refusal, isNull);
      expect(board().isPending, isTrue);
    });

    test('dismissing forgets the answer, and keeps the points', () async {
      await open();
      controller().rewind('prompt-1');
      sessions.emit(arrivalOf(sessionRewound(seq: 5, payload: rewoundPayload())));
      await settle();

      controller().dismiss();

      expect(board().outcome, isNull);
      expect(board().checkpoints, isNotEmpty);
    });
  });

  group('reading the points again', () {
    test('a finished turn moves the reach of every point, so they are read again', () async {
      await open();
      points.answer = <Checkpoint>[aCheckpoint(promptId: 'prompt-2'), aCheckpoint()];

      sessions.emit(arrivalOf(turnCompleted(seq: 3)));
      await settle();

      expect(board().checkpoints.map((Checkpoint p) => p.promptId), <String>[
        'prompt-2',
        'prompt-1',
      ]);
    });

    test('events that change no file read nothing', () async {
      await open();

      sessions
        ..emit(arrivalOf(messageDelta(messageId: 'm', delta: 'x', seq: 2)))
        ..emit(const StreamGap())
        ..emit(const SessionJoined(sessionId: 's-9'));
      await settle();

      expect(points.reads, hasLength(1));
    });

    test('a reading that fails keeps the points on screen, and says they may be stale', () async {
      await open();
      points.failure = locked;

      sessions.emit(arrivalOf(turnCompleted(seq: 3)));
      await settle();

      expect(board().checkpoints, <Checkpoint>[aCheckpoint()]);
      expect(board().refreshFailure, locked);

      points.failure = null;
      sessions.emit(arrivalOf(turnCompleted(seq: 4, turnId: 'turn-2')));
      await settle();

      expect(board().refreshFailure, isNull);
    });

    test('an answer that arrives after a newer reading is dropped', () async {
      await open();
      points.gate = Completer<void>();
      sessions.emit(arrivalOf(turnCompleted(seq: 3)));
      await settle();

      points.answer = <Checkpoint>[aCheckpoint(promptId: 'newest')];
      final Completer<void> first = points.gate!;
      points.gate = null;
      sessions.emit(arrivalOf(turnCompleted(seq: 4, turnId: 'turn-2')));
      await settle();
      points.answer = <Checkpoint>[aCheckpoint(promptId: 'stale')];
      first.complete();
      await settle();

      expect(board().checkpoints.single.promptId, 'newest');
    });

    test('updates arriving before the points were read change nothing', () async {
      points.gate = Completer<void>();
      final ProviderSubscription<AsyncValue<RewindBoard>> subscription = container.listen(
        provider,
        (AsyncValue<RewindBoard>? previous, AsyncValue<RewindBoard> next) {},
      );
      addTearDown(subscription.close);
      await settle();

      sessions.emit(arrivalOf(turnCompleted(seq: 3)));
      await settle();
      points.gate!.complete();
      await container.read(provider.future);

      expect(points.reads, hasLength(1));
    });

    test('a sheet closed before its reading answered is not written to', () async {
      final ProviderSubscription<AsyncValue<RewindBoard>> subscription = await open();
      points.gate = Completer<void>();
      sessions.emit(arrivalOf(turnCompleted(seq: 3)));
      await settle();

      subscription.close();
      await settle();
      points.gate!.complete();
      await settle();

      expect(points.reads, hasLength(2));
    });
  });

  group('points that could not be read', () {
    test('are a failure, and a retry reads them again with a loading state between', () async {
      points.failure = locked;
      final ProviderSubscription<AsyncValue<RewindBoard>> subscription = container.listen(
        provider,
        (AsyncValue<RewindBoard>? previous, AsyncValue<RewindBoard> next) {},
      );
      addTearDown(subscription.close);
      await settle();
      expect(container.read(provider).error, locked);

      // Nothing to undo from before the points are there.
      controller()
        ..rewind('prompt-1')
        ..dismiss();
      expect(sessions.commands, isEmpty);

      points.failure = null;
      controller().retry();

      expect(
        await container.read(provider.future),
        RewindBoard(checkpoints: <Checkpoint>[aCheckpoint()]),
      );
    });
  });

  test('the answer of an event is the domain’s, not the frame’s', () {
    expect(
      arrivalOf(sessionRewound(seq: 5, payload: rewoundPayload())),
      EventReceived(FilesRewound(5, anOutcome()), sessionId: 'session-1'),
    );
  });
}
