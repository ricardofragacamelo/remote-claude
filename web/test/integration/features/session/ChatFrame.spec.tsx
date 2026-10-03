import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { forgetLiveSessions, SessionScreen } from '@/features/session';
import { DraftView } from '@/features/session/components/panel/DraftView';
import { MAX_BOX_HEIGHT } from '@/features/session/components/composer/ChatComposer';
import { claudePanelStore, forgetClaudePanel } from '@/features/session/store/claude-panel.store';
import { forgetFolderTabs } from '@/features/workbench';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';
import { aHistoryPage, claudeUnavailable } from '../../../support/history';
import { ack, aLiveSocket, hubEvent } from '../../../support/live-socket';
import type { LiveSocket } from '../../../support/live-socket';
import { aRefusal } from '../../../support/session-tools';

const t = translator('en');
const FOLDER = '/srv/projects/app';
const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';
const RESUMED = '01J0RESUMEDRESUMEDRESUMED0';
const CONVERSATION = '6b41b192-a41b-46c2-b8d7-5098d8c825be';
const AT = '2026-09-19T12:00:00.000Z';
const CHANGES = 'What changed.';

/** The observers of sizes the frame made — jsdom lays nothing out; the test says what grew. */
const observed = vi.hoisted(() => new Set<() => void>());

class ObservedSizes {
  constructor(private readonly changed: () => void) {}
  observe(): void {
    observed.add(this.changed);
  }
  disconnect(): void {
    observed.delete(this.changed);
  }
}

function grew(): void {
  for (const changed of [...observed]) changed();
}

let live: LiveSocket;

beforeEach(() => {
  observed.clear();
  vi.stubGlobal('ResizeObserver', ObservedSizes);
  forgetLiveSessions();
  live = aLiveSocket();
  // Nothing of this suite reads over HTTP but the history; anything else answers empty.
  vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage([]));
});

afterEach(() => {
  live.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetClaudePanel(null);
  forgetFolderTabs();
});

/** The frame of the session on screen, by the name it is given: the session's id. */
function frame(sessionId = SESSION): HTMLElement {
  return screen.getByRole('region', { name: t('session.screen.sessionLabel', { sessionId }) });
}

/** The one element of the frame that scrolls — the middle of three. */
function scrollerOf(region: HTMLElement): HTMLElement {
  const middle = region.children[1];
  if (!(middle instanceof HTMLElement)) throw new Error('the frame has no middle');
  return middle;
}

function measured(element: HTMLElement, sizes: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => sizes.scrollHeight,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => sizes.clientHeight,
  });
}

function box(): HTMLElement {
  return within(frame()).getByLabelText(t('composer.box.label'));
}

/** A session that ran, knows the conversation it is, and ended. */
function anEndedSession(): void {
  live.connect();
  live.receive(
    hubEvent(SESSION, 'session.started', 1, {
      sessionId: SESSION,
      workspacePath: FOLDER,
      claudeSessionId: CONVERSATION,
    }),
    hubEvent(SESSION, 'session.closed', 2, { sessionId: SESSION, reason: 'idleTimeout' }),
  );
}

describe('the frame of the panel — plan 09, F1', () => {
  it('follows the end of what streams in its one scroller, and leaves the reader where they read — S-07', async () => {
    render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);
    live.connect();
    live.receive(hubEvent(SESSION, 'message.delta', 1, { messageId: 'm1', delta: 'one' }));
    await screen.findByText('one');
    const scroller = scrollerOf(frame());
    const sizes = { scrollHeight: 1_000, clientHeight: 200 };
    measured(scroller, sizes);

    live.receive(hubEvent(SESSION, 'message.delta', 2, { messageId: 'm1', delta: ' two' }));
    grew();
    expect(scroller.scrollTop).toBe(1_000);

    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event('scroll'));
    sizes.scrollHeight = 1_500;
    live.receive(hubEvent(SESSION, 'message.delta', 3, { messageId: 'm1', delta: ' three' }));
    grew();
    expect(scroller.scrollTop).toBe(100);

    scroller.scrollTop = 1_300;
    scroller.dispatchEvent(new Event('scroll'));
    sizes.scrollHeight = 2_000;
    grew();
    expect(scroller.scrollTop).toBe(2_000);
  });

  it('swaps only the middle for the changes: the box, its text and the scroll stay — S-08', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);
    live.connect();
    live.receive(hubEvent(SESSION, 'message.delta', 1, { messageId: 'm1', delta: 'Said.' }));
    await screen.findByText('Said.');
    const written = box();
    await user.type(written, 'half a thought');
    claudePanelStore(FOLDER)
      .getState()
      .setScroll(`session:${SESSION}`, { top: 40, following: false });

    rerender(<SessionScreen sessionId={SESSION} folder={FOLDER} changes={<p>{CHANGES}</p>} />);

    expect(screen.getByText(CHANGES)).toBeInTheDocument();
    expect(screen.queryByText('Said.')).toBeNull();
    expect(box()).toBe(written);
    expect(box()).toHaveValue('half a thought');

    rerender(<SessionScreen sessionId={SESSION} folder={FOLDER} />);

    expect(screen.getByText('Said.')).toBeInTheDocument();
    expect(scrollerOf(frame()).scrollTop).toBe(40);
    expect(box()).toHaveValue('half a thought');
  });

  it('says the connection in a strip at the top, gone without moving the box — S-10', () => {
    render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);
    const before = box();
    const down = new RegExp(
      `^(${(['idle', 'connecting', 'closed'] as const)
        .map((status) => t(`connection.status.${status}`))
        .join('|')})$`,
    );
    expect(within(frame()).getByText(down)).toBeInTheDocument();

    live.connect();

    expect(within(frame()).queryByText(down)).toBeNull();
    expect(within(frame()).queryByText(t('connection.status.ready'))).toBeNull();
    expect(box()).toBe(before);
  });

  it('puts a partial replay and a history that failed at the top of the conversation — S-11', async () => {
    vi.mocked(api.get).mockRejectedValue(claudeUnavailable);
    render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);
    live.connect();
    live.receive(
      ack('session.attached', {
        sessionId: SESSION,
        replayed: 0,
        oldestAvailableSeq: 900,
        gap: true,
        claudeSessionId: CONVERSATION,
      }),
      hubEvent(SESSION, 'message.delta', 901, { messageId: 'm9', delta: 'still live' }),
    );

    const failed = await within(frame()).findByRole('alert');
    expect(failed).toHaveTextContent(t('transcript.error.claudeUnavailable'));
    const conversation = within(frame()).getByRole('list', {
      name: t('session.screen.conversation'),
    });
    expect(failed.compareDocumentPosition(conversation) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(failed).getByRole('button', { name: t('common.action.retry') })).toBeVisible();
    expect(screen.getByText('still live')).toBeInTheDocument();
  });

  it('caps the box at a share of the frame, which is a size container — S-14', () => {
    render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);

    expect(box()).toHaveStyle({ maxHeight: MAX_BOX_HEIGHT });
    expect(frame().className).toContain('[container-type:size]');
    // The one scroller takes the focus, so a keyboard scrolls it with nothing focusable inside.
    expect(scrollerOf(frame())).toHaveAttribute('tabindex', '0');
  });

  it('frames the draft the same way: the hints in the middle, the box under them — S-12', () => {
    const key = claudePanelStore(FOLDER).getState().openDraft();
    render(<DraftView folder={FOLDER} tabKey={key} />);

    const draft = screen.getByRole('region', { name: t('sessions.draft.title') });
    const [, middle, dock] = [...draft.children];
    expect(within(middle as HTMLElement).getByText(t('sessions.draft.mention'))).toBeVisible();
    expect(within(dock as HTMLElement).getByLabelText(t('composer.box.label'))).toBeInTheDocument();
  });
});

describe('a session that ended, whose box resumes it — plan 09, B-06, D-05', () => {
  it('says it ended and that sending resumes it, with the box still on — S-09', () => {
    render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);
    anEndedSession();

    const strip = within(frame()).getByText(
      t('session.screen.ended', { reason: t('session.closeReason.idleTimeout'), at: AT }),
      { exact: false },
    );
    expect(strip).toHaveTextContent(t('session.ended.resumes'));
    expect(box()).toBeEnabled();
    expect(
      within(frame()).getByRole('button', { name: t('session.ended.resumeAndSend') }),
    ).toBeInTheDocument();
  });

  it('resumes the conversation and sends the prompt there — S-87', async () => {
    const user = userEvent.setup();
    claudePanelStore(FOLDER).getState().show('session', SESSION);
    render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);
    anEndedSession();

    await user.type(box(), 'go on{Enter}');

    const resume = live.lastSent('session.start');
    expect(resume).toMatchObject({
      payload: { workspacePath: FOLDER, resumeSessionId: CONVERSATION },
    });
    live.receive({
      v: 1,
      id: 'started-resumed',
      kind: 'event',
      type: 'session.started',
      ts: AT,
      seq: 1,
      correlationId: resume?.['id'],
      payload: { sessionId: RESUMED, workspacePath: FOLDER, resumedFrom: CONVERSATION },
    });

    await waitFor(() => {
      expect(live.lastSent('session.prompt')).toMatchObject({
        payload: { sessionId: RESUMED, text: 'go on' },
      });
    });
    expect(claudePanelStore(FOLDER).getState().active).toBe(`session:${RESUMED}`);
  });

  it('keeps the text, and says why above the box, when the installation is full — S-89', async () => {
    const user = userEvent.setup();
    claudePanelStore(FOLDER).getState().show('session', SESSION);
    render(<SessionScreen sessionId={SESSION} folder={FOLDER} />);
    anEndedSession();

    await user.type(box(), 'go on{Enter}');
    live.receive(
      aRefusal(
        String(live.lastSent('session.start')?.['id']),
        'SESSION_LIMIT_REACHED',
        'session.error.limitReached',
      ),
    );

    const refusal = await within(frame()).findByRole('alert');
    expect(refusal).toHaveTextContent(t('session.error.limitReached'));
    expect(box()).toHaveValue('go on');
    // Above the box: the refusal comes first in the dock.
    expect(refusal.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
