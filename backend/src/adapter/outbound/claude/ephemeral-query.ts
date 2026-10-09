import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

import { claudeEnvironment } from './claude-environment';
import { flagSettings } from './flag-settings';
import { markedEnvironment } from './process-marker';
import type { QueryFactory } from './query.factory';
import { clearTrustMark } from './trusted-directory';

/** What a query that only asks is opened with, beyond what every one of them has. */
export interface EphemeralQueryInput {
  readonly cwd: string;

  /** One prompt to send — the test of the connection — or none, for a probe that only asks. */
  readonly prompt?: string;
  readonly model?: string | null;
  readonly maxTurns?: number;
  readonly maxBudgetUsd?: number;
}

/** A query that only asks, and how to end it. */
export interface EphemeralQuery {
  readonly query: Query;

  /** Closes it and releases its subprocess. Safe to call twice. */
  close(): void;
}

/** A refusal, for anything that would run: a probe and a test of the connection run no tool. */
const REFUSAL = 'a query that only asks runs no tool';

/**
 * A query that never takes a prompt, or takes one, and runs **no tool** — the probe of the
 * installation and the test of the connection (plan 13, B-10, B-12).
 *
 * Opened through the factory with every option a session has — `settingSources: ['project']`, the
 * `PreToolUse` hook, `canUseTool`, `strictMcpConfig` with no server, the flag layer from its builder,
 * an environment without the backend's configuration, the trust mark of the folder cleared — and
 * then narrower: the hook and the callback both refuse, `tools` is empty, and nothing is persisted,
 * so no transcript is written for a question nobody asked Claude (D-05).
 */
export function openEphemeralQuery(
  createQuery: QueryFactory,
  input: EphemeralQueryInput,
): EphemeralQuery {
  const abort = new AbortController();
  let closed = false;

  clearTrustMark(input.cwd);

  const query = createQuery({
    prompt: promptOf(input.prompt, abort.signal),
    options: {
      cwd: input.cwd,
      permissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      tools: [],
      strictMcpConfig: true,
      mcpServers: {},
      settings: flagSettings(),
      persistSession: false,
      env: markedEnvironment(claudeEnvironment(process.env), process.pid),
      abortController: abort,
      ...(input.model == null ? {} : { model: input.model }),
      ...(input.maxTurns === undefined ? {} : { maxTurns: input.maxTurns }),
      ...(input.maxBudgetUsd === undefined ? {} : { maxBudgetUsd: input.maxBudgetUsd }),
      // Written here, in the arguments, where a reviewer and `pnpm scan:security` look for them.
      settingSources: ['project'],
      canUseTool: () => Promise.resolve({ behavior: 'deny', message: REFUSAL }),
      hooks: {
        PreToolUse: [
          {
            hooks: [
              () =>
                Promise.resolve({
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'deny',
                    permissionDecisionReason: REFUSAL,
                  },
                }),
            ],
          },
        ],
      },
    } satisfies Options,
  });

  return {
    query,
    close: () => {
      if (closed) return;
      closed = true;
      try {
        query.close();
      } finally {
        abort.abort();
      }
    },
  };
}

/** The one prompt, or an input that never yields: the CLI waits for a prompt that never comes. */
async function* promptOf(
  text: string | undefined,
  signal: AbortSignal,
): AsyncGenerator<SDKUserMessage> {
  if (text !== undefined) {
    yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null };
  }

  await new Promise<void>((resolve) => {
    signal.addEventListener('abort', () => {
      resolve();
    });
  });
}
