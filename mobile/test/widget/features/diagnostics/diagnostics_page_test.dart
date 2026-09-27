/// The diagnostics screen: what it shows, and `debug` switched on only while it is open — B-11.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:logging/logging.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/core/network/credentials.dart';
import 'package:remote_claude/core/network/credentials_provider.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/diagnostics/diagnostics.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/recording_writer.dart';
import '../../../support/pump_app.dart';

const AppConfig config = AppConfig(
  apiBaseUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:3000/ws',
  oidcIssuer: 'http://localhost:8180/realms/remote-claude',
  oidcClientId: 'remote-claude-mobile',
  oidcScopes: 'openid',
  oidcRedirectUrl: 'com.remoteclaude://callback',
  appVersion: '1.4.2',
);

void main() {
  late AppLocalizations l10n;
  late AppLogger logger;
  late Credentials credentials;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() {
    // A release logger: `info`, until somebody asks for more.
    logger = AppLogger(
      context: const LogContext(appVersion: '1.4.2', platform: 'android'),
      writer: RecordingWriter().writer,
      level: Level.INFO,
    );
    credentials = Credentials();
    addTearDown(logger.dispose);
  });

  List<Override> overrides({bool release = true}) => <Override>[
    appConfigProvider.overrideWithValue(config),
    appLoggerProvider.overrideWithValue(logger),
    releaseBuildProvider.overrideWithValue(release),
    credentialsProvider.overrideWithValue(credentials),
    connectionStatusProvider.overrideWith(
      (Ref ref) => Stream<ConnectionStatus>.value(ConnectionStatus.ready),
    ),
  ];

  /// The screen, reachable from a home it can be left for.
  Future<void> pumpDiagnostics(WidgetTester tester, List<Override> overrides) async {
    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: '/',
          builder: (BuildContext context, GoRouterState state) => const Text('home'),
        ),
        GoRoute(
          path: '/diagnostics',
          builder: (BuildContext context, GoRouterState state) => const DiagnosticsPage(),
        ),
      ],
      initialLocation: '/diagnostics',
      overrides: overrides,
    );
    await tester.pumpAndSettle();
  }

  testWidgets('says where the connection is, whether there is a sign-in, and the version', (
    WidgetTester tester,
  ) async {
    credentials.setAccessToken('token-1');

    await pumpDiagnostics(tester, overrides());

    expect(find.text(l10n.connectionStatusReady), findsOneWidget);
    expect(find.text(l10n.diagnosticsCredentialPresent), findsOneWidget);
    expect(find.text('1.4.2'), findsOneWidget);
  });

  testWidgets('says when there is no sign-in', (WidgetTester tester) async {
    await pumpDiagnostics(tester, overrides());

    expect(find.text(l10n.diagnosticsCredentialAbsent), findsOneWidget);
  });

  testWidgets('S-21 · switches debug on, and back off on leaving the screen', (
    WidgetTester tester,
  ) async {
    await pumpDiagnostics(tester, overrides());
    expect(logger.level, Level.INFO);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(logger.level, Level.FINE);

    final BuildContext context = tester.element(find.byType(DiagnosticsPage));
    GoRouter.of(context).go('/');
    await tester.pumpAndSettle();

    expect(find.text('home'), findsOneWidget);
    expect(logger.level, Level.INFO);
  });

  testWidgets('switches debug off again from the screen', (WidgetTester tester) async {
    await pumpDiagnostics(tester, overrides());

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(logger.level, Level.INFO);
  });

  testWidgets('a development build is always at debug, and the switch says so', (
    WidgetTester tester,
  ) async {
    logger.level = Level.FINE;

    await pumpDiagnostics(tester, overrides(release: false));

    expect(find.text(l10n.diagnosticsDebugAlwaysOn), findsOneWidget);
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).onChanged, isNull);
    expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile)).value, isTrue);
  });
}
