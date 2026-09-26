/// Plan 02, B-28 — the permission flows, in the real app, against the real backend.
///
/// The same scenarios the Playwright suite proves at the contract level
/// (`e2e/specs/mobile-approval.spec.ts`), read from the same files in `e2e/scenarios/`, and proved
/// here through the screens: a phone that is still pending, a phone that answers, a notification's
/// address opened and revalidated, a notification opened too late, and a revocation that reaches
/// the app while it is open.
///
/// Three edges are replaced, and only three: the system's sign-in tab, the Keychain and the lock
/// screen — none of which a headless run can press. Everything between them is the shipped code,
/// over the socket and the HTTP API of the running stack, whose Agent SDK is a recorded run
/// (`backend start:scripted`) and whose permission deadline is five seconds.
///
/// The notification itself is **not** delivered here — that is `patrol_test/push_delivery_test.dart`
/// (D-26): the ephemeral stack points push at
/// `push.invalid` to stay hermetic, and with the app open the backend rightly sends none (S-16),
/// so the tap on a notification is the one thing this run cannot produce. What a
/// tap does — ask the app to open the request's address — is driven through the same controller
/// the platform tap goes through.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/navigation/deep_link_controller.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/permission.dart';

import 'support/e2e_environment.dart';
import 'support/signed_in_app.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final AppConfig config = e2eConfig();

  Future<SignedInApp> signedIn(WidgetTester tester, E2eScenario scenario) =>
      signedInApp(tester, config, scenario);

  /// Opens a session on the first folder of the allowlist, through the list, and answers its id.
  Future<String> openedSession(WidgetTester tester, SignedInApp app) =>
      sessionOpenedFromTheList(tester, app.container);

  /// Prompts the recorded turn that asks for permission, and answers the request id it asked.
  Future<String> asked(
    WidgetTester tester,
    SignedInApp app,
    String sessionId,
    String fixture,
  ) async {
    await tester.enterText(find.byType(TextField), 'do the work [fixture:$fixture]');
    await tester.tap(find.text(app.l10n.sessionPromptAction));
    await pumpUntil(tester, () => app.queueOf(sessionId).pending.isNotEmpty);

    return app.queueOf(sessionId).pending.single.requestId;
  }

  /// A phone approved from the browser, with a session open and its question on screen.
  Future<(SignedInApp, String, String)> askedOnAnApprovedPhone(
    WidgetTester tester,
    E2eScenario scenario,
  ) async {
    final SignedInApp app = await signedIn(tester, scenario);
    await approvedFromTheBrowser(tester, app);
    final String sessionId = await openedSession(tester, app);

    return (app, sessionId, await asked(tester, app, sessionId, scenario.text('fixture')));
  }

  /// What a tap on the notification of [requestId] does: ask the app to open its address.
  Future<void> openedFromTheNotification(
    WidgetTester tester,
    SignedInApp app,
    String sessionId,
    String requestId,
  ) async {
    app.container
        .read(deepLinkControllerProvider.notifier)
        .request(permissionRouteFor(sessionId, requestId));
    await pumpUntil(tester, () => find.byType(PermissionPage).evaluate().isNotEmpty);
  }

  /// Taps "allow once", and waits for what the server published: answered from a phone.
  Future<void> allowedOnce(WidgetTester tester, SignedInApp app) async {
    await tapOnScreen(tester, find.text(app.l10n.permissionScopeOnce).first);
    await pumpUntil(
      tester,
      () => find.text(app.l10n.permissionOutcomeAllowedPhone).evaluate().isNotEmpty,
    );
  }

  final E2eScenario pending = E2eScenario.named('mobile-device-pending');

  testWidgets('${pending.id} — ${pending.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedIn(tester, pending);
    final String sessionId = await openedSession(tester, app);

    await asked(tester, app, sessionId, pending.text('fixture'));

    // The question is on screen, the controls are off, and the reason is written down — twice:
    // on the card, and in the banner that says what this phone may do.
    final ButtonStyleButton refuse = tester.widget<ButtonStyleButton>(
      find.ancestor(
        of: find.text(app.l10n.permissionDeny),
        matching: find.bySubtype<ButtonStyleButton>(),
      ),
    );
    expect(refuse.onPressed, isNull);
    expect(find.text(app.l10n.permissionDeviceBlocked), findsOneWidget);
    expect(find.text(app.l10n.deviceStatusPendingTitle), findsWidgets);

    // Nobody who may decide answered, so the deadline did — and the card left as refused.
    await pumpUntil(
      tester,
      () => find.text(app.l10n.permissionOutcomeExpired).evaluate().isNotEmpty,
    );
  });

  final E2eScenario fromThePhone = E2eScenario.named('mobile-permission');

  testWidgets('${fromThePhone.id} — ${fromThePhone.title}', (WidgetTester tester) async {
    final (SignedInApp app, String sessionId, String requestId) = await askedOnAnApprovedPhone(
      tester,
      fromThePhone,
    );

    await extendedOnTheCard(tester, app, sessionId, requestId);
    await allowedOnce(tester, app);
  });

  final E2eScenario deepLink = E2eScenario.named('mobile-deep-link');

  testWidgets('${deepLink.id} — ${deepLink.title}', (WidgetTester tester) async {
    final (SignedInApp app, String sessionId, String requestId) = await askedOnAnApprovedPhone(
      tester,
      deepLink,
    );
    await extendedOnTheCard(tester, app, sessionId, requestId);

    // The screen asks the server before it shows anything, and then shows the card the server
    // described.
    await openedFromTheNotification(tester, app, sessionId, requestId);
    await pumpUntil(tester, () => find.text(app.l10n.permissionScopeOnce).evaluate().isNotEmpty);

    await allowedOnce(tester, app);
  });

  final E2eScenario latePush = E2eScenario.named('mobile-late-push');

  testWidgets('${latePush.id} — ${latePush.title}', (WidgetTester tester) async {
    final (SignedInApp app, String sessionId, String requestId) = await askedOnAnApprovedPhone(
      tester,
      latePush,
    );

    // Nobody answers until the deadline has refused it.
    await pumpUntil(tester, () => app.queueOf(sessionId).outcomeOf(requestId) != null);

    // The notification is opened only now. The server says it expired, and the screen offers
    // nothing to answer.
    await openedFromTheNotification(tester, app, sessionId, requestId);
    await pumpUntil(
      tester,
      () => find.text(app.l10n.permissionOutcomeExpired).evaluate().isNotEmpty,
    );

    expect(
      find.descendant(
        of: find.byType(PermissionPage),
        matching: find.text(app.l10n.permissionDeny),
      ),
      findsNothing,
    );
  });

  final E2eScenario revoked = E2eScenario.named('mobile-revoked');

  testWidgets('${revoked.id} — ${revoked.title}', (WidgetTester tester) async {
    final SignedInApp app = await signedIn(tester, revoked);
    await approvedFromTheBrowser(tester, app);

    await app.browser.revoke(app.device.id);

    // The server closes the socket with 4401 at once, and the app asks where the phone stands.
    // Either answer explains it: the status is revoked, or the backend refuses to talk to a
    // revoked phone at all.
    await pumpUntil(
      tester,
      () =>
          !app.container.read(deviceControllerProvider).hasValue ||
          app.container.read(deviceControllerProvider).value?.status == DeviceStatus.revoked,
    );
    await pumpUntil(
      tester,
      () =>
          find.text(app.l10n.deviceStatusRevokedTitle).evaluate().isNotEmpty ||
          find.text(app.l10n.authErrorDeviceRevoked).evaluate().isNotEmpty,
    );
  });
}
