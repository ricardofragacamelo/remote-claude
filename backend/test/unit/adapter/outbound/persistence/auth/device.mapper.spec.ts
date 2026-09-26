import { describe, expect, it } from 'vitest';

import {
  UnreadableDeviceRowError,
  toEntity,
  toRow,
} from '@adapter/outbound/persistence/auth/device.mapper';
import { anApprovedDevice, aDevice } from '../../../../../support/builders/device.builder';

const now = new Date('2026-09-18T12:00:00.000Z');

const row = {
  id: 'dev_1',
  userId: 'auth|owner',
  installId: 'install-1',
  name: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
  pushToken: 'push-token-abcdef',
  locale: 'pt-BR',
  status: 'pending',
  registeredAt: new Date('2026-09-18T10:00:00.000Z'),
  lastSeenAt: new Date('2026-09-18T10:00:00.000Z'),
  approvedAt: null,
  revokedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe('the device mapper', () => {
  it('reads a row back as the device it was', () => {
    expect(toEntity(row).snapshot()).toEqual(aDevice().snapshot());
  });

  it('writes a device as the row the table expects, stamping updatedAt here', () => {
    expect(toRow(anApprovedDevice(), now)).toMatchObject({
      id: 'dev_1',
      userId: 'auth|owner',
      installId: 'install-1',
      status: 'approved',
      locale: 'pt-BR',
      updatedAt: now,
    });
  });

  it('round-trips without losing anything', () => {
    const device = anApprovedDevice();
    const written = toRow(device, now);

    // Spread back over the read shape: the insert type leaves the defaulted columns optional,
    // and a row coming out of the table never has them absent.
    expect(
      toEntity({
        ...row,
        ...written,
        pushToken: written.pushToken ?? null,
        approvedAt: written.approvedAt ?? null,
        revokedAt: written.revokedAt ?? null,
        createdAt: now,
        updatedAt: now,
      }).snapshot(),
    ).toEqual(device.snapshot());
  });

  // A row the code cannot read is a schema ahead of this build. Guessing which of the three it
  // meant is how a revoked device comes back as pending.
  it('refuses a status this build does not know', () => {
    expect(() => toEntity({ ...row, status: 'quarantined' })).toThrow(UnreadableDeviceRowError);
  });

  it('refuses a platform this build does not know', () => {
    expect(() => toEntity({ ...row, platform: 'kaios' })).toThrow(UnreadableDeviceRowError);
  });

  // A locale it does not know is a language, never a failure: the push still has to go out.
  it('falls back to en for a locale this build does not speak', () => {
    expect(toEntity({ ...row, locale: 'fr' }).locale.value).toBe('en');
  });
});
