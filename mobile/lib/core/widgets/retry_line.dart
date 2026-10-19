/// A message and, when there is something to do about it, a button to ask again — side by side, in
/// a line announced to accessibility tools as it changes. For the end of a tool's output that did
/// not load (plan 22, B-32) and a diff that did not answer (plan 26, B-16): two places that say the
/// same kind of thing without replacing what is already on screen.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// [message], in the error colour unless [emphasis] says otherwise, with "try again" beside it when
/// [onRetry] is given.
class RetryLine extends StatelessWidget {
  const RetryLine({required this.message, this.onRetry, this.emphasis = true, super.key});

  final String message;

  /// Asks again — `null` when there is nothing asking again could fix.
  final VoidCallback? onRetry;

  /// Whether [message] is drawn as a failure (the error colour) or as a quieter note.
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ColorScheme colours = Theme.of(context).colorScheme;
    final TextStyle? small = Theme.of(context).textTheme.bodySmall;
    final VoidCallback? retry = onRetry;

    return Semantics(
      liveRegion: true,
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: Tokens.spaceSm,
        children: <Widget>[
          Text(
            message,
            style: small?.copyWith(color: emphasis ? colours.error : colours.onSurfaceVariant),
          ),
          if (retry != null) TextButton(onPressed: retry, child: Text(l10n.commonActionRetry)),
        ],
      ),
    );
  }
}
