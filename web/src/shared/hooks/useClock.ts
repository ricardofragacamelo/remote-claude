import { useEffect, useState } from 'react';

/** How often the clock is read again. A second is what a person perceives as a clock. */
const TICK_MS = 1_000;

/**
 * The time now, read again every second while `running` — a countdown, the time a turn has run.
 *
 * The clock lives in the component that shows it, and in nothing above it: a screen that re-rendered
 * every second for a counter in a corner would be a screen that flickers.
 */
export function useClock(running = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) {
      return;
    }

    const timer = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);

    return () => {
      clearInterval(timer);
    };
  }, [running]);

  return now;
}
