/// One live session, on a phone.
///
/// The session on screen is **navigation state**, so it comes from the route: pasting the link
/// or opening a notification lands here with the session already decided, and the screen attaches
/// to it rather than being told about it by whatever was on screen before.
///
/// The four states are all here: connecting, a connection that is gone, nothing said yet, and the
/// conversation itself.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/prompt_composer.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The live session screen.
class SessionPage extends ConsumerWidget {
  const SessionPage({required this.sessionId, super.key});

  /// Which session. It comes from the route, never from a provider.
  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Conversation conversation = ref.watch(liveSessionControllerProvider(sessionId));
    final ConnectionStatus connection = connectionOf(ref.watch(connectionStatusProvider));
    final bool isLive = connection == ConnectionStatus.ready;

    return AppScreen(
      title: l10n.sessionTitle,
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(Tokens.spaceLg),
        child: Padding(
          padding: const EdgeInsets.only(bottom: Tokens.spaceSm),
          child: _Header(status: conversation.status),
        ),
      ),
      actions: <Widget>[
        if (conversation.status == SessionStatus.running ||
            conversation.status == SessionStatus.thinking)
          TextButton(
            onPressed: isLive
                ? () => ref.read(liveSessionControllerProvider(sessionId).notifier).interrupt()
                : null,
            child: Text(l10n.sessionInterruptAction),
          ),
        IconButton(
          icon: const Icon(Icons.stop_circle_outlined),
          tooltip: l10n.sessionCloseAction,
          onPressed: isLive && conversation.status != SessionStatus.closed
              ? () => ref.read(liveSessionControllerProvider(sessionId).notifier).close()
              : null,
        ),
      ],
      body: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) => Column(
          children: <Widget>[
            // What this phone may do, and the questions the agent loop is stopped on, above the
            // conversation — scrolling together, and never taking more than half of the height
            // that is actually **there**. Half of the screen was the first try, and on a real phone
            // the banners, the card and the composer did not fit in what the screen had left.
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: constraints.maxHeight / 2),
              child: SingleChildScrollView(
                child: Column(
                  children: <Widget>[
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
                      child: Column(children: <Widget>[DeviceStatusBanner(), PushReachBanner()]),
                    ),
                    PermissionQueueView(sessionId: sessionId),
                  ],
                ),
              ),
            ),
            Expanded(
              child: _Body(conversation: conversation, connection: connection),
            ),
            PromptComposer(
              isEnabled: isLive && conversation.status != SessionStatus.closed,
              onSend: (String text) =>
                  ref.read(liveSessionControllerProvider(sessionId).notifier).prompt(text),
            ),
          ],
        ),
      ),
    );
  }
}

/// Where the session is, and where the connection is, side by side.
class _Header extends StatelessWidget {
  const _Header({required this.status});

  final SessionStatus status;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.only(left: Tokens.spaceMd),
          child: Semantics(
            liveRegion: true,
            child: Text(_label(l10n, status), style: Theme.of(context).textTheme.bodySmall),
          ),
        ),
        const Padding(
          padding: EdgeInsets.only(right: Tokens.spaceMd),
          child: ConnectionLine(),
        ),
      ],
    );
  }

  static String _label(AppLocalizations l10n, SessionStatus status) => switch (status) {
    SessionStatus.starting => l10n.sessionStatusStarting,
    SessionStatus.idle => l10n.sessionStatusIdle,
    SessionStatus.thinking => l10n.sessionStatusThinking,
    SessionStatus.running => l10n.sessionStatusRunning,
    SessionStatus.waitingPermission => l10n.sessionStatusWaitingPermission,
    SessionStatus.closed => l10n.sessionStatusClosed,
  };
}

/// The conversation, or the reason there is not one yet.
class _Body extends StatelessWidget {
  const _Body({required this.conversation, required this.connection});

  final Conversation conversation;
  final ConnectionStatus connection;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    if (conversation.isEmpty) {
      // Nothing has arrived. Which of the two reasons it is decides what the person reads: a
      // socket still opening is a wait, and a socket that is gone is not.
      final bool waiting =
          connection == ConnectionStatus.connecting || connection == ConnectionStatus.reconnecting;

      return waiting
          ? LoadingView(label: connectionLabel(l10n, connection))
          : EmptyView(title: l10n.sessionEmptyTitle, description: l10n.sessionEmptyBody);
    }

    return Column(
      children: <Widget>[
        Expanded(child: ConversationView(conversation: conversation)),
        if (conversation.ending != null) _Ending(ending: conversation.ending!),
      ],
    );
  }
}

/// Why the session ended.
class _Ending extends StatelessWidget {
  const _Ending({required this.ending});

  final SessionEnding ending;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    final String reason = switch (ending.reason) {
      SessionCloseReason.closedByUser => l10n.sessionClosedByUser,
      SessionCloseReason.completed => l10n.sessionClosedCompleted,
      SessionCloseReason.failed => l10n.sessionClosedFailed,
      SessionCloseReason.auditUnavailable => l10n.sessionClosedAuditUnavailable,
      SessionCloseReason.shutdown => l10n.sessionClosedShutdown,
    };

    return Padding(
      padding: const EdgeInsets.all(Tokens.spaceMd),
      child: Semantics(
        liveRegion: true,
        child: Text(reason, style: Theme.of(context).textTheme.bodySmall),
      ),
    );
  }
}
