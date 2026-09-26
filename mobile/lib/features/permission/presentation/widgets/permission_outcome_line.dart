/// How a request ended, in one sentence.
///
/// Losing the race is not an error: the card leaves, and this says who won — the decision that
/// reached the agent is the one the server published, not necessarily the one tapped here.
library;

import 'package:flutter/material.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The sentence for [outcome].
String outcomeSentence(AppLocalizations l10n, PermissionOutcome outcome) {
  final bool allowed = outcome.decision == PermissionDecision.allow;

  if (outcome.expired) {
    return l10n.permissionOutcomeExpired;
  }

  // Decided by the server with nobody answering, and not the deadline: a rule — of this session,
  // this project or every project. The event does not say which, so the sentence does not either.
  if (outcome.auto) {
    return allowed ? l10n.permissionOutcomeAllowedByRule : l10n.permissionOutcomeRefusedByRule;
  }

  return switch (outcome.origin) {
    AnswerOrigin.web =>
      allowed ? l10n.permissionOutcomeAllowedWeb : l10n.permissionOutcomeRefusedWeb,
    AnswerOrigin.mobile =>
      allowed ? l10n.permissionOutcomeAllowedPhone : l10n.permissionOutcomeRefusedPhone,
    AnswerOrigin.unknown => allowed ? l10n.permissionOutcomeAllowed : l10n.permissionOutcomeRefused,
  };
}

/// The line under the queue that says how the last request ended.
class PermissionOutcomeLine extends StatelessWidget {
  const PermissionOutcomeLine({required this.outcome, super.key});

  final PermissionOutcome outcome;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool allowed = outcome.decision == PermissionDecision.allow;

    return Semantics(
      liveRegion: true,
      child: Row(
        children: <Widget>[
          Icon(
            allowed ? Icons.check_circle_outline : Icons.block,
            color: allowed ? theme.colorScheme.primary : theme.colorScheme.error,
          ),
          const SizedBox(width: Tokens.spaceSm),
          Expanded(
            child: Text(
              outcomeSentence(AppLocalizations.of(context), outcome),
              style: theme.textTheme.bodyMedium,
            ),
          ),
        ],
      ),
    );
  }
}
