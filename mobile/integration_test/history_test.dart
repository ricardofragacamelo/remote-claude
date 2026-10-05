/// Plan 04, F5 — a session begun in the browser, opened on the phone.
///
/// The same scenario the Playwright suite proves at the contract level
/// (`e2e/specs/history-and-resume.spec.ts`), read from the same file in `e2e/scenarios/`, and proved
/// here through the screens: the browser opens a session and has a turn, and the app opens it by
/// its address — with what was already said on screen, not only what comes after it — and then
/// reads the whole conversation on its history screen.
///
/// The browser is a socket from the outside ([BrowserSocket]), signed in as the same person: what
/// is under test is the app.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/session.dart';

import 'support/e2e_environment.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final BuildConfig config = e2eConfig();
  final E2eScenario onThePhone = E2eScenario.named('mobile-history');

  testWidgets('${onThePhone.id} — ${onThePhone.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, onThePhone);
    await approvedFromTheBrowser(tester, app);

    final BrowserSocket browser = await BrowserSocket.open(config, app.accessToken);
    final String workspace = await app.browser.firstWorkspace();
    final String sessionId = await browser.start(workspace);
    addTearDown(() async {
      await browser.closeSession(sessionId);
      await browser.close();
    });

    await browser.turn(sessionId, onThePhone.text('fixture'), text: onThePhone.text('prompt'));

    // Opened on the phone after the turn ended. The app says it has nothing — and gets what the
    // buffer holds, the answer included, instead of a screen that waits for what comes next.
    app.container.read(routerProvider).go(sessionRouteFor(sessionId));
    await pumpUntil(tester, () => find.byType(SessionPage).evaluate().isNotEmpty);
    await pumpUntil(tester, () => find.text(onThePhone.text('answer')).evaluate().isNotEmpty);

    // And the whole conversation, from its history screen: the prompt the browser sent, and the
    // answer it got.
    final Map<String, Object?> started = browser.frames.firstWhere(
      (Map<String, Object?> frame) => frame['type'] == 'session.started',
    );
    final String conversationId =
        (started['payload']! as Map<String, Object?>)['claudeSessionId']! as String;

    app.container.read(routerProvider).go(conversationRouteFor(conversationId, workspace));
    await pumpUntil(tester, () => find.byType(ConversationHistoryPage).evaluate().isNotEmpty);

    // Looked for **on** the history screen: the session screen being left is still in the tree
    // while the transition runs, with the same answer on it.
    Finder onHistory(Finder matching) =>
        find.descendant(of: find.byType(ConversationHistoryPage), matching: matching);
    await pumpUntil(
      tester,
      () => onHistory(find.textContaining(onThePhone.text('prompt'))).evaluate().isNotEmpty,
    );
    expect(onHistory(find.text(onThePhone.text('answer'))), findsOneWidget);
  });
}
