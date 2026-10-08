/// One session's conversation, as the app has it.
///
/// Pure Dart, and pure values: no `flutter/*`, no socket, no provider. Every ordering rule of the
/// stream is a function of (state, frame) over these types, which is what lets the rules be
/// tested without any of the three.
///
/// The same model the web carries, deliberately: **one** ordered list of entries. Both ends read the
/// same frames, so a difference between them is a bug in one of them — the scenarios S-28…S-31 are
/// written once and hold for both (docs/architecture/mobile/03-state-and-data.md).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/conversation_entry.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

export 'package:remote_claude/features/session/domain/entities/conversation_entry.dart';

/// How many decimal places [addUsd] keeps — more than any turn's cost carries.
const int _usdScale = 12;

/// The sum of [amounts], each a decimal string of dollars as the contract writes them, written the
/// same way. An amount that is not a number adds nothing: one unreadable turn must not hide the cost
/// of every other.
String addUsd(Iterable<String> amounts) {
  final BigInt unit = BigInt.from(10).pow(_usdScale);
  BigInt total = BigInt.zero;

  for (final String amount in amounts) {
    total += _scaled(amount.trim(), unit) ?? BigInt.zero;
  }

  final String whole = (total ~/ unit).toString();
  final String fraction = (total % unit)
      .toString()
      .padLeft(_usdScale, '0')
      .replaceAll(RegExp(r'0+$'), '');

  return fraction.isEmpty ? whole : '$whole.$fraction';
}

/// [amount] in units of `1 / unit` dollars, or `null` when it is not a non-negative decimal.
BigInt? _scaled(String amount, BigInt unit) {
  final RegExpMatch? match = RegExp(r'^(\d+)(?:\.(\d+))?$').firstMatch(amount);

  if (match == null) {
    return null;
  }

  final String digits = (match.group(2) ?? '').padRight(_usdScale, '0').substring(0, _usdScale);

  return BigInt.parse(match.group(1)!) * unit + BigInt.parse(digits);
}

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

/// Why a session ended. The contract carries these six.
enum SessionCloseReason { closedByUser, completed, failed, auditUnavailable, shutdown, idleTimeout }

/// How a session ended, for a screen that arrived after the fact.
class SessionEnding extends Equatable {
  const SessionEnding({required this.reason, required this.at});

  final SessionCloseReason reason;

  /// When, as the frame carried it.
  final String at;

  @override
  List<Object?> get props => <Object?>[reason, at];
}

/// What the session said about itself when it opened.
///
/// The server acknowledges a change of model or mode, it never echoes one, so these are where the
/// session **started**; the screen lays the change it made itself over them.
class SessionFacts extends Equatable {
  const SessionFacts({
    this.workspacePath,
    this.conversationId,
    this.model,
    this.permissionMode,
    this.resumedFrom,
  });

  /// The folder it runs in — where resuming it has to run too.
  final String? workspacePath;

  /// The conversation in Claude's store it writes to — what a resume of it continues.
  final String? conversationId;

  final String? model;
  final String? permissionMode;

  /// The conversation it continues, when it is a resume or a fork — what "resume instead" resumes
  /// when the CLI refused the point of a fork.
  final String? resumedFrom;

  @override
  List<Object?> get props => <Object?>[
    workspacePath,
    conversationId,
    model,
    permissionMode,
    resumedFrom,
  ];
}

/// Everything a frame can change about a session.
class Conversation extends Equatable {
  const Conversation({
    this.status = SessionStatus.starting,
    this.lastSeq = 0,
    this.entries = const <ConversationEntry>[],
    this.queue = const <QueuedPrompt>[],
    this.facts = const SessionFacts(),
    this.lastTurn,
    this.ending,
    this.turnStartedAt,
  });

  /// What is on screen after a gap the history could not fill: the line that says so, first.
  const Conversation.partial() : this(entries: const <ConversationEntry>[ReplayGapLine()]);

  final SessionStatus status;

  /// The highest `seq` applied. Everything at or below it is a replay of what is already here.
  final int lastSeq;

  /// What was said, thought and run, in the order it happened.
  final List<ConversationEntry> entries;

  /// The prompts waiting for the running turn to end, in the order they run.
  final List<QueuedPrompt> queue;

  /// What the session said about itself when it opened.
  final SessionFacts facts;

  /// What the last finished turn cost, when one has finished.
  final TurnSummary? lastTurn;

  /// How it ended, when it has.
  final SessionEnding? ending;

  /// When the turn running now began, by the server's clock — `null` with no turn running, or when
  /// the stream did not say.
  final String? turnStartedAt;

  /// Whether anything at all has arrived.
  bool get isEmpty => entries.isEmpty;

  /// The messages, in order.
  List<StreamMessage> get messages => entries.whereType<StreamMessage>().toList(growable: false);

  /// The tools, in order.
  List<ToolExecution> get tools => entries.whereType<ToolExecution>().toList(growable: false);

  /// The thinking, in order.
  List<ThinkingEntry> get thinking => entries.whereType<ThinkingEntry>().toList(growable: false);

  /// The turns that ended, in order.
  List<TurnSummary> get turns => entries.whereType<TurnSummary>().toList(growable: false);

  /// What the session has cost since it opened: each turn once, added as decimals — money added as
  /// binary floats stops adding up.
  String get costUsd => addUsd(turns.map((TurnSummary turn) => turn.costUsd));

  /// The states in which a turn is running.
  static const Set<SessionStatus> _running = <SessionStatus>{
    SessionStatus.thinking,
    SessionStatus.running,
    SessionStatus.waitingPermission,
  };

  /// Whether a turn is running: the model thinking, a tool running, or a question waiting.
  bool get isTurnRunning => _running.contains(status);

  /// The tool of the main conversation running now — the last one that has not ended — or `null`.
  ToolExecution? get runningTool => entries
      .whereType<ToolExecution>()
      .where((ToolExecution tool) => tool.status == ToolStatus.running && !tool.isSubagent)
      .lastOrNull;

  /// A copy with some fields replaced.
  Conversation copyWith({
    SessionStatus? status,
    int? lastSeq,
    List<ConversationEntry>? entries,
    List<QueuedPrompt>? queue,
    SessionFacts? facts,
    TurnSummary? lastTurn,
    SessionEnding? ending,
  }) => Conversation(
    status: status ?? this.status,
    lastSeq: lastSeq ?? this.lastSeq,
    entries: entries ?? this.entries,
    queue: queue ?? this.queue,
    facts: facts ?? this.facts,
    lastTurn: lastTurn ?? this.lastTurn,
    ending: ending ?? this.ending,
    turnStartedAt: turnStartedAt,
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

  /// This conversation laid **over** [history] — what the transcript says was said before.
  ///
  /// The history is folded into a conversation of its own, and what is live goes on top of it:
  ///
  /// - a live entry with the id of a historical one **replaces** it, in its place. That is what
  ///   lets the history be reloaded while the stream keeps arriving without anything appearing
  ///   twice (S-15): the replay re-delivers what the transcript also holds, under the same ids;
  /// - a live message that is still streaming never replaces a historical one that is whole — the
  ///   same rule that keeps fragments older than the whole from undoing it;
  /// - everything live the history does not know comes after it, in the order it arrived;
  /// - [status], [lastSeq], [queue], [facts], [lastTurn] and [ending] stay the live ones. History
  ///   has no `seq`, and letting it move the resume point would mix two numberings: a resumed
  ///   session starts its `seq` again from one, and the history is not part of it (S-21).
  Conversation withHistory(List<SessionEvent> history) {
    if (history.isEmpty) {
      return this;
    }

    Conversation past = const Conversation();
    String? since;

    // Each entry of the history says when it was written, and the thinking of the next one is
    // bounded by it (plan 22, D-14).
    for (final SessionEvent event in history) {
      past = past._applied(event, since: since);
      since = event.writtenAt.isEmpty ? since : event.writtenAt;
    }

    return copyWith(entries: _overlay(past.entries, entries));
  }

  /// How long, at most, from [since] to [until] — the instants two entries of the history were
  /// written. `null` without both, and when [until] is the earlier: a prompt that waited in the
  /// queue is read after the result it predates (S-21), and no duration is below zero (S-106).
  static Duration? _upperBound(String? since, String until) {
    final DateTime? from = DateTime.tryParse(since ?? '');
    final DateTime? to = DateTime.tryParse(until);

    return from == null || to == null || to.isBefore(from) ? null : to.difference(from);
  }

  /// [past] with [live] laid over it, by entry id.
  static List<ConversationEntry> _overlay(
    List<ConversationEntry> past,
    List<ConversationEntry> live,
  ) {
    final Map<String, ConversationEntry> liveById = <String, ConversationEntry>{
      for (final ConversationEntry entry in live) entry.entryId: entry,
    };
    final Set<String> known = past.map((ConversationEntry entry) => entry.entryId).toSet();

    return <ConversationEntry>[
      for (final ConversationEntry entry in past) _pick(entry, liveById[entry.entryId]),
      for (final ConversationEntry entry in live)
        if (!known.contains(entry.entryId)) entry,
    ];
  }

  /// Which of a historical entry and its live one is shown.
  static ConversationEntry _pick(ConversationEntry before, ConversationEntry? now) =>
      switch ((before, now)) {
        (_, null) => before,
        (StreamMessage(isComplete: true), StreamMessage(isComplete: false)) => before,
        (_, final ConversationEntry live?) => live,
      };

  /// [event] applied, by its kind. [since] is when the history wrote the entry before it — `null`
  /// live, where nothing is bounded by it.
  Conversation _applied(SessionEvent event, {String? since}) => switch (event) {
    // Derived here rather than waiting for a status event: a screen that waited would say
    // "starting" until the first fragment of the first answer arrived.
    SessionOpened() => copyWith(status: SessionStatus.idle, facts: _factsOf(event)),
    SessionStatusReported() => _moved(event),
    ThinkingFragment() => _thinking(event),
    MessageFragment() => _fragment(event),
    MessageFinished() => _finished(event, _upperBound(since, event.writtenAt)),
    ToolInvoked() => _invoked(event),
    ToolOutput() => _changeTool(
      event.toolUseId,
      (ToolExecution tool) => tool.copyWith(output: tool.output + event.chunk),
    ),
    ToolFinished() => _changeTool(
      event.toolUseId,
      (ToolExecution tool) => tool.copyWith(
        status: event.status,
        summary: event.summary,
        taskId: event.taskId,
        question: event.question,
      ),
    ),
    TurnFinished(:final TurnSummary turn) => _turn(turn),
    PromptQueued(:final QueuedPrompt prompt) => copyWith(
      queue: <QueuedPrompt>[..._without(prompt.queueId), prompt],
    ),
    PromptDequeued(:final String queueId) => copyWith(queue: _without(queueId)),
    ContextCompacted() => _withEntry(
      CompactionLine(seq: event.seq, trigger: event.trigger, preTokens: event.preTokens),
    ),
    // The session that closes takes its queue with it, without a `prompt.dequeued` for each.
    SessionFinished(:final SessionEnding ending) => copyWith(
      status: SessionStatus.closed,
      ending: ending,
      queue: const <QueuedPrompt>[],
    ),
    // Where the files went back is a line of the conversation, in the order it happened (B-23).
    FilesRewound(:final RewindOutcome outcome) => _withEntry(
      RewoundLine(
        seq: event.seq,
        restored: outcome.reverted.length,
        kept: outcome.preserved.length,
        failed: outcome.failed.length,
      ),
    ),
    // Neither belongs to the conversation: the round trip is the walking skeleton's own screen, and
    // an unreadable event is only here to move the resume point.
    PongArrived() => this,
    UnreadEvent() => this,
  };

  SessionFacts _factsOf(SessionOpened opened) => SessionFacts(
    workspacePath: opened.workspacePath ?? facts.workspacePath,
    conversationId: opened.claudeSessionId ?? facts.conversationId,
    model: opened.model ?? facts.model,
    permissionMode: opened.permissionMode ?? facts.permissionMode,
    resumedFrom: opened.resumedFrom ?? facts.resumedFrom,
  );

  /// The session moved. A turn that starts here is timed from this instant, and one that stops
  /// here is no longer timed — what the indicator at the tail counts (B-18).
  Conversation _moved(SessionStatusReported event) {
    final bool running = _running.contains(event.status);
    final String? since = !running
        ? null
        : isTurnRunning
        ? turnStartedAt
        : (event.at.isEmpty ? null : event.at);

    return Conversation(
      status: event.status,
      lastSeq: lastSeq,
      entries: entries,
      queue: queue,
      facts: facts,
      lastTurn: lastTurn,
      ending: ending,
      turnStartedAt: since,
    );
  }

  List<QueuedPrompt> _without(String queueId) =>
      queue.where((QueuedPrompt prompt) => prompt.queueId != queueId).toList(growable: false);

  /// The entry at the end, or in its place when it is already here — a redelivery.
  Conversation _withEntry(ConversationEntry entry) {
    final int at = entries.indexWhere((ConversationEntry each) => each.entryId == entry.entryId);

    if (at < 0) {
      return copyWith(entries: <ConversationEntry>[...entries, entry]);
    }

    final List<ConversationEntry> next = List<ConversationEntry>.of(entries);
    next[at] = entry;

    return copyWith(entries: next);
  }

  /// The entry with [entryId] changed by [change], or this conversation untouched when there is
  /// none.
  Conversation _change<T extends ConversationEntry>(String entryId, T Function(T entry) change) {
    final int at = entries.indexWhere((ConversationEntry each) => each.entryId == entryId);

    if (at < 0 || entries[at] is! T) {
      return this;
    }

    final List<ConversationEntry> next = List<ConversationEntry>.of(entries);
    next[at] = change(entries[at] as T);

    return copyWith(entries: next);
  }

  /// The thinking of [messageId] that is still arriving, if any.
  ThinkingEntry? _openThinking(String messageId) => entries
      .whereType<ThinkingEntry>()
      .where((ThinkingEntry each) => each.messageId == messageId && !each.isComplete)
      .lastOrNull;

  int _thinkingCount(String messageId) => entries
      .whereType<ThinkingEntry>()
      .where((ThinkingEntry each) => each.messageId == messageId)
      .length;

  /// A fragment of thinking: into the thinking still arriving, or a new one after everything else.
  ///
  /// Never into the answer (S-08): what the model reasons is not what it replies.
  Conversation _thinking(ThinkingFragment event) {
    final ThinkingEntry? open = _openThinking(event.messageId);

    if (open != null) {
      return _withEntry(open.continued(event.delta));
    }

    return _withEntry(
      ThinkingEntry(
        messageId: event.messageId,
        index: _thinkingCount(event.messageId),
        text: event.delta,
        startedAt: event.at.isEmpty ? null : event.at,
      ),
    );
  }

  /// The thinking of [messageId] still arriving, stopped at [at] — the answer began.
  Conversation _stopThinking(String messageId, String at) {
    final ThinkingEntry? open = _openThinking(messageId);
    return open == null ? this : _withEntry(open.finished(at: at));
  }

  /// A fragment, accumulated **by `messageId`** (S-30, S-31), into the block arriving now.
  ///
  /// The rule this whole type exists for: two messages in flight must not mix. A fragment of a
  /// message nothing has announced yet starts one, because the model streams before it completes
  /// anything. A fragment after a block finished starts the next block of the same message.
  Conversation _fragment(MessageFragment event) {
    final Conversation stopped = _stopThinking(event.messageId, event.at);
    final String id = 'message:${event.messageId}';

    if (!stopped.entries.any((ConversationEntry each) => each.entryId == id)) {
      return stopped._withEntry(StreamMessage(messageId: event.messageId, streaming: event.delta));
    }

    return stopped._change<StreamMessage>(
      id,
      (StreamMessage message) =>
          message.copyWith(streaming: () => (message.streaming ?? '') + event.delta),
    );
  }

  /// A finished message — or, from the CLI, a finished block of one.
  ///
  /// It **adds** what finished: the thinking to its own entries, the text to the message. A block
  /// that is a tool call adds nothing here, and must not erase the answer before it. A client that
  /// missed a fragment is made whole: the block that finished replaces the fragment that was
  /// streaming it.
  ///
  /// [atMost] bounds how long its thinking took, when the history dated it and the entry before
  /// (plan 22, D-14).
  Conversation _finished(MessageFinished event, Duration? atMost) {
    final Conversation thought = event.thoughts.fold(
      this,
      (Conversation state, Thought each) => state._thought(event.messageId, each, event.at, atMost),
    );

    if (event.text.isEmpty && event.images.isEmpty && !event.isFromUser) {
      return thought;
    }

    return thought._text(event);
  }

  /// One finished thinking: the one still arriving, completed — or a new one, unless the message
  /// already has it, which is the history and the stream both delivering it.
  Conversation _thought(String messageId, Thought finished, String at, Duration? atMost) {
    final ThinkingEntry? open = _openThinking(messageId);

    if (open != null) {
      return _withEntry(
        open.finished(
          text: finished.text.isEmpty ? null : finished.text,
          isRedacted: finished.isRedacted,
          at: at,
          blockId: finished.blockId,
        ),
      );
    }

    final bool known = entries.whereType<ThinkingEntry>().any(
      (ThinkingEntry each) => _sameThought(each, messageId, finished),
    );

    return known
        ? this
        : _withEntry(
            ThinkingEntry(
              messageId: messageId,
              index: _thinkingCount(messageId),
              text: finished.text,
              isComplete: true,
              isRedacted: finished.isRedacted,
              blockId: finished.blockId,
              atMost: atMost,
            ),
          );
  }

  /// Whether a thinking already here is [finished] arriving again: by identity when both carry one —
  /// two thinkings the model did not show are equal and still two (plan 22, S-35) —, and by message,
  /// text and redaction when either comes from a server older than it (S-37).
  static bool _sameThought(ThinkingEntry each, String messageId, Thought finished) {
    if (each.blockId != null && finished.blockId != null) {
      return each.blockId == finished.blockId;
    }

    return each.messageId == messageId &&
        each.text == finished.text &&
        each.isRedacted == finished.isRedacted;
  }

  /// The text block that finished, added to its message once.
  Conversation _text(MessageFinished event) {
    final Conversation stopped = _stopThinking(event.messageId, event.at);
    final String id = 'message:${event.messageId}';
    final StreamMessage message =
        stopped.entries
            .whereType<StreamMessage>()
            .where((StreamMessage each) => each.entryId == id)
            .firstOrNull ??
        StreamMessage(messageId: event.messageId, isFromUser: event.isFromUser);

    // A prompt of only an image has no text to add: its marker is what is drawn (S-121).
    final bool known =
        _knownText(message, event) || (event.text.isEmpty && event.images.isNotEmpty);
    final StreamMessage whole = StreamMessage(
      messageId: message.messageId,
      blocks: known ? message.blocks : <String>[...message.blocks, event.text],
      isFromUser: event.isFromUser,
      blockIds: known ? message.blockIds : <String>[...message.blockIds, ...event.textBlockIds],
      images: <PromptImage>[
        ...message.images,
        for (final PromptImage image in event.images)
          if (!message.images.contains(image)) image,
      ],
    );

    return stopped._withEntry(whole);
  }

  /// Whether the text that finished is already in the message: by identity when the server named its
  /// blocks (plan 22, S-36), and by its text otherwise (S-37).
  static bool _knownText(StreamMessage message, MessageFinished event) {
    if (event.textBlockIds.isNotEmpty && message.blockIds.isNotEmpty) {
      return event.textBlockIds.every(message.blockIds.contains);
    }

    return message.streaming == null && message.blocks.contains(event.text);
  }

  /// A tool starting — or **starting again**, when the replay re-delivers it (S-78): in its place,
  /// from nothing.
  Conversation _invoked(ToolInvoked event) => _withEntry(
    ToolExecution(
      toolUseId: event.toolUseId,
      toolName: event.toolName,
      input: event.input,
      isSubagent: event.isSubagent,
      title: event.title,
    ),
  );

  /// A change to one invocation, or this conversation untouched when nothing announced it.
  Conversation _changeTool(String toolUseId, ToolExecution Function(ToolExecution tool) change) =>
      _change<ToolExecution>('tool:$toolUseId', change);

  Conversation _turn(TurnSummary turn) => _withEntry(turn).copyWith(lastTurn: turn);

  @override
  List<Object?> get props => <Object?>[
    status,
    lastSeq,
    entries,
    queue,
    facts,
    lastTurn,
    ending,
    turnStartedAt,
  ];
}
