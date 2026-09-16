/// What a screen shows when loading failed.
///
/// It translates `failure.messageKey`, offers a way out, and shows the `traceId`. The trace is
/// not decoration: in a published app the user's report is frequently the only lead there is.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The error state of a screen.
class ErrorView extends StatelessWidget {
  const ErrorView({required this.failure, this.onRetry, super.key});

  /// What went wrong.
  final Failure failure;

  /// The recovery action, when there is one to offer.
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);

    return ContentColumn(
      children: <Widget>[
        Row(
          children: <Widget>[
            // Colour comes from the scheme, never from a literal: a destructive card that is
            // unreadable in the dark theme is a real problem, not a cosmetic one.
            Icon(Icons.error_outline, color: theme.colorScheme.error),
            const SizedBox(width: Tokens.spaceSm),
            Expanded(
              child: Text(translateFailure(l10n, failure), style: theme.textTheme.bodyLarge),
            ),
          ],
        ),
        const SizedBox(height: Tokens.spaceSm),
        Text(l10n.commonErrorTraceLabel(failure.traceId), style: identifierStyle(context)),
        if (onRetry != null) ...<Widget>[
          const SizedBox(height: Tokens.spaceMd),
          FilledButton(onPressed: onRetry, child: Text(l10n.commonActionRetry)),
        ],
      ],
    );
  }
}
