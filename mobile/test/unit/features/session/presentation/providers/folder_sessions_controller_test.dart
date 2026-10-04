/// What runs in one folder — plan 10, B-40 and B-41.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';
import 'package:remote_claude/features/session/domain/repositories/live_session_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/folder_sessions_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/fakes/recording_writer.dart';

LiveSessionSummary aLive(String id, {SessionStatus? status = SessionStatus.idle}) =>
    LiveSessionSummary(
      sessionId: id,
      workspacePath: '/w/a',
      status: status,
      model: 'opus',
      permissionMode: 'default',
      startedAt: DateTime.utc(2026, 10, 4),
      openedFrom: SessionOrigin.mobile,
      pendingPermissions: 0,
    );

/// Answers each read with the next completer the test holds, so answers can arrive out of order.
class ScriptedLiveSessions implements LiveSessionRepository {
  final List<Completer<List<LiveSessionSummary>>> pending = <Completer<List<LiveSessionSummary>>>[];

  @override
  Future<List<LiveSessionSummary>> list(String workspacePath) {
    final Completer<List<LiveSessionSummary>> answer = Completer<List<LiveSessionSummary>>();
    pending.add(answer);
    return answer.future;
  }
}

void main() {
  late ScriptedLiveSessions sessions;
  late RecordingWriter written;

  ProviderContainer build() {
    sessions = ScriptedLiveSessions();
    written = RecordingWriter();
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        liveSessionRepositoryProvider.overrideWithValue(sessions as LiveSessionRepository),
        appLoggerProvider.overrideWithValue(
          AppLogger(
            context: const LogContext(appVersion: '0.0.1', platform: 'android'),
            writer: written.writer,
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    container.listen(folderSessionsControllerProvider('/w/a'), (_, _) {});
    return container;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('reads the folder, and says what of it this build could not name — S-154', () async {
    final ProviderContainer container = build();

    sessions.pending.single.complete(<LiveSessionSummary>[
      aLive('s-1'),
      aLive('s-2', status: null),
    ]);
    await settle();

    expect(container.read(folderSessionsControllerProvider('/w/a')).requireValue, hasLength(2));
    final Map<String, Object?> line = written.withOp('session.list').single;
    expect(line['count'], 2);
    expect(line['unknownStatus'], <String>['s-2']);
  });

  // S-152 · the newest question wins, whatever order the answers arrive in.
  test('S-152 · an answer that arrives after a newer one is dropped', () async {
    final ProviderContainer container = build();
    sessions.pending.single.complete(<LiveSessionSummary>[]);
    await settle();

    final FolderSessionsController controller = container.read(
      folderSessionsControllerProvider('/w/a').notifier,
    );
    final Future<void> older = controller.reload();
    final Future<void> newer = controller.reload();

    sessions.pending[2].complete(<LiveSessionSummary>[aLive('new')]);
    await newer;
    sessions.pending[1].complete(<LiveSessionSummary>[aLive('old')]);
    await older;

    expect(
      container.read(folderSessionsControllerProvider('/w/a')).requireValue.single.sessionId,
      'new',
    );
  });

  test('a failed reading lands in the state, for the screen to say', () async {
    final ProviderContainer container = build();
    sessions.pending.single.completeError(StateError('down'));
    await settle();

    expect(container.read(folderSessionsControllerProvider('/w/a')).hasError, isTrue);
  });
}
