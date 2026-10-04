/// The help of the session screen (plan 10, B-17) — every screen has one. It says where each thing
/// moved to: the bar under the box, the menu, the status, the line that moves while Claude works, the
/// question in the conversation, the pill, the task list and what a prompt offers when it is pressed
/// and held.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_sheet.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Opens the help over the session screen — or the draft, which is the same frame.
Future<void> showSessionHelp(BuildContext context) =>
    showSessionSheet<void>(context, const SessionHelp());

/// The help, a heading and a paragraph per place.
class SessionHelp extends StatelessWidget {
  const SessionHelp({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final List<(String, String)> sections = <(String, String)>[
      (l10n.sessionHelpBarHeading, l10n.sessionHelpBar),
      (l10n.sessionHelpMenuHeading, l10n.sessionHelpMenu),
      (l10n.sessionHelpStatusHeading, l10n.sessionHelpStatus),
      (l10n.sessionHelpWorkingHeading, l10n.sessionHelpWorking),
      (l10n.sessionHelpInlineHeading, l10n.sessionHelpInline),
      (l10n.sessionHelpPillHeading, l10n.sessionHelpPill),
      (l10n.sessionHelpTasksHeading, l10n.sessionHelpTasks),
      (l10n.sessionHelpActionsHeading, l10n.sessionHelpActions),
    ];

    return SessionSheet(
      title: l10n.sessionHelpTitle,
      description: l10n.sessionHelpIntro,
      child: ListView(
        padding: const EdgeInsets.all(Tokens.spaceMd),
        children: <Widget>[
          for (final (String heading, String text) in sections) ...<Widget>[
            SheetHeading(heading, padding: const EdgeInsets.only(top: Tokens.spaceSm)),
            Text(text, style: Theme.of(context).textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}
