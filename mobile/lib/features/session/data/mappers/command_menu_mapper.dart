/// Reads `GET /sessions/:sessionId/commands` as a [CommandMenu].
///
/// This is the only file that knows both the wire and the entity. It filters nothing and orders
/// nothing: the backend already left out the internal and the dead commands, by metadata, and put
/// the suggested first (D-05). A second filter here would be a second opinion that drifts.
library;

import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

/// The menu in [body], or `null` when the body is not that listing.
CommandMenu? commandMenuFrom(Object? body) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  final Object? commands = body['commands'];
  final Object? cliVersion = body['cliVersion'];

  if (commands is! List<Object?>) {
    return null;
  }

  return CommandMenu(
    cliVersion: cliVersion is String ? cliVersion : null,
    commands: <SlashCommand>[for (final Object? entry in commands) ?slashCommandFrom(entry)],
  );
}

/// One command, or `null` when it has no name — a command nobody can type is not one to offer.
///
/// Everything else has a default: a command that describes nothing is still one the installation
/// runs.
SlashCommand? slashCommandFrom(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  final Object? name = entry['name'];
  final Object? description = entry['description'];
  final Object? argumentHint = entry['argumentHint'];
  final Object? aliases = entry['aliases'];

  if (name is! String || name.isEmpty) {
    return null;
  }

  return SlashCommand(
    name: name,
    description: description is String ? description : '',
    argumentHint: argumentHint is String ? argumentHint : '',
    aliases: aliases is List<Object?>
        ? aliases.whereType<String>().toList(growable: false)
        : const <String>[],
    suggested: entry['suggested'] == true,
  );
}
