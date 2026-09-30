import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchVersions } from '@/features/about/services/about.service';
import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

describe('the versions of the installation — plan 06, B-32', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks the backend for them, and keeps every component it names', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: '0.4.0', reason: null },
      agentSdk: { version: '0.2.7', reason: null },
      claudeCli: { version: null, reason: 'notInstalled' },
      node: { version: '24.16.0', reason: null },
    });

    expect(await fetchVersions()).toEqual({
      backend: { version: '0.4.0', reason: null },
      agentSdk: { version: '0.2.7', reason: null },
      claudeCli: { version: null, reason: 'notInstalled' },
      node: { version: '24.16.0', reason: null },
    });
    expect(get).toHaveBeenCalledWith('/diag/versions');
  });

  it('reads what it cannot make sense of as "could not be read", never as a blank — S-204', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      backend: { version: '', reason: null },
      agentSdk: { version: 7, reason: 'weird' },
      node: 'nope',
    });

    expect(await fetchVersions()).toEqual({
      backend: { version: null, reason: 'unreadable' },
      agentSdk: { version: null, reason: 'unreadable' },
      claudeCli: { version: null, reason: 'unreadable' },
      node: { version: null, reason: 'unreadable' },
    });
  });

  it('lets the refusal through, as the transport normalised it', async () => {
    const refusal = new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't');
    vi.spyOn(api, 'get').mockRejectedValue(refusal);

    await expect(fetchVersions()).rejects.toBe(refusal);
  });
});
