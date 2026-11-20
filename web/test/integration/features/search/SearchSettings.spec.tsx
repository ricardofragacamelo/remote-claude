import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchSettings } from '@/features/search/components/SearchSettings';
import {
  DEFAULT_SEARCH_PREFERENCES,
  useSearchPreferences,
} from '@/features/search/store/search-preferences.store';
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  useSearchPreferences.setState({ preferences: DEFAULT_SEARCH_PREFERENCES });
});

function option(legend: string): HTMLElement {
  return screen.getByRole('group', { name: legend });
}

describe('Settings › Busca — plan 11, B-19', () => {
  it('starts at the defaults, and changes a value the moment it is picked', async () => {
    const user = userEvent.setup();
    render(<SearchSettings />);

    expect(
      within(option(t('search.settings.useIgnoreFiles'))).getByRole('radio', {
        name: t('editor.settings.on'),
      }),
    ).toBeChecked();
    expect(
      within(option(t('search.settings.smartCase'))).getByRole('radio', {
        name: t('editor.settings.off'),
      }),
    ).toBeChecked();

    await user.click(
      within(option(t('search.settings.smartCase'))).getByRole('radio', {
        name: t('editor.settings.on'),
      }),
    );
    expect(useSearchPreferences.getState().preferences.smartCase).toBe(true);

    await user.click(
      within(option(t('search.settings.resultsEditorContextLines'))).getByRole('radio', {
        name: '5',
      }),
    );
    expect(useSearchPreferences.getState().preferences.resultsEditorContextLines).toBe(5);
  });

  it('types a free-text exclude list, and restores it back to empty', async () => {
    const user = userEvent.setup();
    render(<SearchSettings />);

    const field = screen.getByRole('textbox', { name: t('search.settings.exclude') });
    await user.type(field, '*.generated.ts');
    expect(useSearchPreferences.getState().preferences.exclude).toBe('*.generated.ts');

    await user.click(
      screen.getByRole('button', {
        name: t('settings.option.restoreLabel', { option: t('search.settings.exclude') }),
      }),
    );
    expect(useSearchPreferences.getState().preferences.exclude).toBe('');
    expect(field).toHaveValue('');
  });

  it('restores every choice back to its own default, one at a time', async () => {
    const user = userEvent.setup();
    render(<SearchSettings />);

    const restoreLabel = (option: string): string => t('settings.option.restoreLabel', { option });

    await user.click(
      within(option(t('search.settings.useIgnoreFiles'))).getByRole('radio', {
        name: t('editor.settings.off'),
      }),
    );
    await user.click(
      within(option(t('search.settings.useIgnoreFiles'))).getByRole('button', {
        name: restoreLabel(t('search.settings.useIgnoreFiles')),
      }),
    );
    expect(useSearchPreferences.getState().preferences.useIgnoreFiles).toBe(
      DEFAULT_SEARCH_PREFERENCES.useIgnoreFiles,
    );

    await user.click(
      within(option(t('search.settings.smartCase'))).getByRole('radio', {
        name: t('editor.settings.on'),
      }),
    );
    await user.click(
      within(option(t('search.settings.smartCase'))).getByRole('button', {
        name: restoreLabel(t('search.settings.smartCase')),
      }),
    );
    expect(useSearchPreferences.getState().preferences.smartCase).toBe(
      DEFAULT_SEARCH_PREFERENCES.smartCase,
    );

    await user.click(
      within(option(t('search.settings.resultsEditorContextLines'))).getByRole('radio', {
        name: '5',
      }),
    );
    await user.click(
      within(option(t('search.settings.resultsEditorContextLines'))).getByRole('button', {
        name: restoreLabel(t('search.settings.resultsEditorContextLines')),
      }),
    );
    expect(useSearchPreferences.getState().preferences.resultsEditorContextLines).toBe(
      DEFAULT_SEARCH_PREFERENCES.resultsEditorContextLines,
    );
  });

  it('keeps working with the defaults when the browser keeps nothing (storage refused)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const user = userEvent.setup();
    render(<SearchSettings />);

    await user.click(
      within(option(t('search.settings.useIgnoreFiles'))).getByRole('radio', {
        name: t('editor.settings.off'),
      }),
    );

    expect(useSearchPreferences.getState().preferences.useIgnoreFiles).toBe(false);
  });
});
