/// Plan 03, F4 — the cycle of a rule, in the real app, against the real backend.
///
/// The same scenarios the Playwright suite proves at the contract level
/// (`e2e/specs/rule-cycle.spec.ts` and `e2e/specs/trail-isolation.spec.ts`), read from the same
/// files in `e2e/scenarios/`, and proved here through the screens: the phone's card grants a rule
/// in two steps, the session the **browser** opened stops asking, the phone's rules screen takes the
/// rule back, and a revocation from both ends at once is one revocation.
///
/// The browser is a socket and an HTTP client from the outside ([BrowserSocket], [BackendAsBrowser]),
/// signed in as the same person: what is under test is the app, and the browser's own screens are
/// Playwright's.
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/permission/presentation/providers/rule_list_controller.dart';
import 'package:remote_claude/features/session/session.dart';

import 'support/browser_turns.dart';
import 'support/e2e_environment.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final BuildConfig config = e2eConfig();

  /// Opens the phone's rules screen, and answers its revoke buttons once the list has loaded.
  Future<Finder> revokeButtonsOnTheRulesScreen(WidgetTester tester, SignedInApp app) async {
    app.container.read(routerProvider).go(rulesRoute);
    final Finder revoke = find.descendant(
      of: find.byType(RuleTile),
      matching: find.text(app.l10n.rulesRevoke),
    );
    await pumpUntil(tester, () => revoke.evaluate().isNotEmpty);

    return revoke;
  }

  final E2eScenario fromThePhone = E2eScenario.named('mobile-rule-from-phone');

  testWidgets('${fromThePhone.id} — ${fromThePhone.title}', (WidgetTester tester) async {
    final (SignedInApp app, BrowserSocket browser, String sessionId) = await watchingTheBrowser(
      tester,
      config,
      fromThePhone,
    );
    addTearDown(app.browser.revokeEveryRule);
    final String fixture = fromThePhone.text('fixture');

    // The browser prompts; the phone answers "don't ask again anywhere" — in two steps, because the
    // second one is where the reach of the rule is said in full.
    final Map<String, Object?> granted = await answeredOnThePhone(
      tester,
      app,
      browser,
      sessionId,
      fixture,
      (String requestId) async {
        await extendedOnTheCard(tester, app, sessionId, requestId);

        await app.robot(tester).answer(app.l10n.permissionScopeAlways);
        await pumpUntil(
          tester,
          () => find.text(app.l10n.permissionPersistConfirm).evaluate().isNotEmpty,
        );
        await app.robot(tester).answer(app.l10n.permissionPersistConfirm);
      },
    );

    expect(granted, containsPair('resolvedFrom', fromThePhone.text('resolvedFrom')));
    expect(
      (await app.browser.rules()).map((Map<String, Object?> rule) => rule['scope']),
      contains(fromThePhone.text('scope')),
    );

    // The browser's next write asks nobody — not the browser, not the phone — and the phone says a
    // rule answered it.
    expect(
      await answeredByNobody(browser, sessionId, fixture),
      allOf(containsPair('auto', true), containsPair('decision', 'allow')),
    );
    await pumpUntil(tester, () => app.queueOf(sessionId).lastOutcome?.auto ?? false);
    expect(app.queueOf(sessionId).pending, isEmpty);
    // Said on the line of the tool the rule answered (plan 10, B-20): the settlement names it.
    final String? ruled = app.queueOf(sessionId).lastOutcome?.toolUseId;
    final Iterable<String> lines = app
        .conversationOf(sessionId)
        .tools
        .map((ToolExecution tool) => tool.toolUseId);
    expect(lines, contains(ruled), reason: 'the tool the rule answered, among the lines: $lines');
    await app.robot(tester).seeInConversation(find.text(app.l10n.permissionOutcomeAllowedByRule));

    // Taken back on the phone's own rules screen...
    final Finder revoke = await revokeButtonsOnTheRulesScreen(tester, app);
    await tapOnScreen(tester, revoke.first);
    await pumpUntil(tester, () => revoke.evaluate().isEmpty);

    // ...and the session the browser still has open asks again. Nobody answers it here, so the
    // deadline refuses it — which is also how the turn ends.
    final List<Map<String, Object?>> askedAgain = await turnFromTheBrowser(
      browser,
      sessionId,
      fixture,
    );
    expect(askedAgain.where(ofType('permission.requested')), hasLength(1));
    expect(await app.browser.rules(), isEmpty);
  });

  final E2eScenario revokeRace = E2eScenario.named('mobile-rule-revoke-race');

  testWidgets('${revokeRace.id} — ${revokeRace.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, revokeRace);
    addTearDown(app.browser.revokeEveryRule);
    await approvedFromTheBrowser(tester, app);

    final Map<String, Object?> granted = await app.browser.grantRule(
      'Write(/workspace/e2e-app-revoke-race.md)',
    );
    final String ruleId = granted['id']! as String;

    final Finder revoke = await revokeButtonsOnTheRulesScreen(tester, app);

    // The browser's revocation is already on its way when the phone's tap lands.
    final Future<Response<Map<String, Object?>>> fromTheWeb = app.browser.revokeRule(ruleId);
    await tapOnScreen(tester, revoke.first);
    final Response<Map<String, Object?>> toTheWeb = await fromTheWeb;

    expect(toTheWeb.statusCode, revokeRace.integer('status'));

    // The row leaves the phone with no failure under it: losing the race is not an error.
    await pumpUntil(tester, () => revoke.evaluate().isEmpty);
    expect(app.container.read(ruleListControllerProvider).value?.failedRuleId, isNull);

    // And both ends were told the one revocation the rule keeps.
    final Map<String, Object?> described = await app.browser.rule(ruleId);
    expect(described['status'], 'revoked');
    expect(described['revokedAt'], toTheWeb.data!['revokedAt']);
  });
}
