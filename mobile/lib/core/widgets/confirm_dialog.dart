/// A question before something that cannot be taken back — the way out first, where the focus
/// starts.
///
/// Ending a session and continuing a conversation another client is writing ask the same way; two
/// copies of the dialog had already formed when the duplication gate objected.
library;

import 'package:flutter/material.dart';

/// Answers `true` when the person confirms, `false` when they keep things as they are.
class ConfirmDialog extends StatelessWidget {
  const ConfirmDialog({
    required this.title,
    required this.body,
    required this.keep,
    required this.confirm,
    super.key,
    this.destructive = false,
  });

  final String title;
  final String body;

  /// The way out — what has the focus.
  final String keep;

  /// The way forward.
  final String confirm;

  /// Whether going forward destroys something, and so is drawn in the error colour.
  final bool destructive;

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(title),
    content: SingleChildScrollView(child: Text(body)),
    actions: <Widget>[
      TextButton(
        autofocus: true,
        onPressed: () => Navigator.of(context).pop(false),
        child: Text(keep),
      ),
      TextButton(
        style: destructive
            ? TextButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error)
            : null,
        onPressed: () => Navigator.of(context).pop(true),
        child: Text(confirm),
      ),
    ],
  );
}
