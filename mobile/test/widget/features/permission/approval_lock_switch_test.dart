/// The switch in front of the fingerprint-or-PIN prompt: on by default, and honest about a phone
/// that has no lock at all.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;
  late MemoryApprovalPreferences preferences;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpSwitch(WidgetTester tester, {bool hasLock = true}) async {
    preferences = MemoryApprovalPreferences();
    await tester.pumpApp(
      const ApprovalLockSwitch(),
      overrides: permissionOverrides(
        lock: FakeApprovalLock(available: hasLock),
        preferences: preferences,
      ),
      pumpOnce: false,
    );
  }

  testWidgets('is on, and cannot be moved, while the store has not answered', (
    WidgetTester tester,
  ) async {
    await pumpSwitch(tester);

    final SwitchListTile tile = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
    expect(tile.value, isTrue);
    expect(tile.onChanged, isNull);
  });

  testWidgets('is on by default, and turning it off is remembered', (WidgetTester tester) async {
    await pumpSwitch(tester);
    await tester.pumpAndSettle();

    expect(find.text(l10n.approvalLockBody), findsOneWidget);

    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();

    expect(preferences.required, isFalse);
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isFalse);
  });

  // D-07 — a phone with no lock is told why it cannot approve, right where the setting is.
  testWidgets('on a phone with no lock, says why it cannot approve', (WidgetTester tester) async {
    await pumpSwitch(tester, hasLock: false);
    await tester.pumpAndSettle();

    expect(find.text(l10n.permissionNoLockBody), findsOneWidget);
  });
}
