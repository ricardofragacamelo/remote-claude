import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { explorerKeys } from '@/features/explorer/hooks/explorer-keys';
import { useFolderWatch } from '@/features/explorer/hooks/useFolderWatch';
import { explorerStore, forgetExplorer } from '@/features/explorer/store/explorer.store';
import { fakeWatches } from '../../../../support/explorer';

const APP = '/srv/app';

afterEach(() => {
  vi.restoreAllMocks();
  forgetExplorer(null);
});

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { readonly children: ReactNode }): React.JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('following the disk of a tab, where the screen does not reach', () => {
  it('follows nothing for a tab the server refused', () => {
    const watches = fakeWatches();
    renderHook(() => useFolderWatch(APP, false), { wrapper: withClient(new QueryClient()) });

    expect(watches.watched).toEqual([]);
  });

  it('reads again on return only the levels read and at rest — never one being read', async () => {
    fakeWatches();
    const client = new QueryClient();
    client.setQueryData(explorerKeys.directory(APP, ''), {
      path: '',
      entries: [],
      truncated: false,
    });
    const reading = vi.fn(() => new Promise(() => undefined));
    void client.fetchQuery({ queryKey: explorerKeys.directory(APP, 'src'), queryFn: reading });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useFolderWatch(APP, true), { wrapper: withClient(client) });

    const [filters] = invalidate.mock.calls[0] ?? [];
    const queries = client.getQueryCache().findAll({ queryKey: explorerKeys.directories(APP) });
    expect(queries.map((query) => filters?.predicate?.(query))).toEqual([true, false]);
  });

  it('reads nothing again for a change of the store that is not a reload', () => {
    fakeWatches();
    const client = new QueryClient();
    renderHook(() => useFolderWatch(APP, true), { wrapper: withClient(client) });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    act(() => {
      explorerStore(APP).getState().setShowHidden(true);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
