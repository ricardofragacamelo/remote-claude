import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useRuleListNav } from '@/features/permission/hooks/useRuleListNav';

function keyEvent(key: string): React.KeyboardEvent {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

describe('the rules list’s own keyboard nav — S-168', () => {
  function handlers() {
    return { onOpen: vi.fn(), onToggleSelected: vi.fn(), onRevoke: vi.fn() };
  }

  it('starts with nothing focused', () => {
    const hook = renderHook(() => useRuleListNav(['a', 'b'], handlers()));

    expect(hook.result.current.focusedId).toBeNull();
  });

  it('moves to the first row on the first ArrowDown, then to the next', () => {
    const hook = renderHook(() => useRuleListNav(['a', 'b', 'c'], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
    });
    expect(hook.result.current.focusedId).toBe('a');

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
    });
    expect(hook.result.current.focusedId).toBe('b');
  });

  it('does not move past the last row', () => {
    const hook = renderHook(() => useRuleListNav(['a', 'b'], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
    });

    expect(hook.result.current.focusedId).toBe('b');
  });

  it('does not move before the first row', () => {
    const hook = renderHook(() => useRuleListNav(['a', 'b'], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowUp'));
    });

    expect(hook.result.current.focusedId).toBe('a');
  });

  it('treats `j`/`k` as ArrowDown/ArrowUp', () => {
    const hook = renderHook(() => useRuleListNav(['a', 'b'], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('j'));
      hook.result.current.onKeyDown(keyEvent('j'));
      hook.result.current.onKeyDown(keyEvent('k'));
    });

    expect(hook.result.current.focusedId).toBe('a');
  });

  it('moves to nothing when the list is empty', () => {
    const hook = renderHook(() => useRuleListNav([], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
    });

    expect(hook.result.current.focusedId).toBeNull();
  });

  it('selects the focused row on Space', () => {
    const toggle = vi.fn();
    const hook = renderHook(() =>
      useRuleListNav(['a'], { ...handlers(), onToggleSelected: toggle }),
    );

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
    });
    act(() => {
      hook.result.current.onKeyDown(keyEvent(' '));
    });

    expect(toggle).toHaveBeenCalledWith('a');
  });

  it('opens the focused row on Enter', () => {
    const onOpen = vi.fn();
    const hook = renderHook(() => useRuleListNav(['a'], { ...handlers(), onOpen }));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
    });
    act(() => {
      hook.result.current.onKeyDown(keyEvent('Enter'));
    });

    expect(onOpen).toHaveBeenCalledWith('a');
  });

  it('revokes the focused row on Delete', () => {
    const onRevoke = vi.fn();
    const hook = renderHook(() => useRuleListNav(['a'], { ...handlers(), onRevoke }));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
    });
    act(() => {
      hook.result.current.onKeyDown(keyEvent('Delete'));
    });

    expect(onRevoke).toHaveBeenCalledWith('a');
  });

  it('drops the focus on Escape', () => {
    const hook = renderHook(() => useRuleListNav(['a'], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
      hook.result.current.onKeyDown(keyEvent('Escape'));
    });

    expect(hook.result.current.focusedId).toBeNull();
  });

  it('does nothing for Space/Enter/Delete with nothing focused', () => {
    const current = handlers();
    const hook = renderHook(() => useRuleListNav(['a'], current));

    act(() => {
      hook.result.current.onKeyDown(keyEvent(' '));
      hook.result.current.onKeyDown(keyEvent('Enter'));
      hook.result.current.onKeyDown(keyEvent('Delete'));
    });

    expect(current.onToggleSelected).not.toHaveBeenCalled();
    expect(current.onOpen).not.toHaveBeenCalled();
    expect(current.onRevoke).not.toHaveBeenCalled();
  });

  it('ignores a key it does not answer to', () => {
    const hook = renderHook(() => useRuleListNav(['a'], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('Tab'));
    });

    expect(hook.result.current.focusedId).toBeNull();
  });

  it('clears the focus on demand', () => {
    const hook = renderHook(() => useRuleListNav(['a'], handlers()));

    act(() => {
      hook.result.current.onKeyDown(keyEvent('ArrowDown'));
      hook.result.current.clear();
    });

    expect(hook.result.current.focusedId).toBeNull();
  });
});
