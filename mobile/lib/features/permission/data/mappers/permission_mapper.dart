/// Reads the permission frames — and the server's answer about one request — as the app's own
/// words.
///
/// This is the only file that knows both the wire and the permission entities. A frame, or a map
/// decoded from HTTP, never leaves `data/`.
///
/// A payload missing anything a person needs in order to decide is **dropped**, not shown with a
/// blank in it: a card that cannot say what it is asking about is a card nobody can answer
/// honestly.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/permission/data/mappers/wire_fields.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';

/// The frames of the permission round trip, by name. Nothing else in the app spells them.
abstract final class PermissionFrames {
  static const String requested = 'permission.requested';
  static const String resolve = 'permission.resolve';
  static const String resolved = 'permission.resolved';
  static const String extend = 'permission.extend';
  static const String extended = 'permission.extended';
}

/// The event a frame carries, or `null` when it is not a permission frame this build can read.
PermissionEvent? permissionEventFrom(Envelope frame) {
  final Map<String, Object?> payload = frame.payload ?? const <String, Object?>{};

  switch (frame.type) {
    case PermissionFrames.requested:
      final String? sessionId = frame.sessionId;
      final PermissionRequest? request = sessionId == null
          ? null
          : permissionRequestFrom(payload, sessionId: sessionId);
      return request == null ? null : PermissionAsked(request: request, frameId: frame.id);

    case PermissionFrames.resolved:
      final PermissionOutcome? outcome = permissionOutcomeFrom(payload);
      return outcome == null ? null : PermissionSettled(outcome);

    case PermissionFrames.extended:
      return _extended(payload);

    default:
      return null;
  }
}

/// Why the server refused an extension, read from its error frame, or `null` when the error is
/// about something else.
///
/// "Already over" covers both refusals the contract has for it — answered, and expired — because
/// the card does the same for both: nothing, until the settlement arrives and removes it.
ExtensionRefusal? extensionRefusalFrom(Envelope error) {
  final Map<String, Object?> payload = error.payload ?? const <String, Object?>{};

  if (payload['messageKey'] == 'permission.error.extensionLimitReached') {
    return ExtensionRefusal.ceiling;
  }

  return switch (payload['code']) {
    'PERMISSION_REQUEST_NOT_FOUND' || 'PERMISSION_REQUEST_EXPIRED' => ExtensionRefusal.over,
    _ => null,
  };
}

/// A request as the contract's `permission.requested` describes it, or `null` when it is not one.
PermissionRequest? permissionRequestFrom(
  Map<String, Object?> payload, {
  required String sessionId,
}) {
  final String? requestId = wireText(payload, 'requestId');
  final String? toolName = wireText(payload, 'toolName');
  // Required by the contract and checked here, even though the label comes from the tool name: a
  // payload missing it is a payload from something that is not this protocol.
  final String? title = wireText(payload, 'title');
  final DateTime? expiresAt = wireInstant(payload, 'expiresAt');
  final RiskHint? riskHint = switch (wireText(payload, 'riskHint')) {
    'read' => RiskHint.read,
    'write' => RiskHint.write,
    'destructive' => RiskHint.destructive,
    _ => null,
  };

  if (requestId == null ||
      toolName == null ||
      title == null ||
      expiresAt == null ||
      riskHint == null) {
    return null;
  }

  final Object? input = payload['input'];
  final ({List<PermissionScope> scopes, RuleOffer? rule}) offered = _offered(
    payload['suggestions'],
  );

  return PermissionRequest(
    requestId: requestId,
    sessionId: sessionId,
    toolUseId: wireText(payload, 'toolUseId') ?? '',
    toolName: toolName,
    description: wireText(payload, 'description'),
    input: input is Map<String, Object?> ? input : const <String, Object?>{},
    riskHint: riskHint,
    // Absent reads as `true`. The safe default is not a convenience here: it is the rule.
    defaultToNo: payload['defaultToNo'] != false,
    expiresAt: expiresAt,
    scopes: offered.scopes,
    rule: offered.rule,
  );
}

/// How a request was settled, as `permission.resolved` says it, or `null` when it is not that.
PermissionOutcome? permissionOutcomeFrom(Map<String, Object?> payload) {
  final String? requestId = wireText(payload, 'requestId');
  final PermissionDecision? decision = wireDecision(payload, 'decision');

  if (requestId == null || decision == null) {
    return null;
  }

  final bool auto = payload['auto'] == true;

  return PermissionOutcome(
    requestId: requestId,
    decision: decision,
    auto: auto,
    // The deadline's refusal and a rule's are both automatic; only a rule has an author. Telling
    // them apart is the difference between "nobody answered in time" and "you said so earlier".
    expired: auto && decision == PermissionDecision.deny && wireText(payload, 'resolvedBy') == null,
    origin: switch (wireText(payload, 'resolvedFrom')) {
      'web' => AnswerOrigin.web,
      'mobile' => AnswerOrigin.mobile,
      _ => AnswerOrigin.unknown,
    },
  );
}

/// The body of `GET /sessions/:sessionId/permissions/:requestId`, or `null` when it is not one.
///
/// `pending` carries the same payload the socket's `permission.requested` does, so the card drawn
/// from it is the card the stream would have drawn; `resolved` carries what `permission.resolved`
/// does ([D-22](../../../../../docs/plans/02-mobile-approval/decisions.md#d-22--revalidar-é-perguntar-não-esperar)).
PermissionLookup? permissionLookupFrom(Object? body, {required String sessionId}) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  switch (body['status']) {
    case 'pending':
      final Object? payload = body['request'];
      final PermissionRequest? request = payload is Map<String, Object?>
          ? permissionRequestFrom(payload, sessionId: sessionId)
          : null;
      final Object? remaining = body['remainingExtensions'];
      return request == null
          ? null
          : LookupPending(request, remainingExtensions: remaining is int ? remaining : null);

    case 'resolved':
      final PermissionOutcome? outcome = permissionOutcomeFrom(body);
      return outcome == null ? null : LookupSettled(outcome);

    default:
      return null;
  }
}

PermissionEvent? _extended(Map<String, Object?> payload) {
  final String? requestId = wireText(payload, 'requestId');
  final DateTime? expiresAt = wireInstant(payload, 'expiresAt');
  final Object? remaining = payload['remainingExtensions'];

  return requestId == null || expiresAt == null || remaining is! int
      ? null
      : PermissionDeadlineMoved(
          requestId: requestId,
          expiresAt: expiresAt,
          remainingExtensions: remaining,
        );
}

/// The scopes this build honours, `once` always first, and the rule the persisted ones would grant.
///
/// A suggestion for a scope this build cannot honour is dropped rather than offered: the server
/// would refuse it, and a button that always fails is worse than one that is not there. A persisted
/// scope that arrives without its pattern and its lifetime is dropped for the same reason and one
/// more: "don't ask again" without saying about what, or for how long, is the button R-02 is about
/// (S-67).
({List<PermissionScope> scopes, RuleOffer? rule}) _offered(Object? suggestions) {
  final Set<PermissionScope> offered = <PermissionScope>{PermissionScope.once};
  RuleOffer? rule;

  if (suggestions is List<Object?>) {
    for (final Object? entry in suggestions) {
      if (entry is! Map<String, Object?>) {
        continue;
      }

      switch (wireText(entry, 'scope')) {
        case 'session':
          offered.add(PermissionScope.session);
        case 'project' || 'always':
          final RuleOffer? described = _ruleOffer(entry);
          if (described != null) {
            offered.add(
              wireText(entry, 'scope') == 'project'
                  ? PermissionScope.project
                  : PermissionScope.always,
            );
            rule = described;
          }
      }
    }
  }

  // In the order the screen offers them, whatever order they arrived in: the narrowest first.
  return (
    scopes: PermissionScope.values.where(offered.contains).toList(growable: false),
    rule: rule,
  );
}

RuleOffer? _ruleOffer(Map<String, Object?> entry) {
  final String? pattern = wireText(entry, 'pattern');
  final Object? lifetimeMs = entry['lifetimeMs'];

  return pattern == null || lifetimeMs is! int || lifetimeMs <= 0
      ? null
      : RuleOffer(
          pattern: pattern,
          lifetime: Duration(milliseconds: lifetimeMs),
        );
}
