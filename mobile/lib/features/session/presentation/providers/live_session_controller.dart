/// The conversation of the session on screen.
///
/// The controller is the only layer that knows both sides: the widget above, the use cases below.
/// The widget never learns that a socket exists, and the socket never learns that a widget does.
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/domain/usecases/watch_session.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'live_session_controller.g.dart';

/// What the session screen renders: the conversation, and where reading its history stands.
class LiveSession extends Equatable {
  const LiveSession({
    this.conversation = const Conversation(),
    this.isLoadingHistory = false,
    this.historyFailure,
    this.promptFailure,
  });

  /// The history with the live stream laid over it.
  final Conversation conversation;

  /// Whether the history is being read — after a gap, or for a session that continues another.
  final bool isLoadingHistory;

  /// Why the last reading of the history failed, when it did. The screen says so and offers to
  /// read it again (S-17).
  final Failure? historyFailure;

  /// Why the server refused the last prompt this screen sent — a slash command the installation
  /// does not have is the one that exists (S-34). Said beside the composer, and gone with the next
  /// prompt.
  final Failure? promptFailure;

  @override
  List<Object?> get props => <Object?>[
    conversation,
    isLoadingHistory,
    historyFailure,
    promptFailure,
  ];
}

/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.
///
/// Two sources make up what it shows, and they are kept apart until the last moment: the live
/// stream, which has a `seq`, and the history read over HTTP, which has none. Folding them into
/// one another would let the history move the resume point, or the replay duplicate the history;
/// laying one over the other at render time is what keeps both from happening (S-15, S-21).
@riverpod
class LiveSessionController extends _$LiveSessionController {
  /// The resume point, kept beside the state rather than read out of it.
  ///
  /// The callback handed to `follow` outlives this provider: the socket keeps it and calls it
  /// again on every reconnection. Reading `state` from there throws the moment the screen is
  /// gone — "Ref used after it was disposed" — and it throws inside the socket's reconnect, which
  /// is the worst place for it. A plain field answers the same number and belongs to nobody.
  int _resumeFrom = 0;

  Conversation _live = const Conversation();
  List<SessionEvent> _history = const <SessionEvent>[];

  /// The conversation the history is read from, once something said which one.
  String? _historyOf;
  bool _loadingHistory = false;
  Failure? _historyFailure;

  /// The id the last prompt left with, which is what a refusal of it names.
  String? _promptId;
  Failure? _promptFailure;

  /// Bumped by every reading and every gap, so an answer that arrives after a newer question — or
  /// after the gap that made it pointless — is dropped rather than shown.
  int _readings = 0;

  @override
  LiveSession build(String sessionId) {
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

    return const LiveSession();
  }

  /// Sends one turn — a slash command included: `/init` is sent as its text.
  ///
  /// Whatever the last prompt was refused for is forgotten here: it was about that prompt, and
  /// this is another one.
  ///
  /// @returns whether the command left. A socket that is not ready sends nothing, and the screen
  ///   keeps the text rather than clearing a composer whose prompt went nowhere (S-76).
  bool prompt(String text) {
    _promptId = ref.read(driveSessionProvider).prompt(sessionId, text);
    _promptFailure = null;
    _publish();

    return _promptId != null;
  }

  /// Stops the turn that is running.
  bool interrupt() => ref.read(driveSessionProvider).interrupt(sessionId);

  /// Ends the session.
  bool close() => ref.read(driveSessionProvider).close(sessionId);

  /// Reads the history again, after it failed. Nothing to do when nothing said where it is.
  Future<void> retryHistory() async {
    final String? conversationId = _historyOf;

    if (conversationId != null) {
      await _readHistory(conversationId);
    }
  }

  void _apply(SessionUpdate update) {
    switch (update) {
      case EventReceived(:final SessionEvent event):
        final int before = _live.lastSeq;
        _live = _live.apply(event);
        _resumeFrom = _live.lastSeq;
        _publish();

        // A session that continues another starts its own `seq` from one, and the buffer only
        // holds what **it** said: everything before comes from the transcript (B-11). Only an
        // event that was applied counts — a replay re-delivering it asks for nothing twice.
        if (event case SessionOpened(
          :final String resumedFrom?,
        ) when _live.lastSeq > before && _historyOf == null) {
          unawaited(_readHistory(resumedFrom));
        }

      // The second rule of the stream: a gap clears everything, and the history is read again
      // from the conversation the ack named (S-14). Stitching a partial hole produces a view that
      // looks complete and is not, which is worse than one that admits it reloaded.
      case StreamGap(:final String? claudeSessionId):
        _live = const Conversation();
        _history = const <SessionEvent>[];
        _resumeFrom = 0;
        _historyOf = null;
        _loadingHistory = false;
        _historyFailure = null;
        _readings += 1;
        _publish();

        if (claudeSessionId != null) {
          unawaited(_readHistory(claudeSessionId));
        }

      // A refusal names the command it refuses, and the prompt is the one command of this screen
      // that can be refused by what it says (S-34).
      case CommandRefused(:final String commandId, :final Failure failure)
          when commandId == _promptId:
        _promptFailure = failure;
        _publish();

      // Answers to commands of other screens: joining a live session is the resume's business, a
      // refusal of another command is its sender's, and a failure the session reports about an
      // undo belongs to the undo sheet.
      case SessionJoined():
      case CommandRefused():
      case SessionFailed():
        return;
    }
  }

  Future<void> _readHistory(String conversationId) async {
    final int reading = ++_readings;
    _historyOf = conversationId;
    _loadingHistory = true;
    _historyFailure = null;
    _publish();

    try {
      final HistoryPage page = await ref.read(readHistoryProvider)(conversationId);

      if (_isCurrent(reading)) {
        _history = page.events;
      }
    } on Object catch (error) {
      if (_isCurrent(reading)) {
        _historyFailure = asFailure(error);
      }
    }

    if (_isCurrent(reading)) {
      _loadingHistory = false;
      _publish();
    }
  }

  bool _isCurrent(int reading) => ref.mounted && reading == _readings;

  void _publish() => state = LiveSession(
    conversation: _live.withHistory(_history),
    isLoadingHistory: _loadingHistory,
    historyFailure: _historyFailure,
    promptFailure: _promptFailure,
  );
}
