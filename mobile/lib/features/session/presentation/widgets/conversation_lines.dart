/// The lines of the conversation that are not something said: the end of a turn, the point where
/// the conversation was compacted, where the files went back, and where a partial replay begins. One
/// line each, quiet, in the place they happened (plan 10, B-23).
library;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// What a finished turn cost, and how long it took.
///
/// Shown rather than kept for a report: this is somebody's own money, spent by a process they
/// started from a phone, and it should not take a dashboard to find out.
class TurnLine extends StatelessWidget {
  const TurnLine({required this.turn, super.key});

  final TurnSummary turn;

  @override
  Widget build(BuildContext context) => _Line(
    AppLocalizations.of(
      context,
    ).sessionTurnLine(turn.costUsd, (turn.durationMs / 1000).toStringAsFixed(1)),
  );
}

/// Where the conversation was compacted, and how.
class CompactedLine extends StatelessWidget {
  const CompactedLine({required this.line, super.key});

  final CompactionLine line;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final int? tokens = line.preTokens;
    final String? size = tokens == null
        ? null
        : NumberFormat.decimalPattern(
            Localizations.localeOf(context).toLanguageTag(),
          ).format(tokens);

    return _Line(switch ((line.isManual, size)) {
      (true, null) => l10n.sessionCompactedManual,
      (false, null) => l10n.sessionCompactedAuto,
      (true, final String size?) => l10n.sessionCompactedManualTokens(size),
      (false, final String size?) => l10n.sessionCompactedAutoTokens(size),
    });
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

/// What is on screen is only what the replay still held.
class ReplayGapRow extends StatelessWidget {
  const ReplayGapRow({super.key});

  @override
  Widget build(BuildContext context) => _Line(AppLocalizations.of(context).sessionReplayPartial);
}

/// One line of the conversation that is about it rather than in it.
class _Line extends StatelessWidget {
  const _Line(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    maxLines: 2,
    overflow: TextOverflow.ellipsis,
    style: Theme.of(
      context,
    ).textTheme.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
  );
}
