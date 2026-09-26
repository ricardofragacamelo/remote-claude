/// The list screen: the four states, and the one thing it can do.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';
import 'package:remote_claude/features/workspace/workspace.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/frames.dart';
import '../../../support/fakes/fake_session_repository.dart';
import '../../../support/fakes/fake_workspace_repository.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/fakes/stub_push_controller.dart';
import '../../../support/pump_app.dart';

const Workspace project = Workspace(path: '/home/someone/project', label: 'project');

/// The update that announces a session.
SessionUpdate started(String sessionId) => arrivalOf(sessionStarted(sessionId: sessionId));

void main() {
  late AppLocalizations l10n;
  late FakeWorkspaceRepository workspaces;
  late FakeSessionRepository sessions;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  /// Mounts the list with a router whose session route is a marker.
  Future<void> pumpList(
    WidgetTester tester, {
    List<Workspace>? available,
    Object? failure,
    ConnectionStatus connection = ConnectionStatus.ready,
    bool pumpOnce = true,
    bool waiting = false,
  }) async {
    workspaces = FakeWorkspaceRepository(
      workspaces: available ?? <Workspace>[project],
      failure: failure,
    );

    if (waiting) {
      workspaces.gate = Completer<void>();
    }
    sessions = FakeSessionRepository();
    addTearDown(sessions.dispose);

    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: workspacesRoute,
          builder: (BuildContext context, GoRouterState state) => const WorkspaceListPage(),
        ),
        GoRoute(
          path: '/sessions/:sessionId',
          builder: (BuildContext context, GoRouterState state) =>
              Scaffold(body: Text('opened ${state.pathParameters['sessionId']}')),
        ),
        GoRoute(
          path: rulesRoute,
          builder: (BuildContext context, GoRouterState state) =>
              const Scaffold(body: Text('the rules')),
        ),
      ],
      initialLocation: workspacesRoute,
      overrides: <Override>[
        workspaceRepositoryProvider.overrideWithValue(workspaces as WorkspaceRepository),
        sessionRepositoryProvider.overrideWithValue(sessions),
        deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
        pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(connection),
        ),
      ],
      pumpOnce: pumpOnce,
    );

    if (pumpOnce) {
      await tester.pumpAndSettle();
    }
  }

  group('S-37 · the four states', () {
    testWidgets('says it is loading before the allowlist answers', (WidgetTester tester) async {
      await pumpList(tester, waiting: true, pumpOnce: false);
      await tester.pump();

      expect(find.text(l10n.workspaceListLoading), findsOneWidget);
    });

    testWidgets('shows the failure with its trace, and a way out', (WidgetTester tester) async {
      await pumpList(tester, failure: const NetworkFailure(traceId: 'trace-77'));

      expect(find.textContaining('trace-77'), findsOneWidget);
      expect(find.text(l10n.commonActionRetry), findsOneWidget);
    });

    testWidgets('the retry asks again, and shows what it found', (WidgetTester tester) async {
      await pumpList(tester, failure: const NetworkFailure(traceId: 'trace-77'));

      workspaces.failure = null;
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.text('project'), findsOneWidget);
    });

    testWidgets('an empty allowlist says where roots come from', (WidgetTester tester) async {
      await pumpList(tester, available: <Workspace>[]);

      expect(find.text(l10n.workspaceListEmptyTitle), findsOneWidget);
      expect(find.text(l10n.workspaceListEmptyBody), findsOneWidget);
    });

    testWidgets('shows each root, and says when one was never opened', (WidgetTester tester) async {
      await pumpList(tester);

      expect(find.text('project'), findsOneWidget);
      expect(find.text(l10n.workspaceNeverOpened), findsOneWidget);
    });
  });

  testWidgets('D-04 · the rules are one tap from where sessions start', (
    WidgetTester tester,
  ) async {
    await pumpList(tester);

    await tester.tap(find.byTooltip(l10n.rulesOpen));
    await tester.pumpAndSettle();

    expect(find.text('the rules'), findsOneWidget);
  });

  testWidgets('S-75 · opening a session takes the screen to it when the id arrives', (
    WidgetTester tester,
  ) async {
    await pumpList(tester);

    await tester.tap(find.text('project'));
    await tester.pump();

    expect(sessions.commands.single.$1, 'session.start');
    // Nothing has happened on screen yet: `session.start` carries no id, and the answer arrives
    // on the socket.
    expect(find.text('opened session-42'), findsNothing);

    sessions.emit(started('session-42'));
    await tester.pumpAndSettle();

    expect(find.text('opened session-42'), findsOneWidget);
  });

  testWidgets('a disconnected socket disables the roots rather than failing on the tap', (
    WidgetTester tester,
  ) async {
    await pumpList(tester, connection: ConnectionStatus.reconnecting);

    await tester.tap(find.text('project'));
    await tester.pumpAndSettle();

    expect(sessions.commands, isEmpty);
  });

  testWidgets('a start the socket refused says so instead of waiting silently', (
    WidgetTester tester,
  ) async {
    await pumpList(tester);
    sessions.accepts = false;

    await tester.tap(find.text('project'));
    await tester.pumpAndSettle();

    expect(find.text(l10n.workspaceStartRefused), findsOneWidget);
  });

  testWidgets('what this installation may do is above the list, not hidden behind it', (
    WidgetTester tester,
  ) async {
    await pumpList(tester);

    expect(find.byType(DeviceStatusBanner), findsOneWidget);
    expect(find.byType(PushReachBanner), findsOneWidget);
  });
}
