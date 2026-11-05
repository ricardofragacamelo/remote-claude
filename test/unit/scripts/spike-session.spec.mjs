import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { repoRoot } from '../../../scripts/lib/paths.mjs';
import {
  copyCredential,
  hookSighting,
  importAgentSdk,
  makeThrowawayWorld,
  openSpike,
  runInWorld,
  runNamedSpike,
  runSpike,
  permissionSighting,
  runProbes,
  spikeArguments,
  spikeSession,
  withConfigDir,
} from '../../../scripts/lib/spike-session.mjs';

/**
 * A stand-in for the SDK's `query()`: it reads the prompts the session yields, answers each with the
 * messages scripted for it — a `result` last —, and calls the hook and the permission callback the
 * way the CLI does, once per prompt.
 *
 * @param {{ replies?: any[][], ask?: { toolName: string, options?: any } }} script
 */
function fakeSdk(script = {}) {
  const calls = {
    params: /** @type {any} */ (null),
    closed: 0,
    answers: /** @type {any[]} */ ([]),
  };

  return {
    calls,
    query(/** @type {any} */ params) {
      calls.params = params;
      const replies = script.replies ?? [];

      async function* stream() {
        const prompts = params.prompt[Symbol.asyncIterator]();
        for (const reply of replies) {
          await prompts.next();
          if (script.ask !== undefined) {
            const hook = params.options.hooks.PreToolUse[0].hooks[0];
            calls.answers.push(await hook({ tool_name: script.ask.toolName }));
            calls.answers.push(
              await params.options.canUseTool(script.ask.toolName, { a: 1 }, script.ask.options),
            );
          }
          yield* reply;
        }
        // The CLI keeps reading its input after the last turn: the input waits, it never ends.
        void prompts.next();
      }

      const iterator = stream();
      return Object.assign(iterator, {
        close: () => {
          calls.closed += 1;
        },
        initializationResult: () => Promise.resolve({ output_style: 'Explanatory' }),
      });
    },
  };
}

const RESULT = { type: 'result', subtype: 'success' };

describe('one session of a spike — plan 26, B-01', () => {
  it('opens it with the options of the product, on the model it is given', async () => {
    const sdk = fakeSdk({ replies: [[RESULT]] });

    await spikeSession(sdk, { cwd: '/repo', config: '/config', model: 'haiku', prompts: ['hi'] });

    const { options } = sdk.calls.params;
    expect(options.settingSources).toEqual(['project']);
    expect(options.model).toBe('haiku');
    expect(options.cwd).toBe('/repo');
    expect(options.strictMcpConfig).toBe(true);
    expect(options.allowDangerouslySkipPermissions).toBe(false);
    expect(options.env.CLAUDE_CONFIG_DIR).toBe('/config');
    expect(options.stderr('ignored')).toBeUndefined();
  });

  it('sends the prompts one turn at a time and keeps every message until the last result', async () => {
    const first = { type: 'assistant', message: { content: [] } };
    const sdk = fakeSdk({ replies: [[first, RESULT], [RESULT]] });

    const run = await spikeSession(sdk, {
      cwd: '/repo',
      config: '/config',
      model: 'haiku',
      prompts: ['one', 'two'],
    });

    expect(run.messages).toEqual([first, RESULT, RESULT]);
    expect(run.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(sdk.calls.closed).toBe(1);
  });

  it('records what the hook and canUseTool saw, and answers allow by default', async () => {
    const sdk = fakeSdk({
      replies: [[RESULT]],
      ask: { toolName: 'Write', options: { toolUseID: 'toolu_1', agentID: 'agent_1' } },
    });

    const run = await spikeSession(sdk, {
      cwd: '/repo',
      config: '/config',
      model: 'haiku',
      prompts: ['write'],
    });

    expect(run.seen.canUseTool).toEqual([
      { toolName: 'Write', toolUseId: 'toolu_1', agentId: 'agent_1' },
    ]);
    expect(run.seen.preToolUse[0]?.toolName).toBe('Write');
    expect(sdk.calls.answers).toEqual([
      { continue: true },
      { behavior: 'allow', updatedInput: { a: 1 } },
    ]);
  });

  it('denies what the probe does not allow, and answers the hook as the probe says', async () => {
    const sdk = fakeSdk({ replies: [[RESULT]], ask: { toolName: 'Write' } });

    await spikeSession(sdk, {
      cwd: '/repo',
      config: '/config',
      model: 'haiku',
      prompts: ['write'],
      allows: () => false,
      hookAnswer: () => ({ decision: 'ask' }),
    });

    expect(sdk.calls.answers).toEqual([
      { decision: 'ask' },
      { behavior: 'deny', message: 'refused by the spike' },
    ]);
  });

  it('runs `before` on an idle session and returns what it answered, without reading the stream', async () => {
    const sdk = fakeSdk();

    const run = await spikeSession(sdk, {
      cwd: '/repo',
      config: '/config',
      model: 'haiku',
      before: (query) => query.initializationResult(),
    });

    expect(run.extra).toEqual({ output_style: 'Explanatory' });
    expect(run.messages).toEqual([]);
    expect(sdk.calls.closed).toBe(1);
  });

  it('abandons a session that outlives its deadline', async () => {
    vi.useFakeTimers();
    try {
      const sdk = fakeSdk();
      let aborted = false;

      await spikeSession(sdk, {
        cwd: '/repo',
        config: '/config',
        model: 'haiku',
        timeoutMs: 10,
        before: async (query) => {
          const signal = sdk.calls.params.options.abortController.signal;
          signal.addEventListener('abort', () => (aborted = true));
          vi.advanceTimersByTime(20);
          return query.initializationResult();
        },
      });

      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a session its own deadline abandoned as a result, not a failure', async () => {
    vi.useFakeTimers();
    try {
      const assistant = { type: 'assistant', message: { content: [] } };
      const sdk = {
        query: (/** @type {any} */ params) => {
          async function* stream() {
            await params.prompt[Symbol.asyncIterator]().next();
            yield assistant;
            await new Promise((_resolve, reject) => {
              params.options.abortController.signal.addEventListener('abort', () =>
                reject(new Error('aborted by the test double')),
              );
            });
          }
          return Object.assign(stream(), { close: () => undefined });
        },
      };

      const run = spikeSession(sdk, {
        cwd: '/repo',
        config: '/config',
        model: 'haiku',
        prompts: ['hi'],
        timeoutMs: 10,
      });
      await vi.advanceTimersByTimeAsync(20);

      await expect(run).resolves.toEqual(
        expect.objectContaining({ messages: [assistant], abandoned: true }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('still throws when the stream fails for a reason other than its own deadline', async () => {
    const sdk = {
      query: (/** @type {any} */ params) => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await params.prompt[Symbol.asyncIterator]().next();
            throw new Error('boom');
          },
        }),
        close: () => undefined,
      }),
    };

    await expect(
      spikeSession(sdk, { cwd: '/repo', config: '/config', model: 'haiku', prompts: ['hi'] }),
    ).rejects.toThrow('boom');
  });

  it('closes the session even when `before` throws', async () => {
    const sdk = fakeSdk();

    await expect(
      spikeSession(sdk, {
        cwd: '/repo',
        config: '/config',
        model: 'haiku',
        before: () => Promise.reject(new Error('no')),
      }),
    ).rejects.toThrow('no');
    expect(sdk.calls.closed).toBe(1);
  });

  it('reads the sightings of a call with what is missing as null', () => {
    expect(hookSighting({})).toEqual({
      toolName: 'unknown',
      toolUseId: null,
      permissionMode: null,
      agentType: null,
      agentId: null,
      effort: null,
    });
    expect(
      hookSighting({
        tool_name: 'Write',
        tool_use_id: 'toolu_1',
        permission_mode: 'default',
        agent_type: 'writer',
        agent_id: 'a1',
        effort: { level: 'low' },
      }),
    ).toEqual({
      toolName: 'Write',
      toolUseId: 'toolu_1',
      permissionMode: 'default',
      agentType: 'writer',
      agentId: 'a1',
      effort: 'low',
    });
    expect(permissionSighting('Read', undefined)).toEqual({
      toolName: 'Read',
      toolUseId: null,
      agentId: null,
    });
  });
});

describe('the command line of a spike', () => {
  const PROBES = ['one', 'two'];

  it('runs every probe when none is named, and names the ones it does not know', () => {
    expect(spikeArguments([], PROBES)).toEqual({ chosen: PROBES, jsonFile: null, unknown: [] });
    expect(spikeArguments(['two', 'three'], PROBES)).toEqual({
      chosen: ['two', 'three'],
      jsonFile: null,
      unknown: ['three'],
    });
  });

  it('reads where the raw numbers go, which is not a probe', () => {
    expect(spikeArguments(['--json', '/tmp/x.json', 'one'], PROBES)).toEqual({
      chosen: ['one'],
      jsonFile: '/tmp/x.json',
      unknown: [],
    });
    expect(spikeArguments(['--json'], PROBES).jsonFile).toBeNull();
  });

  it('runs the probes in order, records a failure and goes on to the next', async () => {
    const said = /** @type {string[]} */ ([]);
    const say = {
      info: (/** @type {string} */ text) => said.push(`info ${text}`),
      ok: (/** @type {string} */ text) => said.push(`ok ${text}`),
      fail: (/** @type {string} */ text, /** @type {string} */ detail) =>
        said.push(`fail ${text} ${detail}`),
    };

    const outcome = await runProbes(
      ['one', 'two'],
      (name) => (name === 'one' ? Promise.reject(new Error('broke')) : Promise.resolve(2)),
      say,
    );

    expect(outcome).toEqual({ results: { one: { error: 'Error: broke' }, two: 2 }, failed: 1 });
    expect(said).toEqual(['info one…', 'fail one Error: broke', 'info two…', 'ok two']);
  });

  it('loads the SDK the backend runs', async () => {
    const sdk = await importAgentSdk(repoRoot);

    expect(typeof sdk.query).toBe('function');
    expect(typeof sdk.getSubagentMessages).toBe('function');
  });
});

describe('a whole spike', () => {
  /** What a spike said, in order. */
  const said = /** @type {string[]} */ ([]);
  const say = {
    info: (/** @type {string} */ text) => said.push(`info ${text}`),
    ok: (/** @type {string} */ text) => said.push(`ok ${text}`),
    fail: (/** @type {string} */ text, /** @type {string | undefined} */ detail) =>
      said.push(`fail ${text} ${String(detail)}`),
    title: (/** @type {string} */ text) => said.push(`title ${text}`),
    line: (/** @type {string} */ text) => said.push(`line ${text}`),
  };
  const roots = /** @type {string[]} */ ([]);

  afterEach(() => {
    said.length = 0;
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  /** A throwaway directory, removed after the test. */
  function scratch() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-spike-session-'));
    roots.push(root);
    return root;
  }

  it('refuses a probe it does not know, before titling or loading anything', () => {
    expect(openSpike(['nope'], ['one'], 'Heading', say)).toBeNull();
    expect(said).toEqual(['fail no probe named nope known: one']);
  });

  it('titles the run of the probes it knows', () => {
    expect(openSpike([], ['one'], 'Heading', say)).toEqual({
      chosen: ['one'],
      jsonFile: null,
      unknown: [],
    });
    expect(said).toEqual(['title Heading']);
  });

  it('copies the credential into the isolated configuration, readable by its owner only', () => {
    const source = scratch();
    const config = scratch();
    fs.writeFileSync(path.join(source, '.credentials.json'), '{"token":"x"}');

    copyCredential(source, config);

    const copied = path.join(config, '.credentials.json');
    expect(fs.readFileSync(copied, 'utf8')).toBe('{"token":"x"}');
    expect(fs.statSync(copied).mode & 0o777).toBe(0o600);
  });

  /** Runs `fn` with `CLAUDE_CONFIG_DIR` pointed at `source`, restoring it after, even on failure. */
  async function withSourceAsConfigDir(/** @type {string} */ source, /** @type {() => any} */ fn) {
    const previous = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = source;
    try {
      return await fn();
    } finally {
      if (previous === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
      else process.env['CLAUDE_CONFIG_DIR'] = previous;
    }
  }

  it('builds a throwaway world: the credential copied, and the files written under the repository', async () => {
    const source = scratch();
    fs.writeFileSync(path.join(source, '.credentials.json'), '{"token":"w"}');

    await withSourceAsConfigDir(source, () => {
      const world = makeThrowawayWorld('losses-test', { 'a.txt': 'hello', 'nested/b.txt': 'deep' });
      roots.push(world.root);

      expect(fs.readFileSync(path.join(world.config, '.credentials.json'), 'utf8')).toBe(
        '{"token":"w"}',
      );
      expect(fs.readFileSync(path.join(world.repository, 'a.txt'), 'utf8')).toBe('hello');
      expect(fs.readFileSync(path.join(world.repository, 'nested/b.txt'), 'utf8')).toBe('deep');
    });
  });

  it('creates an empty repository directory when no files are given — a session still needs a cwd that exists', async () => {
    const source = scratch();
    fs.writeFileSync(path.join(source, '.credentials.json'), '{}');

    await withSourceAsConfigDir(source, () => {
      const world = makeThrowawayWorld('losses-empty');
      roots.push(world.root);

      expect(fs.existsSync(world.repository)).toBe(true);
      expect(fs.readdirSync(world.repository)).toEqual([]);
    });
  });

  it('runs `fn` with its own CLAUDE_CONFIG_DIR, and restores what was there before', async () => {
    await withSourceAsConfigDir('/was-here', async () => {
      let seenInside;
      await withConfigDir('/spike-config', () => {
        seenInside = process.env['CLAUDE_CONFIG_DIR'];
        return Promise.resolve();
      });

      expect(seenInside).toBe('/spike-config');
      expect(process.env['CLAUDE_CONFIG_DIR']).toBe('/was-here');
    });
  });

  it('deletes CLAUDE_CONFIG_DIR again when it was unset before, even when `fn` throws', async () => {
    const previous = process.env['CLAUDE_CONFIG_DIR'];
    delete process.env['CLAUDE_CONFIG_DIR'];
    try {
      await expect(
        withConfigDir('/spike-config', () => Promise.reject(new Error('no'))),
      ).rejects.toThrow('no');
      expect(process.env['CLAUDE_CONFIG_DIR']).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
      else process.env['CLAUDE_CONFIG_DIR'] = previous;
    }
  });

  it('opens a session on a world, hands the run and the world to read, and tears the world down', async () => {
    const source = scratch();
    fs.writeFileSync(path.join(source, '.credentials.json'), '{}');
    const world = await withSourceAsConfigDir(source, () => makeThrowawayWorld('run-in-world'));

    const sdk = fakeSdk({ replies: [[RESULT]] });
    const seen = /** @type {any[]} */ ([]);
    const answer = await runInWorld(world, sdk, { model: 'haiku', prompts: ['hi'] }, (run, w) => {
      seen.push(run, w);
      return 'answer';
    });

    expect(answer).toBe('answer');
    expect(seen[0]?.messages).toEqual([RESULT]);
    expect(seen[1]).toBe(world);
    expect(fs.existsSync(world.root)).toBe(false);
  });

  it('tears the world down even when read throws', async () => {
    const source = scratch();
    fs.writeFileSync(path.join(source, '.credentials.json'), '{}');
    const world = await withSourceAsConfigDir(source, () =>
      makeThrowawayWorld('run-in-world-throws'),
    );

    const sdk = fakeSdk({ replies: [[RESULT]] });

    await expect(
      runInWorld(world, sdk, { model: 'haiku', prompts: ['hi'] }, () => {
        throw new Error('read failed');
      }),
    ).rejects.toThrow('read failed');
    expect(fs.existsSync(world.root)).toBe(false);
  });

  it('runs the probes on the SDK it loads, writes the raw numbers and the report', async () => {
    const json = path.join(scratch(), 'out.json');
    const sdk = { name: 'fake sdk' };

    const code = await runSpike({
      args: ['--json', json],
      probes: ['one'],
      heading: 'Heading',
      root: '/repo',
      loadSdk: (root) => Promise.resolve({ ...sdk, root }),
      probe: (loaded, name) => Promise.resolve({ name, root: loaded.root }),
      report: (results) => `report of ${Object.keys(results).join(',')}`,
      say,
    });

    expect(code).toBe(0);
    expect(JSON.parse(fs.readFileSync(json, 'utf8'))).toEqual({
      one: { name: 'one', root: '/repo' },
    });
    expect(said.at(-1)).toBe('line report of one');
  });

  it('exits 1 when a probe failed, and when a probe is unknown', async () => {
    const spec = {
      probes: ['one'],
      heading: 'Heading',
      root: '/repo',
      loadSdk: () => Promise.resolve({}),
      probe: () => Promise.reject(new Error('broke')),
      report: () => '',
      say,
    };

    expect(await runSpike({ ...spec, args: [] })).toBe(1);
    expect(await runSpike({ ...spec, args: ['two'] })).toBe(1);
  });

  it('runs a named spike by routing each probe to its own runner, on the real SDK, through the real terminal output', async () => {
    const written = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const code = await runNamedSpike({
        args: [],
        probes: ['one'],
        heading: 'Heading',
        runners: {
          one: (sdk) => Promise.resolve({ queryIsFunction: typeof sdk.query === 'function' }),
        },
        reportOf: (results) => `report of ${Object.keys(results).join(',')}`,
      });

      expect(code).toBe(0);
      expect(written.mock.calls.map((call) => call[0]).join('')).toContain('report of one');
    } finally {
      written.mockRestore();
    }
  });
});
