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
import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/core/network/conversation_wire.dart';
import 'package:remote_claude/core/network/tool_wire.dart';
import 'package:remote_claude/features/session/data/mappers/engine_mapper.dart';
import 'package:remote_claude/features/session/data/mappers/pong_mapper.dart';
import 'package:remote_claude/features/session/data/mappers/rewind_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// The type prefixes of the streams that are not a session.
///
/// `seq` is monotonic **per stream** — a session, or a subscription such as the watch of a folder
/// (docs/architecture/shared/05-websocket-protocol.md#envelope). A `workspace.filesChanged`
/// numbers its watch, never a session: read as an unknown event of the session it would move the
/// session's resume point past events the session never sent, and the next reconnection would ask
/// for a replay that skips them (plan 07, B-05). This app never watches a folder, so these frames
/// only ever reach it by mistake — and are ignored. A followed conversation numbers its `followId`
/// the same way (plan 22, B-24): its frames are the follow's, read by their own mapper.
const List<String> _otherStreams = <String>['workspace.', 'transcript.'];

/// The event in [frame], or `null` when the frame is not part of a session's history.
///
/// A frame with no `seq` is not: a question is asked, not recorded, and it belongs to the
/// permission queue rather than to the transcript. Neither is a frame of another stream, whatever
/// its `seq` says.
SessionEvent? sessionEventFrom(Envelope frame) {
  final int? seq = frame.seq;

  if (seq == null || _otherStreams.any(frame.type.startsWith)) {
    return null;
  }

  return _eventOf(
    frame.type,
    seq,
    frame.payload ?? const <String, Object?>{},
    sessionId: frame.sessionId,
    commandId: frame.correlationId,
    at: frame.ts,
    pong: () => pongFrom(frame),
  );
}

/// The `seq` every event of the history carries: none.
///
/// History is read from the engine's store, not from a live session's buffer, so it has no place in
/// any session's numbering. Zero is at or below every resume point, which is what keeps it from
/// ever moving one (S-21).
const int historySeq = 0;

/// One entry of the history — a frame of the live contract without its envelope — as an event,
/// or `null` when this build cannot read it.
///
/// The **same** function the live frames go through: the transcript sends `message.completed`,
/// `tool.started` and `tool.completed` with the payloads and ids the socket uses, and one reader
/// of that shape is what keeps the two from disagreeing. An entry it cannot read is dropped: it
/// has no `seq` to move past, and one malformed entry should cost the person that entry, not the
/// page.
SessionEvent? historyEventFrom(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final Object? type = entry['type'];
  final Object? payload = entry['payload'];

  if (type is! String || payload is! Map<String, Object?>) {
    return null;
  }

  final SessionEvent event = _eventOf(type, historySeq, payload, at: '', pong: () => null);

  return event is UnreadEvent ? null : event;
}

/// What the reader of one event type needs from the frame around the payload.
class _Frame {
  const _Frame(
    this.seq,
    this.payload, {
    required this.at,
    required this.pong,
    this.sessionId,
    this.commandId,
  });

  final int seq;
  final Map<String, Object?> payload;

  /// When, by the server's clock — empty for the history.
  final String at;
  final Pong? Function() pong;
  final String? sessionId;

  /// The `correlationId` of the frame: the command it answers, when it answers one.
  final String? commandId;
}

/// One reader per event type. A table rather than a `switch`, so adding an event adds a row, not a
/// branch to a function that already reads a dozen.
const Map<String, SessionEvent Function(_Frame frame)> _readers =
    <String, SessionEvent Function(_Frame frame)>{
      'session.started': _opened,
      'session.statusChanged': _status,
      'message.delta': _fragment,
      'message.completed': _finished,
      'tool.started': _invoked,
      'tool.progress': _output,
      'tool.completed': _toolOutcome,
      'session.tasksChanged': _tasksChanged,
      'turn.completed': _turn,
      'prompt.queued': _queued,
      'prompt.dequeued': _dequeued,
      'session.compacted': _compacted,
      'session.closed': _closed,
      'session.rewound': _rewound,
    };

SessionEvent _eventOf(
  String type,
  int seq,
  Map<String, Object?> payload, {
  required String at,
  required Pong? Function() pong,
  String? sessionId,
  String? commandId,
}) {
  final _Frame frame = _Frame(
    seq,
    payload,
    at: at,
    pong: pong,
    sessionId: sessionId,
    commandId: commandId,
  );

  return (_readers[type] ?? _pongOr)(frame);
}

SessionEvent _opened(_Frame frame) {
  final Map<String, Object?> payload = frame.payload;

  // The payload names it, and the envelope names it too. Either will do; a frame that names it
  // nowhere is one this build cannot act on.
  final String? sessionId = _text(payload, 'sessionId') ?? frame.sessionId;

  return sessionId == null
      ? UnreadEvent(frame.seq)
      : SessionOpened(
          frame.seq,
          sessionId,
          conversation: conversationKeyFrom(payload['conversation']),
          resumedFrom: conversationKeyFrom(payload['resumedFrom']),
          engine: _text(payload, 'engine'),
          capabilities: engineCapabilitiesFrom(payload['capabilities']),
          workspacePath: _text(payload, 'workspacePath'),
          model: _text(payload, 'model'),
          permissionMode: canonicalPermissionMode(_text(payload, 'permissionMode')),
          commandId: frame.commandId,
        );
}

SessionEvent _pongOr(_Frame frame) {
  final Pong? pong = frame.pong();
  return pong == null ? UnreadEvent(frame.seq) : PongArrived(frame.seq, pong);
}

SessionEvent _status(_Frame frame) {
  final SessionStatus? status = switch (_text(frame.payload, 'status')) {
    'starting' => SessionStatus.starting,
    'idle' => SessionStatus.idle,
    'thinking' => SessionStatus.thinking,
    'running' => SessionStatus.running,
    'waitingPermission' => SessionStatus.waitingPermission,
    'closed' => SessionStatus.closed,
    _ => null,
  };

  return status == null
      ? UnreadEvent(frame.seq)
      : SessionStatusReported(frame.seq, status, at: frame.at);
}

/// The block kinds of a fragment this app draws: the answer, and the thinking before it.
///
/// Anything else — a kind added to the contract after this build shipped — is unread: its `seq`
/// still moves past it, and nothing of it reaches the answer (S-09).
const Set<String> _drawnFragments = <String>{'text', 'thinking'};

SessionEvent _fragment(_Frame frame) {
  final Map<String, Object?> payload = frame.payload;
  final String? messageId = _text(payload, 'messageId');
  final String? delta = _text(payload, 'delta');
  final String blockType = blockTypeOf(payload);

  if (messageId == null || delta == null || !_drawnFragments.contains(blockType)) {
    return UnreadEvent(frame.seq);
  }

  final String? parent = _text(payload, 'parentToolUseId');

  return blockType == 'thinking'
      ? ThinkingFragment(
          frame.seq,
          messageId: messageId,
          delta: delta,
          at: frame.at,
          parentToolUseId: parent,
        )
      : MessageFragment(
          frame.seq,
          messageId: messageId,
          delta: delta,
          at: frame.at,
          parentToolUseId: parent,
        );
}

/// What a fragment is part of, as the frame says — absent reads as the answer.
String blockTypeOf(Map<String, Object?> payload) => _text(payload, 'blockType') ?? 'text';

SessionEvent _finished(_Frame frame) {
  final Map<String, Object?> payload = frame.payload;
  final String? messageId = _text(payload, 'messageId');

  if (messageId == null) {
    return UnreadEvent(frame.seq);
  }

  final List<Map<String, Object?>> blocks = payload['content'] is List<Object?>
      ? (payload['content']! as List<Object?>).whereType<Map<String, Object?>>().toList()
      : const <Map<String, Object?>>[];

  return MessageFinished(
    frame.seq,
    messageId: messageId,
    // Only `text` and `image` become a block of the message, in the order the model gave them.
    // Thinking has a field of its own, and a block that calls a tool is drawn as the tool.
    blocks: <MessageBlock>[
      for (final Map<String, Object?> block in blocks) ?_messageBlockOf(block),
    ],
    isFromUser: _text(payload, 'role') == 'user',
    thoughts: <Thought>[for (final Map<String, Object?> block in blocks) ?_thoughtOf(block)],
    at: frame.at,
    writtenAt: _writtenAt(payload),
    parentToolUseId: _text(payload, 'parentToolUseId'),
  );
}

/// The block of a message [block] becomes, in the order it arrived — `null` for a block that is not
/// text or an image (a tool call, say), which plays no part in the message.
MessageBlock? _messageBlockOf(Map<String, Object?> block) => switch (block['type']) {
  'text' => TextBlock(_text(block, 'text') ?? '', blockId: _text(block, 'blockId')),
  'image' => ImageBlock(_imageOf(block)),
  _ => null,
};

/// An image block, as the marker it travels as: its type and size, never the bytes (plan 22, D-09).
/// A size that is not a whole, non-negative number is not one.
PromptImage _imageOf(Map<String, Object?> block) {
  final Object? size = block['size'];

  return PromptImage(
    blockId: _text(block, 'blockId'),
    mediaType: _text(block, 'mediaType'),
    size: size is int && size >= 0 ? size : null,
  );
}

/// What the model said a call is for. Blank is not a title: the tool keeps the label it has without
/// one (plan 22, D-05).
String? _titleOf(Map<String, Object?> payload) {
  final String? title = _text(payload, 'title');
  return title == null || title.trim().isEmpty ? null : title;
}

/// When the history wrote the entry of [payload] — empty live, and from a server older than it.
String _writtenAt(Map<String, Object?> payload) => _text(payload, 'at') ?? '';

/// A block of thinking, or `null` for any other kind.
Thought? _thoughtOf(Map<String, Object?> block) => switch (block['type']) {
  'thinking' => Thought(_text(block, 'thinking') ?? '', blockId: _text(block, 'blockId')),
  'redactedThinking' => Thought('', isRedacted: true, blockId: _text(block, 'blockId')),
  _ => null,
};

SessionEvent _invoked(_Frame frame) {
  final Map<String, Object?> payload = frame.payload;
  final String? toolUseId = _text(payload, 'toolUseId');
  // What the row is drawn by: the kind and the label the backend built — never the engine's own name
  // for the tool, which this build does not read (plan 28, B-19).
  final ToolCall? call = toolCallFrom(payload);

  if (toolUseId == null || call == null) {
    return UnreadEvent(frame.seq);
  }

  return ToolInvoked(
    frame.seq,
    toolUseId: toolUseId,
    call: call,
    parentToolUseId: _text(payload, 'parentToolUseId'),
    title: _titleOf(payload),
    writtenAt: _writtenAt(payload),
  );
}

SessionEvent _output(_Frame frame) {
  final String? toolUseId = _text(frame.payload, 'toolUseId');
  final String? chunk = _text(frame.payload, 'chunk');

  return toolUseId == null || chunk == null
      ? UnreadEvent(frame.seq)
      : ToolOutput(frame.seq, toolUseId: toolUseId, chunk: chunk);
}

SessionEvent _toolOutcome(_Frame frame) {
  final String? toolUseId = _text(frame.payload, 'toolUseId');

  final ToolStatus? status = switch (_text(frame.payload, 'status')) {
    'succeeded' => ToolStatus.succeeded,
    'failed' => ToolStatus.failed,
    'denied' => ToolStatus.denied,
    _ => null,
  };

  return toolUseId == null || status == null
      ? UnreadEvent(frame.seq)
      : ToolFinished(
          frame.seq,
          toolUseId: toolUseId,
          status: status,
          summary: _text(frame.payload, 'summary'),
          writtenAt: _writtenAt(frame.payload),
          question: _record(frame.payload, 'question'),
        );
}

/// The states of a task, as the contract writes them.
const Map<String, TaskStatus> _taskStatuses = <String, TaskStatus>{
  'pending': TaskStatus.pending,
  'inProgress': TaskStatus.inProgress,
  'completed': TaskStatus.completed,
};

/// The whole task list, as it is now (plan 28, B-22) — the same reader live and in the history, so a
/// reload draws the list the stream drew. A task this build cannot read — a state added after it
/// shipped — is left out; the rest of the list still is the agent's.
SessionEvent _tasksChanged(_Frame frame) {
  final Object? tasks = frame.payload['tasks'];

  return tasks is! List<Object?>
      ? UnreadEvent(frame.seq)
      : TasksChanged(frame.seq, <SessionTask>[
          for (final Object? task in tasks) ?_taskOf(task),
        ], writtenAt: _writtenAt(frame.payload));
}

SessionTask? _taskOf(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final String? id = _text(entry, 'id');
  final String? title = _text(entry, 'title');
  final TaskStatus? status = _taskStatuses[entry['status']];

  return id == null || title == null || status == null
      ? null
      : SessionTask(id: id, title: title, status: status, activeTitle: _text(entry, 'activeTitle'));
}

SessionEvent _turn(_Frame frame) {
  final String? turnId = _text(frame.payload, 'turnId');
  final String? costUsd = _text(frame.payload, 'costUsd');
  final Object? durationMs = frame.payload['durationMs'];
  final Object? usage = frame.payload['usage'];
  final Map<String, Object?> tokens = usage is Map<String, Object?>
      ? usage
      : const <String, Object?>{};

  // No cost is not an unreadable turn: the engine reports none (plan 28, B-29, S-86).
  if (turnId == null || durationMs is! int) {
    return UnreadEvent(frame.seq);
  }

  return TurnFinished(
    frame.seq,
    TurnSummary(
      turnId: turnId,
      costUsd: costUsd,
      durationMs: durationMs,
      inputTokens: _int(tokens, 'inputTokens'),
      outputTokens: _int(tokens, 'outputTokens'),
      cacheReadTokens: _int(tokens, 'cacheReadTokens'),
      cacheWriteTokens: _int(tokens, 'cacheWriteTokens'),
      reasoningTokens: _int(tokens, 'reasoningTokens'),
      webSearches: _int(tokens, 'webSearches'),
    ),
  );
}

SessionEvent _queued(_Frame frame) {
  final String? queueId = _text(frame.payload, 'queueId');

  return queueId == null
      ? UnreadEvent(frame.seq)
      : PromptQueued(
          frame.seq,
          QueuedPrompt(
            queueId: queueId,
            promptedBy: _text(frame.payload, 'promptedBy') ?? '',
            preview: _text(frame.payload, 'preview') ?? '',
          ),
        );
}

SessionEvent _dequeued(_Frame frame) {
  final String? queueId = _text(frame.payload, 'queueId');
  return queueId == null ? UnreadEvent(frame.seq) : PromptDequeued(frame.seq, queueId: queueId);
}

SessionEvent _compacted(_Frame frame) {
  final Object? preTokens = frame.payload['preTokens'];

  return ContextCompacted(
    frame.seq,
    trigger: _text(frame.payload, 'trigger') ?? 'auto',
    preTokens: preTokens is int ? preTokens : null,
  );
}

SessionEvent _closed(_Frame frame) {
  final SessionCloseReason? reason = switch (_text(frame.payload, 'reason')) {
    'closedByUser' => SessionCloseReason.closedByUser,
    'completed' => SessionCloseReason.completed,
    'failed' => SessionCloseReason.failed,
    'auditUnavailable' => SessionCloseReason.auditUnavailable,
    'shutdown' => SessionCloseReason.shutdown,
    'idleTimeout' => SessionCloseReason.idleTimeout,
    _ => null,
  };

  return reason == null
      ? UnreadEvent(frame.seq)
      : SessionFinished(frame.seq, SessionEnding(reason: reason, at: frame.at));
}

SessionEvent _rewound(_Frame frame) {
  final RewindOutcome? outcome = rewindOutcomeFrom(frame.payload);

  return outcome == null ? UnreadEvent(frame.seq) : FilesRewound(frame.seq, outcome);
}

/// The object at [key], or `null` when it is absent or not one.
Map<String, Object?>? _record(Map<String, Object?> payload, String key) => switch (payload[key]) {
  final Map<String, Object?> value => value,
  _ => null,
};

/// A string field, or `null` when it is absent or is something else.
String? _text(Map<String, Object?> payload, String key) => switch (payload[key]) {
  final String value => value,
  _ => null,
};

/// A number field, or `null` when it is absent or is something else (plan 26, B-17, S-62) — never
/// zero for a field the engine did not report.
int? _int(Map<String, Object?> payload, String key) => switch (payload[key]) {
  final int value => value,
  _ => null,
};
