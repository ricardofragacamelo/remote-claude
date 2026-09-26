/// The folders a session can be opened in.
///
/// The list screen of the app. It shows the four states a screen that loads data owes the person,
/// and it is the only place a session is started from: the allowlist is decided on the machine
/// running the backend, and a phone that could add a root would be a phone that could point Claude
/// at any directory on somebody's computer.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';
import 'package:remote_claude/features/workspace/presentation/providers/workspace_list_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The screen that lists the allowed roots.
class WorkspaceListPage extends StatelessWidget {
  const WorkspaceListPage({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return AppScreen(
      title: l10n.workspaceListTitle,
      actions: <Widget>[
        // The rules screen, one tap from where sessions start — the list of what runs without
        // asking belongs next to the place things are run from.
        IconButton(
          tooltip: l10n.rulesOpen,
          icon: const Icon(Icons.rule),
          onPressed: () => unawaited(context.push(rulesRoute)),
        ),
      ],
      body: const _Allowlist(),
    );
  }
}

/// The allowlist, in whichever of the four states it is in.
class _Allowlist extends ConsumerWidget {
  const _Allowlist();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    // A session opened from here answers later, on `session.started`. Listening rather than
    // awaiting is what it takes: the id arrives on the socket, not from the command (S-75).
    ref.listen<String?>(sessionStarterControllerProvider, (String? _, String? sessionId) {
      if (sessionId != null) {
        ref.read(sessionStarterControllerProvider.notifier).acknowledge();
        context.go(sessionRouteFor(sessionId));
      }
    });

    return LoadedView<List<Workspace>>(
      value: ref.watch(workspaceListControllerProvider),
      labels: LoadedLabels(
        loading: l10n.workspaceListLoading,
        emptyTitle: l10n.workspaceListEmptyTitle,
        emptyDescription: l10n.workspaceListEmptyBody,
      ),
      isEmpty: (List<Workspace> workspaces) => workspaces.isEmpty,
      onRetry: () => ref.read(workspaceListControllerProvider.notifier).reload(),
      builder: (List<Workspace> workspaces) => _Workspaces(workspaces: workspaces),
    );
  }
}

/// The loaded list, with what this installation is allowed to do above it.
class _Workspaces extends ConsumerWidget {
  const _Workspaces({required this.workspaces});

  final List<Workspace> workspaces;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<ConnectionStatus> status = ref.watch(connectionStatusProvider);
    final bool connected = status.value == ConnectionStatus.ready;

    return ListView.builder(
      // A builder rather than a column in a scroll view: the allowlist is short today and the
      // screen should not be the reason it cannot be long.
      itemCount: workspaces.length + 1,
      itemBuilder: (BuildContext context, int index) {
        if (index == 0) {
          return const Padding(
            padding: EdgeInsets.all(Tokens.spaceMd),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[DeviceStatusBanner(), PushReachBanner(), _Description()],
            ),
          );
        }

        final Workspace workspace = workspaces[index - 1];

        return ListTile(
          leading: const Icon(Icons.folder_outlined),
          title: Text(workspace.label),
          subtitle: Text(
            workspace.lastUsedAt?.toIso8601String() ?? l10n.workspaceNeverOpened,
            style: identifierStyle(context),
          ),
          // Disabled with the reason said out loud, never disabled in silence: a dead control
          // with no explanation is a rule that looks like a bug.
          enabled: connected,
          onTap: connected ? () => _start(ref, l10n, context, workspace) : null,
        );
      },
    );
  }

  void _start(WidgetRef ref, AppLocalizations l10n, BuildContext context, Workspace workspace) {
    final bool sent = ref.read(sessionStarterControllerProvider.notifier).start(workspace.path);

    if (!sent) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(l10n.workspaceStartRefused)));
    }
  }
}

/// What choosing one of these does.
class _Description extends StatelessWidget {
  const _Description();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Tokens.spaceMd),
    child: Text(
      AppLocalizations.of(context).workspaceListDescription,
      style: Theme.of(context).textTheme.bodyMedium,
    ),
  );
}
