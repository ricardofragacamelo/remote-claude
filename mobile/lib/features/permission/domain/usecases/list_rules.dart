/// Reading the rules. One use case, one thing it does.
library;

import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';

/// What the user authorised in advance.
class ListRules {
  const ListRules(this._rules);

  final PermissionRuleRepository _rules;

  Future<List<PermissionRule>> call() => _rules.list();
}
