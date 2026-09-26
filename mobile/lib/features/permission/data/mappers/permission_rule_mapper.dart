/// Reads the backend's rule payload as a [PermissionRule].
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/features/permission/data/mappers/wire_fields.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';

/// The rule in [payload], or `null` when the answer is not one this build can describe.
///
/// A rule missing anything that says how far it reaches is **dropped**, not listed with a blank in
/// it: a row that cannot say what it authorises is a row nobody can decide to revoke.
PermissionRule? permissionRuleFrom(Object? payload) {
  if (payload is! Map<String, Object?>) {
    return null;
  }

  final String? id = wireText(payload, 'id');
  final String? toolName = wireText(payload, 'toolName');
  final String? pattern = wireText(payload, 'pattern');
  final String? grantedBy = wireText(payload, 'grantedBy');
  final DateTime? grantedAt = wireInstant(payload, 'grantedAt');
  final DateTime? expiresAt = wireInstant(payload, 'expiresAt');
  final PermissionScope? scope = switch (wireText(payload, 'scope')) {
    'project' => PermissionScope.project,
    'always' => PermissionScope.always,
    _ => null,
  };
  final PermissionDecision? decision = wireDecision(payload, 'decision');

  if (id == null ||
      toolName == null ||
      pattern == null ||
      grantedBy == null ||
      grantedAt == null ||
      expiresAt == null ||
      scope == null ||
      decision == null) {
    return null;
  }

  return PermissionRule(
    id: id,
    scope: scope,
    toolName: toolName,
    pattern: pattern,
    decision: decision,
    projectPath: wireText(payload, 'projectPath'),
    grantedBy: grantedBy,
    grantedAt: grantedAt,
    expiresAt: expiresAt,
    // An unknown status is shown as unknown rather than guessed: an app already on a store has to
    // survive a state added after it shipped.
    status: switch (wireText(payload, 'status')) {
      'active' => RuleStatus.active,
      'expired' => RuleStatus.expired,
      _ => RuleStatus.unknown,
    },
  );
}

/// Every rule in a `GET /permission-rules` body, or `null` when the body is not that listing.
List<PermissionRule>? permissionRulesIn(Object? body) {
  final Object? rules = body is Map<String, Object?> ? body['rules'] : null;

  if (rules is! List<Object?>) {
    return null;
  }

  return <PermissionRule>[for (final Object? entry in rules) ?permissionRuleFrom(entry)];
}
