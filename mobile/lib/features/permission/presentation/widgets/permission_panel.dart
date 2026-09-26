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
import 'package:remote_claude/features/permission/presentation/providers/permission_lookup_controller.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_queue_controller.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_card_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// One open request of [sessionId], answerable from here.
class PermissionPanel extends ConsumerStatefulWidget {
  const PermissionPanel({
    required this.sessionId,
    required this.card,
    required this.now,
    super.key,
  });

  final String sessionId;
  final PermissionCard card;
  final DateTime now;

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

    final AnswerBlock? block = !mayDecide
        ? AnswerBlock.device
        : !online
        ? AnswerBlock.offline
        : widget.card.frameId == null
        ? AnswerBlock.connecting
        : null;

    return PermissionCardView(
      card: widget.card,
      now: widget.now,
      block: block,
      canApprove: hasLock && _last != AnswerResult.noLock,
      notice: switch (_last) {
        AnswerResult.lockRefused => l10n.permissionLockRefused,
        AnswerResult.notSent => l10n.permissionNotSent,
        _ => null,
      },
      onAnswer: (PermissionDecision decision, PermissionScope scope) =>
          _answer(l10n, decision, scope),
      onDisarm: () => _controller().disarm(widget.card.requestId),
      // Pushed, not gone to: "back" from the rules lands on the question that is still open.
      onOpenRules: () => unawaited(context.push(rulesRoute)),
      onExtend: () {
        if (!_controller().extend(widget.card.requestId)) {
          setState(() => _last = AnswerResult.notSent);
        }
      },
    );
  }

  Future<void> _answer(
    AppLocalizations l10n,
    PermissionDecision decision,
    PermissionScope scope,
  ) async {
    final AnswerResult result = await _controller().answer(
      widget.card.requestId,
      decision,
      scope,
      lockReason: l10n.permissionLockReason,
    );

    if (mounted) {
      setState(() => _last = result);
    }
  }

  PermissionQueueController _controller() =>
      ref.read(permissionQueueControllerProvider(widget.sessionId).notifier);
}
