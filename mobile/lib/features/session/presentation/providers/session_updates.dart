/// Listening to the session stream for exactly as long as a provider lives.
library;

import 'dart:async';

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

/// Hands every update of the session stream to [onUpdate] until [ref] is disposed.
///
/// Written once because the cancel is the half that gets forgotten: a subscription that outlives
/// its provider keeps applying updates to a notifier nobody reads, and throws the moment it
/// touches a disposed `ref`.
void listenToUpdates(Ref ref, void Function(SessionUpdate update) onUpdate) {
  final StreamSubscription<SessionUpdate> subscription = ref
      .watch(watchSessionProvider)()
      .listen(onUpdate);

  ref.onDispose(() => unawaited(subscription.cancel()));
}

/// A controller that follows one `session.start` of its own to its answer: the session it opened,
/// or why it was refused.
///
/// By the `correlationId`, never by arrival: another command on the same socket opens a session
/// too, and following it would put a prompt in somebody else's conversation (S-22).
mixin FollowsStart {
  /// The id the start left with — what its `session.started` and its refusal name. `null` with
  /// nothing in flight.
  String? startId;

  /// The start opened [sessionId].
  void onStartOpened(String sessionId);

  /// The start was refused, for [failure].
  void onStartRefused(Failure failure);

  /// Hands [update] to the start in flight, when it answers it.
  void followStart(SessionUpdate update) {
    final String? mine = startId;

    switch (update) {
      case EventReceived(event: SessionOpened(:final String sessionId, :final String? commandId))
          when mine != null && commandId == mine:
        startId = null;
        onStartOpened(sessionId);
      case CommandRefused(:final String commandId, :final Failure failure)
          when mine != null && commandId == mine:
        startId = null;
        onStartRefused(failure);
      default:
        break;
    }
  }
}
