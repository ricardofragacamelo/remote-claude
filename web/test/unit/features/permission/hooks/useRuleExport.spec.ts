import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useRuleExport } from '@/features/permission/hooks/useRuleExport';
import type { RuleFilters } from '@/features/permission/types/rule';
import { api } from '@/shared/api/api';

const FILTERS: RuleFilters = { status: ['active'] };

const EXPORTED = {
  format: 'remote-claude.permission-rules' as const,
  version: 1 as const,
  exportedAt: '2026-11-11T00:00:00.000Z',
  rules: [],
};

/** Stubs only the `<a>` the download itself creates — every other element (the hook's own
 * render container included) keeps the real `document.createElement`. */
function fakeAnchor(): HTMLAnchorElement {
  const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
  const real = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'a' ? anchor : real(tag),
  );
  return anchor;
}

describe('useRuleExport — "Exportar"’s own one read, filter-only (plan 15, B-31, D-17)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle, with nothing exporting and no error', () => {
    const { result } = renderHook(() => useRuleExport());

    expect(result.current.exporting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reads the export with the given filters, and hands it to the download', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(EXPORTED);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchor = fakeAnchor();
    const { result } = renderHook(() => useRuleExport());

    await act(async () => {
      await result.current.download(FILTERS);
    });

    expect(get).toHaveBeenCalledWith('/permission-rules/export?status=active');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(result.current.exporting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reports exporting while the call is in flight', async () => {
    let resolveCall: (value: unknown) => void = () => undefined;
    vi.spyOn(api, 'get').mockReturnValue(
      new Promise((resolve) => {
        resolveCall = resolve;
      }),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    fakeAnchor();
    const { result } = renderHook(() => useRuleExport());

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.download(FILTERS);
    });

    await waitFor(() => {
      expect(result.current.exporting).toBe(true);
    });

    await act(async () => {
      resolveCall(EXPORTED);
      await pending;
    });

    expect(result.current.exporting).toBe(false);
  });

  it('keeps exporting false and sets the error on a rejected read, without downloading', async () => {
    const error = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };
    vi.spyOn(api, 'get').mockRejectedValue(error);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    const { result } = renderHook(() => useRuleExport());

    await act(async () => {
      await result.current.download(FILTERS);
    });

    expect(result.current.exporting).toBe(false);
    expect(result.current.error).toEqual(error);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('clears the previous error at the start of the next attempt', async () => {
    const error = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };
    const get = vi.spyOn(api, 'get').mockRejectedValueOnce(error).mockResolvedValueOnce(EXPORTED);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    fakeAnchor();
    const { result } = renderHook(() => useRuleExport());

    await act(async () => {
      await result.current.download(FILTERS);
    });
    expect(result.current.error).toEqual(error);

    await act(async () => {
      await result.current.download(FILTERS);
    });

    expect(result.current.error).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reads the plain export route when no filter is given', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue(EXPORTED);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    fakeAnchor();
    const { result } = renderHook(() => useRuleExport());

    await act(async () => {
      await result.current.download({});
    });

    expect(get).toHaveBeenCalledWith('/permission-rules/export');
  });
});
