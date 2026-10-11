/// One question the agent loop on the user's machine is stopped on.
///
/// Pure Dart, and every rule about time takes the time as an argument: a rule that read the clock
/// by itself would be a rule nobody could test (docs/architecture/mobile/01-architecture.md).
library;

import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/features/permission/domain/entities/plan_interaction.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';

/// How dangerous the backend judged an invocation. Derived there, never here.
///
/// The classification **fails closed** on the backend — a command it does not recognise is
/// `destructive` — and the two-step confirmation below leans on that. If it ever stopped failing
/// closed, "only destructive tools confirm twice" would quietly become "almost nothing does"
/// ([D-08](../../../../../docs/plans/02-mobile-approval/decisions.md#d-08--dois-passos-para-quê)).
enum RiskHint { read, write, destructive }

/// How far a decision reaches.
///
/// `once` and `session` die with the session. `project` and `always` leave a rule that outlives it
/// — which is why they are offered only with the [RuleOffer] they would grant, and only behind a
/// second step ([D-14](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
enum PermissionScope {
  once,
  session,
  project,
  always;

  /// Whether a yes with this scope leaves a rule behind, revocable from the rules screen.
  bool get isPersisted => this == project || this == always;
}

/// What a `project` or `always` yes would leave behind, as the server described it.
///
/// Never derived here. The pattern is the one the backend's matcher will grant, and the lifetime is
/// the installation's: an app that computed either would show one reach and grant another
/// ([D-12](../../../../../docs/plans/03-rules-and-audit/decisions.md)).
class RuleOffer extends Equatable {
  const RuleOffer({required this.pattern, required this.lifetime});

  /// The `exact` pattern, in the canonical grammar — `shell(git status)` —, opaque here. `null`
  /// when the invocation has no exact reach — the patterns of the others travel in the reaches.
  final String? pattern;

  /// How long the rule lives, counted from the answer.
  final Duration lifetime;

  @override
  List<Object?> get props => <Object?>[pattern, lifetime];
}

/// How far a rule left by an answer reaches (plan 23, B-16).
enum RuleReachKind { exact, prefix, tool }

/// One reach the server offered, with the rules it would leave — one per pattern.
///
/// Computed by the server and named by the answer: the app never sends a pattern of its own.
class RuleReach extends Equatable {
  const RuleReach({required this.kind, required this.patterns});

  final RuleReachKind kind;
  final List<String> patterns;

  @override
  List<Object?> get props => <Object?>[kind, patterns];
}

/// The reach a card starts on (plan 23, D-09): commands that start the same way when there is such
/// a reach, this very input otherwise, and the whole tool when it is the only one there is.
RuleReach? preselectedReach(List<RuleReach> reaches) {
  RuleReach? of(RuleReachKind kind) =>
      reaches.where((RuleReach each) => each.kind == kind).firstOrNull;

  return of(RuleReachKind.prefix) ?? of(RuleReachKind.exact) ?? of(RuleReachKind.tool);
}

/// Yes or no. There is no third value: silence is the deadline's, and it denies.
enum PermissionDecision { allow, deny }

/// The question.
class PermissionRequest extends Equatable {
  const PermissionRequest({
    required this.requestId,
    required this.sessionId,
    required this.call,
    required this.riskHint,
    required this.expiresAt,
    this.titleKey = '',
    this.engine,
    this.toolUseId = '',
    this.description,
    this.defaultToNo = true,
    this.scopes = const <PermissionScope>[PermissionScope.once],
    this.rule,
    this.reaches = const <RuleReach>[],
    this.interaction,
    this.plan,
  });

  /// Idempotency is by **this**, never by [toolUseId].
  final String requestId;

  final String sessionId;
  final String toolUseId;

  /// The call it asks about: its kind and label, what it is about, and the exact input it would run
  /// with — what is shown is what executes.
  final ToolCall call;

  /// What is asked, as an i18n key by kind — `permission.tool.fileEdit`. A key this build does not
  /// have is shown as the call's label.
  final String titleKey;

  /// The engine that asks — an `id` of `GET /engines`, for the sentences that name it; never
  /// decided by. `null` when the request did not say.
  final String? engine;

  /// The detail a person decides on — the command line, the path being written — when the backend
  /// could name one.
  final String? description;

  final RiskHint riskHint;

  /// The screen leans towards refusal. Absent reads as `true`, because the safe default is the
  /// rule.
  final bool defaultToNo;

  /// When the deadline refuses it.
  final DateTime expiresAt;

  /// What a yes may reach. `once` is always first, and always there.
  final List<PermissionScope> scopes;

  /// The lifetime of the rules `project` and `always` would grant, and their exact pattern when
  /// there is one. Present exactly when one of them is offered.
  final RuleOffer? rule;

  /// How far a rule left by the answer may reach, as the server computed it. More than one is a
  /// choice on the card; the answer names one.
  final List<RuleReach> reaches;

  /// The questions, when the request is the agent asking the person something rather than asking
  /// leave to run a tool — `null` for every other request (plan 24).
  final QuestionInteraction? interaction;

  /// The plan, when the request is the agent presenting one to approve before it changes anything —
  /// its `interaction` of kind `plan` — and `null` for every other request (plan 28, B-20).
  final PlanInteraction? plan;

  /// Whether the deadline has already refused it at [now].
  bool isExpiredAt(DateTime now) => !now.isBefore(expiresAt);

  /// How long is left at [now], never negative.
  Duration remainingAt(DateTime now) =>
      isExpiredAt(now) ? Duration.zero : expiresAt.difference(now);

  /// Whether a yes takes two deliberate steps.
  ///
  /// For `destructive` ([D-08]): a phone in a pocket taps things, and authorising `rm -rf` with one
  /// accidental touch is the accident this exists to prevent. And for every [PermissionScope] that
  /// persists, whatever the risk: "don't ask me again for ninety days" in one touch is the same
  /// accident, spread over three months (D-14).
  bool needsConfirmation(PermissionScope scope) =>
      riskHint == RiskHint.destructive || scope.isPersisted;

  /// What the person is asked to authorise, exactly.
  ///
  /// The description when the backend could name the one thing that matters; otherwise the whole
  /// input, indented. Never a summary and never truncated — somebody is authorising this to run
  /// on their own machine.
  String get command => description ?? const JsonEncoder.withIndent('  ').convert(call.rawInput);

  /// This question with another deadline — what an extension does.
  PermissionRequest withDeadline(DateTime deadline) => PermissionRequest(
    requestId: requestId,
    sessionId: sessionId,
    toolUseId: toolUseId,
    call: call,
    titleKey: titleKey,
    engine: engine,
    description: description,
    riskHint: riskHint,
    defaultToNo: defaultToNo,
    expiresAt: deadline,
    scopes: scopes,
    rule: rule,
    reaches: reaches,
    interaction: interaction,
    plan: plan,
  );

  @override
  List<Object?> get props => <Object?>[
    requestId,
    sessionId,
    toolUseId,
    call,
    titleKey,
    engine,
    description,
    riskHint,
    defaultToNo,
    expiresAt,
    scopes,
    rule,
    reaches,
    interaction,
    plan,
  ];
}
