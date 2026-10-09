/// Downloading a file of the folder: the button, the strip of what is on its way, and the sentence
/// that says how it ended (plan 25, B-28).
///
/// The strip announces each download to the screen reader as it starts, with a bar and a "cancel";
/// the end is a snack bar — saved, or why not, with "try again" where asking again can change the
/// answer. A cancel is the person's own doing, and nothing is said (S-124).
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/presentation/providers/downloads_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The refusals asking again does not change.
const Set<String> _final = <String>{
  'FILE_TOO_LARGE',
  'FILE_NOT_FOUND',
  'FILE_NOT_A_FILE',
  'FILE_ACCESS_DENIED',
  'WORKSPACE_NOT_ALLOWED',
  'FORBIDDEN',
  'DEVICE_NOT_REGISTERED',
  'DEVICE_REVOKED',
};

/// Downloads [request], and says how it ended on the screen [context] belongs to — even when that
/// screen is gone by then, as long as its scaffold is not.
Future<void> startDownload(BuildContext context, DownloadRequest request) => _run(
  ProviderScope.containerOf(context, listen: false),
  ScaffoldMessenger.of(context),
  AppLocalizations.of(context),
  request,
);

Future<void> _run(
  ProviderContainer container,
  ScaffoldMessengerState messenger,
  AppLocalizations l10n,
  DownloadRequest request,
) async {
  final DownloadOutcome outcome = await container.read(downloadsProvider.notifier).start(request);
  final ({String text, bool retry})? said = _sentenceOf(l10n, request, outcome);
  if (said == null) {
    return;
  }

  messenger.showSnackBar(
    SnackBar(
      content: Text(said.text),
      action: said.retry
          ? SnackBarAction(
              label: l10n.commonActionRetry,
              onPressed: () => unawaited(_run(container, messenger, l10n, request)),
            )
          : null,
    ),
  );
}

/// What the end of a download says, and whether it offers "try again" — nothing for a cancel.
({String text, bool retry})? _sentenceOf(
  AppLocalizations l10n,
  DownloadRequest request,
  DownloadOutcome outcome,
) => switch (outcome) {
  Downloaded() => (text: l10n.filesDownloaded(request.name), retry: false),
  DownloadCancelled() => null,
  DownloadTooLarge(:final int limit) => (
    text: l10n.filesDownloadTooLarge(request.path, formatBytes(limit, l10n.localeName)),
    retry: false,
  ),
  DownloadRefused(:final Failure failure) when failure.code == 'FILE_TOO_LARGE' => (
    text: l10n.filesDownloadTooLarge(
      request.path,
      formatBytes(int.tryParse(failure.params['limit'] ?? '') ?? 0, l10n.localeName),
    ),
    retry: false,
  ),
  DownloadRefused(:final Failure failure) => (
    text: l10n.filesDownloadRefused(request.name, translateFailure(l10n, failure)),
    retry: !_final.contains(failure.code),
  ),
  DownloadNotSaved() => (text: l10n.filesDownloadNotSaved(request.name), retry: true),
};

/// "Download", where a state of the viewer offers it.
class DownloadButton extends StatelessWidget {
  const DownloadButton({required this.request, super.key});

  final DownloadRequest request;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: () => unawaited(startDownload(context, request)),
    icon: const Icon(Icons.download),
    label: Text(AppLocalizations.of(context).filesDownload),
  );
}

/// The downloads on their way — nothing when there is none.
class DownloadsStrip extends ConsumerWidget {
  const DownloadsStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: <Widget>[
      for (final DownloadTask task in ref.watch(downloadsProvider).values)
        _TaskStrip(
          key: ValueKey<int>(task.id),
          task: task,
          onCancel: () => ref.read(downloadsProvider.notifier).cancel(task.id),
        ),
    ],
  );
}

/// One download: its name, announced as it starts, its bar and its "cancel".
class _TaskStrip extends StatelessWidget {
  const _TaskStrip({required this.task, required this.onCancel, super.key});

  final DownloadTask task;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: <Widget>[
      TextStrip(
        icon: Icons.download,
        text: AppLocalizations.of(context).filesDownloading(task.name),
        action: IconButton(
          tooltip: AppLocalizations.of(context).filesDownloadCancel,
          icon: const Icon(Icons.close),
          onPressed: onCancel,
        ),
      ),
      LinearProgressIndicator(value: task.fraction),
    ],
  );
}
