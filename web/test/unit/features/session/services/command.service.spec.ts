import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchCommands, searchCommands } from '@/features/session/services/command.service';
import type { SlashCommand } from '@/features/session/types/command';
import { api } from '@/shared/api/api';
import { aCommandDto, aCommandMenu, aWireError, SESSION } from '../../../../support/session-tools';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchCommands — plan 04, B-15', () => {
  it('asks the live session for the commands of its installation', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(aCommandMenu());

    await fetchCommands('a/b');

    expect(get).toHaveBeenCalledWith('/sessions/a%2Fb/commands');
  });

  it('answers every command, in the order the backend gave, with its slash — S-29', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aCommandMenu());

    const menu = await fetchCommands(SESSION);

    expect(menu.cliVersion).toBe('2.1.277');
    expect(menu.commands.map((command) => command.invocation)).toEqual([
      '/init',
      '/review',
      '/compact',
      '/cost',
    ]);
    expect(menu.commands[2]).toEqual({
      name: 'compact',
      invocation: '/compact',
      description: 'Summarise the conversation',
      argumentHint: '',
      aliases: ['squash'],
      suggested: false,
    });
  });

  it('shows fewer when the installation offers fewer — no list of ours fills the gap, S-30', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(aCommandMenu([aCommandDto('cost')], null));

    const menu = await fetchCommands(SESSION);

    expect(menu).toEqual({
      cliVersion: null,
      commands: [expect.objectContaining({ name: 'cost' })],
    });
  });

  it('drops an entry it cannot read, and keeps the rest', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      cliVersion: '',
      commands: [
        'init',
        { description: 'no name' },
        { name: 'kept', aliases: ['k', 3, null], suggested: 'yes' },
      ],
    });

    const menu = await fetchCommands(SESSION);

    expect(menu.cliVersion).toBeNull();
    expect(menu.commands).toEqual([
      {
        name: 'kept',
        invocation: '/kept',
        description: '',
        argumentHint: '',
        aliases: ['k'],
        suggested: false,
      },
    ]);
  });

  it('reads a body without a list as an empty menu', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ cliVersion: 7, commands: 'none' });

    expect(await fetchCommands(SESSION)).toEqual({ cliVersion: null, commands: [] });
  });

  it('lets the failure of the SDK reach the caller as it came — S-31', async () => {
    const failure = aWireError('CLAUDE_UNAVAILABLE', 'session.error.claudeUnavailable');
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchCommands(SESSION)).rejects.toBe(failure);
  });
});

describe('searchCommands', () => {
  const command = (name: string, extra: Partial<SlashCommand> = {}): SlashCommand => ({
    name,
    invocation: `/${name}`,
    description: '',
    argumentHint: '',
    aliases: [],
    suggested: false,
    ...extra,
  });

  const all = [
    command('init', { suggested: true, description: 'Initialise AGENTS.md' }),
    command('review', { suggested: true }),
    command('compact', { aliases: ['squash'] }),
    command('cost', { description: 'Show what the session COST so far' }),
  ];

  const names = (commands: readonly SlashCommand[]): string[] => commands.map((c) => c.name);

  it('splits the menu into the suggested on top and every other below, keeping the order', () => {
    const groups = searchCommands(all, '');

    expect(names(groups.suggested)).toEqual(['init', 'review']);
    expect(names(groups.others)).toEqual(['compact', 'cost']);
  });

  it.each([
    ['by name', 'rev', ['review']],
    ['ignoring a leading slash and the case', '  /INI ', ['init']],
    ['by alias', 'squash', ['compact']],
    ['by description', 'agents.md', ['init']],
    ['across both groups', 'co', ['compact', 'cost']],
    ['finding nothing', 'heapdump', []],
  ])('searches %s', (_case, search, expected) => {
    const groups = searchCommands(all, search);

    expect([...names(groups.suggested), ...names(groups.others)]).toEqual(expected);
  });

  it('treats a search of spaces as no search at all', () => {
    expect(searchCommands(all, '   ').others).toHaveLength(2);
  });
});
