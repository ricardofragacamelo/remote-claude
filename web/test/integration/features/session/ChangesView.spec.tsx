import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ChangesView, forgetLiveSessions, registerClaudeChanges } from '@/features/session';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { EditorWorkspace } from '@/features/editor/components/EditorWorkspace';
import { folderTabStore, releaseFolderTabs } from '@/features/workbench/store/folder-tab.store';
import { onNotify } from '@/shared/lib/notify';
import type { Notification } from '@/shared/lib/notify';
import { FOLDER } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { render, translator } from '../../../support/render';
import { aRefusal, aWireError, routeApi, SESSION } from '../../../support/session-tools';

const t = translator('en');
const CHANGES = `/sessions/${SESSION}/changes`;
const fileRoute = (path: string) => `${CHANGES}/file?path=${encodeURIComponent(path)}`;
const APP = `${FOLDER}/src/app.ts`;
const NEW = `${FOLDER}/notes.txt`;

function aChange(path: string, overrides: Record<string, unknown> = {}) {
  return {
    path,
    kind: 'modified',
    promptId: 'p1',
    modifiedOutside: false,
    added: 2,
    removed: 1,
    revision: `r-${path}`,
    ...overrides,
  };
}

const twoChanges = (overrides: Record<string, unknown> = {}) => ({
  promptId: 'p1',
  files: [aChange(NEW, { kind: 'created', added: 1, removed: 0 }), aChange(APP, overrides)],
});

function aChangeFile(overrides: Record<string, unknown> = {}) {
  return {
    path: APP,
    kind: 'modified',
    promptId: 'p1',
    modifiedOutside: false,
    before: { state: 'content', content: 'a\n' },
    now: { state: 'content', content: 'b\n' },
    revision: 'rev-1',
    hunks: [
      {
        id: 'h1',
        oldStart: 1,
        newStart: 1,
        lines: [
          { kind: 'removed', text: 'a' },
          { kind: 'added', text: 'b' },
        ],
      },
    ],
    ...overrides,
  };
}

const view = (): HTMLElement => screen.getByRole('region', { name: t('sessions.changes.title') });
const rows = async (): Promise<HTMLElement[]> =>
  within(await screen.findByRole('list', { name: t('sessions.changes.listLabel') })).getAllByRole(
    'listitem',
  );
const rowOf = async (name: string): Promise<HTMLElement> => {
  const found = (await rows()).find((row) => row.textContent?.includes(name));
  if (found === undefined) throw new Error(`no row for ${name}`);
  return found;
};

let unregister: () => void;

beforeAll(() => {
  unregister = registerClaudeChanges();
});

afterAll(() => {
  unregister();
});

/**
 * "Changes": what a live session changed, file by file, with accept and reject — plan 08, B-28,
 * B-30, B-31. Accept is a mark of this tab; reject goes over the socket, and is undone from a toast.
 */
describe('the changes of a session', () => {
  let live: LiveSocket;
  let told: Notification[];
  let stopNotices: () => void;

  beforeEach(() => {
    forgetLiveSessions();
    live = aLiveSocket();
    told = [];
    stopNotices = onNotify((notification) => told.push(notification));
  });

  afterEach(() => {
    stopNotices();
    live.close();
    vi.restoreAllMocks();
  });

  function show(): void {
    render(
      <>
        <ChangesView folder={FOLDER} sessionId={SESSION} />
        <EditorWorkspace folder={FOLDER} />
      </>,
    );
    live.connect();
    live.receive(hubEvent(SESSION, 'session.statusChanged', 1, { status: 'idle' }));
  }

  const sent = (type: string) => live.sent().filter((frame) => frame['type'] === type);

  it('lists each file with what was done and how much, and opens its diff against before the session — S-122', async () => {
    routeApi({
      [CHANGES]: [twoChanges()],
      [fileRoute(APP)]: [aChangeFile({ before: { state: 'content', content: 'before\n' } })],
    });
    fakeDisk(FOLDER, { 'src/app.ts': 'on disk\n' });
    show();

    const app = await rowOf('src/app.ts');
    expect(app).toHaveTextContent(t('sessions.changes.counts', { added: 2, removed: 1 }));
    expect(within(app).getByText(t('sessions.changeKind.modified'))).toBeInTheDocument();
    expect(await rowOf('notes.txt')).toHaveTextContent(t('sessions.changeKind.created'));
    expect(view()).toHaveTextContent(t('sessions.changes.summary', { pending: 2, count: 2 }));

    await userEvent.click(
      within(app).getByRole('button', {
        name: t('sessions.changes.openDiffOf', {
          path: 'src/app.ts',
          kind: t('sessions.changeKind.modified'),
        }),
      }),
    );

    expect(
      await screen.findByRole('textbox', {
        name: t('sessions.diff.beforeSession', { name: 'app.ts' }),
      }),
    ).toHaveValue('before\n');
    expect(
      screen.getByRole('textbox', { name: t('editor.diff.disk', { name: 'app.ts' }) }),
    ).toHaveValue('on disk\n');
  });

  it('reads the list again when a turn completes and when an undo lands — S-123', async () => {
    const get = routeApi({
      [CHANGES]: [
        { promptId: null, files: [] },
        twoChanges(),
        { promptId: 'p1', files: [aChange(APP)] },
      ],
    });
    show();

    expect(await screen.findByText(t('sessions.changes.emptyTitle'))).toBeVisible();

    live.receive(
      hubEvent(SESSION, 'turn.completed', 2, {
        turnId: 't1',
        costUsd: '0.01',
        durationMs: 5,
        usage: null,
      }),
    );
    expect(await rowOf('notes.txt')).toBeVisible();

    live.receive(
      hubEvent(SESSION, 'session.rewound', 3, {
        promptId: 'p1',
        reverted: [{ path: NEW, action: 'deleted' }],
        preserved: [],
        unchanged: [],
        failed: [],
      }),
    );
    await waitFor(async () => {
      expect(await rows()).toHaveLength(1);
    });
    expect(get.mock.calls.filter(([path]) => path === CHANGES)).toHaveLength(3);
  });

  it('warns that a file changed by hand will be kept as it is if rejected — S-124', async () => {
    routeApi({
      [CHANGES]: [twoChanges({ modifiedOutside: true })],
      [fileRoute(APP)]: [aChangeFile({ modifiedOutside: true })],
    });
    show();

    const app = await rowOf('src/app.ts');
    expect(app).toHaveTextContent(t('sessions.changes.modifiedOutside'));

    // Its hunks show, and none of them can be rejected: only the whole file, which keeps it.
    await userEvent.click(
      within(app).getByRole('button', {
        name: t('sessions.changes.showHunks', { path: 'src/app.ts' }),
      }),
    );
    await within(app).findByRole('group', { name: t('sessions.diff.label', { name: 'app.ts' }) });
    expect(
      within(app).queryByRole('button', { name: t('sessions.changes.rejectHunk') }),
    ).toBeNull();
  });

  it('accepts a file: out of the pending ones, kept across a switch of tab and a reload — S-125', async () => {
    routeApi({ [CHANGES]: [twoChanges()] });
    show();

    await userEvent.click(
      within(await rowOf('src/app.ts')).getByRole('button', { name: t('sessions.changes.accept') }),
    );

    expect(await rows()).toHaveLength(1);
    expect(view()).toHaveTextContent(t('sessions.changes.summary', { pending: 1, count: 2 }));

    // A reload: the tab's state is dropped from memory, and made again from what this browser kept.
    folderTabStore(FOLDER);
    forgetClaudePanel(null);
    releaseFolderTabs();
    folderTabStore(FOLDER);
    expect(claudePanelStore(FOLDER).getState().reviewed[SESSION]).toEqual({ [APP]: `r-${APP}` });
  });

  it('makes an accepted file pending again once it changes', async () => {
    routeApi({ [CHANGES]: [twoChanges()] });
    claudePanelStore(FOLDER)
      .getState()
      .review(SESSION, [{ path: APP, revision: 'an older version' }]);
    show();

    expect(await rows()).toHaveLength(2);
  });

  it('accepts everything at once, and filters the pending, the reviewed and all — S-126', async () => {
    routeApi({ [CHANGES]: [twoChanges()] });
    show();
    await rows();

    await userEvent.click(screen.getByRole('button', { name: t('sessions.changes.acceptAll') }));
    expect(await screen.findByText(t('sessions.changes.filteredTitle'))).toBeVisible();

    await userEvent.click(
      screen.getByRole('radio', { name: t('sessions.changesFilter.reviewed') }),
    );
    expect(await rows()).toHaveLength(2);
    expect((await rowOf('notes.txt')).textContent).toContain(t('sessions.changes.reviewed'));

    await userEvent.click(
      within(await rowOf('notes.txt')).getByRole('button', {
        name: t('sessions.changes.unaccept'),
      }),
    );
    expect(await rows()).toHaveLength(1);

    await userEvent.click(screen.getByRole('radio', { name: t('sessions.changesFilter.all') }));
    expect(await rows()).toHaveLength(2);

    await userEvent.click(screen.getByRole('radio', { name: t('sessions.changesFilter.pending') }));
    expect(await rows()).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('radio', { name: t('sessions.changesFilter.reviewed') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('sessions.changes.unaccept') }));
    await userEvent.click(screen.getByRole('button', { name: t('sessions.changes.showAll') }));
    expect(screen.getByRole('radio', { name: t('sessions.changesFilter.all') })).toBeChecked();
  });

  it('rejects one file, and offers to undo it from a toast — S-132, S-142', async () => {
    routeApi({ [CHANGES]: [twoChanges()] });
    show();

    await userEvent.click(
      within(await rowOf('src/app.ts')).getByRole('button', { name: t('sessions.changes.reject') }),
    );
    expect(sent('session.rewindFiles').at(-1)?.['payload']).toEqual({
      sessionId: SESSION,
      promptId: 'p1',
      paths: [APP],
    });

    live.receive(
      hubEvent(SESSION, 'session.rewound', 2, {
        promptId: 'p1',
        reverted: [{ path: APP, action: 'restored' }],
        preserved: [],
        unchanged: [],
        failed: [],
      }),
    );

    expect(told).toEqual([
      expect.objectContaining({
        messageKey: 'notification.changes.rejectedFile',
        params: { name: 'app.ts' },
      }),
    ]);
    told[0]?.actions?.[0]?.run();
    told[0]?.actions?.[0]?.run();
    expect(sent('session.restoreChange')).toHaveLength(1);
    expect(sent('session.restoreChange')[0]?.['payload']).toEqual({
      sessionId: SESSION,
      path: APP,
    });
  });

  it('rejects one hunk against the revision it was computed on', async () => {
    routeApi({ [CHANGES]: [twoChanges()], [fileRoute(APP)]: [aChangeFile()] });
    show();

    const app = await rowOf('src/app.ts');
    await userEvent.click(
      within(app).getByRole('button', {
        name: t('sessions.changes.showHunks', { path: 'src/app.ts' }),
      }),
    );
    await userEvent.click(
      await within(app).findByRole('button', { name: t('sessions.changes.rejectHunk') }),
    );

    expect(sent('session.rejectChange').at(-1)?.['payload']).toEqual({
      sessionId: SESSION,
      path: APP,
      hunkId: 'h1',
      revision: 'rev-1',
    });

    live.receive(
      hubEvent(SESSION, 'session.rewound', 2, {
        promptId: 'p1',
        reverted: [{ path: APP, action: 'restored' }],
        preserved: [],
        unchanged: [],
        failed: [],
        hunkId: 'h1',
      }),
    );
    expect(told[0]).toMatchObject({ messageKey: 'notification.changes.rejectedHunk' });
  });

  it('says why a rejection was refused — S-139', async () => {
    routeApi({ [CHANGES]: [twoChanges()], [fileRoute(APP)]: [aChangeFile()] });
    show();

    const app = await rowOf('src/app.ts');
    await userEvent.click(
      within(app).getByRole('button', {
        name: t('sessions.changes.showHunks', { path: 'src/app.ts' }),
      }),
    );
    await userEvent.click(
      await within(app).findByRole('button', { name: t('sessions.changes.rejectHunk') }),
    );
    const command = sent('session.rejectChange').at(-1);
    live.receive(
      aRefusal(String(command?.['id']), 'SESSION_CHANGE_STALE', 'session.error.changeStale', {
        path: APP,
      }),
    );

    expect(await screen.findByText(t('session.error.changeStale', { path: APP }))).toBeVisible();
    expect(told).toEqual([]);
  });

  it('rejects everything only after asking, and lists what goes back', async () => {
    routeApi({ [CHANGES]: [twoChanges()] });
    show();
    await rows();

    await userEvent.click(screen.getByRole('button', { name: t('sessions.changes.rejectAll') }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('list', { name: t('sessions.changes.listLabel') }),
    ).toHaveTextContent('src/app.ts');

    await userEvent.click(within(dialog).getByRole('button', { name: t('sessions.changes.keep') }));
    expect(sent('session.rewindFiles')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: t('sessions.changes.rejectAll') }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t('sessions.changes.rejectAllConfirm'),
      }),
    );
    expect(sent('session.rewindFiles').at(-1)?.['payload']).toEqual({
      sessionId: SESSION,
      promptId: 'p1',
    });

    live.receive(
      hubEvent(SESSION, 'session.rewound', 2, {
        promptId: 'p1',
        reverted: [{ path: APP, action: 'restored' }],
        preserved: [],
        unchanged: [],
        failed: [],
      }),
    );
    expect(told).toEqual([]);
  });

  it('lets go of the rejection of everything with Esc, sending nothing', async () => {
    routeApi({ [CHANGES]: [twoChanges()] });
    show();
    await rows();

    await userEvent.click(screen.getByRole('button', { name: t('sessions.changes.rejectAll') }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent('session.rewindFiles')).toHaveLength(0);
  });

  it('opens the diff from its own button too, and names a file outside the folder in full', async () => {
    const OUTSIDE = '/srv/elsewhere/config.json';
    routeApi({
      [CHANGES]: [{ promptId: 'p1', files: [aChange(APP), aChange(OUTSIDE)] }],
      [fileRoute(APP)]: [aChangeFile({ before: { state: 'content', content: 'before\n' } })],
    });
    fakeDisk(FOLDER, { 'src/app.ts': 'on disk\n' });
    show();

    expect(await rowOf(OUTSIDE)).toBeVisible();
    await userEvent.click(
      within(await rowOf('src/app.ts')).getByRole('button', {
        name: t('sessions.changes.openDiff'),
      }),
    );

    expect(
      await screen.findByRole('textbox', {
        name: t('sessions.diff.beforeSession', { name: 'app.ts' }),
      }),
    ).toHaveValue('before\n');
  });

  it('says the list could not be read, and tries again', async () => {
    routeApi({
      [CHANGES]: [
        aWireError('CLAUDE_UNAVAILABLE', 'session.error.claudeUnavailable'),
        twoChanges(),
      ],
    });
    show();

    expect(await screen.findByText(t('session.error.claudeUnavailable'))).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await rows()).toHaveLength(2);
  });

  it('says a file of the list could not be read, and tries again', async () => {
    routeApi({
      [CHANGES]: [twoChanges()],
      [fileRoute(APP)]: [
        aWireError('FILE_NOT_TEXT', 'files.error.notText'),
        aChangeFile({ hunks: [] }),
      ],
    });
    show();

    const app = await rowOf('src/app.ts');
    await userEvent.click(
      within(app).getByRole('button', {
        name: t('sessions.changes.showHunks', { path: 'src/app.ts' }),
      }),
    );
    expect(await within(app).findByText(t('files.error.notText'))).toBeVisible();

    await userEvent.click(within(app).getByRole('button', { name: t('common.action.retry') }));
    expect(await within(app).findByText(t('sessions.changes.noHunks'))).toBeVisible();
    await userEvent.click(
      within(app).getByRole('button', {
        name: t('sessions.changes.hideHunks', { path: 'src/app.ts' }),
      }),
    );
  });

  it('has no accessibility violation', async () => {
    routeApi({ [CHANGES]: [twoChanges()] });
    show();
    await rows();

    expect(await axe(view())).toHaveNoViolations();
  });
});
