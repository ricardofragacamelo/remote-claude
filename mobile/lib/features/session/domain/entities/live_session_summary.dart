/// A session running in a folder right now, as the folder screen and the home list it
/// (plan 10, F8) — from this phone, from another, or from a browser.
///
/// Pure Dart.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';

/// Where a session was opened. The contract carries two; anything else is [unknown].
enum SessionOrigin { web, mobile, unknown }

/// One live session.
class LiveSessionSummary extends Equatable {
  const LiveSessionSummary({
    required this.sessionId,
    required this.workspacePath,
    required this.status,
    required this.model,
    required this.permissionMode,
    required this.startedAt,
    required this.openedFrom,
    required this.pendingPermissions,
  });

  final String sessionId;

  /// Where it runs — the folder asked about, or one below it.
  final String workspacePath;

  /// What it is doing, or `null` for a status this build does not know — shown as unknown rather
  /// than dropping the row.
  final SessionStatus? status;

  final String model;
  final String permissionMode;
  final DateTime startedAt;
  final SessionOrigin openedFrom;

  /// How many questions of it wait for somebody.
  final int pendingPermissions;

  @override
  List<Object?> get props => <Object?>[
    sessionId,
    workspacePath,
    status,
    model,
    permissionMode,
    startedAt,
    openedFrom,
    pendingPermissions,
  ];
}

/// How much runs in a folder: its live sessions and the questions waiting in them.
class FolderLoad extends Equatable {
  const FolderLoad({required this.sessions, required this.pending});

  /// The load of [sessions].
  factory FolderLoad.of(List<LiveSessionSummary> sessions) => FolderLoad(
    sessions: sessions.length,
    pending: sessions.fold(0, (int sum, LiveSessionSummary each) => sum + each.pendingPermissions),
  );

  final int sessions;
  final int pending;

  @override
  List<Object?> get props => <Object?>[sessions, pending];
}
