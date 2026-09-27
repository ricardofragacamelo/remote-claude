/// The command repository: the installation's menu, as the entity the menu screen uses.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/session_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/command_menu_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';
import 'package:remote_claude/features/session/domain/repositories/command_repository.dart';

/// [CommandRepository] over the backend's HTTP API.
class CommandRepositoryImpl implements CommandRepository {
  const CommandRepositoryImpl(this._api);

  final SessionApiDataSource _api;

  @override
  Future<CommandMenu> menu(String sessionId) async =>
      commandMenuFrom(await _api.commands(sessionId)) ?? (throw unreadableAnswer());
}

/// The failure of an answer this build cannot read.
///
/// Not an empty list: "this machine offers no commands" or "there is nothing to undo" would be a
/// false sentence about exactly what the screen exists to show, so the person reads that something
/// went wrong instead.
Failure unreadableAnswer() => const UnexpectedFailure(traceId: unknownTraceId);
