/// The plan card's next mode: only the canonical modes an approved plan can go on in, of those the
/// session's engine announced (plan 28, B-27).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/plan_interaction.dart';
import 'package:remote_claude/features/permission/presentation/widgets/plan_approval_card.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/permissions.dart';
import '../../../support/builders/tools.dart';
import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;
  late List<String?> approved;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpCard(WidgetTester tester, List<String> modes) async {
    approved = <String?>[];
    tester.view
      ..physicalSize = const Size(600, 2400)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpApp(
      SingleChildScrollView(
        child: PlanApprovalCard(
          card: PermissionCard(
            request: aPermissionRequest(
              call: planCall(),
              plan: const PlanInteraction(markdown: 'The plan'),
              description: null,
              riskHint: RiskHint.read,
            ),
            frameId: 'frame-1',
          ),
          plan: const PlanInteraction(markdown: 'The plan'),
          now: t0,
          modes: modes,
          onApprove: approved.add,
          onKeepPlanning: (String _) {},
          onExtend: () {},
        ),
      ),
    );
  }

  Future<void> approve(WidgetTester tester) async {
    await tester.tap(find.text(l10n.permissionPlanApprove));
    await tester.pumpAndSettle();
  }

  test('S-81 · of what the engine announced, the modes a plan goes on in, in their order', () {
    expect(planModesOf(const <String>['allowAll', 'acceptEdits', 'readOnly', 'ask']), <String>[
      'ask',
      'acceptEdits',
    ]);
    expect(planModesOf(const <String>['readOnly', 'allowAll']), isEmpty);
    expect(planModesOf(const <String>[]), isEmpty);
  });

  testWidgets('S-81 · both announced: the choice is offered, asking first', (
    WidgetTester tester,
  ) async {
    await pumpCard(tester, const <String>['ask', 'acceptEdits', 'readOnly', 'allowAll']);

    expect(find.text(l10n.permissionPlanModeLegend), findsOneWidget);
    expect(find.text(l10n.permissionPlanModeAsk), findsOneWidget);
    expect(find.text(l10n.permissionPlanModeAcceptEdits), findsOneWidget);

    await approve(tester);
    expect(approved, <String?>['ask']);
  });

  testWidgets('S-81 · the mode picked is the one the plan goes on in', (WidgetTester tester) async {
    await pumpCard(tester, const <String>['ask', 'acceptEdits']);

    await tester.tap(find.text(l10n.permissionPlanModeAcceptEdits));
    await tester.pumpAndSettle();
    await approve(tester);

    expect(approved, <String?>['acceptEdits']);
  });

  testWidgets('S-81 · one announced is no choice: no radios, and the plan goes on in it', (
    WidgetTester tester,
  ) async {
    await pumpCard(tester, const <String>['acceptEdits', 'readOnly']);

    expect(find.text(l10n.permissionPlanModeLegend), findsNothing);
    expect(find.byType(RadioListTile<String>), findsNothing);

    await approve(tester);
    expect(approved, <String?>['acceptEdits']);
  });

  testWidgets('S-81 · none announced: the plan is approved and no mode is named', (
    WidgetTester tester,
  ) async {
    await pumpCard(tester, const <String>[]);

    expect(find.byType(RadioListTile<String>), findsNothing);

    await approve(tester);
    expect(approved, <String?>[null]);
  });
}
