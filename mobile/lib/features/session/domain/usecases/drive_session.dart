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

  /// Puts the files the session wrote back to how they were before one of its turns.
  static const String rewindFiles = 'session.rewindFiles';
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
  ///
  /// @returns the id the command left with — what a refusal of it names: the machine already at
  ///   its ceiling (`SESSION_LIMIT_REACHED`), a folder no longer allowed — or `null` when nothing
  ///   left
  String? start(String workspacePath) =>
      _repository.issue(SessionCommands.start, <String, Object?>{'workspacePath': workspacePath});

  /// Continues [conversationId] — a conversation of Claude's store — in [workspacePath], which is
  /// where it ran.
  ///
  /// @returns the id the command left with, which is what a refusal of it will name, or `null`
  ///   when nothing left. It is answered either by a new session (`session.started`, naming the
  ///   conversation it continues) or, when that conversation is already live, by joining it —
  ///   resuming what is live is an attach, never a second subprocess (S-24).
  String? resume(String workspacePath, String conversationId) => _repository.issue(
    SessionCommands.start,
    <String, Object?>{'workspacePath': workspacePath, 'resumeSessionId': conversationId},
  );

  /// Sends one turn. A prompt arriving mid-turn is queued by the backend, never refused.
  ///
  /// A slash command is a prompt like any other — `/init` is sent as its text — and one the
  /// installation does not have is refused by name (S-34), so the id is kept to recognise it.
  ///
  /// @returns the id the command left with, or `null` when nothing left
  String? prompt(String sessionId, String text) => _repository.issue(
    SessionCommands.prompt,
    <String, Object?>{'sessionId': sessionId, 'text': text},
  );

  /// Puts the files back to how they were before the turn [promptId].
  ///
  /// @returns the id the command left with — what a refusal names: a turn running
  ///   (`SESSION_LOCKED`), a session no longer live, a point that is not this session's — or
  ///   `null` when nothing left. The result arrives as `session.rewound`, for everyone watching.
  String? rewindFiles(String sessionId, String promptId) => _repository.issue(
    SessionCommands.rewindFiles,
    <String, Object?>{'sessionId': sessionId, 'promptId': promptId},
  );

  /// Interrupts the turn that is running.
  bool interrupt(String sessionId) =>
      _repository.send(SessionCommands.interrupt, <String, Object?>{'sessionId': sessionId});

  /// Ends the session. Only whoever opened it may.
  bool close(String sessionId) =>
      _repository.send(SessionCommands.close, <String, Object?>{'sessionId': sessionId});
}
