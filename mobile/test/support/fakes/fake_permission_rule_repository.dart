/// A rule repository the test drives.
library;

import 'dart:async';

import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';

/// A rule, overridable field by field.
PermissionRule aPermissionRule({
  String id = 'rule_1',
  PermissionScope scope = PermissionScope.always,
  String toolName = 'Bash',
  String pattern = 'Bash(git status)',
  PermissionDecision decision = PermissionDecision.allow,
  String? projectPath,
  DateTime? grantedAt,
  DateTime? expiresAt,
  RuleStatus status = RuleStatus.active,
}) => PermissionRule(
  id: id,
  scope: scope,
  toolName: toolName,
  pattern: pattern,
  decision: decision,
  projectPath: projectPath,
  grantedBy: 'user-1',
  grantedAt: grantedAt ?? DateTime.utc(2026, 9, 20, 10),
  expiresAt: expiresAt ?? DateTime.utc(2026, 12, 19, 10),
  status: status,
);

/// [PermissionRuleRepository] over a list the test owns.
///
/// A revocation completes when the test says so — [holdRevocations] — because the double tap is a
/// question about what happens **while** one is in flight, and a fake that answered at once could
/// never be asked it.
class FakePermissionRuleRepository implements PermissionRuleRepository {
  FakePermissionRuleRepository({List<PermissionRule>? rules}) : rules = rules ?? <PermissionRule>[];

  /// What `list` answers.
  List<PermissionRule> rules;

  /// Thrown by `list` when set.
  Object? listFailure;

  /// Thrown by `revoke` when set.
  Object? revokeFailure;

  /// Whether revocations wait for [releaseRevocations].
  bool holdRevocations = false;

  final List<String> revoked = <String>[];
  int listed = 0;
  final List<Completer<void>> _held = <Completer<void>>[];

  @override
  Future<List<PermissionRule>> list() async {
    listed++;
    final Object? failure = listFailure;
    if (failure != null) {
      throw failure;
    }
    return List<PermissionRule>.of(rules);
  }

  @override
  Future<void> revoke(String ruleId) async {
    revoked.add(ruleId);

    if (holdRevocations) {
      final Completer<void> held = Completer<void>();
      _held.add(held);
      await held.future;
    }

    final Object? failure = revokeFailure;
    if (failure != null) {
      throw failure;
    }
    rules = rules.where((PermissionRule rule) => rule.id != ruleId).toList();
  }

  /// Lets every held revocation finish.
  void releaseRevocations() {
    for (final Completer<void> held in _held) {
      held.complete();
    }
    _held.clear();
  }
}
