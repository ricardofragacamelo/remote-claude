/// Watches a session's stream.
library;

import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';

/// The stream of updates, and the two calls that decide which session it carries.
class WatchSession {
  const WatchSession(this._repository);

  final SessionRepository _repository;

  /// Every update.
  Stream<SessionUpdate> call() => _repository.updates;

  /// Starts following [sessionId], resuming from what [lastSeq] answers.
  void follow(String sessionId, int Function() lastSeq) => _repository.follow(sessionId, lastSeq);

  /// Stops following.
  void unfollow() => _repository.unfollow();
}
