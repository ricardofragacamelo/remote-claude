/// The session screen: what it shows, what it lets the person do, and what it lets go of.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/fakes/stub_push_controller.dart';
import '../../../support/pump_app.dart';
import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/builders/permissions.dart';
import '../../../support/fakes/fake_history_repository.dart';

/// What the transcript of the conversation says: a question and its answer.
final HistoryPage transcript = HistoryPage(
  conversationId: 'conv-1',
  workspacePath: '/home/someone/project',
  events: historyOf(<String>[
    messageCompleted(messageId: 'h1', text: 'what broke?', role: 'user', seq: 1),
    messageCompleted(messageId: 'h2', text: 'the build', seq: 2),
  ]),
);

void main() {
  late AppLocalizations l10n;
  late FakeSessionRepository sessions;
  late FakePermissionRepository permissions;
  late FakeHistoryRepository history;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpSession(
    WidgetTester tester, {
    ConnectionStatus connection = ConnectionStatus.ready,
    bool settle = true,
  }) async {
    sessions = FakeSessionRepository();
    addTearDown(sessions.dispose);
    permissions = FakePermissionRepository();
    history = FakeHistoryRepository()..answer(transcript);

    await tester.pumpApp(
      const SessionPage(sessionId: 'session-1'),
      overrides: <Override>[
        // The clock of the builders, so the question the test asks is not already past its deadline.
        ...permissionOverrides(repository: permissions, clock: () => t0),
        sessionRepositoryProvider.overrideWithValue(sessions),
        historyRepositoryProvider.overrideWithValue(history as HistoryRepository),
        deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
        pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(connection),
        ),
      ],
    );

    // A spinner never settles, so a screen showing one is pumped rather than settled.
    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
    }
  }

  // The question the agent loop is stopped on is on the session screen, above the conversation.
  testWidgets('a question of this session appears above the conversation', (
    WidgetTester tester,
  ) async {
    await pumpSession(tester);

    permissions.feed.emit(asked(aPermissionRequest()));
    await tester.pumpAndSettle();

    expect(permissions.feed.sessionId, 'session-1');
    expect(find.text(l10n.permissionQueueTitle), findsOneWidget);
    expect(find.text('rm -rf build/'), findsOneWidget);
  });

  testWidgets('attaches to the session the route named', (WidgetTester tester) async {
    await pumpSession(tester);

    expect(sessions.followed, <String>['session-1']);
  });

  group('S-37 · the states of a screen with nothing on it yet', () {
    testWidgets('a socket still opening is a wait, and says which', (WidgetTester tester) async {
      await pumpSession(tester, connection: ConnectionStatus.connecting, settle: false);

      expect(find.text(l10n.connectionStatusConnecting), findsWidgets);
    });

    testWidgets('a socket that is there and a session with nothing said is empty, not loading', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);

      expect(find.text(l10n.sessionEmptyTitle), findsOneWidget);
      expect(find.text(l10n.sessionEmptyBody), findsOneWidget);
    });

    testWidgets('shows the conversation once something has been said', (WidgetTester tester) async {
      await pumpSession(tester);

      sessions.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'Hello', seq: 1)));
      await tester.pumpAndSettle();

      expect(find.text('Hello'), findsOneWidget);
      expect(find.text(l10n.sessionEmptyTitle), findsNothing);
    });
  });

  testWidgets('shows a tool with the exact command it was given', (WidgetTester tester) async {
    await pumpSession(tester);

    sessions.emit(
      arrivalOf(
        toolStarted(
          toolUseId: 't1',
          seq: 1,
          input: <String, Object?>{'command': 'rm -rf /tmp/scratch'},
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Somebody watching a command run on their laptop is entitled to see the command.
    expect(find.textContaining('rm -rf /tmp/scratch'), findsOneWidget);
    expect(find.text(l10n.sessionToolStatusRunning), findsOneWidget);
  });

  testWidgets('says where the session is, as it moves', (WidgetTester tester) async {
    await pumpSession(tester);

    sessions.emit(arrivalOf(sessionStatusChanged(status: 'waitingPermission', seq: 1)));
    sessions.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'x', seq: 2)));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionStatusWaitingPermission), findsOneWidget);
  });

  testWidgets('says why the session ended', (WidgetTester tester) async {
    await pumpSession(tester);

    sessions.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'x', seq: 1)));
    sessions.emit(arrivalOf(sessionClosed(seq: 2, reason: 'closedByUser')));
    await tester.pumpAndSettle();

    expect(find.text(l10n.sessionClosedByUser), findsOneWidget);
  });

  group('the composer', () {
    testWidgets('sends a prompt and clears itself', (WidgetTester tester) async {
      await pumpSession(tester);

      await tester.enterText(find.byType(TextField), 'do the thing');
      await tester.tap(find.text(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      expect(sessions.commands.single.$1, 'session.prompt');
      expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, isEmpty);
    });

    testWidgets('S-76 · a prompt the socket refused is kept, and the screen says so', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      sessions.accepts = false;

      await tester.enterText(find.byType(TextField), 'do not lose this');
      await tester.tap(find.text(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      // The worst of the three outcomes is the composer emptying on a socket that was not ready:
      // the person watches the prompt vanish and waits for an answer nobody asked for.
      expect(find.text(l10n.sessionPromptRefused), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, 'do not lose this');
    });

    testWidgets('an empty prompt sends nothing', (WidgetTester tester) async {
      await pumpSession(tester);

      await tester.enterText(find.byType(TextField), '   ');
      await tester.tap(find.text(l10n.sessionPromptAction));
      await tester.pumpAndSettle();

      expect(sessions.commands, isEmpty);
    });

    testWidgets('a socket that is gone disables it rather than failing on the tap', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester, connection: ConnectionStatus.closed);

      expect(tester.widget<TextField>(find.byType(TextField)).enabled, isFalse);
    });
  });

  group('the controls', () {
    testWidgets('interrupting appears only while something is running', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      expect(find.text(l10n.sessionInterruptAction), findsNothing);

      sessions.emit(arrivalOf(sessionStatusChanged(status: 'running', seq: 1)));
      await tester.pumpAndSettle();
      expect(find.text(l10n.sessionInterruptAction), findsOneWidget);

      await tester.tap(find.text(l10n.sessionInterruptAction));
      await tester.pumpAndSettle();

      expect(sessions.commands.single.$1, 'session.interrupt');
    });

    testWidgets('ending the session sends the command', (WidgetTester tester) async {
      await pumpSession(tester);

      await tester.tap(find.widgetWithIcon(IconButton, Icons.stop_circle_outlined));
      await tester.pumpAndSettle();

      expect(sessions.commands.single.$1, 'session.close');
    });

    testWidgets('a session already closed cannot be closed again', (WidgetTester tester) async {
      await pumpSession(tester);

      sessions.emit(arrivalOf(sessionClosed(seq: 1)));
      await tester.pumpAndSettle();

      expect(
        tester
            .widget<IconButton>(find.widgetWithIcon(IconButton, Icons.stop_circle_outlined))
            .onPressed,
        isNull,
      );
    });
  });

  group('what was said before this screen could see it', () {
    testWidgets('S-14 · a gap clears the screen and shows the transcript instead', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      sessions.emit(arrivalOf(messageDelta(messageId: 'm1', delta: 'half a sent', seq: 40)));
      await tester.pumpAndSettle();

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      await tester.pumpAndSettle();

      expect(find.text('half a sent'), findsNothing);
      expect(find.text('what broke?'), findsOneWidget);
      expect(find.text('the build'), findsOneWidget);
      expect(history.reads.single, ('conv-1', null));
    });

    testWidgets('S-15 · the replay arriving with the transcript never shows a message twice', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      history.gate = Completer<void>();

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      await tester.pump();
      sessions
        ..emit(arrivalOf(messageCompleted(messageId: 'h2', text: 'the build', seq: 9)))
        ..emit(arrivalOf(messageCompleted(messageId: 'n1', text: 'and now?', seq: 10)));
      await tester.pump();
      history.gate!.complete();
      await tester.pumpAndSettle();

      expect(find.text('the build'), findsOneWidget);
      expect(find.text('what broke?'), findsOneWidget);
      expect(find.text('and now?'), findsOneWidget);
    });

    testWidgets('B-11 · a session that continues a conversation shows its history first', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);

      sessions.emit(
        arrivalOf(
          sessionStarted(sessionId: 'session-1', claudeSessionId: 'conv-1', resumedFrom: 'conv-1'),
        ),
      );
      await tester.pumpAndSettle();
      sessions.emit(arrivalOf(messageCompleted(messageId: 'n1', text: 'continuing', seq: 2)));
      await tester.pumpAndSettle();

      expect(
        tester.getTopLeft(find.text('the build')).dy,
        lessThan(tester.getTopLeft(find.text('continuing')).dy),
      );
    });

    testWidgets('says it is reading, with nothing on screen yet', (WidgetTester tester) async {
      await pumpSession(tester);
      history.gate = Completer<void>();

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      await tester.pump();
      await tester.pump();

      expect(find.text(l10n.sessionHistoryLoading), findsOneWidget);

      history.gate!.complete();
      await tester.pumpAndSettle();
    });

    testWidgets('says it is reading above what is already on screen', (WidgetTester tester) async {
      await pumpSession(tester);
      history.gate = Completer<void>();

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      sessions.emit(arrivalOf(messageDelta(messageId: 'n1', delta: 'live', seq: 3)));
      await tester.pump();
      await tester.pump();

      expect(find.bySemanticsLabel(l10n.sessionHistoryLoading), findsOneWidget);
      expect(find.text('live'), findsOneWidget);

      history.gate!.complete();
      await tester.pumpAndSettle();
    });

    testWidgets('S-17 · a transcript that could not be read says why, and reads it again', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      history.failure = const ServerFailure(
        code: 'CLAUDE_UNAVAILABLE',
        messageKey: 'transcript.error.claudeUnavailable',
        traceId: 'trace-8',
      );

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsOneWidget);
      expect(find.text(l10n.sessionEmptyTitle), findsNothing);

      history.failure = null;
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transcriptErrorClaudeUnavailable), findsNothing);
      expect(find.text('the build'), findsOneWidget);
    });

    testWidgets('the failure stays above a live conversation rather than replacing it', (
      WidgetTester tester,
    ) async {
      await pumpSession(tester);
      history.failure = const ServerFailure(
        code: 'CLAUDE_TIMEOUT',
        messageKey: 'transcript.error.claudeTimeout',
        traceId: 'trace-8',
      );

      sessions.emit(const StreamGap(claudeSessionId: 'conv-1'));
      sessions.emit(arrivalOf(messageDelta(messageId: 'n1', delta: 'still live', seq: 3)));
      await tester.pumpAndSettle();

      expect(find.text(l10n.transcriptErrorClaudeTimeout), findsOneWidget);
      expect(find.text('still live'), findsOneWidget);
    });
  });

  testWidgets('S-36 · leaving the screen detaches', (WidgetTester tester) async {
    await pumpSession(tester);
    expect(sessions.unfollows, 0);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();

    expect(sessions.unfollows, greaterThan(0));
  });
}
