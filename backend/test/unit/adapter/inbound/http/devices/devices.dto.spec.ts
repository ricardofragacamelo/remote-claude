import { describe, expect, it } from 'vitest';

import { registerDeviceSchema, toDeviceDto } from '@adapter/inbound/http/devices/devices.dto';
import { anApprovedDevice, aDevice } from '../../../../../support/builders/device.builder';

const valid = {
  installId: 'install-1',
  name: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
};

describe('the register-device payload', () => {
  it('accepts the four fields the app always sends', () => {
    expect(registerDeviceSchema.safeParse(valid).success).toBe(true);
  });

  // S-12: no push token is a device that watches, not a refusal.
  it('accepts a registration with no push token and no language', () => {
    const parsed = registerDeviceSchema.safeParse(valid);

    expect(parsed.success && parsed.data.pushToken).toBeUndefined();
    expect(parsed.success && parsed.data.locale).toBeUndefined();
  });

  it.each([
    ['an empty install id', { ...valid, installId: '' }],
    ['an empty name', { ...valid, name: '' }],
    ['a platform this build does not have', { ...valid, platform: 'kaios' }],
    ['a language this build does not speak', { ...valid, locale: 'fr' }],
    ['an empty push token', { ...valid, pushToken: '' }],
    ['no install id at all', { name: 'Pixel 8', platform: 'android', appVersion: '1.0.0' }],
  ])('refuses %s', (_, body) => {
    expect(registerDeviceSchema.safeParse(body).success).toBe(false);
  });

  it('refuses an install id longer than the column will take', () => {
    expect(registerDeviceSchema.safeParse({ ...valid, installId: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});

describe('the device the client sees', () => {
  // S-14, at this edge: the token is a credential for reaching somebody's phone. It does not go
  // out truncated, hashed or last-six — it does not go out.
  it('never carries the push token, in any form', () => {
    const dto = toDeviceDto(aDevice({ pushToken: 'push-token-abcdef' }));

    expect(JSON.stringify(dto)).not.toContain('abcdef');
    expect(JSON.stringify(dto)).not.toContain('push-token');
    expect(Object.keys(dto)).not.toContain('pushToken');
  });

  // What the screen can act on is whether the device is reachable at all.
  it('says whether there is a token, which is what the screen can act on', () => {
    expect(toDeviceDto(aDevice({ pushToken: 'anything' })).pushEnabled).toBe(true);
    expect(toDeviceDto(aDevice({ pushToken: null })).pushEnabled).toBe(false);
  });

  it('carries the state and its instants as ISO strings', () => {
    const dto = toDeviceDto(anApprovedDevice());

    expect(dto).toMatchObject({
      id: 'dev_1',
      name: 'Pixel 8',
      platform: 'android',
      appVersion: '1.0.0',
      locale: 'pt-BR',
      status: 'approved',
      registeredAt: '2026-09-18T10:00:00.000Z',
      approvedAt: '2026-09-18T10:00:00.000Z',
      revokedAt: null,
    });
  });

  it('never carries the install id either — the browser has no use for it', () => {
    expect(Object.keys(toDeviceDto(aDevice()))).not.toContain('installId');
  });
});
