import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePromptImage } from '@/features/session/hooks/usePromptImage';
import { api } from '@/shared/api/api';
import type { BytesResponse } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { fakeObjectUrls } from '../../../../support/raw-api';

afterEach(() => {
  vi.restoreAllMocks();
});

function answer(): BytesResponse {
  return { status: 200, blob: new Blob(['png'], { type: 'image/png' }), header: () => null };
}

/** The image of a prompt, by a `blob:` of its own — plan 22, B-30. */
describe('usePromptImage', () => {
  it('reads nothing while no image is open', () => {
    const bytes = vi.spyOn(api, 'bytes').mockResolvedValue(answer());

    const { result } = renderHook(() => usePromptImage('c1', null));
    renderHook(() => usePromptImage(null, 'u1:1'));

    expect(bytes).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ url: null, error: null });
  });

  it('shows the image by a blob: it made, and revokes it once closed — S-119', async () => {
    const urls = fakeObjectUrls();
    const bytes = vi.spyOn(api, 'bytes').mockResolvedValue(answer());

    const { result, rerender } = renderHook(
      ({ blockId }: { blockId: string | null }) => usePromptImage('c1', blockId),
      { initialProps: { blockId: 'u1:1' as string | null } },
    );

    await waitFor(() => {
      expect(result.current.url).toBe('blob:http://localhost/object-1');
    });
    expect(bytes).toHaveBeenCalledWith(
      '/transcripts/c1/images/u1%3A1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    rerender({ blockId: null });

    expect(urls.revoked).toEqual(['blob:http://localhost/object-1']);
    expect(result.current.url).toBeNull();
  });

  it('revokes the blob: when the view goes', async () => {
    const urls = fakeObjectUrls();
    vi.spyOn(api, 'bytes').mockResolvedValue(answer());

    const { result, unmount } = renderHook(() => usePromptImage('c1', 'u1:1'));
    await waitFor(() => {
      expect(result.current.url).not.toBeNull();
    });
    unmount();

    expect(urls.revoked).toHaveLength(1);
  });

  it('opened again, reads it again rather than show a revoked blob:', async () => {
    const urls = fakeObjectUrls();
    const bytes = vi.spyOn(api, 'bytes').mockResolvedValue(answer());
    const { result, rerender } = renderHook(
      ({ blockId }: { blockId: string | null }) => usePromptImage('c1', blockId),
      { initialProps: { blockId: 'u1:1' as string | null } },
    );
    await waitFor(() => {
      expect(result.current.url).not.toBeNull();
    });

    rerender({ blockId: null });
    rerender({ blockId: 'u1:1' });

    expect(result.current.url).toBeNull();
    await waitFor(() => {
      expect(result.current.url).toBe('blob:http://localhost/object-2');
    });
    expect(bytes).toHaveBeenCalledTimes(2);
    expect(urls.revoked).toEqual(['blob:http://localhost/object-1']);
  });

  it('makes no blob: of an answer that came after it was closed', async () => {
    const urls = fakeObjectUrls();
    let deliver: (value: BytesResponse) => void = () => undefined;
    vi.spyOn(api, 'bytes').mockReturnValue(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );

    const { unmount } = renderHook(() => usePromptImage('c1', 'u1:1'));
    unmount();
    await act(async () => {
      deliver(answer());
      await Promise.resolve();
    });

    expect(urls.made).toHaveLength(0);
  });

  it('keeps no failure of a read that was closed', async () => {
    let fail: (reason: unknown) => void = () => undefined;
    vi.spyOn(api, 'bytes').mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );

    const { result, rerender } = renderHook(
      ({ blockId }: { blockId: string | null }) => usePromptImage('c1', blockId),
      { initialProps: { blockId: 'u1:1' as string | null } },
    );
    rerender({ blockId: null });
    await act(async () => {
      fail(new AppError('NOT_FOUND', 'transcript.error.notFound', 'tr'));
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
  });

  it('says the refusal of the route, and reads again when asked — S-120', async () => {
    fakeObjectUrls();
    const bytes = vi
      .spyOn(api, 'bytes')
      .mockRejectedValueOnce(
        new AppError('PAYLOAD_TOO_LARGE', 'transcript.error.imageTooLarge', 'tr'),
      )
      .mockResolvedValueOnce(answer());

    const { result } = renderHook(() => usePromptImage('c1', 'u1:1'));

    await waitFor(() => {
      expect(result.current.error?.messageKey).toBe('transcript.error.imageTooLarge');
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.url).not.toBeNull();
    });
    expect(result.current.error).toBeNull();
    expect(bytes).toHaveBeenCalledTimes(2);
  });

  it('turns a failure that is no AppError into the unexpected one', async () => {
    vi.spyOn(api, 'bytes').mockRejectedValue(new TypeError('boom'));

    const { result } = renderHook(() => usePromptImage('c1', 'u1:1'));

    await waitFor(() => {
      expect(result.current.error?.messageKey).toBe('common.error.unexpected');
    });
  });
});
