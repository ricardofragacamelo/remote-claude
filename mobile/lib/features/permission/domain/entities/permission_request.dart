/// One question the agent loop on the user's machine is stopped on.
///
/// Pure Dart, and every rule about time takes the time as an argument: a rule that read the clock
/// by itself would be a rule nobody could test (docs/architecture/mobile/01-architecture.md).
library;

import 'dart:convert';

import 'package:equatable/equatable.dart';

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

  /// In the grammar of the Claude Code settings: `Bash(git status)`.
  final String pattern;

  /// How long the rule lives, counted from the answer.
  final Duration lifetime;

  @override
  List<Object?> get props => <Object?>[pattern, lifetime];
}

/// Yes or no. There is no third value: silence is the deadline's, and it denies.
enum PermissionDecision { allow, deny }

/// The question.
class PermissionRequest extends Equatable {
  const PermissionRequest({
    required this.requestId,
    required this.sessionId,
    required this.toolName,
    required this.input,
    required this.riskHint,
    required this.expiresAt,
    this.toolUseId = '',
    this.description,
    this.defaultToNo = true,
    this.scopes = const <PermissionScope>[PermissionScope.once],
    this.rule,
  });

  /// Idempotency is by **this**, never by [toolUseId].
  final String requestId;

  final String sessionId;
  final String toolUseId;
  final String toolName;

  /// The detail a person decides on — the command line, the path being written — when the backend
  /// could name one.
  final String? description;

  /// The exact input the tool would run with. What is shown is what executes.
  final Map<String, Object?> input;

  final RiskHint riskHint;

  /// The screen leans towards refusal. Absent reads as `true`, because the safe default is the rule.
  final bool defaultToNo;

  /// When the deadline refuses it.
  final DateTime expiresAt;

  /// What a yes may reach. `once` is always first, and always there.
  final List<PermissionScope> scopes;

  /// The rule `project` and `always` would grant. Present exactly when one of them is offered.
  final RuleOffer? rule;

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
  String get command => description ?? const JsonEncoder.withIndent('  ').convert(input);

  /// This question with another deadline — what an extension does.
  PermissionRequest withDeadline(DateTime deadline) => PermissionRequest(
    requestId: requestId,
    sessionId: sessionId,
    toolUseId: toolUseId,
    toolName: toolName,
    description: description,
    input: input,
    riskHint: riskHint,
    defaultToNo: defaultToNo,
    expiresAt: deadline,
    scopes: scopes,
    rule: rule,
  );

  @override
  List<Object?> get props => <Object?>[
    requestId,
    sessionId,
    toolUseId,
    toolName,
    description,
    input,
    riskHint,
    defaultToNo,
    expiresAt,
    scopes,
    rule,
  ];
}
