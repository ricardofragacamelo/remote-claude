/// What a screen shows while it is loading.
///
/// It carries a translated semantics label, because a spinner announces nothing to a screen
/// reader, and this is an app where someone authorises command execution.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/content_column.dart';

/// The loading state of a screen.
class LoadingView extends StatelessWidget {
  const LoadingView({required this.label, super.key});

  /// What is being waited for, already translated.
  final String label;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    liveRegion: true,
    child: ContentColumn(
      children: <Widget>[
        Row(
          children: <Widget>[
            const SizedBox(
              width: Tokens.spaceLg,
              height: Tokens.spaceLg,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: Tokens.spaceMd),
            Expanded(child: Text(label)),
          ],
        ),
      ],
    ),
  );
}
