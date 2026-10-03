import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { registerSessionsView } from '@/features/session';
import { aConversationDto, aHistoryPage, said } from '../../support/history';
import { aLiveSocket } from '../../support/live-socket';
import type { LiveSocket } from '../../support/live-socket';
import { translator } from '../../support/render';
import { openWorkbench } from '../../support/workbench';
import { aTab, aTabServer, projects } from '../../support/workspace-api';

const t = translator('en');
const A = `${projects.path}/a`;
const LIVE = '01J0LIVE0000000000000000AA';
const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';

let live: LiveSocket;
let unregister: () => void;

beforeAll(() => {
  unregister = registerSessionsView();
});

afterAll(() => {
  unregister();
});

afterEach(() => {
  live.close();
  vi.restoreAllMocks();
});

/** The sessions and the history of A, as the backend answers them. */
function answers(path: string): unknown {
  if (path.startsWith('/sessions?')) {
    return {
      sessions: [
        {
          sessionId: LIVE,
          claudeSessionId: CONVERSATION,
          resumedFrom: null,
          workspacePath: A,
          status: 'idle',
          model: 'claude-sonnet-5',
          permissionMode: 'default',
          startedAt: new Date().toISOString(),
          openedFrom: 'web',
          pendingPermissions: 0,
        },
      ],
    };
  }
  if (path.startsWith('/transcripts?')) {
    return {
      sessions: [
        aConversationDto({
          summary: 'Linked talk',
          cwd: A,
          activity: 'liveHere',
          liveSessionId: LIVE,
        }),
      ],
      nextCursor: null,
    };
  }
  if (path.startsWith(`/transcripts/${CONVERSATION}/messages`)) {
    return aHistoryPage([said('m1', 'What was said')], {
      session: aConversationDto({ summary: 'Linked talk', cwd: A }),
    });
  }
  return undefined;
}

function claude(): Promise<HTMLElement> {
  return screen.findByRole('complementary', { name: t('workbench.claude.label') });
}

function open(search: { session?: string; conversation?: string } = {}) {
  live = aLiveSocket();
  const mounted = openWorkbench(A, aTabServer([aTab(A)]), { other: answers }, search);
  live.connect();
  return mounted;
}

/** The link of a session and of a conversation, in the workbench — plan 08, B-12 and D-24. */
describe('the link of a session and of a conversation', () => {
  it('lists the history of the folder in the Sessions view of its tab — S-52', async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole('button', { name: t('workbench.sessions.label') }));

    expect(await screen.findByText('Linked talk')).toBeInTheDocument();
  });

  it('opens the panel of the folder on the session a link names, and keeps it in the address — S-53', async () => {
    const mounted = open({ session: LIVE });

    expect(
      await within(await claude()).findByRole('region', {
        name: t('session.screen.sessionLabel', { sessionId: LIVE }),
      }),
    ).toBeInTheDocument();
    expect(mounted.search()).toMatchObject({ folder: A, session: LIVE });
  });

  it('says a linked session is gone, and leads back — S-53', async () => {
    const user = userEvent.setup();
    const mounted = open({ session: '01J0GONE00000000000000000Z' });

    expect(
      await within(await claude()).findByText(t('session.error.notFound')),
    ).toBeInTheDocument();
    await user.click(
      within(await claude()).getByRole('button', { name: t('workbench.claude.backToStart') }),
    );

    expect(
      await within(await claude()).findByRole('group', { name: t('sessions.draft.choices') }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mounted.search()['session']).toBeUndefined();
    });
  });

  it('opens a conversation a link names, read only, in the panel of its folder — S-54', async () => {
    const user = userEvent.setup();
    const mounted = open({ conversation: CONVERSATION });

    expect(await within(await claude()).findByText('What was said')).toBeInTheDocument();
    expect(
      within(await claude()).getByRole('button', { name: t('history.screen.resume') }),
    ).toBeInTheDocument();
    expect(mounted.search()).toMatchObject({ conversation: CONVERSATION });

    await user.click(
      within(await claude()).getByRole('button', { name: t('history.screen.close') }),
    );
    await waitFor(() => {
      expect(mounted.search()['conversation']).toBeUndefined();
    });
  });

  it('goes on as a session in the same panel when the conversation is resumed — plan 08, B-32', async () => {
    const user = userEvent.setup();
    const RESUMED = '01J0RESUMEDRESUMEDRESUMED0';
    const mounted = open({ conversation: CONVERSATION });

    await user.click(
      await within(await claude()).findByRole('button', { name: t('history.screen.resume') }),
    );
    live.receive({
      v: 1,
      id: 'started-resumed',
      kind: 'event',
      type: 'session.started',
      ts: '2026-09-30T12:00:00.000Z',
      seq: 1,
      sessionId: RESUMED,
      correlationId: live.lastSent('session.start')?.['id'],
      payload: { sessionId: RESUMED, resumedFrom: CONVERSATION, workspacePath: A },
    });

    expect(
      await within(await claude()).findByRole('region', {
        name: t('session.screen.sessionLabel', { sessionId: RESUMED }),
      }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ session: RESUMED });
    });
    expect(mounted.search()['conversation']).toBeUndefined();
  });

  it('puts what the panel shows into the address, so the link reproduces the screen', async () => {
    const user = userEvent.setup();
    const mounted = open();

    await user.click(await screen.findByRole('button', { name: t('workbench.sessions.label') }));
    await user.click(
      await screen.findByRole('button', {
        name: t('sessions.row.openSession', { title: 'Linked talk' }),
      }),
    );

    await waitFor(() => {
      expect(mounted.search()).toMatchObject({ folder: A, session: LIVE });
    });
  });
});
