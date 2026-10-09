/// Why something is not shown, in words, and what can be done about it — the image of a prompt
/// that did not load, a file the viewer does not show (plan 22, plan 25).
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// [message], announced, with [actions] under it.
class RefusalView extends StatelessWidget {
  const RefusalView({
    required this.message,
    super.key,
    this.actions = const <Widget>[],
    this.emphasis = true,
  });

  final String message;

  /// "Try again", "back" — only what can change the answer.
  final List<Widget> actions;

  /// In the error colour: a failure; otherwise, a plain statement (a file that has no preview).
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final TextStyle? style = emphasis
        ? theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error)
        : theme.textTheme.bodyLarge;

    return Semantics(
      liveRegion: true,
      child: Padding(
        padding: const EdgeInsets.all(Tokens.spaceMd),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(message, style: style),
            if (actions.isNotEmpty) Wrap(spacing: Tokens.spaceSm, children: actions),
          ],
        ),
      ),
    );
  }
}
