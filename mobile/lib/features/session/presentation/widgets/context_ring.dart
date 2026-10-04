/// How full the session's context window is, as a ring on the composer bar, and the sheet a tap
/// opens: the categories, the warning near the limit, and **Compact** (plan 10, B-14).
///
/// A measure that cannot be read is not drawn as zero: the ring gives its place to an icon — the
/// other chips do not move — and the sheet says why (S-45). A draft has no ring: there is no
/// session to measure.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/presentation/providers/insight_controllers.dart';
import 'package:remote_claude/features/session/presentation/widgets/composer_bar.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The size of the ring, inside its 48 dp target.
const double ringSize = 24;

/// The context chip of [sessionId], measured as [use] says.
ComposerChoice contextChoice(
  BuildContext context, {
  required String sessionId,
  required AsyncValue<ContextUse> use,
  required VoidCallback onCompact,
  required bool isCompacting,
}) {
  final AppLocalizations l10n = AppLocalizations.of(context);
  final ContextUse? measured = use.value;
  final ThemeData theme = Theme.of(context);

  return ComposerChoice(
    label: l10n.contextLabel(measured == null ? '–' : '${measured.percentage}'),
    value: switch (use) {
      AsyncValue<ContextUse>(:final ContextUse value?) => l10n.contextPercentage(
        '${value.percentage}',
      ),
      AsyncValue<ContextUse>(hasError: true) => l10n.contextUnavailable,
      _ => l10n.contextLoading,
    },
    compact: true,
    warn: measured?.isNearLimit ?? false,
    leading: measured == null
        ? Icon(use.hasError ? Icons.data_usage : Icons.hourglass_empty, size: ringSize)
        : SizedBox.square(
            dimension: ringSize,
            child: CircularProgressIndicator(
              value: measured.percentage / 100,
              strokeWidth: 3,
              backgroundColor: theme.colorScheme.surfaceContainerHighest,
              color: measured.isNearLimit ? theme.colorScheme.error : theme.colorScheme.primary,
            ),
          ),
    onOpen: () => unawaited(
      showSheet(
        context,
        (BuildContext sheet) => ContextSheet(
          sessionId: sessionId,
          onCompact: () {
            Navigator.of(sheet).pop();
            onCompact();
          },
          isCompacting: isCompacting,
        ),
      ),
    ),
  );
}

/// What the context window holds, by category.
class ContextSheet extends ConsumerWidget {
  const ContextSheet({
    required this.sessionId,
    required this.onCompact,
    required this.isCompacting,
    super.key,
  });

  final String sessionId;
  final VoidCallback onCompact;
  final bool isCompacting;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<ContextUse> use = ref.watch(sessionContextControllerProvider(sessionId));
    final AppLocalizations l10n = AppLocalizations.of(context);
    final ThemeData theme = Theme.of(context);
    final ContextUse? measured = use.value;
    final Object? failure = use.error;
    final NumberFormat number = NumberFormat.decimalPattern(
      Localizations.localeOf(context).toLanguageTag(),
    );

    return SingleChildScrollView(
      child: ContentColumn(
        children: <Widget>[
          Semantics(
            header: true,
            child: Text(
              l10n.contextLabel(measured == null ? '–' : '${measured.percentage}'),
              style: theme.textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: Tokens.spaceSm),
          if (failure != null) ...<Widget>[
            Text(
              '${l10n.contextUnavailable} ${failure is Failure ? translateFailure(l10n, failure) : ''}',
            ),
            TextButton(
              onPressed: () =>
                  ref.read(sessionContextControllerProvider(sessionId).notifier).reload(),
              child: Text(l10n.commonActionRetry),
            ),
          ] else if (measured == null)
            Text(l10n.contextLoading)
          else ...<Widget>[
            Text(
              l10n.contextWindow(
                number.format(measured.totalTokens),
                number.format(measured.maxTokens),
              ),
            ),
            if (measured.isNearLimit)
              Padding(
                padding: const EdgeInsets.only(top: Tokens.spaceSm),
                child: Row(
                  children: <Widget>[
                    Icon(Icons.warning_amber, color: theme.colorScheme.error),
                    const SizedBox(width: Tokens.spaceSm),
                    Expanded(
                      child: Text(
                        l10n.contextNear,
                        style: TextStyle(color: theme.colorScheme.error),
                      ),
                    ),
                  ],
                ),
              ),
            for (final ContextCategory category in measured.categories)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(categoryName(l10n, category)),
                trailing: Text(l10n.contextTokens(number.format(category.tokens))),
              ),
          ],
          const SizedBox(height: Tokens.spaceSm),
          FilledButton.tonalIcon(
            icon: const Icon(Icons.compress),
            label: Text(isCompacting ? l10n.contextCompacting : l10n.contextCompact),
            onPressed: isCompacting ? null : onCompact,
          ),
        ],
      ),
    );
  }
}

/// The name of a category: ours, when this build has words for it; the installation's otherwise.
String categoryName(AppLocalizations l10n, ContextCategory category) => switch (category.id) {
  'systemPrompt' => l10n.contextSystemPrompt,
  'systemTools' => l10n.contextSystemTools,
  'mcpTools' => l10n.contextMcpTools,
  'messages' => l10n.contextMessages,
  'memoryFiles' => l10n.contextMemoryFiles,
  'skills' => l10n.contextSkills,
  'freeSpace' => l10n.contextFreeSpace,
  'autocompactBuffer' || 'buffer' => l10n.contextBuffer,
  _ => category.name,
};
