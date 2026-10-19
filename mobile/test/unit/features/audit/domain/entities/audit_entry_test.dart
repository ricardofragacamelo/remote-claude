/// One entry of the trail, as the domain has it (plan 26, B-32).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';

void main() {
  test('a verdict compares by its fields', () {
    expect(
      const AuditVerdict(auto: true, ruleId: 'r1'),
      const AuditVerdict(auto: true, ruleId: 'r1'),
    );
    expect(
      const AuditVerdict(auto: true, ruleId: 'r1'),
      isNot(const AuditVerdict(auto: true, ruleId: 'r2')),
    );
  });

  test('an entry compares by its id, its instant, its decision and its verdict', () {
    final DateTime at = DateTime.utc(2026, 9, 26);

    expect(
      AuditEntry(id: 'e1', at: at, decision: AuditDecision.allowed),
      AuditEntry(id: 'e1', at: at, decision: AuditDecision.allowed),
    );
    expect(
      AuditEntry(id: 'e1', at: at, decision: AuditDecision.allowed),
      isNot(AuditEntry(id: 'e1', at: at, decision: AuditDecision.denied)),
    );
  });

  test('a page compares by its entries and its next cursor', () {
    final DateTime at = DateTime.utc(2026, 9, 26);
    final List<AuditEntry> entries = <AuditEntry>[
      AuditEntry(id: 'e1', at: at, decision: AuditDecision.recorded),
    ];

    expect(
      AuditEntryPage(entries: entries, nextCursor: 'c1'),
      AuditEntryPage(entries: entries, nextCursor: 'c1'),
    );
    expect(
      AuditEntryPage(entries: entries, nextCursor: 'c1'),
      isNot(AuditEntryPage(entries: entries)),
    );
  });
}
