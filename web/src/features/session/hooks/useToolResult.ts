import { useQuery } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import { unfoldedOf } from './loaded';
import { fetchToolResult } from '../services/transcript-content.service';
import type { ToolOutput } from '../services/transcript-content.service';

export type { ToolOutput } from '../services/transcript-content.service';

/** The whole output of a tool, once asked for — or why it did not come. */
export interface ToolResult {
  readonly output: ToolOutput | null;
  readonly isLoading: boolean;
  readonly error: AppError | null;
  retry(): void;
}

/**
 * The whole output of one tool, read from the transcript when its row is unfolded (plan 22, B-29) —
 * **once** per tool: the answer is kept for as long as the row is on screen, so folding and unfolding
 * it again asks nothing (S-113). The output of a finished tool does not change, so it is never stale.
 * A failure is not retried behind the person's back: the row keeps the end it had, and offers "try
 * again" (S-115).
 *
 * @param enabled the row is unfolded, and its tool has a result to read — never while it runs (S-116)
 */
export function useToolResult(
  conversationId: string | null,
  toolUseId: string,
  enabled: boolean,
): ToolResult {
  const query = useQuery<ToolOutput, AppError>({
    queryKey: ['toolResult', conversationId, toolUseId],
    queryFn: ({ signal }) => fetchToolResult(String(conversationId), toolUseId, signal),
    enabled: enabled && conversationId !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const { data, ...loaded } = unfoldedOf(query);

  return { output: data, ...loaded };
}
