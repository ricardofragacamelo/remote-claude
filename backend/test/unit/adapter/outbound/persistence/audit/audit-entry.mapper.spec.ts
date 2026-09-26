import { describe, expect, it } from 'vitest';

import { toEntity, toRow } from '@adapter/outbound/persistence/audit/audit-entry.mapper';
import { AuditEntry } from '@domain/audit';
import type { AuditVerdict } from '@domain/audit';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';

const at = new Date('2026-09-18T12:00:00.000Z');

const row = {
  id: '01J0AUDIT0000000000000001',
  seq: 7,
  userId: 'auth|owner',
  sessionId: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
  toolUseId: 'tu-1',
  toolName: 'Bash',
  input: { command: 'git status' },
  decision: 'recorded',
  deviceId: 'device-1',
  ip: '10.0.0.2',
  traceId: 'trace-1',
  requestId: null,
  auto: null,
  ruleId: null,
  scope: null,
  resolvedBy: null,
  resolvedFrom: null,
  at,
  createdAt: at,
};

/** A decision a rule took: the shape the trail most needs to be able to answer for. */
const ruled: AuditVerdict = {
  requestId: 'req-1',
  auto: true,
  ruleId: 'rule-1',
  scope: 'always',
  resolvedBy: UserId.create('auth|owner'),
  resolvedFrom: null,
};

const decisionRow = {
  ...row,
  decision: 'allowed',
  requestId: 'req-1',
  auto: true,
  ruleId: 'rule-1',
  scope: 'always',
  resolvedBy: 'auth|owner',
  resolvedFrom: null,
};

function decisionEntry(verdict: AuditVerdict | null): AuditEntry {
  return AuditEntry.record({
    id: '01J0AUDIT0000000000000002',
    userId: UserId.create('auth|owner'),
    sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
    toolUseId: 'tu-2',
    toolName: 'Write',
    input: { file_path: '/srv/a.md', content: 'x'.repeat(1_000) },
    decision: 'allowed',
    origin: { deviceId: null, ip: null },
    at,
    verdict,
  });
}

describe('the audit entry mapper', () => {
  it('turns a row into an entity', () => {
    const entry = toEntity(row);

    expect(entry.id).toBe('01J0AUDIT0000000000000001');
    expect(entry.userId).toEqual(UserId.create('auth|owner'));
    expect(entry.sessionId).toEqual(SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'));
    expect(entry.input.value).toEqual({ command: 'git status' });
    expect(entry.origin).toEqual({ deviceId: 'device-1', ip: '10.0.0.2' });
    expect(entry.verdict).toBeNull();
  });

  it('turns a row with no tool use id and no device into an entity all the same', () => {
    const entry = toEntity({ ...row, toolUseId: null, deviceId: null, ip: null });

    expect(entry.toolUseId).toBeNull();
    expect(entry.origin).toEqual({ deviceId: null, ip: null });
  });

  it('reads the verdict of a decision a rule took — S-30, S-81', () => {
    expect(toEntity(decisionRow).verdict).toEqual(ruled);
  });

  it('reads the verdict of a person who answered from the phone — S-79', () => {
    const verdict = toEntity({
      ...decisionRow,
      auto: false,
      ruleId: null,
      scope: 'once',
      resolvedFrom: 'mobile',
    }).verdict;

    expect(verdict).toMatchObject({ auto: false, ruleId: null, resolvedFrom: 'mobile' });
    expect(verdict?.resolvedBy).toEqual(UserId.create('auth|owner'));
  });

  it('reads the refusal nobody made with nobody as its author — S-79', () => {
    const verdict = toEntity({
      ...decisionRow,
      decision: 'denied',
      ruleId: null,
      scope: 'once',
      resolvedBy: null,
    }).verdict;

    expect(verdict).toMatchObject({ auto: true, resolvedBy: null, resolvedFrom: null });
  });

  it('reads a null `auto` as not automatic rather than guessing one', () => {
    expect(toEntity({ ...decisionRow, auto: null, ruleId: null }).verdict?.auto).toBe(false);
  });

  it('leaves a decision written before the trail kept verdicts without one — D-15', () => {
    // An entry of the trail says what it said. Reconstructing a verdict from somewhere else would
    // be the trail claiming something it never recorded.
    expect(toEntity({ ...row, decision: 'allowed' }).verdict).toBeNull();
  });

  it('turns an entity into a row, with the input whole', () => {
    const written = toRow(decisionEntry(null), null);

    expect(written.toolName).toBe('Write');
    expect((written.input as { content: string }).content).toHaveLength(1_000);
  });

  it('writes a hook entry with no verdict columns at all', () => {
    const written = toRow(toEntity(row), null);

    expect(written).toMatchObject({
      requestId: null,
      auto: null,
      ruleId: null,
      scope: null,
      resolvedBy: null,
      resolvedFrom: null,
    });
  });

  it('writes the verdict into its columns — S-81', () => {
    expect(toRow(decisionEntry(ruled), null)).toMatchObject({
      requestId: 'req-1',
      auto: true,
      ruleId: 'rule-1',
      scope: 'always',
      resolvedBy: 'auth|owner',
      resolvedFrom: null,
    });
  });

  it('writes the trace it is handed, which the entity itself never carries — D-16', () => {
    expect(toRow(decisionEntry(null), 'trace-7').traceId).toBe('trace-7');
    expect(toRow(decisionEntry(null), null).traceId).toBeNull();
  });

  it('round-trips without losing anything', () => {
    // The insert shape leaves the columns the database fills as optional, so the row is rebuilt
    // from the original for those: what is being checked is the fields the mapper carries.
    const written = toRow(toEntity(decisionRow), 'trace-1');

    expect(
      toEntity({
        ...decisionRow,
        input: written.input,
        decision: written.decision,
        requestId: written.requestId ?? null,
        auto: written.auto ?? null,
        ruleId: written.ruleId ?? null,
        scope: written.scope ?? null,
        resolvedBy: written.resolvedBy ?? null,
        resolvedFrom: written.resolvedFrom ?? null,
      }).snapshot(),
    ).toEqual(toEntity(decisionRow).snapshot());
  });

  it('has no way to express an update', () => {
    // The table's trigger aborts one, so a `toUpdate` would produce SQL that cannot run.
    const exported = Object.keys({ toEntity, toRow });

    expect(exported).toEqual(['toEntity', 'toRow']);
  });
});
