/// Plan 10, B-30 — the address of the phone, on the emulator, against the e2e stack.
///
/// The app talks through one origin, the web server of the stack, which forwards the API, the socket
/// and the login (D-13, D-16). On the emulator that origin is `http://localhost:<web>`, reached over
/// `adb reverse`. The same server answers at `http://127.0.0.1:<web>` too — another origin, so
/// another issuer, which the stack lists among the ones it accepts — and that is what lets a change of
/// address be proved whole here, sign-out and new sign-in included, with one stack.
///
/// "Closing and opening the app again" is a new container over the **same** secure storage, with the
/// choice read from it before the first frame, exactly as `main.dart` reads it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/router_provider.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_store.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/connection/connection.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import 'support/direct_grant_data_source.dart';
import 'support/e2e_environment.dart';
import 'support/session_robot.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final BuildConfig config = e2eConfig();
  final E2eScenario scenario = E2eScenario.named('mobile-connection');
  final String internal = config.origins.internal!;

  /// The same web server by its loopback address — another origin of the same stack.
  final String loopback = internal.replaceFirst('//localhost:', '//127.0.0.1:');

  Future<AppLocalizations> english() => AppLocalizations.delegate.load(const Locale('en'));

  /// The field of the third radio.
  Finder otherField(AppLocalizations l10n) =>
      find.widgetWithText(TextField, l10n.connectionOtherLabel);

  /// A button of the address screen, by its words.
  ButtonStyleButton button(WidgetTester tester, String label) => tester.widget<ButtonStyleButton>(
    find.ancestor(of: find.text(label), matching: find.bySubtype<ButtonStyleButton>()),
  );

  /// Opens a session on the first folder with the recorded turn, waits for its answer, and ends it
  /// once the test is over — the stack's slots are shared by every suite.
  Future<void> aSessionThrough(
    WidgetTester tester,
    ProviderContainer container,
    AppLocalizations l10n,
  ) async {
    final String sessionId = await SessionRobot(
      tester,
      l10n,
    ).startSession(container, 'do the work [fixture:${scenario.text('fixture')}]');
    await pumpUntil(
      tester,
      () => container.read(liveSessionControllerProvider(sessionId)).conversation.lastTurn != null,
    );
    final String token = container.read(credentialsProvider).accessToken!;
    addTearDown(() async {
      final BrowserSocket closer = await BrowserSocket.open(config, token);
      closer.attach(sessionId);
      await closer.closeSession(sessionId);
      await closer.close();
    });
  }

  /// Opens the address screen by [way] — from the folders home or the sign-in screen — and
  /// chooses its third radio.
  Future<void> otherChosen(WidgetTester tester, AppLocalizations l10n, Finder way) async {
    await tester.tap(way);
    await pumpUntil(tester, () => find.byType(ConnectionPage).evaluate().isNotEmpty);
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.connectionOther));
    await tester.pump();
  }

  /// Signed in on [container], with the socket up.
  Future<void> signedIn(WidgetTester tester, ProviderContainer container) async {
    await signedInOnThisDevice(tester, container);
    await pumpUntil(
      tester,
      () => container.read(wsClientProvider).status == ConnectionStatus.ready,
    );
  }

  testWidgets('${scenario.id} — S-110: the first launch talks through the internal address, signs '
      'in and opens a session', (WidgetTester tester) async {
    final AppLocalizations l10n = await english();
    final ProviderContainer container = e2eContainer(config, scenario);
    disposedAfterTheTest(tester, container);

    // Nothing saved on a phone that never chose: the internal address, by itself (D-17).
    final ConnectionSetting setting = container.read(connectionControllerProvider);
    expect(setting.saved, isNull);
    expect(setting.resolution.kind, ConnectionKind.internal);
    expect(setting.resolution.origin, internal);

    await signedIn(tester, container);
    expect(container.read(appConfigProvider).apiBaseUrl, startsWith(internal));

    await aSessionThrough(tester, container, l10n);
  });

  testWidgets(
    '${scenario.id} — S-111: another address ends the login, signs in again through it, and '
    'is still chosen, with its text, after the app is opened again',
    (WidgetTester tester) async {
      final AppLocalizations l10n = await english();
      final MemoryCredentialStore phone = MemoryCredentialStore();
      final ProviderContainer first = e2eContainer(config, scenario, store: phone);
      bool firstAlive = true;
      addTearDown(() {
        if (firstAlive) {
          first.dispose();
        }
      });
      await signedIn(tester, first);

      // From the folders home, the address screen; the third radio, with the other origin typed.
      await otherChosen(tester, l10n, find.byTooltip(l10n.connectionTitle));
      await tester.enterText(otherField(l10n), loopback);
      await tester.pump();

      // Saving it under a login asks first, and confirming ends the login (S-101).
      await tester.ensureVisible(find.text(l10n.connectionSave));
      await tester.tap(find.text(l10n.connectionSave));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.connectionSwitchConfirm));
      await pumpUntil(tester, () => find.byType(SignInPage).evaluate().isNotEmpty);
      expect(first.read(credentialsProvider).accessToken, isNull);
      expect(first.read(connectionControllerProvider).resolution.origin, loopback);

      // In again, through the new origin: the token is its issuer's, and the socket and the API are
      // there too.
      await first.read(authControllerProvider.notifier).signIn();
      await pumpUntil(tester, () => first.read(wsClientProvider).status == ConnectionStatus.ready);
      expect(first.read(appConfigProvider).apiBaseUrl, startsWith(loopback));
      expect(first.read(appConfigProvider).oidcIssuer, startsWith(loopback));
      await aSessionThrough(tester, first, l10n);

      // Closed, and opened again on the same phone: the choice read before the first frame.
      await tester.pumpWidget(const SizedBox.shrink());
      final ConnectionChoice? saved = await ConnectionStore(
        phone,
        logger: first.read(appLoggerProvider),
      ).read();
      expect(saved, ConnectionChoice(ConnectionKind.other, other: loopback));
      // As [disposedAfterTheTest] does: what the screens asked is answered before the client goes.
      await Future<void>.delayed(const Duration(seconds: 1));
      first.dispose();
      firstAlive = false;

      final ProviderContainer again = e2eContainer(config, scenario, store: phone, saved: saved);
      disposedAfterTheTest(tester, again);
      await mountApp(tester, again);
      expect(again.read(connectionControllerProvider).resolution.origin, loopback);

      again.read(routerProvider).go(connectionRoute);
      await pumpUntil(tester, () => find.byType(ConnectionPage).evaluate().isNotEmpty);
      await tester.pumpAndSettle();
      final RadioGroup<ConnectionKind> radios = tester.widget<RadioGroup<ConnectionKind>>(
        find.byType(RadioGroup<ConnectionKind>),
      );
      expect(radios.groupValue, ConnectionKind.other);
      expect(tester.widget<TextField>(otherField(l10n)).controller?.text, loopback);
    },
  );

  testWidgets('${scenario.id} — S-112: plain text to the internet is refused with the reason, the '
      'private network passes in this build, and an address nobody answers at says so', (
    WidgetTester tester,
  ) async {
    final AppLocalizations l10n = await english();
    final ProviderContainer container = e2eContainer(config, scenario);
    disposedAfterTheTest(tester, container);
    await mountApp(tester, container);

    // Reachable without a login, from the sign-in screen (S-108).
    await otherChosen(tester, l10n, find.text(l10n.connectionTitle));

    for (final String refused in <String>[
      scenario.text('publicAddress'),
      scenario.text('namedAddress'),
    ]) {
      await tester.enterText(otherField(l10n), refused);
      await tester.pump();
      expect(find.text(l10n.connectionProblemPlainText), findsOneWidget, reason: refused);
      expect(button(tester, l10n.connectionSave).onPressed, isNull, reason: refused);
    }

    // A debug build reaches the stack on the local network over plain text (D-20).
    await tester.enterText(otherField(l10n), scenario.text('privateAddress'));
    await tester.pump();
    expect(find.text(l10n.connectionProblemPlainText), findsNothing);
    expect(button(tester, l10n.connectionSave).onPressed, isNotNull);

    // Nobody answers there: the test says so, in words, and nothing is saved.
    final String unreachable = scenario.text('unreachable');
    await tester.enterText(otherField(l10n), unreachable);
    await tester.pump();
    await tester.tap(find.text(l10n.connectionTest));
    await pumpUntil(
      tester,
      () => find.text(l10n.connectionResultServerUnreachable(unreachable)).evaluate().isNotEmpty,
    );
    expect(container.read(connectionControllerProvider).saved, isNull);
  });
}
