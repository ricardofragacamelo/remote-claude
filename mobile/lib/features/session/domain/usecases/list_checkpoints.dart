/// Reading the undo points. One use case, one thing it does.
library;

import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';

/// Where a session's files can go back to, and what going back would do.
class ListCheckpoints {
  const ListCheckpoints(this._checkpoints);

  final CheckpointRepository _checkpoints;

  Future<List<Checkpoint>> call(String sessionId) => _checkpoints.list(sessionId);
}
