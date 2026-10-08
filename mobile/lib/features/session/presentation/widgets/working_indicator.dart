/// The last line of the conversation while a turn runs (plan 10, B-18): our asterisk, what Claude is
/// doing — the tool it runs, that it waits for the person, or the verb of the turn — and for how
/// long. It shows that something is happening when nothing new has arrived; once the turn ends it is
/// gone, and the summary of the turn stands where it was (S-54).
///
/// The glyph moves only for who has not asked the system for less motion (S-57). What is announced
/// is the **change** of what Claude does, never the clock: the clock lives in this widget alone, so
/// neither the conversation nor the screen reader hears every second (S-56, R-06).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The verbs a turn draws from (09 · D-16) — the same twenty as the web, in the same order, so the
/// same turn draws the same verb on both ends. `pnpm i18n:check` holds their texts equal.
const List<String> workingVerbs = <String>[
  'pondering',
  'deciphering',
  'mulling',
  'reasoning',
  'weighing',
  'sketching',
  'untangling',
  'assembling',
  'tinkering',
  'exploring',
  'connecting',
  'distilling',
  'brewing',
  'crafting',
  'investigating',
  'puzzling',
  'considering',
  'computing',
  'working',
  'musing',
];

/// The verb of one turn: drawn from what names the turn — the session and how many turns ended
/// before it —, never from the clock. The same turn draws the same verb however often it is drawn
/// again, after a rebuild or the app coming back from the background (S-58); the next turn may draw
/// another. The hash is the web's.
String verbOf(String turn) {
  int hash = 0;

  for (final int unit in turn.codeUnits) {
    hash = (hash * 31 + unit) % 2147483647;
  }

  return workingVerbs[hash % workingVerbs.length];
}

/// What names the turn running now in [sessionId].
String turnKeyOf(String sessionId, Conversation conversation) =>
    '$sessionId:${conversation.turns.length}';

/// The words of a verb.
String verbText(AppLocalizations l10n, String verb) => switch (verb) {
  'pondering' => l10n.sessionWorkingVerbPondering,
  'deciphering' => l10n.sessionWorkingVerbDeciphering,
  'mulling' => l10n.sessionWorkingVerbMulling,
  'reasoning' => l10n.sessionWorkingVerbReasoning,
  'weighing' => l10n.sessionWorkingVerbWeighing,
  'sketching' => l10n.sessionWorkingVerbSketching,
  'untangling' => l10n.sessionWorkingVerbUntangling,
  'assembling' => l10n.sessionWorkingVerbAssembling,
  'tinkering' => l10n.sessionWorkingVerbTinkering,
  'exploring' => l10n.sessionWorkingVerbExploring,
  'connecting' => l10n.sessionWorkingVerbConnecting,
  'distilling' => l10n.sessionWorkingVerbDistilling,
  'brewing' => l10n.sessionWorkingVerbBrewing,
  'crafting' => l10n.sessionWorkingVerbCrafting,
  'investigating' => l10n.sessionWorkingVerbInvestigating,
  'puzzling' => l10n.sessionWorkingVerbPuzzling,
  'considering' => l10n.sessionWorkingVerbConsidering,
  'computing' => l10n.sessionWorkingVerbComputing,
  'musing' => l10n.sessionWorkingVerbMusing,
  _ => l10n.sessionWorkingVerbWorking,
};

/// What the line says Claude is doing — and what is announced, only when it changes.
///
/// Waiting on the person first, then the tool of the main conversation that runs, then the verb of
/// the turn.
String workingLabel(
  AppLocalizations l10n, {
  required SessionStatus status,
  required String turn,
  String? tool,
  int waiting = 0,
  bool questionsOnly = false,
}) {
  if (status == SessionStatus.waitingPermission || waiting > 0) {
    // A question of Claude says it is one, never what it asks (plan 24, B-20).
    return questionsOnly ? l10n.permissionQuestionWaiting : l10n.sessionWorkingWaiting;
  }

  return status == SessionStatus.running && tool != null
      ? l10n.sessionWorkingRunningTool(tool)
      : verbText(l10n, verbOf(turn));
}

/// How long the turn has run: seconds, then minutes and seconds.
String elapsedText(AppLocalizations l10n, Duration elapsed) {
  final int seconds = elapsed.isNegative ? 0 : elapsed.inSeconds;

  return seconds < 60
      ? l10n.sessionWorkingSeconds('$seconds')
      : l10n.sessionWorkingMinutes('${seconds ~/ 60}', (seconds % 60).toString().padLeft(2, '0'));
}

/// The line of a turn that runs.
class WorkingIndicator extends StatefulWidget {
  const WorkingIndicator({
    required this.label,
    super.key,
    this.since,
    this.onGoToRequest,
    this.clock = DateTime.now,
  });

  /// What Claude is doing, in words ([workingLabel]).
  final String label;

  /// When the turn began, by the server's clock — `null` when the stream did not say: the clock
  /// then counts from when this line appeared.
  final DateTime? since;

  /// Takes the person to the oldest question — present only while one waits (S-55).
  final VoidCallback? onGoToRequest;

  /// What "now" is, so a test can move it.
  final DateTime Function() clock;

  @override
  State<WorkingIndicator> createState() => _WorkingIndicatorState();
}

class _WorkingIndicatorState extends State<WorkingIndicator> {
  late final DateTime _appeared = widget.clock();

  /// How many seconds the line has been up — what moves the glyph, an eighth of a turn each.
  ///
  /// A step per tick rather than an endless spin: the line already rebuilds once a second for its
  /// clock, and nothing else on the screen has to keep animating.
  int _ticks = 0;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // The one thing that rebuilds every second, and it is this line alone.
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _ticks += 1));
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final VoidCallback? goTo = widget.onGoToRequest;
    final DateTime since = widget.since ?? _appeared;
    final bool still = MediaQuery.disableAnimationsOf(context);
    final ThemeData theme = Theme.of(context);
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Widget label = Text(
      widget.label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: theme.textTheme.bodyMedium?.copyWith(
        color: goTo == null ? null : theme.colorScheme.primary,
        decoration: goTo == null ? null : TextDecoration.underline,
      ),
    );

    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: Tokens.touchTarget),
      child: Row(
        children: <Widget>[
          // Who asked the system for less motion gets a glyph that stands still; the words go on.
          AnimatedRotation(
            turns: still ? 0 : _ticks / 8,
            duration: still ? Duration.zero : const Duration(milliseconds: 300),
            child: Icon(Icons.emergency_outlined, color: theme.colorScheme.primary),
          ),
          const SizedBox(width: Tokens.spaceSm),
          Expanded(
            // A node of its own: what is announced and tapped is the sentence alone, not the row
            // the list item would otherwise merge it into — glyph, clock and all (S-119).
            child: Semantics(
              container: true,
              liveRegion: true,
              button: goTo != null,
              child: goTo == null
                  ? label
                  : InkWell(
                      onTap: goTo,
                      // The whole height of the line is the target, as a touch target owes.
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: Tokens.touchTarget),
                        child: Align(alignment: AlignmentDirectional.centerStart, child: label),
                      ),
                    ),
            ),
          ),
          const SizedBox(width: Tokens.spaceSm),
          // Outside the live region: the clock is never announced.
          ExcludeSemantics(
            child: Text(
              elapsedText(l10n, widget.clock().difference(since)),
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
