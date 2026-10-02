import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { explorerStore } from '@/features/explorer';
import { resetEditorFake } from '../../../support/editor-fake';
import {
  APP,
  ExplorerHarness,
  fakeWatches,
  row,
  theTree,
  watching,
} from '../../../support/explorer';
import type { FakeWatches } from '../../../support/explorer';
import { FakeFolder } from '../../../support/files-api';
import { render, translator } from '../../../support/render';

vi.mock('@/features/editor', async () => (await import('../../../support/editor-fake')).editorFake);

const t = translator('en');
const PKG = `${APP}/pkg`;

afterEach(() => {
  vi.restoreAllMocks();
  resetEditorFake();
});

function open(tree: Record<string, string | { kind: 'directory' }>, folder = APP) {
  const disk = new FakeFolder(folder, tree).install();
  const watches = fakeWatches();
  const rendered = render(<ExplorerHarness folder={folder} />);
  return { disk, watches, ...rendered };
}

function changed(
  watches: FakeWatches,
  changes: { path: string; kind: 'created' | 'changed' | 'deleted' }[],
  overflow = false,
  folder = APP,
): void {
  act(() => {
    watches.subscriber(folder).onChanges(changes, overflow);
  });
}

function treeReads(disk: FakeFolder): (string | null)[] {
  return disk.callsTo('GET', '/files/tree').map((call) => call.query.get('path'));
}

describe('the tree follows the disk — S-188, S-189', () => {
  it('shows an entry created in an open folder, without a reload of the page', async () => {
    const user = userEvent.setup();
    const { disk, watches } = open({ 'src/a.ts': 'a' });
    watching(watches);
    await user.click(await row('src'));
    await row('a.ts');

    disk.put('src/new.ts', 'Claude wrote this');
    changed(watches, [{ path: 'src/new.ts', kind: 'created' }]);

    expect(await row('new.ts')).toBeVisible();
  });

  it('moves the selection to the neighbour of a deleted entry, and keeps the focus in the tree', async () => {
    const user = userEvent.setup();
    const { disk, watches } = open({ 'a.ts': 'a', 'b.ts': 'b', 'c.ts': 'c' });
    await user.click(await row('b.ts'));
    expect(await row('b.ts')).toHaveFocus();

    disk.remove('b.ts');
    changed(watches, [{ path: 'b.ts', kind: 'deleted' }]);

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'b.ts' })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole('treeitem', { name: 'c.ts' })).toHaveFocus();
    });
    expect(explorerStore(APP).getState().selection).toEqual(['c.ts']);
  });

  it('drops the levels of a folder deleted on disk', async () => {
    const user = userEvent.setup();
    const { disk, watches } = open({ 'src/a.ts': 'a', 'z.ts': 'z' });
    await user.click(await row('src'));
    await row('a.ts');

    disk.remove('src');
    changed(watches, [{ path: 'src', kind: 'deleted' }]);

    await waitFor(() => {
      expect(screen.queryByRole('treeitem', { name: 'src' })).toBeNull();
    });
    expect(screen.queryByRole('treeitem', { name: 'a.ts' })).toBeNull();
  });
});

describe('an overflow and a reconnect read everything again — S-190, S-191', () => {
  it('reads every open folder again on an overflow', async () => {
    const user = userEvent.setup();
    const { disk, watches } = open({ 'src/a.ts': 'a', 'lib/b.ts': 'b' });
    await user.click(await row('src'));
    await user.click(await row('lib'));
    await row('b.ts');
    const before = treeReads(disk).length;

    disk.put('lib/c.ts', 'c');
    changed(watches, [], true);

    expect(await row('c.ts')).toBeVisible();
    await waitFor(() => {
      expect(treeReads(disk).slice(before).sort()).toEqual(['', 'lib', 'src']);
    });
  });

  it('reads everything again when the watch is made anew after a reconnect', async () => {
    const { disk, watches } = open({ 'a.ts': 'a' });
    await row('a.ts');
    watching(watches);
    expect(treeReads(disk)).toEqual(['']);

    disk.put('b.ts', 'b');
    watching(watches, APP, true);

    expect(await row('b.ts')).toBeVisible();
  });
});

describe('a folder tab not on screen — S-192, S-193', () => {
  it('spends no watcher, and shows on return what changed meanwhile', async () => {
    const { disk, watches, unmount } = open({ 'a.ts': 'a' });
    await row('a.ts');
    expect(watches.held(APP)).toBe(1);

    unmount();
    expect(watches.held(APP)).toBe(0);
    disk.put('b.ts', 'written while away');

    render(<ExplorerHarness folder={APP} />);

    expect(await row('b.ts')).toBeVisible();
    expect(watches.held(APP)).toBe(1);
  });

  it('does not draw the tab on screen again for what happens to another one', async () => {
    const commits: string[] = [];
    new FakeFolder(APP, { 'a.ts': 'a' }).install();
    const watches = fakeWatches();
    render(
      <Profiler id="active" onRender={(id) => commits.push(id)}>
        <ExplorerHarness folder={APP} />
      </Profiler>,
    );
    await row('a.ts');
    await waitFor(() => {
      expect(commits.length).toBeGreaterThan(0);
    });
    const settled = commits.length;

    act(() => {
      explorerStore(PKG).getState().setShowHidden(true);
      explorerStore(PKG).getState().announce('explorer.done.undone');
    });

    expect(commits.length).toBe(settled);
    expect(watches.held(PKG)).toBe(0);
  });
});

describe('a watcher this machine refuses — S-194', () => {
  it('says so, and reads the tree again by hand, asking for the watcher again', async () => {
    const user = userEvent.setup();
    const { disk, watches } = open({ 'a.ts': 'a' });
    await row('a.ts');

    act(() => {
      watches.subscriber(APP).onRefused({ code: 'WATCH_UNAVAILABLE', params: {}, traceId: null });
    });

    expect(await screen.findByText(t('files.error.watchUnavailable'))).toBeVisible();
    expect(screen.getByRole('button', { name: t('explorer.status.notFollowed') })).toBeVisible();
    disk.put('b.ts', 'b');
    const notice = screen.getByText(t('files.error.watchUnavailable')).closest('[role="status"]');
    await user.click(
      within(notice as HTMLElement).getByRole('button', { name: t('explorer.watch.reload') }),
    );

    expect(await row('b.ts')).toBeVisible();
    expect(watches.watched.filter((folder) => folder === APP)).toHaveLength(2);

    watching(watches);
    await waitFor(() => {
      expect(screen.queryByText(t('files.error.watchUnavailable'))).toBeNull();
    });
  });

  it.each([
    ['WATCH_LIMIT_REACHED', 'explorer.watch.limitReached'],
    ['SOMETHING_ELSE', 'explorer.watch.refused'],
  ])('says why for %s', async (code, key) => {
    const { watches } = open({ 'a.ts': 'a' });
    await row('a.ts');

    act(() => {
      watches.subscriber(APP).onRefused({ code, params: {}, traceId: null });
    });

    expect(await screen.findByText(t(key))).toBeVisible();
  });

  it('says it when the machine stopped following, out of watchers', async () => {
    const { watches } = open({ 'a.ts': 'a' });
    await row('a.ts');

    act(() => {
      watches.subscriber(APP).onStopped('systemLimit');
    });

    expect(await screen.findByText(t('explorer.watch.systemLimit'))).toBeVisible();
  });
});

describe('a folder that went — S-195', () => {
  it.each([
    ['folderDeleted', 'explorer.watch.folderDeleted'],
    ['allowlistChanged', 'explorer.watch.allowlistChanged'],
  ] as const)('puts this tab in its error state on %s, and no other', async (reason, key) => {
    const { watches } = open({ 'a.ts': 'a' });
    await row('a.ts');

    act(() => {
      watches.subscriber(APP).onStopped(reason);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(t(key));
    expect(screen.getByRole('link', { name: t('explorer.error.backToStart') })).toBeVisible();
    expect(explorerStore(PKG).getState().watch).toEqual({ state: 'following' });
  });
});

describe('two folder tabs share nothing — S-160', () => {
  it('opening src in /app does not open it in /app/pkg', async () => {
    const user = userEvent.setup();
    open({ 'src/a.ts': 'a' });
    await user.click(await row('src'));
    await row('a.ts');
    cleanup();
    vi.restoreAllMocks();

    open({ 'src/b.ts': 'b' }, PKG);

    expect(await row('src')).toHaveAttribute('aria-expanded', 'false');
    expect(explorerStore(APP).getState().expanded.has('src')).toBe(true);
    expect(explorerStore(PKG).getState().expanded.has('src')).toBe(false);
    void theTree;
  });
});
