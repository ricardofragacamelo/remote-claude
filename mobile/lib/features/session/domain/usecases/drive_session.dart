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

  /// Changes the model of a running session.
  static const String setModel = 'session.setModel';

  /// Changes the permission mode of a running session.
  static const String setPermissionMode = 'session.setPermissionMode';

  /// Takes a prompt out of the session's queue before it starts.
  static const String cancelQueuedPrompt = 'session.cancelQueuedPrompt';
}

/// What a session opens with, chosen before it exists — the draft (D-05). `null` is the
/// installation's default.
class SessionChoices {
  const SessionChoices({this.model, this.permissionMode, this.effort});

  final String? model;
  final String? permissionMode;

  /// Only here: changing it on a live session drops the hook that asks before each tool (08 · D-16).
  final String? effort;
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
  String? start(String workspacePath, {SessionChoices choices = const SessionChoices()}) =>
      _repository.issue(SessionCommands.start, <String, Object?>{
        'workspacePath': workspacePath,
        'model': ?choices.model,
        'permissionMode': ?choices.permissionMode,
        'effort': ?choices.effort,
      });

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

  /// Continues [conversationId] in a **new** conversation, from before the prompt [messageId] — the
  /// edit and resend, and the fork from a prompt (08 · D-19). Never a truncation: the original stays
  /// as it was.
  ///
  /// @returns the id the command left with — what the `session.started` of the fork and a refusal
  ///   name: a point that is not a prompt of the conversation (`INVALID_INPUT`) — or `null` when
  ///   nothing left
  String? fork(String workspacePath, String conversationId, String messageId) =>
      _repository.issue(SessionCommands.start, <String, Object?>{
        'workspacePath': workspacePath,
        'resumeSessionId': conversationId,
        'forkAt': messageId,
      });

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

  /// Changes the model of [sessionId].
  ///
  /// @returns the id the command left with — what a refusal names (`INVALID_INPUT`) — or `null`
  ///   when nothing left. The server acknowledges; it never echoes the change.
  String? setModel(String sessionId, String model) => _repository.issue(
    SessionCommands.setModel,
    <String, Object?>{'sessionId': sessionId, 'model': model},
  );

  /// Changes the permission mode of [sessionId]. @returns as [setModel]
  String? setPermissionMode(String sessionId, String mode) => _repository.issue(
    SessionCommands.setPermissionMode,
    <String, Object?>{'sessionId': sessionId, 'mode': mode},
  );

  /// Takes [queueId] out of the queue of [sessionId].
  ///
  /// @returns the id the command left with — what a refusal names: the prompt already started
  ///   (`CONFLICT`), or no longer queued (`QUEUED_PROMPT_NOT_FOUND`) — or `null` when nothing left
  String? cancelQueuedPrompt(String sessionId, String queueId) => _repository.issue(
    SessionCommands.cancelQueuedPrompt,
    <String, Object?>{'sessionId': sessionId, 'queueId': queueId},
  );

  /// Interrupts the turn that is running.
  bool interrupt(String sessionId) =>
      _repository.send(SessionCommands.interrupt, <String, Object?>{'sessionId': sessionId});

  /// Ends the session. Only whoever opened it may.
  bool close(String sessionId) =>
      _repository.send(SessionCommands.close, <String, Object?>{'sessionId': sessionId});
}
