import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useCopy } from '@/shared/hooks/useCopy';

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

function clipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('copying to the clipboard', () => {
  it('copies the text it was given, or the one named, and says it did', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    const { result } = renderHook(() => useCopy('pnpm allowlist add'));

    act(() => {
      result.current.copy();
    });
    await waitFor(() => {
      expect(result.current.state).toBe('copied');
    });
    act(() => {
      result.current.copy('/srv/projects/a');
    });

    expect(writeText.mock.calls).toEqual([['pnpm allowlist add'], ['/srv/projects/a']]);
  });

  it('says so when the browser refuses — "copy it by hand" beats a button that did nothing', async () => {
    clipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const { result } = renderHook(() => useCopy('x'));

    act(() => {
      result.current.copy();
    });

    await waitFor(() => {
      expect(result.current.state).toBe('failed');
    });
  });

  it('says so when there is no clipboard at all — an insecure origin', () => {
    const { result } = renderHook(() => useCopy('x'));

    act(() => {
      result.current.copy();
    });

    expect(result.current.state).toBe('failed');
  });
});
