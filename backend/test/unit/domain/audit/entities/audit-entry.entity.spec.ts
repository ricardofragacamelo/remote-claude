import { describe, expect, it } from 'vitest';

import { AuditEntry, isAuditDecision } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';

const owner = UserId.create('auth|owner');
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const at = new Date('2026-09-18T12:00:00.000Z');

const draft = {
  id: 'entry-1',
  userId: owner,
  sessionId,
  toolUseId: 'tu-1',
  toolName: 'Bash',
  input: { command: 'git status' },
  decision: 'recorded' as const,
  origin: { deviceId: 'device-1', ip: '10.0.0.2' },
  at,
};

describe('AuditEntry', () => {
  it('carries who, what, when, where and the exact input — S-42', () => {
    const entry = AuditEntry.record(draft);

    expect(entry.userId).toBe(owner);
    expect(entry.toolName).toBe('Bash');
    expect(entry.at).toEqual(at);
    expect(entry.origin).toEqual({ deviceId: 'device-1', ip: '10.0.0.2' });
    expect(entry.input.value).toEqual({ command: 'git status' });
  });

  it('keeps a huge input whole — S-49', () => {
    // The log truncates, because a prompt can carry a secret. The trail does not: a record saying
    // the command began with `rm -rf /ho…` answers none of the questions asked of a trail.
    const command = 'x'.repeat(50_000);
    const entry = AuditEntry.record({ ...draft, input: { command } });

    expect((entry.input.value as { command: string }).command).toHaveLength(50_000);
  });

  it('cannot be changed through the object it was built from', () => {
    const input: Record<string, unknown> = { command: 'git status' };
    const entry = AuditEntry.record({ ...draft, input });

    input['command'] = 'rm -rf /';

    expect(entry.input.value).toEqual({ command: 'git status' });
  });

  it('cannot be changed through the value it hands back', () => {
    const entry = AuditEntry.record(draft);

    (entry.input.value as { command: string }).command = 'rm -rf /';

    expect(entry.input.value).toEqual({ command: 'git status' });
  });

  it('has no method that changes anything', () => {
    // Not a convention: the class offers no mutator, the repository offers no update, and the
    // table's trigger aborts one. Three layers, independently.
    const mutators = Object.getOwnPropertyNames(AuditEntry.prototype).filter(
      (name) => name.startsWith('set') || name.startsWith('update') || name.startsWith('change'),
    );

    expect(mutators).toEqual([]);
  });

  it('rehydrates to something indistinguishable from what was recorded', () => {
    const entry = AuditEntry.record(draft);

    expect(AuditEntry.restore(entry.snapshot()).snapshot()).toEqual(entry.snapshot());
  });

  it('accepts an invocation with no tool use id and no device', () => {
    // Both happen: the SDK does not always give an id, and a session opened in a browser has no
    // approved device behind it. A gap in the trail would be worse than a null.
    const entry = AuditEntry.record({
      ...draft,
      toolUseId: null,
      origin: { deviceId: null, ip: null },
    });

    expect(entry.toolUseId).toBeNull();
    expect(entry.origin.deviceId).toBeNull();
  });

  it.each(['recorded', 'allowed', 'denied'] as const)('records the decision %s', (decision) => {
    expect(AuditEntry.record({ ...draft, decision }).decision).toBe(decision);
  });

  it('carries no verdict unless one is given — a hook entry decides nothing', () => {
    expect(AuditEntry.record(draft).verdict).toBeNull();
    expect(AuditEntry.record({ ...draft, verdict: null }).verdict).toBeNull();
  });

  it('carries the verdict of a decision, and hands it back unchanged — S-81', () => {
    const verdict = {
      requestId: 'req-1',
      auto: true,
      ruleId: 'rule-1',
      scope: 'project' as const,
      resolvedBy: owner,
      resolvedFrom: null,
    };
    const entry = AuditEntry.record({ ...draft, decision: 'allowed', verdict });

    expect(entry.verdict).toEqual(verdict);
    expect(AuditEntry.restore(entry.snapshot()).verdict).toEqual(verdict);
  });
});

describe('isAuditDecision', () => {
  it.each(['recorded', 'allowed', 'denied'])('knows %s', (decision) => {
    expect(isAuditDecision(decision)).toBe(true);
  });

  it.each(['allow', 'deny', '', 'RECORDED'])('does not know %j', (decision) => {
    expect(isAuditDecision(decision)).toBe(false);
  });
});
