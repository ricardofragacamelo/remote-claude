/// The side panel of a folder's sessions, on the session screen (plan 10, F9, D-26).
///
/// The sessions of the folder open in the app, in the order they entered; the one on screen
/// marked; a new one at the top; every session of the folder at the bottom. Switching replaces the
/// screen rather than stacking it, and the others stay attached — that is what the registry is for.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/open_sessions.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_menu.dart';
import 'package:remote_claude/features/session/presentation/widgets/status_chip.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The last segment of [path], as the folders home names a folder.
String _nameOf(String path) {
  final Iterable<String> segments = path.split('/').where((String each) => each.isNotEmpty);
  return segments.isEmpty ? path : segments.last;
}

/// Whether a session of [folder] other than [current] has questions waiting — what lights the
/// folder icon of the bar (B-46).
bool waitingElsewhere(WidgetRef ref, String folder, String current) => ref
    .watch(openSessionsProvider.select((Map<String, List<String>> open) => open[folder]))
    .orEmpty
    .where((String id) => id != current)
    .any((String id) => ref.watch(permissionQueueControllerProvider(id)).pending.isNotEmpty);

extension on List<String>? {
  List<String> get orEmpty => this ?? const <String>[];
}

/// The panel of [folder], with [current] on screen.
class FolderSessionsPanel extends ConsumerWidget {
  const FolderSessionsPanel({required this.folder, required this.current, super.key});

  final String folder;
  final String current;

  /// The bar's way into the panel of [folder], lit when another of its sessions than [current]
  /// waits for an answer (B-46).
  static Widget button({required String folder, required String current}) => Consumer(
    builder: (BuildContext context, WidgetRef ref, Widget? _) {
      final AppLocalizations l10n = AppLocalizations.of(context);
      final bool elsewhere = waitingElsewhere(ref, folder, current);

      return IconButton(
        tooltip: elsewhere ? l10n.folderPanelWaitingElsewhere : l10n.folderPanelOpen,
        icon: Badge(isLabelVisible: elsewhere, child: const Icon(Icons.folder_copy_outlined)),
        onPressed: () => Scaffold.of(context).openDrawer(),
      );
    },
  );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<String> sessions = ref
        .watch(openSessionsProvider.select((Map<String, List<String>> open) => open[folder]))
        .orEmpty;

    return Drawer(
      child: SafeArea(
        child: ListView(
          children: <Widget>[
            Semantics(
              header: true,
              child: Padding(
                padding: const EdgeInsets.all(Tokens.spaceMd),
                child: Text(
                  l10n.folderPanelTitle(_nameOf(folder)),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.add_comment_outlined),
              title: Text(l10n.folderNewSession),
              onTap: () {
                Navigator.of(context).pop();
                unawaited(context.push(draftRouteFor(folder)));
              },
            ),
            const Divider(),
            for (final String id in sessions) _SessionRow(sessionId: id, current: id == current),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.folder_open),
              title: Text(l10n.folderPanelAll),
              onTap: () {
                Navigator.of(context).pop();
                context.go(folderRouteFor(folder));
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// One session of the panel: the dot and the word of the bar's chip, its model, and the questions
/// waiting in it — in words and an icon, never by colour alone.
class _SessionRow extends ConsumerWidget {
  const _SessionRow({required this.sessionId, required this.current});

  final String sessionId;
  final bool current;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final int waiting = ref.watch(permissionQueueControllerProvider(sessionId)).pending.length;
    final SessionStanding standing = watchStanding(ref, sessionId, waiting: waiting);
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final String model =
        ref.watch(
          liveSessionControllerProvider(
            sessionId,
          ).select((LiveSession live) => live.conversation.facts.model),
        ) ??
        '';

    return ListTile(
      selected: current,
      leading: Icon(Icons.circle, size: 12, color: standingColour(scheme, standing)),
      title: Text(model.isEmpty ? standingWord(l10n, standing) : model),
      subtitle: Text(
        <String>[
          standingWord(l10n, standing),
          if (current) l10n.folderPanelCurrent,
          if (waiting > 0) l10n.foldersPending(waiting),
        ].join(' · '),
      ),
      trailing: waiting > 0 ? Icon(Icons.warning_amber, color: scheme.tertiary) : null,
      onTap: () {
        Navigator.of(context).pop();
        if (!current) {
          // Replaced, not pushed: "back" leaves for the folder, not for the session before (S-168).
          context.pushReplacement(sessionRouteFor(sessionId));
        }
      },
      onLongPress: () => unawaited(_actions(context, ref, l10n)),
    );
  }

  /// "Close in the app", which ends nothing, and "End", with the confirmation of the `⋯` menu.
  Future<void> _actions(BuildContext context, WidgetRef ref, AppLocalizations l10n) =>
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (BuildContext sheet) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              ListTile(
                leading: const Icon(Icons.close),
                title: Text(l10n.sessionCloseInApp),
                subtitle: Text(l10n.sessionCloseInAppNote),
                onTap: () {
                  Navigator.of(sheet).pop();
                  ref.read(openSessionsProvider.notifier).close(sessionId);
                },
              ),
              ListTile(
                leading: Icon(Icons.power_settings_new, color: Theme.of(sheet).colorScheme.error),
                title: Text(l10n.sessionMenuEnd),
                onTap: () {
                  Navigator.of(sheet).pop();
                  unawaited(confirmEnd(context, sessionId));
                },
              ),
            ],
          ),
        ),
      );
}
