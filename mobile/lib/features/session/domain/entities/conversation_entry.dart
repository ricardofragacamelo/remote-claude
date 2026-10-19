/// What a conversation is made of, one entry at a time, in the order it happened.
///
/// Pure Dart, and pure values. The conversation is **one** ordered list of these — a message, the
/// thinking before it, the tool it ran, the end of the turn — because two lists drawn one after the
/// other put every tool after every message, which is not what happened (plan 10, B-05). The web
/// draws the same list from the same frames (docs/architecture/mobile/03-state-and-data.md).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/conversation/tool_call.dart';

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
/// message is the blocks finished so far, **in the order they arrived** — text and image mixed as
/// they were (plan 26, B-09) — plus the one still streaming. The fragments of one `messageId`
/// accumulate there and nowhere else: accumulating in arrival order across messages is how two
/// answers in flight end up as one paragraph of nonsense.
class StreamMessage extends ConversationEntry {
  const StreamMessage({
    required this.messageId,
    this.blocks = const <MessageBlock>[],
    this.streaming,
    this.isFromUser = false,
    this.parentToolUseId,
  });

  final String messageId;

  /// The blocks that finished, in the order the model gave them.
  final List<MessageBlock> blocks;

  /// The text arriving now, fragment by fragment — `null` once it finished.
  final String? streaming;

  /// Whether the person wrote it. Everything else came from the model.
  final bool isFromUser;

  /// The subagent this message belongs to, when it is not the main conversation's own (plan 26,
  /// B-18, B-19) — `null` for the main thread.
  final String? parentToolUseId;

  /// Everything of this message the client has, as the web's `message.text` is: every text block
  /// joined with the one still arriving, with **no** separator — what "copy" copies (B-11).
  String get text => <String>[
    for (final MessageBlock block in blocks)
      if (block is TextBlock) block.text,
    ?streaming,
  ].join();

  /// Nothing of it is still arriving.
  bool get isComplete => streaming == null;

  @override
  String get entryId => 'message:$messageId';

  /// A copy with some fields replaced. [streaming] is a function so it can be cleared.
  StreamMessage copyWith({List<MessageBlock>? blocks, String? Function()? streaming}) =>
      StreamMessage(
        messageId: messageId,
        blocks: blocks ?? this.blocks,
        streaming: streaming == null ? this.streaming : streaming(),
        isFromUser: isFromUser,
        parentToolUseId: parentToolUseId,
      );

  @override
  List<Object?> get props => <Object?>[messageId, blocks, streaming, isFromUser, parentToolUseId];
}

/// One drawable piece of a finished message — a paragraph of text, or an image — in the order the
/// model gave it (plan 26, B-09). Sealed: a kind the client does not draw does not arrive here, the
/// same way a block kind the mapper does not know does not become one (S-09).
sealed class MessageBlock extends Equatable {
  const MessageBlock();

  /// What a server named this block by (plan 22, D-06) — `null` from an older one, and then two
  /// blocks are the same block only by their content.
  String? get blockId;
}

/// A paragraph of the answer, or of a prompt.
final class TextBlock extends MessageBlock {
  const TextBlock(this.text, {this.blockId});

  final String text;

  @override
  final String? blockId;

  @override
  List<Object?> get props => <Object?>[text, blockId];
}

/// An image block, wrapping the [PromptImage] marker the rest of the app already draws it by.
final class ImageBlock extends MessageBlock {
  const ImageBlock(this.image);

  final PromptImage image;

  @override
  String? get blockId => image.blockId;

  @override
  List<Object?> get props => <Object?>[image];
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
    this.parentToolUseId,
  });

  final String messageId;

  /// Which thinking of the message, from 0.
  final int index;

  /// The subagent this thinking belongs to, when it is not the main conversation's own (plan 26,
  /// B-18, B-19) — `null` for the main thread.
  final String? parentToolUseId;

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
        parentToolUseId: parentToolUseId,
      );

  /// The same thinking with [delta] added.
  ThinkingEntry continued(String delta) => ThinkingEntry(
    messageId: messageId,
    index: index,
    text: text + delta,
    startedAt: startedAt,
    parentToolUseId: parentToolUseId,
  );

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
    parentToolUseId,
  ];
}

/// One tool, running on the user's own machine.
///
/// The **exact** input is kept, never a summary of it: somebody watching a command run on their
/// laptop is entitled to see the command.
class ToolExecution extends ConversationEntry {
  const ToolExecution({
    required this.toolUseId,
    required this.call,
    this.status = ToolStatus.running,
    this.elapsed,
    this.summary,
    this.parentToolUseId,
    this.title,
    this.question,
  });

  final String toolUseId;

  /// What the call is: its kind and label, what it is about, and exactly what it was asked to do.
  final ToolCall call;

  /// The question of a call of kind `question`, as `tool.completed` carried it (plan 24, B-22).
  final Map<String, Object?>? question;

  /// What the model said the call is for — the `description` of a shell command —, when it said
  /// (plan 22, D-05).
  final String? title;

  final ToolStatus status;

  /// How long it has run, as `tool.progress` last said — `<seconds>s`, never the tool's own output
  /// any more (plan 26, B-14). `null` before the first tick, or once it finished.
  final String? elapsed;

  /// What `tool.completed` said about it, when it said anything.
  final String? summary;

  /// The subagent that ran it, when it is not the main conversation's own (plan 26, B-18) — `null`
  /// for the main thread.
  final String? parentToolUseId;

  /// A subagent ran it, not the main conversation — [parentToolUseId], read as a question.
  bool get isSubagent => parentToolUseId != null;

  @override
  String get entryId => 'tool:$toolUseId';

  /// A copy with some fields replaced.
  ToolExecution copyWith({
    ToolStatus? status,
    String? elapsed,
    String? summary,
    Map<String, Object?>? question,
  }) => ToolExecution(
    toolUseId: toolUseId,
    call: call,
    status: status ?? this.status,
    elapsed: elapsed ?? this.elapsed,
    summary: summary ?? this.summary,
    parentToolUseId: parentToolUseId,
    title: title,
    question: question ?? this.question,
  );

  @override
  List<Object?> get props => <Object?>[
    toolUseId,
    call,
    status,
    elapsed,
    summary,
    parentToolUseId,
    title,
    question,
  ];
}

/// What a finished turn cost — the line that closes it in the conversation.
class TurnSummary extends ConversationEntry {
  const TurnSummary({
    required this.turnId,
    required this.durationMs,
    this.costUsd,
    this.inputTokens,
    this.outputTokens,
    this.cacheReadTokens,
    this.cacheWriteTokens,
    this.reasoningTokens,
    this.webSearches,
  });

  final String turnId;

  /// A string, not a double: money that goes through a binary float stops adding up. `null` when
  /// the engine reports no cost (plan 28, B-29) — which is not zero: zero is `"0.000000"`.
  final String? costUsd;

  final int durationMs;

  /// The canonical `usage` of `turn.completed` (plan 28, B-17's own), every field optional: one the
  /// engine did not report, or sent as something other than a number, is absent rather than zero
  /// (plan 26, B-17, S-62) — the line says what it knows, nothing it does not.
  final int? inputTokens;
  final int? outputTokens;
  final int? cacheReadTokens;
  final int? cacheWriteTokens;

  /// Carried for parity with the canonical contract (plan 28 · D-17) — the web's own `TurnRow` does
  /// not draw either yet, so neither does this line.
  final int? reasoningTokens;
  final int? webSearches;

  @override
  String get entryId => 'turn:$turnId';

  @override
  List<Object?> get props => <Object?>[
    turnId,
    costUsd,
    durationMs,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    webSearches,
  ];
}

/// The conversation was compacted here: what came before is now a summary the agent carries.
class CompactionLine extends ConversationEntry {
  const CompactionLine({required this.seq, required this.trigger, this.preTokens});

  /// Where in the stream it happened — what tells two compactions apart.
  final int seq;

  /// `manual` — somebody sent `/compact`; `auto` — the context was full.
  final String trigger;

  /// How many tokens the context held before, when the engine said.
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
