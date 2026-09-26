/// A rule, and the one thing about time it knows.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';

final DateTime now = DateTime.utc(2026, 9, 24, 12);

PermissionRule aRule({required DateTime expiresAt, RuleStatus status = RuleStatus.active}) =>
    PermissionRule(
      id: 'rule_1',
      scope: PermissionScope.always,
      toolName: 'Bash',
      pattern: 'Bash(git status)',
      decision: PermissionDecision.allow,
      grantedBy: 'user-1',
      grantedAt: now.subtract(const Duration(days: 1)),
      expiresAt: expiresAt,
      status: status,
    );

void main() {
  // S-66, D-13 — seven days, and not a day less or more.
  group('about to expire', () {
    for (final (String name, Duration left, bool flagged) in <(String, Duration, bool)>[
      ('a day left', const Duration(days: 1), true),
      ('just under the threshold', expiryWarning - const Duration(milliseconds: 1), true),
      ('exactly the threshold', expiryWarning, false),
      ('ninety days left', const Duration(days: 90), false),
    ]) {
      test('is ${flagged ? '' : 'not '}said with $name', () {
        expect(aRule(expiresAt: now.add(left)).isExpiringSoonAt(now), flagged);
      });
    }

    test('is not said of a rule that already expired — it did', () {
      final PermissionRule expired = aRule(
        expiresAt: now.subtract(const Duration(days: 1)),
        status: RuleStatus.expired,
      );

      expect(expired.isExpiringSoonAt(now), isFalse);
    });

    test('is not said of a rule in a state this build does not know', () {
      final PermissionRule unknown = aRule(
        expiresAt: now.add(const Duration(days: 1)),
        status: RuleStatus.unknown,
      );

      expect(unknown.isExpiringSoonAt(now), isFalse);
    });
  });

  test('two rules are equal field by field', () {
    expect(aRule(expiresAt: now), aRule(expiresAt: now));
    expect(aRule(expiresAt: now), isNot(aRule(expiresAt: now.add(const Duration(days: 1)))));
  });
}
