import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/shared/api/api';
import {
  approveDevice,
  fetchDevices,
  revokeDevice,
} from '@/features/devices/services/device.service';

const device = {
  id: 'dev_1',
  name: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
  locale: 'pt-BR',
  status: 'pending',
  pushEnabled: true,
  registeredAt: '2026-09-18T10:00:00.000Z',
  lastSeenAt: '2026-09-18T10:00:00.000Z',
  approvedAt: null,
  revokedAt: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchDevices', () => {
  it('asks the one endpoint there is', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ devices: [] });

    await fetchDevices();

    expect(get).toHaveBeenCalledWith('/devices');
  });

  it('unwraps the envelope, so nothing above it knows the response has one', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ devices: [device] });

    expect(await fetchDevices()).toEqual([device]);
  });

  it('answers an empty list when nobody has installed the app yet', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ devices: [] });

    expect(await fetchDevices()).toEqual([]);
  });

  it('lets the failure through, already translated into an app error by the client', async () => {
    const failure = { code: 'FORBIDDEN', messageKey: 'common.error.forbidden', traceId: 't' };
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchDevices()).rejects.toBe(failure);
  });
});

describe('approveDevice', () => {
  it('posts to the approval of that device', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(device);

    await approveDevice('dev_1');

    expect(post).toHaveBeenCalledWith('/devices/dev_1/approval', {});
  });

  it('escapes an id, so nothing a backend answered can build a path of its own', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(device);

    await approveDevice('dev/../other');

    expect(post).toHaveBeenCalledWith('/devices/dev%2F..%2Fother/approval', {});
  });

  it('answers the device as it now stands', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ ...device, status: 'approved' });

    expect((await approveDevice('dev_1')).status).toBe('approved');
  });
});

describe('revokeDevice', () => {
  it('deletes the approval and leaves the device', async () => {
    const send = vi.spyOn(api, 'request').mockResolvedValue(device);

    await revokeDevice('dev_1');

    expect(send).toHaveBeenCalledWith('/devices/dev_1/approval', { method: 'DELETE' });
  });

  it('answers the device as it now stands', async () => {
    vi.spyOn(api, 'request').mockResolvedValue({ ...device, status: 'revoked' });

    expect((await revokeDevice('dev_1')).status).toBe('revoked');
  });
});
