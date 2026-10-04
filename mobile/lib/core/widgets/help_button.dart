/// The `?` of a screen: its help, in a sheet, in words (plan 10 — help everywhere).
///
/// Three screens wrote the same button and the same sheet before the duplication gate objected; a
/// fourth would have been the one that drifted.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/message_strip.dart';

/// Opens [body] in a sheet. [tooltip] is what the icon is announced as.
class HelpButton extends StatelessWidget {
  const HelpButton({required this.tooltip, required this.body, super.key});

  final String tooltip;
  final String body;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
    icon: const Icon(Icons.help_outline),
    onPressed: () => unawaited(
      showSheet(
        context,
        (BuildContext _) =>
            SingleChildScrollView(padding: const EdgeInsets.all(Tokens.spaceMd), child: Text(body)),
      ),
    ),
  );
}
