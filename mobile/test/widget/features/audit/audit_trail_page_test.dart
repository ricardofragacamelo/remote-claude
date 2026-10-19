/// The trail screen: loading, empty, error-with-retry, and the list with "load more" (plan 26, B-32).
library;

import 'dart:async';

import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/features/audit/audit_providers.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:remote_claude/features/audit/domain/repositories/audit_repository.dart';
import 'package:remote_claude/features/audit/presentation/pages/audit_trail_page.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_audit_repository.dart';
import '../../../support/pump_app.dart';

AuditEntry _entry(String id) =>
    AuditEntry(id: id, at: DateTime.utc(2026, 9, 26), decision: AuditDecision.allowed);

void main() {
  late AppLocalizations l10n;
  late FakeAuditRepository repo;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => repo = FakeAuditRepository());

  Future<void> pump(WidgetTester tester, {bool pumpOnce = true}) => tester.pumpApp(
    const AuditTrailPage(sessionId: 's1', kind: 'shell'),
    overrides: <Override>[auditRepositoryProvider.overrideWithValue(repo as AuditRepository)],
    pumpOnce: pumpOnce,
  );

  testWidgets('the title names the kind, by its short name — never the engine\'s own', (
    WidgetTester tester,
  ) async {
    repo.pages[null] = const AuditEntryPage(entries: <AuditEntry>[]);
    await pump(tester);

    expect(find.text(l10n.auditTrailTitle(l10n.sessionKindShell)), findsOneWidget);
  });

  testWidgets('loading says so', (WidgetTester tester) async {
    repo.gate = Completer<void>();
    await pump(tester, pumpOnce: false);
    await tester.pump();

    expect(find.text(l10n.auditTrailLoading), findsOneWidget);
    repo.gate!.complete();
  });

  testWidgets('S-90 · an empty trail says why, and offers nothing to retry by mistake', (
    WidgetTester tester,
  ) async {
    repo.pages[null] = const AuditEntryPage(entries: <AuditEntry>[]);
    await pump(tester);

    expect(find.text(l10n.auditTrailEmptyTitle), findsOneWidget);
    expect(find.text(l10n.auditTrailEmptyDescription), findsOneWidget);
  });

  testWidgets('S-89 · the route failing says why, with "try again"', (WidgetTester tester) async {
    repo.failure = const NetworkFailure(traceId: 't');
    await pump(tester);

    expect(find.text(l10n.commonActionRetry), findsOneWidget);

    repo.failure = null;
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')]);
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();

    expect(find.text(l10n.auditDecisionAllowed), findsOneWidget);
  });

  testWidgets('S-88 · the list, with "load more" while there is a next page', (
    WidgetTester tester,
  ) async {
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')], nextCursor: 'c1');
    repo.pages['c1'] = AuditEntryPage(entries: <AuditEntry>[_entry('e2')]);
    await pump(tester);

    expect(find.text(l10n.auditTrailLoadMore), findsOneWidget);

    await tester.tap(find.text(l10n.auditTrailLoadMore));
    await tester.pumpAndSettle();

    expect(find.text(l10n.auditDecisionAllowed), findsNWidgets(2));
    expect(find.text(l10n.auditTrailLoadMore), findsNothing);
  });

  testWidgets('a later page that fails says why, and keeps the button to ask again', (
    WidgetTester tester,
  ) async {
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')], nextCursor: 'c1');
    await pump(tester);

    repo.failure = const NetworkFailure(traceId: 't');
    await tester.tap(find.text(l10n.auditTrailLoadMore));
    await tester.pumpAndSettle();

    expect(
      find.text(failureText(tester.element(find.byType(AuditTrailPage)), repo.failure! as Failure)),
      findsOneWidget,
    );
    expect(find.text(l10n.auditTrailLoadMore), findsOneWidget);
  });
}
