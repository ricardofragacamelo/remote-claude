/// The first prompt of a session this app just opened — by a draft, or by resuming one that ended —
/// and what that session's screen needs to know about it.
///
/// The session answers on the socket, and its screen is a new one: the screen that asked is gone
/// by the time the session's screen builds. This is what carries across: the prompt that could not
/// leave (it goes back to the box), the command id a refusal of it will name, and the effort the
/// session was opened with — which the server never says again (08 · D-16).
library;

import 'package:remote_claude/features/session/presentation/providers/owned_sessions.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'first_prompts.g.dart';

/// Every session sent a first prompt from here was opened here, and is claimed as this app's
/// ([OwnedSessions]).
///
/// The effort each session opened here started with, by session. A session absent from it was not
/// opened here, and its effort is not known.
@Riverpod(keepAlive: true)
class FirstPrompts extends _$FirstPrompts {
  final Map<String, String> _texts = <String, String>{};
  final Map<String, String> _commands = <String, String>{};

  @override
  Map<String, String?> build() => const <String, String?>{};

  /// Sends [text] to [sessionId], which this app just opened with [effort].
  ///
  /// @returns whether it left. When it did not — the socket went between the start and the prompt —
  ///   the text waits for the session's box, so what was meant is never lost.
  bool send(String sessionId, String text, {String? effort, bool remembersEffort = true}) {
    ref.read(ownedSessionsProvider.notifier).claim(sessionId);

    if (remembersEffort) {
      state = <String, String?>{...state, sessionId: effort};
    }

    final String? commandId = ref.read(driveSessionProvider).prompt(sessionId, text);

    if (commandId == null) {
      _texts[sessionId] = text;
      return false;
    }

    _commands[sessionId] = commandId;
    return true;
  }

  /// The text that could not leave for [sessionId], once — its box takes it.
  String? takeText(String sessionId) => _texts.remove(sessionId);

  /// The command id of [sessionId]'s first prompt, once — what a refusal of it names.
  String? takeCommand(String sessionId) => _commands.remove(sessionId);
}
