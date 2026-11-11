import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSelection } from '@/shared/hooks/useSelection';

describe('useSelection', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useSelection());
    expect(result.current.ids.size).toBe(0);
  });

  it('toggle adds an id not yet selected', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('a');
    });

    expect(result.current.ids.has('a')).toBe(true);
  });

  it('toggle removes an id already selected', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.toggle('a');
    });

    expect(result.current.ids.has('a')).toBe(false);
  });

  it('keeps more than one id selected at once', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('a');
      result.current.toggle('b');
    });

    expect([...result.current.ids].sort()).toEqual(['a', 'b']);
  });

  it('shift-click selects the run from the last plain toggle to the new one (S-177)', () => {
    const { result } = renderHook(() => useSelection());
    const rowIds = ['a', 'b', 'c', 'd'];

    act(() => {
      result.current.toggle('b');
    });
    act(() => {
      result.current.toggle('d', { shiftKey: true, rowIds });
    });

    expect([...result.current.ids].sort()).toEqual(['b', 'c', 'd']);
  });

  it('shift-click selects the same run whichever end comes first in the row order', () => {
    const { result } = renderHook(() => useSelection());
    const rowIds = ['a', 'b', 'c', 'd'];

    act(() => {
      result.current.toggle('c');
    });
    act(() => {
      result.current.toggle('a', { shiftKey: true, rowIds });
    });

    expect([...result.current.ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('shift-click with no prior plain toggle just toggles the row (no anchor yet)', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('a', { shiftKey: true, rowIds: ['a', 'b'] });
    });

    expect([...result.current.ids]).toEqual(['a']);
  });

  it('shift-click without `rowIds` just toggles the row', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.toggle('b', { shiftKey: true });
    });

    expect([...result.current.ids].sort()).toEqual(['a', 'b']);
  });

  it('shift-click falls back to a plain toggle when the anchor fell out of the current rows', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('a', { shiftKey: true, rowIds: ['a', 'b'] });
    });
    act(() => {
      result.current.toggle('c', { shiftKey: true, rowIds: ['b', 'c'] });
    });

    expect([...result.current.ids].sort()).toEqual(['a', 'c']);
  });

  it('selectAll replaces the selection with exactly the given rows', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('z');
    });
    act(() => {
      result.current.selectAll(['a', 'b']);
    });

    expect([...result.current.ids].sort()).toEqual(['a', 'b']);
  });

  it('clear empties the selection and resets the shift-click anchor', () => {
    const { result } = renderHook(() => useSelection());

    act(() => {
      result.current.toggle('a');
    });
    act(() => {
      result.current.clear();
    });

    expect(result.current.ids.size).toBe(0);

    act(() => {
      result.current.toggle('b', { shiftKey: true, rowIds: ['a', 'b'] });
    });

    expect([...result.current.ids]).toEqual(['b']);
  });
});
