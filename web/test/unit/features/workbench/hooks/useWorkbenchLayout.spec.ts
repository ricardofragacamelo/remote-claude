import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useWorkbenchLayout } from '@/features/workbench/hooks/useWorkbenchLayout';
import { INITIAL_LAYOUT } from '@/features/workbench/hooks/workbench-layout';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';

const A = '/srv/projects/a';
const B = '/srv/projects/b';

describe('the sizes of a folder tab — plan 06, S-113', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with the initial sizes in a browser that kept none', () => {
    const { result } = renderHook(() => useWorkbenchLayout(A));

    expect(result.current.layout).toEqual(INITIAL_LAYOUT);
  });

  it('keeps the sizes a drag left, per folder — the other folder keeps its own (S-99)', () => {
    const { result } = renderHook(() => useWorkbenchLayout(A));

    act(() => {
      result.current.save({ sideBar: 30, secondary: undefined });
    });

    expect(result.current.layout).toEqual({ ...INITIAL_LAYOUT, sideBar: 30 });
    expect(renderHook(() => useWorkbenchLayout(A)).result.current.layout.sideBar).toBe(30);
    expect(renderHook(() => useWorkbenchLayout(B)).result.current.layout).toEqual(INITIAL_LAYOUT);
  });

  it('keeps a dragged size inside its limits', () => {
    const { result } = renderHook(() => useWorkbenchLayout(A));

    act(() => {
      result.current.save({ panel: 95 });
    });

    expect(result.current.layout.panel).toBe(70);
  });

  it('reads back what an older version left as the initial sizes, with no error', () => {
    localStorage.setItem(`${VISITOR_PREFIX}workbench.layout:${A}`, '{"sideBar":30}');
    localStorage.setItem(
      `${VISITOR_PREFIX}workbench.tabState`,
      JSON.stringify({
        format: 1,
        tabs: { [A]: { 'workbench.layout': { version: 1, state: { sizes: 'wide' } } } },
      }),
    );

    expect(renderHook(() => useWorkbenchLayout(A)).result.current.layout).toEqual(INITIAL_LAYOUT);
  });

  it('carries on with the initial sizes when the storage throws, and keeps a drag for the page', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useWorkbenchLayout(A));

    expect(result.current.layout).toEqual(INITIAL_LAYOUT);
    act(() => {
      result.current.save({ sideBar: 25 });
    });
    expect(result.current.layout.sideBar).toBe(25);
  });
});

describe('what the panels report — plan 06, S-113', () => {
  it('keeps the columns and the panel a person dragged', () => {
    const { result } = renderHook(() => useWorkbenchLayout(A));

    act(() => {
      result.current.columnsChanged(
        { sideBar: 22, center: 44, secondary: 34 },
        { isUserInteraction: true },
      );
      result.current.rowsChanged({ editor: 60, panel: 40 }, { isUserInteraction: true });
    });

    expect(result.current.layout).toEqual({ sideBar: 22, secondary: 34, panel: 40 });
  });

  it('keeps the side bar’s size when it was closed and did not report one', () => {
    const { result } = renderHook(() => useWorkbenchLayout(A));

    act(() => {
      result.current.columnsChanged({ center: 60, secondary: 40 }, { isUserInteraction: true });
    });

    expect(result.current.layout).toEqual({ ...INITIAL_LAYOUT, secondary: 40 });
  });

  it('keeps nothing the library settled on its own — a mount, a window resized', () => {
    const { result } = renderHook(() => useWorkbenchLayout(A));

    act(() => {
      result.current.columnsChanged(
        { sideBar: 12, center: 38, secondary: 50 },
        { isUserInteraction: false },
      );
      result.current.rowsChanged({ editor: 30, panel: 70 }, { isUserInteraction: false });
    });

    expect(result.current.layout).toEqual(INITIAL_LAYOUT);
    expect(localStorage.getItem(`${VISITOR_PREFIX}workbench.tabState`)).toBeNull();
  });
});
