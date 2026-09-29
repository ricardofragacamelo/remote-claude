/// Opening a session, and learning which one was opened — or why none was.
///
/// `session.start` carries no session id — it is what **creates** one — so the id arrives later,
/// on the `session.started` event, before anything could have attached to it. This is what
/// watches for it, so the screen that asked can move to the session that answered (S-75).
///
/// It watches for the refusal too (plan 05, S-41). A start the server refused never produces a
/// `session.started`, and a screen that only waited for one showed nothing at all: the tap on the
/// folder did nothing, which is exactly what "the app froze" looks like. The refusal names the
/// command it refuses, and that is how this one is told from anybody else's on the same socket.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/presentation/providers/session_updates.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'session_starter_controller.g.dart';

/// Where the last start from this app stands.
class SessionStart extends Equatable {
  const SessionStart({this.sessionId, this.failure});

  /// The session it opened, once the server named it. The screen moves to it.
  final String? sessionId;

  /// Why the server refused it — the machine already running as many sessions as it allows,
  /// typically. Said on the screen until the next attempt; nothing retries on its own.
  final Failure? failure;

  @override
  List<Object?> get props => <Object?>[sessionId, failure];
}

/// The last start from this app: the session it opened, or the reason it was refused.
@Riverpod(keepAlive: true)
class SessionStarterController extends _$SessionStarterController {
  /// The id the last start left with, which is what a refusal of it names.
  String? _commandId;

  @override
  SessionStart build() {
    listenToUpdates(ref, _apply);
    return const SessionStart();
  }

  /// Opens a session on [workspacePath].
  ///
  /// @returns whether the command left; the screen says so rather than waiting for a session that
  ///   was never asked for
  bool start(String workspacePath) {
    // Whatever was opened or refused before is forgotten first. Without this, a start that never
    // answers would navigate to the session before it, which is the wrong screen shown
    // confidently — and an old refusal would sit beside a start that has not been answered yet.
    state = const SessionStart();
    _commandId = ref.read(driveSessionProvider).start(workspacePath);
    return _commandId != null;
  }

  /// Forgets the last session opened, once the screen has acted on it.
  void acknowledge() => state = const SessionStart();

  void _apply(SessionUpdate update) {
    switch (update) {
      // A session that continues a conversation was asked for by the history screen, and that
      // screen is the one that moves to it. Taking it here too would navigate twice — once from a
      // screen that is not even the one on top.
      case EventReceived(event: final SessionOpened opened) when opened.resumedFrom == null:
        _commandId = null;
        state = SessionStart(sessionId: opened.sessionId);
      case CommandRefused(:final String commandId, :final Failure failure)
          when commandId == _commandId:
        _commandId = null;
        state = SessionStart(failure: failure);
      default:
        break;
    }
  }
}
