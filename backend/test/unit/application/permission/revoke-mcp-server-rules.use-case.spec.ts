import { describe, expect, it } from 'vitest';

import { RecordAuditEventUseCase } from '@application/audit';
import { RevokeMcpServerRulesUseCase } from '@application/permission';
import type { PermissionRuleRepository, RuleRevocation } from '@application/permission';
import { PermissionRule } from '@domain/permission';
import type { PermissionRuleDraft } from '@domain/permission';
import { UserId } from '@domain/auth';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryPermissionRuleRepository } from '../../../support/fakes/in-memory-permission-rule.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

/** [delegate], except `listFor` also returns a rule already revoked, and/or every `saveRevocation` loses its race. */
class RacingPermissionRuleRepository implements PermissionRuleRepository {
  alreadyRevoked: PermissionRule[] = [];
  everyRevocationLosesTheRace = false;

  constructor(private readonly delegate: PermissionRuleRepository) {}

  grant(...args: Parameters<PermissionRuleRepository['grant']>) {
    return this.delegate.grant(...args);
  }

  findById(...args: Parameters<PermissionRuleRepository['findById']>) {
    return this.delegate.findById(...args);
  }

  findApplicable(...args: Parameters<PermissionRuleRepository['findApplicable']>) {
    return this.delegate.findApplicable(...args);
  }

  async listFor(...args: Parameters<PermissionRuleRepository['listFor']>) {
    return [...(await this.delegate.listFor(...args)), ...this.alreadyRevoked];
  }

  async saveRevocation(rule: PermissionRule): Promise<RuleRevocation> {
    if (this.everyRevocationLosesTheRace) {
      return { rule, revoked: false };
    }
    return this.delegate.saveRevocation(rule);
  }
}

const LIFETIME = 60_000;
const NOW = new Date('2026-10-19T12:00:00.000Z');
const OWNER = UserId.create('auth|rules-owner');
const OTHER_USER = UserId.create('auth|rules-other');

function aRule(overrides: Partial<PermissionRuleDraft> & { lifetimeMs?: number } = {}) {
  const { lifetimeMs, ...draft } = overrides;

  return PermissionRule.create(
    {
      id: `rule-${String(Math.random())}`,
      userId: OWNER,
      sessionId: null,
      projectPath: null,
      pattern: 'mcp(github:*)',
      decision: 'allow',
      scope: 'always',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + (lifetimeMs ?? LIFETIME)),
      ...draft,
    },
    LIFETIME,
  );
}

function harness() {
  const rules = new InMemoryPermissionRuleRepository();
  const events = new RecordingAuditEvents();
  const useCase = new RevokeMcpServerRulesUseCase(
    rules,
    new RecordAuditEventUseCase(events, new SequentialIds()),
    new FixedClock(NOW),
  );
  return { rules, events, useCase };
}

describe('RevokeMcpServerRulesUseCase — plan 13, B-26, D-12, S-119', () => {
  it('revokes an allow rule naming the server by its tool — mcp(srv:tool)', async () => {
    const { rules, useCase } = harness();
    const rule = aRule({ id: 'r1', pattern: 'mcp(github:create_issue)' });
    rules.rules.push(rule);

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked.map((r) => r.id)).toEqual(['r1']);
    expect((await rules.findById('r1'))?.revokedAt).toEqual(NOW);
  });

  it('revokes an allow rule naming the whole server — mcp(srv:*)', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'mcp(github:*)' }));

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked.map((r) => r.id)).toEqual(['r1']);
  });

  it('never touches a rule of a different server, by name alone', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'mcp(gitlab:*)' }));
    rules.rules.push(aRule({ id: 'r2', pattern: 'mcp(githubx:read)' }));

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked).toEqual([]);
    expect((await rules.findById('r1'))?.revokedAt).toBeNull();
    expect((await rules.findById('r2'))?.revokedAt).toBeNull();
  });

  it('leaves a deny rule exactly as it was — narrowing never authorises a different program', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'mcp(github:*)', decision: 'deny' }));

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked).toEqual([]);
    expect((await rules.findById('r1'))?.revokedAt).toBeNull();
  });

  it('never touches a rule of another kind, even naming the same text', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'shell(github:*)' }));

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked).toEqual([]);
  });

  it('never touches another user’s rule, even the same pattern', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'mcp(github:*)', userId: OTHER_USER }));

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked).toEqual([]);
  });

  it('never touches an already-expired rule — it stopped applying on its own, not because of this', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(
      aRule({
        id: 'r1',
        pattern: 'mcp(github:*)',
        createdAt: new Date(NOW.getTime() - 2 * LIFETIME),
        expiresAt: new Date(NOW.getTime() - LIFETIME),
      }),
    );

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked).toEqual([]);
  });

  it('reaches a rule restricted to the server’s own engine, never one restricted to another', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'mcp(github:*)', engine: 'claude' }));
    rules.rules.push(aRule({ id: 'r2', pattern: 'mcp(github:*)', engine: 'codex' }));
    rules.rules.push(aRule({ id: 'r3', pattern: 'mcp(github:*)', engine: null }));

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked.map((r) => r.id).sort()).toEqual(['r1', 'r3']);
  });

  it('records every revocation in the trail, por extenso', async () => {
    const { rules, events, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'mcp(github:create_issue)' }));

    await useCase.execute(OWNER, 'claude', 'github');

    expect(events.kinds).toEqual(['permission.ruleRevoked']);
    expect(events.appended[0]).toMatchObject({
      subjectId: 'r1',
      subjectLabel: 'mcp(github:create_issue)',
    });
  });

  it('revokes every matching rule at once, not just the first', async () => {
    const { rules, useCase } = harness();
    rules.rules.push(aRule({ id: 'r1', pattern: 'mcp(github:create_issue)' }));
    rules.rules.push(aRule({ id: 'r2', pattern: 'mcp(github:close_issue)' }));
    rules.rules.push(aRule({ id: 'r3', pattern: 'mcp(gitlab:*)' }));

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('skips a rule that is already revoked by the time this call sees it — twice is once', async () => {
    const base = new InMemoryPermissionRuleRepository();
    const racing = new RacingPermissionRuleRepository(base);
    const matching = aRule({ id: 'r1', pattern: 'mcp(github:*)' });
    racing.alreadyRevoked = [matching.revoke(NOW)];
    const events = new RecordingAuditEvents();
    const useCase = new RevokeMcpServerRulesUseCase(
      racing,
      new RecordAuditEventUseCase(events, new SequentialIds()),
      new FixedClock(NOW),
    );

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked).toEqual([]);
    expect(events.kinds).toEqual([]);
  });

  it('writes nothing for a rule whose revocation lost the race to another writer', async () => {
    const base = new InMemoryPermissionRuleRepository();
    base.rules.push(aRule({ id: 'r1', pattern: 'mcp(github:*)' }));
    const racing = new RacingPermissionRuleRepository(base);
    racing.everyRevocationLosesTheRace = true;
    const events = new RecordingAuditEvents();
    const useCase = new RevokeMcpServerRulesUseCase(
      racing,
      new RecordAuditEventUseCase(events, new SequentialIds()),
      new FixedClock(NOW),
    );

    const revoked = await useCase.execute(OWNER, 'claude', 'github');

    expect(revoked).toEqual([]);
    expect(events.kinds).toEqual([]);
  });
});
