import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { Envelope } from '@remote-claude/contracts';

import { ConversationReader, KeepAgentNames } from '@/features/session';
import { Conversation } from '@/features/session/components/Conversation';
import { TaskStrip } from '@/features/session/components/composer/TaskStrip';
import { readEvent, SILENT } from '@/features/session/services/conversation-reducer';
import type { Conversation as ConversationState } from '@/features/session/types/live-session';
import { api } from '@/shared/api/api';
import { CAPABILITIES, anEngineDto, anEngineList } from '../../../support/engines';
import { aHistoryPage, OURS } from '../../../support/history';
import { render, translator } from '../../../support/render';
import { aToolCall } from '../../../support/canonical-tool';

const t = translator('en');

/** One event of the stream, or of a page of the history — the same payload either way. */
type Event = { readonly type: string; readonly payload: Record<string, unknown> };

type Status = 'pending' | 'inProgress' | 'completed';

const started = (id: string, toolName: string, input: Record<string, unknown>): Event => ({
  type: 'tool.started',
  payload: { toolUseId: id, ...aToolCall(toolName, input) },
});

const ended = (id: string): Event => ({
  type: 'tool.completed',
  payload: { toolUseId: id, status: 'succeeded' },
});

/** The whole list, as the server reads it from the agent's calls (plan 28, B-22). */
const tasksChanged = (a: Status, b: Status, c: Status): Event => ({
  type: 'session.tasksChanged',
  payload: {
    tasks: [
      { id: '1', title: 'Write a.txt', activeTitle: 'Writing a.txt', status: a },
      { id: '2', title: 'Write b.txt', activeTitle: 'Writing b.txt', status: b },
      { id: '3', title: 'Write c.txt', status: c },
    ],
  },
});

/** A turn as the history carries it: each call of the list, then the list it left. */
const TURN: readonly Event[] = [
  started('w1', 'TodoWrite', { todos: [] }),
  ended('w1'),
  tasksChanged('pending', 'pending', 'pending'),
  started('w2', 'TodoWrite', { todos: [] }),
  ended('w2'),
  tasksChanged('inProgress', 'pending', 'pending'),
  started('w3', 'TodoWrite', { todos: [] }),
  ended('w3'),
  tasksChanged('completed', 'pending', 'pending'),
];

function fold(events: readonly Event[]): ConversationState {
  return events.reduce(
    (state, event) =>
      readEvent(state, {
        v: 1,
        id: 'e',
        kind: 'event',
        type: event.type,
        ts: '',
        payload: event.payload,
      } as Envelope),
    SILENT,
  );
}

function list(): HTMLElement {
  return screen.getByRole('region', { name: t('sessions.tasks.label') });
}

/** The strip of the list above the box, as the events leave it (plan 09, B-26). */
function strip(events: readonly Event[]): ReturnType<typeof render> {
  return render(<TaskStrip list={fold(events).taskList} />);
}

/** The line the list folds into — what unfolds it. */
function headline(): HTMLElement {
  return within(list()).getByRole('button');
}

/** The reader of a conversation, with `GET /engines` saying what its engine can do. */
function read(events: readonly Event[], capabilities = CAPABILITIES): void {
  vi.spyOn(api, 'get').mockImplementation((path: string) =>
    Promise.resolve(
      path === '/engines'
        ? anEngineList({ engines: [anEngineDto({ capabilities })] })
        : aHistoryPage(events),
    ),
  );
  render(
    <>
      <KeepAgentNames />
      <ConversationReader
        conversation={{ engine: 'claude', id: OURS }}
        onResumed={vi.fn()}
        onClose={vi.fn()}
      />
    </>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** The task list of the panel — plan 08, B-20; above the box since plan 09, B-26; an event since plan 28, B-22. */
describe('the task list of a conversation', () => {
  it('folds the last list into one line above the box, and unfolds it whole, with what moved — S-66', async () => {
    const user = userEvent.setup();
    strip(TURN);

    expect(headline()).toHaveTextContent(
      t('sessions.tasks.headline', { done: 1, total: 3, task: 'Write b.txt' }),
    );
    expect(headline()).toHaveAttribute('aria-expanded', 'false');
    expect(within(list()).queryAllByRole('listitem')).toEqual([]);

    await user.click(headline());

    const items = within(list())
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      `${t('sessions.taskStatus.completed')}: Write a.txt${t('sessions.tasks.was', { state: t('sessions.taskStatus.inProgress') })}`,
      `${t('sessions.taskStatus.pending')}: Write b.txt`,
      `${t('sessions.taskStatus.pending')}: Write c.txt`,
    ]);

    await user.click(headline());
    expect(within(list()).queryAllByRole('listitem')).toEqual([]);
  });

  it('says what a task is doing while it is in progress — on its line, and on its row', async () => {
    const user = userEvent.setup();
    strip(TURN.slice(0, 6));

    expect(headline()).toHaveTextContent(
      t('sessions.tasks.headline', { done: 0, total: 3, task: 'Writing a.txt' }),
    );
    await user.click(headline());
    expect(within(list()).getByText('Writing a.txt')).toBeInTheDocument();
    expect(
      within(list()).getByText(
        t('sessions.tasks.was', { state: t('sessions.taskStatus.pending') }),
      ),
    ).toBeInTheDocument();
  });

  it('says what a task is, in progress, when the agent gave it no other words', async () => {
    const user = userEvent.setup();
    strip([tasksChanged('completed', 'completed', 'inProgress')]);

    expect(headline()).toHaveTextContent(
      t('sessions.tasks.headline', { done: 2, total: 3, task: 'Write c.txt' }),
    );
    await user.click(headline());
    expect(within(list()).getByText('Write c.txt')).toBeInTheDocument();
  });

  it('marks a task new to the list as moved from nowhere — only a change of state is said', async () => {
    const user = userEvent.setup();
    strip([
      tasksChanged('pending', 'pending', 'pending'),
      {
        type: 'session.tasksChanged',
        payload: { tasks: [{ id: '9', title: 'Write z.txt', status: 'inProgress' }] },
      },
    ]);

    await user.click(headline());
    expect(within(list()).getByText('Write z.txt')).toBeInTheDocument();
    expect(within(list()).queryByText(/^was /i)).toBeNull();
  });

  it('says so when every task is done, and counts none done at the start — plan 09, S-73', () => {
    const { unmount } = strip([tasksChanged('completed', 'completed', 'completed')]);
    expect(headline()).toHaveTextContent(t('sessions.tasks.allDone', { done: 3, total: 3 }));
    unmount();

    strip(TURN.slice(0, 3));
    expect(headline()).toHaveTextContent(
      t('sessions.tasks.headline', { done: 0, total: 3, task: 'Write a.txt' }),
    );
  });

  it('is not at the top of the conversation, and the calls of the list stay lines of their label', () => {
    render(<Conversation conversation={fold(TURN)} isPartial={false} />);

    expect(screen.queryByRole('region', { name: t('sessions.tasks.label') })).toBeNull();
    const label = t('sessions.tool.tasksWrite', { count: 0 });
    expect(screen.getAllByRole('button', { name: (name) => name.includes(label) })).toHaveLength(3);
  });

  it('draws nothing without a list, or once the list was emptied — S-86, plan 09 S-73', () => {
    const { container, unmount } = strip([]);
    expect(container).toBeEmptyDOMElement();
    unmount();

    strip([...TURN, { type: 'session.tasksChanged', payload: { tasks: [] } }]);
    expect(
      screen.queryByRole('region', { name: t('sessions.tasks.label') }),
    ).not.toBeInTheDocument();
  });

  it('draws the same list from the history, after a reload — S-67', async () => {
    read(TURN);

    const region = await screen.findByRole('region', { name: t('sessions.tasks.label') });
    expect(within(region).getByRole('button')).toHaveTextContent(
      t('sessions.tasks.headline', { done: 1, total: 3, task: 'Write b.txt' }),
    );
  });

  it('repeats no task when the history says the list twice — S-67', async () => {
    const user = userEvent.setup();
    read([...TURN, tasksChanged('completed', 'pending', 'pending')]);

    const region = await screen.findByRole('region', { name: t('sessions.tasks.label') });
    await user.click(within(region).getByRole('button'));
    expect(within(region).getAllByRole('listitem')).toHaveLength(3);
  });

  it('has no strip for a conversation whose engine keeps no list — S-68', async () => {
    read(TURN, { ...CAPABILITIES, taskList: false });

    expect(await screen.findByText(t('history.screen.description'))).toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/engines');
    });
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: t('sessions.tasks.label') })).toBeNull();
    });
  });

  it('has no accessibility violation, folded and unfolded', async () => {
    const user = userEvent.setup();
    const { container } = strip(TURN);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(headline());
    expect(await axe(container)).toHaveNoViolations();
  });
});
