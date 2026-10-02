import type { MentionMenu, MentionOption, SlashMenu } from '../hooks/useCompletionMenus';
import type { SlashCommand } from '../types/command';
import type { ContextItem } from '../types/context';
import type { Completion } from './composer-tokens';
import { itemId, UNCHECKED } from './context-set';

/**
 * What the menus of the composer do with a key, an option and a choice — pure, so every case is
 * proved without a screen (plan 08, B-48, B-50).
 */

/** What a key does to an open menu — or `null` when it is the box's, and the menu lets it be. */
export type MenuKey =
  | { readonly kind: 'move'; readonly to: number }
  | { readonly kind: 'pick' }
  | { readonly kind: 'close' };

export function menuKey(key: string, shift: boolean, index: number, count: number): MenuKey | null {
  switch (key) {
    case 'ArrowDown':
      return { kind: 'move', to: count === 0 ? 0 : (index + 1) % count };
    case 'ArrowUp':
      return { kind: 'move', to: count === 0 ? 0 : (index + count - 1) % count };
    case 'Enter':
    case 'Tab':
      return index === -1 || shift ? null : { kind: 'pick' };
    case 'Escape':
      return { kind: 'close' };
    default:
      return null;
  }
}

export function countOf(open: Completion | null, mention: MentionMenu, slash: SlashMenu): number {
  if (open === null) {
    return 0;
  }

  return open.kind === 'mention' ? mention.options.length : slash.commands.length;
}

/** The hint of what the command just chosen takes — while the box holds only `/name `. */
export function hintOf(chosen: SlashCommand | null, text: string): string | null {
  return chosen !== null && chosen.argumentHint !== '' && text === `/${chosen.name} `
    ? chosen.argumentHint
    : null;
}

/** What an option of the `@` menu adds to the set. */
export function itemsOf(option: MentionOption): readonly ContextItem[] {
  switch (option.kind) {
    case 'provider':
      return option.items;
    case 'typed':
      // Validated on the send, by the backend, in the session's folder (S-230, S-232).
      return [{ id: itemId(), kind: 'file', path: option.path, ...UNCHECKED }];
    default:
      return option.entry.kind === 'folder'
        ? [{ id: itemId(), kind: 'folder', path: option.entry.path }]
        : [{ id: itemId(), kind: 'file', path: option.entry.path, ...UNCHECKED }];
  }
}
