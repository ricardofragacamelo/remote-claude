/// A permission card, wired to everything that decides whether it can be answered.
///
/// Three things outside the card decide that, and each has its own sentence: whether **this phone**
/// may decide at all (S-84), whether there is a **connection** for an answer to leave on (S-86), and
/// whether the phone has a **lock** to prove its owner with (D-07, S-83). The card renders; this
/// decides, and talks to the controller.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/entities/question.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_lookup_controller.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_queue_controller.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_card_view.dart';
import 'package:remote_claude/features/permission/presentation/widgets/plan_approval_card.dart';
import 'package:remote_claude/features/permission/presentation/widgets/question_card.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// One open request of [sessionId], answerable from here.
class PermissionPanel extends ConsumerStatefulWidget {
  const PermissionPanel({
    required this.sessionId,
    required this.card,
    required this.now,
    super.key,
    this.onPlanApproved,
  });

  final String sessionId;
  final PermissionCard card;
  final DateTime now;

  /// A plan was approved and its answer left: the session goes on in [mode] — the screen changes the
  /// chip of the mode in the same gesture (plan 10, B-21).
  final void Function(String mode)? onPlanApproved;

  @override
  ConsumerState<PermissionPanel> createState() => _PermissionPanelState();
}

class _PermissionPanelState extends ConsumerState<PermissionPanel> {
  /// What the last tap came to, when it was not what it looked like.
  AnswerResult? _last;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final bool mayDecide = ref.watch(
      deviceControllerProvider.select(
        (AsyncValue<RegisteredDevice?> device) => device.value?.canDecide ?? false,
      ),
    );
    final bool online = connectionOf(ref.watch(connectionStatusProvider)) == ConnectionStatus.ready;
    // Unknown reads as "has one": the gate asks again before anything leaves, and hiding the yes on
    // every phone for the second it takes to find out would be a flicker, not a rule.
    final bool hasLock = ref.watch(
      approvalLockControllerProvider.select(
        (AsyncValue<ApprovalLockState> lock) => lock.value?.hasLock ?? true,
      ),
    );

    final AnswerBlock? block = _blockOf(mayDecide: mayDecide, online: online);

    final String? notice = switch (_last) {
      AnswerResult.lockRefused => l10n.permissionLockRefused,
      AnswerResult.notSent => l10n.permissionNotSent,
      AnswerResult.noLock when widget.card.request.toolName == planTool =>
        l10n.permissionNoLockTitle,
      _ => null,
    };

    final QuestionInteraction? interaction = widget.card.request.interaction;

    if (interaction != null) {
      return _question(interaction, block, notice);
    }

    if (widget.card.request.toolName == planTool) {
      return PlanApprovalCard(
        card: widget.card,
        now: widget.now,
        block: block,
        notice: notice,
        onApprove: (String mode) => unawaited(_approvePlan(l10n, mode)),
        onKeepPlanning: (String comment) => unawaited(
          _answer(l10n, PermissionDecision.deny, PermissionScope.once, reason: comment),
        ),
        onExtend: _extend,
      );
    }

    return PermissionCardView(
      card: widget.card,
      now: widget.now,
      block: block,
      canApprove: hasLock && _last != AnswerResult.noLock,
      notice: notice,
      onAnswer: (PermissionDecision decision, PermissionScope scope, {RuleReachKind? reach}) =>
          unawaited(_answer(l10n, decision, scope, reach: reach)),
      onDisarm: () => _controller().disarm(widget.card.requestId),
      // Pushed, not gone to: "back" from the rules lands on the question that is still open.
      onOpenRules: () => unawaited(context.push(rulesRoute)),
      onExtend: _extend,
    );
  }

  /// Why no answer can leave this phone now, or `null` when one can.
  AnswerBlock? _blockOf({required bool mayDecide, required bool online}) => !mayDecide
      ? AnswerBlock.device
      : !online
      ? AnswerBlock.offline
      : widget.card.frameId == null
      ? AnswerBlock.connecting
      : null;

  /// A question of Claude: its card, its draft — kept by the queue — and its two answers. Neither asks
  /// the lock: answering authorises nothing (D-11).
  Widget _question(QuestionInteraction interaction, AnswerBlock? block, String? notice) {
    final String requestId = widget.card.requestId;
    final QuestionDraft draft = ref.watch(
      permissionQueueControllerProvider(
        widget.sessionId,
      ).select((PermissionQueue queue) => queue.draftOf(requestId)),
    );

    return QuestionCard(
      card: widget.card,
      interaction: interaction,
      draft: draft,
      now: widget.now,
      block: block,
      notice: notice,
      onDraft: (QuestionDraft next) => _controller().saveDraft(requestId, next),
      onSubmit: (List<QuestionAnswer> answers) =>
          _settled(_controller().answerQuestion(requestId, answers)),
      onDecline: (String reason) => _settled(_controller().declineQuestion(requestId, reason)),
      onExtend: _extend,
    );
  }

  /// Remembers what a tap on a question came to, to say it when it did not leave.
  void _settled(AnswerResult result) => setState(() => _last = result);

  void _extend() {
    if (!_controller().extend(widget.card.requestId)) {
      setState(() => _last = AnswerResult.notSent);
    }
  }

  /// Approves the plan, and — once the yes left — goes on in [mode].
  Future<void> _approvePlan(AppLocalizations l10n, String mode) async {
    final AnswerResult result = await _answer(l10n, PermissionDecision.allow, PermissionScope.once);

    if (result == AnswerResult.sent) {
      widget.onPlanApproved?.call(mode);
    }
  }

  Future<AnswerResult> _answer(
    AppLocalizations l10n,
    PermissionDecision decision,
    PermissionScope scope, {
    String? reason,
    RuleReachKind? reach,
  }) async {
    final AnswerResult result = await _controller().answer(
      widget.card.requestId,
      decision,
      scope,
      lockReason: l10n.permissionLockReason,
      reason: reason,
      reach: reach,
    );

    if (mounted) {
      setState(() => _last = result);
    }

    return result;
  }

  PermissionQueueController _controller() =>
      ref.read(permissionQueueControllerProvider(widget.sessionId).notifier);
}
