import { describe, expect, it } from 'vitest';

import { toEntity, toRow } from '@adapter/outbound/persistence/diag/diag-session.mapper';
import { InvalidSessionIdError } from '@domain/session';
import { aDiagSession } from '../../../../../support/builders/diag-session.builder';

const row = {
  id: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
  ownerId: 'auth|owner',
  openedAt: new Date('2026-09-13T12:00:00.000Z'),
  lastPingedAt: new Date('2026-09-13T12:05:00.000Z'),
  pingCount: 3,
  createdAt: new Date('2026-09-13T12:00:00.000Z'),
  updatedAt: new Date('2026-09-13T12:05:00.000Z'),
};

describe('session mapper', () => {
  it('turns a row into an entity, not the other way round', () => {
    const session = toEntity(row);

    expect(session.id.value).toBe(row.id);
    expect(session.ownerId.value).toBe(row.ownerId);
    expect(session.pingCount).toBe(3);
    expect(session.lastPingedAt).toEqual(row.lastPingedAt);
  });

  it('refuses a row whose identifier the domain would not accept', () => {
    expect(() => toEntity({ ...row, id: 'corrupted' })).toThrow(InvalidSessionIdError);
  });

  it('turns an entity into the row to write, stamping the update instant', () => {
    const now = new Date('2026-09-13T13:00:00.000Z');

    expect(toRow(aDiagSession({ pingCount: 2 }), now)).toEqual({
      id: '01J0ABCDEFGHJKMNPQRSTVWXYZ',
      ownerId: 'auth|owner',
      openedAt: new Date('2026-09-13T12:00:00.000Z'),
      lastPingedAt: new Date('2026-09-13T12:00:00.000Z'),
      pingCount: 2,
      updatedAt: now,
    });
  });

  it('round-trips an entity through a row', () => {
    const original = toEntity(row);

    const written = toRow(original, row.updatedAt);

    // The insert shape leaves the audit columns to the database; the read shape always has them,
    // so the round trip fills them back in from the row this fixture started with.
    expect(
      toEntity({
        ...row,
        id: written.id,
        ownerId: written.ownerId,
        openedAt: written.openedAt,
        lastPingedAt: written.lastPingedAt,
        pingCount: written.pingCount ?? 0,
      }).snapshot(),
    ).toEqual(original.snapshot());
  });
});
