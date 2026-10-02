import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { commandRegistry } from '@/features/commands';
import { SessionsView } from '@/features/session/components/sessions/SessionsView';
import { RESUME_TIMEOUT_MS } from '@/features/session/hooks/useResumeSession';
import { sessionsViewStore } from '@/features/session/store/sessions-view.store';
import { folderTabStore } from '@/features/workbench/store/folder-tab.store';
import { api } from '@/shared/api/api';
import {
  aConversationDto,
  claudeUnavailable,
  EDITOR,
  OURS,
  WORKSPACE,
} from '../../../support/history';
import { aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { render, translator } from '../../../support/render';
import { aRefusal, routeApi } from '../../../support/session-tools';

const t = translator('en');
const LIVE = '01J0LIVE0000000000000000AA';
const LIVE_PATH = `/sessions?workspacePath=${encodeURIComponent(WORKSPACE)}`;
const HISTORY_PATH = `/transcripts?workspacePath=${encodeURIComponent(WORKSPACE)}`;
const ACTIVE = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';

/** A live session as `GET /sessions` describes it. */
function aLiveDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: LIVE,
    claudeSessionId: OURS,
    resumedFrom: null,
    workspacePath: WORKSPACE,
    status: 'idle',
    model: 'claude-sonnet-5',
    permissionMode: 'default',
    startedAt: new Date(Date.now() - 120_000).toISOString(),
    openedFrom: 'mobile',
    pendingPermissions: 1,
    ...overrides,
  };
}

/** The folder as a person sees it: one live session, one conversation active elsewhere, two idle. */
function aFolder(): Record<string, readonly unknown[]> {
  return {
    [LIVE_PATH]: [{ sessions: [aLiveDto()] }],
    [HISTORY_PATH]: [
      {
        sessions: [
          aConversationDto({ summary: 'Live one', activity: 'liveHere', liveSessionId: LIVE }),
          aConversationDto({
            sessionId: ACTIVE,
            summary: 'Being written in the editor',
            origin: 'external',
            activity: 'activeElsewhere',
            writtenAgoSeconds: 30,
          }),
          aConversationDto({
            sessionId: EDITOR,
            summary: 'Old editor talk',
            origin: 'external',
            activity: 'idle',
            gitBranch: 'main',
          }),
          aConversationDto({
            sessionId: '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b',
            summary: 'Our old talk',
            activity: 'idle',
            cwd: `${WORKSPACE}/backend`,
          }),
        ],
        nextCursor: null,
      },
    ],
  };
}

/** One group of the view, by its title. */
function group(key: 'running' | 'elsewhere' | 'history'): HTMLElement {
  return screen.getByRole('region', { name: new RegExp(t(`sessionsGroup.${key}.title`)) });
}

function mount(folder = WORKSPACE) {
  return render(<SessionsView folder={folder} />);
}

let live: LiveSocket;

beforeEach(() => {
  live = aLiveSocket();
  live.connect();
});

afterEach(() => {
  live.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the view of Claude’s sessions of a folder — plan 08, B-09', () => {
  it('shows the three groups, each row with what it is — S-33', async () => {
    routeApi(aFolder());
    mount();

    const running = await within(group('running')).findByRole('button', {
      name: t('sessions.row.openSession', { title: 'Live one' }),
    });
    expect(running).toHaveTextContent(t('sessions.openedFrom.mobile'));
    expect(running).toHaveTextContent(t('sessions.row.pending', { count: 1 }));
    expect(within(group('elsewhere')).getByText('Being written in the editor')).toBeInTheDocument();
    expect(
      within(group('elsewhere')).getByText(t('sessions.row.writtenAgo', { when: '30 sec. ago' })),
    ).toBeInTheDocument();
    expect(within(group('history')).getByText('Old editor talk')).toBeInTheDocument();
    expect(within(group('history')).getByText('backend')).toBeInTheDocument();
    // A conversation live here is the row of "Running here", never a second row of the history.
    expect(within(group('history')).queryByText('Live one')).toBeNull();
  });

  it('shows the loading state of each group while its list is on its way — S-34', () => {
    vi.spyOn(api, 'get').mockReturnValue(new Promise(() => undefined));
    mount();

    expect(screen.getByLabelText(t('sessionsGroup.running.loading'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('sessionsGroup.history.loading'))).toBeInTheDocument();
  });

  it('teaches the next step when the folder has nothing — S-34', async () => {
    routeApi({
      [LIVE_PATH]: [{ sessions: [] }],
      [HISTORY_PATH]: [{ sessions: [], nextCursor: null }],
    });
    mount();

    expect(await screen.findByText(t('sessionsGroup.running.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('sessionsGroup.elsewhere.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByText(t('sessionsGroup.history.emptyTitle'))).toBeInTheDocument();
  });

  it('keeps what runs here on screen when the history fails, with a way to try again — S-35', async () => {
    const get = routeApi({
      [LIVE_PATH]: [{ sessions: [aLiveDto()] }],
      [HISTORY_PATH]: [claudeUnavailable, { sessions: [aConversationDto()], nextCursor: null }],
    });
    mount();

    expect(
      await within(group('running')).findByRole('button', {
        name: t('sessions.row.openSession', { title: t('sessions.row.untitledSession') }),
      }),
    ).toBeInTheDocument();
    const failure = await within(group('history')).findByText(
      t('transcript.error.claudeUnavailable'),
    );
    expect(failure).toBeInTheDocument();

    await userEvent.click(
      within(group('history')).getByRole('button', { name: t('common.action.retry') }),
    );
    expect(await within(group('history')).findByText('Fix the flaky test')).toBeInTheDocument();
    expect(get.mock.calls.filter(([path]) => path === HISTORY_PATH).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('shows the history when what runs here cannot be listed — S-35', async () => {
    routeApi({
      [LIVE_PATH]: [
        {
          code: 'WORKSPACE_NOT_FOUND',
          messageKey: 'workspace.error.notFound',
          params: {},
          traceId: 't',
        },
      ],
      [HISTORY_PATH]: [{ sessions: [aConversationDto()], nextCursor: null }],
    });
    mount();

    expect(await within(group('history')).findByText('Fix the flaky test')).toBeInTheDocument();
    expect(within(group('running')).getByRole('alert')).toBeInTheDocument();
  });

  it('narrows by the search and the origin, orders by name, and offers to clear — S-36', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    await within(group('history')).findByText('Old editor talk');

    await user.selectOptions(screen.getByLabelText(t('sessions.view.origin')), 'ours');
    expect(within(group('history')).queryByText('Old editor talk')).toBeNull();
    expect(within(group('history')).getByText('Our old talk')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(t('sessions.view.origin')), 'all');
    await user.selectOptions(screen.getByLabelText(t('sessions.view.sort')), 'name');
    const titles = within(group('history'))
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(titles[0]).toContain('Old editor talk');

    await user.type(screen.getByLabelText(t('sessions.view.search')), 'nothing like this');
    expect(within(group('history')).getByText(t('sessions.filtered.title'))).toBeInTheDocument();
    await user.click(
      within(group('history')).getByRole('button', { name: t('sessions.filtered.clear') }),
    );
    expect(within(group('history')).getByText('Old editor talk')).toBeInTheDocument();
  });

  it('loads the next page, and keeps what is on screen when that fails — S-37', async () => {
    const user = userEvent.setup();
    routeApi({
      [LIVE_PATH]: [{ sessions: [] }],
      [HISTORY_PATH]: [{ sessions: [aConversationDto({ summary: 'Page one' })], nextCursor: 'c2' }],
      [`${HISTORY_PATH}&cursor=c2`]: [
        claudeUnavailable,
        {
          sessions: [aConversationDto({ sessionId: EDITOR, summary: 'Page two' })],
          nextCursor: null,
        },
      ],
    });
    mount();

    const more = await screen.findByRole('button', { name: t('sessionsGroup.history.loadMore') });
    await user.click(more);
    expect(await screen.findByText(t('transcript.error.claudeUnavailable'))).toBeInTheDocument();
    expect(screen.getByText('Page one')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('sessionsGroup.history.loadMore') }));
    expect(await screen.findByText('Page two')).toBeInTheDocument();
  });

  it('is the tab’s: another folder has a view of its own — S-38', async () => {
    const user = userEvent.setup();
    const other = '/srv/projects/other';
    routeApi({
      ...aFolder(),
      [`/sessions?workspacePath=${encodeURIComponent(other)}`]: [{ sessions: [] }],
      [`/transcripts?workspacePath=${encodeURIComponent(other)}`]: [
        {
          sessions: [aConversationDto({ summary: 'Elsewhere talk', cwd: other })],
          nextCursor: null,
        },
      ],
    });
    const view = mount();
    await user.type(await screen.findByLabelText(t('sessions.view.search')), 'old');

    view.rerender(<SessionsView folder={other} />);

    expect(await screen.findByText('Elsewhere talk')).toBeInTheDocument();
    expect(screen.getByLabelText(t('sessions.view.search'))).toHaveValue('');
  });
});

describe('joining a session of the folder — plan 08, B-10', () => {
  it('puts a live session in the panel of the tab, attached from the start — S-39', async () => {
    routeApi(aFolder());
    mount();

    await userEvent.click(
      await screen.findByRole('button', {
        name: t('sessions.row.openSession', { title: 'Live one' }),
      }),
    );

    expect(folderTabStore(WORKSPACE).getState().sessionId).toBe(LIVE);
  });

  it('opens a conversation of the history in the panel, to read — B-10', async () => {
    routeApi(aFolder());
    mount();

    await userEvent.click(
      await screen.findByRole('button', {
        name: t('sessions.row.openConversation', { title: 'Old editor talk' }),
      }),
    );

    expect(folderTabStore(WORKSPACE).getState().conversationId).toBe(EDITOR);
  });

  it('continues one of ours in place, from the actions of its row — S-40', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const row = (await screen.findByText('Our old talk')).closest('li') as HTMLElement;

    await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.action.continue') }));

    expect(live.lastSent('session.start')?.['payload']).toEqual({
      workspacePath: `${WORKSPACE}/backend`,
      resumeSessionId: '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b',
    });
  });

  it('offers a conversation begun elsewhere as a copy, and the session it becomes goes to the panel — S-41', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const row = (await screen.findByText('Old editor talk')).closest('li') as HTMLElement;

    fireEvent.contextMenu(within(row).getByRole('button', { name: /Old editor talk/ }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.action.fork') }));

    expect(live.lastSent('session.start')?.['payload']).toMatchObject({ resumeSessionId: EDITOR });
    live.receive(
      hubEvent('01J0FORK00000000000000000A', 'session.started', 1, {
        sessionId: '01J0FORK00000000000000000A',
        claudeSessionId: 'new-id',
        resumedFrom: EDITOR,
      }),
    );
    await waitFor(() => {
      expect(folderTabStore(WORKSPACE).getState().sessionId).toBe('01J0FORK00000000000000000A');
    });
  });

  it('asks before forking one that is being written now, and sends nothing when told no — S-42', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const row = (await screen.findByText('Being written in the editor')).closest(
      'li',
    ) as HTMLElement;

    await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.action.fork') }));
    const dialog = await screen.findByRole('dialog', { name: t('sessions.fork.title') });
    await user.click(within(dialog).getByRole('button', { name: t('sessions.fork.cancel') }));
    expect(live.lastSent('session.start')).toBeUndefined();

    await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.action.fork') }));
    await user.click(await screen.findByRole('button', { name: t('sessions.fork.confirm') }));
    expect(live.lastSent('session.start')?.['payload']).toMatchObject({ resumeSessionId: ACTIVE });
  });

  it('says the ceiling is the installation’s when a continue is refused for it — S-43', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const row = (await screen.findByText('Our old talk')).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.action.continue') }));

    live.receive(
      aRefusal(
        String(live.lastSent('session.start')?.['id']),
        'SESSION_LIMIT_REACHED',
        'session.error.limitReached',
        {
          limit: 10,
          retryAfterSeconds: 30,
        },
      ),
    );

    expect(
      await within(row).findByText(t('session.error.limitReached', { limit: 10 })),
    ).toBeInTheDocument();
    expect(within(row).getByText(t('sessions.limit.note', { seconds: 30 }))).toBeInTheDocument();
  });

  it('refuses a conversation whose folder left the allowlist, translated on its row — S-44', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const row = (await screen.findByText('Our old talk')).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.action.continue') }));

    live.receive(
      aRefusal(
        String(live.lastSent('session.start')?.['id']),
        'WORKSPACE_NOT_ALLOWED',
        'session.error.workspaceNotAllowed',
      ),
    );

    expect(await within(row).findByRole('alert')).toBeInTheDocument();
  });

  it('sends one resume for two presses in a row — S-45', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const row = (await screen.findByText('Our old talk')).closest('li') as HTMLElement;

    for (let press = 0; press < 2; press += 1) {
      await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
      await user.click(
        await screen.findByRole('menuitem', { name: t('sessions.action.continue') }),
      );
    }

    expect(live.sent().filter((frame) => frame['type'] === 'session.start')).toHaveLength(1);
  });

  it('offers every action of a row in the palette too, on the row selected — S-47', async () => {
    routeApi(aFolder());
    mount();
    const row = await screen.findByRole('button', {
      name: t('sessions.row.openConversation', { title: 'Old editor talk' }),
    });

    expect(commandRegistry.command('sessions.openSelected')?.when?.()).toBe(false);
    act(() => {
      row.focus();
    });

    for (const id of [
      'sessions.openSelected',
      'sessions.continueSelected',
      'sessions.copySelectedId',
    ]) {
      expect(commandRegistry.command(id)?.when?.(), id).toBe(true);
    }
    expect(commandRegistry.command('sessions.endSelected')?.when?.()).toBe(false);
    act(() => {
      void commandRegistry.command('sessions.openSelected')?.run();
    });
    expect(folderTabStore(WORKSPACE).getState().conversationId).toBe(EDITOR);
  });

  it('ends a live session of the caller from its row', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const row = (await screen.findByText('Live one')).closest('li') as HTMLElement;

    await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
    await user.click(await screen.findByRole('menuitem', { name: t('sessions.action.end') }));

    expect(live.lastSent('session.close')?.['payload']).toEqual({ sessionId: LIVE });
  });
});

describe('every action of the view — plan 08, B-12', () => {
  async function actionOf(title: string, action: string): Promise<void> {
    const user = userEvent.setup();
    const row = (await screen.findByText(title)).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: t('sessions.row.actions') }));
    await user.click(await screen.findByRole('menuitem', { name: t(action) }));
  }

  it('opens and copies a live session from its row, and says where below it runs', async () => {
    routeApi({
      ...aFolder(),
      [LIVE_PATH]: [
        {
          sessions: [
            aLiveDto({
              workspacePath: `${WORKSPACE}/api`,
              openedFrom: 'web',
              pendingPermissions: 0,
            }),
          ],
        },
      ],
    });
    mount();

    const row = (await screen.findByText('Live one')).closest('li') as HTMLElement;
    expect(within(row).getByText('api')).toBeInTheDocument();
    expect(within(row).getByText(t('sessions.openedFrom.web'))).toBeInTheDocument();

    await actionOf('Live one', 'sessions.action.copyId');
    expect(await navigator.clipboard.readText()).toBe(OURS);

    await actionOf('Live one', 'sessions.action.open');
    expect(folderTabStore(WORKSPACE).getState().sessionId).toBe(LIVE);
  });

  it('reads and copies a conversation from its row', async () => {
    routeApi(aFolder());
    mount();

    await actionOf('Old editor talk', 'sessions.action.copyId');
    expect(await navigator.clipboard.readText()).toBe(EDITOR);

    await actionOf('Old editor talk', 'sessions.action.read');
    expect(folderTabStore(WORKSPACE).getState().conversationId).toBe(EDITOR);
  });

  it('names a conversation with no title, and a live session with none', async () => {
    routeApi({
      [LIVE_PATH]: [{ sessions: [aLiveDto({ claudeSessionId: 'no-title' })] }],
      [HISTORY_PATH]: [
        { sessions: [aConversationDto({ summary: '', activity: 'idle' })], nextCursor: null },
      ],
    });
    mount();

    expect(await screen.findByText(t('transcript.list.untitled'))).toBeInTheDocument();
    expect(screen.getByText(t('sessions.row.untitledSession'))).toBeInTheDocument();
  });

  it('tries the continue again from the refusal on its row, and says the ceiling with no wait given', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    await actionOf('Our old talk', 'sessions.action.continue');
    const row = (await screen.findByText('Our old talk')).closest('li') as HTMLElement;
    const first = String(live.lastSent('session.start')?.['id']);

    live.receive(
      aRefusal(first, 'SESSION_LIMIT_REACHED', 'session.error.limitReached', { limit: 10 }),
    );
    expect(
      await within(row).findByText(t('sessions.limit.note', { seconds: 30 })),
    ).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: t('common.action.retry') }));
    expect(String(live.lastSent('session.start')?.['id'])).not.toBe(first);
  });

  it('says on its row when a continue had no answer in time, with a way to try again — S-46', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    routeApi(aFolder());
    mount();
    await actionOf('Our old talk', 'sessions.action.continue');
    const row = (await screen.findByText('Our old talk')).closest('li') as HTMLElement;

    act(() => {
      vi.advanceTimersByTime(RESUME_TIMEOUT_MS);
    });

    expect(await within(row).findByText(t('session.error.resumeTimeout'))).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: t('common.action.retry') })).toBeInTheDocument();
  });

  it('folds a group and unfolds it again', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    const toggle = await screen.findByRole('button', {
      name: new RegExp(t('sessionsGroup.history.title')),
    });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Our old talk')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Our old talk')).toBeInTheDocument();
  });

  it('keeps where the list was scrolled to', async () => {
    routeApi(aFolder());
    const { container } = mount();
    await screen.findByText('Our old talk');
    const list = container.querySelector('.overflow-y-auto') as HTMLElement;

    list.scrollTop = 240;
    fireEvent.scroll(list);

    await waitFor(() => {
      expect(sessionsViewStore(WORKSPACE).getState().scrollTop).toBe(240);
    });
  });

  it('closes the question of the fork on Escape, sending nothing', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();
    await actionOf('Being written in the editor', 'sessions.action.fork');
    await screen.findByRole('dialog', { name: t('sessions.fork.title') });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(live.lastSent('session.start')).toBeUndefined();
  });

  it('runs the commands of the view and of the row selected from the palette — S-47', async () => {
    const get = routeApi(aFolder());
    mount();
    const live_row = await screen.findByRole('button', {
      name: t('sessions.row.openSession', { title: 'Live one' }),
    });
    const run = (id: string): void => {
      act(() => {
        void commandRegistry.command(id)?.run();
      });
    };

    const before = get.mock.calls.length;
    run('sessions.refresh');
    await waitFor(() => {
      expect(get.mock.calls.length).toBeGreaterThan(before);
    });

    run('sessions.toggleSubfolders');
    expect(sessionsViewStore(WORKSPACE).getState().includeSubfolders).toBe(true);
    run('sessions.toggleSubfolders');
    expect(sessionsViewStore(WORKSPACE).getState().includeSubfolders).toBe(false);
    run('sessions.help');
    expect(sessionsViewStore(WORKSPACE).getState().helpOpen).toBe(true);
    act(() => {
      sessionsViewStore(WORKSPACE).getState().setHelpOpen(false);
    });

    act(() => {
      live_row.focus();
    });
    expect(commandRegistry.command('sessions.continueSelected')?.when?.()).toBe(false);
    expect(commandRegistry.command('sessions.endSelected')?.when?.()).toBe(true);
    run('sessions.copySelectedId');
    expect(await navigator.clipboard.readText()).toBe(OURS);
    run('sessions.endSelected');
    expect(live.lastSent('session.close')?.['payload']).toEqual({ sessionId: LIVE });
    run('sessions.continueSelected');
    expect(live.lastSent('session.start')).toBeUndefined();
    run('sessions.openSelected');
    expect(folderTabStore(WORKSPACE).getState().sessionId).toBe(LIVE);

    act(() => {
      screen
        .getByRole('button', {
          name: t('sessions.row.openConversation', { title: 'Our old talk' }),
        })
        .focus();
    });
    run('sessions.copySelectedId');
    expect(await navigator.clipboard.readText()).toBe('2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b');
    run('sessions.endSelected');
    run('sessions.continueSelected');
    expect(live.lastSent('session.start')?.['payload']).toMatchObject({
      resumeSessionId: '2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b',
    });
  });
});

describe('the lists follow the world — plan 08, B-11', () => {
  it('asks again on its own while the view is on screen, and stops once it is not — S-48', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const get = routeApi(aFolder());
    const view = mount();
    await screen.findByText('Old editor talk');
    const before = get.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(get.mock.calls.length).toBeGreaterThan(before);

    view.unmount();
    const after = get.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(get.mock.calls.length).toBe(after);
  });

  it('asks again at once when a session it hears of begins or ends — S-49', async () => {
    const get = routeApi(aFolder());
    mount();
    await screen.findByText('Old editor talk');
    const before = get.mock.calls.length;

    live.receive(
      hubEvent('01J0SOMEONE000000000000000', 'session.closed', 9, {
        sessionId: 'x',
        reason: 'completed',
      }),
    );

    await waitFor(() => {
      expect(get.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('reads the lists afresh once when the view comes back — S-51', async () => {
    const get = routeApi(aFolder());
    const view = mount();
    await screen.findByText('Old editor talk');
    view.unmount();
    const before = get.mock.calls.filter(([path]) => path === LIVE_PATH).length;

    mount();
    await screen.findByText('Old editor talk');

    await waitFor(() => {
      expect(get.mock.calls.filter(([path]) => path === LIVE_PATH).length).toBe(before + 1);
    });
  });
});

describe('help and accessibility — plan 08, B-13', () => {
  it('explains the groups, the origin, the fork, the estimate and the ceiling — S-55', async () => {
    const user = userEvent.setup();
    routeApi(aFolder());
    mount();

    await user.click(await screen.findByRole('button', { name: t('sessions.view.help') }));
    const help = await screen.findByRole('dialog');

    for (const key of ['what', 'groups', 'origin', 'fork', 'elsewhere', 'limit']) {
      expect(within(help).getByText(t(`sessions.help.${key}`)), key).toBeInTheDocument();
    }
  });

  it('names every control, and has no violation — S-56', async () => {
    routeApi(aFolder());
    const { container } = mount();
    await screen.findByText('Old editor talk');

    for (const label of [
      'sessions.view.refresh',
      'sessions.view.help',
      'sessions.view.subfoldersOff',
    ]) {
      expect(screen.getByRole('button', { name: t(label) })).toBeInTheDocument();
    }
    expect(await axe(container)).toHaveNoViolations();
  });

  it('includes the folders below on a press of its button, and says which it shows', async () => {
    const user = userEvent.setup();
    const get = routeApi({
      ...aFolder(),
      [`${HISTORY_PATH}&includeSubfolders=true`]: [{ sessions: [], nextCursor: null }],
    });
    mount();

    await user.click(await screen.findByRole('button', { name: t('sessions.view.subfoldersOff') }));

    expect(screen.getByRole('button', { name: t('sessions.view.subfoldersOn') })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(`${HISTORY_PATH}&includeSubfolders=true`);
    });
  });
});
