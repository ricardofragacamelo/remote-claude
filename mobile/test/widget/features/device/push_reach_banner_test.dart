/// The path that makes the whole plan pointless without anything failing.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/stub_push_controller.dart';
import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<StubPushController> pumpBanner(
    WidgetTester tester,
    AsyncValue<PushReach> value, {
    bool pumpOnce = true,
  }) async {
    final Override override = pushControllerAnswering(value);
    await tester.pumpApp(
      const PushReachBanner(),
      overrides: <Override>[override],
      pumpOnce: pumpOnce,
    );

    final ProviderContainer container = ProviderScope.containerOf(
      tester.element(find.byType(PushReachBanner)),
    );

    return container.read(pushControllerProvider.notifier) as StubPushController;
  }

  testWidgets('says nothing while it is still being worked out', (WidgetTester tester) async {
    await pumpBanner(tester, const AsyncLoading<PushReach>(), pumpOnce: false);

    expect(find.byType(Card), findsNothing);
  });

  testWidgets('says nothing at all when notifications work', (WidgetTester tester) async {
    await pumpBanner(tester, AsyncData<PushReach>(aReach()));

    // A banner that reports good news is one people stop reading, and then they miss the bad one.
    expect(find.byType(Card), findsNothing);
  });

  testWidgets('says nothing before anybody has been asked', (WidgetTester tester) async {
    await pumpBanner(tester, AsyncData<PushReach>(aReach(permission: PushPermission.notAsked)));

    expect(find.byType(Card), findsNothing);
  });

  testWidgets('S-64 · explains a refusal and offers the way to undo it', (
    WidgetTester tester,
  ) async {
    final StubPushController controller = await pumpBanner(
      tester,
      AsyncData<PushReach>(aReach(permission: PushPermission.denied)),
    );

    expect(find.text(l10n.pushDeniedTitle), findsOneWidget);
    expect(find.text(l10n.pushDeniedBody), findsOneWidget);

    await tester.tap(find.text(l10n.pushDeniedAction));
    await tester.pump();

    expect(controller.settingsOpened, 1);
  });

  testWidgets('S-72 · a build with no transport says so, and not "you denied it"', (
    WidgetTester tester,
  ) async {
    await pumpBanner(tester, AsyncData<PushReach>(aReach(permission: PushPermission.unavailable)));

    expect(find.text(l10n.pushUnavailableTitle), findsOneWidget);

    // The two sentences are different on purpose: there is nothing in the system settings for
    // this person to turn on, and telling them they refused would be a lie (D-21).
    expect(find.text(l10n.pushDeniedTitle), findsNothing);
    expect(find.text(l10n.pushDeniedAction), findsNothing);
  });

  testWidgets('S-74 · a token that could not be registered is said out loud, and retried', (
    WidgetTester tester,
  ) async {
    final StubPushController controller = await pumpBanner(
      tester,
      AsyncData<PushReach>(aReach(rotationFailed: true)),
    );

    // The only one of these states the person did not choose, and the only one where
    // notifications look allowed and still do not arrive.
    expect(find.text(l10n.pushRotationFailedTitle), findsOneWidget);

    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pump();

    expect(controller.rechecks, 1);
  });

  testWidgets('a failed rotation is shown even when the permission was refused too', (
    WidgetTester tester,
  ) async {
    await pumpBanner(
      tester,
      AsyncData<PushReach>(aReach(permission: PushPermission.denied, rotationFailed: true)),
    );

    expect(find.text(l10n.pushRotationFailedTitle), findsOneWidget);
  });
}
