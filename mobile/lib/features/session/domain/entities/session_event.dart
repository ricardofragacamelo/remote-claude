/// Something that happened in a session, in the app's own words.
///
/// Pure Dart, and deliberately **not** an `Envelope`: the wire stops at `data/`, and everything
/// above works with these. That is what lets every ordering rule of the stream be tested without
/// a socket, a frame or a JSON payload.
///
/// Sealed, so a `switch` over it is exhaustive — an event nobody handled becomes a compile error
/// rather than one that silently does nothing. [UnreadEvent] is the deliberate exception: a
/// published app has to survive the contract growing an event it has never heard of, and it still
/// has to move its resume point past it.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';

/// One event of a session's stream.
sealed class SessionEvent extends Equatable {
  const SessionEvent(this.seq);

  /// Where this event sits in the session's order. A replay re-delivers everything up to it.
  final int seq;

  @override
  List<Object?> get props => <Object?>[seq];
}

/// The session is open and nothing is running in it.
///
/// It **names** the session, and that is the point of it: `session.start` carries no id — it is
/// what creates one — so this is where the screen that asked learns which session answered.
final class SessionOpened extends SessionEvent {
  const SessionOpened(super.seq, this.sessionId);

  final String sessionId;

  @override
  List<Object?> get props => <Object?>[seq, sessionId];
}

/// The session moved.
final class SessionStatusReported extends SessionEvent {
  const SessionStatusReported(super.seq, this.status);

  final SessionStatus status;

  @override
  List<Object?> get props => <Object?>[seq, status];
}

/// A fragment of a message.
final class MessageFragment extends SessionEvent {
  const MessageFragment(super.seq, {required this.messageId, required this.delta});

  final String messageId;
  final String delta;

  @override
  List<Object?> get props => <Object?>[seq, messageId, delta];
}

/// A message, whole. It replaces whatever the fragments built.
final class MessageFinished extends SessionEvent {
  const MessageFinished(
    super.seq, {
    required this.messageId,
    required this.text,
    required this.isFromUser,
  });

  final String messageId;
  final String text;
  final bool isFromUser;

  @override
  List<Object?> get props => <Object?>[seq, messageId, text, isFromUser];
}

/// A tool started running on the user's machine.
final class ToolInvoked extends SessionEvent {
  const ToolInvoked(
    super.seq, {
    required this.toolUseId,
    required this.toolName,
    required this.input,
  });

  final String toolUseId;
  final String toolName;

  /// Exactly what the tool was asked to do. Never a summary of it.
  final Map<String, Object?> input;

  @override
  List<Object?> get props => <Object?>[seq, toolUseId, toolName, input];
}

/// Something a tool printed.
final class ToolOutput extends SessionEvent {
  const ToolOutput(super.seq, {required this.toolUseId, required this.chunk});

  final String toolUseId;
  final String chunk;

  @override
  List<Object?> get props => <Object?>[seq, toolUseId, chunk];
}

/// How a tool ended.
final class ToolFinished extends SessionEvent {
  const ToolFinished(super.seq, {required this.toolUseId, required this.status, this.summary});

  final String toolUseId;
  final ToolStatus status;
  final String? summary;

  @override
  List<Object?> get props => <Object?>[seq, toolUseId, status, summary];
}

/// What a finished turn cost.
final class TurnFinished extends SessionEvent {
  const TurnFinished(super.seq, this.turn);

  final TurnSummary turn;

  @override
  List<Object?> get props => <Object?>[seq, turn];
}

/// The session ended.
final class SessionFinished extends SessionEvent {
  const SessionFinished(super.seq, this.ending);

  final SessionEnding ending;

  @override
  List<Object?> get props => <Object?>[seq, ending];
}

/// A round trip of the walking skeleton came back.
final class PongArrived extends SessionEvent {
  const PongArrived(super.seq, this.pong);

  final Pong pong;

  @override
  List<Object?> get props => <Object?>[seq, pong];
}

/// An event this build cannot read — unknown, or carrying a payload it did not expect.
///
/// It exists so the resume point still moves past it. Dropping it would make the client ask for
/// the same event again after every reconnection, for ever.
final class UnreadEvent extends SessionEvent {
  const UnreadEvent(super.seq);
}
