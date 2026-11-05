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
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';

/// One event of a session's stream.
sealed class SessionEvent extends Equatable {
  const SessionEvent(this.seq);

  /// Where this event sits in the session's order. A replay re-delivers everything up to it.
  final int seq;

  /// When the history wrote the entry this event was read from — the **end** of what it holds
  /// (plan 22, D-14). Empty live, where the clock is the frame's, and for the events the history
  /// does not date.
  String get writtenAt => '';

  @override
  List<Object?> get props => <Object?>[seq];
}

/// The session is open and nothing is running in it.
///
/// It **names** the session, and that is the point of it: `session.start` carries no id — it is
/// what creates one — so this is where the screen that asked learns which session answered.
final class SessionOpened extends SessionEvent {
  const SessionOpened(
    super.seq,
    this.sessionId, {
    this.conversation,
    this.resumedFrom,
    this.engine,
    this.capabilities,
    this.workspacePath,
    this.model,
    this.permissionMode,
    this.commandId,
  });

  final String sessionId;

  /// The conversation this session writes to, in its engine's store — what its history is read by
  /// and what a later resume names. `null` only from a build of the backend that did not say.
  final ConversationKey? conversation;

  /// The conversation this session continues, when it is a resume. Everything said before this
  /// session's first turn is read from it, over HTTP: the replay buffer only holds what **this**
  /// session said (B-11).
  final ConversationKey? resumedFrom;

  /// The engine the session runs on — an `id` of `GET /engines`. The app never decides by it.
  final String? engine;

  /// What the engine of this session can do, as it declared — read and kept; hiding what it cannot
  /// is each control's own phase (plan 28, F3, F4). `null` when it declared nothing readable.
  final EngineCapabilities? capabilities;

  /// The folder it runs in — where a resume of it has to run too.
  final String? workspacePath;

  /// The model and the permission mode it opened with. The server acknowledges a change of either,
  /// it never echoes one, so these are where the session **started**.
  final String? model;
  final String? permissionMode;

  /// The id of the `session.start` this answers — the frame's `correlationId`. It is how the screen
  /// that asked tells its own session from one another command opened on the same socket (S-22).
  final String? commandId;

  @override
  List<Object?> get props => <Object?>[
    seq,
    sessionId,
    conversation,
    resumedFrom,
    engine,
    capabilities,
    workspacePath,
    model,
    permissionMode,
    commandId,
  ];
}

/// The session moved.
final class SessionStatusReported extends SessionEvent {
  const SessionStatusReported(super.seq, this.status, {this.at = ''});

  final SessionStatus status;

  /// When, by the server's clock — what a turn that starts here is timed from. Empty when unknown.
  final String at;

  @override
  List<Object?> get props => <Object?>[seq, status, at];
}

/// A fragment of a message, of the answer or of the thinking before it — accumulated by
/// `messageId`, never in arrival order across messages.
sealed class Fragment extends SessionEvent {
  const Fragment(
    super.seq, {
    required this.messageId,
    required this.delta,
    this.at = '',
    this.parentToolUseId,
  });

  final String messageId;
  final String delta;

  /// When it arrived, by the server's clock — empty from the history. The answer starting is when
  /// the thinking before it stopped; the thinking starting is what its time is measured from.
  final String at;

  /// The subagent this fragment belongs to, when it is not the main conversation's own (plan 26,
  /// B-18) — `null` for the main thread.
  final String? parentToolUseId;

  @override
  List<Object?> get props => <Object?>[seq, messageId, delta, at, parentToolUseId];
}

/// A fragment of the answer.
final class MessageFragment extends Fragment {
  const MessageFragment(
    super.seq, {
    required super.messageId,
    required super.delta,
    super.at,
    super.parentToolUseId,
  });
}

/// A fragment of what the model thought before answering. Never part of the answer.
final class ThinkingFragment extends Fragment {
  const ThinkingFragment(
    super.seq, {
    required super.messageId,
    required super.delta,
    super.at,
    super.parentToolUseId,
  });
}

/// A message — or, from the CLI, one block of it — finished. It completes whatever the fragments
/// of that block built.
final class MessageFinished extends SessionEvent {
  const MessageFinished(
    super.seq, {
    required this.messageId,
    required this.isFromUser,
    this.blocks = const <MessageBlock>[],
    this.thoughts = const <Thought>[],
    this.at = '',
    this.writtenAt = '',
    this.parentToolUseId,
    this.injectedKind,
    this.injectedName,
  });

  final String messageId;

  /// The text and image blocks that finished, **in the order the model gave them** (plan 26, B-09).
  /// Empty when what finished was only thinking, or a tool call.
  final List<MessageBlock> blocks;

  final bool isFromUser;

  /// The thinking blocks that finished, in order.
  final List<Thought> thoughts;

  /// When, by the server's clock — empty from the history.
  final String at;

  @override
  final String writtenAt;

  /// The subagent this message belongs to, when it is not the main conversation's own (plan 26,
  /// B-18) — `null` for the main thread.
  final String? parentToolUseId;

  /// Set when the agent put this message in the conversation itself — never the person's own
  /// prompt (plan 27, F6 · B-21). `'contextSummary'` folds into the compaction it belongs to;
  /// `'instructions'` and `'other'` draw their own line; `'commandExpansion'` is absent here on
  /// purpose — it is meant to read exactly like the prompt it expands to.
  final String? injectedKind;

  /// The skill or command named, when [injectedKind] has one.
  final String? injectedName;

  /// The text blocks, joined — empty when what finished carried none.
  String get text => <String>[
    for (final MessageBlock block in blocks)
      if (block is TextBlock) block.text,
  ].join();

  @override
  List<Object?> get props => <Object?>[
    seq,
    messageId,
    blocks,
    isFromUser,
    thoughts,
    injectedKind,
    injectedName,
    at,
    writtenAt,
    parentToolUseId,
  ];
}

/// One finished block of thinking.
class Thought extends Equatable {
  const Thought(this.text, {this.isRedacted = false, this.blockId});

  /// What the model thought — empty when it would not show it.
  final String text;

  /// The model thought here and did not show what (a `redactedThinking` block).
  final bool isRedacted;

  /// The block's identity — two thinkings the model did not show are equal and still two (plan 22,
  /// S-35). `null` from a server older than it.
  final String? blockId;

  @override
  List<Object?> get props => <Object?>[text, isRedacted, blockId];
}

/// A tool started running on the user's machine.
final class ToolInvoked extends SessionEvent {
  const ToolInvoked(
    super.seq, {
    required this.toolUseId,
    required this.call,
    this.parentToolUseId,
    this.title,
    this.writtenAt = '',
  });

  final String toolUseId;

  /// What the call is — its kind, its label, what it is about and exactly what it was asked to do.
  final ToolCall call;

  /// The subagent that ran it, when it is not the main conversation's own (plan 26, B-18) — `null`
  /// for the main thread. `isSubagent` on the entity is this, read as a question.
  final String? parentToolUseId;

  /// What the model said the call is for, when it said (plan 22, D-05).
  final String? title;

  @override
  final String writtenAt;

  @override
  List<Object?> get props => <Object?>[seq, toolUseId, call, parentToolUseId, title, writtenAt];
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
  const ToolFinished(
    super.seq, {
    required this.toolUseId,
    required this.status,
    this.summary,
    this.writtenAt = '',
    this.question,
    this.attachments = const <ToolAttachment>[],
  });

  final String toolUseId;
  final ToolStatus status;
  final String? summary;

  /// The question of a call of kind `question`, as the contract carried it — read by the permission
  /// feature, which owns questions (plan 24, B-22).
  final Map<String, Object?>? question;

  /// Media the result carried besides its text (plan 27, F6 · B-22).
  final List<ToolAttachment> attachments;

  @override
  final String writtenAt;

  @override
  List<Object?> get props => <Object?>[
    seq,
    toolUseId,
    status,
    summary,
    writtenAt,
    question,
    attachments,
  ];
}

/// The agent's task list changed: the whole list, as it is now (plan 28, B-22). Read by the adapter
/// of the engine from its own tools — the app draws it and never rebuilds it.
final class TasksChanged extends SessionEvent {
  const TasksChanged(super.seq, this.tasks, {this.writtenAt = ''});

  /// Every task, in the agent's order. Empty when the agent cleared the list.
  final List<SessionTask> tasks;

  @override
  final String writtenAt;

  @override
  List<Object?> get props => <Object?>[seq, tasks, writtenAt];
}

/// What a finished turn cost.
final class TurnFinished extends SessionEvent {
  const TurnFinished(super.seq, this.turn);

  final TurnSummary turn;

  @override
  List<Object?> get props => <Object?>[seq, turn];
}

/// A prompt waits for the running turn to end, in the backend's queue.
final class PromptQueued extends SessionEvent {
  const PromptQueued(super.seq, this.prompt);

  final QueuedPrompt prompt;

  @override
  List<Object?> get props => <Object?>[seq, prompt];
}

/// A prompt left the queue: its turn began, or somebody took it out.
final class PromptDequeued extends SessionEvent {
  const PromptDequeued(super.seq, {required this.queueId});

  final String queueId;

  @override
  List<Object?> get props => <Object?>[seq, queueId];
}

/// The conversation was compacted: what came before is now a summary.
final class ContextCompacted extends SessionEvent {
  const ContextCompacted(super.seq, {required this.trigger, this.preTokens, this.compactionId});

  /// `manual` — somebody sent `/compact`; `auto` — the context was full.
  final String trigger;

  /// How many tokens the context held before, when the engine said.
  final int? preTokens;

  /// Stable live, on replay and from the history (plan 27, F3 · B-09, F5 · B-18) — what lets two
  /// compactions of the same conversation be told apart. Absent from a server older than it.
  final String? compactionId;

  @override
  List<Object?> get props => <Object?>[seq, trigger, preTokens, compactionId];
}

/// The session ended.
final class SessionFinished extends SessionEvent {
  const SessionFinished(super.seq, this.ending);

  final SessionEnding ending;

  @override
  List<Object?> get props => <Object?>[seq, ending];
}

/// The files of the session went back to a point, and this is what happened to each.
///
/// Everyone watching the session receives it, whoever asked for the undo.
final class FilesRewound extends SessionEvent {
  const FilesRewound(super.seq, this.outcome);

  final RewindOutcome outcome;

  @override
  List<Object?> get props => <Object?>[seq, outcome];
}

/// The MCP servers of a session and where each one stands — the whole list, every time (plan 13,
/// B-22). Never a patch: a fresh one replaces whatever this build held of it before.
final class McpStatusChanged extends SessionEvent {
  const McpStatusChanged(super.seq, this.servers);

  final List<McpServer> servers;

  @override
  List<Object?> get props => <Object?>[seq, servers];
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

/// An event the contract classifies screen state, never the conversation's timeline — plan 27,
/// D-02, F1 · B-04. A known, deliberate absence from the conversation, unlike [UnreadEvent]: the
/// contract's own `silentEventTypes` says so, not a type or a payload this build fails to read.
final class SilentEvent extends SessionEvent {
  const SilentEvent(super.seq);
}

/// A `session.notice`, read into the event the conversation applies — plan 27, F6 · B-19. The same
/// shape web's `TimelineEntry` kind `'notice'` carries: a `kind` the backend chose (open, and
/// possibly one this build has no line for yet — U-11 reads the same as B-13's own `kind: 'unknown'`,
/// never an error), either `messageKey`/`params` (ours, translated) or `text` (the agent's, a hook's
/// or a command's own, untrusted, never both).
final class SessionNotice extends SessionEvent {
  const SessionNotice(
    super.seq, {
    required this.noticeId,
    required this.kind,
    required this.level,
    this.messageKey,
    this.params,
    this.text,
    this.truncated = false,
    this.parentToolUseId,
    this.originNative,
    this.writtenAt = '',
  });

  final String noticeId;
  final String kind;
  final NoticeLevel level;
  final String? messageKey;
  final Map<String, Object?>? params;
  final String? text;
  final bool truncated;

  /// Set when this comes from a subagent — nests the line under it, the same as a message or a tool.
  final String? parentToolUseId;

  /// The engine's own, opaque name for whatever this notice came from (`origin.native`) — what names
  /// a `kind` this build has no line for (U-11), never judged, never shown as JSON (D-03).
  final String? originNative;

  @override
  final String writtenAt;

  @override
  List<Object?> get props => <Object?>[
    seq,
    noticeId,
    kind,
    level,
    messageKey,
    params,
    text,
    truncated,
    parentToolUseId,
    originNative,
    writtenAt,
  ];
}

/// The generic line this build draws for something it does not understand, synthesised by the mapper
/// rather than read off a `session.notice` (plan 27, F6 · B-20) — mirrors web's synthesised
/// `TimelineEntry` kind `'notice'` entries exactly (see `conversation-reducer.ts`'s
/// `appendGenericOnce`).
final class GenericSessionEvent extends SessionEvent {
  const GenericSessionEvent(super.seq, {required this.reason, required this.id, this.detail});

  final GenericReason reason;

  /// What this line is kept from duplicating by — the WS type, or `type:field` for a bad value —
  /// what [Conversation] keys the one-line-per-session rule by (U-06), or the one-per-(type,field)
  /// rule (U-07, U-09).
  final String id;

  /// The event type, the field's bad value, or the type again for a malformed event.
  final String? detail;

  @override
  List<Object?> get props => <Object?>[seq, reason, id, detail];
}
