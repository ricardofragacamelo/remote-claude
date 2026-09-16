/// What the session use cases need from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/session_update.dart';

/// The session's stream and its one command, behind one door.
abstract interface class SessionRepository {
  /// Every update of the stream, from whichever session is being followed.
  Stream<SessionUpdate> get updates;

  /// Starts following [sessionId].
  ///
  /// [lastSeq] is read at attach time — including after a reconnect — so the server knows where
  /// the replay has to start.
  void follow(String sessionId, int Function() lastSeq);

  /// Stops following.
  ///
  /// Not optional: without it, moving between sessions accumulates subscriptions and the screen
  /// starts receiving events for a session it no longer shows.
  void unfollow();

  /// Sends a ping. Omitting [sessionId] opens a session.
  ///
  /// @returns whether the command left; a socket that is not ready sends nothing
  bool ping({String? sessionId, required String nonce});
}
