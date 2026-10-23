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
});
