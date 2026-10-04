/// Editing a prompt and sending it again, and forking from one (plan 10, B-24) — always a fork, never
/// a truncation (08 · D-19): a new conversation continues the old one up to **before** the prompt,
/// and the old one stays readable in the history. The new session opens, the text goes to it as its
/// first prompt, and the screen moves there.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/presentation/providers/first_prompts.dart';
import 'package:remote_claude/features/session/presentation/providers/resume_controller.dart';
import 'package:remote_claude/features/session/presentation/providers/session_updates.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'fork_controller.g.dart';

/// The forks of one session's screen, keyed by that session. Where one stands is what a resume's
/// state says — pending, not sent, refused, or the session it opened.
@riverpod
class ForkController extends _$ForkController with FollowsStart {
  /// What the new conversation is sent first.
  String _text = '';

  @override
  ResumeState build(String sessionId) {
    listenToUpdates(ref, followStart);
    return const ResumeState();
  }

  /// Opens a new conversation that continues [conversationId] from before [messageId], in
  /// [workspacePath], and sends it [text]. One start, however many taps.
  ///
  /// @returns whether the start left
  bool fork({
    required String workspacePath,
    required String conversationId,
    required String messageId,
    required String text,
  }) {
    if (state.isPending) {
      return true;
    }

    _text = text;
    startId = ref.read(driveSessionProvider).fork(workspacePath, conversationId, messageId);
    state = startId == null
        ? const ResumeState(wasNotSent: true)
        : const ResumeState(isPending: true);

    return startId != null;
  }

  /// Forgets a refusal, or where the fork landed once the screen moved there.
  void acknowledge() => state = const ResumeState();

  @override
  void onStartOpened(String sessionId) {
    ref.read(firstPromptsProvider.notifier).send(sessionId, _text, remembersEffort: false);
    state = ResumeState(sessionId: sessionId);
  }

  @override
  void onStartRefused(Failure failure) => state = ResumeState(failure: failure);
}
