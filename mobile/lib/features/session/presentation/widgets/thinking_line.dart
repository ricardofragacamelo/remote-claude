/// What the model thought, as a line of its own in the conversation.
///
/// Never part of the answer (S-08), and drawn the way the web and the Claude Code draw it (plan 22,
/// B-31): "Thinking…" while it arrives; a thinking the model **summarised** in text is in view, quiet,
/// under "Thought" (D-15) — and can still be folded; one the model **omitted** says "Thought", folded,
/// and opened says the model did not show it (S-101); a **redacted** one says it was hidden. How long:
/// "Thought for *n* s" when the stream measured it, "for up to *n* s" from the history's instants
/// (D-14), and nothing without them — never "0 s" for an absence (S-106).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/fold_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// One thinking of the conversation.
class ThinkingLine extends StatefulWidget {
  const ThinkingLine({required this.thinking, super.key});

  final ThinkingEntry thinking;

  @override
  State<ThinkingLine> createState() => _ThinkingLineState();
}

class _ThinkingLineState extends State<ThinkingLine> {
  /// Opened or folded by a tap — `null` until the person touches it, and then the line is open
  /// exactly when the model showed what it thought (D-15). Local: nobody else needs it, and it dies
  /// with the line.
  bool? _toggled;

  @override
  Widget build(BuildContext context) {
    final ThinkingEntry thinking = widget.thinking;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String title = thinkingTitle(l10n, thinking);
    final ThemeData theme = Theme.of(context);
    final bool said = !thinking.isRedacted && thinking.text.isNotEmpty;
    final bool open = _toggled ?? said;

    final TextStyle? quiet = theme.textTheme.bodySmall?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
      fontStyle: FontStyle.italic,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        FoldLine(
          open: open,
          onToggle: () => setState(() => _toggled = !open),
          liveRegion: !thinking.isComplete,
          title: Text(
            title,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontStyle: FontStyle.italic,
            ),
          ),
        ),
        // Quieter than the answer: what it reasoned is not what it replies.
        if (open) Text(said ? thinking.text : l10n.thinkingNothingShown, style: quiet),
      ],
    );
  }
}

/// What the line of [thinking] says, closed.
String thinkingTitle(AppLocalizations l10n, ThinkingEntry thinking) {
  if (!thinking.isComplete) {
    return l10n.thinkingLive;
  }

  if (thinking.isRedacted) {
    return l10n.thinkingHidden;
  }

  final Duration? took = thinking.duration;
  final Duration? atMost = thinking.atMost;

  // What the stream measured is the true one; what the history bounds is only a ceiling.
  if (took != null) {
    return _spoken(took, l10n.thinkingTook, l10n.thinkingTookMinutes);
  }

  return atMost == null
      ? l10n.thinkingDone
      : _spoken(atMost, l10n.thinkingTookUpTo, l10n.thinkingTookUpToMinutes);
}

/// [duration] in seconds below a minute, and in minutes and seconds from there on — as the turn's
/// own clock says it. Rounded as the web rounds it, so the two ends say the same for the same
/// thinking (S-105).
String _spoken(
  Duration duration,
  String Function(String seconds) seconds,
  String Function(String minutes, String seconds) minutes,
) {
  final int total = (duration.inMilliseconds / 1000).round();

  return total < 60
      ? seconds('$total')
      : minutes('${total ~/ 60}', '${total % 60}'.padLeft(2, '0'));
}
