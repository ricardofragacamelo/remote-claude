/// Reads a `GET /audit-entries` body as [AuditEntryPage] — the generated `AuditTrailPagePayload` is
/// the wire, kept out of the domain layer like every other mapper in the app. An entry this build
/// cannot read is dropped, never the whole page: the trail that moves on without it is still the
/// trail, and one that silently went empty would be a lie about what happened.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';

/// [body] as a page of the trail, or `null` when it is not one this build can read.
AuditEntryPage? auditEntryPageFrom(Object? body) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  try {
    final AuditTrailPagePayload payload = AuditTrailPagePayload.fromJson(body);

    return AuditEntryPage(
      entries: <AuditEntry>[
        for (final AuditTrailPagePayloadEntriesItem entry in payload.entries) ?_entryFrom(entry),
      ],
      nextCursor: payload.nextCursor,
    );
  } on TypeError {
    return null;
  }
}

/// [entry] as an [AuditEntry], or `null` when its decision or its instant is not one this build can
/// read.
AuditEntry? _entryFrom(AuditTrailPagePayloadEntriesItem entry) {
  final AuditDecision? decision = switch (entry.decision) {
    'recorded' => AuditDecision.recorded,
    'allowed' => AuditDecision.allowed,
    'denied' => AuditDecision.denied,
    _ => null,
  };
  final DateTime? at = DateTime.tryParse(entry.at);

  if (decision == null || at == null) {
    return null;
  }

  return AuditEntry(id: entry.id, at: at, decision: decision, verdict: _verdictFrom(entry.verdict));
}

AuditVerdict? _verdictFrom(AuditTrailPagePayloadEntriesItemVerdict? verdict) => verdict == null
    ? null
    : AuditVerdict(
        auto: verdict.auto,
        ruleId: verdict.ruleId,
        resolvedBy: verdict.resolvedBy,
        resolvedFrom: verdict.resolvedFrom,
      );
