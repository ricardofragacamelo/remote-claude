/// The one column this app lays content out in.
///
/// Padding, alignment and the direction things stack are decisions about the product, not about
/// each screen. Keeping them here is what stops fourteen widgets from drifting to thirteen
/// slightly different paddings — and it is what the duplication gate objected to when they were
/// written out one at a time.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// A padded, left-aligned column.
class ContentColumn extends StatelessWidget {
  const ContentColumn({required this.children, this.padding = Tokens.spaceMd, super.key});

  /// What goes in it, top to bottom.
  final List<Widget> children;

  /// Space around the column. A token, never a number.
  final double padding;

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.all(padding),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: children,
    ),
  );
}
