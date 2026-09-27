/// A failure said in one line, beside the control that caused it.
///
/// For the failure that must **not** replace the screen: a page that did not load after the ones
/// already shown, a command the server refused. Replacing what is on screen with an [ErrorView]
/// there would hide everything that is still true, so the reason goes next to the button instead.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/widgets/note_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The translated reason for [failure], in the error colour of the scheme, announced.
class FailureLine extends StatelessWidget {
  const FailureLine({required this.failure, super.key});

  final Failure failure;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Semantics(
      liveRegion: true,
      child: NoteLine(
        translateFailure(AppLocalizations.of(context), failure),
        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.error),
      ),
    );
  }
}
