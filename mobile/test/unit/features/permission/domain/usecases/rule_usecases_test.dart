import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/domain/usecases/list_rules.dart';
import 'package:remote_claude/features/permission/domain/usecases/revoke_rule.dart';

import '../../../../../support/fakes/fake_permission_rule_repository.dart';

void main() {
  test('listing reads the repository', () async {
    final FakePermissionRuleRepository rules = FakePermissionRuleRepository(
      rules: <PermissionRule>[aPermissionRule()],
    );

    expect(await ListRules(rules)(), <PermissionRule>[aPermissionRule()]);
  });

  test('revoking names the one rule', () async {
    final FakePermissionRuleRepository rules = FakePermissionRuleRepository();

    await RevokeRule(rules)('rule_1');

    expect(rules.revoked, <String>['rule_1']);
  });
}
