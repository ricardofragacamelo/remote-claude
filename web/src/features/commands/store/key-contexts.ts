import type { KeyContext } from '../types/command';

/** How many holders each context has — two screens may hold the same one for a moment. */
const holders = new Map<KeyContext, number>();

/**
 * Makes a context's shortcuts live — the workbench does while it is on screen.
 *
 * @returns the way to let go of it
 */
export function enterKeyContext(context: KeyContext): () => void {
  holders.set(context, (holders.get(context) ?? 0) + 1);
  let left = false;

  return () => {
    if (left) {
      return;
    }

    left = true;
    const remaining = (holders.get(context) ?? 1) - 1;

    if (remaining === 0) {
      holders.delete(context);
    } else {
      holders.set(context, remaining);
    }
  };
}

/** Whether a context's shortcuts are live now. `global` always is. */
export function isKeyContextActive(context: KeyContext): boolean {
  return context === 'global' || holders.has(context);
}
