/// Reading the command menu. One use case, one thing it does.
library;

import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';

/// What the installation of a session offers.
class ListCommands {
  const ListCommands(this._commands);

  final CommandRepository _commands;

  Future<CommandMenu> call(String sessionId) => _commands.menu(sessionId);
}
