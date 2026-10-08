import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { AppError } from '@/shared/api/errors';
import { useObjectUrl } from '@/shared/hooks/useObjectUrl';
import type { ObjectSource } from '@/shared/hooks/useObjectUrl';
import { fakeObjectUrls } from '../../../support/raw-api';

afterEach(() => {
  vi.restoreAllMocks();
});

const refused = new AppError('NOT_FOUND', 'errors.notFound', 'trace-1');

/** A source whose reads the test settles by hand, in the order it chooses. */
function manualSource(): {
  readonly source: ObjectSource;
  readonly signals: AbortSignal[];
  settle(index: number, blob: Blob): void;
  fail(index: number, error: unknown): void;
} {
  const signals: AbortSignal[] = [];
  const settlers: { resolve(blob: Blob): void; reject(error: unknown): void }[] = [];

  return {
    source: {
      read: (signal) =>
        new Promise<Blob>((resolve, reject) => {
          signals.push(signal);
          settlers.push({ resolve, reject });
        }),
      failure: () => refused,
    },
    signals,
    settle: (index, blob) => {
      settlers[index]?.resolve(blob);
    },
    fail: (index, error) => {
      settlers[index]?.reject(error);
    },
  };
}

const png = new Blob(['png'], { type: 'image/png' });

/** Bytes by a `blob:` the page made — the shared half of the preview and the prompt image. */
describe('useObjectUrl', () => {
  it('reads nothing while there is no source', () => {
    const { result } = renderHook(() => useObjectUrl(['a'], null));

    expect(result.current).toMatchObject({ url: null, error: null });
  });

  it('shows the bytes by a blob: of its own, and revokes it when the view goes', async () => {
    const urls = fakeObjectUrls();
    const reads = manualSource();
    const { result, unmount } = renderHook(() => useObjectUrl(['a'], reads.source));

    reads.settle(0, png);

    await waitFor(() => {
      expect(result.current.url).toBe('blob:http://localhost/object-1');
    });

    unmount();

    expect(urls.revoked).toEqual(['blob:http://localhost/object-1']);
  });

  it('says what the source makes of a failure', async () => {
    const reads = manualSource();
    const { result } = renderHook(() => useObjectUrl(['a'], reads.source));

    reads.fail(0, new Error('network'));

    await waitFor(() => {
      expect(result.current.error).toBe(refused);
    });
    expect(result.current.url).toBeNull();
  });

  it('reads again on retry, and drops the URL of the read before', async () => {
    const urls = fakeObjectUrls();
    const reads = manualSource();
    const { result } = renderHook(() => useObjectUrl(['a'], reads.source));

    reads.settle(0, png);
    await waitFor(() => {
      expect(result.current.url).not.toBeNull();
    });

    act(() => {
      result.current.retry();
    });

    expect(urls.revoked).toEqual(['blob:http://localhost/object-1']);
    expect(result.current.url).toBeNull();

    reads.settle(1, png);
    await waitFor(() => {
      expect(result.current.url).toBe('blob:http://localhost/object-2');
    });
  });

  it('aborts a read still on its way, and shows nothing it answers late', async () => {
    const urls = fakeObjectUrls();
    const reads = manualSource();
    const { result, rerender } = renderHook(
      ({ parts }: { parts: readonly string[] }) => useObjectUrl(parts, reads.source),
      { initialProps: { parts: ['a'] as readonly string[] } },
    );

    rerender({ parts: ['b'] });

    expect(reads.signals[0]?.aborted).toBe(true);

    reads.settle(0, png);
    reads.fail(0, new Error('late'));
    await Promise.resolve();

    expect(urls.made).toEqual([]);
    expect(result.current).toMatchObject({ url: null, error: null });
  });

  it('keeps the URL of the current read when an older one is revoked', async () => {
    const urls = fakeObjectUrls();
    const first = manualSource();
    const second = manualSource();
    const { result, rerender } = renderHook(
      ({ source }: { source: ObjectSource }) => useObjectUrl(['a'], source),
      { initialProps: { source: first.source } },
    );

    first.settle(0, png);
    await waitFor(() => {
      expect(result.current.url).toBe('blob:http://localhost/object-1');
    });

    // Same parts, another source: the old URL goes, the new read is the one on screen.
    rerender({ source: second.source });
    second.settle(0, png);

    await waitFor(() => {
      expect(result.current.url).toBe('blob:http://localhost/object-2');
    });
    expect(urls.revoked).toEqual(['blob:http://localhost/object-1']);
  });
});
