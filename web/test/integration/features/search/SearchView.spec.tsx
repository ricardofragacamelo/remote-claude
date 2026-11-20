import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { SearchTextFramePayload } from '@remote-claude/contracts';

import { CommandHost, commandRegistry } from '@/features/commands';
import * as editorFeature from '@/features/editor';
import { SearchView } from '@/features/search/components/SearchView';
import { forgetSearchView, searchViewStore } from '@/features/search/store/search-view.store';
import { render, translator } from '../../../support/render';
import { fakeSearchApi, pendingStream, refusal } from '../../../support/search-api';
import { fakeWatches } from '../../../support/explorer';
import { aViewport } from '../../../support/viewport';

const FOLDER = '/srv/projects/a';
const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  forgetSearchView(null);
});

function mount() {
  return render(<SearchView folder={FOLDER} />);
}

async function typeQuery(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  await user.type(screen.getByRole('searchbox', { name: t('search.view.queryLabel') }), text);
}

function aFileFrame(path: string, line = 1): SearchTextFramePayload {
  return {
    type: 'file',
    path,
    matches: [
      {
        line,
        column: 1,
        endColumn: 5,
        preview: 'TODO soon',
        previewMatchStart: 0,
        previewMatchEnd: 4,
      },
    ],
    contextLines: [],
  };
}

function framesOf(
  files: readonly SearchTextFramePayload[],
  truncated: { readonly reason: 'limit' | 'timeout' } | null = null,
): readonly SearchTextFramePayload[] {
  return [...files, { type: 'end', truncated, skipped: 0 }];
}

describe('SearchView — plan 11, B-15', () => {
  it('shows the four states: empty, loading, content, and an error with a retry action (S-113)', async () => {
    fakeWatches();
    const stream = pendingStream<SearchTextFramePayload>();
    fakeSearchApi({ text: () => stream.iterable });
    const user = userEvent.setup();
    mount();

    expect(screen.getByText(t('search.view.empty'))).toBeVisible();

    await typeQuery(user, 'TODO');
    expect(await screen.findByRole('status', { name: t('search.view.loading') })).toBeVisible();

    act(() => {
      stream.push(aFileFrame('a.ts'));
      stream.push({ type: 'end', truncated: null, skipped: 0 });
      stream.finish();
    });
    expect(await screen.findByRole('treeitem', { name: 'a.ts' })).toBeVisible();
  });

  it('says nothing matched once a search with no results settles', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([]) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'nothing-like-it');

    expect(await screen.findByText(t('search.view.noMatch'))).toBeVisible();
  });

  it('runs the search and opens a matched file at its line, with the text selected (S-116)', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts', 3)]) });
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    await user.click(await screen.findByRole('treeitem', { name: /Line 3/ }));

    expect(openFile).toHaveBeenCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 3, startColumn: 1, endLine: 3, endColumn: 5 },
      toSide: false,
    });
  });

  it('collapses and expands a file’s matches on click, keeping its own row', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    const fileRow = await screen.findByRole('treeitem', { name: 'a.ts' });
    expect(await screen.findByRole('treeitem', { name: /Line 1/ })).toBeVisible();

    await user.click(fileRow);
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: /Line 1/ })).toBeNull();
    });
    expect(screen.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();

    await user.click(fileRow);
    expect(await screen.findByRole('treeitem', { name: /Line 1/ })).toBeVisible();
  });

  it('builds the request from every toggle and the include/exclude filters', async () => {
    const { ndjson } = fakeSearchApi({ text: () => framesOf([]) });
    fakeWatches();
    vi.spyOn(editorFeature, 'openFiles').mockReturnValue(['open.ts']);
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: t('search.view.flagCaseSensitive') }));
    await user.click(screen.getByRole('button', { name: t('search.view.flagWholeWord') }));
    await user.click(screen.getByRole('button', { name: t('search.view.flagIsRegex') }));
    await user.click(screen.getByRole('button', { name: t('search.view.flagUseIgnoreFiles') }));
    await user.click(screen.getByRole('button', { name: t('search.view.flagOnlyOpenEditors') }));
    await user.type(screen.getByRole('textbox', { name: t('search.view.includeLabel') }), '*.ts');
    await user.type(
      screen.getByRole('textbox', { name: t('search.view.excludeLabel') }),
      '*.spec.ts',
    );
    await typeQuery(user, 'TODO');

    await waitFor(() => {
      expect(ndjson).toHaveBeenCalled();
    });
    const [, body] = ndjson.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toMatchObject({
      caseSensitive: true,
      wholeWord: true,
      isRegex: true,
      useIgnoreFiles: false,
      include: ['*.ts'],
      exclude: ['*.spec.ts'],
      onlyPaths: ['open.ts'],
    });
  });

  it('opens beside and copies the match and the path, all from the context menu', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    const matchRow = await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.pointer({ keys: '[MouseRight]', target: matchRow });
    let menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionOpenBeside')));
    expect(openFile).toHaveBeenCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
      toSide: true,
    });

    await user.pointer({ keys: '[MouseRight]', target: matchRow });
    menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionCopyResult')));

    await user.pointer({ keys: '[MouseRight]', target: matchRow });
    menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionCopyPath')));

    await user.pointer({ keys: '[MouseRight]', target: matchRow });
    menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionCopyAll')));
    await user.click(within(menu).getByText(t('search.view.actionCollapseAll')));
  });

  it('opens plainly from the context menu too, and dismisses one match without the whole file', async () => {
    fakeWatches();
    fakeSearchApi({
      text: () =>
        framesOf([
          {
            type: 'file',
            path: 'a.ts',
            matches: [
              {
                line: 1,
                column: 1,
                endColumn: 5,
                preview: 'TODO soon',
                previewMatchStart: 0,
                previewMatchEnd: 4,
              },
              {
                line: 2,
                column: 1,
                endColumn: 5,
                preview: 'TODO soon',
                previewMatchStart: 0,
                previewMatchEnd: 4,
              },
            ],
            contextLines: [],
          },
        ]),
    });
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    const firstMatch = await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.pointer({ keys: '[MouseRight]', target: firstMatch });
    const menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionOpen')));
    expect(openFile).toHaveBeenCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
      toSide: false,
    });

    await user.pointer({ keys: '[MouseRight]', target: firstMatch });
    const dismissMenu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(dismissMenu).getByText(t('search.view.actionDismiss')));

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: /Line 1/ })).toBeNull();
    });
    expect(screen.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();
    expect(screen.getByRole('treeitem', { name: /Line 2/ })).toBeVisible();

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });
    expect(screen.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();
  });

  it('starts from the first row when a key arrives before anything was ever focused', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts'), aFileFrame('b.ts', 2)]) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    await screen.findByRole('treeitem', { name: 'a.ts' });

    fireEvent.keyDown(screen.getByRole('tree'), { key: 'ArrowDown' });

    expect(screen.getByRole('treeitem', { name: /Line 1/ })).toHaveAttribute('tabindex', '0');
  });

  it('ignores a key the tree has nothing to do with', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    const fileRow = await screen.findByRole('treeitem', { name: 'a.ts' });
    fileRow.focus();

    await user.keyboard('a');

    expect(screen.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();
  });

  it('walks the tree with the arrow keys, and opens or toggles with Enter', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts'), aFileFrame('b.ts', 2)]) });
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    const fileRow = await screen.findByRole('treeitem', { name: 'a.ts' });
    fileRow.focus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(openFile).toHaveBeenCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
      toSide: false,
    });

    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: /Line 1/ })).toBeNull();
    });

    await user.keyboard('{ArrowRight}');
    expect(await screen.findByRole('treeitem', { name: /Line 1/ })).toBeVisible();
  });

  it('shows a regex refusal beside the field, keeping the previous results on screen (S-114)', async () => {
    fakeWatches();
    const user = userEvent.setup();
    const search = fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    mount();

    await typeQuery(user, 'TODO');
    await screen.findByRole('treeitem', { name: 'a.ts' });

    const error = refusal('SEARCH_PATTERN_INVALID', 'search.error.patternInvalid');
    search.ndjson.mockImplementation(() => {
      throw error;
    });
    await user.click(screen.getByRole('button', { name: t('search.view.flagIsRegex') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(t('search.error.patternInvalid'));
    expect(screen.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();
  });

  it('shows the reason a truncated result gives (S-115)', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')], { reason: 'limit' }) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');

    expect(await screen.findByText(t('search.view.truncatedLimit'))).toBeVisible();
  });

  it('shows the reason a timed-out search gives too', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')], { reason: 'timeout' }) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');

    expect(await screen.findByText(t('search.view.truncatedTimeout'))).toBeVisible();
  });

  it('"learn more" beside a truncated result opens the help at why one might be missing — B-20, S-142', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')], { reason: 'limit' }) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    await screen.findByText(t('search.view.truncatedLimit'));

    await user.click(
      screen.getByRole('button', {
        name: t('help.learnMore.label', { topic: t('search.help.missingHeading') }),
      }),
    );

    expect(
      await screen.findByRole('dialog', {
        name: t('help.panel.title', { screen: t('search.screen.title') }),
      }),
    ).toHaveTextContent(t('search.help.missing'));
  });

  it('shows a generic refusal translated, when it is neither a regex nor a rate limit', async () => {
    fakeWatches();
    const error = refusal('SEARCH_ENGINE_FAILED', 'search.error.engineFailed');
    fakeSearchApi({ text: () => error });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');

    expect(await screen.findByText(t('search.error.engineFailed'))).toBeVisible();
  });

  it('offers a retry after a rate limit, with the seconds it names (S-122)', async () => {
    fakeWatches();
    const error = refusal('RATE_LIMITED', 'common.error.rateLimited', { retryAfterSeconds: 5 });
    fakeSearchApi({ text: () => error });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');

    expect(await screen.findByText(t('search.view.rateLimited', { seconds: 5 }))).toBeVisible();
    expect(screen.getByRole('button', { name: t('common.action.retry') })).toBeVisible();
  });

  it('marks a file stale once it changes on disk, and clears it on "search again" (S-123)', async () => {
    const watches = fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    await screen.findByRole('treeitem', { name: 'a.ts' });

    watches.subscriber(FOLDER).onChanges([{ path: 'a.ts', kind: 'changed' }], false);
    const searchAgain = await screen.findByText(t('search.view.staleSearchAgain'));

    await user.click(searchAgain);
    await waitFor(() => {
      expect(screen.queryByText(t('search.view.staleSearchAgain'))).toBeNull();
    });
  });

  it('dismisses, copies and collapses through the context menu too (S-118)', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    const fileRow = await screen.findByRole('treeitem', { name: 'a.ts' });

    await user.pointer({ keys: '[MouseRight]', target: fileRow });
    const menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionDismiss')));

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull();
    });
  });

  it('collapses, expands and copies all from the toolbar’s own buttons, not only the menu', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(screen.getByRole('button', { name: t('search.view.actionCollapseAll') }));
    expect(screen.queryByRole('treeitem', { name: /Line 1/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: t('search.view.actionExpandAll') }));
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(screen.getByRole('button', { name: t('search.view.actionCopyAll') }));
    expect(await navigator.clipboard.readText()).toContain('a.ts');
  });

  it('"Open in editor" is disabled with no result, and writes a .code-search tab with one (B-17)', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const createFile = vi
      .spyOn(editorFeature, 'createFile')
      .mockResolvedValue({ path: 'search-results.code-search', etag: 'x' });
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    const user = userEvent.setup();
    mount();

    expect(
      screen.getByRole('button', { name: t('search.view.actionOpenInEditor') }),
    ).toBeDisabled();

    await typeQuery(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(screen.getByRole('button', { name: t('search.view.actionOpenInEditor') }));

    await waitFor(() => {
      expect(createFile).toHaveBeenCalledTimes(1);
    });
    const write = createFile.mock.calls[0]?.[0];
    expect(write?.path).toMatch(/\.code-search$/);
    expect(write?.content).toContain('a.ts:\n  1: TODO soon');
    expect(openFile).toHaveBeenCalledWith(FOLDER, write?.path);
  });

  it('Enter commits the query to history; the up/down arrows walk it back (B-18, S-136)', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([]) });
    const user = userEvent.setup();
    mount();
    const field = screen.getByRole('searchbox', { name: t('search.view.queryLabel') });

    await user.type(field, 'one{Enter}');
    await user.clear(field);
    await user.type(field, 'two{Enter}');
    await user.clear(field);
    await user.type(field, 'typing…');

    await user.type(field, '{ArrowUp}');
    expect(field).toHaveValue('two');

    await user.type(field, '{ArrowUp}');
    expect(field).toHaveValue('one');

    await user.type(field, '{ArrowDown}');
    expect(field).toHaveValue('two');

    await user.type(field, '{ArrowDown}');
    expect(field).toHaveValue('typing…');
  });

  it('"Limpar histórico" empties only this folder’s own history (S-138)', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([]) });
    searchViewStore(FOLDER).getState().pushHistory('TODO');
    searchViewStore('/srv/projects/other').getState().pushHistory('FIXME');
    mount();

    commandRegistry.command('search.clearHistory')?.run();

    expect(searchViewStore(FOLDER).getState().history).toEqual([]);
    expect(searchViewStore('/srv/projects/other').getState().history).toEqual(['FIXME']);
  });

  it('keeps working with no history when the browser storage refuses every call (S-137)', async () => {
    const privateFolder = '/srv/projects/private-window';
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([]) });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();

    // The real path a folder tab opens by, so `TabRestorer`'s own `restoreTab` genuinely runs
    // against the mocked storage above, same as the workbench calls it on the real app's first
    // open of a tab (plan 06) — not just this feature's own in-memory store.
    const { folderTabStore } = await import('@/features/workbench');
    expect(() => folderTabStore(privateFolder)).not.toThrow();

    expect(() => render(<SearchView folder={privateFolder} />)).not.toThrow();
    const field = screen.getByRole('searchbox', { name: t('search.view.queryLabel') });
    await user.type(field, 'TODO{Enter}');

    expect(searchViewStore(privateFolder).getState().history).toEqual(['TODO']);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('keeps 44 px touch targets on a phone viewport — B-20, S-147', async () => {
    aViewport('phone');
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([]) });
    mount();

    expect(screen.getByRole('button', { name: t('search.view.actionCollapseAll') })).toHaveClass(
      'size-touch',
    );
    expect(screen.getByRole('button', { name: t('help.panel.open') })).toHaveClass('size-touch');
  });

  it('has no accessibility violation', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const user = userEvent.setup();
    const { container } = mount();

    await typeQuery(user, 'TODO');
    await screen.findByRole('treeitem', { name: 'a.ts' });

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no accessibility violation with its own help open — B-20', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([]) });
    const user = userEvent.setup();
    mount();

    await user.click(screen.getByRole('button', { name: t('help.panel.open') }));
    await screen.findByRole('dialog');

    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('F4/Shift+F4 step through the results, wrapping at either end — B-19, S-141', async () => {
    fakeWatches();
    fakeSearchApi({
      text: () =>
        framesOf([
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
        ]),
    });
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    const user = userEvent.setup();
    mount();

    await typeQuery(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    commandRegistry.command('search.nextResult')?.run();
    expect(openFile).toHaveBeenLastCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
      toSide: false,
    });

    commandRegistry.command('search.nextResult')?.run();
    expect(openFile).toHaveBeenLastCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 5 },
      toSide: false,
    });

    commandRegistry.command('search.nextResult')?.run();
    expect(openFile).toHaveBeenLastCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 5 },
      toSide: false,
    });

    commandRegistry.command('search.previousResult')?.run();
    expect(openFile).toHaveBeenLastCalledWith(FOLDER, 'a.ts', {
      selection: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 5 },
      toSide: false,
    });
  });

  it('search.nextResult/previousResult are unavailable with no match on screen', () => {
    mount();

    expect(commandRegistry.command('search.nextResult')?.when?.()).toBe(false);
    expect(commandRegistry.command('search.previousResult')?.when?.()).toBe(false);
  });

  it('F4 does not fire while the focus is in a text field that consumes it — B-19, S-139', async () => {
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([aFileFrame('a.ts')]) });
    const openFile = vi.spyOn(editorFeature, 'openFile').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <>
        <CommandHost />
        <SearchView folder={FOLDER} />
      </>,
    );

    const field = screen.getByRole('searchbox', { name: t('search.view.queryLabel') });
    await user.type(field, 'TODO');
    await screen.findByRole('treeitem', { name: 'a.ts' });
    field.focus();

    await user.keyboard('{F4}');

    expect(openFile).not.toHaveBeenCalled();
  });

  it('focuses the query field on mount, and Escape gives the focus back to the editor — B-20, S-146', async () => {
    const focusEditor = vi.spyOn(editorFeature, 'focusEditor').mockImplementation(() => undefined);
    const user = userEvent.setup();
    mount();

    const field = screen.getByRole('searchbox', { name: t('search.view.queryLabel') });
    expect(field).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(focusEditor).toHaveBeenCalledWith(FOLDER);
  });

  it('changing "to exclude" in Settings › Busca takes effect on the next search opened — B-19, S-140', async () => {
    const { useSearchPreferences } =
      await import('@/features/search/store/search-preferences.store');
    useSearchPreferences.getState().set('exclude', '*.generated.ts');

    const freshFolder = '/srv/projects/settings-default';
    fakeWatches();
    fakeSearchApi({ text: () => framesOf([]) });
    render(<SearchView folder={freshFolder} />);

    expect(screen.getByRole('textbox', { name: t('search.view.excludeLabel') })).toHaveValue(
      '*.generated.ts',
    );

    useSearchPreferences.setState({
      preferences: { ...useSearchPreferences.getState().preferences, exclude: '' },
    });
  });
});
