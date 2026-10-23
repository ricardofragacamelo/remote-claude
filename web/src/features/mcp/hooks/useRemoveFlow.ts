import { useState } from 'react';

import type { BatchItemResult, McpServerMutations } from './useMcpServerMutations';
import type { McpServerView } from '../types/mcp';

/** The destructive confirm of removing one or many servers (plan 13, B-28, S-135). */
export interface RemoveFlow {
  readonly targets: readonly McpServerView[] | null;
  readonly pending: boolean;
  ask(targets: readonly McpServerView[]): void;
  confirm(): Promise<readonly BatchItemResult[]>;
  cancel(): void;
}

/**
 * Removing is destructive and for good — a confirm with no undo (S-135), unlike the explorer's own
 * delete (which keeps what it can in a local history): an MCP server is one row, and its secret, if
 * it has one, is already gone the moment the row is. A batch of more than one is one confirm, one
 * request per server, each outcome told on its own (S-134).
 */
export function useRemoveFlow(mutations: McpServerMutations): RemoveFlow {
  const [targets, setTargets] = useState<readonly McpServerView[] | null>(null);
  const [pending, setPending] = useState(false);

  return {
    targets,
    pending,
    ask: (next) => {
      setTargets(next);
    },
    confirm: async () => {
      if (targets === null) {
        return [];
      }
      setPending(true);
      try {
        const results = await mutations.removeMany(targets);
        setTargets(null);
        return results;
      } finally {
        setPending(false);
      }
    },
    cancel: () => {
      if (!pending) {
        setTargets(null);
      }
    },
  };
}
