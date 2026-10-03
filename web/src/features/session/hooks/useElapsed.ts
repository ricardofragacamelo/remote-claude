import { useState } from 'react';

import { useClock } from '@/shared/hooks/useClock';

/**
 * The whole seconds since `since` — or since the component first asked, when the instant is not
 * known —, read again every second.
 *
 * The clock lives in the indicator that shows it, never in the conversation above it (plan 09, R-07).
 */
export function useElapsed(since: string | null): number {
  const [mounted] = useState(() => Date.now());
  const now = useClock();
  const parsed = since === null ? Number.NaN : new Date(since).getTime();
  const start = Number.isNaN(parsed) ? mounted : parsed;

  return Math.max(0, Math.floor((now - start) / 1_000));
}
