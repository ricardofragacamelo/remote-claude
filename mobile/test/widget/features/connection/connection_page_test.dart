/// The address screen (plan 10, B-29): the three radios, the field of the third, the test, the save
/// — and the login it ends when the address changes under it.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/config/connection_choice.dart';
import 'package:remote_claude/core/config/connection_store.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/storage/credential_store.dart';
import 'package:remote_claude/core/storage/credential_store_provider.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/connection/connection.dart';
import 'package:remote_claude/features/connection/connection_providers.dart';
import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/config.dart';
import '../../../support/fakes/fake_auth_repository.dart';
import '../../../support/fakes/fake_connection_probe.dart';
import '../../../support/fakes/fake_credential_store.dart';
import '../../../support/fakes/recording_writer.dart';
import '../../../support/pump_app.dart';

AuthSession signedIn() => AuthSession(
  accessToken: 'token',
  refreshToken: 'refresh',
  userId: 'user-1',
  issuedAt: DateTime.now().toUtc(),
  // Far from expiring, so restoring it renews nothing.
  expiresAt: DateTime.now().toUtc().add(const Duration(hours: 1)),
);

void main() {
  late AppLocalizations l10n;
  late FakeConnectionProbe probe;
  late FakeCredentialStore storage;
  late OrderedAuth auth;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() {
    probe = FakeConnectionProbe();
    storage = FakeCredentialStore(<String, String>{CredentialKeys.accessToken: 'old-token'});
    auth = OrderedAuth(storage);
  });

  /// The screen at its address, over [config], with a marker where it leaves to.
  Future<void> pump(
    WidgetTester tester, {
    BuildConfig? config,
    ConnectionChoice? saved,
    double textScale = 1,
  }) async {
    tester.view
      ..physicalSize = const Size(400, 2400)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = textScale;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: sessionRoute,
          builder: (BuildContext _, GoRouterState _) => const Text('home'),
        ),
        GoRoute(
          path: connectionRoute,
          builder: (BuildContext _, GoRouterState _) => const ConnectionPage(),
        ),
      ],
      initialLocation: connectionRoute,
      overrides: <Override>[
        buildConfigProvider.overrideWithValue(
          config ?? aBuildConfig(external: 'https://claude.example.dev'),
        ),
        savedConnectionProvider.overrideWithValue(saved),
        credentialStoreProvider.overrideWithValue(storage),
        connectionProbeProvider.overrideWithValue(probe),
        authRepositoryProvider.overrideWithValue(auth as AuthRepository),
        appLoggerProvider.overrideWithValue(
          AppLogger(
            context: const LogContext(appVersion: '1.0.0', platform: 'android'),
            writer: RecordingWriter().writer,
          ),
        ),
      ],
    );
    await tester.pumpAndSettle();
  }

  RadioListTile<ConnectionKind> radio(WidgetTester tester, String title) =>
      tester.widget<RadioListTile<ConnectionKind>>(
        find.widgetWithText(RadioListTile<ConnectionKind>, title),
      );

  bool enabled(WidgetTester tester, String label) =>
      tester
          .widget<ButtonStyleButton>(
            find
                .ancestor(of: find.text(label), matching: find.bySubtype<ButtonStyleButton>())
                .first,
          )
          .onPressed !=
      null;

  Future<void> chooseOther(WidgetTester tester, String text) async {
    await tester.tap(find.text(l10n.connectionOther));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), text);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'S-104 · three radios, each with its address in full; one the build lacks is off, saying why',
    (WidgetTester tester) async {
      await pump(tester, config: aBuildConfig());

      expect(find.text('${l10n.connectionInternalHint} · http://localhost:5173'), findsOneWidget);
      expect(radio(tester, l10n.connectionInternal).enabled, isTrue);
      expect(radio(tester, l10n.connectionExternal).enabled, isFalse);
      expect(find.text(l10n.connectionUndefined), findsOneWidget);
      expect(find.text(l10n.connectionInUse('http://localhost:5173')), findsOneWidget);
    },
  );

  testWidgets(
    'S-105 · the field is on with its radio only; a wrong address keeps save off, saying why',
    (WidgetTester tester) async {
      await pump(tester);
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);

      await chooseOther(tester, 'http://203.0.113.10');

      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isTrue);
      expect(find.text(l10n.connectionProblemPlainText), findsOneWidget);
      expect(enabled(tester, l10n.connectionSave), isFalse);
      expect(enabled(tester, l10n.connectionTest), isFalse);

      await tester.enterText(find.byType(TextField), 'https://mine.example');
      await tester.pumpAndSettle();

      expect(find.text(l10n.connectionProblemPlainText), findsNothing);
      expect(enabled(tester, l10n.connectionSave), isTrue);
    },
  );

  testWidgets('the field takes an address as an address: no autocorrection, the URL keyboard', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    final TextField field = tester.widget<TextField>(find.byType(TextField));

    expect(field.autocorrect, isFalse);
    expect(field.enableSuggestions, isFalse);
    expect(field.keyboardType, TextInputType.url);
  });

  testWidgets('every reason a typed address is refused is said in words', (
    WidgetTester tester,
  ) async {
    await pump(tester);
    final Map<String, String> wrong = <String, String>{
      '': l10n.connectionProblemEmpty,
      'mine.example': l10n.connectionProblemNotAnAddress,
      'ftp://mine.example': l10n.connectionProblemScheme,
      'https://mine.example/app': l10n.connectionProblemPath,
      'https://mine.example?a': l10n.connectionProblemQuery,
      'https://mine.example#a': l10n.connectionProblemFragment,
      'https://me@mine.example': l10n.connectionProblemUserInfo,
    };

    for (final MapEntry<String, String> each in wrong.entries) {
      await chooseOther(tester, each.key);
      expect(find.text(each.value), findsOneWidget, reason: each.key);
    }
  });

  testWidgets('S-125 · an address of the local network is taken in a debug build', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    await chooseOther(tester, 'http://10.0.0.5:5173');

    expect(find.text(l10n.connectionProblemPlainText), findsNothing);
    expect(enabled(tester, l10n.connectionSave), isTrue);

    await tester.enterText(find.byType(TextField), 'http://203.0.113.10');
    await tester.pumpAndSettle();

    expect(find.text(l10n.connectionProblemPlainText), findsOneWidget);
    expect(l10n.connectionProblemPlainText, contains('192.168'));
    expect(enabled(tester, l10n.connectionSave), isFalse);
  });

  testWidgets('S-106 · the test says what answered — and what did not — in words', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    for (final (ProbeResult result, String sentence) in <(ProbeResult, String)>[
      (ProbeResult.ok, l10n.connectionResultOk('http://localhost:5173')),
      (
        ProbeResult.serverUnreachable,
        l10n.connectionResultServerUnreachable('http://localhost:5173'),
      ),
      (
        ProbeResult.loginUnavailable,
        l10n.connectionResultLoginUnavailable('http://localhost:5173'),
      ),
    ]) {
      probe.answer = result;
      await tester.tap(find.text(l10n.connectionTest));
      await tester.pumpAndSettle();

      expect(find.text(sentence), findsOneWidget);
    }
    expect(probe.asked.first, (
      'http://localhost:5173',
      'http://localhost:5173/realms/remote-claude',
    ));
  });

  testWidgets('S-107 · while a test is out, testing and saving are off: one request', (
    WidgetTester tester,
  ) async {
    probe.gate = Completer<void>();
    await pump(tester);

    await tester.tap(find.text(l10n.connectionTest));
    await tester.pump();

    expect(find.text(l10n.connectionTesting), findsOneWidget);
    expect(enabled(tester, l10n.connectionTesting), isFalse);
    expect(enabled(tester, l10n.connectionSave), isFalse);
    await tester.tap(find.text(l10n.connectionTesting), warnIfMissed: false);

    probe.gate!.complete();
    await tester.pumpAndSettle();
    expect(probe.asked, hasLength(1));
  });

  testWidgets('S-108 · saved without a login: kept on the phone, and the app moves on', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    await tester.tap(find.text(l10n.connectionExternal));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.connectionSave));
    await tester.pumpAndSettle();

    expect(find.text('home'), findsOneWidget);
    expect(storage.values[ConnectionKeys.choice], '1:external');
    expect(auth.signOuts, 0);
  });

  testWidgets(
    'S-101 · with a login, a new address asks first; confirmed, the login ends, then it saves',
    (WidgetTester tester) async {
      auth.stored = signedIn();
      await pump(tester);

      await chooseOther(tester, 'https://mine.example');
      await tester.tap(find.text(l10n.connectionSave));
      await tester.pumpAndSettle();

      expect(find.text(l10n.connectionSwitchBody), findsOneWidget);
      await tester.tap(find.text(l10n.connectionSwitchConfirm));
      await tester.pumpAndSettle();

      expect(auth.signOuts, 1);
      expect(storage.values.keys, isNot(contains(CredentialKeys.accessToken)));
      expect(storage.values[ConnectionKeys.other], 'https://mine.example');
      expect(find.text('home'), findsOneWidget);
    },
  );

  testWidgets('S-101 · keeping the address changes nothing', (WidgetTester tester) async {
    auth.stored = signedIn();
    await pump(tester);

    await tester.tap(find.text(l10n.connectionExternal));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.connectionSave));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.connectionSwitchCancel));
    await tester.pumpAndSettle();

    expect(auth.signOuts, 0);
    expect(storage.writes, 0);
    expect(find.byType(ConnectionPage), findsOneWidget);
  });

  testWidgets('S-103 · with a login, saving the same address again does not end it', (
    WidgetTester tester,
  ) async {
    auth.stored = signedIn();
    await pump(tester);

    await tester.tap(find.text(l10n.connectionSave));
    await tester.pumpAndSettle();

    expect(find.text(l10n.connectionSwitchBody), findsNothing);
    expect(auth.signOuts, 0);
  });

  testWidgets('S-97 · no address at all: the screen says so, and nothing is chosen', (
    WidgetTester tester,
  ) async {
    await pump(tester, config: aBuildConfig(internal: null));

    expect(find.text(l10n.connectionNone), findsOneWidget);
    expect(enabled(tester, l10n.connectionSave), isFalse);
  });

  testWidgets('S-100 · a saved address the build no longer offers: the default, and why', (
    WidgetTester tester,
  ) async {
    await pump(
      tester,
      config: aBuildConfig(),
      saved: const ConnectionChoice(ConnectionKind.external),
    );

    expect(find.text(l10n.connectionNoticeUnavailable), findsOneWidget);
    expect(find.text(l10n.connectionInUse('http://localhost:5173')), findsOneWidget);
  });

  testWidgets('S-109 · the help is there, and the screen meets the guidelines at 200 %', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pump(tester, textScale: 2);

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    expect(tester.takeException(), isNull);

    await tester.tap(find.byTooltip(l10n.connectionHelpOpen));
    await tester.pumpAndSettle();
    expect(find.text(l10n.connectionHelpBody), findsOneWidget);
    semantics.dispose();
  });
}

/// The login, ending as the real one does — the store cleared — and saying what had been saved of
/// the address when it ended.
class OrderedAuth extends FakeAuthRepository {
  OrderedAuth(this.storage);

  final FakeCredentialStore storage;

  /// The choice of address on the phone when the login ended.
  String? choiceAtSignOut;

  @override
  Future<void> signOut(AuthSession? current) async {
    choiceAtSignOut = storage.values[ConnectionKeys.choice];
    await storage.clear();
    await super.signOut(current);
  }
}
