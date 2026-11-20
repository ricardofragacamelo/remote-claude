import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import * as editorFeature from '@/features/editor';
import * as commandsFeature from '@/features/commands';
import { QuickOpenFolder } from '@/features/search/components/QuickOpenFolder';
import { QuickOpenMode } from '@/features/search/components/QuickOpenMode';
import { api } from '@/shared/api/api';
import { Command, CommandList } from '@/shared/components/ui/command';
import { render, translator } from '../../../support/render';
import { fakeSearchApi, refusal } from '../../../support/search-api';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(query: string, active = '', pick: (action: () => void) => void = vi.fn()) {
  return render(
    <>
      <QuickOpenFolder folder="/srv/projects/a" />
      <Command>
        <CommandList>
          <QuickOpenMode query={query} active={active} pick={pick} />
        </CommandList>
      </Command>
    </>,
  );
}

function anEntry(path: string, positions: readonly number[] = []) {
  return { path, kind: 'file' as const, positions };
}

describe('QuickOpenMode — plan 11, B-14', () => {
  it('says there is nothing to search while no folder tab is on screen — S-111’s sibling', () => {
    render(
      <Command>
        <CommandList>
          <QuickOpenMode query="" active="" pick={vi.fn()} />
        </CommandList>
      </Command>,
    );

    expect(screen.getByText(t('search.quickOpen.empty'))).toBeVisible();
  });

  it('asks for the tab’s own recent and open files first — S-105', async () => {
    const openAndRecentFiles = vi
      .spyOn(editorFeature, 'openAndRecentFiles')
      .mockReturnValue(['src/app.ts', 'README.md']);
    fakeSearchApi({ locate: () => ({ entries: [anEntry('README.md')], truncated: null }) });

    mount('');

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'README.md' })).toBeVisible();
    });
    expect(openAndRecentFiles).toHaveBeenCalledWith('/srv/projects/a');
  });

  it('highlights the matched letters of each result', async () => {
    fakeSearchApi({
      locate: () => ({ entries: [anEntry('src/app.ts', [0, 1, 2])], truncated: null }),
    });

    mount('app');

    const option = await screen.findByRole('option', { name: 'src/app.ts' });
    expect(within(option).getByText('src')).toHaveProperty('tagName', 'MARK');
  });

  it('cancels a search nobody is waiting for any more, and shows only the last one — S-110', async () => {
    const answers = new Map<string, (payload: unknown) => void>();
    const signals = new Map<string, AbortSignal>();
    vi.spyOn(api, 'get').mockImplementation((path: string, options?: { signal?: AbortSignal }) => {
      const query = new URLSearchParams(path.split('?')[1]).get('query') ?? '';
      if (options?.signal !== undefined) signals.set(query, options.signal);
      return new Promise((resolve) => {
        answers.set(query, resolve as (payload: unknown) => void);
      });
    });

    const result = mount('a');
    for (const query of ['ap', 'app', 'appl', 'apple']) {
      result.rerender(
        <>
          <QuickOpenFolder folder="/srv/projects/a" />
          <Command>
            <CommandList>
              <QuickOpenMode query={query} active="" pick={vi.fn()} />
            </CommandList>
          </Command>
        </>,
      );
    }

    await waitFor(() => {
      expect(answers.size).toBe(5);
    });

    // Only the last one typed is answered; every earlier one was told to stop.
    answers.get('apple')?.({
      entries: [{ path: 'apple.ts', kind: 'file', positions: [] }],
      truncated: null,
    });

    expect(await screen.findByRole('option', { name: 'apple.ts' })).toBeVisible();
    for (const query of ['a', 'ap', 'app', 'appl']) {
      expect(signals.get(query)?.aborted).toBe(true);
    }
  });

  it('shows the reason a truncated result gives — S-109', async () => {
    fakeSearchApi({
      locate: () => ({ entries: [anEntry('a.ts')], truncated: { reason: 'limit' } }),
    });

    mount('a');

    expect(await screen.findByText(t('search.quickOpen.truncatedLimit'))).toBeVisible();
  });

  it('shows the backend’s own refusal, with the folder it could not search — S-111', async () => {
    const error = refusal('WORKSPACE_NOT_ALLOWED', 'workspace.error.notAllowed');
    fakeSearchApi({ locate: () => error });

    mount('a');

    expect(
      await screen.findByText(
        t('search.quickOpen.locateError', {
          folder: '/srv/projects/a',
          message: t('workspace.error.notAllowed'),
        }),
      ),
    ).toBeVisible();
  });

  it('opens the one picked as a preview tab, and closes the palette', async () => {
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    fakeSearchApi({ locate: () => ({ entries: [anEntry('a.ts')], truncated: null }) });
    const pick = vi.fn((action: () => void) => action());

    mount('a', '', pick);

    await (await screen.findByRole('option', { name: 'a.ts' })).click();

    expect(pick).toHaveBeenCalledOnce();
    expect(openFile).toHaveBeenCalledWith('/srv/projects/a', 'a.ts', { preview: true });
  });

  it('opens at the line "file.ts:42" named, once picked', async () => {
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    fakeSearchApi({ locate: () => ({ entries: [anEntry('a.ts')], truncated: null }) });
    const pick = vi.fn((action: () => void) => action());

    mount('a.ts:42', '', pick);

    await (await screen.findByRole('option', { name: 'a.ts' })).click();

    expect(openFile).toHaveBeenCalledWith('/srv/projects/a', 'a.ts', {
      preview: true,
      line: 42,
    });
  });

  it('forwards a bare ":42" to the editor’s own "go to line" — S-107', async () => {
    const executeCommand = vi.spyOn(commandsFeature, 'executeCommand').mockResolvedValue(true);
    const pick = vi.fn((action: () => void) => action());

    mount(':42', '', pick);

    await (await screen.findByRole('option', { name: t('search.quickOpen.goToLine') })).click();

    expect(pick).toHaveBeenCalledOnce();
    expect(executeCommand).toHaveBeenCalledWith('editor.goToLine', expect.anything());
  });

  it('opens the active entry beside on Ctrl/Cmd+Enter, and closes the palette', async () => {
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    fakeSearchApi({ locate: () => ({ entries: [anEntry('a.ts')], truncated: null }) });
    const pick = vi.fn((action: () => void) => action());

    mount('a', 'a.ts', pick);
    await screen.findByRole('option', { name: 'a.ts' });

    fireEvent.keyDown(document, { key: 'Enter', ctrlKey: true });

    expect(pick).toHaveBeenCalledOnce();
    expect(openFile).toHaveBeenCalledWith('/srv/projects/a', 'a.ts', {
      preview: true,
      toSide: true,
    });
  });

  it('opens the active entry on the right arrow without closing the palette', async () => {
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    fakeSearchApi({ locate: () => ({ entries: [anEntry('a.ts')], truncated: null }) });
    const pick = vi.fn();

    mount('a', 'a.ts', pick);
    await screen.findByRole('option', { name: 'a.ts' });

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(pick).not.toHaveBeenCalled();
    expect(openFile).toHaveBeenCalledWith('/srv/projects/a', 'a.ts', { preview: true });
  });

  it('does nothing on the right arrow or Ctrl+Enter with no item active', async () => {
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    fakeSearchApi({ locate: () => ({ entries: [anEntry('a.ts')], truncated: null }) });

    mount('a', '');
    await screen.findByRole('option', { name: 'a.ts' });

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Enter', metaKey: true });

    expect(openFile).not.toHaveBeenCalled();
  });
});

describe('the help of Quick Open — plan 11, B-20, S-142', () => {
  it('opens from its own item, without closing Quick Open, and Escape closes only the help', async () => {
    fakeSearchApi({ locate: () => ({ entries: [anEntry('a.ts')], truncated: null }) });
    const user = userEvent.setup();
    mount('');
    await screen.findByRole('option', { name: 'a.ts' });

    await user.click(screen.getByRole('option', { name: t('search.quickOpen.helpItem') }));
    const help = await screen.findByRole('dialog', {
      name: t('help.panel.title', { screen: t('search.quickOpen.screenTitle') }),
    });

    expect(help).toHaveTextContent(t('search.quickOpenHelp.what'));
    expect(help).toHaveTextContent(t('search.quickOpenHelp.states'));
    expect(help).toHaveTextContent(t('search.quickOpenHelp.notRecorded'));
    expect(within(help).getByText(t('search.quickOpenHelp.openSideHeading'))).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(screen.getByRole('option', { name: 'a.ts' })).toBeInTheDocument();
  });

  it('is not offered while nothing was found', async () => {
    fakeSearchApi({ locate: () => ({ entries: [], truncated: null }) });
    mount('nothing-like-it');

    await screen.findByText(t('search.quickOpen.noMatch'));
    expect(screen.queryByRole('option', { name: t('search.quickOpen.helpItem') })).toBeNull();
  });

  it('has no accessibility violation, with its own help open — B-20', async () => {
    fakeSearchApi({ locate: () => ({ entries: [anEntry('a.ts')], truncated: null }) });
    const user = userEvent.setup();
    mount('');
    await user.click(await screen.findByRole('option', { name: t('search.quickOpen.helpItem') }));
    await screen.findByRole('dialog');

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
