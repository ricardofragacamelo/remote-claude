import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/pump_app.dart';

Pong pong({int seq = 1, String nonce = 'n-1', int count = 1}) => Pong(
  seq: seq,
  sessionId: 'ses-1',
  pingedAt: '2026-09-14T12:00:00.000Z',
  pingCount: count,
  nonce: nonce,
);

void main() {
  late AppLocalizations l10n;
  late FakeSessionRepository repository;

  setUpAll(() async => l10n = await englishCatalogue());

  setUp(() => repository = FakeSessionRepository());
  tearDown(() => repository.dispose());

  Future<void> pumpPage(WidgetTester tester, {ConnectionStatus status = ConnectionStatus.ready}) =>
      tester.pumpApp(
        const SessionPingPage(),
        overrides: <Override>[
          sessionRepositoryProvider.overrideWithValue(repository),
          connectionStatusProvider.overrideWith(
            (Ref ref) => Stream<ConnectionStatus>.value(status),
          ),
        ],
      );

  testWidgets('shows the empty state before any round trip', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    expect(find.text(l10n.sessionPingEmpty), findsOneWidget);
  });

  testWidgets('shows where the connection stands', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    expect(find.text(l10n.connectionStatusReady), findsOneWidget);
  });

  testWidgets('disables the command while the socket is not ready', (WidgetTester tester) async {
    await pumpPage(tester, status: ConnectionStatus.reconnecting);
    await tester.pump();

    expect(find.text(l10n.connectionStatusReconnecting), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
  });

  testWidgets('shows the loading state while a round trip is in flight', (
    WidgetTester tester,
  ) async {
    await pumpPage(tester);
    await tester.pump();

    await tester.tap(find.text(l10n.sessionPingAction));
    await tester.pump();

    expect(find.text(l10n.sessionPingPending), findsOneWidget);
    expect(find.text(l10n.sessionPingEmpty), findsNothing);
  });

  testWidgets('a double tap sends one command, not two', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    await tester.tap(find.text(l10n.sessionPingAction));
    await tester.pump();
    await tester.tap(find.text(l10n.sessionPingAction), warnIfMissed: false);
    await tester.pump();

    expect(repository.pings, hasLength(1));
  });

  testWidgets('renders the answer, translated', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    repository.emit(PongReceived(pong(count: 3)));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionPingResult(3, '2026-09-14T12:00:00.000Z')), findsOneWidget);
    expect(find.text(l10n.sessionPingSequence(1)), findsOneWidget);
    expect(find.text(l10n.sessionPingSessionLabel('ses-1')), findsOneWidget);
  });

  testWidgets('a replayed event does not duplicate what is on screen', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    repository.emit(PongReceived(pong()));
    await tester.pumpAndSettle();
    repository.emit(PongReceived(pong()));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionPingSequence(1)), findsOneWidget);
  });

  testWidgets('a gap empties the screen rather than leaving a hole', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    repository.emit(PongReceived(pong()));
    await tester.pumpAndSettle();
    repository.emit(const StreamGap());
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionPingEmpty), findsOneWidget);
    expect(find.text(l10n.sessionPingSequence(1)), findsNothing);
  });

  testWidgets('the sign-out control carries a translated label', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    expect(find.byTooltip(l10n.commonActionSignOut), findsOneWidget);
  });

  testWidgets('meets the touch, contrast and label guidelines', (WidgetTester tester) async {
    await pumpPage(tester);
    await tester.pump();

    repository.emit(PongReceived(pong()));
    await tester.pumpAndSettle();

    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('renders in the other language without a code change', (WidgetTester tester) async {
    await tester.pumpApp(
      const SessionPingPage(),
      locale: const Locale('pt'),
      overrides: <Override>[
        sessionRepositoryProvider.overrideWithValue(repository),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(ConnectionStatus.ready),
        ),
      ],
    );
    await tester.pump();

    expect(find.text('Enviar ping'), findsOneWidget);
  });
}
