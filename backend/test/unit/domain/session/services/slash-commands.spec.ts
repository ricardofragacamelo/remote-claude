import { describe, expect, it } from 'vitest';

import { commandIn, isHidden, menuOf, offers, originOf } from '@domain/session';
import type { CommandMenu, SlashCommand } from '@domain/session';
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

describe('the slash command menu', () => {
  describe('what it hides — S-60', () => {
    it('hides an internal command by its prefix', () => {
      expect(isHidden(aCommand('__remote-workflow'))).toBe(true);
    });

    it('hides a removed command by its description', () => {
      expect(isHidden(aCommand('agents', { description: '(removed) Ask Claude to…' }))).toBe(true);
    });

    it('hides a renamed command by its description, whatever the case', () => {
      expect(isHidden(aCommand('extra-usage', { description: 'Renamed to /usage-credits' }))).toBe(
        true,
      );
      expect(isHidden(aCommand('old', { description: '  renamed to /new' }))).toBe(true);
    });

    it('keeps a command that only mentions a removal further on', () => {
      expect(isHidden(aCommand('prune', { description: 'Lists what was (removed) today' }))).toBe(
        false,
      );
    });

    it('keeps a command with an underscore that is not the prefix', () => {
      expect(isHidden(aCommand('my_command'))).toBe(false);
      expect(isHidden(aCommand('_single'))).toBe(false);
    });

    it('hides exactly the dead and the internal of the recorded installation', () => {
      const hidden = recorded()
        .filter(isHidden)
        .map((command) => command.name);

      // Measured on the real list: `agents` is `(removed)`, `extra-usage` is `Renamed to`, and
      // one name carries the internal prefix. Nothing is hidden by name.
      expect(hidden.sort()).toEqual(['__remote-workflow', 'agents', 'extra-usage']);
    });
  });

  describe('its order — D-05', () => {
    it('puts the suggested first, in the ranking order, and the rest by name', () => {
      const menu = menuOf(
        [aCommand('zeta'), aCommand('compact'), aCommand('alpha'), aCommand('init')],
        { suggested: ['init', 'compact'], pluginOrigins: {} },
      );

      expect(menu.map((command) => [command.name, command.suggested])).toEqual([
        ['init', true],
        ['compact', true],
        ['alpha', false],
        ['zeta', false],
      ]);
    });

    it('shows no suggestion the installation does not offer — S-30', () => {
      const menu = menuOf([aCommand('alpha')], { suggested: ['init'], pluginOrigins: {} });

      expect(menu.map((command) => command.name)).toEqual(['alpha']);
      expect(menu.some((command) => command.suggested)).toBe(false);
    });

    it('is empty for an installation that offers nothing — fron', () => {
      expect(menuOf([])).toEqual([]);
    });

    it('shows a name the CLI lists twice once, as the first row', () => {
      const menu = menuOf([
        aCommand('review', { description: 'first' }),
        aCommand('review', { description: 'second' }),
      ]);

      expect(menu).toHaveLength(1);
      expect(menu[0]?.description).toBe('first');
    });

    it('keeps every field the menu shows', () => {
      const [only] = menuOf([
        aCommand('loop', { argumentHint: '[interval] [prompt]', aliases: ['proactive'] }),
      ]);

      expect(only).toEqual({
        name: 'loop',
        description: 'the loop command',
        argumentHint: '[interval] [prompt]',
        aliases: ['proactive'],
        suggested: false,
        origin: 'project',
        label: 'loop',
        shadowed: false,
      });
    });
  });

  describe('reading a prompt', () => {
    it.each([
      ['/init', 'init'],
      ['/init   ', 'init'],
      ['  /init', 'init'],
      ['/code-review high --fix', 'code-review'],
      ['/plugin:skill do it', 'plugin:skill'],
      ['/loop\n5m', 'loop'],
    ])('reads %j as the command %j', (text, name) => {
      expect(commandIn(text)).toBe(name);
    });

    it.each([
      ['hello'],
      ['/'],
      ['/ init'],
      ['/tmp/build is empty'],
      ['/etc/hosts'],
      ['say /init'],
      ['/-dash'],
    ])('reads %j as no command at all', (text) => {
      expect(commandIn(text)).toBeNull();
    });
  });

  describe('whether the installation runs a name', () => {
    const commands = [aCommand('usage', { aliases: ['cost', 'stats'] }), aCommand('init')];

    it('answers yes for a name and for an alias', () => {
      expect(offers(commands, 'init')).toBe(true);
      expect(offers(commands, 'cost')).toBe(true);
    });

    it('answers no for a name nobody has', () => {
      expect(offers(commands, 'heapsnap')).toBe(false);
    });

    it('answers yes for a hidden command: hiding is not refusing', () => {
      expect(offers([aCommand('__remote-workflow')], '__remote-workflow')).toBe(true);
    });
  });

  describe('origins and collisions — plan 08, B-50', () => {
    const menu: CommandMenu = {
      suggested: [],
      pluginOrigins: { 'acme-user-skills': 'user', 'acme-system-skills': 'system' },
    };

    it('reads the origin from the marker and from a namespace the engine’s menu maps — S-241, S-242', () => {
      expect(originOf(aCommand('compact', { builtin: true }))).toBe('builtin');
      expect(originOf(aCommand('deploy'))).toBe('project');
      expect(originOf(aCommand('acme-user-skills:notes'), menu)).toBe('user');
      expect(originOf(aCommand('acme-system-skills:pdf'), menu)).toBe('system');
      expect(originOf(aCommand('other-plugin:lint'), menu)).toBe('project');
    });

    it.each([
      ['the Claude Code row first', true],
      ['the Claude Code row last', false],
    ])(
      'lists both rows of one name and covers the unmarked one, with %s — S-243',
      (_order, builtinFirst) => {
        const builtin = aCommand('review', { builtin: true });
        const project = aCommand('review', { description: "the project's" });
        const commandMenu = menuOf(builtinFirst ? [builtin, project] : [project, builtin]);

        expect(commandMenu.map((row) => [row.origin, row.shadowed])).toEqual([
          ['builtin', false],
          ['project', true],
        ]);
      },
    );

    it('keeps one row of a name listed twice with the same marker', () => {
      expect(menuOf([aCommand('init'), aCommand('init')])).toHaveLength(1);
    });
  });
});
