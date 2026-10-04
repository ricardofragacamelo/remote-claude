/// The conversation of the session on screen, and what the screen asks of it.
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
import 'package:remote_claude/features/session/presentation/providers/first_prompts.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/features/session/presentation/providers/open_sessions.dart';
import 'package:flutter_riverpod/misc.dart' show KeepAliveLink;
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'live_session_controller.g.dart';

/// What the session screen renders: the conversation, where reading its history stands, and where
/// the changes the screen asked for stand.
class LiveSession extends Equatable {
  const LiveSession({
    this.conversation = const Conversation(),
    this.isLoadingHistory = false,
    this.historyFailure,
    this.promptFailure,
    this.model,
    this.permissionMode,
    this.isChoosing = false,
    this.choiceFailure,
    this.queueFailure,
    this.isInterrupting = false,
    this.isCompacting = false,
    this.forkRejection,
  });

  /// The history with the live stream laid over it.
  final Conversation conversation;

  /// Whether the history is being read — after a gap, or for a session that continues another.
  final bool isLoadingHistory;

  /// Why the last reading of the history failed, when it did. The screen says so and offers to
  /// read it again (S-17).
  final Failure? historyFailure;

  /// Why the server refused the last prompt this screen sent — a slash command the installation
  /// does not have, a session busy undoing (S-34, S-42). Said above the composer, and gone with the
  /// next prompt or when the person closes it.
  final Failure? promptFailure;

  /// The model and the mode the session runs, as far as this screen knows: where it started, with
  /// the change this screen made laid over it — the server acknowledges a change, it never echoes
  /// one.
  final String? model;
  final String? permissionMode;

  /// A change of model or mode left and nothing answered it yet. A second tap sends nothing (S-35).
  final bool isChoosing;

  /// Why the last change was refused — the chip went back to what it was (S-32).
  final Failure? choiceFailure;

  /// Why taking a prompt out of the queue was refused — it had already started (S-40).
  final Failure? queueFailure;

  /// An interrupt left and the turn has not stopped yet. A second tap sends nothing (S-28).
  final bool isInterrupting;

  /// A `/compact` left and the conversation has not been compacted yet (S-44).
  final bool isCompacting;

  /// The CLI refused the point this session was forked from (`SESSION_FORK_REJECTED`): the screen
  /// offers the plain resume instead, never the same fork again (S-82).
  final Failure? forkRejection;

  @override
  List<Object?> get props => <Object?>[
    conversation,
    isLoadingHistory,
    historyFailure,
    promptFailure,
    model,
    permissionMode,
    isChoosing,
    choiceFailure,
    queueFailure,
    isInterrupting,
    isCompacting,
    forkRejection,
  ];
}

/// The code of the CLI refusing the point of a fork.
const String forkRejectedCode = 'SESSION_FORK_REJECTED';

/// A change of model or mode in flight: the command it left with, and what to put back if refused.
typedef _Choice = ({String commandId, void Function() putBack});

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

  /// The ids the prompts of this screen left with, which is what a refusal of one names.
  final Set<String> _promptIds = <String>{};
  Failure? _promptFailure;

  /// The change this screen made, laid over where the session started.
  String? _model;
  String? _mode;
  _Choice? _choice;
  Failure? _choiceFailure;

  /// The prompts this screen asked to take out of the queue, by the command that asked.
  final Map<String, String> _cancelling = <String, String>{};

  /// Prompts the server refused to take out — they started — hidden here until the stream says so.
  final Set<String> _gone = <String>{};
  Failure? _queueFailure;

  bool _interrupting = false;
  bool _closing = false;
  Failure? _forkRejection;
  String? _compactId;

  /// Bumped by every reading and every gap, so an answer that arrives after a newer question — or
  /// after the gap that made it pointless — is dropped rather than shown.
  int _readings = 0;

  @override
  LiveSession build(String sessionId) {
    final WatchSession watch = ref.watch(watchSessionProvider);
    final StreamSubscription<SessionUpdate> subscription = watch().listen(_apply);

    // The first prompt of a session this app just opened left from the screen before this one; a
    // refusal of it is this screen's to show (S-34).
    final String? first = ref.read(firstPromptsProvider.notifier).takeCommand(sessionId);

    if (first != null) {
      _promptIds.add(first);
    }

    // The resume point is read at attach time, and again after every reconnection, so the replay
    // starts where this screen actually got to.
    final void Function() stop = watch.follow(sessionId, () => _resumeFrom);

    // Open in the app, the session stays attached with another one on screen: its stream and its
    // questions keep arriving (plan 10, F9). Closed in the app, it is let go like any screen.
    ref.listen<Map<String, List<String>>>(openSessionsProvider, (
      Map<String, List<String>>? _,
      Map<String, List<String>> open,
    ) {
      _hold(isOpen(open, sessionId));
    }, fireImmediately: true);

    // **Not optional** (S-36): without it, moving between sessions piles up subscriptions and the
    // screen starts processing events for a session that is no longer on screen.
    ref.onDispose(() {
      unawaited(subscription.cancel());
      stop();
    });

    return const LiveSession();
  }

  /// What keeps this controller alive while the session is open in the app.
  KeepAliveLink? _kept;

  void _hold(bool open) {
    if (open && _kept == null) {
      _kept = ref.keepAlive();
    } else if (!open && _kept != null) {
      _kept!.close();
      _kept = null;
    }
  }

  /// Sends one turn — a slash command included: `/init` is sent as its text. Mid-turn, the backend
  /// queues it.
  ///
  /// Whatever the last prompt was refused for is forgotten here: it was about that prompt, and
  /// this is another one.
  ///
  /// @returns whether the command left. A socket that is not ready sends nothing, and the screen
  ///   keeps the text rather than clearing a composer whose prompt went nowhere (S-76).
  bool prompt(String text) {
    final String? commandId = ref.read(driveSessionProvider).prompt(sessionId, text);
    _promptFailure = null;

    if (commandId != null) {
      _promptIds.add(commandId);
    }

    _publish();
    return commandId != null;
  }

  /// Asks for the conversation to be compacted: `/compact`, through the normal flow of a prompt.
  /// Once — a second tap while it is on its way sends nothing (S-44).
  bool compact() {
    if (_compactId != null) {
      return true;
    }

    final String? commandId = ref.read(driveSessionProvider).prompt(sessionId, '/compact');
    _compactId = commandId;

    if (commandId != null) {
      _promptIds.add(commandId);
    }

    _publish();
    return commandId != null;
  }

  /// Forgets why the last send, cancel or change was refused — the person closed the strip that
  /// said so.
  void dismissFailures() {
    _forkRejection = null;
    _promptFailure = null;
    _queueFailure = null;
    _choiceFailure = null;
    _publish();
  }

  /// Stops the turn that is running. Once: two taps interrupt it one time (S-28).
  bool interrupt() {
    if (_interrupting) {
      return true;
    }

    _interrupting = ref.read(driveSessionProvider).interrupt(sessionId);
    _publish();
    return _interrupting;
  }

  /// Ends the session. Once — two confirmations end it one time (S-49) — and never one that has
  /// already ended: another client may have closed it while the question was on screen (S-52).
  bool close() {
    if (_closing || _live.status == SessionStatus.closed) {
      return false;
    }

    _closing = ref.read(driveSessionProvider).close(sessionId);
    return _closing;
  }

  /// Switches the model. Shown at once; put back if the server refuses it (S-32).
  void setModel(String model) => _choose(
    (String id) => ref.read(driveSessionProvider).setModel(id, model),
    show: () => _model = model,
    previous: _model,
    restore: (String? before) => _model = before,
  );

  /// Switches the permission mode. Shown at once; put back if the server refuses it (S-32).
  void setPermissionMode(String mode) => _choose(
    (String id) => ref.read(driveSessionProvider).setPermissionMode(id, mode),
    show: () => _mode = mode,
    previous: _mode,
    restore: (String? before) => _mode = before,
  );

  /// Takes [queueId] out of the queue. Once per prompt, however many taps (S-39).
  void cancelQueued(String queueId) {
    if (_cancelling.containsValue(queueId)) {
      return;
    }

    final String? commandId = ref.read(driveSessionProvider).cancelQueuedPrompt(sessionId, queueId);

    if (commandId != null) {
      _cancelling[commandId] = queueId;
    }

    _queueFailure = null;
    _publish();
  }

  /// Reads the history again, after it failed. Nothing to do when nothing said where it is.
  Future<void> retryHistory() async {
    final String? conversationId = _historyOf;

    if (conversationId != null) {
      await _readHistory(conversationId);
    }
  }

  void _choose(
    String? Function(String sessionId) send, {
    required void Function() show,
    required String? previous,
    required void Function(String? before) restore,
  }) {
    if (_choice != null) {
      return;
    }

    final String? commandId = send(sessionId);
    _choiceFailure = null;

    if (commandId != null) {
      _choice = (commandId: commandId, putBack: () => restore(previous));
      show();
    }

    _publish();
  }

  void _apply(SessionUpdate update) {
    // Several sessions are followed at once (plan 10, F9): what names another session is not this
    // screen's (S-172).
    if (!_isMine(update)) {
      return;
    }

    switch (update) {
      case EventReceived(:final SessionEvent event):
        _received(event);

      // The second rule of the stream: a gap clears everything, and the history is read again
      // from the conversation the ack named (S-14). Stitching a partial hole produces a view that
      // looks complete and is not, which is worse than one that admits it reloaded.
      // With no conversation to read the history from, what is on screen starts with the line that
      // says it is only what the server still had (B-23).
      case StreamGap(:final String? claudeSessionId):
        _live = claudeSessionId == null ? const Conversation.partial() : const Conversation();
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

      case CommandAccepted(:final String commandId):
        _accepted(commandId);

      case CommandRefused(:final String commandId, :final Failure failure):
        _refused(commandId, failure);

      case SessionFailed(:final Failure failure, :final String? sessionId)
          when sessionId == this.sessionId && failure.code == forkRejectedCode:
        _forkRejection = failure;
        _publish();

      // Joining a live session is the resume's business, and any other failure the session reports
      // is about an undo, and belongs to the undo sheet.
      case SessionJoined():
      case SessionFailed():
        return;
    }
  }

  /// Whether [update] is about this session — or about none in particular.
  bool _isMine(SessionUpdate update) => switch (update) {
    EventReceived(sessionId: final String? other) => other == null || other == sessionId,
    StreamGap(sessionId: final String? other) => other == null || other == sessionId,
    SessionJoined(sessionId: final String other) => other == sessionId,
    SessionFailed(sessionId: final String? other) => other == null || other == sessionId,
    _ => true,
  };

  void _received(SessionEvent event) {
    final int before = _live.lastSeq;
    _live = _live.apply(event);
    _resumeFrom = _live.lastSeq;
    _settle(event);
    _publish();

    // A session that continues another starts its own `seq` from one, and the buffer only holds
    // what **it** said: everything before comes from the transcript (B-11). Only an event that was
    // applied counts — a replay re-delivering it asks for nothing twice.
    if (event case SessionOpened(
      :final String resumedFrom?,
    ) when _live.lastSeq > before && _historyOf == null) {
      unawaited(_readHistory(resumedFrom));
    }
  }

  /// What an event of the stream settles of what this screen was waiting on.
  void _settle(SessionEvent event) {
    if (!_live.isTurnRunning) {
      _interrupting = false;
    }

    if (event is ContextCompacted || event is TurnFinished) {
      _compactId = null;
    }

    if (event case PromptDequeued(:final String queueId)) {
      _gone.remove(queueId);
      _cancelling.removeWhere((String _, String id) => id == queueId);
    }
  }

  void _accepted(String commandId) {
    if (_choice?.commandId == commandId) {
      _choice = null;
      _publish();
    }
  }

  /// A refusal names the command it refuses, and only this screen's are its business.
  void _refused(String commandId, Failure failure) {
    final _Choice? choice = _choice;

    if (choice?.commandId == commandId) {
      choice!.putBack();
      _choice = null;
      _choiceFailure = failure;
    } else if (_cancelling.remove(commandId) case final String queueId) {
      _gone.add(queueId);
      _queueFailure = failure;
    } else if (_promptIds.remove(commandId)) {
      _promptFailure = failure;

      if (commandId == _compactId) {
        _compactId = null;
      }
    } else {
      return;
    }

    _publish();
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

  void _publish() {
    final Conversation shown = _live.withHistory(_history);

    state = LiveSession(
      conversation: _gone.isEmpty
          ? shown
          : shown.copyWith(
              queue: shown.queue
                  .where((QueuedPrompt prompt) => !_gone.contains(prompt.queueId))
                  .toList(growable: false),
            ),
      isLoadingHistory: _loadingHistory,
      historyFailure: _historyFailure,
      promptFailure: _promptFailure,
      model: _model ?? _live.facts.model,
      permissionMode: _mode ?? _live.facts.permissionMode,
      isChoosing: _choice != null,
      choiceFailure: _choiceFailure,
      queueFailure: _queueFailure,
      isInterrupting: _interrupting,
      isCompacting: _compactId != null,
      forkRejection: _forkRejection,
    );
  }
}
