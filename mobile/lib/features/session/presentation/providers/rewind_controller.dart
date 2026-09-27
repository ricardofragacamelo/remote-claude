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

  RewindBoard _copy({
    List<Checkpoint>? checkpoints,
    String? pendingPromptId,
    bool? wasNotSent,
    Failure? refusal,
    RewindOutcome? outcome,
    Failure? incomplete,
    Failure? refreshFailure,
    bool settled = false,
    bool clearAnswer = false,
    bool clearRefreshFailure = false,
  }) => RewindBoard(
    checkpoints: checkpoints ?? this.checkpoints,
    // What is passed wins; what is cleared is cleared before it, so one call can forget the last
    // answer and record the new one.
    pendingPromptId: pendingPromptId ?? (settled ? null : this.pendingPromptId),
    wasNotSent: wasNotSent ?? (!clearAnswer && this.wasNotSent),
    refusal: refusal ?? (clearAnswer ? null : this.refusal),
    outcome: outcome ?? (clearAnswer ? null : this.outcome),
    incomplete: incomplete ?? (clearAnswer ? null : this.incomplete),
    refreshFailure: clearRefreshFailure ? null : refreshFailure ?? this.refreshFailure,
  );

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
          ? board._copy(clearAnswer: true, wasNotSent: true)
          : board._copy(clearAnswer: true, pendingPromptId: promptId),
    );
  }

  /// Forgets the answer to the last undo, once the person has read it.
  void dismiss() {
    final RewindBoard? board = state.value;

    if (board != null) {
      state = AsyncValue<RewindBoard>.data(board._copy(clearAnswer: true));
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
          _publish(board._copy(outcome: outcome, settled: true));
        }
        unawaited(_refresh());

      // A finished turn may have written files, and so moved every point's reach.
      case EventReceived(event: TurnFinished()):
        unawaited(_refresh());

      case CommandRefused(:final String commandId, :final Failure failure)
          when commandId == _commandId && board.isPending:
        _publish(board._copy(refusal: failure, settled: true));

      // The session saying the undo it just reported could not put every file back.
      case SessionFailed(:final Failure failure) when board.outcome?.failed.isNotEmpty ?? false:
        _publish(board._copy(incomplete: failure));

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
      _settle(
        reading,
        (RewindBoard now) => now._copy(checkpoints: checkpoints, clearRefreshFailure: true),
      );
    } on Object catch (error) {
      _settle(reading, (RewindBoard now) => now._copy(refreshFailure: asFailure(error)));
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
