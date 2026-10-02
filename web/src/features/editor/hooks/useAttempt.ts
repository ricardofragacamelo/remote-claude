import { useCallback, useState } from 'react';

/** Which read is the current one, and the way to make another — "try again". */
export interface Attempt {
  /** Changes with what is read, and with every retry: an answer to another key is stale. */
  readonly key: string;
  retry(): void;
}

/**
 * The key of a read that a retry starts over — what lets a hook keep its answer **with** the key it
 * answered, and show only the answer of the current read, instead of resetting its state inside an
 * effect.
 */
export function useAttempt(...parts: readonly string[]): Attempt {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  return { key: [...parts, String(attempt)].join('\n'), retry };
}
