/// Text shown exactly as it will run or match: monospaced, scrollable both ways, never cut.
///
/// One widget for the three places the app shows something a person is authorising — the command
/// of a request, the pattern a "don't ask again" would grant, and the pattern of a standing rule.
/// Three copies would be three chances for one of them to truncate.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// [text], verbatim.
class VerbatimBox extends StatelessWidget {
  const VerbatimBox(this.text, {super.key});

  final String text;

  /// Tall enough for a long command, short enough to leave the answers on a small screen.
  static const double _maxHeight = 200;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(Tokens.spaceSm),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: _maxHeight),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Tokens.spaceSm),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SelectableText(
              text,
              style: theme.textTheme.bodyMedium?.copyWith(fontFamily: 'monospace'),
            ),
          ),
        ),
      ),
    );
  }
}
