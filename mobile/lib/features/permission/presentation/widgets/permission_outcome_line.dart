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

  if (outcome.auto) {
    return _automaticSentence(l10n, outcome.via, allowed: allowed);
  }

  return switch (outcome.origin) {
    AnswerOrigin.web =>
      allowed ? l10n.permissionOutcomeAllowedWeb : l10n.permissionOutcomeRefusedWeb,
    AnswerOrigin.mobile =>
      allowed ? l10n.permissionOutcomeAllowedPhone : l10n.permissionOutcomeRefusedPhone,
    AnswerOrigin.unknown => allowed ? l10n.permissionOutcomeAllowed : l10n.permissionOutcomeRefused,
  };
}

/// Decided by the server with nobody answering, and not the deadline: Permitir tudo, when the server
/// says so (plan 23, S-93), the read-only mode (plan 28, B-26), or a rule — of this session, this
/// project or every project. The event does not say which rule, so the sentence does not either.
String _automaticSentence(AppLocalizations l10n, AnswerVia? via, {required bool allowed}) =>
    switch ((allowed, via)) {
      (true, AnswerVia.allowAll) => l10n.permissionOutcomeAllowedByAllowAll,
      (false, AnswerVia.readOnly) => l10n.permissionRefusedReadOnly,
      (true, _) => l10n.permissionOutcomeAllowedByRule,
      (false, _) => l10n.permissionOutcomeRefusedByRule,
    };

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
