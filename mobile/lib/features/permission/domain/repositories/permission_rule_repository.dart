/// What the rule use cases need from the outside world.
library;

import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';

/// The rules of the signed-in user, over the backend.
abstract interface class PermissionRuleRepository {
  /// Every rule, newest first — the expired ones included, the revoked ones gone.
  ///
  /// @throws [Failure] never an exception of the transport
  Future<List<PermissionRule>> list();

  /// Takes the rule [ruleId] back. It stops answering on the very next request, in every open
  /// session. Idempotent on the server.
  ///
  /// @throws [Failure] `PERMISSION_RULE_NOT_FOUND`, `PERMISSION_NOT_OWNED`, or the transport's
  Future<void> revoke(String ruleId);
}
