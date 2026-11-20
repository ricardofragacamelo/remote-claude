import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';

import { useHistoryNav } from '@/features/search/hooks/useHistoryNav';
import { forgetSearchView, searchViewStore } from '@/features/search/store/search-view.store';

const FOLDER = '/srv/projects/a';

function aKey(key: string): KeyboardEvent<HTMLInputElement> {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLInputElement>;
}

describe('useHistoryNav — plan 11, B-18, S-136', () => {
  it('ArrowUp with nothing in history does nothing', () => {
    forgetSearchView(FOLDER);
    const onChange = vi.fn();
    const { result } = renderHook(() => useHistoryNav(FOLDER, '', onChange));

    act(() => {
      result.current.onKeyDown(aKey('ArrowUp'));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ArrowUp walks from the newest entry backwards, ArrowDown walks back to the draft', () => {
    forgetSearchView(FOLDER);
    searchViewStore(FOLDER).getState().pushHistory('one');
    searchViewStore(FOLDER).getState().pushHistory('two');
    const onChange = vi.fn();
    let value = 'typing…';
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useHistoryNav(FOLDER, v, onChange),
      { initialProps: { v: value } },
    );

    act(() => {
      result.current.onKeyDown(aKey('ArrowUp'));
    });
    expect(onChange).toHaveBeenLastCalledWith('two');

    value = 'two';
    rerender({ v: value });
    act(() => {
      result.current.onKeyDown(aKey('ArrowUp'));
    });
    expect(onChange).toHaveBeenLastCalledWith('one');

    value = 'one';
    rerender({ v: value });
    act(() => {
      result.current.onKeyDown(aKey('ArrowUp'));
    });
    expect(onChange).toHaveBeenLastCalledWith('one');

    act(() => {
      result.current.onKeyDown(aKey('ArrowDown'));
    });
    expect(onChange).toHaveBeenLastCalledWith('two');

    value = 'two';
    rerender({ v: value });
    act(() => {
      result.current.onKeyDown(aKey('ArrowDown'));
    });
    expect(onChange).toHaveBeenLastCalledWith('typing…');
  });

  it('ArrowDown while not navigating does nothing', () => {
    forgetSearchView(FOLDER);
    searchViewStore(FOLDER).getState().pushHistory('one');
    const onChange = vi.fn();
    const { result } = renderHook(() => useHistoryNav(FOLDER, '', onChange));

    act(() => {
      result.current.onKeyDown(aKey('ArrowDown'));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('Enter pushes the current value to the front of the history', () => {
    forgetSearchView(FOLDER);
    const onChange = vi.fn();
    const { result } = renderHook(() => useHistoryNav(FOLDER, 'TODO', onChange));

    act(() => {
      result.current.onKeyDown(aKey('Enter'));
    });

    expect(searchViewStore(FOLDER).getState().history).toEqual(['TODO']);
  });

  it('typing a plain character resets the navigation to the live draft', () => {
    forgetSearchView(FOLDER);
    searchViewStore(FOLDER).getState().pushHistory('one');
    const onChange = vi.fn();
    let value = '';
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useHistoryNav(FOLDER, v, onChange),
      { initialProps: { v: value } },
    );

    act(() => {
      result.current.onKeyDown(aKey('ArrowUp'));
    });
    expect(onChange).toHaveBeenLastCalledWith('one');

    value = 'one';
    rerender({ v: value });
    act(() => {
      result.current.onKeyDown(aKey('a'));
    });
    value = 'onea';
    rerender({ v: value });

    act(() => {
      result.current.onKeyDown(aKey('ArrowUp'));
    });
    expect(onChange).toHaveBeenLastCalledWith('one');
  });
});
