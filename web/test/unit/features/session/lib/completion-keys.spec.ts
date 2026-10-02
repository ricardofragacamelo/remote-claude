import { describe, expect, it } from 'vitest';

import { countOf, hintOf, itemsOf, menuKey } from '@/features/session/lib/completion-keys';
import type { MentionMenu, SlashMenu } from '@/features/session/hooks/useCompletionMenus';
import type { SlashCommand } from '@/features/session/types/command';

const command = (name: string, argumentHint = ''): SlashCommand => ({
  name,
  invocation: `/${name}`,
  description: '',
  argumentHint,
  aliases: [],
  suggested: false,
  origin: 'builtin',
  label: name,
  shadowed: false,
});

describe('the keys of an open menu — plan 08, S-227', () => {
  it('moves down and up, going round at the ends, and stays put with nothing listed', () => {
    expect(menuKey('ArrowDown', false, 2, 3)).toEqual({ kind: 'move', to: 0 });
    expect(menuKey('ArrowUp', false, 0, 3)).toEqual({ kind: 'move', to: 2 });
    expect(menuKey('ArrowDown', false, -1, 0)).toEqual({ kind: 'move', to: 0 });
    expect(menuKey('ArrowUp', false, -1, 0)).toEqual({ kind: 'move', to: 0 });
  });

  it('chooses with Enter and Tab — not with Shift, nor with nothing listed — and closes with Esc', () => {
    expect(menuKey('Enter', false, 0, 1)).toEqual({ kind: 'pick' });
    expect(menuKey('Tab', false, 0, 1)).toEqual({ kind: 'pick' });
    expect(menuKey('Tab', true, 0, 1)).toBeNull();
    expect(menuKey('Enter', false, -1, 0)).toBeNull();
    expect(menuKey('Escape', false, 0, 1)).toEqual({ kind: 'close' });
    expect(menuKey('a', false, 0, 1)).toBeNull();
  });
});

describe('what a menu lists and hints — plan 08, S-248', () => {
  const mention = { options: [{}, {}] } as unknown as MentionMenu;
  const slash = { commands: [command('a')] } as unknown as SlashMenu;

  it('counts the options of the menu that is open', () => {
    expect(countOf(null, mention, slash)).toBe(0);
    expect(countOf({ kind: 'mention', start: 0, query: '' }, mention, slash)).toBe(2);
    expect(countOf({ kind: 'command', start: 0, query: '' }, mention, slash)).toBe(1);
  });

  it('hints the arguments of the command chosen while the box holds only its name', () => {
    expect(hintOf(command('review', '[pr]'), '/review ')).toBe('[pr]');
    expect(hintOf(command('review', '[pr]'), '/review 12')).toBeNull();
    expect(hintOf(command('init'), '/init ')).toBeNull();
    expect(hintOf(null, '/x ')).toBeNull();
  });

  it('makes a chip of a file, a folder, a provider and a typed path — S-230', () => {
    const range = {
      id: 'r',
      kind: 'range',
      path: 'a',
      startLine: 1,
      endLine: 1,
      size: null,
      binary: false,
      missing: false,
    } as const;

    expect(itemsOf({ kind: 'provider', id: 'p', provider: {} as never, items: [range] })).toEqual([
      range,
    ]);
    expect(itemsOf({ kind: 'typed', id: 't', path: '../x' })[0]).toMatchObject({
      kind: 'file',
      path: '../x',
    });
    expect(
      itemsOf({
        kind: 'entry',
        id: 'e',
        entry: { path: 'src', name: 'src', kind: 'folder' },
        open: false,
      })[0],
    ).toMatchObject({ kind: 'folder', path: 'src' });
    expect(
      itemsOf({
        kind: 'entry',
        id: 'e',
        entry: { path: 'a.ts', name: 'a.ts', kind: 'file' },
        open: true,
      })[0],
    ).toMatchObject({ kind: 'file', path: 'a.ts', size: null });
  });
});
