/// The roots a folder can be opened from — the first level of the picker (plan 10, F7).
///
/// It shows the four states a screen that loads data owes the person. The allowlist is decided on
/// the machine running the backend, and a phone that could add a root would be a phone that could
/// point Claude at any directory on somebody's computer: the picker only walks what is there.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';
import 'package:remote_claude/features/workspace/presentation/providers/workspace_list_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The picker's first level: the allowed roots.
class WorkspaceListPage extends StatelessWidget {
  const WorkspaceListPage({super.key});

  @override
  Widget build(BuildContext context) =>
      AppScreen(title: AppLocalizations.of(context).folderPickerTitle, body: const _Allowlist());
}

/// The allowlist, in whichever of the four states it is in.
class _Allowlist extends ConsumerWidget {
  const _Allowlist();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);

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

/// The roots, each opening one level of itself in the picker.
class _Workspaces extends StatelessWidget {
  const _Workspaces({required this.workspaces});

  final List<Workspace> workspaces;

  @override
  Widget build(BuildContext context) => ListView.builder(
    // A builder rather than a column in a scroll view: the allowlist is short today and the
    // screen should not be the reason it cannot be long.
    itemCount: workspaces.length + 1,
    itemBuilder: (BuildContext context, int index) {
      if (index == 0) {
        return const Padding(padding: EdgeInsets.all(Tokens.spaceMd), child: _Description());
      }

      final Workspace workspace = workspaces[index - 1];

      return ListTile(
        leading: const Icon(Icons.folder_outlined),
        title: Text(workspace.label),
        subtitle: Text(workspace.path, style: identifierStyle(context)),
        trailing: const Icon(Icons.chevron_right),
        // A root is walked, not opened at once: the folder a person wants is usually below it
        // (plan 10, F7). Opening needs no live connection — it is HTTP, like the list.
        onTap: () => unawaited(context.push(folderBrowseRouteFor(workspace.path))),
      );
    },
  );
}

/// What choosing one of these does.
class _Description extends StatelessWidget {
  const _Description();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Tokens.spaceMd),
    child: Text(
      AppLocalizations.of(context).folderPickerRoots,
      style: Theme.of(context).textTheme.bodyMedium,
    ),
  );
}
