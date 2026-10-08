/// Plan 23, F5 — fewer questions, in the real app, against the real backend.
///
/// The same scenarios the Playwright suite proves through the browser
/// (`e2e/specs/fluid-permissions.spec.ts`), read from the same files in `e2e/scenarios/`, and proved
/// here through the phone's screens: Permitir tudo switched on in the chip of the session answers the
/// browser's write without a card, switched off it asks again; and a yes for the session whose reach
/// is the whole tool answers the next write by itself.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';

import 'support/browser_turns.dart';
import 'support/e2e_environment.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final BuildConfig config = e2eConfig();

  /// Picks [mode] in the chip of the session, and waits for the server to have taken it.
  Future<void> switchTo(WidgetTester tester, SignedInApp app, String sessionId, String mode) async {
    final String name = switch (mode) {
      'allowAll' => app.l10n.modeAllowAll,
      _ => app.l10n.modeDefault,
    };
    await app.robot(tester).pick(app.l10n.modeLabel, name);
    await pumpUntil(tester, () {
      final LiveSession live = app.container.read(liveSessionControllerProvider(sessionId));
      return live.permissionMode == mode && !live.isChoosing;
    });
  }

  final E2eScenario allowAll = E2eScenario.named('mobile-fluid-allow-all');

  testWidgets('${allowAll.id} — ${allowAll.title}', (WidgetTester tester) async {
    final (SignedInApp app, BrowserSocket browser, String sessionId) = await watchingTheBrowser(
      tester,
      config,
      allowAll,
    );
    final String fixture = allowAll.text('fixture');

    await switchTo(tester, app, sessionId, 'allowAll');

    expect(
      await answeredByNobody(browser, sessionId, fixture),
      allOf(containsPair('decision', 'allow'), containsPair('via', allowAll.text('via'))),
    );
    await pumpUntil(tester, () => app.queueOf(sessionId).lastOutcome?.via == AnswerVia.allowAll);
    await app
        .robot(tester)
        .seeInConversation(find.text(app.l10n.permissionOutcomeAllowedByAllowAll));

    // Switched off, the next write is put to the phone again.
    await switchTo(tester, app, sessionId, 'default');
    final Map<String, Object?> asked = await answeredOnThePhone(
      tester,
      app,
      browser,
      sessionId,
      fixture,
      (String _) => app.robot(tester).answer(app.l10n.permissionScopeOnce),
    );

    expect(asked, allOf(containsPair('auto', false), containsPair('resolvedFrom', 'mobile')));
  });

  final E2eScenario reach = E2eScenario.named('mobile-fluid-rule-reach');

  testWidgets('${reach.id} — ${reach.title}', (WidgetTester tester) async {
    final (SignedInApp app, BrowserSocket browser, String sessionId) = await watchingTheBrowser(
      tester,
      config,
      reach,
    );
    final String fixture = reach.text('fixture');

    final Map<String, Object?> granted = await answeredOnThePhone(
      tester,
      app,
      browser,
      sessionId,
      fixture,
      (String _) async {
        // The whole tool, said in full — its pattern — before it is chosen.
        await tapOnScreen(tester, find.text(app.l10n.permissionReachTool));
        await tester.pumpAndSettle();
        expect(find.text(reach.text('pattern')), findsWidgets);
        await app.robot(tester).answer(app.l10n.permissionScopeSession);
      },
    );

    expect(granted, containsPair('resolvedFrom', 'mobile'));
    expect(
      await answeredByNobody(browser, sessionId, fixture),
      allOf(containsPair('auto', true), containsPair('via', reach.text('via'))),
    );
  });
}
