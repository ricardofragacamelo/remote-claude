/// The session screen mounted with every fake it reads, for the tests of what opens over it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/notifications/push_providers.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/insight_repository.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import 'builders/frames.dart';
import 'builders/permissions.dart';
import 'fakes/fake_checkpoint_repository.dart';
import 'fakes/fake_command_repository.dart';
import 'fakes/fake_history_repository.dart';
import 'fakes/fake_insight_repository.dart';
import 'fakes/fake_permission_repository.dart';
import 'fakes/fake_push_gateway.dart';
import 'fakes/fake_session_repository.dart';
import 'fakes/stub_device_controller.dart';
import 'fakes/stub_push_controller.dart';
import 'pump_app.dart';

/// The fakes behind one mounted session screen.
class SessionScreen {
  final FakeSessionRepository sessions = FakeSessionRepository();
  final FakeCommandRepository commands = FakeCommandRepository();
  final FakeCheckpointRepository checkpoints = FakeCheckpointRepository();
  final FakeInsightRepository insight = FakeInsightRepository();
  final FakePermissionRepository permissions = FakePermissionRepository();
  final FakePushGateway push = FakePushGateway();

  /// What a route the screen went to shows — a marker with the address, so a test proves where the
  /// screen went without building the screen it would be.
  static Widget destination(GoRouterState state) => Text('at ${state.uri}');

  /// Mounts `session-1`, connected as [connection] says, and — unless [opened] is false — opened
  /// and idle, which is what the undo needs.
  ///
  /// [routed] mounts it inside a router, at its own address, for a test of where it navigates.
  Future<void> pump(
    WidgetTester tester, {
    ConnectionStatus connection = ConnectionStatus.ready,
    bool opened = true,
    bool routed = false,
    List<Override> extra = const <Override>[],
  }) async {
    addTearDown(sessions.dispose);

    final List<Override> overrides = <Override>[
      ...extra,
      ...permissionOverrides(repository: permissions, clock: () => t0),
      pushGatewayProvider.overrideWithValue(push),
      sessionRepositoryProvider.overrideWithValue(sessions),
      historyRepositoryProvider.overrideWithValue(FakeHistoryRepository() as HistoryRepository),
      commandRepositoryProvider.overrideWithValue(commands as CommandRepository),
      checkpointRepositoryProvider.overrideWithValue(checkpoints as CheckpointRepository),
      insightRepositoryProvider.overrideWithValue(insight as InsightRepository),
      deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
      pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
      connectionStatusProvider.overrideWith(
        (Ref ref) => Stream<ConnectionStatus>.value(connection),
      ),
    ];

    if (routed) {
      await tester.pumpRouted(
        <RouteBase>[
          GoRoute(
            path: '/sessions/:sessionId',
            builder: (BuildContext context, GoRouterState state) => SessionPage(
              sessionId: state.pathParameters['sessionId'] ?? '',
              focusRequest: state.uri.queryParameters[requestParameter],
            ),
          ),
          GoRoute(
            path: historyRoute,
            builder: (BuildContext _, GoRouterState state) => destination(state),
          ),
          GoRoute(
            path: rulesRoute,
            builder: (BuildContext _, GoRouterState state) => destination(state),
          ),
          // Where the folder's panel leads (plan 10, F9).
          GoRoute(
            path: draftRoute,
            builder: (BuildContext _, GoRouterState state) => destination(state),
          ),
          GoRoute(
            path: folderRoute,
            builder: (BuildContext _, GoRouterState state) => destination(state),
          ),
          // Where the files' panel leads (plan 25, F3).
          GoRoute(
            path: fileViewerRoute,
            builder: (BuildContext _, GoRouterState state) => destination(state),
          ),
        ],
        initialLocation: sessionRouteFor('session-1'),
        overrides: overrides,
      );
    } else {
      await tester.pumpApp(const SessionPage(sessionId: 'session-1'), overrides: overrides);
    }

    if (opened) {
      sessions.emit(arrivalOf(sessionStarted(sessionId: 'session-1')));
    }

    await tester.pumpAndSettle();
  }
}
