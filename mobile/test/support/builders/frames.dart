/// Frames as they arrive on the wire, built for a test.
library;

import 'dart:convert';

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
