import { useMemo } from 'react';

import { usePermissionQueue } from '@/features/permission';
import type { PermissionOutcome, PermissionQueue, PermissionRequest } from '@/features/permission';

/** The questions of a session, found by the tool each is about (plan 09, B-23). */
export interface InlineRequests extends PermissionQueue {
  /** The request still open about each tool. */
  readonly byTool: ReadonlyMap<string, PermissionRequest>;

  /** How the request about each tool was settled — the line its card became. */
  readonly settledByTool: ReadonlyMap<string, PermissionOutcome>;
}

/**
 * The permission queue of a session, laid out the way the conversation draws it: each request in
 * the place of the tool it asks about, by `toolUseId`, and each settled one as the decision on that
 * tool's line. The queue is still the source ([D-12](../../../../../docs/plans/09-chat-layout/decisions.md#f4--inline));
 * this only finds things in it.
 */
export function useInlineRequests(sessionId: string | null): InlineRequests {
  const queue = usePermissionQueue(sessionId);
  const { pending, settled } = queue;

  const byTool = useMemo(
    () => new Map(pending.map((request) => [request.toolUseId, request] as const)),
    [pending],
  );
  const settledByTool = useMemo(
    () =>
      new Map(
        settled.flatMap((outcome) =>
          outcome.toolUseId === null ? [] : [[outcome.toolUseId, outcome] as const],
        ),
      ),
    [settled],
  );

  return { ...queue, byTool, settledByTool };
}
