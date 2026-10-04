/// The folders home: where the app opens (plan 10, F7, D-27).
///
/// The open folders on top — the same as the folder tabs of the browser (D-25) — each with how
/// many sessions run in it and how many questions wait; the recent folders below; and the way to
/// open another. Every change is the server's, so the browser sees it too.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/help_button.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/core/widgets/section_heading.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/presentation/providers/folders_home_controller.dart';
import 'package:remote_claude/features/workspace/presentation/widgets/folder_actions.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The folders home.
class FoldersPage extends StatelessWidget {
  const FoldersPage({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return AppScreen(
      title: l10n.foldersTitle,
      actions: <Widget>[
        HelpButton(tooltip: l10n.foldersHelpOpen, body: l10n.foldersHelpBody),
        // The rules screen, one tap from where sessions start — as the list of roots had it.
        IconButton(
          tooltip: l10n.rulesOpen,
          icon: const Icon(Icons.rule),
          onPressed: () => unawaited(context.push(rulesRoute)),
        ),
        IconButton(
          tooltip: l10n.connectionTitle,
          icon: const Icon(Icons.dns_outlined),
          onPressed: () => unawaited(context.push(connectionRoute)),
        ),
        IconButton(
          tooltip: l10n.diagnosticsTitle,
          icon: const Icon(Icons.bug_report_outlined),
          onPressed: () => unawaited(context.push(diagnosticsRoute)),
        ),
        const _SignOut(),
      ],
      body: const _Folders(),
    );
  }
}

/// Ends the session on this device.
class _SignOut extends ConsumerWidget {
  const _SignOut();

  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
    tooltip: AppLocalizations.of(context).commonActionSignOut,
    icon: const Icon(Icons.logout),
    onPressed: () => unawaited(ref.read(authControllerProvider.notifier).signOut()),
  );
}

/// The two lists, in whichever of the four states they are in.
class _Folders extends ConsumerWidget {
  const _Folders();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return LoadedView<FoldersHome>(
      value: ref.watch(foldersHomeControllerProvider),
      labels: LoadedLabels(
        loading: l10n.foldersLoading,
        emptyTitle: l10n.foldersNoneOpenTitle,
        emptyDescription: l10n.foldersNoneOpenBody,
      ),
      onRetry: () => ref.read(foldersHomeControllerProvider.notifier).reload(),
      builder: (FoldersHome home) => _Home(home: home),
    );
  }
}

/// The two lists, and the way to a third folder.
class _Home extends ConsumerWidget {
  const _Home({required this.home});

  final FoldersHome home;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return RefreshIndicator(
      onRefresh: () async {
        for (final OpenFolderEntry folder in home.open) {
          ref.invalidate(folderSessionsControllerProvider(folder.path));
        }
        await ref.read(foldersHomeControllerProvider.notifier).reload();
      },
      child: ListView(
        children: <Widget>[
          const Padding(
            padding: EdgeInsets.all(Tokens.spaceMd),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[DeviceStatusBanner(), PushReachBanner()],
            ),
          ),
          SectionHeading(l10n.foldersOpenSection),
          if (home.open.isEmpty)
            ListTile(
              title: Text(l10n.foldersNoneOpenTitle),
              subtitle: Text(l10n.foldersNoneOpenBody),
            )
          else
            for (final OpenFolderEntry folder in home.open) _OpenFolderRow(folder: folder),
          Padding(
            padding: const EdgeInsets.all(Tokens.spaceMd),
            child: OutlinedButton.icon(
              icon: const Icon(Icons.create_new_folder_outlined),
              label: Text(l10n.foldersOpenAnother),
              onPressed: () => unawaited(
                context
                    .push(workspacesRoute)
                    .then((_) => ref.read(foldersHomeControllerProvider.notifier).reload()),
              ),
            ),
          ),
          SectionHeading(l10n.foldersRecentSection),
          if (home.recent.isEmpty)
            ListTile(title: Text(l10n.foldersNoRecent))
          else
            for (final RecentFolder folder in home.recent) _RecentFolderRow(folder: folder),
        ],
      ),
    );
  }
}

/// One open folder: what runs in it, and its tab to close.
class _OpenFolderRow extends ConsumerWidget {
  const _OpenFolderRow({required this.folder});

  final OpenFolderEntry folder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? unusable = switch (folder.state) {
      FolderState.available => null,
      FolderState.missing => l10n.foldersMissing,
      FolderState.notAllowed => l10n.foldersNotAllowed,
    };

    return _FolderRow(
      icon: folder.usable ? Icons.folder : Icons.folder_off_outlined,
      name: folder.name,
      details: <Widget>[
        Text(folder.path, style: identifierStyle(context)),
        // A folder that cannot be used says why, and is not opened (S-148).
        if (unusable != null) Text(unusable) else _Load(path: folder.path),
      ],
      onTap: folder.usable
          ? () => unawaited(
              context
                  .push(folderRouteFor(folder.path))
                  .then((_) => ref.invalidate(folderSessionsControllerProvider(folder.path))),
            )
          : null,
      actions: <(String, Future<void> Function())>[
        (
          l10n.foldersClose,
          // Said every time: closing a folder ends no session, and that is the question it raises.
          () => reportFolderChange(
            context,
            ref.read(foldersHomeControllerProvider.notifier).close(folder.path),
            done: l10n.foldersClosed,
          ),
        ),
      ],
    );
  }
}

/// How many sessions run in a folder and how many questions wait — or "—" with the reason a tap
/// away, without taking the list down (S-151).
class _Load extends ConsumerWidget {
  const _Load({required this.path});

  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final AsyncValue<List<LiveSessionSummary>> sessions = ref.watch(
      folderSessionsControllerProvider(path),
    );

    return switch (sessions) {
      AsyncData<List<LiveSessionSummary>>(:final List<LiveSessionSummary> value) => Text(
        _describe(l10n, FolderLoad.of(value)),
      ),
      AsyncError<List<LiveSessionSummary>>() => Tooltip(
        message: l10n.foldersLoadFailed,
        child: Semantics(label: l10n.foldersLoadFailed, child: const Text('—')),
      ),
      _ => const SizedBox.shrink(),
    };
  }

  static String _describe(AppLocalizations l10n, FolderLoad load) => load.pending == 0
      ? l10n.foldersSessions(load.sessions)
      : '${l10n.foldersSessions(load.sessions)} · ${l10n.foldersPending(load.pending)}';
}

/// A folder opened before: tap opens it again, the menu pins or forgets it.
class _RecentFolderRow extends ConsumerWidget {
  const _RecentFolderRow({required this.folder});

  final RecentFolder folder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final FoldersHomeController home = ref.read(foldersHomeControllerProvider.notifier);

    return _FolderRow(
      icon: folder.pinned ? Icons.push_pin : Icons.history,
      name: folder.name,
      details: <Widget>[
        Text(folder.path, style: identifierStyle(context)),
        if (!folder.available) Text(l10n.foldersMissing),
      ],
      onTap: folder.available ? () => unawaited(openFolderAndGo(context, ref, folder.path)) : null,
      actions: <(String, Future<void> Function())>[
        (
          folder.pinned ? l10n.foldersUnpin : l10n.foldersPin,
          () => reportFolderChange(context, home.pin(folder.path, pinned: !folder.pinned)),
        ),
        (l10n.foldersForget, () => reportFolderChange(context, home.forget(folder.path))),
      ],
    );
  }
}

/// One folder of the home: its icon and name, what is known of it below, where a tap goes — off
/// when [onTap] is `null` — and its menu.
class _FolderRow extends StatelessWidget {
  const _FolderRow({
    required this.icon,
    required this.name,
    required this.details,
    required this.onTap,
    required this.actions,
  });

  final IconData icon;
  final String name;
  final List<Widget> details;
  final VoidCallback? onTap;
  final List<(String, Future<void> Function())> actions;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon),
    title: Text(name),
    subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: details),
    isThreeLine: details.length > 1,
    enabled: onTap != null,
    onTap: onTap,
    trailing: FolderMenu(name: name, actions: actions),
  );
}
