/// One live session, on a phone.
///
/// The session on screen is **navigation state**, so it comes from the route: pasting the link
/// or opening a notification lands here with the session already decided, and the screen attaches
/// to it rather than being told about it by whatever was on screen before.
///
/// The four states are all here: connecting, a connection that is gone, nothing said yet, and the
/// conversation itself.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/error_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/command_menu_sheet.dart';
import 'package:remote_claude/features/session/presentation/widgets/prompt_composer.dart';
import 'package:remote_claude/features/session/presentation/widgets/rewind_sheet.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The live session screen.
class SessionPage extends ConsumerWidget {
  const SessionPage({required this.sessionId, super.key});

  /// Which session. It comes from the route, never from a provider.
  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final LiveSession session = ref.watch(liveSessionControllerProvider(sessionId));
    final Conversation conversation = session.conversation;
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
        // Always reachable: the sheet is what says why undo is not available right now — a turn
        // running, the device offline, the session closed (S-39) — rather than a button that is
        // grey for a reason nobody reads.
        IconButton(
          icon: const Icon(Icons.undo),
          tooltip: l10n.sessionUndoOpen,
          onPressed: () => unawaited(showRewindSheet(context, sessionId)),
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
              child: _Body(
                session: session,
                connection: connection,
                onRetryHistory: () => unawaited(
                  ref.read(liveSessionControllerProvider(sessionId).notifier).retryHistory(),
                ),
              ),
            ),
            PromptComposer(
              isEnabled: isLive && conversation.status != SessionStatus.closed,
              failure: session.promptFailure,
              onOpenCommands: () => pickCommand(context, sessionId),
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
        // Flexible, and one line: the header has the height of one, and a connection held back
        // by the server says why in more words than a phone's header is wide (plan 05, found by
        // S-43). What does not fit ends in an ellipsis rather than overflowing the bar.
        const Flexible(
          child: Padding(
            padding: EdgeInsets.only(left: Tokens.spaceMd, right: Tokens.spaceMd),
            child: ConnectionLine(textAlign: TextAlign.end, singleLine: true),
          ),
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
  const _Body({required this.session, required this.connection, required this.onRetryHistory});

  final LiveSession session;
  final ConnectionStatus connection;
  final VoidCallback onRetryHistory;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final Conversation conversation = session.conversation;
    final Failure? historyFailure = session.historyFailure;

    // What was said before this screen could see it failed to arrive. Said above whatever did
    // arrive, with the way to ask again — never in place of the live conversation (S-17).
    final Widget? history = historyFailure != null
        ? ErrorView(failure: historyFailure, onRetry: onRetryHistory)
        : null;

    if (conversation.isEmpty) {
      // Nothing has arrived. Which of the reasons it is decides what the person reads: a socket
      // still opening is a wait, history being read is a wait too, and a socket that is gone is
      // not.
      final bool waiting = const <ConnectionStatus>{
        ConnectionStatus.connecting,
        ConnectionStatus.reconnecting,
        ConnectionStatus.throttled,
      }.contains(connection);

      return Column(
        children: <Widget>[
          ?history,
          if (waiting)
            LoadingView(label: connectionLabel(l10n, connection))
          else if (session.isLoadingHistory)
            LoadingView(label: l10n.sessionHistoryLoading)
          else if (history == null)
            EmptyView(title: l10n.sessionEmptyTitle, description: l10n.sessionEmptyBody),
        ],
      );
    }

    return Column(
      children: <Widget>[
        ?history,
        if (session.isLoadingHistory)
          Semantics(
            label: l10n.sessionHistoryLoading,
            liveRegion: true,
            child: const LinearProgressIndicator(),
          ),
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
      SessionCloseReason.idleTimeout => l10n.sessionClosedIdleTimeout,
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
