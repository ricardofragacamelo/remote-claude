/// The wire of `GET /sessions/:sessionId/commands`, read as the menu (B-15).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/command_menu_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

void main() {
  test('S-29 · reads every command the installation answered, in the order it came', () {
    final CommandMenu? menu = commandMenuFrom(<String, Object?>{
      'cliVersion': '2.1.277',
      'commands': <Object?>[
        <String, Object?>{
          'name': 'init',
          'description': 'Initialize',
          'argumentHint': '',
          'aliases': <Object?>[],
          'suggested': true,
        },
        <String, Object?>{
          'name': 'compact',
          'description': 'Summarise',
          'argumentHint': '[instructions]',
          'aliases': <Object?>['squash', 3],
          'suggested': false,
        },
      ],
    });

    expect(menu?.cliVersion, '2.1.277');
    expect(menu?.commands, const <SlashCommand>[
      SlashCommand(name: 'init', description: 'Initialize', suggested: true),
      SlashCommand(
        name: 'compact',
        description: 'Summarise',
        argumentHint: '[instructions]',
        aliases: <String>['squash'],
      ),
    ]);
  });

  test('a version not known before the first turn is null, and an empty list is empty', () {
    final CommandMenu? menu = commandMenuFrom(<String, Object?>{
      'cliVersion': null,
      'commands': <Object?>[],
    });

    expect(menu, const CommandMenu());
  });

  test('a command with no name is dropped; anything else missing has a default', () {
    final CommandMenu? menu = commandMenuFrom(<String, Object?>{
      'commands': <Object?>[
        <String, Object?>{'description': 'nameless'},
        <String, Object?>{'name': ''},
        'not a command',
        <String, Object?>{'name': 'review', 'description': 7, 'argumentHint': 7, 'aliases': 'x'},
      ],
    });

    expect(menu?.commands, const <SlashCommand>[SlashCommand(name: 'review')]);
  });

  test('a body that is not the listing is not a menu with nothing in it', () {
    expect(commandMenuFrom(null), isNull);
    expect(commandMenuFrom('<html>'), isNull);
    expect(commandMenuFrom(<String, Object?>{'commands': 'none'}), isNull);
  });
}
