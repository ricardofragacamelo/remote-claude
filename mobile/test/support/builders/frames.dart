/// Frames as they arrive on the wire, built for a test.
library;

import 'dart:convert';

import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
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
  String? correlationId,
  String ts = '2026-09-14T12:00:00.000Z',
}) => jsonEncode(<String, Object?>{
  'v': v,
  'id': id,
  'kind': kind,
  'type': type,
  'ts': ts,
  'correlationId': ?correlationId,
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
    'limits': <String, Object?>{
      'maxFrameBytes': 65536,
      'maxFramesPerSecond': 20,
      'maxAttachedSessions': 16,
      'replayBufferSize': 200,
    },
  },
);

/// The answer to `session.attach` — or to a `session.start` that joined a live conversation.
///
/// [correlationId] is the id of the `session.attach` it answers.
String sessionAttached({
  required String sessionId,
  bool gap = false,
  int replayed = 0,
  int oldestAvailableSeq = 0,
  String? claudeSessionId,
  String? resumedFrom,
  String? correlationId,
}) => frame(
  kind: 'ack',
  type: 'session.attached',
  correlationId: correlationId,
  payload: <String, Object?>{
    'sessionId': sessionId,
    'replayed': replayed,
    'oldestAvailableSeq': oldestAvailableSeq,
    'gap': gap,
    'claudeSessionId': ?claudeSessionId,
    'resumedFrom': ?resumedFrom,
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
String sessionStarted({
  required String sessionId,
  int seq = 1,
  String? claudeSessionId,
  String? resumedFrom,
  String? model,
  String? permissionMode,
  String? correlationId,
  String workspacePath = '/tmp/work',
}) => frame(
  kind: 'event',
  type: 'session.started',
  sessionId: sessionId,
  seq: seq,
  correlationId: correlationId,
  payload: <String, Object?>{
    'sessionId': sessionId,
    'workspacePath': workspacePath,
    'claudeSessionId': ?claudeSessionId,
    'resumedFrom': ?resumedFrom,
    'model': ?model,
    'permissionMode': ?permissionMode,
  },
);

/// A command accepted — not finished.
String commandAccepted({required String correlationId, String command = 'session.setModel'}) =>
    frame(
      kind: 'ack',
      type: 'command.accepted',
      correlationId: correlationId,
      payload: <String, Object?>{'command': command},
    );

/// One fragment of what the model thought.
String thinkingDelta({
  required String messageId,
  required String delta,
  required int seq,
  String sessionId = 'session-1',
  String ts = '2026-09-14T12:00:00.000Z',
}) => frame(
  kind: 'event',
  type: 'message.delta',
  sessionId: sessionId,
  seq: seq,
  ts: ts,
  payload: <String, Object?>{'messageId': messageId, 'delta': delta, 'blockType': 'thinking'},
);

/// A message — or a block of one — finished, with the blocks given.
String messageBlocks({
  required String messageId,
  required List<Map<String, Object?>> content,
  required int seq,
  String role = 'assistant',
  String sessionId = 'session-1',
  String ts = '2026-09-14T12:00:00.000Z',
}) => frame(
  kind: 'event',
  type: 'message.completed',
  sessionId: sessionId,
  seq: seq,
  ts: ts,
  payload: <String, Object?>{'messageId': messageId, 'role': role, 'content': content},
);

/// A prompt waiting in the queue.
String promptQueued({
  required String queueId,
  required int seq,
  int position = 1,
  String promptedBy = 'mobile',
  String preview = 'and the tests?',
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'prompt.queued',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{
    'queueId': queueId,
    'position': position,
    'promptedBy': promptedBy,
    'preview': preview,
  },
);

/// A prompt leaving the queue.
String promptDequeued({
  required String queueId,
  required int seq,
  String reason = 'started',
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'prompt.dequeued',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'queueId': queueId, 'reason': reason},
);

/// The conversation compacted.
String sessionCompacted({
  required int seq,
  String trigger = 'manual',
  int? preTokens,
  String sessionId = 'session-1',
}) => frame(
  kind: 'event',
  type: 'session.compacted',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{'trigger': trigger, 'preTokens': ?preTokens},
);

/// One fragment of a message.
String messageDelta({
  required String messageId,
  required String delta,
  required int seq,
  String sessionId = 'session-1',
  String ts = '2026-09-14T12:00:00.000Z',
}) => frame(
  kind: 'event',
  type: 'message.delta',
  sessionId: sessionId,
  seq: seq,
  ts: ts,
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
  String? parentToolUseId,
}) => frame(
  kind: 'event',
  type: 'tool.started',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{
    'toolUseId': toolUseId,
    'toolName': toolName,
    'input': input,
    'parentToolUseId': ?parentToolUseId,
  },
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
  String? taskId,
  String sessionId = 'session-1',
  Map<String, Object?>? question,
}) => frame(
  kind: 'event',
  type: 'tool.completed',
  sessionId: sessionId,
  seq: seq,
  payload: <String, Object?>{
    'toolUseId': toolUseId,
    'status': status,
    'summary': ?summary,
    'question': ?question,
    'taskId': ?taskId,
  },
);

/// Where the session is now.
String sessionStatusChanged({
  required String status,
  required int seq,
  String sessionId = 'session-1',
  String ts = '2026-09-14T12:00:00.000Z',
}) => frame(
  kind: 'event',
  type: 'session.statusChanged',
  sessionId: sessionId,
  seq: seq,
  ts: ts,
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
SessionUpdate arrivalOf(String raw) {
  final Envelope envelope = decodeEnvelope(raw)!;
  // Stamped with the session the frame names, as the data source does (plan 10, S-172).
  return EventReceived(sessionEventFrom(envelope)!, sessionId: envelope.sessionId);
}

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
  String? traceId,
  Map<String, Object?>? params,
  String? sessionId,
}) => jsonEncode(<String, Object?>{
  'v': 1,
  'id': id,
  'kind': 'error',
  'type': 'error',
  'ts': '2026-09-14T12:00:00.000Z',
  'sessionId': ?sessionId,
  'correlationId': ?correlationId,
  'traceId': ?traceId,
  'payload': <String, Object?>{
    'code': code,
    'messageKey': messageKey,
    'traceId': 'trace-1',
    'params': ?params,
  },
});

/// One entry of the history endpoint: a frame of the live contract without its envelope.
///
/// Built from the same builders as the live frames, so a test that compares the two compares what
/// the backend actually sends on both paths — the same payload and the same ids.
Map<String, Object?> historyEntry(String raw) {
  final Map<String, Object?> envelope = jsonDecode(raw)! as Map<String, Object?>;
  return <String, Object?>{'type': envelope['type'], 'payload': envelope['payload']};
}

/// The body of `GET /transcripts/:sessionId/messages`.
Map<String, Object?> historyBody({
  String conversationId = 'conv-1',
  String origin = 'ours',
  String cwd = '/home/someone/project',
  String summary = 'Fix the build',
  List<Map<String, Object?>> events = const <Map<String, Object?>>[],
  String? nextCursor,
  String? activity,
  String? lastMessageId,
}) => <String, Object?>{
  'session': <String, Object?>{
    'sessionId': conversationId,
    'summary': summary,
    'origin': origin,
    'cwd': cwd,
    'gitBranch': 'main',
    'createdAt': '2026-09-20T10:00:00.000Z',
    'lastModified': '2026-09-24T18:30:00.000Z',
    'activity': ?activity,
  },
  'events': events,
  'nextCursor': nextCursor,
  'lastMessageId': ?lastMessageId,
};

/// The events of a history made of [raws], through the real mapper — the one the live frames go
/// through too.
List<SessionEvent> historyOf(List<String> raws) =>
    raws.map((String raw) => historyEventFrom(historyEntry(raw))!).toList(growable: false);

/// What an undo did, as the socket carries it.
String sessionRewound({
  required int seq,
  required Map<String, Object?> payload,
  String sessionId = 'session-1',
}) =>
    frame(kind: 'event', type: 'session.rewound', sessionId: sessionId, seq: seq, payload: payload);

/// The ack of a `transcript.follow` whose id was [correlationId] (plan 22, B-24).
String transcriptFollowing({
  required String correlationId,
  String followId = 't-1',
  String conversationId = 'conv-1',
  String activity = 'activeElsewhere',
}) => frame(
  kind: 'ack',
  type: 'transcript.following',
  id: 'ack-$correlationId',
  correlationId: correlationId,
  payload: <String, Object?>{
    'followId': followId,
    'conversationId': conversationId,
    'activity': activity,
  },
);

/// What a followed conversation gained: [raws] are frames of the live contract, carried as entries
/// of the history.
String transcriptAppended({
  required int seq,
  String followId = 't-1',
  String conversationId = 'conv-1',
  List<String> raws = const <String>[],
  String? lastMessageId,
  String activity = 'activeElsewhere',
  bool working = false,
}) => frame(
  kind: 'event',
  type: 'transcript.appended',
  id: 'appended-$seq',
  seq: seq,
  payload: <String, Object?>{
    'followId': followId,
    'conversationId': conversationId,
    'events': raws.map(historyEntry).toList(growable: false),
    'lastMessageId': ?lastMessageId,
    'activity': activity,
    'working': working,
  },
);

/// The end of a subscription that cannot go on.
String transcriptReset({
  required int seq,
  String followId = 't-1',
  String conversationId = 'conv-1',
  String reason = 'rewritten',
}) => frame(
  kind: 'event',
  type: 'transcript.reset',
  id: 'reset-$seq',
  seq: seq,
  payload: <String, Object?>{
    'followId': followId,
    'conversationId': conversationId,
    'reason': reason,
  },
);
