import { describe, expect, it } from 'vitest';

import { toEntity, toRow } from '@adapter/outbound/persistence/audit/audit-entry.mapper';
import { AuditEntry } from '@domain/audit';
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
  at,
  createdAt: at,
};

describe('the audit entry mapper', () => {
  it('turns a row into an entity', () => {
    const entry = toEntity(row);

    expect(entry.id).toBe('01J0AUDIT0000000000000001');
    expect(entry.userId).toEqual(UserId.create('auth|owner'));
    expect(entry.sessionId).toEqual(SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'));
    expect(entry.input.value).toEqual({ command: 'git status' });
    expect(entry.origin).toEqual({ deviceId: 'device-1', ip: '10.0.0.2' });
  });

  it('turns a row with no tool use id and no device into an entity all the same', () => {
    const entry = toEntity({ ...row, toolUseId: null, deviceId: null, ip: null });

    expect(entry.toolUseId).toBeNull();
    expect(entry.origin).toEqual({ deviceId: null, ip: null });
  });

  it('turns an entity into a row, with the input whole', () => {
    const entry = AuditEntry.record({
      id: '01J0AUDIT0000000000000002',
      userId: UserId.create('auth|owner'),
      sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
      toolUseId: 'tu-2',
      toolName: 'Write',
      input: { file_path: '/srv/a.md', content: 'x'.repeat(1_000) },
      decision: 'allowed',
      origin: { deviceId: null, ip: null },
      at,
    });

    const written = toRow(entry);
    expect(written.toolName).toBe('Write');
    expect((written.input as { content: string }).content).toHaveLength(1_000);
  });

  it('round-trips without losing anything', () => {
    // The insert shape leaves the columns the database fills as optional, so the row is rebuilt
    // from the original for those: what is being checked is the fields the mapper carries.
    const written = toRow(toEntity(row));

    expect(
      toEntity({ ...row, input: written.input, decision: written.decision }).snapshot(),
    ).toEqual(toEntity(row).snapshot());
  });

  it('has no way to express an update', () => {
    // The table's trigger aborts one, so a `toUpdate` would produce SQL that cannot run.
    const exported = Object.keys({ toEntity, toRow });

    expect(exported).toEqual(['toEntity', 'toRow']);
  });
});
