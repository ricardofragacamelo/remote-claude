import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchVersions } from '@/features/about/services/about.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

describe('the versions of the installation — plan 06, B-32; plan 28, B-37', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the backend for them, and keeps every engine it lists', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: '0.4.0', reason: null },
      node: { version: '24.16.0', reason: null },
      defaultEngine: 'claude',
      engines: [
        {
          engine: 'claude',
          displayName: 'Claude',
          state: 'available',
          binary: { version: '2.1.277', reason: null },
          library: { version: '0.3.277', reason: null },
        },
      ],
    });

    expect(await fetchVersions()).toEqual({
      backend: { version: '0.4.0', reason: null },
      node: { version: '24.16.0', reason: null },
      engines: [
        {
          engine: 'claude',
          displayName: 'Claude',
          state: 'available',
          binary: { version: '2.1.277', reason: null },
          library: { version: '0.3.277', reason: null },
        },
      ],
    });
    expect(get).toHaveBeenCalledWith('/diag/versions');
  });

  it('reads an engine with no library to report as having none, never a blank one', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: '0.4.0', reason: null },
      node: { version: '24.16.0', reason: null },
      engines: [
        {
          engine: 'claude',
          displayName: 'Claude',
          state: 'available',
          binary: { version: '2.1.277', reason: null },
          library: null,
        },
      ],
    });

    const versions = await fetchVersions();
    expect(versions.engines[0]?.library).toBeNull();
  });

  it('reads what it cannot make sense of as "could not be read", never as a blank — S-204', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: '', reason: null },
      node: 'nope',
      engines: [
        {
          engine: 'claude',
          displayName: 'Claude',
          state: 'weird',
          binary: { version: 7, reason: 'weird' },
          library: { version: '', reason: null },
        },
      ],
    });

    expect(await fetchVersions()).toEqual({
      backend: { version: null, reason: 'unreadable' },
      node: { version: null, reason: 'unreadable' },
      engines: [
        {
          engine: 'claude',
          displayName: 'Claude',
          state: 'unavailable',
          binary: { version: null, reason: 'unreadable' },
          library: { version: null, reason: 'unreadable' },
        },
      ],
    });
  });

  it('keeps a reason the server actually named, never falling back past it', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: null, reason: 'notInstalled' },
      node: { version: '24.16.0', reason: null },
      engines: [],
    });

    expect((await fetchVersions()).backend).toEqual({ version: null, reason: 'notInstalled' });
  });

  it('reads an engine whose id or name is not text as empty, never as a blank screen', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: '0.4.0', reason: null },
      node: { version: '24.16.0', reason: null },
      engines: [
        {
          engine: 42,
          displayName: null,
          state: 'available',
          binary: { version: '1.0.0', reason: null },
          library: null,
        },
      ],
    });

    expect((await fetchVersions()).engines).toEqual([
      {
        engine: '',
        displayName: '',
        state: 'available',
        binary: { version: '1.0.0', reason: null },
        library: null,
      },
    ]);
  });

  it('reads no engines at all as an empty list, never a failure', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: '0.4.0', reason: null },
      node: { version: '24.16.0', reason: null },
    });

    expect((await fetchVersions()).engines).toEqual([]);
  });

  it('lets the refusal through, as the transport normalised it', async () => {
    const refusal = new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't');
    vi.spyOn(api, 'get').mockRejectedValue(refusal);

    await expect(fetchVersions()).rejects.toBe(refusal);
  });
});
