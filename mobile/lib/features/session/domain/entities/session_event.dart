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
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
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
    this.claudeSessionId,
    this.resumedFrom,
    this.workspacePath,
    this.model,
    this.permissionMode,
    this.commandId,
  });

  final String sessionId;

  /// The conversation in Claude's store this session writes to — what its history is read by and
  /// what a later resume names. `null` only from a build of the backend that did not say.
  final String? claudeSessionId;

  /// The conversation this session continues, when it is a resume. Everything said before this
  /// session's first turn is read from it, over HTTP: the replay buffer only holds what **this**
  /// session said (B-11).
  final String? resumedFrom;

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
    claudeSessionId,
    resumedFrom,
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
  const Fragment(super.seq, {required this.messageId, required this.delta, this.at = ''});

  final String messageId;
  final String delta;

  /// When it arrived, by the server's clock — empty from the history. The answer starting is when
  /// the thinking before it stopped; the thinking starting is what its time is measured from.
  final String at;

  @override
  List<Object?> get props => <Object?>[seq, messageId, delta, at];
}

/// A fragment of the answer.
final class MessageFragment extends Fragment {
  const MessageFragment(super.seq, {required super.messageId, required super.delta, super.at});
}

/// A fragment of what the model thought before answering. Never part of the answer.
final class ThinkingFragment extends Fragment {
  const ThinkingFragment(super.seq, {required super.messageId, required super.delta, super.at});
}

/// A message — or, from the CLI, one block of it — finished. It completes whatever the fragments
/// of that block built.
final class MessageFinished extends SessionEvent {
  const MessageFinished(
    super.seq, {
    required this.messageId,
    required this.text,
    required this.isFromUser,
    this.thoughts = const <Thought>[],
    this.at = '',
    this.textBlockIds = const <String>[],
    this.images = const <PromptImage>[],
    this.writtenAt = '',
  });

  final String messageId;

  /// The text blocks that finished, joined. Empty when what finished was thinking or a tool call.
  final String text;

  /// The identities of those text blocks, in order — empty from a server older than them (plan 22,
  /// D-06). Two blocks are the same block when their ids are.
  final List<String> textBlockIds;
  final bool isFromUser;

  /// The thinking blocks that finished, in order.
  final List<Thought> thoughts;

  /// When, by the server's clock — empty from the history.
  final String at;

  /// The images of a prompt, as markers (plan 22, D-09).
  final List<PromptImage> images;

  @override
  final String writtenAt;

  @override
  List<Object?> get props => <Object?>[
    seq,
    messageId,
    text,
    isFromUser,
    thoughts,
    at,
    textBlockIds,
    images,
    writtenAt,
  ];
}

/// One finished block of thinking.
class Thought extends Equatable {
  const Thought(this.text, {this.isRedacted = false, this.blockId});

  /// What the model thought — empty when it would not show it.
  final String text;

  /// The model thought here and did not show what (`redacted_thinking`).
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
    required this.toolName,
    required this.input,
    this.isSubagent = false,
    this.title,
    this.writtenAt = '',
  });

  final String toolUseId;
  final String toolName;

  /// Exactly what the tool was asked to do. Never a summary of it.
  final Map<String, Object?> input;

  /// A subagent ran it, not the main conversation — its task list is its own.
  final bool isSubagent;

  /// What the model said the call is for, when it said (plan 22, D-05).
  final String? title;

  @override
  final String writtenAt;

  @override
  List<Object?> get props => <Object?>[
    seq,
    toolUseId,
    toolName,
    input,
    isSubagent,
    title,
    writtenAt,
  ];
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
    this.taskId,
    this.writtenAt = '',
    this.question,
  });

  final String toolUseId;
  final ToolStatus status;
  final String? summary;

  /// The question of an `AskUserQuestion`, as the contract carried it — read by the permission
  /// feature, which owns questions (plan 24, B-22).
  final Map<String, Object?>? question;

  /// The task a `TaskCreate` made or a `TaskUpdate` changed — what the task list keys it by.
  final String? taskId;

  @override
  final String writtenAt;

  @override
  List<Object?> get props => <Object?>[
    seq,
    toolUseId,
    status,
    summary,
    taskId,
    writtenAt,
    question,
  ];
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
  const ContextCompacted(super.seq, {required this.trigger, this.preTokens});

  /// `manual` — somebody sent `/compact`; `auto` — the context was full.
  final String trigger;

  /// How many tokens the context held before, when the SDK said.
  final int? preTokens;

  @override
  List<Object?> get props => <Object?>[seq, trigger, preTokens];
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
