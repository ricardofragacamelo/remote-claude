/// One level of a folder in the picker, and the button that opens it (plan 10, F7).
///
/// One level at a time, never the tree, and never above the root it started from: the backend's
/// listing says where "up" goes, and `null` at the root.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/app_screen.dart';
import 'package:remote_claude/core/widgets/content_column.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/presentation/providers/directory_controller.dart';
import 'package:remote_claude/features/workspace/presentation/widgets/folder_actions.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The subfolders of [path].
class FolderBrowsePage extends StatelessWidget {
  const FolderBrowsePage({required this.path, super.key});

  final String path;

  @override
  Widget build(BuildContext context) => AppScreen(
    title: folderNameOf(path),
    body: _Level(path: path),
  );
}

/// The level of [path], in whichever of the four states it is in.
class _Level extends ConsumerWidget {
  const _Level({required this.path});

  final String path;

  @override
  Widget build(BuildContext context, WidgetRef ref) => LoadedView<DirectoryListing>(
    value: ref.watch(directoryControllerProvider(path)),
    labels: LoadedLabels(
      loading: AppLocalizations.of(context).folderPickerLoading,
      emptyTitle: AppLocalizations.of(context).folderPickerEmpty,
      emptyDescription: '',
    ),
    onRetry: () => ref.read(directoryControllerProvider(path).notifier).reload(),
    builder: (DirectoryListing listing) => _Listing(listing: listing),
  );
}

/// Where this folder is, the button that opens it, and what is inside.
class _Listing extends ConsumerWidget {
  const _Listing({required this.listing});

  final DirectoryListing listing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? parent = listing.parent;

    return ListView(
      children: <Widget>[
        ContentColumn(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(listing.rootLabel, style: Theme.of(context).textTheme.labelLarge),
            Text(listing.path, style: identifierStyle(context)),
            const SizedBox(height: Tokens.spaceSm),
            FilledButton.icon(
              icon: const Icon(Icons.folder_open),
              label: Text(l10n.folderPickerOpenThis),
              onPressed: () => unawaited(openFolderAndGo(context, ref, listing.path)),
            ),
          ],
        ),
        if (parent != null)
          ListTile(
            leading: const Icon(Icons.arrow_upward),
            title: Text(l10n.folderPickerUp),
            onTap: () => context.pushReplacement(folderBrowseRouteFor(parent)),
          ),
        if (listing.truncated) ListTile(title: Text(l10n.folderPickerTruncated)),
        if (listing.entries.isEmpty)
          ListTile(title: Text(l10n.folderPickerEmpty))
        else
          for (final DirectoryEntry entry in listing.entries)
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: Text(entry.name),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => unawaited(context.push(folderBrowseRouteFor(entry.path))),
            ),
      ],
    );
  }
}
