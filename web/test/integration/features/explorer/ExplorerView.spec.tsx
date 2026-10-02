import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderExplorer, row, theTree } from '../../../support/explorer';
import { filesRefusal } from '../../../support/files-api';
import { translator } from '../../../support/render';
import { resetEditorFake } from '../../../support/editor-fake';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
  resetEditorFake();
});

function rowNames(tree: HTMLElement): string[] {
  return within(tree)
    .getAllByRole('treeitem')
    .map((item) => item.getAttribute('aria-label') ?? item.textContent ?? '');
}

describe('the four states of the Explorer — S-157', () => {
  it('shows the shape of the tree while the folder is read', async () => {
    const { disk } = renderExplorer({});
    const release = disk.hold((call) => call.route === '/files/tree');

    expect(
      await screen.findByRole('status', { name: t('explorer.tree.loadingFolder') }),
    ).toBeVisible();
    release();
  });

  it('shows the entries of the folder, folders first', async () => {
    renderExplorer({ 'b.ts': 'b', 'a.md': 'a', src: { kind: 'directory' } });

    const tree = await theTree();
    await within(tree).findByRole('treeitem', { name: 'a.md' });
    expect(rowNames(tree)).toEqual(['src', 'a.md', 'b.ts']);
    expect(within(tree).getByRole('treeitem', { name: 'src' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('teaches the next step in an empty folder, without the drag from the desktop of F7 — S-200', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({});

    expect(await screen.findByText(t('explorer.empty.title'))).toBeVisible();
    expect(screen.getByText(t('explorer.empty.description'))).toBeVisible();

    const empty = screen.getByText(t('explorer.empty.title')).parentElement as HTMLElement;
    await user.click(
      within(empty).getByRole('button', { name: t('explorer.action.newFromTemplate') }),
    );
    expect(await screen.findByRole('dialog', { name: t('explorer.template.title') })).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('explorer.template.cancel') }));

    await user.click(within(empty).getByRole('button', { name: t('explorer.action.newFile') }));
    expect(await screen.findByRole('textbox', { name: t('explorer.name.newFile') })).toHaveFocus();
    expect(disk.callsTo('POST', '/files')).toHaveLength(0);
  });

  it('says the refusal translated, with its trace and a way to try again', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'a.ts': 'a' });
    disk.refuseNext(
      (call) => call.route === '/files/tree',
      filesRefusal('FILE_ACCESS_DENIED', 'files.error.accessDenied', { path: '' }),
    );

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(t('files.error.accessDenied', { path: '' }))).toBeVisible();
    expect(
      within(alert).getByText(t('common.error.traceLabel', { traceId: 'trace-files' })),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: t('explorer.error.backToStart') })).toBeNull();

    await user.click(within(alert).getByRole('button', { name: t('common.action.retry') }));
    expect(await row('a.ts')).toBeVisible();
  });

  it.each([
    ['WORKSPACE_NOT_ALLOWED', 'workspace.error.notAllowed'],
    ['WORKSPACE_NOT_FOUND', 'workspace.error.notFound'],
  ])(
    'leads back to the start when the folder itself is refused (%s) — S-158',
    async (code, key) => {
      const { disk } = renderExplorer({});
      disk.refuseNext(
        (call) => call.route === '/files/tree',
        filesRefusal(code, key, { path: '/srv/projects/app' }),
      );

      expect(await screen.findByText(t(key, { path: '/srv/projects/app' }))).toBeVisible();
      expect(screen.getByRole('link', { name: t('explorer.error.backToStart') })).toHaveAttribute(
        'href',
        '/',
      );
    },
  );
});

describe('a folder is read when it is opened — S-159', () => {
  it('asks for a level only on expand, and reads the cache when it is opened again', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'src/a.ts': 'a', 'src/b.ts': 'b', 'README.md': 'r' });

    const src = await row('src');
    expect(disk.callsTo('GET', '/files/tree').map((call) => call.query.get('path'))).toEqual(['']);

    await user.click(src);
    expect(await row('a.ts')).toBeVisible();
    expect(src).toHaveAttribute('aria-expanded', 'true');

    await user.click(src);
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull();
    });
    await user.click(src);
    expect(await row('a.ts')).toBeVisible();

    expect(disk.callsTo('GET', '/files/tree').map((call) => call.query.get('path'))).toEqual([
      '',
      'src',
    ]);
  });

  it('says a level that could not be read, and reads it again on Enter', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({ 'src/a.ts': 'a' });
    disk.refuseNext(
      (call) => call.query.get('path') === 'src',
      filesRefusal('FILE_ACCESS_DENIED', 'files.error.accessDenied', { path: 'src' }),
    );

    await user.click(await row('src'));
    const failed = await screen.findByText(
      t('explorer.tree.levelFailed', { reason: t('files.error.accessDenied', { path: 'src' }) }),
    );
    const item = failed.closest('[role="treeitem"]') as HTMLElement;
    item.focus();
    await user.keyboard('{Enter}');

    expect(await row('a.ts')).toBeVisible();
  });
});

describe('what the tree shows — B-25', () => {
  it('says a level was cut by the ceiling — S-163', async () => {
    renderExplorer({ 'a.ts': 'a' }, { truncated: [''] });

    expect(await screen.findByText(t('explorer.tree.truncated'))).toBeVisible();
  });

  it('shows single folders together, and the preference shows them apart — S-164', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'a/b/c/x.ts': 'x', 'top.ts': 't' });

    await user.click(await row('a'));
    expect(await row('a/b/c')).toHaveAttribute('aria-expanded', 'true');
    expect(await row('x.ts')).toHaveAttribute('aria-level', '2');

    await user.click(screen.getByRole('button', { name: t('explorer.toolbar.options') }));
    await user.click(
      await screen.findByRole('menuitem', { name: t('explorer.action.expandCompact') }),
    );

    expect(await row('a')).toHaveAttribute('aria-expanded', 'true');
    expect(await row('b')).toHaveAttribute('aria-expanded', 'false');
  });

  it('sorts by name, type and last modified, folders first — S-165', async () => {
    const user = userEvent.setup();
    renderExplorer({
      'b.md': { kind: 'file', content: 'b', mtime: '2026-09-30T10:00:00.000Z' },
      'a.ts': { kind: 'file', content: 'a', mtime: '2026-09-30T12:00:00.000Z' },
      'c.json': { kind: 'file', content: 'c', mtime: '2026-09-30T11:00:00.000Z' },
      lib: { kind: 'directory' },
    });
    const tree = await theTree();
    await within(tree).findByRole('treeitem', { name: 'a.ts' });
    expect(rowNames(tree)).toEqual(['lib', 'a.ts', 'b.md', 'c.json']);

    const sortBy = async (key: string): Promise<void> => {
      await user.click(screen.getByRole('button', { name: t('explorer.toolbar.options') }));
      await user.click(await screen.findByRole('menuitemradio', { name: t(key) }));
    };

    await sortBy('explorer.action.sortByType');
    expect(rowNames(tree)).toEqual(['lib', 'c.json', 'b.md', 'a.ts']);

    await sortBy('explorer.action.sortByModified');
    expect(rowNames(tree)).toEqual(['lib', 'a.ts', 'c.json', 'b.md']);
  });

  it('filters by name, keeping the folders that lead to a match, and collapses all — S-165', async () => {
    const user = userEvent.setup();
    renderExplorer({ 'src/needle.ts': 'n', 'src/hay.ts': 'h', 'other.md': 'o' });
    await user.click(await row('src'));
    await row('needle.ts');

    await user.type(screen.getByRole('searchbox', { name: t('explorer.filter.label') }), 'needle');
    const tree = await theTree();
    expect(rowNames(tree)).toEqual(['src', 'needle.ts']);

    await user.clear(screen.getByRole('searchbox', { name: t('explorer.filter.label') }));
    await user.type(screen.getByRole('searchbox', { name: t('explorer.filter.label') }), 'nothing');
    expect(
      await screen.findByText(t('explorer.filter.noMatch', { filter: 'nothing' })),
    ).toBeVisible();
    await user.clear(screen.getByRole('searchbox', { name: t('explorer.filter.label') }));

    await user.click(screen.getByRole('button', { name: t('explorer.action.collapseAll') }));
    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'needle.ts' })).toBeNull();
    });
    expect(await row('src')).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides what the server marks hidden, and the toggle shows it — S-166', async () => {
    const user = userEvent.setup();
    renderExplorer({ '.git': { kind: 'directory', hidden: true }, 'a.ts': 'a' });
    const tree = await theTree();
    await within(tree).findByRole('treeitem', { name: 'a.ts' });
    expect(within(tree).queryByRole('treeitem', { name: '.git' })).toBeNull();

    await user.click(screen.getByRole('button', { name: t('explorer.toolbar.options') }));
    await user.click(
      await screen.findByRole('menuitem', { name: t('explorer.action.showHidden') }),
    );

    expect(await row('.git')).toBeVisible();
  });

  it('marks a link out of the folder, which does not open, and an unreadable name, inert — S-167', async () => {
    const user = userEvent.setup();
    const { disk } = renderExplorer({
      escape: { kind: 'symlink', outside: true, targetKind: null },
      'bad�name': { kind: 'file', content: '', unreadableName: true },
    });

    const link = await row('escape');
    expect(link).not.toHaveAttribute('aria-expanded');
    expect(link).toHaveAccessibleDescription(t('explorer.tree.outsideLink'));
    await user.dblClick(link);
    expect(disk.callsTo('GET', '/files/tree')).toHaveLength(1);

    expect(await row('bad�name')).toHaveAccessibleDescription(t('explorer.tree.unreadableName'));
  });
});
