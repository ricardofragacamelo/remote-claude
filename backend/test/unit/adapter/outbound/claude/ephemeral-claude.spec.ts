import { describe, expect, it } from 'vitest';
import type { Options, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { EphemeralClaude } from '@adapter/outbound/claude/ephemeral-claude';
import { openEphemeralQuery } from '@adapter/outbound/claude/ephemeral-query';
import { AgentSdkInstallationProbe } from '@adapter/outbound/claude/installation-probe.adapter';
import {
  AgentSdkModelCheck,
  MODEL_CHECK_PROMPT,
  MODEL_CHECK_TIMEOUT_MS,
} from '@adapter/outbound/claude/model-check.adapter';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { SessionRegistry } from '@application/session';
import {
  ClaudeTimeoutError,
  ClaudeUnavailableError,
  SessionLimitReachedError,
} from '@domain/session';
import { WorkspacePath } from '@domain/workspace';
import { loadInitialization } from '../../../../fakes/agent-sdk/fixture';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../../support/fakes/manual-scheduler';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const FOLDER = WorkspacePath.create('/srv/projects/app');

/** What a fake query was opened with, and how it was ended. */
interface Opened {
  options: Options | null;
  prompts: unknown[];
  closed: number;
}

/** A factory whose query replays `messages` and answers `initializationResult()` as told. */
function factoryOf(
  behaviour: {
    readonly messages?: readonly SDKMessage[];
    readonly init?: () => Promise<unknown>;
    readonly endsEarly?: boolean;
  } = {},
): { createQuery: QueryFactory; opened: Opened } {
  const opened: Opened = { options: null, prompts: [], closed: 0 };

  const createQuery: QueryFactory = ({ prompt, options }) => {
    opened.options = options;
    const iterator = prompt[Symbol.asyncIterator]();
    void iterator.next().then((first) => {
      if (first.done !== true) opened.prompts.push(first.value);
    });

    async function* stream(): AsyncGenerator<SDKMessage> {
      for (const message of behaviour.messages ?? []) {
        yield message;
      }
      if (behaviour.endsEarly !== true) {
        await new Promise(() => undefined);
      }
    }

    const query = Object.assign(stream(), {
      initializationResult:
        behaviour.init ?? (() => Promise.resolve(loadInitialization().initialization)),
      close: () => {
        opened.closed += 1;
      },
    });
    return query as unknown as Query;
  };

  return { createQuery, opened };
}

const registry = (limit = 4): SessionRegistry =>
  new SessionRegistry(limit, new FixedClock(new Date()));

/** What the first `PreToolUse` hook a query was opened with answers to a call. */
function firstHookOf(options: Options | null): Promise<unknown> {
  const hook = options?.hooks?.PreToolUse?.[0]?.hooks[0];
  return hook === undefined
    ? Promise.reject(new Error('no PreToolUse hook'))
    : hook({} as never, undefined, { signal: new AbortController().signal });
}

/** The probe, over the runner every query that only asks goes through. */
const probeOf = (
  createQuery: QueryFactory,
  capacity: SessionRegistry,
  scheduler: ManualScheduler,
  version: string | null,
): AgentSdkInstallationProbe => {
  const logger = new RecordingLogger().logger;
  return new AgentSdkInstallationProbe(
    new EphemeralClaude(createQuery, capacity, scheduler, logger),
    version,
    logger,
  );
};

describe('the probe of the installation — plan 13, B-10', () => {
  it('answers the initialisation, and closes the query and gives the slot back — S-17', async () => {
    const { createQuery, opened } = factoryOf();
    const capacity = registry();
    const probe = probeOf(createQuery, capacity, new ManualScheduler(), '2.1.277');

    const answer = await probe.probe(FOLDER);

    expect(answer.cliVersion).toBe('2.1.277');
    expect(answer.initialization.models.length).toBeGreaterThan(0);
    expect(answer.initialization.account.email).toBe('person@example.com');
    expect(opened.closed).toBe(1);
    expect(capacity.size).toBe(0);
  });

  it('opens under every option a session has, and narrower — S-22', async () => {
    const { createQuery, opened } = factoryOf();
    await probeOf(createQuery, registry(), new ManualScheduler(), null).probe(FOLDER);

    expect(opened.options).toMatchObject({
      cwd: FOLDER.value,
      settingSources: ['project'],
      strictMcpConfig: true,
      mcpServers: {},
      tools: [],
      persistSession: false,
      allowDangerouslySkipPermissions: false,
      settings: { disableSkillShellExecution: true },
    });
    expect(opened.options?.hooks?.PreToolUse?.[0]?.hooks).toHaveLength(1);
    await expect(opened.options?.canUseTool?.('Bash', {}, {} as never)).resolves.toMatchObject({
      behavior: 'deny',
    });
    await expect(firstHookOf(opened.options)).resolves.toMatchObject({
      hookSpecificOutput: { permissionDecision: 'deny' },
    });
    expect(opened.prompts).toEqual([]);
  });

  it('closes once, however many times it is told to', () => {
    const { createQuery, opened } = factoryOf();
    const ephemeral = openEphemeralQuery(createQuery, { cwd: FOLDER.value });

    ephemeral.close();
    ephemeral.close();

    expect(opened.closed).toBe(1);
  });

  it('refuses with no slot, and spawns nothing — S-21', async () => {
    const { createQuery, opened } = factoryOf();
    const full = registry(0);

    await expect(
      probeOf(createQuery, full, new ManualScheduler(), null).probe(FOLDER),
    ).rejects.toThrow(SessionLimitReachedError);
    expect(opened.options).toBeNull();
  });

  it('reads a failure of the CLI as unavailable, and a silence past the deadline as a timeout — S-20', async () => {
    const failing = factoryOf({ init: () => Promise.reject(new Error('boom')) });
    await expect(
      probeOf(failing.createQuery, registry(), new ManualScheduler(), null).probe(FOLDER),
    ).rejects.toThrow(ClaudeUnavailableError);
    expect(failing.opened.closed).toBe(1);

    const scheduler = new ManualScheduler();
    const silent = factoryOf({ init: () => new Promise(() => undefined) });
    const asked = probeOf(silent.createQuery, registry(), scheduler, null).probe(FOLDER);
    scheduler.fire();
    await expect(asked).rejects.toThrow(ClaudeTimeoutError);
  });
});

/** A result of a turn, as the CLI ends one. */
const result = (overrides: Record<string, unknown> = {}): SDKMessage =>
  ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    total_cost_usd: 0.0012,
    ...overrides,
  }) as unknown as SDKMessage;
const assistant = (overrides: Record<string, unknown> = {}): SDKMessage =>
  ({
    type: 'assistant',
    message: { model: 'claude-sonnet-5' },
    ...overrides,
  }) as unknown as SDKMessage;

const check = (
  messages: readonly SDKMessage[],
  endsEarly = false,
  scheduler = new ManualScheduler(),
) => {
  const factory = factoryOf({ messages, endsEarly });
  const capacity = registry();
  return {
    ...factory,
    capacity,
    check: new AgentSdkModelCheck(
      new EphemeralClaude(factory.createQuery, capacity, scheduler, new RecordingLogger().logger),
      { maxBudgetUsd: 0.05, cwd: '/srv', timeoutMs: MODEL_CHECK_TIMEOUT_MS },
      new RecordingLogger().logger,
    ),
  };
};

describe('the test of the connection — plan 13, B-12', () => {
  it('runs one turn with no tool under a ceiling, and says the model, the latency and the cost — S-30', async () => {
    const run = check([assistant(), result()]);

    const outcome = await run.check.run('sonnet');

    expect(outcome).toMatchObject({
      result: 'ok',
      model: 'claude-sonnet-5',
      costUsd: 0.0012,
      reason: null,
    });
    expect(run.opened.options).toMatchObject({
      tools: [],
      maxTurns: 1,
      maxBudgetUsd: 0.05,
      model: 'sonnet',
    });
    expect(run.opened.prompts).toEqual([
      expect.objectContaining({ message: { role: 'user', content: MODEL_CHECK_PROMPT } }),
    ]);
    expect(run.opened.closed).toBe(1);
    expect(run.capacity.size).toBe(0);
  });

  it('says not signed in, rate limited, or failed, as a result of the test — S-31', async () => {
    expect(
      (
        await check([
          assistant({ error: 'authentication_failed' }),
          result({ is_error: true }),
        ]).check.run(null)
      ).result,
    ).toBe('notLoggedIn');
    expect(
      (await check([assistant({ error: 'rate_limit' }), result()]).check.run(null)).result,
    ).toBe('rateLimited');
    expect(
      await check([assistant({ error: 'server_error' }), result()]).check.run(null),
    ).toMatchObject({ result: 'failed', reason: 'server_error' });
    expect(
      await check([result({ subtype: 'error_max_budget_usd' })]).check.run(null),
    ).toMatchObject({ result: 'failed', reason: 'error_max_budget_usd' });
  });

  it('reads a stream that ended with no result as a CLI that died — S-31', async () => {
    await expect(check([assistant()], true).check.run(null)).rejects.toThrow(
      ClaudeUnavailableError,
    );
  });

  it('ends the subprocess of a test that does not finish in time — S-32', async () => {
    const scheduler = new ManualScheduler();
    const run = check([], false, scheduler);

    const running = run.check.run(null);
    scheduler.fire();

    await expect(running).rejects.toThrow(ClaudeTimeoutError);
    expect(run.opened.closed).toBe(1);
  });
});
