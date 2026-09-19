/// S-62 — the walking skeleton, in the real app, against the real backend.
///
/// The same scenario the web suite runs (`e2e/specs/vertical-slice.spec.ts`), read from the same
/// file in `e2e/scenarios/`: two ends proving one behaviour. Where the expectations are written
/// twice they drift, and the divergence then turns up in production rather than in a test.
///
/// ```
/// a real credential from the local realm
///  → the app's own socket opens and the handshake is authenticated
///  → the button sends diag.ping
///  → diag.pong comes back with a seq, from PostgreSQL and through the gateway
///  → the widget renders it, translated
/// ```
///
/// It runs under `flutter test integration_test`, driven by `scripts/run-e2e-local.mjs`: that is
/// what allocates the ports, brings the stack up and compiles the addresses in. Run on its own it
/// stops immediately, saying which command to use.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:remote_claude/app/app.dart';
import 'package:remote_claude/app/bootstrap.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/presentation/providers/auth_controller.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import 'support/direct_grant_data_source.dart';
import 'support/e2e_environment.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  final AppConfig config = e2eConfig();
  final E2eScenario scenario = E2eScenario.fromDefine();

  testWidgets('${scenario.id} — ${scenario.title}', (WidgetTester tester) async {
    // The same world `main.dart` builds, from the same helper: configuration *and* the logger.
    // Overriding only half of it leaves `appLoggerProvider` throwing on the first widget that
    // reads it, which is what this test did until it first ran on a device.
    final AppLogger logger = buildLogger(
      config: config,
      platform: defaultTargetPlatform.name,
      isRelease: kReleaseMode,
    );

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        ...bootstrapOverrides(config: config, logger: logger),

        // The two edges a headless run cannot have: the operating system's external tab, and the
        // Keychain. Everything between them is the shipped code.
        credentialStoreProvider.overrideWithValue(MemoryCredentialStore()),
        oidcAuthDataSourceProvider.overrideWithValue(
          DirectGrantDataSource(
            config: config,
            username: scenario.user['username']!,
            password: scenario.user['password']!,
          ),
        ),
      ],
    );
    addTearDown(container.dispose);

    final AppLocalizations l10n = await AppLocalizations.delegate.load(const Locale('en'));

    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const RemoteClaudeApp()),
    );
    await tester.pumpAndSettle();

    // Nobody is signed in on a fresh install: the router sends the visitor to the sign-in screen
    // rather than flashing the session screen at them.
    expect(find.text(l10n.authSignInAction), findsOneWidget);

    await container.read(authControllerProvider.notifier).signIn();
    await tester.pumpAndSettle();

    // `main.dart` opens the socket once the app starts; the test does the same, after the
    // credential exists — the handshake is what needs it.
    container.read(wsClientProvider).connect();
    await pumpUntil(tester, () => find.text(l10n.sessionPingAction).evaluate().isNotEmpty);

    await pumpUntil(
      tester,
      () => container.read(connectionStatusProvider).value == ConnectionStatus.ready,
    );

    // One tap per expected round trip. Each one is a command over the socket, a row in
    // PostgreSQL, and an event numbered by the hub — and what is asserted is the number the hub
    // assigned, rendered on screen, which nothing but the server could have produced.
    final List<int> counts = scenario.integers('pingCounts');
    final int firstSeq = scenario.integer('firstSeq');

    for (int index = 0; index < counts.length; index += 1) {
      await tester.tap(find.text(l10n.sessionPingAction));
      await pumpUntil(
        tester,
        () => find.text(l10n.sessionPingSequence(firstSeq + index)).evaluate().isNotEmpty,
      );
    }

    // The count the entity incremented is the one the screen shows: the second ping landed on the
    // session the first one opened, rather than starting a new one.
    expect(find.byType(Card), findsNWidgets(counts.length));
    expect(find.textContaining(RegExp('^Session ')), findsOneWidget);
  });
}

/// Pumps until [ready] holds, or fails saying what never happened.
///
/// `pumpAndSettle` cannot be used to wait for the network: it settles as soon as no animation is
/// pending, which happens long before a frame comes back over the socket. And a fixed delay is a
/// flaky test by construction — see docs/architecture/shared/06-testing-strategy.md.
Future<void> pumpUntil(
  WidgetTester tester,
  bool Function() ready, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final DateTime deadline = DateTime.now().add(timeout);

  while (!ready()) {
    if (DateTime.now().isAfter(deadline)) {
      fail('the condition never held within ${timeout.inSeconds}s');
    }
    await tester.pump(const Duration(milliseconds: 50));
  }

  await tester.pump();
}
