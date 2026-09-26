import { describe, expect, it } from 'vitest';

import { DEVICE_PLATFORMS, DEVICE_STATUSES, isDevicePlatform, isDeviceStatus } from '@domain/auth';

describe('device status and platform', () => {
  it.each(DEVICE_STATUSES)('recognises %s as a status', (status) => {
    expect(isDeviceStatus(status)).toBe(true);
  });

  it.each(['', 'expired', 'PENDING'])('refuses %s as a status', (raw) => {
    expect(isDeviceStatus(raw)).toBe(false);
  });

  it.each(DEVICE_PLATFORMS)('recognises %s as a platform', (platform) => {
    expect(isDevicePlatform(platform)).toBe(true);
  });

  it.each(['', 'web', 'Android'])('refuses %s as a platform', (raw) => {
    expect(isDevicePlatform(raw)).toBe(false);
  });

  it('has exactly the three states the table constrains', () => {
    expect([...DEVICE_STATUSES]).toEqual(['pending', 'approved', 'revoked']);
  });
});
