/// One row of the trail of a session and a kind of call — "what ran here, and who let it?" (plan 26,
/// B-32), read-only, never filtered by the engine's own name for a tool: the list is already scoped
/// to one `kind`, so a row carries nothing a card did not already show.
library;

import 'package:equatable/equatable.dart';

/// How the call ended, as the trail keeps it.
enum AuditDecision {
  /// Logged with nothing to decide — no permission was asked about it.
  recorded,

  /// A permission request let it through.
  allowed,

  /// A permission request refused it.
  denied,
}

/// What settled a request the trail logged — `null` on a [AuditDecision.recorded] entry, which asked
/// nothing of anybody.
class AuditVerdict extends Equatable {
  const AuditVerdict({required this.auto, this.ruleId, this.resolvedBy, this.resolvedFrom});

  /// The server decided with nobody answering — the deadline, or a rule.
  final bool auto;

  /// The rule that answered, when one did.
  final String? ruleId;

  /// Who decided, as the server said it — opaque: shown as it came, never parsed.
  final String? resolvedBy;

  /// Where the answer came from, as the server said it — opaque, like [resolvedBy].
  final String? resolvedFrom;

  @override
  List<Object?> get props => <Object?>[auto, ruleId, resolvedBy, resolvedFrom];
}

/// One entry of the trail.
class AuditEntry extends Equatable {
  const AuditEntry({required this.id, required this.at, required this.decision, this.verdict});

  final String id;
  final DateTime at;
  final AuditDecision decision;
  final AuditVerdict? verdict;

  @override
  List<Object?> get props => <Object?>[id, at, decision, verdict];
}

/// One page of the trail.
class AuditEntryPage extends Equatable {
  const AuditEntryPage({required this.entries, this.nextCursor});

  final List<AuditEntry> entries;

  /// The next page's cursor, or `null` when this was the last one.
  final String? nextCursor;

  @override
  List<Object?> get props => <Object?>[entries, nextCursor];
}
