/// The conversation of the session on screen.
///
/// The controller is the only layer that knows both sides: the widget above, the use cases below.
/// The widget never learns that a socket exists, and the socket never learns that a widget does.
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'live_session_controller.g.dart';

/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.
@riverpod
class LiveSessionController extends _$LiveSessionController {
  /// The resume point, kept beside the state rather than read out of it.
  ///
  /// The callback handed to `follow` outlives this provider: the socket keeps it and calls it
  /// again on every reconnection. Reading `state` from there throws the moment the screen is
  /// gone — "Ref used after it was disposed" — and it throws inside the socket's reconnect, which
  /// is the worst place for it. A plain field answers the same number and belongs to nobody.
  int _resumeFrom = 0;

  @override
  Conversation build(String sessionId) {
    final WatchSession watch = ref.watch(watchSessionProvider);
    final StreamSubscription<SessionUpdate> subscription = watch().listen(_apply);

    // The resume point is read at attach time, and again after every reconnection, so the replay
    // starts where this screen actually got to.
    watch.follow(sessionId, () => _resumeFrom);

    // **Not optional** (S-36): without it, moving between sessions piles up subscriptions and the
    // screen starts processing events for a session that is no longer on screen.
    ref.onDispose(() {
      unawaited(subscription.cancel());
      watch.unfollow();
    });

    return const Conversation();
  }

  /// Sends one turn.
  ///
  /// @returns whether the command left. A socket that is not ready sends nothing, and the screen
  ///   keeps the text rather than clearing a composer whose prompt went nowhere (S-76).
  bool prompt(String text) => ref.read(driveSessionProvider).prompt(sessionId, text);

  /// Stops the turn that is running.
  bool interrupt() => ref.read(driveSessionProvider).interrupt(sessionId);

  /// Ends the session.
  bool close() => ref.read(driveSessionProvider).close(sessionId);

  void _apply(SessionUpdate update) {
    switch (update) {
      case EventReceived(:final SessionEvent event):
        state = state.apply(event);
        _resumeFrom = state.lastSeq;

      // The second rule of the stream: a gap clears everything. Stitching a partial hole produces
      // a view that looks complete and is not, which is worse than one that admits it reloaded.
      case StreamGap():
        state = const Conversation();
        _resumeFrom = 0;
    }
  }
}
