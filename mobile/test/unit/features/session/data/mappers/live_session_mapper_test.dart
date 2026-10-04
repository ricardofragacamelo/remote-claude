/// `GET /sessions?workspacePath=`, read as entities — plan 10, B-41.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/live_session_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';

Map<String, Object?> row({
  String sessionId = 's-1',
  Object? status = 'running',
  Object? openedFrom = 'web',
  Object? pending = 2,
}) => <String, Object?>{
  'sessionId': sessionId,
  'claudeSessionId': 'c-1',
  'resumedFrom': null,
  'workspacePath': '/w/a/sub',
  'status': status,
  'model': 'opus',
  'permissionMode': 'default',
  'startedAt': '2026-10-04T10:00:00.000Z',
  'openedFrom': openedFrom,
  'pendingPermissions': pending,
};

void main() {
  // S-153
  test('S-153 · every field of a live session', () {
    final List<LiveSessionSummary>? sessions = liveSessionsFrom(<String, Object?>{
      'sessions': <Object?>[row()],
    });

    expect(sessions, <LiveSessionSummary>[
      LiveSessionSummary(
        sessionId: 's-1',
        workspacePath: '/w/a/sub',
        status: SessionStatus.running,
        model: 'opus',
        permissionMode: 'default',
        startedAt: DateTime.utc(2026, 10, 4, 10),
        openedFrom: SessionOrigin.web,
        pendingPermissions: 2,
      ),
    ]);
  });

  test('S-153 · an empty folder is an answer, not a failure', () {
    expect(liveSessionsFrom(<String, Object?>{'sessions': <Object?>[]}), isEmpty);
  });

  // S-154
  test('S-154 · a status or an origin this build does not know is kept, as unknown', () {
    final LiveSessionSummary? session = liveSessionFrom(
      row(status: 'hibernating', openedFrom: 'watch', pending: -3),
    );

    expect(session?.status, isNull);
    expect(session?.openedFrom, SessionOrigin.unknown);
    expect(session?.pendingPermissions, 0);
    expect(liveSessionFrom(row(openedFrom: 'mobile'))?.openedFrom, SessionOrigin.mobile);
  });

  test('S-154 · a row out of the format is dropped; a body that is no list is no answer', () {
    expect(
      liveSessionsFrom(<String, Object?>{
        'sessions': <Object?>[
          row(),
          <String, Object?>{'sessionId': 's-2'},
          'nope',
        ],
      }),
      hasLength(1),
    );
    expect(liveSessionsFrom(<String, Object?>{'sessions': 'nope'}), isNull);
    expect(liveSessionsFrom(null), isNull);
  });

  test('the load of a folder sums its sessions and the questions waiting', () {
    final List<LiveSessionSummary> sessions = <LiveSessionSummary>[
      liveSessionFrom(row())!,
      liveSessionFrom(row(sessionId: 's-2', pending: 1))!,
    ];

    expect(FolderLoad.of(sessions), const FolderLoad(sessions: 2, pending: 3));
    expect(FolderLoad.of(const <LiveSessionSummary>[]), const FolderLoad(sessions: 0, pending: 0));
  });
}
