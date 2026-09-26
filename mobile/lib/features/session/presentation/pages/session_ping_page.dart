/// The screen of the walking skeleton.
///
/// It handles the four states every screen that loads data has to handle — loading, error, empty
/// and content. A missing one is a review failure, because the missing one is always the one a
/// user eventually sees. See docs/architecture/mobile/04-ui.md.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/empty_view.dart';
import 'package:remote_claude/core/widgets/loading_view.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/presentation/providers/session_stream_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/pong_list.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The round-trip screen.
class SessionPingPage extends StatelessWidget {
  const SessionPingPage({super.key});

  @override
  Widget build(BuildContext context) => AppScreen(
    title: AppLocalizations.of(context).sessionPingTitle,
    actions: const <Widget>[_WorkspacesAction(), _SignOutAction()],
    body: const SingleChildScrollView(child: _RoundTrip()),
  );
}

/// Opens the list of folders a session can be started in.
class _WorkspacesAction extends StatelessWidget {
  const _WorkspacesAction();

  @override
  Widget build(BuildContext context) => IconButton(
    icon: const Icon(Icons.folder_outlined),
    // An icon with no text needs a translated label, or it announces nothing.
    tooltip: AppLocalizations.of(context).workspaceListTitle,
    onPressed: () => context.go(workspacesRoute),
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
        // First, above everything: what this installation is allowed to do. A person who cannot
        // approve yet has to learn it from the screen, not from a control that does nothing.
        const DeviceStatusBanner(),
        // Whether approving asks for the owner's fingerprint or PIN. On by default; it lives here,
        // away from the card, because switching a barrier off from the screen that it guards would
        // put the switch exactly where the accidental tap happens.
        const ApprovalLockSwitch(),
        Text(l10n.sessionPingDescription, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: Tokens.spaceMd),
        const ConnectionLine(),
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
