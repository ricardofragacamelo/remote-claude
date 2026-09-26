/// The questions of the session on screen, and the three things a person can do about one.
///
/// The controller is the only layer that knows both sides: the widget above, the use cases below.
/// The widget never learns that a socket exists, and the socket never learns that a widget does.
library;

import 'dart:async';

import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';
import 'package:remote_claude/features/permission/domain/usecases/gate_approval.dart';
import 'package:remote_claude/features/permission/domain/usecases/watch_permissions.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'permission_queue_controller.g.dart';

/// How often the countdowns move. A second is what a person perceives as a countdown.
const Duration permissionTick = Duration(seconds: 1);

/// What tapping an answer came to — what the card tells the person afterwards.
enum AnswerResult {
  /// Nothing happened: the card was gone, already answering, or not answerable yet.
  ignored,

  /// A yes is waiting for its second step — destructive (S-41), or persisted (S-65).
  confirming,

  /// The answer left. The card leaves when the server says how the request ended.
  sent,

  /// The socket was down, and nothing left (S-87).
  notSent,

  /// The owner of the phone did not confirm it was them (S-43).
  lockRefused,

  /// The phone has no lock at all, so it may not approve (D-07, S-83).
  noLock,
}

/// The permission queue of one session.
///
/// Keyed by the session, because the session on screen is navigation state and lives in the route.
/// Leaving the screen disposes it, and disposing it is what closes the feed and detaches this
/// subscriber from the session (D-24).
///
/// The **countdown** lives here as a tick, not in the widget: when it reaches zero the card leaves
/// as refused — the server has already refused it — and that has to happen whether or not anything
/// on screen is rebuilding (S-81).
@riverpod
class PermissionQueueController extends _$PermissionQueueController {
  PermissionFeed? _feed;
  Timer? _ticker;

  @override
  PermissionQueue build(String sessionId) {
    final PermissionFeed feed = ref.watch(watchPermissionsProvider)(sessionId);
    final StreamSubscription<PermissionEvent> subscription = feed.events.listen(_apply);
    _feed = feed;

    ref.onDispose(() {
      _ticker?.cancel();
      _ticker = null;
      unawaited(subscription.cancel());
      feed.close();
    });

    return PermissionQueue(asOf: ref.watch(permissionClockProvider)());
  }

  /// Puts on screen what the server's revalidation said is still open.
  void seed(PermissionLookup lookup) {
    if (lookup is LookupPending) {
      _update(state.seed(lookup.request, remainingExtensions: lookup.remainingExtensions));
    }
  }

  /// Taps [decision] on the card of [requestId].
  ///
  /// [lockReason] is what the system prompt says, already translated — the controller has no
  /// catalogue, and the prompt is shown by the operating system rather than by a widget.
  Future<AnswerResult> answer(
    String requestId,
    PermissionDecision decision,
    PermissionScope scope, {
    required String lockReason,
  }) async {
    switch (state.stepFor(requestId, decision, scope)) {
      case AnswerStep.ignored:
        return AnswerResult.ignored;
      case AnswerStep.confirm:
        _update(state.arm(requestId));
        return AnswerResult.confirming;
      case AnswerStep.send:
        break;
    }

    // Marked before the lock is asked, not after: a second tap while the system prompt is up is
    // still a second tap (S-48).
    _update(state.markSending(requestId));

    if (decision == PermissionDecision.allow) {
      final ApprovalGate gate = await ref.read(gateApprovalProvider)(lockReason);

      if (!ref.mounted) {
        return AnswerResult.ignored;
      }

      if (gate != ApprovalGate.open) {
        _update(state.release(requestId));
        return gate == ApprovalGate.noLock ? AnswerResult.noLock : AnswerResult.lockRefused;
      }
    }

    // Read again after the prompt: the request may have been answered elsewhere while the owner
    // was touching the sensor, and a reconnect may have re-delivered it under another frame.
    final String? frameId = state.cardOf(requestId)?.frameId;
    if (frameId == null) {
      return AnswerResult.ignored;
    }

    final bool left =
        _feed?.answer(
          frameId: frameId,
          requestId: requestId,
          decision: decision,
          scope: scope,
          reason: decision == PermissionDecision.deny ? refusedFromThePhone : null,
        ) ??
        false;

    if (!left) {
      _update(state.release(requestId));
      return AnswerResult.notSent;
    }

    return AnswerResult.sent;
  }

  /// Backs out of the second step of a yes.
  void disarm(String requestId) => _update(state.disarm(requestId));

  /// Asks for more time. The number is the backend's, never this phone's.
  ///
  /// @returns whether the command left
  bool extend(String requestId) {
    final PermissionCard? card = state.cardOf(requestId);

    if (card == null || !card.isExtendable) {
      return false;
    }

    return _feed?.extend(requestId) ?? false;
  }

  void _apply(PermissionEvent event) => _update(state.apply(event));

  /// Applies [next], moves the countdowns to now, and keeps the tick running only while there is
  /// something to count down.
  void _update(PermissionQueue next) {
    state = next.tick(ref.read(permissionClockProvider)());

    if (state.pending.isEmpty) {
      _ticker?.cancel();
      _ticker = null;
    } else {
      _ticker ??= Timer.periodic(permissionTick, (_) => _update(state));
    }
  }
}
