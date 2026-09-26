/// The app signed in on this device, and the few gestures every flow of it starts with.
///
/// Shared by every test that drives the app through its screens: two copies of "sign in, approve
/// from the browser, buy time on the card" are two places for one flow to stop resembling the other.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import 'e2e_environment.dart';

/// One signed-in app on this device, and the browser's side of the same account.
class SignedInApp {
  SignedInApp(this.container, this.l10n, this.browser);

  final ProviderContainer container;
  final AppLocalizations l10n;
  final BackendAsBrowser browser;

  RegisteredDevice get device => container.read(deviceControllerProvider).value!;

  /// The access token of this account — what a browser socket of the same person signs in with.
  String get accessToken => container.read(credentialsProvider).accessToken!;

  PermissionQueue queueOf(String sessionId) =>
      container.read(permissionQueueControllerProvider(sessionId));
}

/// Mounts the app, signs in, and waits for the installation to be registered and the socket up.
///
/// A fresh secure store per test is a fresh installation: every test starts from a phone the
/// backend has never seen, pending, and approves it only when the scenario says so.
Future<SignedInApp> signedInApp(WidgetTester tester, AppConfig config, E2eScenario scenario) async {
  final ProviderContainer container = e2eContainer(config, scenario);
  addTearDown(container.dispose);

  await signedInOnThisDevice(tester, container);
  await pumpUntil(tester, () => container.read(wsClientProvider).status == ConnectionStatus.ready);

  return SignedInApp(
    container,
    await AppLocalizations.delegate.load(const Locale('en')),
    BackendAsBrowser(config, container.read(credentialsProvider).accessToken!),
  );
}

/// Approves this installation from the browser, and has the app read its status again.
Future<void> approvedFromTheBrowser(WidgetTester tester, SignedInApp app) async {
  await app.browser.approve(app.device.id);
  await app.container.read(deviceControllerProvider.notifier).recheck();
  await pumpUntil(tester, () => app.device.canDecide);
}

/// Scrolls [target] into view and taps it.
///
/// A card sits in a scrolling area above the conversation, and on a phone its lower buttons are
/// often below what that area shows. `pumpAndSettle` is not used to wait for the scroll: the
/// countdown ticks every second, so the screen never settles while a question is open.
Future<void> tapOnScreen(WidgetTester tester, Finder target) async {
  await tester.ensureVisible(target);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.tap(target);
}

/// Buys time on the five-second deadline, through the card — the extension is part of the flow.
Future<void> extendedOnTheCard(
  WidgetTester tester,
  SignedInApp app,
  String sessionId,
  String requestId,
) async {
  await tapOnScreen(tester, find.text(app.l10n.permissionExtend).first);
  await pumpUntil(
    tester,
    () => app.queueOf(sessionId).cardOf(requestId)?.remainingExtensions != null,
  );
}
