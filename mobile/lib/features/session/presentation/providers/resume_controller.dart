/// Continuing a conversation of the history, and learning which session continues it.
///
/// `session.start` with `resumeSessionId` has two answers, and which one is not the client's
/// choice: a **new** session, announced by `session.started` naming the conversation it continues,
/// or — when that conversation is already live for the caller — **joining** it, announced by a
/// `session.attached` for a session this screen does not watch yet. Resuming what is live is an
/// attach, never a second subprocess (S-24). This watches for either, and for the refusal.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/presentation/providers/session_updates.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'resume_controller.g.dart';

/// Where a resume stands.
class ResumeState extends Equatable {
  const ResumeState({
    this.isPending = false,
    this.wasNotSent = false,
    this.failure,
    this.sessionId,
  });

  /// The command left and nothing has answered it yet. A second tap sends nothing.
  final bool isPending;

  /// The socket was not ready, so nothing left — said out loud, never swallowed.
  final bool wasNotSent;

  /// Why the server refused it: a conversation that does not exist, a workspace no longer
  /// allowed, too many sessions open (B-13).
  final Failure? failure;

  /// The session that continues the conversation, once one does. The screen moves to it.
  final String? sessionId;

  @override
  List<Object?> get props => <Object?>[isPending, wasNotSent, failure, sessionId];
}

/// The resume of one conversation, keyed by it.
@riverpod
class ResumeController extends _$ResumeController {
  /// The id the command left with, which is what a refusal of it names.
  String? _commandId;

  @override
  ResumeState build(String conversationId) {
    listenToUpdates(ref, _apply);
    return const ResumeState();
  }

  /// Continues the conversation in [workspacePath] — the one it ran in.
  void resume(String workspacePath) {
    if (state.isPending) {
      return;
    }

    final String? commandId = ref.read(driveSessionProvider).resume(workspacePath, conversationId);
    _commandId = commandId;

    state = commandId == null
        ? const ResumeState(wasNotSent: true)
        : const ResumeState(isPending: true);
  }

  /// Forgets where the resume landed, once the screen has moved there.
  void acknowledge() => state = const ResumeState();

  void _apply(SessionUpdate update) {
    if (!state.isPending) {
      return;
    }

    final String? landed = switch (update) {
      EventReceived(
        event: SessionOpened(
          :final String sessionId,
          :final String? claudeSessionId,
          :final String? resumedFrom,
        ),
      )
          when _continues(claudeSessionId, resumedFrom) =>
        sessionId,
      SessionJoined(
        :final String sessionId,
        :final String? claudeSessionId,
        :final String? resumedFrom,
      )
          when _continues(claudeSessionId, resumedFrom) =>
        sessionId,
      _ => null,
    };

    if (landed != null) {
      state = ResumeState(sessionId: landed);
      return;
    }

    if (update case CommandRefused(
      :final String commandId,
      :final Failure failure,
    ) when commandId == _commandId) {
      state = ResumeState(failure: failure);
    }
  }

  /// Whether a session writing to [claudeSessionId], continuing [resumedFrom], is this one.
  ///
  /// Either will do. Continuing one of our own conversations keeps its id, so both name it; a
  /// conversation begun elsewhere is forked under a new id, and only `resumedFrom` does (D-04).
  bool _continues(String? claudeSessionId, String? resumedFrom) =>
      claudeSessionId == conversationId || resumedFrom == conversationId;
}
