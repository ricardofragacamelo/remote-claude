/// What the folders home and the picker do to a folder, written once (plan 10, F7).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/workspace/presentation/providers/folders_home_controller.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Says [message] where the person is looking.
void tellAboutFolder(BuildContext context, String message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));

/// Says what [change] came to: [done] when it went through, the failure's words when it did not —
/// or nothing, when [done] is `null` and it went through.
Future<void> reportFolderChange(
  BuildContext context,
  Future<Failure?> change, {
  String? done,
}) async {
  final Failure? failure = await change;

  if (!context.mounted) {
    return;
  }

  final String? message = failure == null
      ? done
      : translateFailure(AppLocalizations.of(context), failure);

  if (message != null) {
    tellAboutFolder(context, message);
  }
}

/// Opens [path] as a tab — here and in the browser (D-25) — and goes to it, the folders home
/// behind it. A refusal says why and stays; past the ceiling it says the ceiling (S-143).
///
/// Through the use case rather than the home's controller: the picker holds nothing of the home
/// alive, and the home reads the server again when it shows.
Future<void> openFolderAndGo(BuildContext context, WidgetRef ref, String path) async {
  Failure? failure;

  try {
    await ref.read(manageFoldersProvider).open(path);
    ref.invalidate(foldersHomeControllerProvider);
  } on Failure catch (refused) {
    failure = refused;
  }

  if (!context.mounted) {
    return;
  }

  if (failure != null) {
    tellAboutFolder(context, translateFailure(AppLocalizations.of(context), failure));
    return;
  }

  context.go(folderRouteFor(path));
}

/// The `⋮` of a folder's row: its [actions], each a label and what it does.
class FolderMenu extends StatelessWidget {
  const FolderMenu({required this.name, required this.actions, super.key});

  final String name;
  final List<(String, Future<void> Function())> actions;

  @override
  Widget build(BuildContext context) => PopupMenuButton<void>(
    tooltip: AppLocalizations.of(context).foldersActions(name),
    itemBuilder: (BuildContext _) => <PopupMenuEntry<void>>[
      for (final (String label, Future<void> Function() act) in actions)
        PopupMenuItem<void>(onTap: () => unawaited(act()), child: Text(label)),
    ],
  );
}
