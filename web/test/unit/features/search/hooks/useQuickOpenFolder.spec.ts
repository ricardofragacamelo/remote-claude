import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  useMountedQuickOpenFolder,
  useQuickOpenFolder,
} from '@/features/search/hooks/useQuickOpenFolder';

describe('the mounted folder of Quick Open — plan 11, B-14', () => {
  it('is null while no folder tab is on screen', () => {
    const { result } = renderHook(() => useQuickOpenFolder());

    expect(result.current).toBeNull();
  });

  it('is the folder while its tab is on screen, and null again once it is not', () => {
    const mounted = renderHook(({ folder }) => useMountedQuickOpenFolder(folder), {
      initialProps: { folder: '/srv/projects/a' },
    });
    const read = renderHook(() => useQuickOpenFolder());

    expect(read.result.current).toBe('/srv/projects/a');

    mounted.unmount();
    read.rerender();

    expect(read.result.current).toBeNull();
  });

  it('is the latest of several mounted at once, the same stack the editor’s own mirrors', () => {
    const a = renderHook(({ folder }) => useMountedQuickOpenFolder(folder), {
      initialProps: { folder: '/srv/projects/a' },
    });
    const b = renderHook(({ folder }) => useMountedQuickOpenFolder(folder), {
      initialProps: { folder: '/srv/projects/b' },
    });
    const read = renderHook(() => useQuickOpenFolder());

    expect(read.result.current).toBe('/srv/projects/b');

    b.unmount();
    read.rerender();
    expect(read.result.current).toBe('/srv/projects/a');

    a.unmount();
  });
});
