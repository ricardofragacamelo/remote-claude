/// The screen of the walking skeleton.
///
/// It handles the four states every screen that loads data has to handle — loading, error, empty
/// and content. A missing one is a review failure, because the missing one is always the one a
/// user eventually sees. See docs/architecture/mobile/04-ui.md.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/session/presentation/providers/session_stream_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/pong_list.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The round-trip screen.
class SessionPingPage extends StatelessWidget {
  const SessionPingPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(AppLocalizations.of(context).sessionPingTitle),
      actions: const <Widget>[_SignOutAction()],
    ),
    body: const SafeArea(child: SingleChildScrollView(child: _RoundTrip())),
  );
}

/// Ends the session on this device.
class _SignOutAction extends ConsumerWidget {
  const _SignOutAction();

  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
    icon: const Icon(Icons.logout),
    // An icon with no text needs a translated label, or it announces nothing.
    tooltip: AppLocalizations.of(context).commonActionSignOut,
    onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
  );
}

/// The command, the connection and whatever came back.
class _RoundTrip extends ConsumerWidget {
  const _RoundTrip();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final SessionScreenState screen = ref.watch(sessionStreamControllerProvider);
    final AsyncValue<ConnectionStatus> status = ref.watch(connectionStatusProvider);

    return ContentColumn(
      children: <Widget>[
        Text(l10n.sessionPingDescription, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: Tokens.spaceMd),
        _ConnectionLine(status: status),
        const SizedBox(height: Tokens.spaceMd),
        FilledButton(
          onPressed: status.value == ConnectionStatus.ready && !screen.isSending
              ? () => ref.read(sessionStreamControllerProvider.notifier).ping()
              : null,
          child: Text(l10n.sessionPingAction),
        ),
        const SizedBox(height: Tokens.spaceMd),
        if (screen.isSending)
          LoadingView(label: l10n.sessionPingPending)
        else if (screen.stream.pongs.isEmpty)
          EmptyView(title: l10n.sessionPingTitle, description: l10n.sessionPingEmpty),
        if (screen.stream.pongs.isNotEmpty) PongList(pongs: screen.stream.pongs),
        if (screen.stream.sessionId != null)
          Text(
            l10n.sessionPingSessionLabel(screen.stream.sessionId!),
            style: identifierStyle(context),
          ),
      ],
    );
  }
}

/// Where the connection stands, announced as it changes.
///
/// Visible on purpose: approving a permission while believing you are online, and not being, is
/// the worst failure this app has. See docs/architecture/mobile/03-state-and-data.md.
class _ConnectionLine extends StatelessWidget {
  const _ConnectionLine({required this.status});

  final AsyncValue<ConnectionStatus> status;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    final ConnectionStatus current = status.hasError
        ? ConnectionStatus.closed
        : status.value ?? ConnectionStatus.idle;

    final String label = switch (current) {
      ConnectionStatus.idle => l10n.connectionStatusIdle,
      ConnectionStatus.connecting => l10n.connectionStatusConnecting,
      ConnectionStatus.ready => l10n.connectionStatusReady,
      ConnectionStatus.reconnecting => l10n.connectionStatusReconnecting,
      ConnectionStatus.closed => l10n.connectionStatusClosed,
    };

    return Semantics(
      liveRegion: true,
      child: Text(label, style: Theme.of(context).textTheme.bodySmall),
    );
  }
}
