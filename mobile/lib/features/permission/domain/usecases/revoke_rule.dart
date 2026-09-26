/// Taking a rule back. One use case, one thing it does.
library;

import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';

/// Revokes one rule, with effect on the next request of every session.
class RevokeRule {
  const RevokeRule(this._rules);

  final PermissionRuleRepository _rules;

  Future<void> call(String ruleId) => _rules.revoke(ruleId);
}
