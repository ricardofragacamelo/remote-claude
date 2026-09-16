import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/app/app.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../support/fakes/fake_auth_repository.dart';
import '../../support/fakes/fake_session_repository.dart';
import '../../support/fakes/recording_writer.dart';
import '../../support/pump_app.dart';

/// A session that is always **fresh**, whatever day this runs on.
///
/// The instants are relative to one `now` captured at load, never to a date written into the
/// file: these two suites build the real provider graph, where `RestoreSession` reads the wall
/// clock. A fixed 2026-09-14 12:00 stops being fresh at 12:48 that day, and the suite then fails
/// for everybody, for ever — which is exactly what it did.
final DateTime _issuedAt = DateTime.now().toUtc();

AuthSession session() => AuthSession(
  accessToken: 'token',
  refreshToken: 'refresh',
  userId: 'user-1',
  issuedAt: _issuedAt,
  expiresAt: _issuedAt.add(const Duration(hours: 1)),
);

void main() {
  late AppLocalizations l10n;
  late FakeAuthRepository auth;
  late FakeSessionRepository sessions;
  late AppLogger logger;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    auth = FakeAuthRepository();
    sessions = FakeSessionRepository();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );
  });

  tearDown(() async {
    await sessions.dispose();
    await logger.dispose();
  });

  /// The key the app is mounted under, so the tree can be asked for it by identity.
  ///
  /// It is also what makes the constructor **run**: built with only constant arguments, Dart
  /// folds `const RemoteClaudeApp()` into the constant pool and the constructor never executes,
  /// which shows up in the coverage report as a declared line nothing reached.
  final Key appKey = UniqueKey();

  Future<void> pumpAppUnderTest(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: <Override>[
          authRepositoryProvider.overrideWithValue(auth as AuthRepository),
          sessionRepositoryProvider.overrideWithValue(sessions),
          appLoggerProvider.overrideWithValue(logger),
          connectionStatusProvider.overrideWith(
            (Ref ref) => Stream<ConnectionStatus>.value(ConnectionStatus.ready),
          ),
        ],
        child: RemoteClaudeApp(key: appKey),
      ),
    );

    await tester.pumpAndSettle();
  }

  testWidgets('mounts under the key it was given', (WidgetTester tester) async {
    await pumpAppUnderTest(tester);

    expect(find.byKey(appKey), findsOneWidget);
  });

  testWidgets('sends an unauthenticated visitor to the sign-in screen', (
    WidgetTester tester,
  ) async {
    await pumpAppUnderTest(tester);

    expect(find.text(l10n.authSignInTitle), findsOneWidget);
  });

  testWidgets('takes a signed-in user straight to the round trip', (WidgetTester tester) async {
    auth.stored = session();

    await pumpAppUnderTest(tester);

    expect(find.text(l10n.sessionPingTitle), findsWidgets);
  });

  testWidgets('signing in moves the app to the round trip', (WidgetTester tester) async {
    auth.produced = session();
    await pumpAppUnderTest(tester);

    await tester.tap(find.text(l10n.authSignInAction));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionPingTitle), findsWidgets);
  });

  testWidgets('signing out brings the sign-in screen back', (WidgetTester tester) async {
    auth.stored = session();
    await pumpAppUnderTest(tester);

    await tester.tap(find.byTooltip(l10n.commonActionSignOut));
    await tester.pumpAndSettle();

    expect(find.text(l10n.authSignInTitle), findsOneWidget);
  });

  testWidgets('carries a light theme and a dark one — this is a developer tool', (
    WidgetTester tester,
  ) async {
    await pumpAppUnderTest(tester);

    final MaterialApp app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(app.theme!.brightness, Brightness.light);
    expect(app.darkTheme!.brightness, Brightness.dark);
  });

  testWidgets('speaks both languages', (WidgetTester tester) async {
    await pumpAppUnderTest(tester);

    final MaterialApp app = tester.widget<MaterialApp>(find.byType(MaterialApp));

    expect(
      app.supportedLocales.map((Locale locale) => locale.languageCode),
      containsAll(<String>['en', 'pt']),
    );
  });
}
