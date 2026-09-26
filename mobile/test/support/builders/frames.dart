/// Frames as they arrive on the wire, built for a test.
library;

import 'dart:convert';

import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';

/// One envelope, as JSON text.
String frame({
  required String kind,
  required String type,
  int v = 1,
  String id = 'frame-1',
  String? sessionId,
  int? seq,
  Map<String, Object?>? payload,
}) => jsonEncode(<String, Object?>{
  'v': v,
  'id': id,
  'kind': kind,
  'type': type,
  'ts': '2026-09-14T12:00:00.000Z',
  'sessionId': ?sessionId,
  'seq': ?seq,
  'payload': ?payload,
});

/// The handshake answer.
String connectionReady({String connectionId = 'conn-1'}) => frame(
  kind: 'ack',
  type: 'connection.ready',
  payload: <String, Object?>{
    'connectionId': connectionId,
    'serverVersion': '0.0.1',
    'limits': <String, Object?>{'maxFrameBytes': 65536, 'replayBufferSize': 200},
  },
);

/// The answer to `session.attach`.
String sessionAttached({
  required String sessionId,
  bool gap = false,
  int replayed = 0,
  int oldestAvailableSeq = 0,
}) => frame(
  kind: 'ack',
  type: 'session.attached',
  payload: <String, Object?>{
    'sessionId': sessionId,
    'replayed': replayed,
    'oldestAvailableSeq': oldestAvailableSeq,
    'gap': gap,
  },
);

/// One pong.
String diagPong({
  required String sessionId,
  required int seq,
  int pingCount = 1,
  String nonce = 'nonce-1',
}) => frame(
  kind: 'event',
  type: 'diag.pong',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{
    'sessionId': sessionId,
    'pingedAt': '2026-09-14T12:00:00.000Z',
    'pingCount': pingCount,
    'nonce': nonce,
  },
);

/// The event that announces a session.
String sessionStarted({required String sessionId, int seq = 1}) => frame(
  kind: 'event',
  type: 'session.started',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'sessionId': sessionId, 'workspacePath': '/tmp/work'},
);

/// One fragment of a message.
String messageDelta({
  required String messageId,
  required String delta,
  required int seq,
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'message.delta',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'messageId': messageId, 'delta': delta},
);

/// A message, whole.
String messageCompleted({
  required String messageId,
  required String text,
  required int seq,
  String role = 'assistant',
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'message.completed',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{
    'messageId': messageId,
    'role': role,
    'content': <Object?>[
      <String, Object?>{'type': 'text', 'text': text},
    ],
  },
);

/// A tool starting.
String toolStarted({
  required String toolUseId,
  required int seq,
  String toolName = 'Bash',
  Map<String, Object?> input = const <String, Object?>{'command': 'ls'},
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'tool.started',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'toolUseId': toolUseId, 'toolName': toolName, 'input': input},
);

/// Something a tool printed.
String toolProgress({
  required String toolUseId,
  required String chunk,
  required int seq,
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'tool.progress',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'toolUseId': toolUseId, 'chunk': chunk},
);

/// How a tool ended.
String toolCompleted({
  required String toolUseId,
  required int seq,
  String status = 'succeeded',
  String? summary,
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'tool.completed',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'toolUseId': toolUseId, 'status': status, 'summary': ?summary},
);

/// Where the session is now.
String sessionStatusChanged({
  required String status,
  required int seq,
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'session.statusChanged',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'status': status},
);

/// What a finished turn cost.
String turnCompleted({
  required int seq,
  String turnId = 'turn-1',
  String costUsd = '0.0100',
  int durationMs = 1200,
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'turn.completed',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'turnId': turnId, 'costUsd': costUsd, 'durationMs': durationMs},
);

/// The session ending.
String sessionClosed({
  required int seq,
  String reason = 'completed',
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'session.closed',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'sessionId': sessionId, 'reason': reason},
);

/// One update, exactly as the data source would emit it for [raw].
///
/// The wire goes through the real mapper rather than being hand-assembled into an event: a test
/// that built the event itself would pass while the mapper read the frame wrongly.
SessionUpdate arrivalOf(String raw) => EventReceived(sessionEventFrom(decodeEnvelope(raw)!)!);

/// The payload of `permission.requested`, complete, with [overrides] applied on top.
///
/// A key overridden with `null` is **removed**, so a test can say "this payload has no title"
/// without restating every other field.
Map<String, Object?> permissionRequestedPayload([
  Map<String, Object?> overrides = const <String, Object?>{},
]) {
  final Map<String, Object?> payload = <String, Object?>{
    'requestId': 'req-1',
    'toolUseId': 'tu-1',
    'toolName': 'Bash',
    'title': 'Run a command',
    'description': 'rm -rf build/',
    'input': <String, Object?>{'command': 'rm -rf build/'},
    'riskHint': 'destructive',
    'defaultToNo': true,
    'expiresAt': '2026-09-14T12:05:00.000Z',
    ...overrides,
  };

  payload.removeWhere((String key, Object? value) => value == null);
  return payload;
}

/// The server asking a question about [sessionId].
String permissionRequested({
  String id = 'req-frame-1',
  String sessionId = 'session-1',
  Map<String, Object?>? payload,
}) => frame(
  kind: 'request',
  type: 'permission.requested',
  id: id,
  sessionId: sessionId,
  payload: payload ?? permissionRequestedPayload(),
);

/// An `error` frame answering the command whose id was [correlationId].
String commandError({
  required String? correlationId,
  String code = 'INVALID_INPUT',
  String messageKey = 'common.error.invalidInput',
  String id = 'err-1',
}) => jsonEncode(<String, Object?>{
  'v': 1,
  'id': id,
  'kind': 'error',
  'type': 'error',
  'ts': '2026-09-14T12:00:00.000Z',
  'correlationId': ?correlationId,
  'payload': <String, Object?>{'code': code, 'messageKey': messageKey, 'traceId': 'trace-1'},
});
