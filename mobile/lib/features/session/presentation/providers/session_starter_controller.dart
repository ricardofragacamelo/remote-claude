/// Opening a session, and learning which one was opened.
///
/// `session.start` carries no session id — it is what **creates** one — so the id arrives later,
/// on the `session.started` event, before anything could have attached to it. This is what
/// watches for it, so the screen that asked can move to the session that answered (S-75).
library;

import 'dart:async';

import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'session_starter_controller.g.dart';

/// The session this app opened most recently, or `null` before it opened one.
@Riverpod(keepAlive: true)
class SessionStarterController extends _$SessionStarterController {
  @override
  String? build() {
    final StreamSubscription<SessionUpdate> subscription = ref
        .watch(watchSessionProvider)()
        .listen(_apply);

    ref.onDispose(() => unawaited(subscription.cancel()));

    return null;
  }

  /// Opens a session on [workspacePath].
  ///
  /// @returns whether the command left; the screen says so rather than waiting for a session that
  ///   was never asked for
  bool start(String workspacePath) {
    // Whatever was opened before is forgotten first. Without this, a start that never answers
    // would navigate to the session before it, which is the wrong screen shown confidently.
    state = null;
    return ref.read(driveSessionProvider).start(workspacePath);
  }

  /// Forgets the last session opened, once the screen has acted on it.
  void acknowledge() => state = null;

  void _apply(SessionUpdate update) {
    if (update case EventReceived(event: final SessionOpened opened)) {
      state = opened.sessionId;
    }
  }
}
