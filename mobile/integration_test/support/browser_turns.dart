/// A browser driving a session the phone watches — the half of the cross-client suites that is not
/// the app (plan 03, F4; plan 23, F5).
///
/// The browser is a socket from the outside ([BrowserSocket]), signed in as the same person: what is
/// under test is the app, and the browser's own screens are Playwright's.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/session.dart';

import 'e2e_environment.dart';
import 'signed_in_app.dart';

/// The payload of a frame the browser socket received.
Map<String, Object?> payloadOf(Map<String, Object?> frame) =>
    frame['payload']! as Map<String, Object?>;

/// Whether [frame] is of [type].
bool Function(Map<String, Object?>) ofType(String type) =>
    (Map<String, Object?> frame) => frame['type'] == type;

/// The browser opens a session, and the phone opens it by its address — attached, watching.
Future<(BrowserSocket, String)> openedInTheBrowser(
  WidgetTester tester,
  SignedInApp app,
  BuildConfig config,
) async {
  final BrowserSocket browser = await BrowserSocket.open(config, app.accessToken);
  final String sessionId = await browser.start(await app.browser.firstWorkspace());
  addTearDown(() async {
    await browser.closeSession(sessionId);
    await browser.close();
  });

  app.container.read(routerProvider).go(sessionRouteFor(sessionId));
  await pumpUntil(tester, () => find.byType(SessionPage).evaluate().isNotEmpty);

  return (browser, sessionId);
}

/// The browser prompts the recorded [fixture], and waits for the turn to finish.
///
/// [whileRunning] is what happens in the app between the prompt and the end of the turn.
///
/// @returns every frame the browser received during the turn
Future<List<Map<String, Object?>>> turnFromTheBrowser(
  BrowserSocket browser,
  String sessionId,
  String fixture, {
  Future<void> Function()? whileRunning,
}) async {
  final int mark = browser.frames.length;
  browser.prompt(sessionId, fixture);
  await whileRunning?.call();
  await browser.waitFor(ofType('turn.completed'), from: mark);

  return browser.frames.skip(mark).toList();
}

/// A phone approved to decide, signed in for [scenario], watching a session the browser opened.
Future<(SignedInApp, BrowserSocket, String)> watchingTheBrowser(
  WidgetTester tester,
  BuildConfig config,
  E2eScenario scenario,
) async {
  final SignedInApp app = await anApprovedApp(tester, config, scenario);
  final (BrowserSocket browser, String sessionId) = await openedInTheBrowser(tester, app, config);

  return (app, browser, sessionId);
}

/// The browser prompts [fixture]; the phone, once its question is on screen, does [answer] with the
/// request's id, and the turn goes on once the settlement is back.
///
/// @returns the payload of the one `permission.resolved` of the turn
Future<Map<String, Object?>> answeredOnThePhone(
  WidgetTester tester,
  SignedInApp app,
  BrowserSocket browser,
  String sessionId,
  String fixture,
  Future<void> Function(String requestId) answer,
) async {
  final List<Map<String, Object?>> frames = await turnFromTheBrowser(
    browser,
    sessionId,
    fixture,
    whileRunning: () async {
      await pumpUntil(tester, () => app.queueOf(sessionId).pending.isNotEmpty);
      final String requestId = app.queueOf(sessionId).pending.single.requestId;
      await answer(requestId);
      await pumpUntil(tester, () => app.queueOf(sessionId).outcomeOf(requestId) != null);
    },
  );

  return payloadOf(frames.where(ofType('permission.resolved')).single);
}

/// The browser prompts [fixture], and nobody is asked — not the browser, not the phone.
///
/// @returns the payload of the one `permission.resolved` of the turn: what answered instead
Future<Map<String, Object?>> answeredByNobody(
  BrowserSocket browser,
  String sessionId,
  String fixture,
) async {
  final List<Map<String, Object?>> frames = await turnFromTheBrowser(browser, sessionId, fixture);

  expect(frames.where(ofType('permission.requested')), isEmpty);
  return payloadOf(frames.where(ofType('permission.resolved')).single);
}
