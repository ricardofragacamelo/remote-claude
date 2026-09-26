import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/pump_app.dart';

RegisteredDevice device(DeviceStatus status) => aRegisteredDevice(status: status);

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpBanner(
    WidgetTester tester,
    AsyncValue<RegisteredDevice?> value, {
    ThemeData? theme,
    bool pumpOnce = true,
  }) => tester.pumpApp(
    const DeviceStatusBanner(),
    overrides: <Override>[deviceControllerAnswering(value)],
    theme: theme,
    pumpOnce: pumpOnce,
  );

  testWidgets('says it is registering while the request is in flight', (WidgetTester tester) async {
    await pumpBanner(tester, const AsyncLoading<RegisteredDevice?>(), pumpOnce: false);

    expect(find.text(l10n.deviceStatusRegisteringTitle), findsOneWidget);
  });

  // The rule this whole banner exists for: a pending device watches and does not decide, and the
  // screen says **why**. A disabled control with no reason is a security rule that looks like a
  // bug (docs/architecture/mobile/07-auth.md).
  testWidgets('explains the pending state, in words', (WidgetTester tester) async {
    await pumpBanner(tester, AsyncData<RegisteredDevice?>(device(DeviceStatus.pending)));

    expect(find.text(l10n.deviceStatusPendingTitle), findsOneWidget);
    expect(find.text(l10n.deviceStatusPendingBody), findsOneWidget);
  });

  testWidgets('says nothing at all once the device is approved', (WidgetTester tester) async {
    await pumpBanner(tester, AsyncData<RegisteredDevice?>(device(DeviceStatus.approved)));

    expect(find.byType(Card), findsNothing);
  });

  testWidgets('says nothing while nobody is signed in', (WidgetTester tester) async {
    await pumpBanner(tester, const AsyncData<RegisteredDevice?>(null));

    expect(find.byType(Card), findsNothing);
  });

  testWidgets('explains a revoked device, and what to do about it', (WidgetTester tester) async {
    await pumpBanner(tester, AsyncData<RegisteredDevice?>(device(DeviceStatus.revoked)));

    expect(find.text(l10n.deviceStatusRevokedTitle), findsOneWidget);
    expect(find.text(l10n.deviceStatusRevokedBody), findsOneWidget);
  });

  testWidgets('reads a state it does not know as one that cannot decide', (
    WidgetTester tester,
  ) async {
    await pumpBanner(tester, AsyncData<RegisteredDevice?>(device(DeviceStatus.unknown)));

    expect(find.text(l10n.deviceStatusUnknownTitle), findsOneWidget);
  });

  testWidgets('shows the translated failure when the registration could not go through', (
    WidgetTester tester,
  ) async {
    await pumpBanner(
      tester,
      const AsyncError<RegisteredDevice?>(NetworkFailure(traceId: 't'), StackTrace.empty),
    );
    // A second frame: the stub rejects on a microtask, so the first one still shows loading.
    await tester.pump();

    expect(find.text(l10n.deviceStatusUnknownTitle), findsOneWidget);
    expect(find.text(l10n.commonErrorOffline), findsOneWidget);
  });

  testWidgets('falls back to its own words for a failure that is not one of ours', (
    WidgetTester tester,
  ) async {
    await pumpBanner(tester, AsyncError<RegisteredDevice?>(StateError('boom'), StackTrace.empty));

    expect(find.text(l10n.deviceStatusUnknownBody), findsOneWidget);
  });

  // Colour comes from the scheme, never from a literal: a warning that is unreadable in the dark
  // theme is a real problem, not a cosmetic one. Two tests and not a loop, so a failure names
  // which theme it was.
  testWidgets('takes the warning colour from the light scheme', (WidgetTester tester) async {
    final ThemeData theme = AppTheme.light();
    await pumpBanner(
      tester,
      AsyncData<RegisteredDevice?>(device(DeviceStatus.revoked)),
      theme: theme,
    );

    expect(tester.widget<Icon>(find.byIcon(Icons.block)).color, theme.colorScheme.error);
  });

  testWidgets('takes the warning colour from the dark scheme', (WidgetTester tester) async {
    final ThemeData theme = AppTheme.dark();
    await pumpBanner(
      tester,
      AsyncData<RegisteredDevice?>(device(DeviceStatus.revoked)),
      theme: theme,
    );

    expect(tester.widget<Icon>(find.byIcon(Icons.block)).color, theme.colorScheme.error);
  });

  testWidgets('announces itself, so a screen reader reaches the reason', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpBanner(tester, AsyncData<RegisteredDevice?>(device(DeviceStatus.pending)));

    // The banner is one semantics container, so the title and the reason are announced together
    // — which is the point: a reason nobody hears is a disabled control with no explanation.
    final String announced = tester.getSemantics(find.text(l10n.deviceStatusPendingTitle)).label;

    expect(announced, contains(l10n.deviceStatusPendingTitle));
    expect(announced, contains(l10n.deviceStatusPendingBody));

    handle.dispose();
  });
}
