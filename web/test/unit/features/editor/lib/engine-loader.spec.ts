import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEngine, setEngineLoader } from '@/features/editor/lib/engine-loader';
import { createPlainEngine } from '@/features/editor/lib/plain-engine';

vi.mock('@/features/editor/lib/monaco-engine', () => ({
  createMonacoEngine: () => ({ kind: 'monaco' }),
}));

afterEach(() => {
  setEngineLoader('monaco', () => Promise.resolve(createPlainEngine()));
});

describe('loading the editor — plan 07, S-204, S-205', () => {
  it('loads each adapter once, however many tabs ask', async () => {
    const loader = vi.fn(() => Promise.resolve(createPlainEngine()));
    setEngineLoader('monaco', loader);

    const [first, second] = await Promise.all([loadEngine('monaco'), loadEngine('monaco')]);

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('says a failed load in the editor’s own words, and tries again for real', async () => {
    const loader = vi
      .fn<() => Promise<ReturnType<typeof createPlainEngine>>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce(createPlainEngine());
    setEngineLoader('monaco', loader);

    await expect(loadEngine('monaco')).rejects.toMatchObject({
      code: 'NETWORK_UNREACHABLE',
      messageKey: 'editor.load.failed',
    });
    await expect(loadEngine('monaco')).resolves.toMatchObject({ kind: 'plain' });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('loads Monaco from its own chunk by default, and the simplified mode from nothing', async () => {
    setEngineLoader('monaco');

    await expect(loadEngine('monaco')).resolves.toEqual({ kind: 'monaco' });
    await expect(loadEngine('plain')).resolves.toMatchObject({ kind: 'plain' });
  });
});
