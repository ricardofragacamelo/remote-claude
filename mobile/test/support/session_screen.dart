/// The session screen mounted with every fake it reads, for the tests of what opens over it.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/session/domain/repositories/checkpoint_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/session.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import 'builders/frames.dart';
import 'builders/permissions.dart';
import 'fakes/fake_checkpoint_repository.dart';
import 'fakes/fake_command_repository.dart';
import 'fakes/fake_history_repository.dart';
import 'fakes/fake_permission_repository.dart';
import 'fakes/fake_session_repository.dart';
import 'fakes/stub_device_controller.dart';
import 'fakes/stub_push_controller.dart';
import 'pump_app.dart';

/// The fakes behind one mounted session screen.
class SessionScreen {
  final FakeSessionRepository sessions = FakeSessionRepository();
  final FakeCommandRepository commands = FakeCommandRepository();
  final FakeCheckpointRepository checkpoints = FakeCheckpointRepository();

  /// Mounts `session-1`, connected as [connection] says, and — unless [opened] is false — opened
  /// and idle, which is what the undo needs.
  Future<void> pump(
    WidgetTester tester, {
    ConnectionStatus connection = ConnectionStatus.ready,
    bool opened = true,
  }) async {
    addTearDown(sessions.dispose);

    await tester.pumpApp(
      const SessionPage(sessionId: 'session-1'),
      overrides: <Override>[
        ...permissionOverrides(repository: FakePermissionRepository(), clock: () => t0),
        sessionRepositoryProvider.overrideWithValue(sessions),
        historyRepositoryProvider.overrideWithValue(FakeHistoryRepository() as HistoryRepository),
        commandRepositoryProvider.overrideWithValue(commands as CommandRepository),
        checkpointRepositoryProvider.overrideWithValue(checkpoints as CheckpointRepository),
        deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
        pushControllerAnswering(AsyncValue<PushReach>.data(aReach())),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(connection),
        ),
      ],
    );

    if (opened) {
      sessions.emit(arrivalOf(sessionStarted(sessionId: 'session-1')));
    }

    await tester.pumpAndSettle();
  }
}
