/// The title of a section of a list, announced as a heading.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// [text] as the heading of what follows it.
class SectionHeading extends StatelessWidget {
  const SectionHeading(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Semantics(
    header: true,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(Tokens.spaceMd, Tokens.spaceMd, Tokens.spaceMd, 0),
      child: Text(text, style: Theme.of(context).textTheme.titleMedium),
    ),
  );
}
