/// What undoing a session's files needs to read from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';

/// The points a live session's files can go back to.
abstract interface class CheckpointRepository {
  /// Every undo point of [sessionId], newest first, each with what going back would do **now**.
  ///
  /// @throws [Failure] never an exception of the transport — `SESSION_NOT_FOUND` for a session
  ///   that is not live, `INVALID_INPUT` for an id that is not one
  Future<List<Checkpoint>> list(String sessionId);
}
