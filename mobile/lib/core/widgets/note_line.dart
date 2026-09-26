/// One line of explanation under something, spaced from it.
///
/// A tool's summary under its output and a reason under a permission's answers are the same thing
/// on screen — a small sentence that belongs to what is above it — and two copies of it had already
/// drifted into two files when the duplication gate objected.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// A small sentence, a spacing token below what it explains.
class NoteLine extends StatelessWidget {
  const NoteLine(this.text, {super.key, this.style});

  final String text;

  /// The small body style of the theme unless said otherwise.
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: Tokens.spaceSm),
    child: Text(text, style: style ?? Theme.of(context).textTheme.bodySmall),
  );
}
