/// What runs in one folder, for the folder screen and the folders home (plan 10, F8).
library;

import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'folder_sessions_controller.g.dart';

/// Never asked again on its own: the screen says the failure and offers its own retry and its pull
/// to refresh, and an automatic retry would hide the failure behind "loading" (S-150, S-151).
Duration? _neverRetry(int retryCount, Object error) => null;

/// The live sessions of [workspacePath] and of the folders below it, from every device.
///
/// Read again when the screen comes back and when it is pulled — never pushed: a list is a
/// question with an answer (docs/architecture/shared/05-websocket-protocol.md). Only the newest
/// answer is kept: one that arrives after a newer question asked is dropped (S-152).
@Riverpod(retry: _neverRetry)
class FolderSessionsController extends _$FolderSessionsController {
  int _readings = 0;

  @override
  Future<List<LiveSessionSummary>> build(String workspacePath) => _read();

  /// Asks again, keeping what is on screen until the answer arrives.
  Future<void> reload() async {
    final int reading = ++_readings;
    final AsyncValue<List<LiveSessionSummary>> answer =
        await AsyncValue.guard<List<LiveSessionSummary>>(_read);

    if (reading == _readings) {
      state = answer;
    }
  }

  Future<List<LiveSessionSummary>> _read() async {
    final List<LiveSessionSummary> sessions = await ref.read(listLiveSessionsProvider)(
      workspacePath,
    );
    final List<String> unknown = sessions
        .where((LiveSessionSummary each) => each.status == null)
        .map((LiveSessionSummary each) => each.sessionId)
        .toList(growable: false);

    ref
        .read(appLoggerProvider)
        .debug(
          'live sessions of a folder read',
          op: LogOp.sessionList,
          fields: <String, Object?>{
            'count': sessions.length,
            if (unknown.isNotEmpty) 'unknownStatus': unknown,
          },
        );

    return sessions;
  }
}
