/// Something that happened to a session's stream.
///
/// Sealed so a `switch` over it is exhaustive: an update nobody handled becomes a compile error
/// rather than an event that silently does nothing.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// One update of the stream.
sealed class SessionUpdate extends Equatable {
  const SessionUpdate();
}

/// Something happened in the session being followed.
///
/// The event travels, not the frame: the wire stops at `data/`, and both readers of this stream —
/// the conversation and the walking skeleton's round trip — work with the same domain type, so
/// they cannot go out of step about what arrived.
final class EventReceived extends SessionUpdate {
  const EventReceived(this.event, {this.sessionId});

  /// What happened.
  final SessionEvent event;

  /// The session it happened in, as the frame named it — `null` when it named none. Several
  /// sessions are followed at once, and each screen keeps its own (plan 10, S-172).
  final String? sessionId;

  @override
  List<Object?> get props => <Object?>[event, sessionId];
}

/// The replay buffer no longer held what was missed: drop everything and reload.
final class StreamGap extends SessionUpdate {
  const StreamGap({this.sessionId, this.claudeSessionId});

  /// The session whose stream has the hole, or `null` for one that concerns every session — a
  /// gap of one session must not wipe the screen of another open beside it (plan 10, S-172).
  final String? sessionId;

  /// The conversation to reload the history from, as the ack named it — the only place left that
  /// says so once the buffer has lost the `session.started` that did. `null` for a stream that is
  /// not a conversation.
  final String? claudeSessionId;

  @override
  List<Object?> get props => <Object?>[sessionId, claudeSessionId];
}

/// A command landed on a session that was **already live**, and this connection now watches it.
///
/// It is how a resume of a conversation somebody is still talking to is answered: joining it,
/// never opening a second one beside it (S-24). No `session.started` follows — the session began
/// once — so this is where the screen that asked learns which session it is on.
final class SessionJoined extends SessionUpdate {
  const SessionJoined({required this.sessionId, this.claudeSessionId, this.resumedFrom});

  final String sessionId;

  /// The conversation the joined session writes to.
  final String? claudeSessionId;

  /// The conversation it continues, when it is a resume.
  final String? resumedFrom;

  @override
  List<Object?> get props => <Object?>[sessionId, claudeSessionId, resumedFrom];
}

/// The server accepted a command — not that it finished: the outcome, when there is one, arrives
/// as an event. A change of model or mode has no event, so this is where it stops being pending.
final class CommandAccepted extends SessionUpdate {
  const CommandAccepted(this.commandId);

  /// The id the command left with.
  final String commandId;

  @override
  List<Object?> get props => <Object?>[commandId];
}

/// The server refused a command, and said why.
///
/// [commandId] is the id the command left with, which is what lets the one screen that sent it
/// tell its own refusal from anybody else's on the same socket.
final class CommandRefused extends SessionUpdate {
  const CommandRefused({required this.commandId, required this.failure});

  final String commandId;
  final Failure failure;

  @override
  List<Object?> get props => <Object?>[commandId, failure];
}

/// The server said something went wrong in the session, without naming a command.
///
/// An `error` frame with no `correlationId`: nobody's command is being refused, the session itself
/// is reporting. An undo that could not put every file back is the one that exists — it follows
/// the `session.rewound` that lists them (docs/architecture/shared/05-websocket-protocol.md).
final class SessionFailed extends SessionUpdate {
  const SessionFailed(this.failure, {this.sessionId});

  final Failure failure;

  /// The session that reports it, when the frame named one — the fork the CLI refused names the
  /// session that was opened for it.
  final String? sessionId;

  @override
  List<Object?> get props => <Object?>[failure, sessionId];
}
