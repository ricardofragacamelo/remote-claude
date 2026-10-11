import { beforeEach, describe, expect, it } from 'vitest';

import { READ_ONLY_REFUSED_KINDS, refusedByMode } from '@domain/permission';
import { PERMISSION_MODES } from '@domain/engine';
import type { CanonicalTool, ToolKind } from '@domain/engine';
import { SessionId } from '@domain/session';
import type { GrantPermissionRuleCommand } from '@application/permission';
import {
  PERMISSION_OWNER,
  PERMISSION_PROJECT,
  PERMISSION_SESSION,
  aPermissionModule,
  aPermissionQuestion,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/** A call of a kind Claude's classifier never builds — a delete or a move of another engine. */
function anotherEnginesCall(kind: ToolKind, native: string): CanonicalTool {
  return {
    kind,
    label: { messageKey: 'sessions.tool.other', params: { name: native } },
    subject: { paths: ['/srv/projects/app/a.ts'] },
    changes: [],
    origin: { engine: 'test-engine', native },
  };
}

/**
 * Read-only — plan 28, B-26 / S-78.
 *
 * Our gate refuses every write and every shell of a read-only session before any rule is read, and
 * says so; what changes nothing still asks, or is answered by a rule, as in any other mode.
 */
describe('a read-only session', () => {
  let harness: PermissionHarness;

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const ask = (overrides: Parameters<typeof aPermissionQuestion>[0] = {}) =>
    harness.request.execute(aPermissionQuestion({ permissionMode: 'readOnly', ...overrides }));

  const grant = (overrides: Partial<GrantPermissionRuleCommand> = {}) =>
    harness.grant.execute({
      userId: PERMISSION_OWNER,
      pattern: 'shell(pnpm:*)',
      decision: 'allow',
      scope: 'project',
      projectPath: PERMISSION_PROJECT,
      expiresAt: null,
      ...overrides,
    });

  /** One call of each kind the mode refuses. */
  const CHANGES: [string, Parameters<typeof aPermissionQuestion>[0]][] = [
    ['file.edit', { toolName: 'Edit', input: { file_path: '/srv/projects/app/a.ts' } }],
    ['file.write', { toolName: 'Write', input: { file_path: '/srv/projects/app/b.ts' } }],
    ['shell', { toolName: 'Bash', input: { command: 'pnpm test' } }],
    ['file.delete', { toolName: 'rm', tool: anotherEnginesCall('file.delete', 'rm') }],
    ['file.move', { toolName: 'mv', tool: anotherEnginesCall('file.move', 'mv') }],
  ];

  describe('a call arriving', () => {
    it.each(CHANGES)(
      'refuses a %s at once, announced, with no card and no push',
      async (_kind, call) => {
        const outcome = await ask(call);

        expect(outcome).toEqual({
          kind: 'settled',
          resolution: expect.objectContaining({
            decision: 'deny',
            auto: true,
            scope: 'once',
            resolvedBy: PERMISSION_OWNER,
            resolvedFrom: null,
            via: 'readOnly',
            reason: expect.stringContaining('read-only'),
          }),
        });
        expect(harness.broadcaster.frames.map((entry) => entry.frame.type)).toEqual([
          'permission.resolved',
        ]);
        expect(harness.broadcaster.last('permission.resolved')).toEqual({
          requestId: 'request-1',
          decision: 'deny',
          auto: true,
          resolvedBy: PERMISSION_OWNER.value,
          toolUseId: 'toolu-1',
          via: 'readOnly',
        });
        expect(harness.events.askedIds).toEqual([]);
        expect(harness.scheduler.armed).toBe(0);
        // Recorded like any other answer: opened, then written with its resolution.
        expect(harness.requests.opened).toEqual(['request-1']);
        expect(harness.requests.updated).toEqual(['request-1']);
      },
    );

    it('refuses a shell an allow rule allows — the mode comes before the rules', async () => {
      await grant();

      const outcome = await ask({ input: { command: 'pnpm test' } });

      expect(outcome).toEqual({
        kind: 'settled',
        resolution: expect.objectContaining({ decision: 'deny', via: 'readOnly' }),
      });
      expect(harness.registry.find('request-1')?.resolution).not.toHaveProperty('ruleId');
    });

    it('refuses a write an allow rule allows', async () => {
      await grant({ pattern: 'file.write' });

      const outcome = await ask({ toolName: 'Write', input: { file_path: '/srv/projects/app/b' } });

      expect(outcome).toMatchObject({ kind: 'settled', resolution: { via: 'readOnly' } });
    });

    it.each([
      ['Read', { file_path: '/srv/projects/app/a.ts' }],
      ['Grep', { pattern: 'todo' }],
      ['WebSearch', { query: 'vitest' }],
    ])('still asks a person for a %s, which changes nothing', async (toolName, input) => {
      const outcome = await ask({ toolName, input });

      expect(outcome.kind).toBe('pending');
      expect(harness.events.askedIds).toEqual(['request-1']);
    });

    it('lets a deny rule refuse a read, as a rule', async () => {
      await grant({ pattern: 'web.search', decision: 'deny' });

      const outcome = await ask({ toolName: 'WebSearch', input: { query: 'x' } });

      expect(outcome).toMatchObject({ kind: 'settled', resolution: { via: 'rule' } });
    });

    it('does not let an allow rule answer a read — whoever chose read-only reads every call', async () => {
      await grant({ pattern: 'web.search' });

      expect((await ask({ toolName: 'WebSearch', input: { query: 'x' } })).kind).toBe('pending');
    });

    it('still puts a question to the person', async () => {
      const outcome = await ask({ toolName: 'AskUserQuestion', input: { questions: [] } });

      expect(outcome.kind).toBe('pending');
    });

    it('refuses nothing in another mode', async () => {
      for (const [index, mode] of (['ask', 'acceptEdits'] as const).entries()) {
        const outcome = await harness.request.execute(
          aPermissionQuestion({
            requestId: `request-${String(index)}`,
            permissionMode: mode,
            input: { command: 'pnpm test' },
          }),
        );

        expect(outcome.kind).toBe('pending');
      }
    });

    it('gives a redelivered refusal the answer it already has, once', async () => {
      const first = await ask();
      const again = await ask();

      expect(again).toEqual(first);
      expect(harness.broadcaster.frames).toHaveLength(1);
    });
  });

  describe('switching to read-only with calls open', () => {
    const openFour = async (): Promise<void> => {
      const asking = (requestId: string, overrides: Parameters<typeof aPermissionQuestion>[0]) =>
        harness.request.execute(aPermissionQuestion({ requestId, ...overrides }));

      await asking('request-1', { input: { command: 'pnpm test' } });
      await asking('request-2', { toolName: 'Edit', input: { file_path: '/srv/projects/app/a' } });
      await asking('request-3', { toolName: 'Read', input: { file_path: '/srv/projects/app/a' } });
      await asking('request-4', { toolName: 'AskUserQuestion', input: { questions: [] } });
    };

    it('refuses the open writes and shells, and leaves the read and the question open', async () => {
      await openFour();

      const answered = await harness.applyMode.execute(PERMISSION_SESSION, 'readOnly');

      expect(answered).toBe(2);
      for (const id of ['request-1', 'request-2']) {
        expect(harness.registry.find(id)?.resolution).toMatchObject({
          decision: 'deny',
          auto: true,
          via: 'readOnly',
        });
      }
      expect(harness.registry.find('request-3')?.isPending).toBe(true);
      expect(harness.registry.find('request-4')?.isPending).toBe(true);
      expect(harness.scheduler.armed).toBe(2);
    });

    it('refuses an open shell even when an allow rule appeared for it meanwhile', async () => {
      await harness.request.execute(aPermissionQuestion({ input: { command: 'pnpm test' } }));
      await grant();

      expect(await harness.applyMode.execute(PERMISSION_SESSION, 'readOnly')).toBe(1);
      expect(harness.registry.find('request-1')?.resolution).toMatchObject({ via: 'readOnly' });
    });

    it('publishes nothing when there is nothing open', async () => {
      expect(await harness.applyMode.execute(PERMISSION_SESSION, 'readOnly')).toBe(0);
      expect(harness.broadcaster.frames).toEqual([]);
    });

    it('does not touch another session`s calls', async () => {
      await harness.request.execute(
        aPermissionQuestion({
          sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXY1'),
          input: { command: 'pnpm test' },
        }),
      );

      expect(await harness.applyMode.execute(PERMISSION_SESSION, 'readOnly')).toBe(0);
    });
  });
});

describe('the mode alone refusing, by kind — plan 28, S-78', () => {
  it('holds exactly the kinds that change something', () => {
    expect([...READ_ONLY_REFUSED_KINDS].sort()).toEqual([
      'file.delete',
      'file.edit',
      'file.move',
      'file.write',
      'shell',
    ]);
  });

  it.each([...READ_ONLY_REFUSED_KINDS])('refuses a %s in read-only', (kind) => {
    expect(refusedByMode('readOnly', kind)).toBe(true);
  });

  it.each([
    'file.read',
    'search',
    'shell.output',
    'agent',
    'tasks',
    'web.fetch',
    'web.search',
    'mcp',
    'question',
    'plan',
    'other',
  ] as const)('refuses no %s in read-only', (kind) => {
    expect(refusedByMode('readOnly', kind)).toBe(false);
  });

  it.each(PERMISSION_MODES.filter((mode) => mode !== 'readOnly'))(
    'refuses nothing in %s',
    (mode) => {
      for (const kind of READ_ONLY_REFUSED_KINDS) {
        expect(refusedByMode(mode, kind)).toBe(false);
      }
    },
  );
});
