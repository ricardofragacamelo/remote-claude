import { afterEach, describe, expect, it, vi } from 'vitest';

import { navigation } from '@/shared/lib/navigation';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('navigation', () => {
  it('leaves for a URL, keeping this page in the history', () => {
    const assign = vi.fn();
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      assign,
      replace: vi.fn(),
      search: '',
      origin: 'http://localhost:5173',
    } as unknown as Location);

    navigation.assign('https://provider.test/authorize');

    expect(assign).toHaveBeenCalledWith('https://provider.test/authorize');
  });

  it('leaves for a URL, replacing this page in the history', () => {
    const replace = vi.fn();
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      assign: vi.fn(),
      replace,
      search: '',
      origin: 'http://localhost:5173',
    } as unknown as Location);

    navigation.replace('/sessions/01J0');

    expect(replace).toHaveBeenCalledWith('/sessions/01J0');
  });

  it('reads the query string the provider came back with', () => {
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      assign: vi.fn(),
      replace: vi.fn(),
      search: '?code=c&state=s',
      origin: 'http://localhost:5173',
    } as unknown as Location);

    expect(navigation.search()).toBe('?code=c&state=s');
  });

  it('reports the origin this application is served from', () => {
    expect(navigation.origin()).toMatch(/^http/);
  });
});
