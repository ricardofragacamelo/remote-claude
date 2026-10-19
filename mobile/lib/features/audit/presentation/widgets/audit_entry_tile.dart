/// One entry of the trail: when it happened, how it was decided, and who let it — never the engine's
/// own name for the tool, which the list is already scoped to by its `kind` (plan 26, B-32).
library;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The word for [decision].
String auditDecisionWord(AppLocalizations l10n, AuditDecision decision) => switch (decision) {
  AuditDecision.recorded => l10n.auditDecisionRecorded,
  AuditDecision.allowed => l10n.auditDecisionAllowed,
  AuditDecision.denied => l10n.auditDecisionDenied,
};

/// Who decided, and from where — `null` on a [AuditDecision.recorded] entry, which asked nobody
/// anything. [resolvedBy] and [resolvedFrom] are opaque, exactly as the server sent them: drawn
/// verbatim, never parsed into a case of their own.
String? auditVerdictSentence(AppLocalizations l10n, AuditVerdict? verdict) {
  if (verdict == null) {
    return null;
  }

  if (verdict.auto) {
    return verdict.ruleId != null ? l10n.auditResolvedByRule : l10n.auditResolvedAuto;
  }

  return switch ((verdict.resolvedBy, verdict.resolvedFrom)) {
    (null, null) => l10n.auditResolvedByPerson,
    (final String who?, null) => l10n.auditResolvedByNamed(who),
    (null, final String place?) => l10n.auditResolvedFrom(place),
    (final String who?, final String place?) => l10n.auditResolvedByNamedFrom(who, place),
  };
}

/// The icon and colour [decision] is drawn with.
(IconData, Color) _markOf(AuditDecision decision, ColorScheme colours) => switch (decision) {
  AuditDecision.allowed => (Icons.check_circle_outline, colours.primary),
  AuditDecision.denied => (Icons.block, colours.error),
  AuditDecision.recorded => (Icons.history, colours.onSurfaceVariant),
};

/// One row of the trail.
class AuditEntryTile extends StatelessWidget {
  const AuditEntryTile({required this.entry, super.key});

  final AuditEntry entry;

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final String when = DateFormat.yMMMd(locale).add_Hm().format(entry.at.toLocal());
    final AppLocalizations l10n = AppLocalizations.of(context);
    final String? who = auditVerdictSentence(l10n, entry.verdict);
    final (IconData icon, Color colour) = _markOf(entry.decision, Theme.of(context).colorScheme);

    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: colour),
      title: Text(auditDecisionWord(l10n, entry.decision)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[Text(when), if (who != null) Text(who)],
      ),
    );
  }
}
