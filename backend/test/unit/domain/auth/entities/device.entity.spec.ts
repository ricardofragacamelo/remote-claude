import { describe, expect, it } from 'vitest';

import {
  Device,
  DeviceNotRegisteredError,
  DeviceRevokedError,
  PENDING_DEVICE_TTL_MS,
  UserId,
} from '@domain/auth';
import {
  aDevice,
  anApprovedDevice,
  aRevokedDevice,
  registeredAt,
} from '../../../../support/builders/device.builder';

const later = new Date(registeredAt.getTime() + 60_000);

describe('Device', () => {
  // S-01: every device starts pending. Nothing registers itself into being allowed.
  it('is born pending, whatever the app sent', () => {
    const device = aDevice();

    expect(device.status).toBe('pending');
    expect(device.canDecide).toBe(false);
    expect(device.snapshot().approvedAt).toBeNull();
    expect(device.snapshot().revokedAt).toBeNull();
  });

  // S-12: no push token is a device that watches. It is not a refusal.
  it('accepts a registration with no push token', () => {
    expect(aDevice({ pushToken: null }).pushToken).toBeNull();
  });

  // S-11: an absent locale is a language, not a failure.
  it('falls back to en when the app named no language', () => {
    expect(aDevice({ locale: null }).locale.value).toBe('en');
  });

  it('rehydrates to something indistinguishable from what was registered', () => {
    const device = aDevice();

    expect(Device.restore(device.snapshot()).snapshot()).toEqual(device.snapshot());
  });

  describe('refresh', () => {
    // S-02: the app calls this on every launch. It updates and never adds, and never approves.
    it('updates what the app can tell us and leaves the status alone', () => {
      const refreshed = anApprovedDevice().refresh({
        name: 'Pixel 9',
        platform: 'android',
        appVersion: '1.1.0',
        pushToken: 'fresh-token',
        locale: 'en',
        at: later,
      });

      expect(refreshed.snapshot()).toMatchObject({
        name: 'Pixel 9',
        appVersion: '1.1.0',
        pushToken: 'fresh-token',
        status: 'approved',
        lastSeenAt: later,
        registeredAt,
      });
      expect(refreshed.locale.value).toBe('en');
    });

    it('leaves a revoked device revoked — reopening the app does not undo a revocation', () => {
      const refreshed = aRevokedDevice().refresh({
        name: 'Pixel 8',
        platform: 'android',
        appVersion: '1.0.0',
        pushToken: 'fresh-token',
        locale: 'pt-BR',
        at: later,
      });

      expect(refreshed.status).toBe('revoked');
    });
  });

  // D-13: the token the provider refused goes; the approval stays.
  it('forgets a refused push token without losing the approval', () => {
    const device = anApprovedDevice().forgetPushToken();

    expect(device.pushToken).toBeNull();
    expect(device.canDecide).toBe(true);
  });

  describe('approve', () => {
    it('lets a pending device decide, and records when', () => {
      const device = aDevice().approve(later);

      expect(device.status).toBe('approved');
      expect(device.canDecide).toBe(true);
      expect(device.snapshot().approvedAt).toEqual(later);
    });

    it('is the same object when the device is already approved — a second click is not a second approval', () => {
      const approved = anApprovedDevice();

      expect(approved.approve(later)).toBe(approved);
    });

    // S-10: revoked is terminal, which is what makes the race deterministic.
    it('refuses a revoked device', () => {
      expect(() => aRevokedDevice().approve(later)).toThrow(DeviceRevokedError);
    });
  });

  describe('revoke', () => {
    it('takes the device out, and records when', () => {
      const device = anApprovedDevice().revoke(later);

      expect(device.status).toBe('revoked');
      expect(device.canDecide).toBe(false);
      expect(device.snapshot().revokedAt).toEqual(later);
    });

    // S-09: revoking twice is the same fact stated twice.
    it('is the same object when the device is already revoked', () => {
      const revoked = aRevokedDevice();

      expect(revoked.revoke(later)).toBe(revoked);
    });

    it('revokes a device nobody ever approved', () => {
      expect(aDevice().revoke(later).status).toBe('revoked');
    });
  });

  // S-10: both orders end revoked, which is the safe end.
  it('ends revoked whichever way an approval and a revocation race', () => {
    const revokedThenApproved = () => aDevice().revoke(later).approve(later);

    expect(aDevice().approve(later).revoke(later).status).toBe('revoked');
    expect(revokedThenApproved).toThrow(DeviceRevokedError);
  });

  describe('hasPendingExpired', () => {
    const day = 24 * 60 * 60 * 1000;
    const at = (days: number) => new Date(registeredAt.getTime() + days * day);

    // S-60: the sixth day is still approvable, the eighth is gone.
    it('is false on the sixth day and true on the eighth', () => {
      expect(aDevice().hasPendingExpired(at(6))).toBe(false);
      expect(aDevice().hasPendingExpired(at(8))).toBe(true);
    });

    it('is false exactly on the deadline — the boundary belongs to the device', () => {
      expect(
        aDevice().hasPendingExpired(new Date(registeredAt.getTime() + PENDING_DEVICE_TTL_MS)),
      ).toBe(false);
    });

    it.each([
      ['approved', anApprovedDevice()],
      ['revoked', aRevokedDevice()],
    ])('never expires a %s device — only a forgotten registration goes', (_, device) => {
      expect(device.hasPendingExpired(at(30))).toBe(false);
    });
  });

  describe('ensureCanDecide', () => {
    it('lets an approved device through', () => {
      expect(() => anApprovedDevice().ensureCanDecide()).not.toThrow();
    });

    // S-04 and S-05: two errors, because they say different things to whoever holds the phone.
    it('refuses a pending device with DEVICE_NOT_REGISTERED', () => {
      expect(() => aDevice().ensureCanDecide()).toThrow(DeviceNotRegisteredError);
      expect(() => aDevice().ensureCanDecide()).toThrow(
        expect.objectContaining({ code: 'DEVICE_NOT_REGISTERED' }) as Error,
      );
    });

    it('refuses a revoked device with DEVICE_REVOKED', () => {
      expect(() => aRevokedDevice().ensureCanDecide()).toThrow(DeviceRevokedError);
      expect(() => aRevokedDevice().ensureCanDecide()).toThrow(
        expect.objectContaining({ code: 'DEVICE_REVOKED' }) as Error,
      );
    });
  });

  // S-59: the identity is the pair, so the same phone under two accounts is two devices.
  it('keeps the owner it was registered under', () => {
    const other = UserId.create('auth|other');

    expect(aDevice({ userId: other }).userId.value).toBe('auth|other');
    expect(aDevice().userId.value).toBe('auth|owner');
  });
});
