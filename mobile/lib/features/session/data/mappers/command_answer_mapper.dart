/// Reads the answers to a command that are not events of a session: joining one that was already
/// live, a refusal, and a failure the session reports without naming any command.
///
/// This is the only file that knows both those frames and the updates they become.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/failure_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';

/// The session a `session.attached` ack joined, or `null` when [frame] is not one.
///
/// Only an ack for a session this connection does not watch reaches here — the answer to a
/// resume of a conversation that was already live (S-24).
SessionJoined? sessionJoinedFrom(Envelope frame) {
  final Map<String, Object?> payload = frame.payload ?? const <String, Object?>{};
  final Object? sessionId = payload['sessionId'];

  if (frame.type != sessionAttachedType || sessionId is! String) {
    return null;
  }

  return SessionJoined(
    sessionId: sessionId,
    claudeSessionId: _text(payload, 'claudeSessionId'),
    resumedFrom: _text(payload, 'resumedFrom'),
  );
}

/// The acceptance a `command.accepted` ack carries, or `null` when [frame] is not one that names a
/// command.
CommandAccepted? commandAcceptedFrom(Envelope frame) {
  final String? commandId = frame.correlationId;

  return frame.type == commandAcceptedType && commandId != null ? CommandAccepted(commandId) : null;
}

/// The refusal an `error` frame carries, or `null` when [frame] is not one that names a command.
///
/// The payload is the error envelope of HTTP, so it is read by the same function: a refusal over
/// the socket and one over HTTP reach the screen as the same [Failure] (S-17).
CommandRefused? commandRefusedFrom(Envelope frame) {
  final String? commandId = frame.correlationId;

  if (frame.kind != errorKind || commandId == null) {
    return null;
  }

  return CommandRefused(commandId: commandId, failure: _failureOf(frame));
}

/// The failure an `error` frame that names **no** command carries, or `null` when [frame] is not
/// one.
///
/// The session reporting rather than refusing: an undo that could not put every file back follows
/// its `session.rewound` with one (S-44).
SessionFailed? sessionFailedFrom(Envelope frame) {
  if (frame.kind != errorKind || frame.correlationId != null) {
    return null;
  }

  return SessionFailed(_failureOf(frame), sessionId: frame.sessionId);
}

Failure _failureOf(Envelope frame) =>
    failureFromEnvelope(<String, Object?>{'error': frame.payload}, frame.traceId ?? frame.id);

String? _text(Map<String, Object?> payload, String key) {
  final Object? value = payload[key];
  return value is String ? value : null;
}
