/// What the viewer says when it shows no file (plan 25, B-18).
///
/// Each refusal of the server is its own sentence, not the generic error: "no preview" for a
/// binary, "encoding not recognized", "too large" with the size, "not found" with a way back,
/// "access denied", and what to do about a phone not approved.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/widgets/byte_size.dart';
import 'package:remote_claude/core/widgets/refusal_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The refusals asking again does not change.
const Set<String> _final = <String>{
  'FILE_NOT_TEXT',
  'FILE_TOO_LARGE',
  'FILE_NOT_FOUND',
  'FILE_NOT_A_FILE',
  'FILE_ACCESS_DENIED',
  'WORKSPACE_NOT_ALLOWED',
  'FORBIDDEN',
  'DEVICE_REVOKED',
};

/// The refusals of a file that is there, only not shown — the ones that offer "download" (S-69…S-71).
const Set<String> _downloadable = <String>{'FILE_NOT_TEXT', 'FILE_TOO_LARGE'};

/// The sentence of [failure], as the viewer says it.
String viewerRefusal(AppLocalizations l10n, Failure failure) {
  return switch (failure.code) {
    'FILE_NOT_TEXT' when failure.params['reason'] == 'encoding' => l10n.fileViewerEncoding,
    'FILE_NOT_TEXT' => l10n.fileViewerNoPreview,
    'FILE_TOO_LARGE' => l10n.fileViewerTooLarge(_size(l10n, failure.params['size'])),
    'FILE_NOT_FOUND' => l10n.fileViewerNotFound,
    'FILE_ACCESS_DENIED' || 'WORKSPACE_NOT_ALLOWED' || 'FORBIDDEN' => l10n.fileViewerDenied,
    'DEVICE_NOT_REGISTERED' => l10n.filesPanelDevicePending,
    'DEVICE_REVOKED' => l10n.filesPanelDeviceRevoked,
    _ => translateFailure(l10n, failure),
  };
}

String _size(AppLocalizations l10n, String? bytes) {
  final int? count = int.tryParse(bytes ?? '');
  return count == null ? '' : formatBytes(count, l10n.localeName);
}

/// Why the file is not shown, and what can be done.
class FileRefusal extends StatelessWidget {
  const FileRefusal({
    required this.message,
    super.key,
    this.onRetry,
    this.onBack,
    this.actions = const <Widget>[],
  });

  /// The refusal of [failure], with "try again" only where it can change the answer, "back" for a
  /// file that is gone (S-72), and [download] for one that is there but not shown.
  factory FileRefusal.of(
    BuildContext context,
    Failure failure, {
    VoidCallback? onRetry,
    VoidCallback? onBack,
    Widget? download,
  }) => FileRefusal(
    message: viewerRefusal(AppLocalizations.of(context), failure),
    onRetry: _final.contains(failure.code) ? null : onRetry,
    onBack: failure.code == 'FILE_NOT_FOUND' ? onBack : null,
    actions: <Widget>[if (_downloadable.contains(failure.code)) ?download],
  );

  final String message;
  final VoidCallback? onRetry;
  final VoidCallback? onBack;

  /// What else the state offers — "enter the password", "download".
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final VoidCallback? retry = onRetry;
    final VoidCallback? back = onBack;
    final AppLocalizations l10n = AppLocalizations.of(context);

    return RefusalView(
      message: message,
      emphasis: false,
      actions: <Widget>[
        if (retry != null) TextButton(onPressed: retry, child: Text(l10n.commonActionRetry)),
        if (back != null) TextButton(onPressed: back, child: Text(l10n.fileViewerBack)),
        ...actions,
      ],
    );
  }
}

/// A file with nothing in it — the text viewer's and the preview's (S-59, S-85).
class EmptyFile extends StatelessWidget {
  const EmptyFile({super.key});

  @override
  Widget build(BuildContext context) =>
      RefusalView(message: AppLocalizations.of(context).fileViewerEmpty, emphasis: false);
}
