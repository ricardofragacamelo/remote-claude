/// Reads the backend's rule payload as a [PermissionRule] (plan 03; plan 28, B-48).
///
/// Read by the generated types of the contract — after checking the shape first: the generated
/// readers assert their fields, which is right for a frame this app built and wrong for an answer
/// from the network (`mobile/lib/core/network/contracts/frame_codec.dart`). A field this build
/// never reads (`toolName`) or one the contract requires but a rule need not carry (`disabled` with
/// an unreadable reason) is normalised to a safe value rather than costing the whole rule.
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart' as wire;
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';

bool _looksLikeRule(Map<String, Object?> payload) =>
    payload['id'] is String &&
    payload['scope'] is String &&
    payload['pattern'] is String &&
    payload['decision'] is String &&
    payload['grantedBy'] is String &&
    payload['grantedAt'] is String &&
    payload['expiresAt'] is String &&
    payload['status'] is String;

String? _asNullableString(Object? value) => value is String ? value : null;

/// [payload], with the fields the contract requires but this build treats as optional coerced to a
/// value that reads rather than throws.
Map<String, Object?> _normalized(Map<String, Object?> payload) {
  final Object? disabled = payload['disabled'];

  return <String, Object?>{
    ...payload,
    'kind': _asNullableString(payload['kind']),
    // Kept by the server for the published app, and never read by this build.
    'toolName': payload['toolName'] is String ? payload['toolName'] : '',
    'projectPath': _asNullableString(payload['projectPath']),
    'engine': _asNullableString(payload['engine']),
    'revokedAt': _asNullableString(payload['revokedAt']),
    'disabled': disabled is Map<String, Object?>
        ? <String, Object?>{'reason': disabled['reason'] is String ? disabled['reason'] : 'unknown'}
        : null,
  };
}

/// The rule the wire fields describe, or `null` when it is not one this build can decide about.
///
/// A rule missing anything that says how far it reaches is **dropped**, not listed with a blank in
/// it: a row that cannot say what it authorises is a row nobody can decide to revoke.
PermissionRule? _ruleFrom({
  required String id,
  required String scopeRaw,
  required String? kind,
  required String pattern,
  required String decisionRaw,
  required String? projectPath,
  required String? engine,
  required String grantedBy,
  required String grantedAtRaw,
  required String expiresAtRaw,
  required String statusRaw,
  required String? disabledReason,
}) {
  final PermissionScope? scope = switch (scopeRaw) {
    'project' => PermissionScope.project,
    'always' => PermissionScope.always,
    _ => null,
  };
  final PermissionDecision? decision = switch (decisionRaw) {
    'allow' => PermissionDecision.allow,
    'deny' => PermissionDecision.deny,
    _ => null,
  };
  final DateTime? grantedAt = DateTime.tryParse(grantedAtRaw);
  final DateTime? expiresAt = DateTime.tryParse(expiresAtRaw);

  if (scope == null || decision == null || grantedAt == null || expiresAt == null) {
    return null;
  }

  return PermissionRule(
    id: id,
    scope: scope,
    // The kind, and never the `toolName` the server keeps beside it for older builds: a rule is named
    // by what it answers, not by the engine's name for a tool (plan 28, F5).
    kind: kind,
    pattern: pattern,
    decision: decision,
    projectPath: projectPath,
    grantedBy: grantedBy,
    grantedAt: grantedAt,
    expiresAt: expiresAt,
    // An unknown status is shown as unknown rather than guessed: an app already on a store has to
    // survive a state added after it shipped.
    status: switch (statusRaw) {
      'active' => RuleStatus.active,
      'expired' => RuleStatus.expired,
      'disabled' => RuleStatus.disabled,
      _ => RuleStatus.unknown,
    },
    engine: engine,
    disabledReason: disabledReason,
  );
}

/// The rule in [payload], or `null` when the answer is not one this build can describe.
PermissionRule? permissionRuleFrom(Object? payload) {
  if (payload is! Map<String, Object?> || !_looksLikeRule(payload)) {
    return null;
  }

  final wire.PermissionRulePayload body = wire.PermissionRulePayload.fromJson(_normalized(payload));

  return _ruleFrom(
    id: body.id,
    scopeRaw: body.scope,
    kind: body.kind,
    pattern: body.pattern,
    decisionRaw: body.decision,
    projectPath: body.projectPath,
    engine: body.engine,
    grantedBy: body.grantedBy,
    grantedAtRaw: body.grantedAt,
    expiresAtRaw: body.expiresAt,
    statusRaw: body.status,
    disabledReason: body.disabled?.reason,
  );
}

/// Every rule in a `GET /permission-rules` body, or `null` when the body is not that listing — the
/// unreadable rows dropped.
List<PermissionRule>? permissionRulesIn(Object? body) {
  final Object? rules = body is Map<String, Object?> ? body['rules'] : null;

  if (rules is! List<Object?>) {
    return null;
  }

  final List<Object?> validRows = rules
      .where((Object? row) => row is Map<String, Object?> && _looksLikeRule(row))
      .map((Object? row) => _normalized(row! as Map<String, Object?>))
      .toList(growable: false);

  final wire.PermissionRuleListPayload list = wire.PermissionRuleListPayload.fromJson(
    <String, Object?>{'rules': validRows},
  );

  return <PermissionRule>[
    for (final wire.PermissionRule item in list.rules)
      if (_ruleFrom(
            id: item.id,
            scopeRaw: item.scope,
            kind: item.kind,
            pattern: item.pattern,
            decisionRaw: item.decision,
            projectPath: item.projectPath,
            engine: item.engine,
            grantedBy: item.grantedBy,
            grantedAtRaw: item.grantedAt,
            expiresAtRaw: item.expiresAt,
            statusRaw: item.status,
            disabledReason: item.disabled?.reason,
          )
          case final PermissionRule rule)
        rule,
  ];
}
