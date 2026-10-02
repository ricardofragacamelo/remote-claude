import { useId, useState } from 'react';

import { useMentionMenu, useSlashMenu } from './useCompletionMenus';
import type { MentionMenu, SlashMenu } from './useCompletionMenus';
import type { ContextSet } from './useContextSet';
import { completionAt, replaceCompletion } from '../lib/composer-tokens';
import type { Completion } from '../lib/composer-tokens';
import { countOf, hintOf, itemsOf, menuKey } from '../lib/completion-keys';
import type { SlashCommand } from '../types/command';

/** Replaces what is written in the box, and puts its cursor at `at`. */
type Write = (text: string, at: number) => void;

/** The menus of the box, as the box drives them. */
export interface Completions {
  readonly open: Completion | null;
  readonly listId: string;
  readonly activeId: string | null;
  readonly active: number;
  readonly mention: MentionMenu;
  readonly slash: SlashMenu;

  /** The hint of the arguments of the command just chosen, while it is all the box holds (S-248). */
  readonly hint: string | null;
  pick(index: number, text: string, cursor: number, write: Write): void;

  /** The text changed: a menu closed by `Esc` opens again for the next `@` or `/` typed. */
  edited(text: string, cursor: number): void;

  /** Handles a key of the box when a menu is open — `true` when it did. */
  keyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    text: string,
    cursor: number,
    write: Write,
  ): boolean;
}

/**
 * The `@` and `/` menus of the box (plan 08, B-48, B-50): what the cursor is completing, the option
 * the arrows are on, and what choosing one does. `Esc` closes the menu and leaves the text (S-227).
 */
export function useCompletions(
  context: ContextSet | undefined,
  folder: string,
  sessionId: string | null,
  text: string,
  cursor: number,
): Completions {
  const listId = useId();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<SlashCommand | null>(null);
  const found = context === undefined ? null : completionAt(text, cursor);
  const signature = signatureOf(found);
  const open = signature !== dismissed ? found : null;
  const mention = useMentionMenu(folder, open?.kind === 'mention' ? open.query : null);
  const slash = useSlashMenu(folder, sessionId, open?.kind === 'command' ? open.query : null);
  const count = countOf(open, mention, slash);
  const index = count === 0 ? -1 : Math.min(active, count - 1);

  const pick = (at: number, current: string, caret: number, write: Write): void => {
    if (open !== null && context !== undefined) {
      pickIn({ open, mention, slash, context, setChosen }, at, current, caret, write);
    }
    setActive(0);
  };

  return {
    open,
    listId,
    active: index,
    activeId: open === null || index === -1 ? null : `${listId}-${String(index)}`,
    mention,
    slash,
    hint: hintOf(chosen, text),
    pick,
    edited: (current, caret) => {
      if (completionAt(current, caret) === null) {
        setDismissed(null);
      }
    },
    keyDown: (event, current, caret, write) => {
      const handled = open === null ? null : menuKey(event.key, event.shiftKey, index, count);

      if (handled === null) {
        setActive(0);
        return false;
      }

      event.preventDefault();
      if (handled.kind === 'move') {
        setActive(handled.to);
      } else if (handled.kind === 'pick') {
        pick(index, current, caret, write);
      } else {
        // Closed, the text left as it was — and the `Esc` of the box does not fire (S-183).
        setDismissed(signature);
      }
      return true;
    },
  };
}

/** Which completion this is — the same `@` or `/` at the same place is the same one. */
function signatureOf(found: Completion | null): string | null {
  return found === null ? null : `${found.kind}:${String(found.start)}`;
}

/** What choosing an option needs. */
interface Picking {
  readonly open: Completion;
  readonly mention: MentionMenu;
  readonly slash: SlashMenu;
  readonly context: ContextSet;
  setChosen(command: SlashCommand): void;
}

/** Chooses the option `at`: a command is written into the box, a mention becomes a chip. */
function pickIn(picking: Picking, at: number, current: string, caret: number, write: Write): void {
  const { open } = picking;
  const command = open.kind === 'command' ? picking.slash.commands[at] : undefined;
  const option = open.kind === 'mention' ? picking.mention.options[at] : undefined;

  if (command !== undefined) {
    const next = replaceCompletion(current, caret, open, `/${command.name} `);
    picking.setChosen(command);
    write(next.text, next.cursor);
  } else if (option !== undefined) {
    picking.context.add(itemsOf(option));
    const next = replaceCompletion(current, caret, open, '');
    write(next.text, next.cursor);
  }
}
