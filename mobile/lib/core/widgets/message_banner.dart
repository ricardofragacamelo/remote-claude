/// One explanation the user has to read, in the shape every explanation of this app uses.
///
/// Two banners needed exactly this — what the device is allowed to do, and whether a notification
/// can reach it — and a second copy of a card with an icon, a title and a body is the kind of
/// duplication that drifts into two different paddings and one missing `Semantics`. The
/// duplication gate would have caught it; having one is what makes the two read alike.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// A card that explains a state, and optionally offers the one thing to do about it.
class MessageBanner extends StatelessWidget {
  const MessageBanner({
    required this.icon,
    required this.title,
    required this.body,
    super.key,
    this.emphasis = false,
    this.actionLabel,
    this.onAction,
  });

  /// What the state looks like at a glance.
  final IconData icon;

  final String title;
  final String body;

  /// Whether this is a state the person has to act on. Colour from the scheme, never a literal.
  final bool emphasis;

  /// The label of the single action, when there is something to do.
  final String? actionLabel;

  /// What that action does. Without it the label is not rendered — a button that does nothing is
  /// worse than no button.
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color colour = emphasis ? theme.colorScheme.error : theme.colorScheme.primary;
    final String? label = actionLabel;
    final VoidCallback? action = onAction;

    return Semantics(
      container: true,
      liveRegion: true,
      child: Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(Tokens.spaceMd),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(icon, color: colour),
              const SizedBox(width: Tokens.spaceMd),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(title, style: theme.textTheme.titleSmall?.copyWith(color: colour)),
                    const SizedBox(height: Tokens.spaceSm),
                    Text(body, style: theme.textTheme.bodyMedium),
                    if (label != null && action != null) ...<Widget>[
                      const SizedBox(height: Tokens.spaceSm),
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: TextButton(onPressed: action, child: Text(label)),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
