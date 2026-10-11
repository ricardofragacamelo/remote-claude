import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchEngines } from '@/features/session/services/engine.service';
import { api } from '@/shared/api/api';
import { anEngineDto, anEngineList, CAPABILITIES } from '../../../../support/engines';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchEngines — plan 28, B-13', () => {
  it('asks for the engines of the installation, and reads each with what it can do', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(anEngineList());

    const directory = await fetchEngines();

    expect(get).toHaveBeenCalledWith('/engines');
    expect(directory.defaultEngine).toBe('claude');
    expect(
      directory.engines.map((engine) => [engine.id, engine.displayName, engine.state]),
    ).toEqual([
      ['claude', 'Claude', 'available'],
      ['other', 'Other Agent', 'unavailable'],
    ]);
    expect(directory.engines[0]?.capabilities).toEqual(CAPABILITIES);
    expect(directory.engines[1]?.reason).toBe('engine.error.notInstalled');
  });

  it('drops an engine it cannot read, and keeps the rest', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(
      anEngineList({
        engines: [anEngineDto(), anEngineDto({ id: 'broken', capabilities: 'all' }), 'nope'],
      }),
    );

    expect((await fetchEngines()).engines.map((engine) => engine.id)).toEqual(['claude']);
  });

  it('takes the first engine as the default when the answer names none', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(anEngineList({ defaultEngine: '' }));

    expect((await fetchEngines()).defaultEngine).toBe('claude');
  });

  it('reads an answer with no list as no engine, and no default', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ defaultEngine: 7, engines: 'x' });

    expect(await fetchEngines()).toEqual({ defaultEngine: null, engines: [] });
  });

  it('lets a refusal through, as the AppError it already is', async () => {
    const refusal = { code: 'UNAUTHENTICATED', messageKey: 'auth.error.unauthenticated' };
    vi.spyOn(api, 'get').mockRejectedValue(refusal);

    await expect(fetchEngines()).rejects.toBe(refusal);
  });
});
