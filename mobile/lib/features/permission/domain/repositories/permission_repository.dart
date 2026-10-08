/// What the permission use cases need from the outside world.
///
/// Interfaces in `domain/`, implemented in `data/`. The direction is the point: the rules depend on
/// these, not on a socket, an HTTP client or a plugin.
library;

import 'package:equatable/equatable.dart';

import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// The permissions of one session, while somebody is looking at them.
///
/// Closing it is **not optional**: it is what detaches this screen from the session, and a feed
/// left open keeps a screen that is gone processing questions for a session it no longer shows.
/// One answer, as it leaves for the server.
class OutgoingAnswer extends Equatable {
  const OutgoingAnswer({
    required this.frameId,
    required this.requestId,
    required this.decision,
    required this.scope,
    this.reason,
    this.reach,
  });

  /// The frame the question is on **now** — what the response correlates to.
  final String frameId;
  final String requestId;
  final PermissionDecision decision;
  final PermissionScope scope;

  /// Why it was refused. The contract requires one on a refusal.
  final String? reason;

  /// Which of the request's reaches the rules of a `session`, `project` or `always` yes take.
  final RuleReachKind? reach;

  @override
  List<Object?> get props => <Object?>[frameId, requestId, decision, scope, reason, reach];
}

abstract interface class PermissionFeed {
  /// Everything that happens to the permissions of the session.
  Stream<PermissionEvent> get events;

  /// Sends [answer] to the question carried by its frame.
  ///
  /// @returns whether the answer left; a socket that is not ready sends nothing
  bool answer(OutgoingAnswer answer);

  /// Asks for more time. The payload carries **only** the request: the increment and the ceiling
  /// are the backend's, because a client that could choose them could switch the deadline off.
  ///
  /// @returns whether the command left
  bool extend(String requestId);

  /// Stops watching.
  void close();
}

/// Permissions, over the socket and over HTTP.
abstract interface class PermissionRepository {
  /// Starts watching the permissions of [sessionId].
  PermissionFeed watch(String sessionId);

  /// Asks the server where one request stands.
  ///
  /// @throws [Failure] when the question cannot be answered — the network, or a request that is
  ///   not this user's (`PERMISSION_NOT_OWNED`). An expired or forgotten request is an answer, not
  ///   a failure.
  Future<PermissionLookup> lookup(String sessionId, String requestId);
}
