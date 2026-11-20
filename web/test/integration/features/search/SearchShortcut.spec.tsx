import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import * as editorFeature from '@/features/editor';
import { CommandHost, commandRegistry } from '@/features/commands';
import { QuickOpenFolder } from '@/features/search';
import { SearchShortcut } from '@/features/search/components/SearchShortcut';
import { forgetSearchView, searchViewStore } from '@/features/search/store/search-view.store';
import { folderTabStore } from '@/features/workbench';
import { render } from '../../../support/render';

const FOLDER = '/srv/projects/a';

afterEach(() => {
  vi.restoreAllMocks();
  forgetSearchView(null);
});

function mount() {
  return render(
    <>
      <CommandHost />
      <SearchShortcut />
      <QuickOpenFolder folder={FOLDER} />
    </>,
  );
}

describe('the Search view’s own shortcut — plan 11, B-15, S-119', () => {
  it('switches the side bar to Search on Ctrl/Cmd+Shift+F', async () => {
    vi.spyOn(editorFeature, 'activeSelectionText').mockReturnValue(null);
    const user = userEvent.setup();
    mount();

    await user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');

    expect(folderTabStore(FOLDER).getState().view).toBe('search');
    expect(searchViewStore(FOLDER).getState().query).toBe('');
  });

  it('fills the query with the editor’s own selection, when there is one', async () => {
    vi.spyOn(editorFeature, 'activeSelectionText').mockReturnValue('needle');
    const user = userEvent.setup();
    mount();

    await user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');

    expect(searchViewStore(FOLDER).getState().query).toBe('needle');
    expect(folderTabStore(FOLDER).getState().view).toBe('search');
  });

  it('does nothing without a folder on screen', async () => {
    vi.spyOn(editorFeature, 'activeSelectionText').mockReturnValue('needle');
    const user = userEvent.setup();
    render(
      <>
        <CommandHost />
        <SearchShortcut />
      </>,
    );

    await user.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');

    expect(searchViewStore(FOLDER).getState().query).toBe('');
  });

  it('is unavailable without a folder on screen, and its own run guards the same — S-119', () => {
    render(
      <>
        <CommandHost />
        <SearchShortcut />
      </>,
    );
    const command = commandRegistry.command('search.openSearch');

    expect(command?.when?.()).toBe(false);
    expect(() => command?.run()).not.toThrow();
  });
});

describe('the replace shortcut — plan 11, B-19', () => {
  it('switches the side bar to Search, with the replace row open, on Ctrl/Cmd+Shift+H', async () => {
    vi.spyOn(editorFeature, 'activeSelectionText').mockReturnValue(null);
    const user = userEvent.setup();
    mount();

    await user.keyboard('{Control>}{Shift>}h{/Shift}{/Control}');

    expect(folderTabStore(FOLDER).getState().view).toBe('search');
    expect(searchViewStore(FOLDER).getState().replaceOpen).toBe(true);
  });
});
