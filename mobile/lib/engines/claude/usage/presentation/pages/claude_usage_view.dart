/// The account's rate-limit windows, as the CLI last reported them (plan 16, D-09) — never
/// real-time, and never per-user: the account is the machine's, shared by every session. Registered
/// into the app's single agent-screen slot by `app/engines.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/date_and_time.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/core/widgets/section_heading.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/presentation/providers/usage_controller.dart';
import 'package:remote_claude/engines/claude/usage/presentation/widgets/rate_limit_labels.dart';
import 'package:remote_claude/engines/claude/usage/presentation/widgets/rate_limit_tile.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

class ClaudeUsageView extends ConsumerWidget {
  const ClaudeUsageView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final UsageController controller = ref.read(usageControllerProvider.notifier);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SectionHeading(l10n.claudeUsageTitle),
          LoadedView<List<RateLimitWindow>>(
            value: ref.watch(usageControllerProvider),
            labels: LoadedLabels(
              loading: l10n.claudeUsageLoading,
              emptyTitle: l10n.claudeUsageEmptyTitle,
              emptyDescription: l10n.claudeUsageEmptyBody,
            ),
            isEmpty: (List<RateLimitWindow> windows) => windows.isEmpty,
            onRetry: controller.retry,
            builder: (List<RateLimitWindow> windows) => _Windows(windows: windows),
          ),
        ],
      ),
    );
  }
}

class _Windows extends StatelessWidget {
  const _Windows({required this.windows});

  final List<RateLimitWindow> windows;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<RateLimitWindow> ordered = orderedByKind(windows);
    final DateTime lastSeen = ordered
        .map((RateLimitWindow window) => window.observedAt)
        .reduce((DateTime a, DateTime b) => a.isAfter(b) ? a : b);

    return ContentColumn(
      children: <Widget>[
        for (final RateLimitWindow window in ordered) RateLimitTile(window: window),
        Text(
          l10n.claudeUsageSeenAt(dateAndTime(context, lastSeen)),
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}
