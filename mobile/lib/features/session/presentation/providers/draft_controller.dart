/// A new conversation before it is one: what to start it with, and the first send that opens it
/// (D-05, 08 · D-07).
///
/// Nothing runs until then. Tapping a folder sends no `session.start`, so no subprocess (~222 MB,
/// counted against the ceiling) exists because somebody opened a folder to look. The first send
/// opens the session with the model, the mode and the effort chosen here — the effort can only be
/// chosen here (08 · D-16) — and, once it opened, sends the prompt.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/usecases/drive_session.dart';
import 'package:remote_claude/features/session/presentation/providers/first_prompts.dart';
import 'package:remote_claude/features/session/presentation/providers/session_updates.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'draft_controller.g.dart';

/// Where a draft stands.
class Draft extends Equatable {
  const Draft({
    this.choices = const SessionChoices(),
    this.isStarting = false,
    this.failure,
    this.wasNotSent = false,
    this.sessionId,
  });

  /// The model, the mode and the effort chosen. `null` each: the installation's default.
  final SessionChoices choices;

  /// A `session.start` left and neither the session nor its refusal came back. A second send sends
  /// nothing (S-20).
  final bool isStarting;

  /// Why the start was refused — the machine at its ceiling, say. The text and the choices stay.
  final Failure? failure;

  /// The socket was not ready, so nothing left.
  final bool wasNotSent;

  /// The session it became, once it opened. The screen moves to it.
  final String? sessionId;

  Draft copyWith({SessionChoices? choices}) => Draft(
    choices: choices ?? this.choices,
    isStarting: isStarting,
    failure: failure,
    wasNotSent: wasNotSent,
    sessionId: sessionId,
  );

  @override
  List<Object?> get props => <Object?>[
    choices.model,
    choices.permissionMode,
    choices.effort,
    isStarting,
    failure,
    wasNotSent,
    sessionId,
  ];
}

/// The draft of one folder. Disposed with its screen: leaving a draft leaves nothing (S-22).
@riverpod
class DraftController extends _$DraftController with FollowsStart {
  /// What to send once the session opened.
  String _text = '';

  @override
  Draft build(String workspacePath) {
    listenToUpdates(ref, followStart);
    return const Draft();
  }

  /// Chooses the model. The effort goes back to the default: a level one model takes, another may
  /// not (S-34).
  void chooseModel(String? model) => state = state.copyWith(
    choices: SessionChoices(model: model, permissionMode: state.choices.permissionMode),
  );

  /// Chooses the mode.
  void chooseMode(String mode) => state = state.copyWith(
    choices: SessionChoices(
      model: state.choices.model,
      permissionMode: mode,
      effort: state.choices.effort,
    ),
  );

  /// Chooses the effort.
  void chooseEffort(String? effort) => state = state.copyWith(
    choices: SessionChoices(
      model: state.choices.model,
      permissionMode: state.choices.permissionMode,
      effort: effort,
    ),
  );

  /// Forgets why the last start was refused — the person closed the strip. The choices stay.
  void dismiss() => state = Draft(choices: state.choices);

  /// Opens the session with what was chosen, and sends [text] as its first prompt once it opened.
  /// One start, however many taps (S-20).
  ///
  /// @returns whether the start left
  bool send(String text) {
    if (state.isStarting) {
      return true;
    }

    _text = text;
    startId = ref.read(driveSessionProvider).start(workspacePath, choices: state.choices);

    state = Draft(choices: state.choices, isStarting: startId != null, wasNotSent: startId == null);

    return startId != null;
  }

  @override
  void onStartOpened(String sessionId) {
    ref.read(firstPromptsProvider.notifier).send(sessionId, _text, effort: state.choices.effort);
    state = Draft(choices: state.choices, sessionId: sessionId);
  }

  @override
  void onStartRefused(Failure failure) => state = Draft(choices: state.choices, failure: failure);
}
