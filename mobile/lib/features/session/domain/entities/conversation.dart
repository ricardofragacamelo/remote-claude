/// One session's conversation, as the app has it.
///
/// Pure Dart, and pure values: no `flutter/*`, no socket, no provider. Every ordering rule of the
/// stream is a function of (state, frame) over these types, which is what lets the rules be
/// tested without any of the three.
///
/// The same model the web carries, deliberately. Both ends read the same frames, so a difference
/// between them is a bug in one of them — the scenarios S-28…S-31 are written once and hold for
/// both (docs/architecture/mobile/03-state-and-data.md).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// Where a session is, as `session.statusChanged` reports it.
enum SessionStatus {
  /// Opened, and the backend has not said anything about it yet.
  starting,

  /// Open with nothing running.
  idle,

  /// The model is working.
  thinking,

  /// A tool is running on the user's machine.
  running,

  /// Everything is stopped behind a question somebody has to answer.
  waitingPermission,

  /// Over.
  closed,
}

/// Why a session ended. The contract carries these five.
enum SessionCloseReason { closedByUser, completed, failed, auditUnavailable, shutdown }

/// How a tool invocation ended, when it has.
enum ToolStatus { running, succeeded, failed, denied }

/// One message of the conversation.
///
/// [text] is what has arrived so far. While [isComplete] is false it is the accumulation of the
/// deltas of **this** `messageId` and nothing else — accumulating in arrival order across messages
/// is how two answers in flight end up as one paragraph of nonsense.
class StreamMessage extends Equatable {
  const StreamMessage({
    required this.messageId,
    required this.text,
    this.isFromUser = false,
    this.isComplete = false,
  });

  final String messageId;

  /// Everything of this message the client has.
  final String text;

  /// Whether the person wrote it. Everything else came from the model.
  final bool isFromUser;

  /// `message.completed` arrived and replaced whatever the deltas had built.
  final bool isComplete;

  /// A copy with some fields replaced.
  StreamMessage copyWith({String? text, bool? isComplete}) => StreamMessage(
    messageId: messageId,
    text: text ?? this.text,
    isFromUser: isFromUser,
    isComplete: isComplete ?? this.isComplete,
  );

  @override
  List<Object?> get props => <Object?>[messageId, text, isFromUser, isComplete];
}

/// One tool, running on the user's own machine.
///
/// The **exact** input is kept, never a summary of it: somebody watching a command run on their
/// laptop is entitled to see the command.
class ToolExecution extends Equatable {
  const ToolExecution({
    required this.toolUseId,
    required this.toolName,
    required this.input,
    this.status = ToolStatus.running,
    this.output = '',
    this.summary,
  });

  final String toolUseId;
  final String toolName;

  /// What the tool was asked to do, exactly as the contract carried it.
  final Map<String, Object?> input;

  final ToolStatus status;

  /// Everything `tool.progress` has sent, in order.
  final String output;

  /// What `tool.completed` said about it, when it said anything.
  final String? summary;

  /// A copy with some fields replaced.
  ToolExecution copyWith({ToolStatus? status, String? output, String? summary}) => ToolExecution(
    toolUseId: toolUseId,
    toolName: toolName,
    input: input,
    status: status ?? this.status,
    output: output ?? this.output,
    summary: summary ?? this.summary,
  );

  @override
  List<Object?> get props => <Object?>[toolUseId, toolName, input, status, output, summary];
}

/// What a finished turn cost.
class TurnSummary extends Equatable {
  const TurnSummary({required this.turnId, required this.costUsd, required this.durationMs});

  final String turnId;

  /// A string, not a double: money that goes through a binary float stops adding up.
  final String costUsd;

  final int durationMs;

  @override
  List<Object?> get props => <Object?>[turnId, costUsd, durationMs];
}

/// How a session ended, for a screen that arrived after the fact.
class SessionEnding extends Equatable {
  const SessionEnding({required this.reason, required this.at});

  final SessionCloseReason reason;

  /// When, as the frame carried it.
  final String at;

  @override
  List<Object?> get props => <Object?>[reason, at];
}

/// Everything a frame can change about a session.
class Conversation extends Equatable {
  const Conversation({
    this.status = SessionStatus.starting,
    this.lastSeq = 0,
    this.messages = const <StreamMessage>[],
    this.tools = const <ToolExecution>[],
    this.lastTurn,
    this.ending,
  });

  final SessionStatus status;

  /// The highest `seq` applied. Everything at or below it is a replay of what is already here.
  final int lastSeq;

  final List<StreamMessage> messages;
  final List<ToolExecution> tools;

  /// What the last finished turn cost, when one has finished.
  final TurnSummary? lastTurn;

  /// How it ended, when it has.
  final SessionEnding? ending;

  /// Whether anything at all has arrived.
  bool get isEmpty => messages.isEmpty && tools.isEmpty;

  /// A copy with some fields replaced.
  Conversation copyWith({
    SessionStatus? status,
    int? lastSeq,
    List<StreamMessage>? messages,
    List<ToolExecution>? tools,
    TurnSummary? lastTurn,
    SessionEnding? ending,
  }) => Conversation(
    status: status ?? this.status,
    lastSeq: lastSeq ?? this.lastSeq,
    messages: messages ?? this.messages,
    tools: tools ?? this.tools,
    lastTurn: lastTurn ?? this.lastTurn,
    ending: ending ?? this.ending,
  );

  /// This conversation with [event] applied.
  ///
  /// The first of the three stream rules lives here: **an event at or below [lastSeq] is
  /// discarded**. A replay re-delivers what the client already has, and without this every
  /// reconnection duplicates the tail of the conversation (S-28).
  ///
  /// An event this build cannot read still moves [lastSeq]. Dropping it would have the client
  /// ask for it again after every reconnection, for ever (S-77).
  Conversation apply(SessionEvent event) {
    if (event.seq <= lastSeq) {
      return this;
    }

    return _applied(event).copyWith(lastSeq: event.seq);
  }

  Conversation _applied(SessionEvent event) => switch (event) {
    // Derived here rather than waiting for a status event: a screen that waited would say
    // "starting" until the first fragment of the first answer arrived.
    SessionOpened() => copyWith(status: SessionStatus.idle),
    SessionStatusReported(:final SessionStatus status) => copyWith(status: status),
    MessageFragment() => _fragment(event),
    MessageFinished() => _finished(event),
    ToolInvoked() => _invoked(event),
    ToolOutput() => _changeTool(
      event.toolUseId,
      (ToolExecution tool) => tool.copyWith(output: tool.output + event.chunk),
    ),
    ToolFinished() => _changeTool(
      event.toolUseId,
      (ToolExecution tool) => tool.copyWith(status: event.status, summary: event.summary),
    ),
    TurnFinished(:final TurnSummary turn) => copyWith(lastTurn: turn),
    SessionFinished(:final SessionEnding ending) => copyWith(
      status: SessionStatus.closed,
      ending: ending,
    ),
    // Neither belongs to the conversation: the round trip is the walking skeleton's own screen,
    // and an unreadable event is only here to move the resume point.
    PongArrived() => this,
    UnreadEvent() => this,
  };

  /// A fragment, accumulated **by `messageId`** (S-30, S-31).
  ///
  /// The rule this whole type exists for: two messages in flight must not mix. A fragment of a
  /// message nothing has announced yet starts one, because the model streams before it completes
  /// anything.
  Conversation _fragment(MessageFragment event) {
    final int at = messages.indexWhere((StreamMessage m) => m.messageId == event.messageId);

    if (at < 0) {
      return copyWith(
        messages: <StreamMessage>[
          ...messages,
          StreamMessage(messageId: event.messageId, text: event.delta),
        ],
      );
    }

    // A completed message is never re-opened by a late fragment: the whole message already
    // arrived, and appending to it would add text the server has superseded.
    if (messages[at].isComplete) {
      return this;
    }

    final List<StreamMessage> next = List<StreamMessage>.of(messages);
    next[at] = next[at].copyWith(text: next[at].text + event.delta);

    return copyWith(messages: next);
  }

  /// The finished message, which **replaces** what the fragments accumulated.
  ///
  /// Replaces rather than appends: a client that missed a fragment is made whole here, and one
  /// that missed none gets the same text it already had.
  Conversation _finished(MessageFinished event) {
    final StreamMessage whole = StreamMessage(
      messageId: event.messageId,
      text: event.text,
      isFromUser: event.isFromUser,
      isComplete: true,
    );

    final int at = messages.indexWhere((StreamMessage m) => m.messageId == event.messageId);

    if (at < 0) {
      return copyWith(messages: <StreamMessage>[...messages, whole]);
    }

    final List<StreamMessage> next = List<StreamMessage>.of(messages);
    next[at] = whole;

    return copyWith(messages: next);
  }

  /// A tool starting — or **starting again**, when the replay re-delivers it (S-78).
  Conversation _invoked(ToolInvoked event) => copyWith(
    tools: <ToolExecution>[
      ...tools.where((ToolExecution tool) => tool.toolUseId != event.toolUseId),
      ToolExecution(toolUseId: event.toolUseId, toolName: event.toolName, input: event.input),
    ],
  );

  /// A change to one invocation, or this conversation untouched when nothing announced it.
  Conversation _changeTool(String toolUseId, ToolExecution Function(ToolExecution tool) change) {
    final int at = tools.indexWhere((ToolExecution tool) => tool.toolUseId == toolUseId);

    if (at < 0) {
      return this;
    }

    final List<ToolExecution> next = List<ToolExecution>.of(tools);
    next[at] = change(next[at]);

    return copyWith(tools: next);
  }

  @override
  List<Object?> get props => <Object?>[status, lastSeq, messages, tools, lastTurn, ending];
}
