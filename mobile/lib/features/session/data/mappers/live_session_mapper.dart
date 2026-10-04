/// Reads `GET /sessions?workspacePath=` as entities.
library;

import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/live_session_summary.dart';

SessionStatus? _statusFrom(Object? raw) {
  for (final SessionStatus status in SessionStatus.values) {
    if (status.name == raw) {
      return status;
    }
  }

  return null;
}

SessionOrigin _originFrom(Object? raw) => switch (raw) {
  'web' => SessionOrigin.web,
  'mobile' => SessionOrigin.mobile,
  _ => SessionOrigin.unknown,
};

/// One live session, or `null` when [entry] is not one. A status or an origin this build does not
/// know is kept as unknown: the session runs whether or not this build has a word for it.
LiveSessionSummary? liveSessionFrom(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final Object? sessionId = entry['sessionId'];
  final Object? workspacePath = entry['workspacePath'];
  final Object? model = entry['model'];
  final Object? mode = entry['permissionMode'];
  final Object? startedAt = entry['startedAt'];
  final Object? pending = entry['pendingPermissions'];
  final DateTime? started = startedAt is String ? DateTime.tryParse(startedAt) : null;

  if (sessionId is! String || workspacePath is! String || started == null) {
    return null;
  }

  return LiveSessionSummary(
    sessionId: sessionId,
    workspacePath: workspacePath,
    status: _statusFrom(entry['status']),
    model: model is String ? model : '',
    permissionMode: mode is String ? mode : '',
    startedAt: started.toUtc(),
    openedFrom: _originFrom(entry['openedFrom']),
    pendingPermissions: pending is int && pending > 0 ? pending : 0,
  );
}

/// The live sessions of the answer, the unreadable rows dropped, or `null` when the answer is not
/// a list of sessions at all.
List<LiveSessionSummary>? liveSessionsFrom(Object? payload) {
  final Object? sessions = payload is Map<String, Object?> ? payload['sessions'] : null;

  if (sessions is! List<Object?>) {
    return null;
  }

  return sessions.map(liveSessionFrom).whereType<LiveSessionSummary>().toList(growable: false);
}
