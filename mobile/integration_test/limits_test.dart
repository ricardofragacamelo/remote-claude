/// Plan 05, F4 — the limits, in the real app, against the limits stack.
///
/// The same scenarios the Playwright suite proves in the browser (`e2e/specs/limits.spec.ts`), read
/// from the same files in `e2e/scenarios/`, and proved here through the app's screens: a machine at
/// its ceiling, the last slot raced for, a session reaped for sitting idle, a client that sends too
/// fast, a token that expires in the middle of a turn, and a renewal the provider refuses.
///
/// The app is pointed at the **limits stack** — the second backend of the run, with a ceiling of two
/// sessions, twenty seconds idle and twenty frames a second — by configuration, the way an
/// installation would be. What each scenario proves is the same: under a limit the screen says
/// what happened, translated, and nothing sits there waiting for an answer that is not coming.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/workspace/workspace.dart';

import 'support/e2e_environment.dart';
import 'support/limits.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final AppConfig config = limitsConfig();

  final E2eScenario ceiling = E2eScenario.named('limits-ceiling');
  final E2eScenario freed = E2eScenario.named('limits-slot-freed');
  final E2eScenario lastSlot = E2eScenario.named('limits-last-slot');
  final E2eScenario idle = E2eScenario.named('limits-idle');
  final E2eScenario rate = E2eScenario.named('limits-rate');
  final E2eScenario expiry = E2eScenario.named('limits-token-expiry');
  final E2eScenario refused = E2eScenario.named('limits-renewal-refused');

  /// A browser of the same person on the limits stack, with every session it knows of ended after
  /// the test — the next one counts slots.
  Future<(BrowserSocket, List<String>)> browserOf(SignedInApp app) async {
    final BrowserSocket browser = await BrowserSocket.open(config, app.accessToken);
    final List<String> opened = <String>[];

    addTearDown(() async {
      for (final String sessionId in opened) {
        await endOnLimits(browser, sessionId);
      }
      await browser.close();
    });

    return (browser, opened);
  }

  /// The folders of the list, once it is on screen.
  Future<Finder> theFolders(WidgetTester tester, SignedInApp app) async {
    app.container.read(routerProvider).go(workspacesRoute);

    final Finder folders = find.descendant(
      of: find.byType(WorkspaceListPage),
      matching: find.byType(ListTile),
    );
    await pumpUntil(tester, () => folders.evaluate().isNotEmpty);
    await tester.pumpAndSettle();

    return folders;
  }

  /// The session screen the app is on, once it is on one.
  String? sessionOnScreen(WidgetTester tester) {
    final Finder page = find.byType(SessionPage);
    return page.evaluate().isEmpty ? null : tester.widget<SessionPage>(page).sessionId;
  }

  /// Sends a turn through the composer, naming the recording the scripted backend replays — once
  /// the composer takes one, and only done when the box has been emptied by the send.
  Future<void> prompted(WidgetTester tester, SignedInApp app, String fixture) async {
    final Finder box = find.byType(TextField);
    await pumpUntil(tester, () => tester.widget<TextField>(box).enabled ?? true);

    await tester.enterText(box, 'do the work [fixture:$fixture]');
    await tester.pump();
    await tapOnScreen(tester, find.text(app.l10n.sessionPromptAction));
    await pumpUntil(tester, () => tester.widget<TextField>(box).controller?.text.isEmpty ?? true);
  }

  Conversation conversationOf(SignedInApp app, String sessionId) =>
      app.container.read(liveSessionControllerProvider(sessionId)).conversation;

  /// A session opened from the list, and ended after the test.
  Future<String> openedOnScreen(WidgetTester tester, SignedInApp app) async {
    final (_, List<String> opened) = await browserOf(app);
    final String sessionId = await sessionOpenedFromTheList(tester, app.container);
    opened.add(sessionId);
    return sessionId;
  }

  /// An approved phone whose tokens live seconds, with a turn held open on a question nobody has
  /// answered yet. Approved, because a phone still pending may watch a question but not answer it
  /// (S-55); the provider is put back after the test.
  Future<(SignedInApp, String, ProviderAdmin)> heldTurn(
    WidgetTester tester,
    E2eScenario scenario,
  ) async {
    final ProviderAdmin admin = ProviderAdmin();
    addTearDown(await admin.shortenTokens(scenario.integer('tokenLifetimeSeconds')));

    final SignedInApp app = await signedInApp(tester, config, scenario);
    await approvedFromTheBrowser(tester, app);

    final String sessionId = await openedOnScreen(tester, app);
    await prompted(tester, app, scenario.text('fixture'));
    await pumpUntil(tester, () => app.queueOf(sessionId).pending.isNotEmpty);

    return (app, sessionId, admin);
  }

  testWidgets('${ceiling.id} and ${freed.id} — ${ceiling.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, ceiling);
    final (BrowserSocket browser, List<String> opened) = await browserOf(app);
    final String workspace = await app.browser.firstWorkspace();

    // The machine fills up from the browser.
    String? refusedWith;
    while (refusedWith == null && opened.length <= ceiling.integer('ceiling')) {
      final ({String? sessionId, String? refusedWith}) outcome = await browser.startOrRefusal(
        workspace,
      );
      opened.addAll(<String>[?outcome.sessionId]);
      refusedWith = outcome.refusedWith;
    }
    expect(opened, hasLength(ceiling.integer('ceiling')));
    expect(refusedWith, ceiling.text('code'));

    // S-41: the tap on the folder says why nothing opened, translated — beside the folder.
    final Finder folders = await theFolders(tester, app);
    await tester.tap(folders.first);
    final String refusal = app.l10n.sessionErrorLimitReached('${ceiling.integer('ceiling')}');
    await pumpUntil(tester, () => find.text(refusal).evaluate().isNotEmpty);
    expect(sessionOnScreen(tester), isNull);

    // S-78: one ends, and the next tap opens.
    await endOnLimits(browser, opened.removeAt(0));
    await tester.tap(folders.first);
    await pumpUntil(tester, () => sessionOnScreen(tester) != null);
    opened.add(sessionOnScreen(tester)!);
  });

  testWidgets('${lastSlot.id} — ${lastSlot.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, lastSlot);
    final (BrowserSocket browser, List<String> opened) = await browserOf(app);
    final String workspace = await app.browser.firstWorkspace();

    for (int taken = 0; taken < lastSlot.integer('ceiling') - 1; taken += 1) {
      opened.add(await browser.start(workspace));
    }

    // The browser and the phone ask for the last slot at the same moment.
    final Finder folders = await theFolders(tester, app);
    final Future<({String? sessionId, String? refusedWith})> fromTheBrowser = browser
        .startOrRefusal(workspace);
    await tester.tap(folders.first);

    final String refusal = app.l10n.sessionErrorLimitReached('${lastSlot.integer('ceiling')}');
    await pumpUntil(
      tester,
      () => sessionOnScreen(tester) != null || find.text(refusal).evaluate().isNotEmpty,
    );
    final ({String? sessionId, String? refusedWith}) browsers = await fromTheBrowser;

    // Exactly one of the two opened; the other was told why, and is not waiting.
    final String? phones = sessionOnScreen(tester);
    expect(<String?>[phones, browsers.sessionId].nonNulls, hasLength(1));
    opened.addAll(<String>[?phones, ?browsers.sessionId]);

    if (phones == null) {
      expect(find.text(refusal), findsOneWidget);
    } else {
      expect(browsers.refusedWith, lastSlot.text('code'));
    }
  });

  testWidgets('${idle.id} — ${idle.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, idle);

    final String sessionId = await sessionOpenedFromTheList(tester, app.container);
    await prompted(tester, app, idle.text('fixture'));
    await pumpUntil(tester, () => conversationOf(app, sessionId).lastTurn != null);

    // Then nothing — for longer than the TTL, plus the quarter of it the reaper may take to look.
    await pumpUntil(
      tester,
      () => find.text(app.l10n.sessionClosedIdleTimeout).evaluate().isNotEmpty,
      timeout: Duration(seconds: idle.integer('idleTtlSeconds') * 2),
    );
    expect(conversationOf(app, sessionId).ending?.reason, SessionCloseReason.idleTimeout);

    // What only a live session can do is off.
    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
  });

  testWidgets('${rate.id} — ${rate.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedInApp(tester, config, rate);
    final String sessionId = await openedOnScreen(tester, app);

    final WsClient socket = app.container.read(wsClientProvider);
    final List<(DateTime, ConnectionStatus)> statuses = <(DateTime, ConnectionStatus)>[];
    final StreamSubscription<ConnectionStatus> watching = socket.statuses.listen(
      (ConnectionStatus status) => statuses.add((DateTime.now(), status)),
    );
    addTearDown(watching.cancel);

    // The app itself sends far faster than the server allows.
    for (int index = 0; index < rate.integer('burst'); index += 1) {
      socket.send('e2e.hammer', <String, Object?>{'index': index});
    }

    // Told why, translated — and holding, not reconnecting as if the network had gone.
    await pumpUntil(
      tester,
      () => find.text(app.l10n.connectionStatusThrottled).evaluate().isNotEmpty,
    );
    await pumpUntil(tester, () => socket.status == ConnectionStatus.ready);

    // It came back no sooner than the server asked — a second, in this installation.
    final DateTime heldAt = statuses
        .firstWhere(((DateTime, ConnectionStatus) entry) => entry.$2 == ConnectionStatus.throttled)
        .$1;
    final DateTime backAt = statuses
        .lastWhere(((DateTime, ConnectionStatus) entry) => entry.$2 == ConnectionStatus.connecting)
        .$1;
    expect(backAt.difference(heldAt), greaterThanOrEqualTo(const Duration(seconds: 1)));

    // And the session is watched again: a turn sent now is seen through.
    await prompted(tester, app, 'text-turn');
    await pumpUntil(tester, () => conversationOf(app, sessionId).lastTurn != null);
  });

  testWidgets('${expiry.id} — ${expiry.title}', (WidgetTester tester) async {
    final (SignedInApp app, String sessionId, _) = await heldTurn(tester, expiry);
    // The first token is the one of the sign-in: nothing has been renewed yet this early.
    final String first = app.accessToken;

    final WsClient socket = app.container.read(wsClientProvider);
    final List<ConnectionStatus> statuses = <ConnectionStatus>[];
    final StreamSubscription<ConnectionStatus> watching = socket.statuses.listen(statuses.add);
    addTearDown(watching.cancel);

    // The token the socket was opened with expires while the turn is open, and a renewed one is
    // handed to the same socket.
    await pumpUntil(
      tester,
      () => DateTime.now().isAfter(expiryOf(first)) && app.accessToken != first,
      timeout: const Duration(seconds: 60),
    );

    // The turn carries on to its end, answered from the same screen.
    await tapOnScreen(tester, find.text(app.l10n.permissionScopeOnce).first);
    await pumpUntil(tester, () => conversationOf(app, sessionId).lastTurn != null);

    // And the person saw nothing: the connection never left `ready`, and nobody was signed out.
    expect(statuses.where((ConnectionStatus status) => status != ConnectionStatus.ready), isEmpty);
    expect(find.byType(SignInPage), findsNothing);
  });

  testWidgets('${refused.id} — ${refused.title}', (WidgetTester tester) async {
    final (SignedInApp app, _, ProviderAdmin admin) = await heldTurn(tester, refused);

    // Cut off at the provider in the middle of the turn: the next renewal is refused, and the app
    // asks to sign in again instead of holding a question nobody can answer.
    await admin.endSessionsOf(refused.user['username']!);
    await pumpUntil(
      tester,
      () => find.text(app.l10n.authSignInTitle).evaluate().isNotEmpty,
      timeout: const Duration(seconds: 60),
    );
  });
}
