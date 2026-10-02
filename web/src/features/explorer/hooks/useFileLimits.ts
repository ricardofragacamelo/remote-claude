import { useQuery } from '@tanstack/react-query';

import { fetchLimits } from '../services/transfer.service';
import type { FileLimits } from '../types/transfer';

/** The key of the ceilings in the query cache — one for the app: they are the server's, not a folder's. */
export const LIMITS_KEY = ['files', 'limits'] as const;

/**
 * The ceilings of the files routes, read **once** and kept (07 · D-16): a transfer is checked against
 * them before it starts, and the help says them. `null` until they are read — or when they could not
 * be: the server still refuses what is past them, saying the ceiling.
 */
export function useFileLimits(): FileLimits | null {
  const { data } = useQuery({ queryKey: LIMITS_KEY, queryFn: fetchLimits, staleTime: Infinity });
  return data ?? null;
}
