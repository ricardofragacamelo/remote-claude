import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { AppError } from '@/shared/api/errors';
import type { BatchItemResult, BatchTarget } from '@/shared/lib/settled-batch';
import { settledBatch } from '@/shared/lib/settled-batch';
import { mcpErrorOf } from '../lib/mcp-errors';
import {
  createMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  testMcpServer,
  updateMcpServer,
} from '../services/mcp.service';
import type { McpServerFields, McpServerView, McpTestOutcome } from '../types/mcp';
import { mcpKeys } from './mcp-keys';

export type { BatchItemResult, BatchTarget } from '@/shared/lib/settled-batch';

/** The result of testing one server's connection, kept beside its own row. */
export interface TestResult extends BatchTarget {
  readonly outcome?: McpTestOutcome;
  readonly error?: AppError;
}

/** Every write this feature makes against the store of MCP servers (plan 13, B-28). */
export interface McpServerMutations {
  create(fields: McpServerFields): Promise<McpServerView>;
  update(id: string, fields: McpServerFields): Promise<McpServerView>;
  remove(id: string): Promise<void>;

  /** Turns one or many servers on or off — a partial failure never stops the others (S-134). */
  setEnabled(
    servers: readonly BatchTarget[],
    enabled: boolean,
  ): Promise<readonly BatchItemResult[]>;

  /** Removes one or many — same partial-failure contract as {@link setEnabled}. */
  removeMany(servers: readonly BatchTarget[]): Promise<readonly BatchItemResult[]>;

  /** Tests one or many connections; each result is kept against its own id until cleared. */
  test(servers: readonly BatchTarget[]): Promise<void>;

  readonly testResults: ReadonlyMap<string, TestResult>;
  clearTestResults(): void;

  readonly saving: boolean;
  readonly saveError: AppError | null;
}

/**
 * Every write this screen makes (plan 13, B-28): a settled save, never optimistic — the server
 * checks the configuration and the list is read again. Bulk actions run one request per server and
 * report each outcome on its own, so a server refused (`FORBIDDEN`, say) never stops the rest
 * (S-134).
 */
export function useMcpServerMutations(engine: string): McpServerMutations {
  const queryClient = useQueryClient();
  const [testResults, setTestResults] = useState<ReadonlyMap<string, TestResult>>(new Map());

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: mcpKeys.servers(engine) });

  const create = useMutation<McpServerView, AppError, McpServerFields>({
    mutationFn: (fields) => createMcpServer(engine, fields),
    onSuccess: invalidate,
  });
  const update = useMutation<McpServerView, AppError, { id: string; fields: McpServerFields }>({
    mutationFn: ({ id, fields }) => updateMcpServer(engine, id, fields),
    onSuccess: invalidate,
  });
  const remove = useMutation<void, AppError, string>({
    mutationFn: (id) => removeMcpServer(engine, id),
    onSuccess: invalidate,
  });
  const toggle = useMutation<McpServerView, AppError, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) => setMcpServerEnabled(engine, id, enabled),
    onSuccess: invalidate,
  });

  return {
    create: (fields) => create.mutateAsync(fields),
    update: (id, fields) => update.mutateAsync({ id, fields }),
    remove: (id) => remove.mutateAsync(id),
    setEnabled: async (servers, enabled) => {
      const results = await settledBatch(
        servers,
        (server) => toggle.mutateAsync({ id: server.id, enabled }),
        mcpErrorOf,
      );
      await invalidate();
      return results;
    },
    removeMany: async (servers) => {
      const results = await settledBatch(
        servers,
        (server) => remove.mutateAsync(server.id),
        mcpErrorOf,
      );
      await invalidate();
      return results;
    },
    test: async (servers) => {
      // The server travels with its own result, settled in the same `async` call that fetched
      // it — never re-paired by index afterwards, so there is no mismatch to guard against.
      const outcomes = await Promise.all(
        servers.map(async (server) => {
          try {
            return { server, outcome: await testMcpServer(engine, server.id) };
          } catch (error) {
            return { server, outcome: undefined, error: mcpErrorOf(error) };
          }
        }),
      );
      setTestResults((current) => {
        const next = new Map(current);
        for (const result of outcomes) {
          next.set(
            result.server.id,
            result.error === undefined
              ? { ...result.server, outcome: result.outcome }
              : { ...result.server, error: result.error },
          );
        }
        return next;
      });
    },
    testResults,
    clearTestResults: () => {
      setTestResults(new Map());
    },
    saving: create.isPending || update.isPending || remove.isPending || toggle.isPending,
    saveError: create.error ?? update.error ?? remove.error ?? toggle.error,
  };
}
