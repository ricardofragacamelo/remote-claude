import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useRequestsInView } from '@/features/session/hooks/useRequestsInView';

/** The way to a question out of view — plan 09, B-25. */
describe('the requests in view', () => {
  it('has nothing out of view, and nowhere to go, with nothing asked', () => {
    const showChat = vi.fn();
    const { result } = renderHook(() => useRequestsInView({ current: null }, [], showChat));

    expect(result.current.outOfView).toBe(false);
    act(() => {
      result.current.goToOldest();
    });
    expect(showChat).not.toHaveBeenCalled();
  });

  it('counts a request out of view outside any frame, and brings the conversation back to it', () => {
    const showChat = vi.fn();
    const { result } = renderHook(() =>
      useRequestsInView({ current: document.createElement('div') }, ['req-1'], showChat),
    );

    expect(result.current.outOfView).toBe(true);
    act(() => {
      result.current.goToOldest();
    });
    expect(showChat).toHaveBeenCalledTimes(1);
  });

  it('goes to the request without a conversation to bring back', () => {
    const { result } = renderHook(() => useRequestsInView({ current: null }, ['req-1']));

    expect(() => {
      act(() => {
        result.current.goToOldest();
      });
    }).not.toThrow();
  });
});
