/// The lines of the conversation that are not something said: the end of a turn, the point where
/// the conversation was compacted, where the files went back, and where a partial replay begins. One
/// line each, quiet, in the place they happened (plan 10, B-23).
library;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:remote_claude/core/widgets/markdown/safe_markdown.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/fold_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// What a finished turn cost, when its engine says, and how long it took.
///
/// Shown rather than kept for a report: this is somebody's own money, spent by a process they
/// started from a phone, and it should not take a dashboard to find out.
///
/// A turn that did not end in [TurnOutcome.completed] says so instead of the line above — its own
/// `usage` and `durationMs` are what the engine reports for that outcome, which a crash may leave
/// zeroed, and a line that showed them next to a real-looking cost would read as an answer nobody
/// gave (plan 27, B-10).
class TurnLine extends StatelessWidget {
  const TurnLine({required this.turn, super.key});

  final TurnSummary turn;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    if (turn.outcome != TurnOutcome.completed) {
      return _Line(_outcomeTextOf(l10n, turn.outcome));
    }

    final String seconds = (turn.durationMs / 1000).toStringAsFixed(1);
    final String? cost = turn.costUsd;
    final String locale = Localizations.localeOf(context).toLanguageTag();

    // No cost said is no cost shown — never "0", which is a cost the engine did report (S-86, S-87).
    final String base = cost == null
        ? l10n.sessionTurnLineNoCost(seconds)
        : l10n.sessionTurnLine(cost, seconds);
    final String tokens = _tokensOf(l10n, turn, locale) ?? l10n.sessionTurnNoTokens;

    return _Line('$base · $tokens');
  }
}

/// The words of a turn's outcome, when it is not [TurnOutcome.completed].
String _outcomeTextOf(AppLocalizations l10n, TurnOutcome outcome) => switch (outcome) {
  TurnOutcome.completed => '',
  TurnOutcome.limitReached => l10n.sessionTurnOutcomeLimitReached,
  TurnOutcome.budgetExceeded => l10n.sessionTurnOutcomeBudgetExceeded,
  TurnOutcome.failed => l10n.sessionTurnOutcomeFailed,
  TurnOutcome.cancelled => l10n.sessionTurnOutcomeCancelled,
};

/// The input, output and cache tokens of [turn], as the web's `TurnRow` joins them — `null` when the
/// engine reported none at all (plan 26, B-17, S-61, S-62). A field it did not report, or sent as
/// something other than a number, is left out rather than drawn as zero — the mapper already turned
/// that into an absent field.
String? _tokensOf(AppLocalizations l10n, TurnSummary turn, String locale) {
  final NumberFormat count = NumberFormat.decimalPattern(locale);
  final int? cache = switch ((turn.cacheReadTokens, turn.cacheWriteTokens)) {
    (null, null) => null,
    (final int? read, final int? write) => (read ?? 0) + (write ?? 0),
  };
  final List<String> parts = <String>[
    if (turn.inputTokens case final int tokens?) l10n.sessionTurnTokensIn(count.format(tokens)),
    if (turn.outputTokens case final int tokens?) l10n.sessionTurnTokensOut(count.format(tokens)),
    if (cache case final int tokens?) l10n.sessionTurnTokensCache(count.format(tokens)),
  ];

  return parts.isEmpty ? null : parts.join(', ');
}

/// Where the conversation was compacted, and how.
class CompactedLine extends StatefulWidget {
  const CompactedLine({required this.line, super.key});

  final CompactionLine line;

  @override
  State<CompactedLine> createState() => _CompactedLineState();
}

class _CompactedLineState extends State<CompactedLine> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final CompactionLine line = widget.line;
    final int? tokens = line.preTokens;
    final String? size = tokens == null
        ? null
        : NumberFormat.decimalPattern(
            Localizations.localeOf(context).toLanguageTag(),
          ).format(tokens);
    final String title = switch ((line.isManual, size)) {
      (true, null) => l10n.sessionCompactedManual,
      (false, null) => l10n.sessionCompactedAuto,
      (true, final String size?) => l10n.sessionCompactedManualTokens(size),
      (false, final String size?) => l10n.sessionCompactedAutoTokens(size),
    };
    final String? summary = line.summary;

    if (summary == null) {
      return _Line(title);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        FoldLine(
          open: _open,
          onToggle: () {
            setState(() {
              _open = !_open;
            });
          },
          title: Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: _quietLineStyle(context),
          ),
          trailing: Text(l10n.sessionCompactedSummary, style: _quietLineStyle(context)),
        ),
        if (_open)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 12),
            child: SafeMarkdown(data: summary, shrinkWrap: true),
          ),
      ],
    );
  }
}

/// Where the files of the session went back: how many went back, stayed and failed. File by file is
/// the undo sheet's.
class RewoundRow extends StatelessWidget {
  const RewoundRow({required this.line, super.key});

  final RewoundLine line;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return _Line(
      line.failed > 0
          ? l10n.sessionRewoundFailed('${line.restored}', '${line.kept}', '${line.failed}')
          : l10n.sessionRewoundSummary('${line.restored}', '${line.kept}'),
    );
  }
}

/// What the agent put in the conversation itself, as its own quiet line — never a message bubble
/// (plan 27, F6 · B-21). The client picks it by `injectedKind`, never by the name of the tool that
/// owns it.
class InjectedRow extends StatelessWidget {
  const InjectedRow({required this.line, super.key});

  final InjectedLine line;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return _Line(
      line.injectedKind == 'instructions'
          ? l10n.sessionInjectedInstructions(line.name ?? '')
          : l10n.sessionInjectedOther,
    );
  }
}

/// What is on screen is only what the replay still held.
class ReplayGapRow extends StatelessWidget {
  const ReplayGapRow({super.key});

  @override
  Widget build(BuildContext context) => _Line(AppLocalizations.of(context).sessionReplayPartial);
}

/// The quiet, muted style every line about the conversation (rather than in it) reads in.
TextStyle? _quietLineStyle(BuildContext context) => Theme.of(
  context,
).textTheme.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);

/// One line of the conversation that is about it rather than in it.
class _Line extends StatelessWidget {
  const _Line(this.text);

  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: _quietLineStyle(context));
}

/// The label of a `session.notice`, by its own `kind` — every one of the eleven named kinds this
/// build knows (D-10, `unknown` excepted — that one is [AppLocalizations.sessionNoticeKindUnknown]).
const Map<String, String Function(AppLocalizations)> _noticeKindLabel =
    <String, String Function(AppLocalizations)>{
      'command.output': _kindCommandOutput,
      'agent.info': _kindAgentInfo,
      'agent.notification': _kindAgentNotification,
      'agent.stopping': _kindAgentStopping,
      'model.switched': _kindModelSwitched,
      'model.refused': _kindModelRefused,
      'request.retrying': _kindRequestRetrying,
      'usage.limited': _kindUsageLimited,
      'turn.failed': _kindTurnFailed,
      'compaction.failed': _kindCompactionFailed,
      'auth.failed': _kindAuthFailed,
    };

String _kindCommandOutput(AppLocalizations l10n) => l10n.sessionNoticeKindCommandOutput;
String _kindAgentInfo(AppLocalizations l10n) => l10n.sessionNoticeKindAgentInfo;
String _kindAgentNotification(AppLocalizations l10n) => l10n.sessionNoticeKindAgentNotification;
String _kindAgentStopping(AppLocalizations l10n) => l10n.sessionNoticeKindAgentStopping;
String _kindModelSwitched(AppLocalizations l10n) => l10n.sessionNoticeKindModelSwitched;
String _kindModelRefused(AppLocalizations l10n) => l10n.sessionNoticeKindModelRefused;
String _kindRequestRetrying(AppLocalizations l10n) => l10n.sessionNoticeKindRequestRetrying;
String _kindUsageLimited(AppLocalizations l10n) => l10n.sessionNoticeKindUsageLimited;
String _kindTurnFailed(AppLocalizations l10n) => l10n.sessionNoticeKindTurnFailed;
String _kindCompactionFailed(AppLocalizations l10n) => l10n.sessionNoticeKindCompactionFailed;
String _kindAuthFailed(AppLocalizations l10n) => l10n.sessionNoticeKindAuthFailed;

/// What a `messageKey` the backend sent renders as, with its `params` — the client's half of the
/// contract's own rule (`code` + `messageKey` + `params`, never a hardcoded string). A key this
/// build does not have a renderer for — a future one — reads as the key itself: still something,
/// never a crash (forward compatibility, the same rule an unrecognised `kind` gets).
String _bodyOfMessageKey(AppLocalizations l10n, String key, Map<String, Object?> params) =>
    switch (key) {
      'sessions.notice.modelSwitched' => l10n.sessionNoticeModelSwitched(
        '${params['to']}',
        '${params['from']}',
      ),
      'sessions.notice.requestRetrying' => l10n.sessionNoticeRequestRetrying(
        '${params['attempt']}',
        '${params['maxAttempts']}',
      ),
      'sessions.notice.usageLimited' => l10n.sessionNoticeUsageLimited('${params['status']}'),
      'sessions.notice.agentStopping' => l10n.sessionNoticeAgentStopping('${params['reason']}'),
      'sessions.notice.memoryRecalled' => l10n.sessionNoticeMemoryRecalled,
      'sessions.notice.conversationReset' => l10n.sessionNoticeConversationReset,
      _ => key,
    };

/// The title of a notice line: what a client-synthesised line says went wrong (U-06, U-07, U-09), or
/// the notice's own kind, translated — `unknown` for one this build has no line for (B-13, U-11
/// alike).
String _noticeTitle(AppLocalizations l10n, NoticeLine line) {
  final String detail = line.detail ?? '';

  switch (line.reason) {
    case GenericReason.unknownEvent:
      return l10n.sessionNoticeReasonUnknownEvent(detail);
    case GenericReason.unknownValue:
      return l10n.sessionNoticeReasonUnknownValue(detail);
    case GenericReason.malformed:
      return l10n.sessionNoticeReasonMalformed(detail);
    case null:
      final String Function(AppLocalizations)? labelOf = _noticeKindLabel[line.kind];
      return labelOf == null ? l10n.sessionNoticeKindUnknown(detail) : labelOf(l10n);
  }
}

/// The body of a notice: what the backend meant to say, translated through its `messageKey`, or its
/// own untrusted prose — never both (the contract keeps the two mutually exclusive). `null` for a
/// line with neither, which opens to nothing.
String? _noticeBody(AppLocalizations l10n, NoticeLine line) {
  final String? key = line.messageKey;

  if (key != null) {
    return _bodyOfMessageKey(l10n, key, line.params ?? const <String, Object?>{});
  }

  final String? text = line.text;
  return text == null || text.isEmpty ? null : text;
}

/// The colour a notice's level reads in — `info`/`notice` as quiet as every other system row;
/// `warning` and `error` stand out, the same tokens the rest of the app uses for them.
Color _noticeColor(BuildContext context, NoticeLevel level) {
  final ColorScheme scheme = Theme.of(context).colorScheme;

  return switch (level) {
    NoticeLevel.info || NoticeLevel.notice => scheme.onSurfaceVariant,
    NoticeLevel.warning => scheme.tertiary,
    NoticeLevel.error => scheme.error,
  };
}

/// A `session.notice`, or the generic line this build draws in its place (plan 27, F6 · B-19, B-20):
/// one row for both, the same the discovery itself asks for — a line genuinely unknown to a published
/// client is not a different kind of thing from one the backend itself could not place. `info` reads
/// collapsed, like every other system row; `warning` and `error` stand out by colour, never by moving
/// in the list. The body opens on demand — `command.output`'s own, agent prose, is the one kind drawn
/// through [SafeMarkdown]; everything else, including a notice this build does not recognise, is
/// plain text. A notice from inside a subagent nests under it, like a message or a tool (its own
/// `parentToolUseId`, read the same way `Conversation.entriesUnder` reads a tool's or a message's).
class NoticeRow extends StatefulWidget {
  const NoticeRow({required this.line, super.key});

  final NoticeLine line;

  @override
  State<NoticeRow> createState() => _NoticeRowState();
}

class _NoticeRowState extends State<NoticeRow> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final NoticeLine line = widget.line;
    final Color color = _noticeColor(context, line.level);
    final String title = _noticeTitle(l10n, line);
    final String? body = _noticeBody(l10n, line);
    final TextStyle? style = Theme.of(context).textTheme.labelSmall?.copyWith(color: color);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        InkWell(
          onTap: body == null
              ? null
              : () {
                  setState(() {
                    _open = !_open;
                  });
                },
          child: Row(
            children: <Widget>[
              Expanded(
                child: Text(title, style: style, maxLines: 2, overflow: TextOverflow.ellipsis),
              ),
              if (line.count > 1) Text(l10n.sessionNoticeRepeated(line.count), style: style),
            ],
          ),
        ),
        if (_open && body != null)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 12, top: 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                line.kind == 'command.output'
                    ? SafeMarkdown(data: body, shrinkWrap: true)
                    : SelectableText(body, style: Theme.of(context).textTheme.bodySmall),
                if (line.truncated)
                  Text(l10n.sessionNoticeTruncated, style: _quietLineStyle(context)),
              ],
            ),
          ),
      ],
    );
  }
}
