import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';

import { atEnd, useFollowTail } from '@/features/session/hooks/useFollowTail';
import type { ScrollKeeper } from '@/features/session/hooks/useFollowTail';
import { useScrollKeeper } from '@/features/session/hooks/useScrollKeeper';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import type { ScrollMemory } from '@/features/session/store/claude-panel.store';

/** The observers of sizes the hook made — jsdom lays nothing out, so the test says when sizes change. */
const observed = vi.hoisted(() => new Set<() => void>());

class ObservedSizes {
  constructor(private readonly changed: () => void) {}
  observe(): void {
    observed.add(this.changed);
  }
  disconnect(): void {
    observed.delete(this.changed);
  }
}

beforeEach(() => {
  observed.clear();
  vi.stubGlobal('ResizeObserver', ObservedSizes);
});

afterEach(() => {
  vi.unstubAllGlobals();
  forgetClaudePanel(null);
});

/** A scroller of jsdom with the sizes a test gives it. */
function aScroller(sizes: { scrollHeight: number; clientHeight: number }): HTMLElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollHeight', { get: () => sizes.scrollHeight });
  Object.defineProperty(element, 'clientHeight', { get: () => sizes.clientHeight });
  return element;
}

function grew(): void {
  for (const changed of [...observed]) changed();
}

/** A keeper over a plain variable — what the panel's store would keep. */
function aKeeper(key: string, start?: ScrollMemory): ScrollKeeper & { kept?: ScrollMemory } {
  const keeper: ScrollKeeper & { kept?: ScrollMemory } = {
    key,
    read: () => keeper.kept,
    write: (memory) => {
      keeper.kept = memory;
    },
  };
  if (start !== undefined) keeper.kept = start;
  return keeper;
}

describe('the end of the conversation, followed — plan 09, B-05', () => {
  it('says the end is in view within a line of it', () => {
    const element = aScroller({ scrollHeight: 1_000, clientHeight: 200 });
    element.scrollTop = 780;
    expect(atEnd(element)).toBe(true);
    element.scrollTop = 700;
    expect(atEnd(element)).toBe(false);
  });

  it('starts at the end, follows what grows, and stops while the person reads above — S-07', () => {
    const sizes = { scrollHeight: 1_000, clientHeight: 200 };
    const scroller = { current: aScroller(sizes) };
    const content = { current: document.createElement('div') };
    const keeper = aKeeper('session:a');
    renderHook(() => {
      useFollowTail(scroller, content, keeper);
    });

    expect(scroller.current.scrollTop).toBe(1_000);
    sizes.scrollHeight = 1_400;
    grew();
    expect(scroller.current.scrollTop).toBe(1_400);

    scroller.current.scrollTop = 300;
    fireEvent.scroll(scroller.current);
    expect(keeper.kept).toEqual({ top: 300, following: false });
    sizes.scrollHeight = 1_800;
    grew();
    expect(scroller.current.scrollTop).toBe(300);

    // Back at the end, it follows again.
    scroller.current.scrollTop = 1_600;
    fireEvent.scroll(scroller.current);
    sizes.scrollHeight = 2_400;
    grew();
    expect(scroller.current.scrollTop).toBe(2_400);
  });

  it('gives back where the person left it, when it comes back — S-08, S-16', () => {
    const scroller = { current: aScroller({ scrollHeight: 1_000, clientHeight: 200 }) };
    const content = { current: null };
    renderHook(() => {
      useFollowTail(scroller, content, aKeeper('session:a', { top: 250, following: false }));
    });

    expect(scroller.current.scrollTop).toBe(250);
  });

  it('starts at the top and follows nothing without a keeper — the changes', () => {
    const sizes = { scrollHeight: 1_000, clientHeight: 200 };
    const scroller = { current: aScroller(sizes) };
    renderHook(() => {
      useFollowTail(scroller, { current: null }, null);
    });

    expect(scroller.current.scrollTop).toBe(0);
    expect(observed.size).toBe(0);
  });

  it('says whether the end is followed, and goes back to it on request — plan 22, S-84', () => {
    const sizes = { scrollHeight: 1_000, clientHeight: 200 };
    const scroller = { current: aScroller(sizes) };
    const keeper = aKeeper('conversation:a');
    const { result } = renderHook(() => useFollowTail(scroller, { current: null }, keeper));

    expect(result.current.following).toBe(true);

    scroller.current.scrollTop = 300;
    act(() => {
      fireEvent.scroll(scroller.current);
    });
    expect(result.current.following).toBe(false);

    sizes.scrollHeight = 1_600;
    act(() => {
      result.current.toEnd();
    });

    expect(result.current.following).toBe(true);
    expect(scroller.current.scrollTop).toBe(1_600);
    expect(keeper.kept).toEqual({ top: 1_600, following: true });
    sizes.scrollHeight = 2_000;
    grew();
    expect(scroller.current.scrollTop).toBe(2_000);
  });

  it('starts each new content where it was left', () => {
    const scroller = { current: aScroller({ scrollHeight: 1_000, clientHeight: 200 }) };
    let keeper = aKeeper('conversation:a');
    const { result, rerender } = renderHook(() =>
      useFollowTail(scroller, { current: null }, keeper),
    );
    expect(result.current.following).toBe(true);

    keeper = aKeeper('conversation:b', { top: 10, following: false });
    rerender();

    expect(result.current.following).toBe(false);
  });

  it('goes nowhere without a scroller or a keeper', () => {
    const none = renderHook(() =>
      useFollowTail({ current: null }, { current: null }, aKeeper('a')),
    );
    const scroller = { current: aScroller({ scrollHeight: 1_000, clientHeight: 200 }) };
    const unkept = renderHook(() => useFollowTail(scroller, { current: null }, null));

    act(() => {
      none.result.current.toEnd();
      unkept.result.current.toEnd();
    });

    expect(scroller.current.scrollTop).toBe(0);
  });

  it('does nothing before there is a scroller', () => {
    renderHook(() => {
      useFollowTail({ current: null }, { current: null }, aKeeper('session:a'));
    });

    expect(observed.size).toBe(0);
  });
});

describe('where each conversation was left — plan 09, B-05', () => {
  it('keeps it in the panel of its folder tab, apart from the other tabs — S-17', () => {
    const one = renderHook(() => useScrollKeeper('/a', 'session:x')).result.current;
    const other = renderHook(() => useScrollKeeper('/b', 'session:x')).result.current;

    one?.write({ top: 120, following: false });

    expect(one?.read()).toEqual({ top: 120, following: false });
    expect(other?.read()).toBeUndefined();
    expect(claudePanelStore('/a').getState().scrolls['session:x']).toEqual({
      top: 120,
      following: false,
    });
  });

  it('keeps nothing for what is not a conversation', () => {
    expect(renderHook(() => useScrollKeeper('/a', null)).result.current).toBeNull();
  });

  it('forgets it with the tab', () => {
    const panel = claudePanelStore('/a').getState();
    panel.show('session', 'x');
    panel.setScroll('session:x', { top: 10, following: false });

    claudePanelStore('/a').getState().close('session:x');

    expect(claudePanelStore('/a').getState().scrolls).toEqual({});
  });
});
