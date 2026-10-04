/// The states of the session screen, each a line (plan 10, B-07, B-13).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_strips.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

const Failure locked = ServerFailure(
  code: 'SESSION_LOCKED',
  messageKey: 'session.error.locked',
  traceId: 't',
);

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  group('the connection', () {
    testWidgets('a connection that is there says nothing', (WidgetTester tester) async {
      await tester.pumpApp(const ConnectionStrip(status: ConnectionStatus.ready));

      expect(find.byType(Text), findsNothing);
    });

    testWidgets('S-14 · one that is not says where it stands, and opens whole', (
      WidgetTester tester,
    ) async {
      for (final ConnectionStatus status in <ConnectionStatus>[
        ConnectionStatus.reconnecting,
        ConnectionStatus.throttled,
        ConnectionStatus.closed,
      ]) {
        await tester.pumpApp(ConnectionStrip(status: status));
        expect(find.byType(Text), findsOneWidget, reason: '$status');
      }

      await tester.tap(find.text(l10n.connectionStatusClosed));
      await tester.pumpAndSettle();
      expect(find.text(l10n.connectionStatusClosed), findsNWidgets(3));
    });
  });

  group('the history', () {
    testWidgets('reading it says so, in a line and to a screen reader', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(HistoryStrip(isLoading: true, onRetry: () {}));

      expect(find.text(l10n.sessionHistoryLoading), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
    });

    testWidgets('S-15 · a reading that failed says why, and reads again on a tap', (
      WidgetTester tester,
    ) async {
      int retries = 0;
      await tester.pumpApp(
        HistoryStrip(isLoading: false, failure: locked, onRetry: () => retries += 1),
      );

      expect(find.text(l10n.sessionErrorLocked), findsOneWidget);
      await tester.tap(find.text(l10n.commonActionRetry));
      expect(retries, 1);
    });

    testWidgets('nothing read and nothing reading is nothing', (WidgetTester tester) async {
      await tester.pumpApp(HistoryStrip(isLoading: false, onRetry: () {}));

      expect(find.byType(Text), findsNothing);
    });
  });

  testWidgets('S-17 · an ended session says why, and that sending resumes it', (
    WidgetTester tester,
  ) async {
    for (final SessionCloseReason reason in SessionCloseReason.values) {
      await tester.pumpApp(
        EndedStrip(
          ending: SessionEnding(reason: reason, at: 'now'),
        ),
      );
      expect(
        find.text('${endingReason(l10n, reason)} ${l10n.sessionEndedResumes}'),
        findsOneWidget,
        reason: '$reason',
      );
    }

    await tester.tap(find.byType(EndedStrip));
    await tester.pumpAndSettle();
    expect(find.text(l10n.sessionEndedResumes), findsOneWidget);
  });

  testWidgets('S-42 · a refusal is said until the person closes it', (WidgetTester tester) async {
    int closed = 0;
    await tester.pumpApp(RefusalStrip(failure: locked, onClose: () => closed += 1));

    expect(find.text(l10n.sessionErrorLocked), findsOneWidget);
    await tester.tap(find.byTooltip(l10n.composerRefusalClose));
    expect(closed, 1);
  });

  testWidgets('S-41 · a real block is said above the box, with its reason', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(BlockedStrip(reason: l10n.connectionStatusClosed));

    expect(find.text(l10n.composerBlocked(l10n.connectionStatusClosed)), findsOneWidget);
  });

  group('the queue — B-13', () {
    testWidgets('an empty queue is nothing', (WidgetTester tester) async {
      await tester.pumpApp(QueueStrip(queue: const <QueuedPrompt>[], onCancel: (String _) {}));

      expect(find.byType(Text), findsNothing);
    });

    testWidgets('S-38 · each prompt in its place, with who sent it, and the way to take it out', (
      WidgetTester tester,
    ) async {
      final List<String> cancelled = <String>[];
      await tester.pumpApp(
        QueueStrip(
          queue: const <QueuedPrompt>[
            QueuedPrompt(queueId: 'q1', promptedBy: 'web', preview: 'first'),
            QueuedPrompt(queueId: 'q2', promptedBy: 'mobile', preview: 'second'),
            QueuedPrompt(queueId: 'q3', promptedBy: 'cli', preview: 'third'),
          ],
          onCancel: cancelled.add,
        ),
      );

      expect(
        find.text('${l10n.queuePosition('1')} · first · ${l10n.queueFromWeb}'),
        findsOneWidget,
      );
      expect(
        find.text('${l10n.queuePosition('2')} · second · ${l10n.queueFromMobile}'),
        findsOneWidget,
      );
      expect(
        find.text('${l10n.queuePosition('3')} · third · ${l10n.queueFromOther}'),
        findsOneWidget,
      );

      await tester.tap(find.byTooltip(l10n.queueCancel('2')));
      expect(cancelled, <String>['q2']);
    });
  });
}
