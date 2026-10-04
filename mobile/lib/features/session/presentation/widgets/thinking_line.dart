/// What the model thought, as a line of its own in the conversation.
///
/// Never part of the answer (S-08): "Thinking…" while it arrives, and "Thought" — or "Thought for
/// *n* s", when the stream measured it — once it stopped, collapsed. A tap opens what it thought.
/// From the history there is no duration, and the line says "Thought", never "0 s" (S-61).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// One thinking of the conversation.
class ThinkingLine extends StatefulWidget {
  const ThinkingLine({required this.thinking, super.key});

  final ThinkingEntry thinking;

  @override
  State<ThinkingLine> createState() => _ThinkingLineState();
}

class _ThinkingLineState extends State<ThinkingLine> {
  /// Opened by a tap. Local: nobody else needs it, and it dies with the line.
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final ThinkingEntry thinking = widget.thinking;
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String title = thinkingTitle(l10n, thinking);
    final ThemeData theme = Theme.of(context);

    return Semantics(
      button: true,
      expanded: _open,
      liveRegion: !thinking.isComplete,
      child: InkWell(
        onTap: () => setState(() => _open = !_open),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: Tokens.touchTarget),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Icon(
                    _open ? Icons.expand_less : Icons.expand_more,
                    size: Tokens.spaceMd,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: Tokens.spaceSm),
                  Expanded(
                    child: Text(
                      title,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
              ),
              if (_open)
                Padding(
                  padding: const EdgeInsets.only(top: Tokens.spaceSm),
                  child: Text(
                    thinking.isRedacted || thinking.text.isEmpty
                        ? l10n.thinkingNothingShown
                        : thinking.text,
                    style: theme.textTheme.bodySmall,
                  ),
                ),
            ],
          ),
        ),
      ),
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

  // Rounded as the web rounds it, so the two ends say the same number for the same thinking.
  return took == null
      ? l10n.thinkingDone
      : l10n.thinkingTook('${(took.inMilliseconds / 1000).round()}');
}
