/// The command menu as the domain has it: the two groups and the search (B-15, D-05).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/slash_command.dart';

import '../../../../../support/builders/undo.dart';

void main() {
  group('a command is found', () {
    const SlashCommand compact = SlashCommand(
      name: 'compact',
      description: 'Clear conversation history but keep a summary',
      aliases: <String>['squash'],
    );

    test('by its name, its alias or its description, ignoring case', () {
      expect(compact.matches('comp'), isTrue);
      expect(compact.matches('SQUASH'), isTrue);
      expect(compact.matches('summary'), isTrue);
    });

    test('with the slash it is typed with, and spaces around it', () {
      expect(compact.matches('  /compact '), isTrue);
    });

    test('by an empty query, or one that is only spaces or a slash', () {
      expect(compact.matches(''), isTrue);
      expect(compact.matches('   '), isTrue);
      expect(compact.matches('/'), isTrue);
    });

    test('not by what it neither is called nor does', () {
      expect(compact.matches('review'), isFalse);
    });
  });

  test('picking one puts the command and a space in the box, ready for its argument', () {
    expect(const SlashCommand(name: 'init').invocation, '/init ');
  });

  test('a command with nothing but a name has empty defaults, not nulls', () {
    const SlashCommand bare = SlashCommand(name: 'x');

    expect(bare.description, isEmpty);
    expect(bare.argumentHint, isEmpty);
    expect(bare.aliases, isEmpty);
    expect(bare.suggested, isFalse);
  });

  group('the menu', () {
    test('keeps the suggested on top and everything else below, in the order it came', () {
      expect(aMenu.suggested.map((SlashCommand c) => c.name), <String>['init', 'review']);
      expect(aMenu.others.map((SlashCommand c) => c.name), <String>['compact']);
    });

    test('S-30 · an installation with fewer commands shows fewer — nothing is added here', () {
      const CommandMenu fewer = CommandMenu(commands: <SlashCommand>[SlashCommand(name: 'init')]);

      expect(fewer.commands, hasLength(1));
      expect(fewer.isEmpty, isFalse);
      expect(const CommandMenu().isEmpty, isTrue);
    });

    test('a search keeps the order and the version, and narrows both groups', () {
      final CommandMenu found = aMenu.search('co');

      expect(found.cliVersion, '2.1.277');
      // `init` by its description ("codebase"), `compact` by its name.
      expect(found.commands.map((SlashCommand c) => c.name), <String>['init', 'compact']);
      expect(found.suggested.map((SlashCommand c) => c.name), <String>['init']);
      expect(aMenu.search('nothing like it').isEmpty, isTrue);
    });

    test('compares by value', () {
      expect(aMenu.search(''), aMenu);
    });
  });
}
