/// A line that folds what is under it — a thinking, a tool: the chevron, what it is, and beside it
/// how it is going. One tap target, at least a finger tall, that says whether it is open.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// The line of something folded.
class FoldLine extends StatelessWidget {
  const FoldLine({
    required this.open,
    required this.onToggle,
    required this.title,
    super.key,
    this.trailing,
    this.label,
    this.liveRegion = false,
    this.inset = 0,
  });

  /// What is under it is in view.
  final bool open;

  /// Opens or folds it.
  final VoidCallback onToggle;

  /// What it is.
  final Widget title;

  /// How it is going, at the end of the line.
  final Widget? trailing;

  /// The accessible name, when the words drawn would not say it whole — they are then not read, so
  /// nothing is said twice.
  final String? label;

  /// Announced as it changes — something still arriving.
  final bool liveRegion;

  /// Space at both ends of the line.
  final double inset;

  @override
  Widget build(BuildContext context) {
    final Widget drawn = Container(
      constraints: const BoxConstraints(minHeight: Tokens.touchTarget),
      padding: EdgeInsets.symmetric(horizontal: inset),
      alignment: AlignmentDirectional.centerStart,
      child: Row(
        spacing: Tokens.spaceSm,
        children: <Widget>[
          Icon(
            open ? Icons.expand_less : Icons.expand_more,
            size: Tokens.spaceMd,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          Expanded(child: title),
          ?trailing,
        ],
      ),
    );

    return Semantics(
      button: true,
      expanded: open,
      liveRegion: liveRegion,
      label: label,
      child: InkWell(
        onTap: onToggle,
        child: label == null ? drawn : ExcludeSemantics(child: drawn),
      ),
    );
  }
}
