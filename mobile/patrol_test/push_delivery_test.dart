/// Plan 02, D-26 — a notification that really arrives, on a phone that really is in someone's
/// pocket: S-67 and S-54.
///
/// The one suite that is not hermetic, and deliberately so: the stack takes its push settings from
/// the `.env` (`pnpm test:e2e:mobile:push`), the provider delivers to the emulator's Play Services,
/// and `patrol` does what no widget test can — it answers the operating system's permission dialog,
/// presses home, and taps the notification in the tray.
///
/// ```
/// sign in → the device exists → the OS asks for notifications (S-67) → granted, token registered
///   → approved from the browser → a session opened in the app → home: the socket goes
///   → a browser that watches nothing prompts the turn that asks for permission
///   → nobody is watching, so the backend notifies → the notification reaches the tray
///   → tapped → the app opens on the request, revalidates it with the server → approved (S-54)
/// ```
///
/// Two edges stay replaced, as in the rest of the app's suite: the system's sign-in tab and the
/// Keychain — and the lock screen, which this emulator does not have.
library;

import 'package:flutter/material.dart' hide Notification;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:patrol/patrol.dart';
import 'package:remote_claude/app/lifecycle.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../integration_test/support/e2e_environment.dart';

/// The "allow" button of the operating system's notification permission dialog, in `en`.
final Selector allowButton = Selector(text: 'Allow');

/// The title the backend gives a permission notification, in the device's `en`.
const String notificationTitle = 'Claude is waiting for you';

void main() {
  final AppConfig config = e2eConfig();
  final E2eScenario scenario = E2eScenario.named('mobile-push');

  patrolTest('${scenario.id} — ${scenario.title}', ($) async {
    final WidgetTester tester = $.tester;
    final ProviderContainer container = e2eContainer(config, scenario);
    addTearDown(container.dispose);
    final AppLocalizations l10n = await AppLocalizations.delegate.load(const Locale('en'));

    // What `main.dart` also does before the first frame: the listener that closes the socket when
    // the app leaves the screen — which is what leaves nobody watching once it is in the pocket.
    final SocketLifecycle lifecycle = SocketLifecycle(
      client: container.read(wsClientProvider),
      logger: container.read(appLoggerProvider),
    );
    addTearDown(lifecycle.dispose);

    await signedInOnThisDevice(tester, container);

    // S-67 — once the device exists, and not before, the operating system asks. Found by its
    // button's words rather than by resource id: this image ships the vendor's permission
    // controller, whose ids are not the ones `patrol` looks for, and the dialog is the same dialog.
    await $.platform.mobile.waitUntilVisible(allowButton, timeout: const Duration(seconds: 60));
    await $.platform.mobile.tap(allowButton);
    await pumpUntil(
      tester,
      () =>
          container.read(pushControllerProvider).value?.permission == PushPermission.granted &&
          container.read(pushControllerProvider).value?.rotationFailed == false,
    );

    final BackendAsBrowser browser = BackendAsBrowser(
      config,
      container.read(credentialsProvider).accessToken!,
    );
    final String deviceId = container.read(deviceControllerProvider).value!.id;
    await browser.approve(deviceId);
    await container.read(deviceControllerProvider.notifier).recheck();
    await pumpUntil(tester, () {
      final RegisteredDevice? device = container.read(deviceControllerProvider).value;
      return device != null && device.canDecide && device.pushEnabled;
    });

    // A session of this phone, opened through the list.
    final String sessionId = await sessionOpenedFromTheList(tester, container);

    // The phone goes back in the pocket: the socket closes, and nobody is watching any more.
    await $.platform.mobile.pressHome();
    await waitUntil(
      () async => container.read(wsClientProvider).status != ConnectionStatus.ready,
      what: 'the socket closing in the background',
    );

    // The question is asked while nobody looks — so it is the notification that has to say it.
    final BrowserSocket prompter = await BrowserSocket.open(
      config,
      container.read(credentialsProvider).accessToken!,
    );
    addTearDown(prompter.close);
    prompter.prompt(sessionId, scenario.text('fixture'));

    // S-54 — the notification reaches the tray, and its tap opens the request's address: the
    // screen asks the server before showing it. Waited for and tapped in one native action, by
    // its title — reading the tray while the notification lands races the system's own redraw.
    await $.platform.mobile.openNotifications();
    await $.platform.mobile.tapOnNotificationBySelector(
      Selector(textContains: notificationTitle),
      timeout: const Duration(seconds: 60),
    );
    await pumpUntil(tester, () => find.byType(PermissionPage).evaluate().isNotEmpty);
    final Finder allow = find.text(l10n.permissionScopeOnce).first;
    await pumpUntil(tester, () => find.text(l10n.permissionScopeOnce).evaluate().isNotEmpty);
    await pumpUntil(
      tester,
      () => container.read(wsClientProvider).status == ConnectionStatus.ready,
    );

    await tester.ensureVisible(allow);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(allow);
    await pumpUntil(
      tester,
      () => find.text(l10n.permissionOutcomeAllowedPhone).evaluate().isNotEmpty,
    );
  });
}
