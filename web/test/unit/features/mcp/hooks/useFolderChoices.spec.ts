import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useFolderChoices } from '@/features/mcp/hooks/useFolderChoices';
import { api } from '@/shared/api/api';
import { providers } from '../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFolderChoices — plan 13, B-28, D-83', () => {
  it('offers the open folders and the recent ones, deduplicated', async () => {
    vi.spyOn(api, 'get').mockImplementation((route: string) => {
      if (route === '/workspaces/open-folders') {
        return Promise.resolve({ folders: [{ path: '/srv/app' }] });
      }
      if (route === '/workspaces/recent') {
        return Promise.resolve({ folders: [{ path: '/srv/app' }, { path: '/srv/other' }] });
      }
      return new Promise(() => undefined);
    });

    const { result } = renderHook(() => useFolderChoices(undefined), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current).toEqual(['/srv/app', '/srv/other']);
    });
  });

  it('keeps the current folder even when it is in neither list', async () => {
    vi.spyOn(api, 'get').mockImplementation((route: string) => {
      if (route === '/workspaces/open-folders') {
        return Promise.resolve({ folders: [] });
      }
      if (route === '/workspaces/recent') {
        return Promise.resolve({ folders: [] });
      }
      return new Promise(() => undefined);
    });

    const { result } = renderHook(() => useFolderChoices('/srv/gone'), { wrapper: providers() });

    await waitFor(() => {
      expect(result.current).toEqual(['/srv/gone']);
    });
  });
});
