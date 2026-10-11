/// Permission requests, built for a test.
library;

import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/plan_interaction.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';

import 'tools.dart';

/// The instant every test's clock starts at.
final DateTime t0 = DateTime.utc(2026, 9, 24, 12);

/// A request the backend would send, overridable field by field.
PermissionRequest aPermissionRequest({
  String requestId = 'request-1',
  String sessionId = 'session-1',
  String toolUseId = 'toolu-1',
  ToolCall? call,
  String titleKey = 'permission.tool.shell',
  String? engine = 'engine-a',
  String? description = 'rm -rf build/',
  RiskHint riskHint = RiskHint.destructive,
  bool defaultToNo = true,
  DateTime? expiresAt,
  List<PermissionScope> scopes = const <PermissionScope>[
    PermissionScope.once,
    PermissionScope.session,
  ],
  RuleOffer? rule,
  List<RuleReach> reaches = const <RuleReach>[],
  QuestionInteraction? interaction,
  PlanInteraction? plan,
}) => PermissionRequest(
  requestId: requestId,
  sessionId: sessionId,
  toolUseId: toolUseId,
  call: call ?? shellCall('rm -rf build/'),
  titleKey: titleKey,
  engine: engine,
  description: description,
  riskHint: riskHint,
  defaultToNo: defaultToNo,
  expiresAt: expiresAt ?? t0.add(const Duration(minutes: 2)),
  scopes: scopes,
  rule: rule,
  reaches: reaches,
  interaction: interaction,
  plan: plan,
);

/// The server asking [request], on the frame [frameId].
PermissionAsked asked(PermissionRequest request, {String frameId = 'frame-1'}) =>
    PermissionAsked(request: request, frameId: frameId);

/// The server saying how [requestId] ended.
PermissionSettled settled(
  String requestId, {
  PermissionDecision decision = PermissionDecision.allow,
  bool auto = false,
  AnswerOrigin origin = AnswerOrigin.web,
  AnswerVia? via,
}) => PermissionSettled(
  PermissionOutcome(requestId: requestId, decision: decision, auto: auto, origin: origin, via: via),
);
