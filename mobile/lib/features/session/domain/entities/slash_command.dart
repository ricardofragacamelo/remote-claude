/// The commands the Claude installation on the user's machine offers, as the menu shows them.
///
/// Pure Dart. The list is **never** ours: it comes from the installation, already filtered and
/// ordered by the backend, and an installation with fewer commands shows fewer (S-30). What lives
/// here is only what the menu does with it — split it into the suggested group and the rest, and
/// narrow it to what the person typed.
///
/// The menu is discovery, not a boundary (D-05): the prompt box accepts any text, so nothing here
/// decides what may be sent.
library;

import 'package:equatable/equatable.dart';

/// One slash command of the installation.
class SlashCommand extends Equatable {
  const SlashCommand({
    required this.name,
    this.description = '',
    this.argumentHint = '',
    this.aliases = const <String>[],
    this.suggested = false,
  });

  /// Without the slash: `init`, not `/init`.
  final String name;

  /// What the installation says it does, in its own words. Empty when it says nothing.
  final String description;

  /// How its argument is written, when it takes one. Empty when it takes none.
  final String argumentHint;

  /// Other names the installation answers to.
  final List<String> aliases;

  /// Whether it belongs to the group on top of the menu.
  final bool suggested;

  /// What picking it puts in the prompt box: the command and a space, ready for its argument.
  String get invocation => '/$name ';

  /// Whether [query] finds this command, by name, alias or description, ignoring case.
  ///
  /// A leading slash is ignored, because that is how a command is written and so how somebody
  /// looking for one types it. An empty query finds everything.
  bool matches(String query) {
    final String wanted = _normalised(query);

    if (wanted.isEmpty) {
      return true;
    }

    bool finds(String text) => text.toLowerCase().contains(wanted);

    return finds(name) || aliases.any(finds) || finds(description);
  }

  static String _normalised(String query) {
    final String trimmed = query.trim().toLowerCase();
    return trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
  }

  @override
  List<Object?> get props => <Object?>[name, description, argumentHint, aliases, suggested];
}

/// Everything the installation offers, in the order the backend put it.
class CommandMenu extends Equatable {
  const CommandMenu({this.commands = const <SlashCommand>[], this.cliVersion});

  /// The suggested first, in ranking order, then the rest by name.
  final List<SlashCommand> commands;

  /// The version of the binary the session runs. `null` before its first turn.
  final String? cliVersion;

  /// Whether the installation offers nothing at all.
  bool get isEmpty => commands.isEmpty;

  /// The group on top.
  List<SlashCommand> get suggested =>
      commands.where((SlashCommand command) => command.suggested).toList(growable: false);

  /// Everything else.
  List<SlashCommand> get others =>
      commands.where((SlashCommand command) => !command.suggested).toList(growable: false);

  /// The commands [query] finds, in the same order.
  CommandMenu search(String query) => CommandMenu(
    cliVersion: cliVersion,
    commands: commands
        .where((SlashCommand command) => command.matches(query))
        .toList(growable: false),
  );

  @override
  List<Object?> get props => <Object?>[commands, cliVersion];
}
