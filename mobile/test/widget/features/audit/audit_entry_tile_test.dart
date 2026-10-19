/// One row of the trail: when, the decision, and who let it (plan 26, B-32).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:remote_claude/features/audit/presentation/widgets/audit_entry_tile.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('a recorded entry says so, and nothing about who decided — nobody was asked', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      AuditEntryTile(
        entry: AuditEntry(
          id: 'e1',
          at: DateTime.utc(2026, 9, 26, 12),
          decision: AuditDecision.recorded,
        ),
      ),
    );

    expect(find.text(l10n.auditDecisionRecorded), findsOneWidget);
    expect(find.text(l10n.auditResolvedByPerson), findsNothing);
  });

  testWidgets('an allowed entry decided automatically by a rule', (WidgetTester tester) async {
    await tester.pumpApp(
      AuditEntryTile(
        entry: AuditEntry(
          id: 'e1',
          at: DateTime.utc(2026, 9, 26, 12),
          decision: AuditDecision.allowed,
          verdict: const AuditVerdict(auto: true, ruleId: 'rule-1'),
        ),
      ),
    );

    expect(find.text(l10n.auditDecisionAllowed), findsOneWidget);
    expect(find.text(l10n.auditResolvedByRule), findsOneWidget);
  });

  testWidgets('a denied entry decided by a named person, from a named place', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      AuditEntryTile(
        entry: AuditEntry(
          id: 'e1',
          at: DateTime.utc(2026, 9, 26, 12),
          decision: AuditDecision.denied,
          verdict: const AuditVerdict(auto: false, resolvedBy: 'alice', resolvedFrom: 'mobile'),
        ),
      ),
    );

    expect(find.text(l10n.auditDecisionDenied), findsOneWidget);
    expect(find.text(l10n.auditResolvedByNamedFrom('alice', 'mobile')), findsOneWidget);
  });
}
