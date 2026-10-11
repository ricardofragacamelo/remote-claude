/// The line that says, over a file, that the agent waits for an answer in the session it was opened
/// from (plan 25, B-18, D-11 (b)).
///
/// The session is covered by the viewer, so its card is out of sight: this line is what the person
/// sees without leaving the file, and "back to the session" lands on the card.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The questions waiting in [sessionId], said in one line naming the engine that asks — nothing
/// when none waits.
class AgentWaitingStrip extends ConsumerWidget {
  const AgentWaitingStrip({required this.sessionId, super.key});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final PermissionQueue queue = ref.watch(permissionQueueControllerProvider(sessionId));
    final PermissionCard? first = queue.pending.firstOrNull;
    if (first == null) {
      return const SizedBox.shrink();
    }
    final String oldest = first.requestId;

    final AppLocalizations l10n = AppLocalizations.of(context);
    return TextStrip(
      icon: Icons.pending_actions,
      text: l10n.fileViewerAgentWaiting(
        agentNameIn(context, first.request.engine),
        queue.pending.length,
      ),
      emphasis: true,
      action: TextButton(
        onPressed: () => context.go(sessionRouteFor(sessionId, request: oldest)),
        child: Text(l10n.fileViewerBackToSession),
      ),
    );
  }
}
