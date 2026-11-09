import { useCallback, useState } from 'react';

export interface RuleListNavHandlers {
  onOpen(ruleId: string): void;
  onToggleSelected(ruleId: string): void;
  onRevoke(ruleId: string): void;
}

export interface RuleListNav {
  /** The row the keyboard moved to — `null` until the list is first given focus. */
  readonly focusedId: string | null;

  onKeyDown(event: React.KeyboardEvent): void;

  /** Loses the keyboard's own focus without taking the page's away — a click elsewhere already does. */
  clear(): void;
}

/**
 * Arrow keys and `j`/`k` move a focus of their own across the rows on screen, Space selects the one
 * focused, Enter opens its detail, Esc drops the focus, and `Delete` revokes it directly — the same
 * one click a mouse already has on the row (S-168).
 *
 * The focus here is never the table's own tab order: a row is not a button, and a list where every
 * row is one more Tab stop is a list nobody reaches the end of by keyboard. One `tabIndex="0"` on the
 * list itself receives the key events instead, and this hook is where they are read.
 */
export function useRuleListNav(ids: readonly string[], handlers: RuleListNavHandlers): RuleListNav {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const move = useCallback(
    (delta: number) => {
      setFocusedId((current) => {
        if (ids.length === 0) {
          return null;
        }

        const at = current === null ? -1 : ids.indexOf(current);
        const next = Math.min(Math.max(at + delta, 0), ids.length - 1);

        return ids[next] ?? null;
      });
    },
    [ids],
  );

  /** One action per key the list answers to — a lookup instead of a long `switch`, so adding a key
   * later (S-168's own list) is one more entry, never one more branch to keep under the complexity
   * ceiling. A key with nothing focused to act on is simply absent, and falls through to nothing. */
  const actionsOf = useCallback(
    (focused: string | null): Readonly<Record<string, () => void>> => {
      const onFocused = (run: (id: string) => void): (() => void) | undefined =>
        focused === null
          ? undefined
          : () => {
              run(focused);
            };
      const entry = (key: string, action: (() => void) | undefined) =>
        action === undefined ? {} : { [key]: action };

      return {
        ArrowDown: () => {
          move(1);
        },
        j: () => {
          move(1);
        },
        ArrowUp: () => {
          move(-1);
        },
        k: () => {
          move(-1);
        },
        Escape: () => {
          setFocusedId(null);
        },
        ...entry(' ', onFocused(handlers.onToggleSelected)),
        ...entry('Spacebar', onFocused(handlers.onToggleSelected)),
        ...entry('Enter', onFocused(handlers.onOpen)),
        ...entry('Delete', onFocused(handlers.onRevoke)),
        ...entry('Backspace', onFocused(handlers.onRevoke)),
      };
    },
    [handlers, move],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const action = actionsOf(focusedId)[event.key];

      if (action === undefined) {
        return;
      }

      event.preventDefault();
      action();
    },
    [actionsOf, focusedId],
  );

  const clear = useCallback(() => {
    setFocusedId(null);
  }, []);

  return { focusedId, onKeyDown, clear };
}
