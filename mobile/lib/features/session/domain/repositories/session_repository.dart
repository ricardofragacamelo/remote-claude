/// What the session use cases need from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/session_update.dart';

/// The session's stream and its one command, behind one door.
abstract interface class SessionRepository {
  /// Every update of the stream, from whichever session is being followed.
  Stream<SessionUpdate> get updates;

  /// Starts following [sessionId], in place of whatever was followed.
  ///
  /// [lastSeq] is read at attach time — including after a reconnect — so the server knows where
  /// the replay has to start.
  ///
  /// @returns what stops **this** following — and nothing else: called after another screen
  ///   followed in its place, it does nothing. A screen being left must never cut the session the
  ///   next screen just followed (plan 10, F5: leaving the round trip for a session did exactly
  ///   that, and the conversation stopped arriving).
  void Function() follow(String sessionId, int Function() lastSeq);

  /// Stops following, whoever followed.
  ///
  /// Not optional: without it, moving between sessions accumulates subscriptions and the screen
  /// starts receiving events for a session it no longer shows.
  void unfollow();

  /// Sends a ping. Omitting [sessionId] opens a session.
  ///
  /// @returns whether the command left; a socket that is not ready sends nothing
  bool ping({String? sessionId, required String nonce});

  /// Sends one of the session's commands.
  ///
  /// @returns whether the command left; a socket that is not ready sends nothing, and the screen
  ///   says so rather than pretending the prompt is on its way (S-76)
  bool send(String type, Map<String, Object?> payload);

  /// Sends one of the session's commands and answers the id it left with, or `null` when nothing
  /// left.
  ///
  /// The id is what a refusal names, so a screen that has to tell **its** refusal from anybody
  /// else's on the same socket keeps it.
  String? issue(String type, Map<String, Object?> payload);
}
