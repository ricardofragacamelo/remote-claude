import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/auth/auth.dart';
import 'package:remote_claude/features/auth/auth_providers.dart';
import 'package:remote_claude/features/auth/domain/repositories/auth_repository.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_auth_repository.dart';
import '../../../support/fakes/recording_writer.dart';
import '../../../support/pump_app.dart';

AuthSession session() => AuthSession(
  accessToken: 'token',
  refreshToken: 'refresh',
  userId: 'user-1',
  issuedAt: DateTime.utc(2026, 9, 14, 12),
  expiresAt: DateTime.utc(2026, 9, 14, 13),
);

void main() {
  late AppLocalizations l10n;
  late FakeAuthRepository repository;
  late AppLogger logger;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() {
    repository = FakeAuthRepository();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: RecordingWriter().writer,
    );
  });

  tearDown(() => logger.dispose());

  Future<void> pumpPage(WidgetTester tester, {bool pumpOnce = true}) => tester.pumpApp(
    const SignInPage(),
    pumpOnce: pumpOnce,
    overrides: <Override>[
      authRepositoryProvider.overrideWithValue(repository as AuthRepository),
      appLoggerProvider.overrideWithValue(logger),
    ],
  );

  testWidgets('says why it is asking', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pumpAndSettle();

    expect(find.text(l10n.authSignInTitle), findsOneWidget);
    expect(find.text(l10n.authSignInDescription), findsOneWidget);
  });

  testWidgets('offers the sign-in once the device is known to hold nothing', (
    WidgetTester tester,
  ) async {
    await pumpPage(tester);
    await tester.pumpAndSettle();

    expect(find.text(l10n.authSignInAction), findsOneWidget);
  });

  testWidgets('waits rather than offering while the restore is undecided', (
    WidgetTester tester,
  ) async {
    await pumpPage(tester, pumpOnce: false);

    expect(find.text(l10n.authSignInPending), findsOneWidget);
  });

  testWidgets('tapping opens the provider', (WidgetTester tester) async {
    repository.produced = session();
    await pumpPage(tester);
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.authSignInAction));
    await tester.pumpAndSettle();

    expect(repository.signIns, 1);
  });

  testWidgets('a refusal is rendered, translated, with its trace', (WidgetTester tester) async {
    repository.failure = const AuthenticationFailure(traceId: 'trace-9');
    await pumpPage(tester);
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.authSignInAction));
    await tester.pumpAndSettle();

    expect(find.text(l10n.authErrorUnauthenticated), findsOneWidget);
    expect(find.text(l10n.commonErrorTraceLabel('trace-9')), findsOneWidget);
  });

  testWidgets('the error state offers another attempt', (WidgetTester tester) async {
    repository.failure = const AuthenticationFailure(traceId: 'trace-9');
    await pumpPage(tester);
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.authSignInAction));
    await tester.pumpAndSettle();

    repository
      ..failure = null
      ..produced = session();

    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();

    expect(repository.signIns, 2);
  });

  testWidgets('a failure that is not ours still renders something showable', (
    WidgetTester tester,
  ) async {
    await pumpPage(tester);
    await tester.pumpAndSettle();

    // `produced` is null, so the fake throws a plain error rather than a Failure.
    await tester.tap(find.text(l10n.authSignInAction));
    await tester.pumpAndSettle();

    expect(find.text(l10n.commonErrorUnexpected), findsOneWidget);
  });

  testWidgets('meets the touch, contrast and label guidelines', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pumpAndSettle();

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('renders in the other language without a code change', (WidgetTester tester) async {
    await tester.pumpApp(
      const SignInPage(),
      locale: const Locale('pt'),
      overrides: <Override>[
        authRepositoryProvider.overrideWithValue(repository as AuthRepository),
        appLoggerProvider.overrideWithValue(logger),
      ],
    );
    await tester.pumpAndSettle();

    expect(find.text('Entrar'), findsOneWidget);
  });
}
