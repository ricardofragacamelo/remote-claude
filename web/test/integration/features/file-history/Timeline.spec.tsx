import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { whenOf } from '@/features/file-history/lib/entries';
import { timelineStore } from '@/features/file-history/store/timeline.store';
import { openDiff } from '@/features/editor';
import { FOLDER, editorOf, typeInto } from '../../../support/editor';
import { versionOf } from '../../../support/editor-disk';
import { filesRefusal } from '../../../support/files-api';
import { FakeHistory, SOMEONE } from '../../../support/history-api';
import { translator } from '../../../support/render';
import { opened, renderTimeline, timelineToggle, versionsOf } from '../../../support/timeline';

const t = translator('en');

/** The label a version's action carries — every one names when the version was kept. */
function actionOn(key: string, at: string): string {
  return t(key, { when: whenOf(at, 'en') });
}

describe('the Timeline of the active file — plan 07, S-345, S-347, S-348, S-350', () => {
  it('lists the versions with why, who and when, newest first, a page at a time (S-345)', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const reasons = ['save', 'delete', 'restore', 'upload'] as const;
    const seeded = Array.from({ length: 23 }, (_, index) =>
      history.version('a.ts', `v${String(index)}`, { reason: reasons[index % 4] ?? 'save' }),
    );
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');

    await user.click(timelineToggle());
    const rows = await versionsOf('a.ts');

    expect(rows).toHaveLength(20);
    const newest = seeded.at(-1);
    expect(rows[0]).toHaveTextContent(t('fileHistory.reason.restore'));
    expect(rows[1]).toHaveTextContent(t('fileHistory.reason.delete'));
    expect(rows[0]).toHaveTextContent(
      t('fileHistory.version.byAt', {
        who: t('fileHistory.author.self'),
        when: whenOf(newest?.at ?? '', 'en'),
      }),
    );
    expect(screen.getByText(t('fileHistory.timeline.of', { path: 'a.ts' }))).toBeVisible();
    const [first] = history.callsOf('GET');
    expect(first?.query.get('folder')).toBe(FOLDER);
    expect(first?.query.get('path')).toBe('a.ts');
    expect(first?.query.get('limit')).toBe('20');
    expect(first?.query.get('reason')).toBeNull();

    await user.click(screen.getByRole('button', { name: t('fileHistory.timeline.more') }));
    await waitFor(async () => {
      expect(await versionsOf('a.ts')).toHaveLength(23);
    });
    expect(history.callsOf('GET').at(-1)?.query.get('cursor')).toBe('20');
    expect(screen.queryByRole('button', { name: t('fileHistory.timeline.more') })).toBeNull();
  });

  it('names a version somebody else wrote by the start of their identity (S-350)', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const theirs = history.version('a.ts', 'theirs', { author: SOMEONE });
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');

    await user.click(timelineToggle());
    const [row] = await versionsOf('a.ts');

    expect(row).toHaveTextContent(
      t('fileHistory.version.byAt', {
        who: t('fileHistory.author.other', { id: 'f3c9a1d7' }),
        when: whenOf(theirs.at, 'en'),
      }),
    );
    expect(row).not.toHaveTextContent(SOMEONE);
  });

  it('filters by why a version was kept, and says when nothing matches (S-347)', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    history.version('a.ts', 'saved', { reason: 'save' });
    history.version('a.ts', 'before delete', { reason: 'delete' });
    history.version('a.ts', 'before restore', { reason: 'restore' });
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');
    await user.click(timelineToggle());
    expect(await versionsOf('a.ts')).toHaveLength(3);

    const filter = screen.getByRole('group', { name: t('fileHistory.filter.label') });
    await user.click(within(filter).getByRole('button', { name: t('fileHistory.filter.delete') }));

    await waitFor(async () => {
      expect(await versionsOf('a.ts')).toHaveLength(1);
    });
    expect((await versionsOf('a.ts'))[0]).toHaveTextContent(t('fileHistory.reason.delete'));
    expect(history.callsOf('GET').at(-1)?.query.get('reason')).toBe('delete');
    expect(
      within(filter).getByRole('button', { name: t('fileHistory.filter.delete') }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(filter).getByRole('button', { name: t('fileHistory.filter.upload') }));
    expect(await screen.findByText(t('fileHistory.empty.filtered'))).toBeVisible();

    await user.click(within(filter).getByRole('button', { name: t('fileHistory.filter.all') }));
    await waitFor(async () => {
      expect(await versionsOf('a.ts')).toHaveLength(3);
    });
  });

  it('says why a version too large to keep cannot be compared or restored', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const big = history.version('a.ts', 'x'.repeat(10), { kept: 'tooLarge' });
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');

    await user.click(timelineToggle());
    const [row] = await versionsOf('a.ts');

    expect(row).toHaveTextContent(t('fileHistory.version.tooLarge'));
    expect(within(row as HTMLElement).queryAllByRole('button')).toHaveLength(0);
    expect(
      screen.queryByRole('button', {
        name: actionOn('fileHistory.action.restore', big.at),
      }),
    ).toBeNull();
  });

  it('explains when the history of a file starts, for a file with none yet (S-348)', async () => {
    const user = userEvent.setup();
    renderTimeline({ 'a.ts': 'now' });
    await opened('a.ts');

    await user.click(timelineToggle());

    expect(await screen.findByText(t('fileHistory.empty.title'))).toBeVisible();
    expect(screen.getByText(t('fileHistory.empty.description'))).toBeVisible();
  });

  it('says how to get a file before one is open, and reads nothing while closed', async () => {
    const user = userEvent.setup();
    const { history } = renderTimeline({});

    expect(timelineToggle()).toHaveAttribute('aria-expanded', 'false');
    await user.click(timelineToggle());

    expect(timelineToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(t('fileHistory.timeline.noFile'))).toBeVisible();
    expect(history.calls).toEqual([]);

    await user.click(timelineToggle());
    expect(screen.queryByText(t('fileHistory.timeline.noFile'))).toBeNull();
  });

  it('follows the active file, and keeps it while a diff tab is on screen', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    history.version('a.ts', 'old a');
    history.version('b.ts', 'old b');
    renderTimeline({ 'a.ts': 'a', 'b.ts': 'b' }, { history });
    await opened('a.ts');
    await user.click(timelineToggle());
    expect(await versionsOf('a.ts')).toHaveLength(1);

    await opened('b.ts');
    expect(await versionsOf('b.ts')).toHaveLength(1);

    act(() => {
      openDiff(FOLDER, { path: 'a.ts', source: 'disk' }, { path: 'b.ts', source: 'disk' });
    });
    expect(await versionsOf('b.ts')).toHaveLength(1);
  });
});

describe('comparing and restoring a version — plan 07, S-346', () => {
  it('compares a version with the file as it is in the editor, in a read-only diff tab', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('a.ts', 'the old text');
    renderTimeline({ 'a.ts': 'on disk' }, { history });
    typeInto(await opened('a.ts'), 'typed');
    await user.click(timelineToggle());
    await versionsOf('a.ts');

    await user.click(
      screen.getByRole('button', {
        name: actionOn('fileHistory.action.compareWithCurrent', old.at),
      }),
    );

    const version = await screen.findByRole('textbox', {
      name: t('editor.diff.history', { name: 'a.ts', when: whenOf(old.at, 'en') }),
    });
    expect(version).toHaveValue('the old text');
    expect(version).toHaveAttribute('readonly');
    expect(
      screen.getByRole('textbox', { name: t('editor.diff.buffer', { name: 'a.ts' }) }),
    ).toHaveValue('typed');
  });

  it('compares two versions, the older at the left, once one is picked', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const older = history.version('a.ts', 'first');
    const newer = history.version('a.ts', 'second');
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');
    await user.click(timelineToggle());
    await versionsOf('a.ts');

    const pick = screen.getByRole('button', {
      name: actionOn('fileHistory.action.selectForCompare', newer.at),
    });
    await user.click(pick);
    expect(pick).toHaveAttribute('aria-pressed', 'true');
    await user.click(
      screen.getByRole('button', {
        name: actionOn('fileHistory.action.compareWithSelected', older.at),
      }),
    );

    const left = await screen.findByRole('textbox', {
      name: t('editor.diff.history', { name: 'a.ts', when: whenOf(older.at, 'en') }),
    });
    const right = screen.getByRole('textbox', {
      name: t('editor.diff.history', { name: 'a.ts', when: whenOf(newer.at, 'en') }),
    });
    expect(left).toHaveValue('first');
    expect(right).toHaveValue('second');
    expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(timelineStore(FOLDER).getState().selected).toBeNull();
  });

  it('lets a picked version go when it is pressed again', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const only = history.version('a.ts', 'first');
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');
    await user.click(timelineToggle());
    await versionsOf('a.ts');
    const pick = screen.getByRole('button', {
      name: actionOn('fileHistory.action.selectForCompare', only.at),
    });

    await user.click(pick);
    await user.click(pick);

    expect(pick).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores at once when nothing is unsaved, over the version on screen, and reads it again', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('a.ts', 'the old text');
    const { disk } = renderTimeline({ 'a.ts': 'now' }, { history });
    const editor = await opened('a.ts');
    await user.click(timelineToggle());
    await versionsOf('a.ts');

    await user.click(
      screen.getByRole('button', { name: actionOn('fileHistory.action.restore', old.at) }),
    );

    await waitFor(() => {
      expect(editor).toHaveValue('the old text');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    const [restore] = history.callsOf('POST');
    expect(restore?.route).toBe(`/files/history/${old.id}/restore`);
    expect(restore?.headers['if-match']).toBe(versionOf('now'));
    expect(restore?.body).toEqual({ folder: FOLDER, confirmSensitive: false });
    expect(disk.files.get('a.ts')?.content).toBe('the old text');
    expect(
      await screen.findByText(
        t('fileHistory.restore.done', { path: 'a.ts', when: whenOf(old.at, 'en') }),
      ),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await versionsOf('a.ts')).toHaveLength(2);
    });
    expect((await versionsOf('a.ts'))[0]).toHaveTextContent(t('fileHistory.reason.restore'));
  });

  it('asks first when the buffer has unsaved changes — and keeps them when told to', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('a.ts', 'the old text');
    renderTimeline({ 'a.ts': 'now' }, { history });
    const editor = await opened('a.ts');
    typeInto(editor, 'unsaved work');
    await user.click(timelineToggle());
    await versionsOf('a.ts');
    const restore = screen.getByRole('button', {
      name: actionOn('fileHistory.action.restore', old.at),
    });

    await user.click(restore);
    const dialog = await screen.findByRole('dialog', {
      name: t('fileHistory.restore.title', { path: 'a.ts', when: whenOf(old.at, 'en') }),
    });
    expect(dialog).toHaveTextContent(t('fileHistory.restore.discards', { path: 'a.ts' }));
    const keep = within(dialog).getByRole('button', { name: t('fileHistory.restore.cancel') });
    expect(keep).toHaveFocus();
    await user.click(keep);

    expect(history.callsOf('POST')).toHaveLength(0);
    expect(editor).toHaveValue('unsaved work');

    await user.click(restore);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(history.callsOf('POST')).toHaveLength(0);

    await user.click(restore);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t('fileHistory.restore.confirm'),
      }),
    );
    await waitFor(() => {
      expect(editor).toHaveValue('the old text');
    });
    expect(history.callsOf('POST')).toHaveLength(1);
  });

  it('is refused, and says why, when the file changed since — Claude wrote to it', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('a.ts', 'the old text');
    const { disk } = renderTimeline({ 'a.ts': 'now' }, { history });
    const editor = await opened('a.ts');
    await user.click(timelineToggle());
    await versionsOf('a.ts');
    disk.write('a.ts', 'Claude wrote this');

    await user.click(
      screen.getByRole('button', { name: actionOn('fileHistory.action.restore', old.at) }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('fileHistory.restore.changed', { path: 'a.ts' }));
    expect(alert).toHaveTextContent(t('common.error.traceLabel', { traceId: 'trace-files' }));
    expect(disk.files.get('a.ts')?.content).toBe('Claude wrote this');
    expect(editor).toHaveValue('now');

    await user.click(within(alert).getByRole('button', { name: t('fileHistory.restore.dismiss') }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks the second step for a file that changes what Claude may do, and sends it confirmed', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('.mcp.json', '{}');
    renderTimeline({ '.mcp.json': '{"a":1}' }, { history });
    await opened('.mcp.json');
    await user.click(timelineToggle());
    await versionsOf('.mcp.json');

    await user.click(
      screen.getByRole('button', { name: actionOn('fileHistory.action.restore', old.at) }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(t('fileHistory.restore.sensitive', { path: '.mcp.json' }));
    expect(dialog).toHaveTextContent(t('fileHistory.restore.replaces', { path: '.mcp.json' }));
    await user.click(
      within(dialog).getByRole('button', { name: t('fileHistory.restore.confirm') }),
    );

    await waitFor(() => {
      expect(history.callsOf('POST')).toHaveLength(1);
    });
    expect(history.callsOf('POST')[0]?.body).toMatchObject({ confirmSensitive: true });
  });
});

describe('recently deleted — plan 07, S-349', () => {
  it('lists what no longer exists, reaches its versions, and brings it back where it was', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    history.version('old.ts', 'version one', { reason: 'save' });
    const deleted = history.version('old.ts', 'last text', { reason: 'delete' });
    history.version('a.ts', 'deleted then made again', { reason: 'delete' });
    const { disk } = renderTimeline({ 'a.ts': 'here' }, { history });
    await user.click(timelineToggle());

    await user.click(screen.getByRole('tab', { name: t('fileHistory.timeline.recentlyDeleted') }));
    const list = await screen.findByRole('list', { name: t('fileHistory.deleted.listLabel') });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('old.ts');
    expect(list).toHaveTextContent(
      t('fileHistory.deleted.byAt', {
        who: t('fileHistory.author.self'),
        when: whenOf(deleted.at, 'en'),
      }),
    );

    await user.click(
      within(list).getByRole('button', {
        name: t('fileHistory.action.showVersions', { path: 'old.ts' }),
      }),
    );
    expect(
      await screen.findByText(t('fileHistory.timeline.ofGone', { path: 'old.ts' })),
    ).toBeVisible();
    const rows = await versionsOf('old.ts');
    expect(rows).toHaveLength(2);
    expect(
      screen.queryByRole('button', {
        name: actionOn('fileHistory.action.compareWithCurrent', deleted.at),
      }),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', { name: actionOn('fileHistory.action.restore', deleted.at) }),
    );
    await waitFor(() => {
      expect(disk.files.get('old.ts')?.content).toBe('last text');
    });
    expect(history.callsOf('POST')[0]?.headers['if-match']).toBeUndefined();
  });

  it('restores from the list itself, and says so when the path was taken since', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    history.version('old.ts', 'last text', { reason: 'delete' });
    history.version('gone.ts', 'gone text', { reason: 'delete' });
    const { disk } = renderTimeline({}, { history });
    await user.click(timelineToggle());
    await user.click(screen.getByRole('tab', { name: t('fileHistory.timeline.recentlyDeleted') }));
    await screen.findByRole('list', { name: t('fileHistory.deleted.listLabel') });

    await user.click(
      screen.getByRole('button', {
        name: t('fileHistory.action.restoreDeleted', { path: 'old.ts' }),
      }),
    );
    await waitFor(() => {
      expect(disk.files.get('old.ts')?.content).toBe('last text');
    });

    disk.write('gone.ts', 'somebody made it again');
    await user.click(
      screen.getByRole('button', {
        name: t('fileHistory.action.restoreDeleted', { path: 'gone.ts' }),
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('fileHistory.restore.taken', { path: 'gone.ts' }),
    );
    expect(disk.files.get('gone.ts')?.content).toBe('somebody made it again');
  });

  it('says when nothing was deleted recently', async () => {
    const user = userEvent.setup();
    renderTimeline({});
    await user.click(timelineToggle());

    await user.click(screen.getByRole('tab', { name: t('fileHistory.timeline.recentlyDeleted') }));

    expect(await screen.findByText(t('fileHistory.deleted.emptyTitle'))).toBeVisible();
    expect(screen.getByText(t('fileHistory.deleted.emptyDescription'))).toBeVisible();
  });
});

describe('a Timeline that cannot be read', () => {
  it('says why, and reads it again when asked', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    history.version('a.ts', 'old');
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');
    const list = history as unknown as { route(call: unknown): unknown };
    const real = list.route.bind(history);
    let refuse = true;
    list.route = (call) => {
      if (refuse) {
        refuse = false;
        throw filesRefusal('FILE_ACCESS_DENIED', 'files.error.accessDenied', { path: 'a.ts' });
      }

      return real(call);
    };

    await user.click(timelineToggle());

    expect(await screen.findByText(t('files.error.accessDenied', { path: 'a.ts' }))).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await versionsOf('a.ts')).toHaveLength(1);
    expect(await editorOf('a.ts')).toBeVisible();
  });
});
