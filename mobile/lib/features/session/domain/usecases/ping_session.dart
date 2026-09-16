/// Sends the one command of the walking skeleton.
library;

import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';

/// Pings a session, or opens one by pinging without an id.
class PingSession {
  const PingSession(this._repository);

  final SessionRepository _repository;

  /// @returns whether the command left; a socket that is not ready sends nothing
  bool call({String? sessionId, required String nonce}) =>
      _repository.ping(sessionId: sessionId, nonce: nonce);
}
