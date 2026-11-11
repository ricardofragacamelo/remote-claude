import { useEffect, useState } from 'react';

/**
 * A value that settles a moment after it stops changing — what a request after every keystroke
 * would otherwise be, such as the rule-authoring wizard's own live preview (plan 15, B-27, S-185).
 *
 * The very first value is returned immediately, never delayed: a field that already has one from a
 * hand-off (the folder's own existing rules, say) shows it at once, not after a wasted wait.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs, debounced]);

  return debounced;
}
