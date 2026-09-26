/// The commands that drive a session.
///
/// One class rather than four one-line ones. They are the same act — "say this to the session on
/// the other end" — and four files that each forward a map would be four places to forget the
/// same guard, with nothing gained: the names of the contract are what carry the meaning, and
/// they are all here, in one place, spelled once.
library;

import 'package:remote_claude/features/session/domain/repositories/session_repository.dart';

/// The command names of the contract. Nothing else in the app spells them.
abstract final class SessionCommands {
  /// Opens a session on a workspace.
  static const String start = 'session.start';

  /// Sends one turn.
  static const String prompt = 'session.prompt';

  /// Stops the turn that is running.
  static const String interrupt = 'session.interrupt';

  /// Ends the session and releases its subprocess.
  static const String close = 'session.close';
}

/// What the screen can ask of a session.
///
/// Every call answers **whether the command left**. A socket that is not ready sends nothing, and
/// that has to reach the screen: a prompt that vanished because the phone was between networks,
/// with the composer cleared as if it had been sent, is the worst of the three outcomes (S-76).
class DriveSession {
  const DriveSession(this._repository);

  final SessionRepository _repository;

  /// Opens a session on [workspacePath].
  bool start(String workspacePath) =>
      _repository.send(SessionCommands.start, <String, Object?>{'workspacePath': workspacePath});

  /// Sends one turn. A prompt arriving mid-turn is queued by the backend, never refused.
  bool prompt(String sessionId, String text) => _repository.send(
    SessionCommands.prompt,
    <String, Object?>{'sessionId': sessionId, 'text': text},
  );

  /// Interrupts the turn that is running.
  bool interrupt(String sessionId) =>
      _repository.send(SessionCommands.interrupt, <String, Object?>{'sessionId': sessionId});

  /// Ends the session. Only whoever opened it may.
  bool close(String sessionId) =>
      _repository.send(SessionCommands.close, <String, Object?>{'sessionId': sessionId});
}
