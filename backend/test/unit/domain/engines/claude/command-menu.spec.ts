import { describe, expect, it } from 'vitest';

import { menuOf, originOf } from '@domain/session';
import type { SlashCommand } from '@domain/session';
import {
  CLAUDE_COMMAND_MENU,
  SUGGESTED_COMMANDS,
  SYSTEM_SKILLS_PLUGIN,
  USER_SKILLS_PLUGIN,
} from '@domain/engines/claude';
import { loadCommands } from '../../../../fakes/agent-sdk/fixture';
import { aCommand } from '../../../../support/builders/session.builder';

/** The catalogue a real installation answered, in our shape. */
function recorded(): SlashCommand[] {
  return loadCommands().commands.map((command) => ({
    name: command.name,
    description: command.description,
    argumentHint: command.argumentHint,
    aliases: command.aliases ?? [],
  }));
}

describe('Claude’s command menu — plan 28, B-37', () => {
  it('reads the skills of the user and of the system by their plugin’s namespace — S-241, S-242', () => {
    expect(originOf(aCommand(`${USER_SKILLS_PLUGIN}:notes`), CLAUDE_COMMAND_MENU)).toBe('user');
    expect(originOf(aCommand(`${SYSTEM_SKILLS_PLUGIN}:pdf`), CLAUDE_COMMAND_MENU)).toBe('system');
    expect(originOf(aCommand('other-plugin:lint'), CLAUDE_COMMAND_MENU)).toBe('project');
  });

  it('shows a qualified skill by its simple name, and inserts the qualified one — S-242', () => {
    const [skill] = menuOf([aCommand(`${USER_SKILLS_PLUGIN}:notes`)], CLAUDE_COMMAND_MENU);

    expect(skill).toMatchObject({
      name: `${USER_SKILLS_PLUGIN}:notes`,
      label: 'notes',
      origin: 'user',
      shadowed: false,
    });
  });

  it('does not cover a qualified row whose simple name a Claude Code command has — S-243', () => {
    const menu = menuOf(
      [aCommand(`${USER_SKILLS_PLUGIN}:review`), aCommand('review', { builtin: true })],
      CLAUDE_COMMAND_MENU,
    );

    expect(menu.map((row) => [row.name, row.shadowed])).toEqual([
      ['review', false],
      [`${USER_SKILLS_PLUGIN}:review`, false],
    ]);
  });

  it('builds the menu of the recorded installation without a hidden entry, suggested first — S-29', () => {
    const commands = recorded();
    const menu = menuOf(commands, CLAUDE_COMMAND_MENU);

    expect(menu).toHaveLength(commands.length - 3);
    expect(menu[0]?.name).toBe('init');
    expect(menu.filter((command) => command.suggested).map((command) => command.name)).toEqual(
      SUGGESTED_COMMANDS.filter((name) => commands.some((command) => command.name === name)),
    );
  });
});
