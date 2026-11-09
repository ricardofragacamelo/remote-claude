import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionRule } from '@domain/permission';
import { UserId } from '@domain/auth';
import { AuditEntry, AuditEvent } from '@domain/audit';
import { SessionId } from '@domain/session';
import { decodeRuleCursor, encodeRuleCursor } from '@application/permission';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_PROJECT,
  aPermissionModule,
} from '../../../support/builders/permission.builder';
import type { PermissionHarness } from '../../../support/builders/permission.builder';

/** A rule stored directly, bypassing the grant routine — full control over every field. */
function storedRule(overrides: Partial<Parameters<typeof PermissionRule.restore>[0]> = {}) {
  return PermissionRule.restore({
    id: 'rule-1',
    userId: PERMISSION_OWNER,
    sessionId: null,
    projectPath: null,
    pattern: 'shell(git status:*)',
    engine: null,
    decision: 'allow',
    scope: 'always',
    createdAt: PERMISSION_NOW,
    expiresAt: new Date(PERMISSION_NOW.getTime() + 3_600_000),
    revokedAt: null,
    ...overrides,
  });
}

function entryFor(ruleId: string, at: Date, id: string) {
  return AuditEntry.record({
    id,
    userId: PERMISSION_OWNER,
    sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
    toolUseId: null,
    toolName: 'Bash',
    toolKind: 'shell',
    input: { command: 'git status' },
    decision: 'allowed',
    origin: { deviceId: null, ip: null },
    at,
    verdict: {
      requestId: 'req-1',
      auto: true,
      ruleId,
      scope: 'always',
      resolvedBy: null,
      resolvedFrom: null,
    },
  });
}

describe('ListPermissionRulesUseCase.search — plan 15, B-10', () => {
  let harness: PermissionHarness;

  beforeEach(() => {
    harness = aPermissionModule();
  });

  const search = (overrides: Partial<Parameters<PermissionHarness['list']['search']>[0]> = {}) =>
    harness.list.search({
      userId: PERMISSION_OWNER,
      filter: {
        status: [],
        scope: null,
        decision: null,
        engine: null,
        kind: null,
        folder: null,
        expiresBefore: null,
        q: null,
      },
      sort: 'grantedAt',
      order: 'desc',
      cursor: null,
      pageSize: 50,
      ...overrides,
    });

  it('defaults to active and expired, never revoked nor disabled — S-01', async () => {
    harness.rules.rules.push(
      storedRule({ id: 'active' }),
      storedRule({ id: 'expired', expiresAt: new Date(PERMISSION_NOW.getTime() - 1) }),
      storedRule({ id: 'revoked', revokedAt: PERMISSION_NOW }),
      storedRule({ id: 'disabled', disabledReason: 'untranslatable', pattern: 'Bash' }),
    );

    const { items } = await search();

    expect(items.map((item) => item.rule.id).sort()).toEqual(['active', 'expired']);
  });

  it('filters by status, scope, decision, engine, kind and folder', async () => {
    harness.rules.rules.push(
      storedRule({ id: 'a', scope: 'project', projectPath: PERMISSION_PROJECT, decision: 'deny' }),
      storedRule({ id: 'b', engine: 'claude', pattern: 'file.edit(src/**)' }),
      storedRule({ id: 'c' }),
    );

    expect(
      (
        await search({
          filter: {
            status: [],
            scope: 'project',
            decision: null,
            engine: null,
            kind: null,
            folder: null,
            expiresBefore: null,
            q: null,
          },
        })
      ).items.map((item) => item.rule.id),
    ).toEqual(['a']);
    expect(
      (
        await search({
          filter: {
            status: [],
            scope: null,
            decision: 'deny',
            engine: null,
            kind: null,
            folder: null,
            expiresBefore: null,
            q: null,
          },
        })
      ).items.map((item) => item.rule.id),
    ).toEqual(['a']);
    expect(
      (
        await search({
          filter: {
            status: [],
            scope: null,
            decision: null,
            engine: 'claude',
            kind: null,
            folder: null,
            expiresBefore: null,
            q: null,
          },
        })
      ).items.map((item) => item.rule.id),
    ).toEqual(['b']);
    expect(
      (
        await search({
          filter: {
            status: [],
            scope: null,
            decision: null,
            engine: null,
            kind: 'file.edit',
            folder: null,
            expiresBefore: null,
            q: null,
          },
        })
      ).items.map((item) => item.rule.id),
    ).toEqual(['b']);
    expect(
      (
        await search({
          filter: {
            status: [],
            scope: null,
            decision: null,
            engine: null,
            kind: null,
            folder: PERMISSION_PROJECT,
            expiresBefore: null,
            q: null,
          },
        })
      ).items.map((item) => item.rule.id),
    ).toEqual(['a']);
  });

  it('pages over (grantedAt, id) without repeating or skipping a row', async () => {
    for (let i = 0; i < 5; i += 1) {
      harness.rules.rules.push(
        storedRule({
          id: `r${String(i)}`,
          createdAt: new Date(PERMISSION_NOW.getTime() + i * 1000),
        }),
      );
    }

    const first = await search({ pageSize: 2 });
    expect(first.items.map((item) => item.rule.id)).toEqual(['r4', 'r3']);
    expect(first.nextCursor).not.toBeNull();

    const second = await search({
      pageSize: 2,
      cursor: decodeRuleCursor(first.nextCursor as string),
    });
    expect(second.items.map((item) => item.rule.id)).toEqual(['r2', 'r1']);

    const third = await search({
      pageSize: 2,
      cursor: decodeRuleCursor(second.nextCursor as string),
    });
    expect(third.items.map((item) => item.rule.id)).toEqual(['r0']);
    expect(third.nextCursor).toBeNull();
  });

  it('sorts by pattern, ascending', async () => {
    harness.rules.rules.push(
      storedRule({ id: 'z', pattern: 'shell(zzz)' }),
      storedRule({ id: 'a', pattern: 'shell(aaa)' }),
    );

    const { items } = await search({ sort: 'pattern', order: 'asc' });

    expect(items.map((item) => item.rule.id)).toEqual(['a', 'z']);
  });

  it('sorts by useCount, reading usage from the trail — single page', async () => {
    harness.rules.rules.push(storedRule({ id: 'low' }), storedRule({ id: 'high' }));
    harness.trailReader.rows.push(
      {
        seq: 1,
        userId: PERMISSION_OWNER,
        ruleId: 'high',
        entry: entryFor('high', PERMISSION_NOW, 'e1'),
      },
      {
        seq: 2,
        userId: PERMISSION_OWNER,
        ruleId: 'high',
        entry: entryFor('high', PERMISSION_NOW, 'e2'),
      },
      {
        seq: 3,
        userId: PERMISSION_OWNER,
        ruleId: 'low',
        entry: entryFor('low', PERMISSION_NOW, 'e3'),
      },
    );

    const { items, nextCursor } = await search({ sort: 'useCount', order: 'desc' });

    expect(items.map((item) => item.rule.id)).toEqual(['high', 'low']);
    expect(items[0]?.usage).toEqual({ count: 2, lastUsedAt: PERMISSION_NOW });
    expect(nextCursor).toBeNull();
  });

  it('sorts by lastUsedAt, ascending, and breaks a tie on createdAt — S-50', async () => {
    harness.rules.rules.push(
      storedRule({ id: 'never-used-early', createdAt: new Date(PERMISSION_NOW.getTime() - 1_000) }),
      storedRule({ id: 'never-used-late', createdAt: PERMISSION_NOW }),
      storedRule({ id: 'used', createdAt: PERMISSION_NOW }),
    );
    harness.trailReader.rows.push({
      seq: 1,
      userId: PERMISSION_OWNER,
      ruleId: 'used',
      entry: entryFor('used', PERMISSION_NOW, 'e1'),
    });

    const { items } = await search({ sort: 'lastUsedAt', order: 'asc' });

    // The two never-used rules tie at key 0 and fall back to createdAt, newest first; `used` —
    // the only one with a real `lastUsedAt` — sorts last, ascending.
    expect(items.map((item) => item.rule.id)).toEqual([
      'never-used-late',
      'never-used-early',
      'used',
    ]);
  });

  it('marks folderReachable for a project rule, null for always', async () => {
    harness.rules.rules.push(
      storedRule({ id: 'p', scope: 'project', projectPath: PERMISSION_PROJECT }),
      storedRule({ id: 'a', scope: 'always' }),
    );
    harness.folders.unreachable.add(PERMISSION_PROJECT);

    const { items } = await search();
    const byId = new Map(items.map((item) => [item.rule.id, item]));

    expect(byId.get('p')?.folderReachable).toBe(false);
    expect(byId.get('a')?.folderReachable).toBeNull();
  });

  it('gives a disabled rule no usage, never a guess', async () => {
    harness.rules.rules.push(
      storedRule({ id: 'd', disabledReason: 'untranslatable', pattern: 'Bash' }),
    );

    const { items } = await search({
      filter: {
        status: ['disabled'],
        scope: null,
        decision: null,
        engine: null,
        kind: null,
        folder: null,
        expiresBefore: null,
        q: null,
      },
    });

    expect(items[0]?.usage).toBeNull();
  });
});

describe('SummarizePermissionRulesUseCase — plan 15, B-10', () => {
  it('counts by status, decision and scope over the same predicate as the listing', async () => {
    const harness = aPermissionModule();
    harness.rules.rules.push(
      storedRule({ id: 'a1', scope: 'always', decision: 'allow' }),
      storedRule({ id: 'a2', scope: 'project', projectPath: PERMISSION_PROJECT, decision: 'deny' }),
      storedRule({ id: 'a3', revokedAt: PERMISSION_NOW }),
    );

    const summary = await harness.summarize.execute(PERMISSION_OWNER, {
      status: [],
      scope: null,
      decision: null,
      engine: null,
      kind: null,
      folder: null,
      expiresBefore: null,
      q: null,
    });

    expect(summary.byStatus).toMatchObject({ active: 2, revoked: 1, disabled: 0 });
    expect(summary.byDecision).toEqual({ allow: 1, deny: 1 });
    expect(summary.byScope).toEqual({ always: 1, project: 1 });
  });
});

describe('ListRuleInvocationsUseCase / ListRuleHistoryUseCase — plan 15, B-11', () => {
  it('refuses somebody else`s rule, for both — S-60', async () => {
    const harness = aPermissionModule();
    harness.rules.rules.push(storedRule({ id: 'theirs', userId: UserId.create('auth|stranger') }));

    await expect(
      harness.ruleInvocations.execute(PERMISSION_OWNER, 'theirs', null, 50),
    ).rejects.toThrow();
    await expect(harness.ruleHistory.execute(PERMISSION_OWNER, 'theirs')).rejects.toThrow();
  });

  it('reads the rule`s own invocations from the trail, by ruleId — S-61, S-62', async () => {
    const harness = aPermissionModule();
    harness.rules.rules.push(storedRule({ id: 'r1' }));
    harness.trailReader.rows.push(
      {
        seq: 1,
        userId: PERMISSION_OWNER,
        ruleId: 'r1',
        entry: entryFor('r1', PERMISSION_NOW, 'e1'),
      },
      {
        seq: 2,
        userId: PERMISSION_OWNER,
        ruleId: null,
        entry: entryFor('r1', PERMISSION_NOW, 'e2'),
      },
    );

    const page = await harness.ruleInvocations.execute(PERMISSION_OWNER, 'r1', null, 50);

    expect(page.records.map((record) => record.entry.id)).toEqual(['e1']);
  });

  it('reads the rule`s own events — granted, revoked, validity changed', async () => {
    const harness = aPermissionModule();
    harness.rules.rules.push(storedRule({ id: 'r1' }));
    harness.eventReader.rows.push({
      seq: 1,
      event: AuditEvent.record({
        id: 'event-1',
        userId: PERMISSION_OWNER,
        kind: 'permission.ruleGranted',
        subjectId: 'r1',
        subjectLabel: 'shell(git status:*)',
        at: PERMISSION_NOW,
      }),
    });
    harness.eventReader.rows.push({
      seq: 2,
      event: AuditEvent.record({
        id: 'event-2',
        userId: PERMISSION_OWNER,
        kind: 'permission.ruleGranted',
        subjectId: 'other-rule',
        subjectLabel: 'shell(ls)',
        at: PERMISSION_NOW,
      }),
    });

    const page = await harness.ruleHistory.execute(PERMISSION_OWNER, 'r1');

    expect(page.records.map((record) => record.event.id)).toEqual(['event-1']);
  });
});

describe('the rule listing cursor — plan 15, D-13', () => {
  it('round-trips through encode/decode', () => {
    const cursor = {
      sort: 'grantedAt' as const,
      order: 'desc' as const,
      value: '2026-09-19T12:00:00.000Z',
      grantedAt: '2026-09-19T12:00:00.000Z',
      id: 'rule-1',
    };

    expect(decodeRuleCursor(encodeRuleCursor(cursor))).toEqual(cursor);
  });

  it('refuses a cursor this server never emitted, never throws', () => {
    expect(decodeRuleCursor('not-base64url-json')).toBeNull();
    expect(decodeRuleCursor('')).toBeNull();
  });

  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  it.each([
    ['an unknown sort field', { sort: 'nope', order: 'desc', value: 'x', grantedAt: 'x', id: 'x' }],
    [
      'an unknown order',
      { sort: 'grantedAt', order: 'sideways', value: 'x', grantedAt: 'x', id: 'x' },
    ],
    [
      'a value of the wrong type',
      { sort: 'grantedAt', order: 'desc', value: true, grantedAt: 'x', id: 'x' },
    ],
    ['a missing grantedAt', { sort: 'grantedAt', order: 'desc', value: 'x', id: 'x' }],
    ['a missing id', { sort: 'grantedAt', order: 'desc', value: 'x', grantedAt: 'x' }],
    ['not an object at all', 'just a string'],
  ])('refuses a well-formed JSON envelope with %s', (_label, payload) => {
    expect(decodeRuleCursor(encode(payload))).toBeNull();
  });
});
