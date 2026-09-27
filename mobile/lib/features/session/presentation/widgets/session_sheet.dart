/// The shape of the sheets the session screen opens over itself: the command menu and the undo.
///
/// Both are a title, a sentence saying what the sheet is for, and a body that loads — and both
/// open the same way, tall enough to read a list and inside the safe area. Written once so the two
/// cannot drift into two paddings, and so the duplication gate has nothing to object to.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';

/// How much of the screen a sheet takes: enough for a list, with the session still visible above.
const double sessionSheetHeight = 0.9;

/// Opens [sheet] over the session screen and answers what it closed with.
Future<T?> showSessionSheet<T>(BuildContext context, Widget sheet) => showModalBottomSheet<T>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  builder: (BuildContext context) =>
      FractionallySizedBox(heightFactor: sessionSheetHeight, child: sheet),
);

/// A title, what the sheet is for, and what fills the rest.
class SessionSheet extends StatelessWidget {
  const SessionSheet({
    required this.title,
    required this.description,
    required this.child,
    super.key,
  });

  /// Already translated.
  final String title;

  /// What the sheet is for, already translated.
  final String description;

  /// What fills the rest of the height.
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Tokens.spaceMd),
          child: Text(title, style: theme.textTheme.titleLarge),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            Tokens.spaceMd,
            Tokens.spaceSm,
            Tokens.spaceMd,
            Tokens.spaceSm,
          ),
          child: Text(
            description,
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ),
        Expanded(child: child),
      ],
    );
  }
}

/// The name of one group inside a sheet, announced as a heading.
class SheetHeading extends StatelessWidget {
  const SheetHeading(this.text, {super.key});

  /// Already translated.
  final String text;

  @override
  Widget build(BuildContext context) =>
      Semantics(header: true, child: Text(text, style: Theme.of(context).textTheme.titleSmall));
}
