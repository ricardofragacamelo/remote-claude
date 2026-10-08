/// What a conversation is made of, one entry at a time, in the order it happened.
///
/// Pure Dart, and pure values. The conversation is **one** ordered list of these — a message, the
/// thinking before it, the tool it ran, the end of the turn — because two lists drawn one after the
/// other put every tool after every message, which is not what happened (plan 10, B-05). The web
/// draws the same list from the same frames (docs/architecture/mobile/03-state-and-data.md).
library;

import 'package:equatable/equatable.dart';

/// How a tool invocation ended, when it has.
enum ToolStatus { running, succeeded, failed, denied }

/// One entry of the conversation.
///
/// Sealed, so drawing the list is an exhaustive `switch`: an entry nobody draws is a compile error,
/// not a row that silently shows nothing.
sealed class ConversationEntry extends Equatable {
  const ConversationEntry();

  /// What the entry is known by, unique across every kind — what lays the live stream over the
  /// history without anything appearing twice.
  String get entryId;
}

/// One message of the conversation.
///
/// The CLI finishes a message one **block** at a time, every block under the same `messageId`, so a
/// message is the text blocks finished so far, in order, plus the one still streaming. The fragments
/// of one `messageId` accumulate there and nowhere else: accumulating in arrival order across
/// messages is how two answers in flight end up as one paragraph of nonsense.
class StreamMessage extends ConversationEntry {
  const StreamMessage({
    required this.messageId,
    this.blocks = const <String>[],
    this.streaming,
    this.isFromUser = false,
    this.blockIds = const <String>[],
    this.images = const <PromptImage>[],
  });

  final String messageId;

  /// The text blocks that finished, in order.
  final List<String> blocks;

  /// The identities of the finished text blocks a server named (plan 22, D-06).
  final List<String> blockIds;

  /// The block arriving now, fragment by fragment — `null` once it finished.
  final String? streaming;

  /// Whether the person wrote it. Everything else came from the model.
  final bool isFromUser;

  /// The images the prompt carried — markers of them, never their bytes (plan 22, D-09).
  final List<PromptImage> images;

  /// Everything of this message the client has: the finished blocks and the one arriving.
  String get text => <String>[...blocks, ?streaming].join();

  /// Nothing of it is still arriving.
  bool get isComplete => streaming == null;

  @override
  String get entryId => 'message:$messageId';

  /// A copy with some fields replaced. [streaming] is a function so it can be cleared.
  StreamMessage copyWith({List<String>? blocks, String? Function()? streaming}) => StreamMessage(
    messageId: messageId,
    blocks: blocks ?? this.blocks,
    streaming: streaming == null ? this.streaming : streaming(),
    isFromUser: isFromUser,
    blockIds: blockIds,
    images: images,
  );

  @override
  List<Object?> get props => <Object?>[messageId, blocks, streaming, isFromUser, blockIds, images];
}

/// An image a prompt carried, as the conversation keeps it: what it is and how large, never the
/// bytes. They are asked for when the person opens it (plan 22, D-09).
class PromptImage extends Equatable {
  const PromptImage({this.blockId, this.mediaType, this.size});

  /// What the image is asked for by — `null` from a server older than it, and then it cannot be.
  final String? blockId;

  /// The type the prompt declared — `image/png` —, when it said.
  final String? mediaType;

  /// How many bytes it has, when the prompt carried them and not a URL.
  final int? size;

  @override
  List<Object?> get props => <Object?>[blockId, mediaType, size];
}

/// What the model thought before answering — an entry of its own, never part of the answer.
///
/// A message can think more than once, so the blocks of one `messageId` are numbered by [index].
class ThinkingEntry extends ConversationEntry {
  const ThinkingEntry({
    required this.messageId,
    required this.index,
    this.text = '',
    this.isComplete = false,
    this.isRedacted = false,
    this.startedAt,
    this.endedAt,
    this.blockId,
    this.atMost,
  });

  final String messageId;

  /// Which thinking of the message, from 0.
  final int index;

  /// The block's identity, once a finished block named it (plan 22, D-06).
  final String? blockId;

  /// What it thought, as far as it has arrived. Empty when the model would not show it.
  final String text;

  /// It stopped: its block finished, or the answer after it began.
  final bool isComplete;

  /// The model thought here and did not show what.
  final bool isRedacted;

  /// When it began and stopped, by the server's clock — `null` from the history, which keeps no
  /// instant per block.
  final String? startedAt;
  final String? endedAt;

  /// How long it took **at most**, from the history: the time between the entry before and the one
  /// that holds it, which also holds the wait for the first token (plan 22, D-14). `null` live, and
  /// without both instants.
  final Duration? atMost;

  /// How long it thought, or `null` when there is no honest answer: still thinking, or read from the
  /// history. "0 s" or "NaN" would be a lie about the one thing the line says (S-61).
  Duration? get duration {
    final DateTime? from = DateTime.tryParse(startedAt ?? '');
    final DateTime? to = DateTime.tryParse(endedAt ?? '');

    if (from == null || to == null || to.isBefore(from)) {
      return null;
    }

    return to.difference(from);
  }

  @override
  String get entryId => 'thinking:$messageId:$index';

  /// The same thinking, stopped — with the text that finished it, when one did.
  ThinkingEntry finished({String? text, bool? isRedacted, String at = '', String? blockId}) =>
      ThinkingEntry(
        messageId: messageId,
        index: index,
        text: text ?? this.text,
        isComplete: true,
        isRedacted: isRedacted ?? this.isRedacted,
        startedAt: startedAt,
        endedAt: endedAt ?? (at.isEmpty ? null : at),
        blockId: blockId ?? this.blockId,
        atMost: atMost,
      );

  /// The same thinking with [delta] added.
  ThinkingEntry continued(String delta) =>
      ThinkingEntry(messageId: messageId, index: index, text: text + delta, startedAt: startedAt);

  @override
  List<Object?> get props => <Object?>[
    messageId,
    index,
    text,
    isComplete,
    isRedacted,
    startedAt,
    endedAt,
    blockId,
    atMost,
  ];
}

/// One tool, running on the user's own machine.
///
/// The **exact** input is kept, never a summary of it: somebody watching a command run on their
/// laptop is entitled to see the command.
class ToolExecution extends ConversationEntry {
  const ToolExecution({
    required this.toolUseId,
    required this.toolName,
    required this.input,
    this.status = ToolStatus.running,
    this.output = '',
    this.summary,
    this.taskId,
    this.isSubagent = false,
    this.title,
    this.question,
  });

  final String toolUseId;
  final String toolName;

  /// The question of an `AskUserQuestion`, as `tool.completed` carried it (plan 24, B-22).
  final Map<String, Object?>? question;

  /// What the model said the call is for — the `description` of a shell command —, when it said
  /// (plan 22, D-05).
  final String? title;

  /// What the tool was asked to do, exactly as the contract carried it.
  final Map<String, Object?> input;

  final ToolStatus status;

  /// Everything `tool.progress` has sent, in order.
  final String output;

  /// What `tool.completed` said about it, when it said anything.
  final String? summary;

  /// The task a `TaskCreate` made or a `TaskUpdate` changed, once the call ended.
  final String? taskId;

  /// A subagent ran it, not the main conversation.
  final bool isSubagent;

  @override
  String get entryId => 'tool:$toolUseId';

  /// A copy with some fields replaced.
  ToolExecution copyWith({
    ToolStatus? status,
    String? output,
    String? summary,
    String? taskId,
    Map<String, Object?>? question,
  }) => ToolExecution(
    toolUseId: toolUseId,
    toolName: toolName,
    input: input,
    status: status ?? this.status,
    output: output ?? this.output,
    summary: summary ?? this.summary,
    taskId: taskId ?? this.taskId,
    isSubagent: isSubagent,
    title: title,
    question: question ?? this.question,
  );

  @override
  List<Object?> get props => <Object?>[
    toolUseId,
    toolName,
    input,
    status,
    output,
    summary,
    taskId,
    isSubagent,
    title,
    question,
  ];
}

/// What a finished turn cost — the line that closes it in the conversation.
class TurnSummary extends ConversationEntry {
  const TurnSummary({required this.turnId, required this.costUsd, required this.durationMs});

  final String turnId;

  /// A string, not a double: money that goes through a binary float stops adding up.
  final String costUsd;

  final int durationMs;

  @override
  String get entryId => 'turn:$turnId';

  @override
  List<Object?> get props => <Object?>[turnId, costUsd, durationMs];
}

/// The conversation was compacted here: what came before is now a summary Claude carries.
class CompactionLine extends ConversationEntry {
  const CompactionLine({required this.seq, required this.trigger, this.preTokens});

  /// Where in the stream it happened — what tells two compactions apart.
  final int seq;

  /// `manual` — somebody sent `/compact`; `auto` — the context was full.
  final String trigger;

  /// How many tokens the context held before, when the SDK said.
  final int? preTokens;

  /// Whether a person asked for it, rather than the context filling up.
  bool get isManual => trigger == 'manual';

  @override
  String get entryId => 'compaction:$seq';

  @override
  List<Object?> get props => <Object?>[seq, trigger, preTokens];
}

/// The files of the session went back to a point, here: how many went back, stayed and failed. File
/// by file is the undo sheet's, which reads the same event.
class RewoundLine extends ConversationEntry {
  const RewoundLine({
    required this.seq,
    required this.restored,
    required this.kept,
    required this.failed,
  });

  /// Where in the stream it happened — what tells two undos apart.
  final int seq;

  /// How many files went back.
  final int restored;

  /// How many stayed as they were, each for a reason the sheet gives.
  final int kept;

  /// How many could not go back — each left exactly as it was.
  final int failed;

  @override
  String get entryId => 'rewound:$seq';

  @override
  List<Object?> get props => <Object?>[seq, restored, kept, failed];
}

/// What is on screen starts here: the replay no longer held what came before, and there was no
/// conversation to read it from. Said, because an absence of content reads as an absence of
/// activity.
class ReplayGapLine extends ConversationEntry {
  const ReplayGapLine();

  @override
  String get entryId => 'gap';

  @override
  List<Object?> get props => const <Object?>[];
}

/// A prompt waiting for the running turn to end — the backend's queue, the same for every watcher.
class QueuedPrompt extends Equatable {
  const QueuedPrompt({required this.queueId, required this.promptedBy, required this.preview});

  /// What `session.cancelQueuedPrompt` names it by.
  final String queueId;

  /// The kind of client that sent it — `web` or `mobile` — never who.
  final String promptedBy;

  /// The start of what was typed, cut by the backend.
  final String preview;

  @override
  List<Object?> get props => <Object?>[queueId, promptedBy, preview];
}
