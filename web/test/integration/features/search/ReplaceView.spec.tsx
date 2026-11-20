import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { SearchReplacePreviewFramePayload } from '@remote-claude/contracts';

import * as editorFeature from '@/features/editor';
import { SearchView } from '@/features/search/components/SearchView';
import { forgetSearchView } from '@/features/search/store/search-view.store';
import { render, translator } from '../../../support/render';
import { fakeSearchApi, refusal } from '../../../support/search-api';
import { fakeWatches } from '../../../support/explorer';

const FOLDER = '/srv/projects/a';
const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  forgetSearchView(null);
});

function mount() {
  return render(<SearchView folder={FOLDER} />);
}

function aReplaceFrame(path: string, line = 1): SearchReplacePreviewFramePayload {
  return {
    type: 'file',
    path,
    etag: `sha256:${path}`,
    matches: [
      {
        line,
        column: 1,
        endColumn: 5,
        preview: 'TODO soon',
        previewMatchStart: 0,
        previewMatchEnd: 4,
        replacement: 'DONE',
      },
    ],
  };
}

function framesOf(
  files: readonly SearchReplacePreviewFramePayload[],
): readonly SearchReplacePreviewFramePayload[] {
  return [...files, { type: 'end', truncated: null, skipped: 0 }];
}

async function openReplace(user: ReturnType<typeof userEvent.setup>, query: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: t('search.view.replaceToggle') }));
  await user.type(screen.getByRole('searchbox', { name: t('search.view.queryLabel') }), query);
  await user.type(screen.getByRole('textbox', { name: t('search.view.replaceLabel') }), 'DONE');
}

describe('the replace row — plan 11, B-16', () => {
  it('shows the before struck through and the after, once the row opens — S-116, S-124', async () => {
    fakeWatches();
    fakeSearchApi({ replacePreview: () => framesOf([aReplaceFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');

    const match = await screen.findByRole('treeitem', { name: /Line 1/ });
    expect(within(match).getByText('TODO')).toBeVisible();
    expect(within(match).getByText('DONE')).toBeVisible();
  });

  it('collapses and expands a file by its own chevron — clicking the row opens the diff instead', async () => {
    const openDiff = vi.spyOn(editorFeature, 'openDiff').mockImplementation(() => undefined);
    fakeSearchApi({ replacePreview: () => framesOf([aReplaceFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });
    const fileRow = screen.getByRole('treeitem', { name: 'a.ts' });

    await user.click(
      within(fileRow).getByRole('button', { name: t('search.view.actionCollapseAll') }),
    );
    expect(screen.queryByRole('treeitem', { name: /Line 1/ })).toBeNull();

    await user.click(
      within(fileRow).getByRole('button', { name: t('search.view.actionExpandAll') }),
    );
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(fileRow);
    expect(openDiff).toHaveBeenCalledWith(
      FOLDER,
      { path: 'a.ts', source: 'disk' },
      expect.objectContaining({ path: 'a.ts', source: 'provided' }),
    );
  });

  it('toggles "preserve case" on and off, asking the preview again with it', async () => {
    const { ndjson } = fakeSearchApi({ replacePreview: () => framesOf([aReplaceFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(screen.getByRole('button', { name: t('search.view.flagPreserveCase') }));

    await waitFor(() => {
      const last = ndjson.mock.calls.at(-1) as [string, Record<string, unknown>] | undefined;
      expect(last?.[1]).toMatchObject({ preserveCase: true });
    });
    expect(screen.getByRole('button', { name: t('search.view.flagPreserveCase') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the scope before "replace all" applies, and the report after — S-124', async () => {
    fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts'), aReplaceFrame('b.ts')]),
      apply: (body) => ({
        report: {
          applied: (body['files'] as { path: string }[]).map((file) => file.path),
          changed: [],
          missing: [],
          skipped: [],
        },
      }),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(false);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: 'b.ts' });

    await user.click(screen.getByRole('button', { name: t('search.view.actionReplaceAll') }));
    const dialog = await screen.findByRole('dialog', { name: t('search.view.replaceScopeTitle') });
    expect(
      within(dialog).getByText(t('search.view.replaceScopeBody', { count: 2, files: 2 })),
    ).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('search.view.replaceScopeConfirm') }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      t('search.view.replaceReportApplied', { count: 2 }),
    );
  });

  it('a double click on "replace all" applies once — S-127', async () => {
    const { post } = fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts')]),
      apply: () => ({ report: { applied: ['a.ts'], changed: [], missing: [], skipped: [] } }),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(false);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(screen.getByRole('button', { name: t('search.view.actionReplaceAll') }));
    const dialog = await screen.findByRole('dialog', { name: t('search.view.replaceScopeTitle') });
    await user.dblClick(
      within(dialog).getByRole('button', { name: t('search.view.replaceScopeConfirm') }),
    );

    await screen.findByRole('status');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('warns before replacing a file open dirty, and lets it through anyway — S-126', async () => {
    fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts')]),
      apply: () => ({ report: { applied: ['a.ts'], changed: [], missing: [], skipped: [] } }),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(true);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    const fileRow = await screen.findByRole('treeitem', { name: 'a.ts' });
    await user.pointer({ keys: '[MouseRight]', target: fileRow });
    const menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionReplaceFile')));

    const dialog = await screen.findByRole('dialog', { name: t('search.view.replaceDirtyTitle') });
    expect(within(dialog).getByText(t('search.view.replaceDirtyBody', { count: 1 }))).toBeVisible();

    await user.click(
      within(dialog).getByRole('button', { name: t('search.view.replaceDirtyConfirm') }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      t('search.view.replaceReportApplied', { count: 1 }),
    );
  });

  it('replaces a clean file at once, no dialog in the way', async () => {
    fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts')]),
      apply: () => ({ report: { applied: ['a.ts'], changed: [], missing: [], skipped: [] } }),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(false);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    const fileRow = await screen.findByRole('treeitem', { name: 'a.ts' });
    await user.pointer({ keys: '[MouseRight]', target: fileRow });
    const menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionReplaceFile')));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('status')).toHaveTextContent(
      t('search.view.replaceReportApplied', { count: 1 }),
    );
  });

  it('replacing one match replaces only its own file, never another one — S-128', async () => {
    const { post } = fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts'), aReplaceFrame('b.ts')]),
      apply: () => ({ report: { applied: ['a.ts'], changed: [], missing: [], skipped: [] } }),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(false);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: 'b.ts' });
    const [match] = screen.getAllByRole('treeitem', { name: /Line 1/ });
    await user.pointer({ keys: '[MouseRight]', target: match! });
    const menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionReplaceMatch')));

    await waitFor(() => {
      expect(post).toHaveBeenCalled();
    });
    const [, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(body['files']).toEqual([{ path: 'a.ts', etag: 'sha256:a.ts' }]);
  });

  it('opens the diff of a file, read-only, disk beside the replace — S-125', async () => {
    const openDiff = vi.spyOn(editorFeature, 'openDiff').mockImplementation(() => undefined);
    fakeSearchApi({ replacePreview: () => framesOf([aReplaceFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    const fileRow = await screen.findByRole('treeitem', { name: 'a.ts' });
    await user.pointer({ keys: '[MouseRight]', target: fileRow });
    const menu = await screen.findByRole('menu', { name: t('search.view.menuLabel') });
    await user.click(within(menu).getByText(t('search.view.actionOpenDiff')));

    expect(openDiff).toHaveBeenCalledWith(
      FOLDER,
      { path: 'a.ts', source: 'disk' },
      expect.objectContaining({ path: 'a.ts', source: 'provided' }),
    );
  });

  it('offers "redo preview" only for the preserved files, and it asks the preview again — S-129', async () => {
    const { ndjson } = fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts')]),
      apply: () => ({ report: { applied: [], changed: ['a.ts'], missing: [], skipped: [] } }),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(false);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(screen.getByRole('button', { name: t('search.view.actionReplaceAll') }));
    const dialog = await screen.findByRole('dialog', { name: t('search.view.replaceScopeTitle') });
    await user.click(
      within(dialog).getByRole('button', { name: t('search.view.replaceScopeConfirm') }),
    );

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(t('search.view.replaceReportPreserved', { count: 1 }));

    const before = ndjson.mock.calls.length;
    await user.click(
      within(banner).getByRole('button', { name: t('search.view.actionRedoPreview') }),
    );

    expect(screen.queryByRole('status')).toBeNull();
    await waitFor(() => {
      expect(ndjson.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('keeps the replace preview’s rows through its own refusal — S-114', async () => {
    const search = fakeSearchApi({ replacePreview: () => framesOf([aReplaceFrame('a.ts')]) });
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    const error = refusal('SEARCH_PATTERN_INVALID', 'search.error.patternInvalid');
    search.ndjson.mockImplementation(() => {
      throw error;
    });
    await user.click(screen.getByRole('button', { name: t('search.view.flagIsRegex') }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(t('search.error.patternInvalid'));
    });
    expect(screen.getByRole('treeitem', { name: 'a.ts' })).toBeVisible();
  });

  it('shows a real refusal of the apply itself, translated, never losing it unhandled — S-124', async () => {
    fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts')]),
      apply: () => refusal('PAYLOAD_TOO_LARGE', 'search.error.replaceTooManyFiles'),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(false);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: /Line 1/ });

    await user.click(screen.getByRole('button', { name: t('search.view.actionReplaceAll') }));
    const dialog = await screen.findByRole('dialog', { name: t('search.view.replaceScopeTitle') });
    await user.click(
      within(dialog).getByRole('button', { name: t('search.view.replaceScopeConfirm') }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('search.error.replaceTooManyFiles'),
    );
  });

  it('shows what was already applied before a write failed partway, beside the error', async () => {
    fakeSearchApi({
      replacePreview: () => framesOf([aReplaceFrame('a.ts'), aReplaceFrame('b.ts')]),
      apply: () =>
        refusal('INTERNAL_ERROR', 'search.error.replaceApplyFailed', { applied: ['a.ts'] }),
    });
    vi.spyOn(editorFeature, 'fileIsDirty').mockReturnValue(false);
    const user = userEvent.setup();
    mount();

    await openReplace(user, 'TODO');
    await screen.findByRole('treeitem', { name: 'b.ts' });

    await user.click(screen.getByRole('button', { name: t('search.view.actionReplaceAll') }));
    const dialog = await screen.findByRole('dialog', { name: t('search.view.replaceScopeTitle') });
    await user.click(
      within(dialog).getByRole('button', { name: t('search.view.replaceScopeConfirm') }),
    );

    const banner = await screen.findByRole('status');
    expect(within(banner).getByRole('alert')).toHaveTextContent(
      t('search.error.replaceApplyFailed'),
    );
    expect(banner).toHaveTextContent(
      t('search.view.replaceReportAppliedBeforeFailure', { count: 1 }),
    );
  });
});
