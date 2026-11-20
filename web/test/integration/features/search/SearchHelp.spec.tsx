import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchView } from '@/features/search/components/SearchView';
import { forgetSearchView } from '@/features/search/store/search-view.store';
import type { Locale } from '@/shared/i18n';
import { render, translator } from '../../../support/render';
import { fakeSearchApi } from '../../../support/search-api';
import { fakeWatches } from '../../../support/explorer';

const FOLDER = '/srv/projects/a';
const t = translator('en');

afterEach(() => {
  forgetSearchView(null);
});

function mount(locale: Locale = 'en') {
  fakeWatches();
  fakeSearchApi({});
  return render(<SearchView folder={FOLDER} />, locale);
}

describe('the help of the Search view — plan 11, B-20, S-142', () => {
  it('opens from its button, with what it is, the four states, and its shortcuts', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: t('help.panel.open') }));
    const help = await screen.findByRole('dialog', {
      name: t('help.panel.title', { screen: t('search.screen.title') }),
    });

    expect(help).toHaveTextContent(t('search.help.what'));
    expect(help).toHaveTextContent(t('search.help.states'));
    expect(help).toHaveTextContent(t('search.help.notRecorded'));
    expect(within(help).getByText(t('search.help.toolbarHeading'))).toBeVisible();
    expect(help).toHaveTextContent(t('search.help.toolbar'));
    expect(within(help).getByText(t('search.help.missingHeading'))).toBeVisible();
    expect(help).toHaveTextContent(t('search.help.missing'));
    expect(within(help).getByText(t('search.help.replaceHeading'))).toBeVisible();
    expect(help).toHaveTextContent(t('search.help.replace'));
    // Registered by `SearchToolbar`, mounted with the view itself — Quick Open/`openSearch`/
    // `openReplace`'s own shortcuts are `SearchShortcut`/`QuickOpenShortcut`'s, asserted by their
    // own tests (B-14, B-15, B-19); this just confirms the help reads the registry, not a copy.
    expect(within(help).getByText('F4')).toBeVisible();
    expect(within(help).getByText('Shift+F4')).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('reads in Portuguese', async () => {
    const pt = translator('pt-BR');
    const user = userEvent.setup();
    mount('pt-BR');

    await user.click(screen.getByRole('button', { name: pt('help.panel.open') }));
    const help = await screen.findByRole('dialog', {
      name: pt('help.panel.title', { screen: pt('search.screen.title') }),
    });

    expect(help).toHaveTextContent(pt('search.help.what'));
    expect(help).toHaveTextContent(pt('search.help.missing'));
    expect(help).toHaveTextContent(pt('search.help.replace'));
  });
});
