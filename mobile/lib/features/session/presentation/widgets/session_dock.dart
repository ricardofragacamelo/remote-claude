/// What sits over the keyboard on the session screen (plan 10, B-07, B-10…B-14): the lines above the
/// box — why the session ended, the queue, a refusal, a real block — and the composer with its bar.
///
/// Built from what the screen already watches, so the screen keeps only its frame and the resume it
/// navigates by.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/widgets/connection_line.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/presentation/providers/engine_catalogue.dart';
import 'package:remote_claude/features/session/presentation/providers/first_prompts.dart';
import 'package:remote_claude/features/session/presentation/providers/insight_controllers.dart';
import 'package:remote_claude/features/session/presentation/providers/live_session_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/resume_controller.dart';
import 'package:remote_claude/features/session/presentation/widgets/chat_composer.dart';
import 'package:remote_claude/features/session/presentation/widgets/command_menu_sheet.dart';
import 'package:remote_claude/features/session/presentation/widgets/context_ring.dart';
import 'package:remote_claude/features/session/presentation/widgets/pending_pill.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_choices.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_strips.dart';
import 'package:remote_claude/features/session/presentation/widgets/task_strip.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// The dock of one session, as it stands.
class SessionDock {
  const SessionDock({
    required this.context,
    required this.ref,
    required this.sessionId,
    required this.box,
    required this.session,
    required this.connection,
    required this.onResumeAndSend,
    required this.onForgetResume,
    required this.questions,
    this.resume,
    this.fork = const ResumeState(),
    this.onSendEdit,
    this.onCancelEdit,
    this.onResumeInstead,
  });

  final BuildContext context;
  final WidgetRef ref;
  final String sessionId;

  /// The text of the box, owned by the screen.
  final TextEditingController box;

  final LiveSession session;
  final ConnectionStatus connection;

  /// Where resuming this session stands, when it ended and somebody sent in it.
  final ResumeState? resume;

  /// Sends in a session that ended: resumes it, then sends there (09 · D-05).
  final SendOutcome Function(String text) onResumeAndSend;

  /// Forgets a refused resume, so its line goes.
  final VoidCallback onForgetResume;

  /// Where the cards of the questions are — what the pill over the box reads (B-22).
  final QuestionsInView questions;

  /// Where a fork of this session stands — an edited prompt sent again, or a fork from one.
  final ResumeState fork;

  /// Sends the box as the edited prompt — present only while one is being edited (B-24).
  final SendOutcome Function(String text)? onSendEdit;

  /// Leaves the edit.
  final VoidCallback? onCancelEdit;

  /// Resumes the conversation this session forked, after the CLI refused the point (S-82).
  final VoidCallback? onResumeInstead;

  LiveSessionController get _live => ref.read(liveSessionControllerProvider(sessionId).notifier);

  /// What the engine of the session declared it can do — declared, never supposed (ADR-025): a
  /// control of a capability it did not declare does not exist (plan 28, F3).
  EngineCapabilities? get _can => session.conversation.facts.capabilities;

  /// What the session's engine offers to choose — the modes and the levels of effort it announced —,
  /// from the list of engines while its `session.started` has not said (plan 28, B-27, B-28).
  EngineCapabilities? get _offered => sessionCapabilities(ref, session.conversation.facts);

  /// The lines above the box, in their order (B-13): why it ended, the queue, the last refusal, and
  /// a real reason nothing can be sent.
  List<Widget> aboveBox() {
    final SessionEnding? ending = session.conversation.ending;
    final Failure? refusal =
        fork.failure ??
        resume?.failure ??
        session.promptFailure ??
        session.queueFailure ??
        session.choiceFailure;
    final Failure? forkRejection = session.forkRejection;
    final VoidCallback? cancelEdit = onCancelEdit;

    return <Widget>[
      // Over the box (09 · D-14): the way to a question out of view, and the task list.
      _pill(),
      if (_can?.taskList ?? false)
        TaskStrip(
          items: session.conversation.tasks ?? const <SessionTask>[],
          engine: session.conversation.facts.engine,
        ),
      if (ending != null) EndedStrip(ending: ending, engine: session.conversation.facts.engine),
      QueueStrip(queue: session.conversation.queue, onCancel: _live.cancelQueued),
      if (cancelEdit != null) EditingStrip(onCancel: cancelEdit),
      if (forkRejection != null)
        RefusalStrip(
          failure: forkRejection,
          onClose: _live.dismissFailures,
          action: TextButton(
            onPressed: onResumeInstead,
            child: Text(AppLocalizations.of(context).sessionEditResumeInstead),
          ),
        ),
      if (refusal != null)
        RefusalStrip(
          failure: refusal,
          onClose: () {
            _live.dismissFailures();
            onForgetResume();
          },
        ),
      if (connection != ConnectionStatus.ready && connection != ConnectionStatus.connecting)
        BlockedStrip(reason: connectionLabel(AppLocalizations.of(context), connection)),
    ];
  }

  /// "The agent is waiting for your answer (n)", while a card is out of view.
  Widget _pill() {
    final int waiting = ref.watch(
      permissionQueueControllerProvider(
        sessionId,
      ).select((PermissionQueue queue) => queue.pending.length),
    );
    final String? oldest = ref
        .read(permissionQueueControllerProvider(sessionId))
        .pending
        .firstOrNull
        ?.requestId;

    return ListenableBuilder(
      listenable: questions,
      builder: (BuildContext context, Widget? _) => PendingPill(
        count: waiting,
        engine: session.conversation.facts.engine,
        outOfView: questions.outOfView,
        questionsOnly: ref.watch(
          permissionQueueControllerProvider(sessionId).select(onlyQuestions),
        ),
        onGoTo: () {
          if (oldest != null) {
            questions.goTo(oldest);
          }
        },
      ),
    );
  }

  /// The box and its bar.
  Widget composer() {
    final Conversation conversation = session.conversation;
    final bool closed = conversation.status == SessionStatus.closed;
    final LiveSessionController live = _live;

    return ChatComposer(
      controller: box,
      state: ComposerState(
        isEnabled:
            connection == ConnectionStatus.ready &&
            (!closed || conversation.facts.conversation != null),
        isBusy: fork.isPending || (resume?.isPending ?? false),
        busyLabel: fork.isPending
            ? AppLocalizations.of(context).sessionForkStarting
            : AppLocalizations.of(context).sessionEndedResuming,
        isTurnRunning: conversation.isTurnRunning,
        isClosed: closed,
        isStopping: session.isInterrupting,
        engine: conversation.facts.engine,
      ),
      onSend: (String text) => _send(live, text, closed: closed),
      onStop: live.interrupt,
      onOpenCommands: (String query) => pickCommand(context, sessionId: sessionId, query: query),
      mode: modeChoice(
        context,
        current: session.permissionMode,
        modes: modesOf(_offered),
        engine: conversation.facts.engine,
        isPending: session.isChoosing,
        onPick: live.setPermissionMode,
      ),
      // A session that ended runs no model and holds no context: only the mode is left to say.
      choices: closed ? const <ComposerChoice>[] : _choices(live),
    );
  }

  /// Where a send goes: the edited prompt to its fork, a session that ended to its resume, and any
  /// other to this session.
  SendOutcome _send(LiveSessionController live, String text, {required bool closed}) {
    final SendOutcome Function(String text)? edit = onSendEdit;

    if (edit != null) {
      return edit(text);
    }

    if (closed) {
      return onResumeAndSend(text);
    }

    return live.prompt(text) ? SendOutcome.sent : SendOutcome.notSent;
  }

  /// The model, the effort and the context of a live session.
  List<ComposerChoice> _choices(LiveSessionController live) {
    final AsyncValue<SessionModels> models = ref.watch(sessionModelsControllerProvider(sessionId));
    final List<InstallationModel> known = models.value?.models ?? const <InstallationModel>[];
    final String? model = session.model ?? models.value?.current;
    final Map<String, String?> efforts = ref.watch(firstPromptsProvider);
    final EngineCapabilities? can = _can;

    return <ComposerChoice>[
      modelChoice(
        context,
        current: model,
        known: known,
        isPending: session.isChoosing,
        models: (WidgetRef ref) => ref
            .watch(sessionModelsControllerProvider(sessionId))
            .whenData((SessionModels listed) => listed.models),
        onPick: (String? picked) => live.setModel(picked ?? ''),
      ),
      ?effortChoice(
        context,
        model: modelOf(known, model),
        levels: levelsOf(_offered),
        current: efforts[sessionId],
        isKnown: efforts.containsKey(sessionId),
        engine: session.conversation.facts.engine,
      ),
      // No measure is asked of an engine that cannot give one, and no "Compact" offered to one that
      // cannot compact (S-70, S-72).
      if (can != null && can.contextUse)
        contextChoice(
          context,
          sessionId: sessionId,
          use: ref.watch(sessionContextControllerProvider(sessionId)),
          onCompact: can.compaction ? live.compact : null,
          isCompacting: session.isCompacting,
        ),
    ];
  }
}
