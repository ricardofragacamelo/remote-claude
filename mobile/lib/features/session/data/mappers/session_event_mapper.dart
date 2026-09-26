/// Reads a frame as something the app has words for.
///
/// This is the only file that knows both the wire and the session's events. A frame never leaves
/// `data/`: everything above works with [SessionEvent], which is why every ordering rule can be
/// tested without JSON, a socket or a contract.
///
/// A frame it cannot read becomes an [UnreadEvent] rather than nothing. Two different things are
/// going on and both need the resume point to move: an event added to the contract after this
/// build shipped, and a payload missing the field it is about. Dropping either would have the
/// client ask for it again after every reconnection, for ever.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/session/data/mappers/pong_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// The event in [frame], or `null` when the frame is not part of a session's history.
///
/// A frame with no `seq` is not: a question is asked, not recorded, and it belongs to the
/// permission queue rather than to the transcript.
SessionEvent? sessionEventFrom(Envelope frame) {
  final int? seq = frame.seq;

  if (seq == null) {
    return null;
  }

  final Map<String, Object?> payload = frame.payload ?? const <String, Object?>{};

  return switch (frame.type) {
    'session.started' => _opened(seq, payload, frame.sessionId),
    'session.statusChanged' => _status(seq, payload),
    'message.delta' => _fragment(seq, payload),
    'message.completed' => _finished(seq, payload),
    'tool.started' => _invoked(seq, payload),
    'tool.progress' => _output(seq, payload),
    'tool.completed' => _toolOutcome(seq, payload),
    'turn.completed' => _turn(seq, payload),
    'session.closed' => _closed(seq, payload, frame.ts),
    _ => _pongOr(seq, frame),
  };
}

SessionEvent _opened(int seq, Map<String, Object?> payload, String? onFrame) {
  // The payload names it, and the envelope names it too. Either will do; a frame that names it
  // nowhere is one this build cannot act on.
  final String? sessionId = _text(payload, 'sessionId') ?? onFrame;

  return sessionId == null ? UnreadEvent(seq) : SessionOpened(seq, sessionId);
}

SessionEvent _pongOr(int seq, Envelope frame) {
  final Pong? pong = pongFrom(frame);

  return pong == null ? UnreadEvent(seq) : PongArrived(seq, pong);
}

SessionEvent _status(int seq, Map<String, Object?> payload) {
  final SessionStatus? status = switch (_text(payload, 'status')) {
    'starting' => SessionStatus.starting,
    'idle' => SessionStatus.idle,
    'thinking' => SessionStatus.thinking,
    'running' => SessionStatus.running,
    'waitingPermission' => SessionStatus.waitingPermission,
    'closed' => SessionStatus.closed,
    _ => null,
  };

  return status == null ? UnreadEvent(seq) : SessionStatusReported(seq, status);
}

SessionEvent _fragment(int seq, Map<String, Object?> payload) {
  final String? messageId = _text(payload, 'messageId');
  final String? delta = _text(payload, 'delta');

  return messageId == null || delta == null
      ? UnreadEvent(seq)
      : MessageFragment(seq, messageId: messageId, delta: delta);
}

SessionEvent _finished(int seq, Map<String, Object?> payload) {
  final String? messageId = _text(payload, 'messageId');

  if (messageId == null) {
    return UnreadEvent(seq);
  }

  final List<Object?> blocks = payload['content'] is List<Object?>
      ? payload['content']! as List<Object?>
      : const <Object?>[];

  return MessageFinished(
    seq,
    messageId: messageId,
    text: blocks
        .map((Object? block) => block is Map<String, Object?> ? (_text(block, 'text') ?? '') : '')
        .join(),
    isFromUser: _text(payload, 'role') == 'user',
  );
}

SessionEvent _invoked(int seq, Map<String, Object?> payload) {
  final String? toolUseId = _text(payload, 'toolUseId');
  final String? toolName = _text(payload, 'toolName');

  if (toolUseId == null || toolName == null) {
    return UnreadEvent(seq);
  }

  return ToolInvoked(
    seq,
    toolUseId: toolUseId,
    toolName: toolName,
    input: payload['input'] is Map<String, Object?>
        ? payload['input']! as Map<String, Object?>
        : const <String, Object?>{},
  );
}

SessionEvent _output(int seq, Map<String, Object?> payload) {
  final String? toolUseId = _text(payload, 'toolUseId');
  final String? chunk = _text(payload, 'chunk');

  return toolUseId == null || chunk == null
      ? UnreadEvent(seq)
      : ToolOutput(seq, toolUseId: toolUseId, chunk: chunk);
}

SessionEvent _toolOutcome(int seq, Map<String, Object?> payload) {
  final String? toolUseId = _text(payload, 'toolUseId');

  final ToolStatus? status = switch (_text(payload, 'status')) {
    'succeeded' => ToolStatus.succeeded,
    'failed' => ToolStatus.failed,
    'denied' => ToolStatus.denied,
    _ => null,
  };

  return toolUseId == null || status == null
      ? UnreadEvent(seq)
      : ToolFinished(seq, toolUseId: toolUseId, status: status, summary: _text(payload, 'summary'));
}

SessionEvent _turn(int seq, Map<String, Object?> payload) {
  final String? turnId = _text(payload, 'turnId');
  final String? costUsd = _text(payload, 'costUsd');
  final Object? durationMs = payload['durationMs'];

  if (turnId == null || costUsd == null || durationMs is! int) {
    return UnreadEvent(seq);
  }

  return TurnFinished(seq, TurnSummary(turnId: turnId, costUsd: costUsd, durationMs: durationMs));
}

SessionEvent _closed(int seq, Map<String, Object?> payload, String at) {
  final SessionCloseReason? reason = switch (_text(payload, 'reason')) {
    'closedByUser' => SessionCloseReason.closedByUser,
    'completed' => SessionCloseReason.completed,
    'failed' => SessionCloseReason.failed,
    'auditUnavailable' => SessionCloseReason.auditUnavailable,
    'shutdown' => SessionCloseReason.shutdown,
    _ => null,
  };

  return reason == null
      ? UnreadEvent(seq)
      : SessionFinished(seq, SessionEnding(reason: reason, at: at));
}

/// A string field, or `null` when it is absent or is something else.
String? _text(Map<String, Object?> payload, String key) {
  final Object? value = payload[key];
  return value is String ? value : null;
}
