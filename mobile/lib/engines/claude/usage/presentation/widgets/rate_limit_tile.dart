/// One rate-limit window: its label, a bar at its utilization, and when it resets.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/date_and_time.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/presentation/widgets/rate_limit_labels.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The colour of each status — never the only way to tell them apart, the word beside it is too.
Color _toneOf(ThemeData theme, RateLimitStatus status) => switch (status) {
  RateLimitStatus.allowed => theme.colorScheme.primary,
  RateLimitStatus.allowedWarning => theme.colorScheme.tertiary,
  RateLimitStatus.rejected => theme.colorScheme.error,
};

class RateLimitTile extends StatelessWidget {
  const RateLimitTile({required this.window, super.key});

  final RateLimitWindow window;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);
    final int? percent = window.utilizationPercent;
    final DateTime? resetsAt = window.resetsAt;

    return Padding(
      padding: const EdgeInsets.only(bottom: Tokens.spaceMd),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Expanded(
                child: Text(rateLimitWindowLabel(l10n, window), style: theme.textTheme.titleSmall),
              ),
              Text(
                '${rateLimitStatusLabel(l10n, window.status)} · '
                '${percent == null ? l10n.claudeUsageNoReading : '$percent%'}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
          const SizedBox(height: Tokens.spaceSm),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: percent == null ? 0 : percent / 100,
              minHeight: 6,
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
              color: _toneOf(theme, window.status),
              semanticsLabel: rateLimitWindowLabel(l10n, window),
              semanticsValue: percent == null ? null : '$percent%',
            ),
          ),
          if (resetsAt != null) ...<Widget>[
            const SizedBox(height: Tokens.spaceSm),
            Text(
              l10n.claudeUsageResetsAt(dateAndTime(context, resetsAt)),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ],
      ),
    );
  }
}
