/// What a screen shows when the load succeeded and there is nothing to show.
///
/// A separate state from loading and from error on purpose: the three look alike to whoever
/// writes the screen and completely different to whoever uses it.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';

/// The empty state of a screen.
class EmptyView extends StatelessWidget {
  const EmptyView({required this.title, required this.description, super.key});

  /// What is empty.
  final String title;

  /// What the user can do about it.
  final String description;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return ContentColumn(
      children: <Widget>[
        Text(title, style: theme.textTheme.titleMedium),
        const SizedBox(height: Tokens.spaceSm),
        Text(
          description,
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}
