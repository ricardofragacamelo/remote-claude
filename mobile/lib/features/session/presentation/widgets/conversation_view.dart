/// What has been said in a session, thought in it and run in it — in the order it happened.
///
/// The **only** thing on the session screen that scrolls (plan 10, B-06). It follows the end only
/// when the person is already at the end: somebody who scrolled up is reading, and what arrives at
/// the tail must not move what they read (S-12). The list is not reversed for that reason — a
/// reversed list keeps its offset from the bottom, so a message growing at the tail pushes the text
/// of whoever scrolled up a little (docs/architecture/mobile/04-ui.md#transcript-e-stream).
///
/// What happens in a turn is drawn **inside** it (plan 10, F4): the question about a tool in the
/// place of that tool's line — or at the tail while the line has not arrived —, the decision on the
/// line once it is settled, and the line that moves while the turn runs, last of all.
///
/// Reading a followed conversation of the history (plan 22, B-26), it also **counts** what arrives
/// below somebody who scrolled up: a pill says how many messages are new and takes them to the end.
/// It counts as the web does (S-84, S-99): **messages** of the conversation with something drawn —
/// a thinking and an answer of one reply are one, a reply that only calls a tool is none —, from
/// the last one there was when the person left the end, so an earlier page read meanwhile, which
/// goes before, is never new.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/core/widgets/markdown/safe_markdown.dart';
import 'package:remote_claude/core/widgets/retry_line.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';
import 'package:remote_claude/features/session/domain/services/file_links.dart';
import 'package:remote_claude/features/session/presentation/providers/subagent_history_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_lines.dart';
import 'package:remote_claude/features/session/presentation/widgets/image_marker.dart';
import 'package:remote_claude/features/session/presentation/widgets/message_actions.dart';
import 'package:remote_claude/features/session/presentation/widgets/pending_pill.dart';
import 'package:remote_claude/features/session/presentation/widgets/thinking_line.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_card.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// How close to the end still counts as "at the end" — a finger's width, so a reader who is one
/// line short of the bottom is still followed.
const double followSlack = Tokens.touchTarget;

/// How many times going to a card that is not drawn yet moves towards it before giving up.
const int _approaches = 6;

/// The questions of the live session, laid out the way the conversation draws them: each in the
/// place of the tool it is about, by `toolUseId`, and each settled one as the decision on that
/// tool's line. The queue is still the source (09 · D-12); this only finds things in it.
class InlineQuestions {
  const InlineQuestions({
    required this.sessionId,
    required this.queue,
    required this.inView,
    this.modes = const <String>[],
    this.onPlanApproved,
  });

  final String sessionId;
  final PermissionQueue queue;

  /// Where the cards are on screen — what the pill reads.
  final QuestionsInView inView;

  /// The modes the session's engine announced — what an approved plan goes on in (plan 28, B-27).
  final List<String> modes;

  /// A plan was approved, to go on in a mode — the chip of the mode changes with it (B-21).
  final void Function(String mode)? onPlanApproved;

  /// The open question about [toolUseId], if there is one.
  PermissionCard? cardFor(String toolUseId) =>
      queue.pending.where((PermissionCard card) => card.request.toolUseId == toolUseId).firstOrNull;

  /// How the question about [toolUseId] was settled, if it was.
  PermissionOutcome? decisionFor(String toolUseId) => queue.settled.reversed
      .where((PermissionOutcome outcome) => outcome.toolUseId == toolUseId)
      .firstOrNull;
}

/// The entries of one conversation, in order.
class ConversationView extends StatefulWidget {
  const ConversationView({
    required this.conversation,
    super.key,
    this.header,
    this.inline,
    this.working,
    this.prompts,
    this.countsUnseen = false,
    this.conversationKey,
  });

  final Conversation conversation;

  /// The conversation in the engine's store this is — what a tool's whole output and a prompt's
  /// image are read from (plan 22, B-32, B-33). `null` while nothing said which.
  final ConversationKey? conversationKey;

  /// Whether what arrives below a reader who scrolled up is counted, with a pill that takes them to
  /// the end — "*N* new" (docs/architecture/mobile/04-ui.md, plan 22 · F4).
  final bool countsUnseen;

  /// What sits above the first entry and scrolls with it — the strip of a partial history, say.
  final Widget? header;

  /// The questions of the live session — `null` reading the history.
  final InlineQuestions? inline;

  /// The line that moves while a turn runs — the last of all, when there is one (B-18).
  final Widget? working;

  /// What can be done from a prompt of the person — `null` where nothing can (B-24).
  final PromptActions? prompts;

  @override
  State<ConversationView> createState() => _ConversationViewState();
}

/// One row of the list: what keys it, and how it is drawn.
typedef _Row = ({String key, WidgetBuilder build, String? requestId});

class _ConversationViewState extends State<ConversationView> {
  final ScrollController _scroll = ScrollController();

  /// Whether the person is at the end — and so is followed as the conversation grows.
  bool _following = true;

  /// The rows of the last build — what going to a card that is not drawn yet looks through.
  List<_Row> _rows = const <_Row>[];

  /// The last message drawn when the person left the end — what the pill counts from. `null` at
  /// the end.
  String? _mark;

  /// Messages that arrived while the person read further up — what the pill says.
  int _unseen = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    widget.inline?.inView.navigator = _goTo;
    _toEnd();
  }

  @override
  void didUpdateWidget(ConversationView old) {
    super.didUpdateWidget(old);
    _rehome(old.inline?.inView);

    if (_following && _grew(old)) {
      _toEnd();
    } else if (widget.countsUnseen) {
      _unseen = countAfter(widget.conversation.entriesUnder(null), _mark);
    }
  }

  /// Hands the way to the cards to the tracker the screen holds now, if it changed.
  void _rehome(QuestionsInView? before) {
    final QuestionsInView? now = widget.inline?.inView;

    if (before != now) {
      before?.navigator = null;
      now?.navigator = _goTo;
    }
  }

  /// Whether the list got longer at its end: entries, the line of the turn, or a question.
  bool _grew(ConversationView old) =>
      old.conversation.entries != widget.conversation.entries ||
      (old.working == null) != (widget.working == null) ||
      old.inline?.queue.pending.length != widget.inline?.queue.pending.length;

  @override
  void dispose() {
    widget.inline?.inView.navigator = null;
    _scroll
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    _track();
    _measure();
  }

  /// Where the person is, read from the scroll itself rather than remembered: a person who drags
  /// back to the end is followed again without doing anything else.
  void _track() {
    if (!_scroll.hasClients) {
      return;
    }

    final ScrollPosition position = _scroll.position;
    final bool following = position.pixels >= position.maxScrollExtent - followSlack;

    // Leaving the end is where counting begins: from the last message there is now.
    if (_following && !following) {
      _mark = lastShown(widget.conversation.entriesUnder(null));
    }

    _following = following;

    // Back at the end by hand: what was new is seen.
    if (_following) {
      _seen();
    }
  }

  /// Nothing below is new any more.
  void _seen() {
    _mark = null;

    if (_unseen > 0) {
      setState(() => _unseen = 0);
    }
  }

  /// The pill was tapped: to the end, and followed from there.
  void _catchUp() {
    _seen();
    _following = true;
    _toEnd();
  }

  /// Tells the pill whether the card of any open question is out of view — scrolled away, or not
  /// drawn at all. A card partly in view is in view.
  void _measure() {
    final InlineQuestions? inline = widget.inline;
    final RenderObject? list = context.findRenderObject();

    if (inline == null || list is! RenderBox || !list.attached) {
      return;
    }

    final Rect view = list.localToGlobal(Offset.zero) & list.size;
    final bool away = inline.queue.pending.any((PermissionCard card) {
      // A card the lazy list let go of still has its node, and its context is gone with it.
      final BuildContext? context = inline.inView.cardOf(card.requestId);
      final RenderObject? drawn = context != null && context.mounted
          ? context.findRenderObject()
          : null;

      if (drawn is! RenderBox || !drawn.attached) {
        return true;
      }

      final Rect box = drawn.localToGlobal(Offset.zero) & drawn.size;
      return box.bottom <= view.top || box.top >= view.bottom;
    });

    inline.inView.report(outOfView: away);
  }

  /// Takes the person to the card of [requestId]: scrolled into view and focused — moving towards
  /// its row first when the list has not drawn it yet.
  void _goTo(String requestId, [int attempts = _approaches]) {
    final InlineQuestions? inline = widget.inline;
    final BuildContext? card = inline?.inView.cardOf(requestId);

    if (inline == null || attempts == 0) {
      return;
    }

    if (card != null && card.mounted) {
      Scrollable.ensureVisible(card, alignment: 0.1);
      inline.inView.focus(requestId);
      WidgetsBinding.instance.addPostFrameCallback((Duration _) => _onScroll());
      return;
    }

    final int at = _rows.indexWhere((_Row row) => row.requestId == requestId);

    if (at < 0 || !_scroll.hasClients) {
      return;
    }

    final ScrollPosition position = _scroll.position;
    position.jumpTo(position.maxScrollExtent * at / _rows.length);
    WidgetsBinding.instance.addPostFrameCallback((Duration _) => _goTo(requestId, attempts - 1));
  }

  /// Goes to the end once the frame is laid out — again while the end moves, because a lazy list
  /// only knows its true length once the last entries are built.
  void _toEnd([int attempts = 4]) {
    WidgetsBinding.instance.addPostFrameCallback((Duration _) {
      if (!mounted || !_scroll.hasClients || attempts == 0) {
        return;
      }

      final double end = _scroll.position.maxScrollExtent;

      if (_scroll.position.pixels < end) {
        _scroll.jumpTo(end);
        _following = true;
        _mark = null;
        _toEnd(attempts - 1);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final List<_Row> rows = _rowsOf(context);
    _rows = rows;

    // Where the cards are is known once they are laid out.
    WidgetsBinding.instance.addPostFrameCallback((Duration _) {
      if (mounted) {
        widget.inline?.inView.keepOnly(
          widget.inline!.queue.pending.map((PermissionCard card) => card.requestId),
        );
        _measure();
      }
    });

    final Widget list = ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(Tokens.spaceMd),
      itemCount: rows.length,
      itemBuilder: (BuildContext context, int index) {
        final _Row row = rows[index];

        return Padding(
          key: ValueKey<String>(row.key),
          padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
          child: row.build(context),
        );
      },
    );

    if (!widget.countsUnseen) {
      return list;
    }

    // Always the stack, pill or not: changing the tree around the list would build it again, and
    // the reader would lose the place they scrolled to.
    return Stack(
      children: <Widget>[
        list,
        if (_unseen > 0)
          Positioned(
            left: 0,
            right: 0,
            bottom: Tokens.spaceSm,
            child: Center(
              child: UnseenPill(count: _unseen, onTap: _catchUp),
            ),
          ),
      ],
    );
  }

  /// Every row, in order: the header, the top-level entries (never a subagent's own — S-68), the
  /// questions whose tool is not a line yet, and the line of the turn that runs.
  List<_Row> _rowsOf(BuildContext context) {
    final Widget? header = widget.header;
    final Widget? working = widget.working;
    final InlineQuestions? inline = widget.inline;
    final List<ConversationEntry> entries = widget.conversation.entriesUnder(null);
    // Every tool's line, at any depth (plan 26, B-19) — a subagent's own tool is drawn nested, not
    // here, but it is still drawn: the tail fallback below must not also offer it (S-63).
    final Set<String> drawn = <String>{
      for (final ToolExecution tool in widget.conversation.tools) tool.toolUseId,
    };
    final String folder = widget.conversation.facts.workspacePath ?? '';
    final String? engine = widget.conversation.facts.engine;

    return <_Row>[
      if (header != null) (key: 'header', build: (BuildContext _) => header, requestId: null),
      for (final ConversationEntry entry in entries)
        _entryRow(entry, inline, folder: folder, engine: engine),
      // Asked before the line of its tool arrived: at the tail, in view, until the line takes it to
      // its place — never drawn twice (S-63).
      if (inline != null)
        for (final PermissionCard card in inline.queue.pending)
          if (!drawn.contains(card.request.toolUseId))
            (
              key: 'question:${card.requestId}',
              build: (BuildContext context) => Semantics(
                container: true,
                label: AppLocalizations.of(context).sessionInlineTail,
                child: _InlineCard(card: card, inline: inline),
              ),
              requestId: card.requestId,
            ),
      if (working != null) (key: 'working', build: (BuildContext _) => working, requestId: null),
    ];
  }

  _Row _entryRow(
    ConversationEntry entry,
    InlineQuestions? inline, {
    required String folder,
    required String? engine,
  }) => (
    key: entry.entryId,
    build: (BuildContext _) => _drawEntry(
      entry,
      (
        conversation: widget.conversation,
        inline: inline,
        folder: folder,
        engine: engine,
        prompts: widget.prompts,
        conversationKey: widget.conversationKey,
      ),
      showsAuthor: _authorsOf(widget.conversation.entriesUnder(null)),
      subagent: null,
    ),
    requestId: entry is ToolExecution ? inline?.cardFor(entry.toolUseId)?.requestId : null,
  );
}

/// The context every drawing function below needs, bundled so the recursion through a subagent's
/// own children (plan 26, B-19…B-21) passes one thing instead of six — `conversation` is the one
/// field that changes between the main transcript and a reopened subagent's own history.
typedef _RenderScope = ({
  Conversation conversation,
  InlineQuestions? inline,
  String folder,
  String? engine,
  PromptActions? prompts,
  ConversationKey? conversationKey,
});

/// [entry], as the question about it (when one is still open) or as what it is — recursed into, for
/// an `agent`-kind tool, over its own children (plan 26, B-19, B-21): the same draw, the same
/// lookups, at every depth, with no limit (D-20).
Widget _drawEntry(
  ConversationEntry entry,
  _RenderScope scope, {
  required Set<String> showsAuthor,
  required String? subagent,
}) {
  final PermissionCard? card = entry is ToolExecution
      ? scope.inline?.cardFor(entry.toolUseId)
      : null;

  if (card != null && scope.inline != null) {
    return _InlineCard(card: card, inline: scope.inline!, subagent: subagent);
  }

  return EntryView(
    entry: entry,
    decision: entry is ToolExecution ? scope.inline?.decisionFor(entry.toolUseId) : null,
    prompts: scope.prompts,
    conversationKey: scope.conversationKey,
    sessionId: scope.inline?.sessionId,
    folder: scope.folder,
    engine: scope.engine,
    showsAuthor: entry is StreamMessage && showsAuthor.contains(entry.messageId),
    nested: _nestedOf(entry, scope),
  );
}

/// [entry]'s own children, when it is an `agent`-kind tool — otherwise none. The children's own
/// cards name this subagent by its type (plan 26, B-21) — never by its own name for the subagent,
/// which this build does not read.
List<Widget> _nestedOf(ConversationEntry entry, _RenderScope scope) =>
    entry is ToolExecution && entry.call.kind == 'agent'
    ? _subagentOf(entry.toolUseId, scope, subagent: entry.call.label.params['type'] as String?)
    : const <Widget>[];

/// What a subagent's card nests: its own entries, already live in [_RenderScope.conversation] — or,
/// when the stream never carried any of it (the card is being reopened from the history), a read of
/// its own (plan 26, B-20), exactly as the web only asks the route when nothing of the subagent
/// streamed.
List<Widget> _subagentOf(String toolUseId, _RenderScope scope, {required String? subagent}) {
  if (scope.conversation.entriesUnder(toolUseId).isNotEmpty) {
    return _nestedRows(toolUseId, scope, subagent: subagent);
  }

  final ConversationKey? key = scope.conversationKey;

  return <Widget>[
    if (key != null)
      _SubagentHistoryView(
        conversation: key,
        toolUseId: toolUseId,
        inline: scope.inline,
        folder: scope.folder,
        engine: scope.engine,
        prompts: scope.prompts,
        subagent: subagent,
      ),
  ];
}

/// The children of [parent]'s subagent, each drawn the same way a top-level entry would be
/// (plan 26, B-19) — the subagent's own author runs computed over its own entries only, never mixed
/// with the main conversation's. [subagent] names [parent] for a permission card among them
/// (plan 26, B-21) — never for [parent] itself, whose own card is not inside anything.
List<Widget> _nestedRows(String parent, _RenderScope scope, {required String? subagent}) {
  final List<ConversationEntry> children = scope.conversation.entriesUnder(parent);
  final Set<String> showsAuthor = _authorsOf(children);

  return <Widget>[
    for (final ConversationEntry child in children)
      KeyedSubtree(
        key: ValueKey<String>(child.entryId),
        child: _drawEntry(child, scope, showsAuthor: showsAuthor, subagent: subagent),
      ),
  ];
}

/// A subagent's own entries, read from the history (plan 26, B-20) — only ever mounted when the
/// live stream carried none of it, so reopening a finished subagent's card shows what it said rather
/// than an empty one.
class _SubagentHistoryView extends ConsumerWidget {
  const _SubagentHistoryView({
    required this.conversation,
    required this.toolUseId,
    required this.inline,
    required this.folder,
    required this.engine,
    required this.prompts,
    required this.subagent,
  });

  final ConversationKey conversation;
  final String toolUseId;
  final InlineQuestions? inline;
  final String folder;
  final String? engine;
  final PromptActions? prompts;

  /// Names this subagent for a permission card among its own, read from the history (plan 26,
  /// B-21).
  final String? subagent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<SubagentPage> result = ref.watch(
      subagentHistoryControllerProvider(conversation, toolUseId),
    );
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Semantics(
      container: true,
      label: l10n.sessionSubagentLabel,
      child: result.when(
        loading: () =>
            Text(l10n.sessionSubagentLoading, style: Theme.of(context).textTheme.bodySmall),
        error: (Object error, StackTrace _) => RetryLine(
          message: failureText(context, asFailure(error)),
          onRetry: () =>
              ref.read(subagentHistoryControllerProvider(conversation, toolUseId).notifier).retry(),
        ),
        data: (SubagentPage page) {
          final Conversation read = const Conversation().withHistory(page.events);

          return read.entriesUnder(toolUseId).isEmpty
              ? Text(l10n.sessionSubagentNothing, style: Theme.of(context).textTheme.bodySmall)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: _nestedRows(toolUseId, (
                    conversation: read,
                    inline: inline,
                    folder: folder,
                    engine: engine,
                    prompts: prompts,
                    conversationKey: conversation,
                  ), subagent: subagent),
                );
        },
      ),
    );
  }
}

/// The messages that show their author — "You"/the agent's name — at the top (plan 22 · D-16; plan
/// 26, B-11): the first message of a run by the same role, a run a tool round-trip does not break.
Set<String> _authorsOf(List<ConversationEntry> entries) {
  final Set<String> shown = <String>{};
  // `null`: nobody has said anything in this run yet — the next message of either role announces
  // itself. `true`/`false`: the person, or the model, said the last visible thing.
  bool? saidUser;

  for (final ConversationEntry entry in entries) {
    switch (entry) {
      case StreamMessage(:final String messageId, :final bool isFromUser):
        final bool visible = entry.blocks.isNotEmpty || entry.streaming != null;
        if (visible) {
          if (isFromUser || saidUser != false) {
            shown.add(messageId);
          }
          saidUser = isFromUser;
        }
      case ToolExecution():
        break;
      default:
        saidUser = null;
    }
  }

  return shown;
}

/// Whether [entry] is a message a person sees: what was said, with something drawn — text, an
/// image, or a fragment still arriving —, or what was thought. A tool call is not one (S-84).
String? _shownMessage(ConversationEntry entry) => switch (entry) {
  StreamMessage(:final String messageId, :final List<MessageBlock> blocks, :final String? streaming)
      when blocks.isNotEmpty || streaming != null =>
    messageId,
  ThinkingEntry(:final String messageId) => messageId,
  _ => null,
};

/// The messages a person sees, in the order they first appear — one each, however many entries
/// they are drawn as.
List<String> _shownMessages(List<ConversationEntry> entries) =>
    entries.map(_shownMessage).nonNulls.toSet().toList(growable: false);

/// The last message a person sees in [entries], or `null` with none.
String? lastShown(List<ConversationEntry> entries) => _shownMessages(entries).lastOrNull;

/// How many messages a person sees came after [mark] — the last one there was when they left the
/// end. None without a mark, or when the mark is no longer there (the conversation was read again).
int countAfter(List<ConversationEntry> entries, String? mark) {
  final List<String> shown = _shownMessages(entries);
  final int at = mark == null ? -1 : shown.indexOf(mark);

  return at < 0 ? 0 : shown.length - 1 - at;
}

/// "*N* new", over a followed conversation scrolled up: what arrived below, and the way to it. It
/// is announced as the count changes, without taking the focus.
class UnseenPill extends StatelessWidget {
  const UnseenPill({required this.count, required this.onTap, super.key});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String newer = count == 1 ? l10n.historyFollowNewerOne : l10n.historyFollowNewer(count);

    return Semantics(
      liveRegion: true,
      child: ActionChip(
        avatar: const Icon(Icons.arrow_downward),
        label: Text(newer),
        tooltip: l10n.historyFollowNewerLabel(newer),
        onPressed: onTap,
      ),
    );
  }
}

/// A question, whole, in the conversation: the card of plan 02 — or the plan to approve —, with
/// nothing cut and nothing changed, standing where the line of its tool would be (B-20, B-21).
class _InlineCard extends StatelessWidget {
  const _InlineCard({required this.card, required this.inline, this.subagent});

  final PermissionCard card;
  final InlineQuestions inline;

  /// The subagent this card's tool belongs to, by its type — `null` at the top level (plan 26,
  /// B-21).
  final String? subagent;

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: inline.inView.nodeFor(card.requestId),
    child: PermissionPanel(
      sessionId: inline.sessionId,
      card: card,
      now: inline.queue.asOf ?? DateTime.now(),
      modes: inline.modes,
      onPlanApproved: inline.onPlanApproved,
      subagent: subagent,
    ),
  );
}

/// One entry, drawn as what it is.
class EntryView extends StatelessWidget {
  const EntryView({
    required this.entry,
    super.key,
    this.decision,
    this.prompts,
    this.conversationKey,
    this.sessionId,
    this.folder = '',
    this.engine,
    this.showsAuthor = false,
    this.nested = const <Widget>[],
  });

  final ConversationEntry entry;

  /// The conversation a tool's output and a prompt's image are read from.
  final ConversationKey? conversationKey;

  /// The live session a tool's diff is read from (plan 26, B-16) — `null` reading the history, where
  /// the route this build reads is not offered.
  final String? sessionId;

  /// How the question about this tool was settled, when it is a tool that asked.
  final PermissionOutcome? decision;

  /// What can be done from a prompt of the person.
  final PromptActions? prompts;

  /// Where the session runs — for a file-path-like run of text in a message (plan 26, B-10).
  final String folder;

  /// The session's engine — for the author label, by its display name (plan 26, B-11).
  final String? engine;

  /// Whether a [StreamMessage] shows its author, at the start of a run of the same one (plan 22 ·
  /// D-16).
  final bool showsAuthor;

  /// A subagent's own entries, already drawn — recursed, the same way, as far down as the
  /// conversation goes (plan 26, B-19, D-20). Empty for every tool but the one that opened a
  /// subagent.
  final List<Widget> nested;

  @override
  Widget build(BuildContext context) => switch (entry) {
    final StreamMessage message => _message(message),
    final ThinkingEntry thinking => ThinkingLine(thinking: thinking),
    final ToolExecution tool => ToolCard(
      tool: tool,
      decision: decision,
      conversationKey: conversationKey,
      sessionId: sessionId,
      nested: nested,
    ),
    final TurnSummary turn => TurnLine(turn: turn),
    final CompactionLine compaction => CompactedLine(line: compaction),
    final RewoundLine rewound => RewoundRow(line: rewound),
    ReplayGapLine() => const ReplayGapRow(),
  };

  Widget _message(StreamMessage message) {
    final PromptActions? actions = prompts;
    final Widget bubble = MessageBubble(
      message: message,
      conversationKey: conversationKey,
      folder: folder,
      engine: engine,
      showsAuthor: showsAuthor,
    );

    // A prompt of the person, whole, is what an action can start from: the one still arriving has
    // no id in the engine's store yet. Every other message still copies on a long press (B-11).
    return actions != null && message.isFromUser && message.isComplete
        ? PromptHold(prompt: message, actions: actions, child: bubble)
        : MessageCopyHold(message: message, child: bubble);
  }
}

/// One message. Still streaming, or whole — blocks in the order the model gave them, no empty
/// bubble for a prompt of only an image (plan 22, S-118, S-121; plan 26, B-09, B-10).
class MessageBubble extends StatelessWidget {
  const MessageBubble({
    required this.message,
    super.key,
    this.conversationKey,
    this.folder = '',
    this.engine,
    this.showsAuthor = false,
  });

  final StreamMessage message;

  /// The conversation an image of the prompt is read from.
  final ConversationKey? conversationKey;

  /// Where the session runs — for a file-path-like run of text in the message (plan 26, B-10).
  final String folder;

  /// The session's engine — for the author label (plan 26, B-11).
  final String? engine;

  /// Whether this message shows its author, at the start of a run of the same one (plan 22 · D-16).
  final bool showsAuthor;

  @override
  Widget build(BuildContext context) {
    final bool hasHeaderRow = showsAuthor || !message.isFromUser;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String author = message.isFromUser
        ? l10n.sessionMessageAuthorYou
        : l10n.sessionMessageAuthorAgent(agentNameIn(context, engine));
    final ThemeData theme = Theme.of(context);

    return Align(
      alignment: message.isFromUser
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: Card(
        color: message.isFromUser ? theme.colorScheme.secondaryContainer : null,
        child: Padding(
          padding: const EdgeInsets.all(Tokens.spaceMd),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (hasHeaderRow)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    if (showsAuthor)
                      Expanded(child: Text(author, style: theme.textTheme.labelMedium)),
                    if (!message.isFromUser)
                      IconButton(
                        icon: const Icon(Icons.copy_outlined, size: Tokens.spaceLg),
                        tooltip: l10n.sessionMessageCopy,
                        onPressed: () => unawaited(copyMessage(context, message.text)),
                      ),
                  ],
                ),
              for (final MessageBlock block in message.blocks) _block(context, block),
              if (message.streaming != null)
                _ThrottledMarkdown(data: message.streaming!, bubble: this),
            ],
          ),
        ),
      ),
    );
  }

  Widget _block(BuildContext context, MessageBlock block) => switch (block) {
    TextBlock(:final String text) => _MessageMarkdown(data: text, bubble: this),
    ImageBlock(:final PromptImage image) => ImageMarker(
      image: image,
      conversationKey: conversationKey,
    ),
  };
}

/// One text block of a [MessageBubble], with the folder's file links wired in (plan 26, B-10).
class _MessageMarkdown extends StatelessWidget {
  const _MessageMarkdown({required this.data, required this.bubble});

  final String data;
  final MessageBubble bubble;

  @override
  Widget build(BuildContext context) => SafeMarkdown(
    data: data,
    shrinkWrap: true,
    fileLinkOf: bubble.folder.isEmpty
        ? null
        : (String text) => fileLinkOf(text, bubble.folder)?.record,
    onRelativeLink: bubble.folder.isEmpty
        ? null
        : (String path, {String? anchor, int? line}) =>
              unawaited(_openFolderFile(context, bubble.folder, path, line: line)),
  );
}

/// Opens [path] of [folder] in the viewer, at [line] when a file-path-like mention named one
/// (plan 26, B-10) — the one the app's own message links and file-path recognitions both lead to.
Future<void> _openFolderFile(BuildContext context, String folder, String path, {int? line}) =>
    context.push<void>(viewerRouteFor(folder, path, line: line));

/// How often the streaming block's markdown reparses — at most (plan 26, D-02, D-14): a delta every
/// 5 ms would otherwise reparse the whole block that many times a second.
const Duration _streamingMarkdownThrottle = Duration(milliseconds: 100);

/// The block still arriving: reparsed at most every [_streamingMarkdownThrottle], so a flood of
/// deltas costs one rebuild per window instead of one each — the final text is always the complete
/// one, since the last scheduled rebuild always runs.
class _ThrottledMarkdown extends StatefulWidget {
  const _ThrottledMarkdown({required this.data, required this.bubble});

  final String data;
  final MessageBubble bubble;

  @override
  State<_ThrottledMarkdown> createState() => _ThrottledMarkdownState();
}

class _ThrottledMarkdownState extends State<_ThrottledMarkdown> {
  late String _shown = widget.data;
  Timer? _pending;

  @override
  void didUpdateWidget(_ThrottledMarkdown old) {
    super.didUpdateWidget(old);
    if (widget.data == _shown) {
      return;
    }
    _pending ??= Timer(_streamingMarkdownThrottle, _flush);
  }

  void _flush() {
    _pending = null;
    if (mounted && widget.data != _shown) {
      setState(() => _shown = widget.data);
    }
  }

  @override
  void dispose() {
    _pending?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _MessageMarkdown(data: _shown, bubble: widget.bubble);
}
