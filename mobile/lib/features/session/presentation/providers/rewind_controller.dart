/// Undoing what one session wrote on disk: the points it can go back to, the undo in flight, and
/// what the last one did.
///
/// The controller is the only layer that knows both sides: the sheet above, the use cases below.
///
/// Three things keep it honest:
///
/// - **the points are read again** after every finished turn and every undo — the reach of a point
///   is what would happen **now**, and both change it;
/// - **its own undo is recognised by the id it left with** — a refusal names that id, and the
///   `session.rewound` it waits for names the point it asked for;
/// - **a second tap while one is in flight sends nothing** — two undos are two writes to disk.
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/presentation/providers/session_updates.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'rewind_controller.g.dart';

/// What the undo sheet renders once the points have been read.
class RewindBoard extends Equatable {
  const RewindBoard({
    this.checkpoints = const <Checkpoint>[],
    this.pendingPromptId,
    this.wasNotSent = false,
    this.refusal,
    this.outcome,
    this.incomplete,
    this.refreshFailure,
  });

  /// [from] with the points read again, and its undo side kept as it was.
  RewindBoard._repointed(RewindBoard from, this.checkpoints, this.refreshFailure)
    : pendingPromptId = from.pendingPromptId,
      wasNotSent = from.wasNotSent,
      refusal = from.refusal,
      outcome = from.outcome,
      incomplete = from.incomplete;

  /// Newest first.
  final List<Checkpoint> checkpoints;

  /// The point an undo was sent for and nothing has answered yet. A second tap sends nothing.
  final String? pendingPromptId;

  /// The socket was not ready, so nothing left — said out loud, never swallowed.
  final bool wasNotSent;

  /// Why the server refused the undo: a turn running, the session gone, a point it does not know.
  final Failure? refusal;

  /// What the last undo of this sheet did, file by file.
  final RewindOutcome? outcome;

  /// What the session said after an undo that could not put every file back (S-44).
  final Failure? incomplete;

  /// Why reading the points again failed. The points on screen are the last ones read, and the
  /// sheet says they may be stale rather than replacing them with an error.
  final Failure? refreshFailure;

  /// Whether an undo is in flight.
  bool get isPending => pendingPromptId != null;

  /// This board with the undo side replaced by what is passed, and the points kept.
  ///
  /// What is not passed is forgotten — the point in flight included, so a call without
  /// [pendingPromptId] settles the undo. One call forgets the last answer and records the new one.
  RewindBoard _answered({
    String? pendingPromptId,
    bool wasNotSent = false,
    Failure? refusal,
    RewindOutcome? outcome,
    Failure? incomplete,
  }) => RewindBoard(
    checkpoints: checkpoints,
    pendingPromptId: pendingPromptId,
    wasNotSent: wasNotSent,
    refusal: refusal,
    outcome: outcome,
    incomplete: incomplete,
    refreshFailure: refreshFailure,
  );

  /// This board with the points read again, and the undo side kept.
  ///
  /// [refreshFailure] is why the reading failed, when it did — and then [checkpoints] are the last
  /// ones read. A reading that worked forgets the failure of the one before.
  RewindBoard _withPoints(List<Checkpoint> checkpoints, {Failure? refreshFailure}) =>
      RewindBoard._repointed(this, checkpoints, refreshFailure);

  @override
  List<Object?> get props => <Object?>[
    checkpoints,
    pendingPromptId,
    wasNotSent,
    refusal,
    outcome,
    incomplete,
    refreshFailure,
  ];
}

/// The undo of one session, keyed by it.
///
/// Built when the sheet opens and let go when it closes. While it lives it listens to the session's
/// stream, which the session screen underneath keeps attached.
@riverpod
class RewindController extends _$RewindController {
  /// The id the last undo left with, which is what a refusal of it names.
  String? _commandId;

  /// Bumped by every reading, so an answer that arrives after a newer question is dropped.
  int _readings = 0;

  @override
  Future<RewindBoard> build(String sessionId) async {
    listenToUpdates(ref, _apply);
    return RewindBoard(checkpoints: await ref.watch(listCheckpointsProvider)(sessionId));
  }

  /// Reads the points again, after they could not be read at all.
  void retry() => ref.invalidateSelf();

  /// Sends the undo to before [promptId] — once, however many times it is tapped while in flight.
  void rewind(String promptId) {
    final RewindBoard? board = state.value;

    if (board == null || board.isPending) {
      return;
    }

    _commandId = ref.read(driveSessionProvider).rewindFiles(sessionId, promptId);

    state = AsyncValue<RewindBoard>.data(
      _commandId == null
          ? board._answered(wasNotSent: true)
          : board._answered(pendingPromptId: promptId),
    );
  }

  /// Forgets the answer to the last undo, once the person has read it.
  void dismiss() {
    final RewindBoard? board = state.value;

    if (board != null) {
      // The answer goes; an undo still in flight does not.
      state = AsyncValue<RewindBoard>.data(board._answered(pendingPromptId: board.pendingPromptId));
    }
  }

  void _apply(SessionUpdate update) {
    final RewindBoard? board = state.value;

    // Nothing to answer before the points have been read: the reading about to arrive is already
    // the one after whatever this update changed.
    if (board == null) {
      return;
    }

    switch (update) {
      // Its own undo came back. Somebody else's changes the reach of every point, so the points are
      // read again either way — but only the one this sheet asked for is its outcome to show.
      case EventReceived(event: FilesRewound(:final RewindOutcome outcome)):
        if (outcome.promptId == board.pendingPromptId) {
          _publish(board._answered(outcome: outcome));
        }
        unawaited(_refresh());

      // A finished turn may have written files, and so moved every point's reach.
      case EventReceived(event: TurnFinished()):
        unawaited(_refresh());

      case CommandRefused(:final String commandId, :final Failure failure)
          when commandId == _commandId && board.isPending:
        _publish(board._answered(refusal: failure));

      // The session saying the undo it just reported could not put every file back.
      case SessionFailed(:final Failure failure) when board.outcome?.failed.isNotEmpty ?? false:
        _publish(board._answered(outcome: board.outcome, incomplete: failure));

      case EventReceived():
      case StreamGap():
      case SessionJoined():
      case CommandRefused():
      case SessionFailed():
        return;
    }
  }

  Future<void> _refresh() async {
    final int reading = ++_readings;

    try {
      final List<Checkpoint> checkpoints = await _read();
      _settle(reading, (RewindBoard now) => now._withPoints(checkpoints));
    } on Object catch (error) {
      _settle(
        reading,
        (RewindBoard now) => now._withPoints(now.checkpoints, refreshFailure: asFailure(error)),
      );
    }
  }

  /// Applies the answer of reading [reading] to whatever is on screen **now** — which, if an undo
  /// answered meanwhile, is not the board the reading started from.
  void _settle(int reading, RewindBoard Function(RewindBoard now) change) {
    final RewindBoard? now = ref.mounted && reading == _readings ? state.value : null;

    if (now != null) {
      _publish(change(now));
    }
  }

  void _publish(RewindBoard board) => state = AsyncValue<RewindBoard>.data(board);

  Future<List<Checkpoint>> _read() => ref.read(listCheckpointsProvider)(sessionId);
}
