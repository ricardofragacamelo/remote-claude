import { useCallback, useState } from 'react';

import { logger } from '@/shared/logging/logger';

/** Where a copy is: not tried, done, or refused by the browser. */
export type CopyState = 'idle' | 'copied' | 'failed';

/** The state of the last copy, and the way to make one. */
export interface Copy {
  readonly state: CopyState;

  /** Copies the text the hook was given — or, for a list of things to copy, the one named here. */
  copy(other?: string): void;
}

/**
 * Puts a text on the clipboard.
 *
 * The clipboard is refused often enough to plan for — an insecure origin, a permission the browser
 * withheld — and a button that did nothing looks like a button that worked. A refusal is kept, so the
 * screen can say "select it and copy it by hand" instead.
 */
export function useCopy(text = ''): Copy {
  const [state, setState] = useState<CopyState>('idle');

  const copy = useCallback(
    (other?: string) => {
      const clipboard = navigator.clipboard as Clipboard | undefined;

      if (clipboard === undefined) {
        logger.debug({ op: 'clipboard.write', outcome: 'unavailable' }, 'clipboard unavailable');
        setState('failed');
        return;
      }

      clipboard.writeText(other ?? text).then(
        () => {
          logger.debug({ op: 'clipboard.write', outcome: 'copied' }, 'copied to the clipboard');
          setState('copied');
        },
        (error: unknown) => {
          logger.debug(
            { op: 'clipboard.write', outcome: 'refused', err: String(error) },
            'clipboard refused',
          );
          setState('failed');
        },
      );
    },
    [text],
  );

  return { state, copy };
}
