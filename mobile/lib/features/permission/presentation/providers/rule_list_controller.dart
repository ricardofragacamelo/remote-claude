/// The rules of the signed-in user, and taking one back.
///
/// The controller is the only layer that knows both sides: the page above, the use cases below.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'rule_list_controller.g.dart';

/// The list, what is being revoked, and the last revocation that did not happen.
class RuleBoard extends Equatable {
  const RuleBoard({
    this.rules = const <PermissionRule>[],
    this.revoking = const <String>{},
    this.failedRuleId,
    this.failure,
  });

  /// The rules on screen, newest first.
  final List<PermissionRule> rules;

  /// The rules a revocation is in flight for. Their rows take no second tap (S-69).
  final Set<String> revoking;

  /// The rule whose revocation failed last, and why. Its row stays, with the reason (S-21).
  final String? failedRuleId;
  final Failure? failure;

  RuleBoard _copy({
    List<PermissionRule>? rules,
    Set<String>? revoking,
    String? failedRuleId,
    Failure? failure,
    bool clearFailure = false,
  }) => RuleBoard(
    rules: rules ?? this.rules,
    revoking: revoking ?? this.revoking,
    failedRuleId: clearFailure ? null : failedRuleId ?? this.failedRuleId,
    failure: clearFailure ? null : failure ?? this.failure,
  );

  @override
  List<Object?> get props => <Object?>[rules, revoking, failedRuleId, failure];
}

/// The rules screen's state.
///
/// Three decisions here are about the person reading the list while they tap:
///
/// - **a revoked rule leaves the list** from the answer to the revocation, not from a reload: a
///   list that reorders under somebody's thumb is how the wrong rule gets revoked;
/// - **a failed revocation keeps the row**, with the reason next to it (S-21). Replacing the list
///   with an error would hide every rule that is still answering — the one thing this screen is for;
/// - **a second tap on a row being revoked revokes nothing** (S-69). The same reason the permission
///   card takes no second tap: two taps are two requests.
@riverpod
class RuleListController extends _$RuleListController {
  @override
  Future<RuleBoard> build() async => RuleBoard(rules: await ref.watch(listRulesProvider)());

  /// Reads the list again — which is how a rule granted on another device appears (S-20).
  Future<void> reload() async {
    state = const AsyncValue<RuleBoard>.loading();
    state = await AsyncValue.guard<RuleBoard>(
      () async => RuleBoard(rules: await ref.read(listRulesProvider)()),
    );
  }

  /// Revokes [ruleId], once, however many times it is tapped while in flight.
  Future<void> revoke(String ruleId) async {
    final RuleBoard? board = state.value;

    if (board == null || board.revoking.contains(ruleId)) {
      return;
    }

    state = AsyncValue<RuleBoard>.data(
      board._copy(revoking: <String>{...board.revoking, ruleId}, clearFailure: true),
    );

    try {
      await ref.read(revokeRuleProvider)(ruleId);
      _settle(ruleId, (RuleBoard now) => now._copy(rules: _without(now.rules, ruleId)));
    } on Failure catch (failure) {
      _settle(ruleId, (RuleBoard now) => now._copy(failedRuleId: ruleId, failure: failure));
    }
  }

  /// Applies the outcome of a revocation to whatever is on screen **now** — which, if the list was
  /// read again meanwhile, is not the list the revocation started from.
  void _settle(String ruleId, RuleBoard Function(RuleBoard now) outcome) {
    if (!ref.mounted) {
      return;
    }

    final RuleBoard? now = state.value;

    if (now == null || state.isLoading) {
      return;
    }

    final RuleBoard settled = outcome(now);
    state = AsyncValue<RuleBoard>.data(
      settled._copy(revoking: <String>{...settled.revoking}..remove(ruleId)),
    );
  }

  static List<PermissionRule> _without(List<PermissionRule> rules, String ruleId) =>
      rules.where((PermissionRule rule) => rule.id != ruleId).toList(growable: false);
}
