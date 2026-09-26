/// The backend's rules, read as the app's own words.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/data/mappers/permission_rule_mapper.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';

Map<String, Object?> wireRule([Map<String, Object?> overrides = const <String, Object?>{}]) =>
    <String, Object?>{
      'id': 'rule_1',
      'scope': 'project',
      'toolName': 'Bash',
      'pattern': 'Bash(git status)',
      'decision': 'allow',
      'projectPath': '/srv/app',
      'grantedBy': 'user-1',
      'grantedAt': '2026-09-20T10:00:00.000Z',
      'expiresAt': '2026-12-19T10:00:00.000Z',
      'status': 'active',
      'revokedAt': null,
      ...overrides,
    };

void main() {
  group('one rule', () {
    test('is read field by field', () {
      expect(
        permissionRuleFrom(wireRule()),
        PermissionRule(
          id: 'rule_1',
          scope: PermissionScope.project,
          toolName: 'Bash',
          pattern: 'Bash(git status)',
          decision: PermissionDecision.allow,
          projectPath: '/srv/app',
          grantedBy: 'user-1',
          grantedAt: DateTime.utc(2026, 9, 20, 10),
          expiresAt: DateTime.utc(2026, 12, 19, 10),
          status: RuleStatus.active,
        ),
      );
    });

    test('reads `always`, a refusal, an expired one, and no project', () {
      final PermissionRule? rule = permissionRuleFrom(
        wireRule(<String, Object?>{
          'scope': 'always',
          'decision': 'deny',
          'status': 'expired',
          'projectPath': null,
        }),
      );

      expect(rule?.scope, PermissionScope.always);
      expect(rule?.decision, PermissionDecision.deny);
      expect(rule?.status, RuleStatus.expired);
      expect(rule?.projectPath, isNull);
    });

    test('reads a status added after this build shipped as unknown, not as an error', () {
      expect(
        permissionRuleFrom(wireRule(<String, Object?>{'status': 'paused'}))?.status,
        RuleStatus.unknown,
      );
    });

    for (final String field in <String>[
      'id',
      'toolName',
      'pattern',
      'grantedBy',
      'grantedAt',
      'expiresAt',
    ]) {
      test('drops a rule with no $field — a row that cannot say what it authorises', () {
        expect(permissionRuleFrom(wireRule(<String, Object?>{field: null})), isNull);
      });
    }

    test('drops a scope that does not outlive a session, or a decision nobody knows', () {
      expect(permissionRuleFrom(wireRule(<String, Object?>{'scope': 'session'})), isNull);
      expect(permissionRuleFrom(wireRule(<String, Object?>{'decision': 'maybe'})), isNull);
      expect(permissionRuleFrom(wireRule(<String, Object?>{'grantedAt': 'yesterday'})), isNull);
    });

    test('drops what is not a map', () {
      expect(permissionRuleFrom('rule_1'), isNull);
    });
  });

  group('the listing', () {
    test('keeps every rule it can read, in the order it arrived', () {
      final List<PermissionRule>? rules = permissionRulesIn(<String, Object?>{
        'rules': <Object?>[
          wireRule(<String, Object?>{'id': 'b'}),
          'junk',
          wireRule(<String, Object?>{'id': 'a'}),
        ],
      });

      expect(rules?.map((PermissionRule rule) => rule.id), <String>['b', 'a']);
    });

    test('answers an empty list for a user who granted nothing', () {
      expect(permissionRulesIn(<String, Object?>{'rules': <Object?>[]}), isEmpty);
    });

    test('answers null for a body that is not the listing', () {
      expect(permissionRulesIn(<String, Object?>{'rules': 'none'}), isNull);
      expect(permissionRulesIn(null), isNull);
    });
  });
}
