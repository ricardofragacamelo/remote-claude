import { beforeEach, describe, expect, it } from 'vitest';

import { SimulatePermissionRulesUseCase } from '@application/permission';
import { PermissionRule, PermissionRuleNotOwnedError } from '@domain/permission';
import type { PermissionRuleDraft } from '@domain/permission';
import { AuditEntry } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { claudeClassifiers } from '../../../support/builders/tool.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryAuditTrailReader } from '../../../support/fakes/in-memory-audit-trail.reader';
import { InMemoryPermissionRuleRepository } from '../../../support/fakes/in-memory-permission-rule.repository';

const now = new Date('2026-11-06T12:00:00.000Z');
const owner = UserId.create('auth|owner');
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');

function rule(id: string, overrides: Partial<PermissionRuleDraft> = {}): PermissionRule {
  return PermissionRule.create(
    {
      id,
      userId: owner,
      sessionId: null,
      projectPath: null,
      pattern: 'shell(git status:*)',
      decision: 'allow',
      scope: 'always',
      createdAt: now,
      // A decade past `now`, not 60 seconds: the fake's `listAllMatching` (unlike `page`) checks
      // `active` against a real `new Date()`, not the fixed clock above — a short window ages out
      // as soon as the suite runs any later than the moment this file was written.
      expiresAt: new Date(now.getTime() + TEN_YEARS_MS),
      ...overrides,
    },
    TEN_YEARS_MS,
  );
}

function decided(
  seq: number,
  decision: 'allowed' | 'denied',
  toolName: string,
  input: Record<string, unknown>,
  folder: string | null = '/srv/projects/app',
) {
  return {
    seq,
    userId: owner,
    ruleId: null,
    folder,
    entry: AuditEntry.record({
      id: `entry-${String(seq)}`,
      userId: owner,
      sessionId,
      toolUseId: null,
      toolName,
      input,
      decision,
      origin: { deviceId: null, ip: null },
      at: now,
    }),
  };
}

describe('SimulatePermissionRulesUseCase', () => {
  let repository: InMemoryPermissionRuleRepository;
  let trail: InMemoryAuditTrailReader;
  let useCase: SimulatePermissionRulesUseCase;

  beforeEach(() => {
    repository = new InMemoryPermissionRuleRepository();
    trail = new InMemoryAuditTrailReader();
    useCase = new SimulatePermissionRulesUseCase(
      repository,
      trail,
      claudeClassifiers(),
      new FixedClock(now),
    );
  });

  it('counts an invocation as unchanged when the rules still answer the same way', async () => {
    repository.rules.push(rule('a'));
    trail.rows.push(decided(1, 'allowed', 'Bash', { command: 'git status' }));

    const result = await useCase.execute({ userId: owner });

    expect(result.counts).toEqual({
      unchanged: 1,
      wouldAutoAllow: 0,
      wouldAutoDeny: 0,
      wouldAsk: 0,
    });
    expect(result.changes).toEqual([]);
  });

  it('counts what adding an allow would change, for an invocation a human denied — S-121', async () => {
    trail.rows.push(decided(1, 'denied', 'Bash', { command: 'git status' }));

    const result = await useCase.execute({
      userId: owner,
      add: [{ pattern: 'shell(git status:*)', decision: 'allow' }],
    });

    expect(result.counts.wouldAutoAllow).toBe(1);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ before: 'deny', after: 'allow' });
  });

  it('counts what adding a deny would change, without touching the stored rules — S-123', async () => {
    const existing = rule('a');
    repository.rules.push(existing);
    trail.rows.push(decided(1, 'allowed', 'Bash', { command: 'git status' }));

    const result = await useCase.execute({
      userId: owner,
      add: [{ pattern: 'shell(git status:*)', decision: 'deny' }],
    });

    expect(result.counts.wouldAutoDeny).toBe(1);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ before: 'allow', after: 'deny' });
    // The winning rule is the deny draft, not the stored allow — and nothing was written for it.
    expect(result.changes[0]?.answeringRule?.id).not.toBe(existing.id);
    expect(repository.rules).toHaveLength(1);
  });

  it('counts what removing a rule would change, as if it were revoked — S-122', async () => {
    const existing = rule('a');
    repository.rules.push(existing);
    trail.rows.push(decided(1, 'allowed', 'Bash', { command: 'git status' }));

    const result = await useCase.execute({ userId: owner, remove: [existing.id] });

    expect(result.counts.wouldAsk).toBe(1);
    expect(result.changes[0]?.answeringRule).toBeNull();
  });

  it('answers with the same rule a live session would — not a copy of the precedence — S-129', async () => {
    const denier = rule('denier', { pattern: 'shell(git status:*)', decision: 'deny' });
    repository.rules.push(denier);
    trail.rows.push(decided(1, 'allowed', 'Bash', { command: 'git status' }));

    const result = await useCase.execute({ userId: owner });

    expect(result.changes[0]?.answeringRule?.id).toBe(denier.id);
  });

  it("refuses to remove somebody else's rule, and reads nothing — S-131", async () => {
    const stranger = UserId.create('auth|stranger');
    const theirs = rule('theirs', { userId: stranger });
    repository.rules.push(theirs);

    await expect(useCase.execute({ userId: owner, remove: [theirs.id] })).rejects.toThrow(
      PermissionRuleNotOwnedError,
    );
    expect(trail.rows).toHaveLength(0);
  });

  it('counts an invocation with no known folder, without failing the simulation — S-125', async () => {
    trail.rows.push(decided(1, 'denied', 'Bash', { command: 'rm -rf /' }, null));

    const result = await useCase.execute({ userId: owner });

    expect(result.withoutFolder).toBe(1);
  });

  it('assumes the canonical ask mode, since the trail never kept the real one — D-15', async () => {
    trail.rows.push(decided(1, 'allowed', 'Bash', { command: 'git status' }));

    const result = await useCase.execute({ userId: owner });

    expect(result.assumedMode).toBe('ask');
  });

  it('respects the default and the ceiling of `limit` — D-15', async () => {
    for (let i = 0; i < 5; i += 1) {
      trail.rows.push(decided(i, 'allowed', 'Bash', { command: 'git status' }));
    }

    const result = await useCase.execute({ userId: owner, limit: 2 });

    expect(result.counts.unchanged + result.counts.wouldAsk).toBe(2);
  });

  it('never has a side effect — nothing is written to the repository or the trail', async () => {
    repository.rules.push(rule('a'));
    trail.rows.push(decided(1, 'allowed', 'Bash', { command: 'git status' }));

    await useCase.execute({
      userId: owner,
      add: [{ pattern: 'shell(rm:*)', decision: 'deny' }],
      remove: ['a'],
    });

    expect(repository.rules).toHaveLength(1);
    expect(trail.rows).toHaveLength(1);
  });
});
