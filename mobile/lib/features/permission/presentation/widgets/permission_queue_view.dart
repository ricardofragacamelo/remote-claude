/// The open questions of the session on screen, above its conversation.
///
/// Nothing when there is nothing to decide and nothing has been decided: an empty "waiting for you"
/// section on every session would teach somebody to stop reading it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_queue_controller.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_outcome_line.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_panel.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The permission queue of [sessionId].
class PermissionQueueView extends ConsumerWidget {
  const PermissionQueueView({required this.sessionId, super.key});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final PermissionQueue queue = ref.watch(permissionQueueControllerProvider(sessionId));
    final PermissionOutcome? last = queue.lastOutcome;

    if (queue.pending.isEmpty && last == null) {
      return const SizedBox.shrink();
    }

    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme text = Theme.of(context).textTheme;
    final DateTime now = queue.asOf ?? DateTime.now();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd, vertical: Tokens.spaceSm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (queue.pending.isNotEmpty) ...<Widget>[
            Text(l10n.permissionQueueTitle, style: text.titleMedium),
            Text(l10n.permissionQueueDescription, style: text.bodySmall),
            const SizedBox(height: Tokens.spaceSm),
            for (final PermissionCard card in queue.pending)
              PermissionPanel(
                key: ValueKey<String>(card.requestId),
                sessionId: sessionId,
                card: card,
                now: now,
              ),
          ],
          if (last != null) PermissionOutcomeLine(outcome: last),
        ],
      ),
    );
  }
}
