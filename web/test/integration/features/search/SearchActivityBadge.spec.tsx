import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

import { SearchActivityBadge } from '@/features/search/components/SearchActivityBadge';
import { forgetSearchView, searchViewStore } from '@/features/search/store/search-view.store';
import { providers, translator } from '../../../support/render';
import { fakeSearchApi } from '../../../support/search-api';
import { fakeWatches } from '../../../support/explorer';

const FOLDER = '/srv/projects/a';
const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  forgetSearchView(null);
});

describe('SearchActivityBadge — plan 11, B-15', () => {
  it('shows nothing while there is no result', () => {
    fakeSearchApi({});
    fakeWatches();

    render(<SearchActivityBadge folder={FOLDER} />, { wrapper: providers() });

    expect(screen.queryByText(/\d/)).toBeNull();
  });

  it('counts the matches once a search finds some', async () => {
    fakeSearchApi({
      text: () => [
        {
          type: 'file',
          path: 'a.ts',
          matches: [
            {
              line: 1,
              column: 1,
              endColumn: 5,
              preview: 'TODO',
              previewMatchStart: 0,
              previewMatchEnd: 4,
            },
            {
              line: 2,
              column: 1,
              endColumn: 5,
              preview: 'TODO',
              previewMatchStart: 0,
              previewMatchEnd: 4,
            },
          ],
          contextLines: [],
        },
        { type: 'end' },
      ],
    });
    fakeWatches();
    render(<SearchActivityBadge folder={FOLDER} />, { wrapper: providers() });

    act(() => {
      searchViewStore(FOLDER).getState().setQuery('TODO');
    });

    expect(
      await screen.findByLabelText(t('search.view.badgeLabel', { count: 2 })),
    ).toHaveTextContent('2');
  });

  it('syncs back to nothing once the query is cleared', async () => {
    fakeSearchApi({
      text: () => [
        {
          type: 'file',
          path: 'a.ts',
          matches: [
            {
              line: 1,
              column: 1,
              endColumn: 5,
              preview: 'TODO',
              previewMatchStart: 0,
              previewMatchEnd: 4,
            },
          ],
          contextLines: [],
        },
        { type: 'end' },
      ],
    });
    fakeWatches();
    render(<SearchActivityBadge folder={FOLDER} />, { wrapper: providers() });

    act(() => {
      searchViewStore(FOLDER).getState().setQuery('TODO');
    });
    await waitFor(() => {
      expect(screen.queryByText(/\d/)).not.toBeNull();
    });

    act(() => {
      searchViewStore(FOLDER).getState().setQuery('');
    });
    await waitFor(() => {
      expect(screen.queryByText(/\d/)).toBeNull();
    });
  });
});
