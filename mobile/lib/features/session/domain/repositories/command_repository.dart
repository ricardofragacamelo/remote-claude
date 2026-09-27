/// What the command menu needs from the outside world.
library;

import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

/// The commands of the installation a live session runs on.
abstract interface class CommandRepository {
  /// Every command the installation of [sessionId] offers, the suggested first.
  ///
  /// @throws [Failure] never an exception of the transport — `SESSION_NOT_FOUND` for a session
  ///   that is not live, `CLAUDE_UNAVAILABLE` / `CLAUDE_TIMEOUT` when the machine did not answer.
  ///   None of them stops a prompt: the menu is discovery, not a boundary (S-31)
  Future<CommandMenu> menu(String sessionId);
}
