/// The MCP servers of a session, read-only (plan 13, B-22; D-32): a chip with the aggregate status,
/// and a sheet listing each server's own — with its redacted error when it failed. Nothing here
/// turns a server on or off, or reconnects it; those actions stay on the web, next to the screen
/// that configures a server in the first place (D-32).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/presentation/providers/insight_controllers.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_sheet.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The word of a server's status.
String mcpStatusWord(AppLocalizations l10n, McpStatus status) => switch (status) {
  McpStatus.connected => l10n.sessionMcpConnected,
  McpStatus.failed => l10n.sessionMcpFailed,
  McpStatus.needsAuth => l10n.sessionMcpNeedsAuth,
  McpStatus.pending => l10n.sessionMcpPending,
  McpStatus.disabled => l10n.sessionMcpDisabled,
};

/// The servers of [sessionId], as [McpServersController] has them so far — `null` before the first
/// `session.mcpStatusChanged` of this session arrived.
List<McpServer>? watchMcpServers(WidgetRef ref, String sessionId) =>
    ref.watch(mcpServersControllerProvider(sessionId));

/// What [McpChip] and [McpSheet] share: which session this is about, and its servers so far.
abstract class _McpSessionWidget extends ConsumerWidget {
  const _McpSessionWidget({required this.sessionId, super.key});

  final String sessionId;

  /// The servers of [sessionId] so far — `null` before the first `session.mcpStatusChanged`.
  List<McpServer>? serversOf(WidgetRef ref) => watchMcpServers(ref, sessionId);
}

/// The chip of [sessionId]'s MCP servers. Absent until the first event arrives, and absent again
/// when it says there are none — the same rule the web's own indicator follows (S-215).
class McpChip extends _McpSessionWidget {
  const McpChip({required super.sessionId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final List<McpServer>? servers = serversOf(ref);
    final AppLocalizations l10n = AppLocalizations.of(context);

    if (servers == null || servers.isEmpty) {
      return const SizedBox.shrink();
    }

    final int fine = servers
        .where((McpServer server) => server.status == McpStatus.connected)
        .length;
    final String label = l10n.sessionMcpSummary(fine, servers.length);

    // An icon, not a chip with text beside it: the title bar already carries the status chip's own
    // text, and a phone has no room for two (found by a 360-wide layout test, S-30's own ceiling).
    // The full sentence is still here, for whoever reads this by touch rather than by sight.
    return Semantics(
      container: true,
      button: true,
      label: label,
      excludeSemantics: true,
      child: IconButton(
        icon: Icon(
          Icons.power,
          color: fine < servers.length ? Theme.of(context).colorScheme.error : null,
        ),
        onPressed: () =>
            unawaited(showSheet(context, (BuildContext _) => McpSheet(sessionId: sessionId))),
      ),
    );
  }
}

/// Every server of [sessionId], read-only: its name, its status, and its redacted error when it
/// failed (D-32, S-215).
class McpSheet extends _McpSessionWidget {
  const McpSheet({required super.sessionId, super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final List<McpServer> servers = serversOf(ref) ?? const <McpServer>[];
    final AppLocalizations l10n = AppLocalizations.of(context);

    return SingleChildScrollView(
      child: ContentColumn(
        children: <Widget>[
          SheetHeading(l10n.sessionMcpTitle, large: true),
          for (final McpServer server in servers) _ServerLine(server: server, l10n: l10n),
        ],
      ),
    );
  }
}

/// One server's row of the sheet: its name and status, and its error underneath when it has one.
class _ServerLine extends StatelessWidget {
  const _ServerLine({required this.server, required this.l10n});

  final McpServer server;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final TextTheme theme = Theme.of(context).textTheme;
    final String? error = server.error;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Tokens.spaceSm / 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(child: Text(server.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
              const SizedBox(width: Tokens.spaceSm),
              Text(mcpStatusWord(l10n, server.status), style: theme.bodySmall),
            ],
          ),
          if (error != null)
            Text(
              error,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error),
            ),
        ],
      ),
    );
  }
}
