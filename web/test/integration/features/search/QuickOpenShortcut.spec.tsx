import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import * as editorFeature from '@/features/editor';
import { CommandHost } from '@/features/commands';
import { QuickOpenFolder } from '@/features/search';
import { QuickOpenShortcut } from '@/features/search/components/QuickOpenShortcut';
import { render, translator } from '../../../support/render';
import { fakeSearchApi } from '../../../support/search-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function mount() {
  return render(
    <>
      <CommandHost />
      <QuickOpenShortcut />
      <QuickOpenFolder folder="/srv/projects/a" />
    </>,
  );
}

async function openWithQuickOpen(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.keyboard('{Control>}p{/Control}');
  return screen.findByRole('dialog', { name: t('palette.dialog.title') });
}

describe('Quick Open’s own shortcut — plan 11, B-14', () => {
  it('opens blank on Ctrl/Cmd+P, landing in Quick Open — S-106', async () => {
    vi.spyOn(editorFeature, 'openAndRecentFiles').mockReturnValue([]);
    fakeSearchApi({ locate: () => ({ entries: [], truncated: null }) });
    const user = userEvent.setup();
    mount();

    await openWithQuickOpen(user);

    const field = screen.getByRole('combobox', { name: t('palette.dialog.input') });
    expect(field).toHaveValue('');
    expect(field).toHaveAttribute('placeholder', t('search.quickOpen.placeholder'));
  });

  it('switches to the commands on ">", and returns to Quick Open once it is deleted — S-108', async () => {
    vi.spyOn(editorFeature, 'openAndRecentFiles').mockReturnValue([]);
    fakeSearchApi({ locate: () => ({ entries: [], truncated: null }) });
    const user = userEvent.setup();
    mount();
    await openWithQuickOpen(user);
    const field = screen.getByRole('combobox', { name: t('palette.dialog.input') });

    await user.type(field, '>');

    expect(field).toHaveAttribute('placeholder', t('palette.commands.placeholder'));

    await user.clear(field);

    expect(field).toHaveAttribute('placeholder', t('search.quickOpen.placeholder'));
  });

  it('has no accessibility violation', async () => {
    vi.spyOn(editorFeature, 'openAndRecentFiles').mockReturnValue([]);
    fakeSearchApi({
      locate: () => ({
        entries: [{ path: 'a.ts', kind: 'file', positions: [] }],
        truncated: null,
      }),
    });
    const user = userEvent.setup();
    const { baseElement } = mount();

    await openWithQuickOpen(user);
    await screen.findByRole('option', { name: 'a.ts' });

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
