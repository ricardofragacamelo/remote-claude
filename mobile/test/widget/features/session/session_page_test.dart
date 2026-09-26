/// The session screen: what it shows, what it lets the person do, and what it lets go of.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
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

void main() {
  late AppLocalizations l10n;
  late FakeSessionRepository sessions;
  late FakePermissionRepository permissions;

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

    await tester.pumpApp(
      const SessionPage(sessionId: 'session-1'),
      overrides: <Override>[
        // The clock of the builders, so the question the test asks is not already past its deadline.
        ...permissionOverrides(repository: permissions, clock: () => t0),
        sessionRepositoryProvider.overrideWithValue(sessions),
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

  testWidgets('S-36 · leaving the screen detaches', (WidgetTester tester) async {
    await pumpSession(tester);
    expect(sessions.unfollows, 0);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();

    expect(sessions.unfollows, greaterThan(0));
  });
}
