/// Watching the questions of a session, and asking the server about one of them.
library;

import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';

/// What Claude is told when somebody refuses from the phone.
///
/// English and technical on purpose: it is not shown to a person — it goes into the trail and back
/// to the model as a message, which is how the agent learns to propose something else instead of
/// retrying the same command. The contract requires one on every refusal.
const String refusedFromThePhone = 'refused from the mobile app';

/// Starts watching the permissions of one session.
class WatchPermissions {
  const WatchPermissions(this._repository);

  final PermissionRepository _repository;

  PermissionFeed call(String sessionId) => _repository.watch(sessionId);
}

/// Asks the server where one request stands — what a notification's screen does before rendering.
class LookupPermission {
  const LookupPermission(this._repository);

  final PermissionRepository _repository;

  Future<PermissionLookup> call(String sessionId, String requestId) =>
      _repository.lookup(sessionId, requestId);
}
