import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import type { Envelope } from '@remote-claude/contracts';

import { ConversationReader } from '@/features/session';
import { Conversation } from '@/features/session/components/Conversation';
import { TaskStrip } from '@/features/session/components/composer/TaskStrip';
import { taskListOf } from '@/features/session/lib/task-list';
import { readEvent, SILENT } from '@/features/session/services/conversation-reducer';
import type { Conversation as ConversationState } from '@/features/session/types/live-session';
import { api } from '@/shared/api/api';
import { aHistoryPage, OURS } from '../../../support/history';
import { render, translator } from '../../../support/render';

const t = translator('en');

/** One event of the stream, or of a page of the history — the same payload either way. */
type Event = { readonly type: string; readonly payload: Record<string, unknown> };

const started = (id: string, toolName: string, input: Record<string, unknown>): Event => ({
  type: 'tool.started',
  payload: { toolUseId: id, toolName, input },
});

const ended = (id: string, extra: Record<string, unknown> = {}): Event => ({
  type: 'tool.completed',
  payload: { toolUseId: id, status: 'succeeded', ...extra },
});

const todos = (a: string, b: string, c: string) => ({
  todos: [
    { content: 'Write a.txt', status: a, activeForm: 'Writing a.txt' },
    { content: 'Write b.txt', status: b, activeForm: 'Writing b.txt' },
    { content: 'Write c.txt', status: c, activeForm: 'Writing c.txt' },
  ],
});

/** What `todo-write-turn` recorded: the whole list, three times. */
const TODO_WRITE: readonly Event[] = [
  started('w1', 'TodoWrite', todos('pending', 'pending', 'pending')),
  ended('w1'),
  started('w2', 'TodoWrite', todos('in_progress', 'pending', 'pending')),
  ended('w2'),
  started('w3', 'TodoWrite', todos('completed', 'pending', 'pending')),
  ended('w3'),
];

/** What `task-tools-turn` recorded: three tasks created, then the first moved twice. */
const TASK_TOOLS: readonly Event[] = [
  ...['a', 'b', 'c'].flatMap((name, index) => [
    started(`c${name}`, 'TaskCreate', {
      subject: `Write ${name}.txt`,
      activeForm: `Writing ${name}.txt`,
    }),
    ended(`c${name}`, { taskId: String(index + 1) }),
  ]),
  started('u1', 'TaskUpdate', { taskId: '1', status: 'in_progress' }),
  ended('u1', { taskId: '1' }),
  started('u2', 'TaskUpdate', { taskId: '1', status: 'completed' }),
  ended('u2', { taskId: '1' }),
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

/** The strip of the list above the box, as the tools of `events` leave it (plan 09, B-26). */
function strip(events: readonly Event[]): ReturnType<typeof render> {
  return render(<TaskStrip list={taskListOf(fold(events).tools)} />);
}

/** The line the list folds into — what unfolds it. */
function headline(): HTMLElement {
  return within(list()).getByRole('button');
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** The task list of the panel — plan 08, B-20, D-25; above the box since plan 09, B-26, D-14. */
describe('the task list of a conversation', () => {
  it.each([
    ['TodoWrite', TODO_WRITE],
    ['TaskCreate and TaskUpdate', TASK_TOOLS],
  ])(
    'folds the list of %s into one line above the box, and unfolds it whole — S-85, plan 09 S-73',
    async (_, events) => {
      const user = userEvent.setup();
      strip(events);

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
    },
  );

  it('says what a task is doing while it is in progress — on its line, and on its row', async () => {
    const user = userEvent.setup();
    strip(TASK_TOOLS.slice(0, 8));

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

  it('says so when every task is done, and counts none done at the start — plan 09, S-73', () => {
    const done = todos('completed', 'completed', 'completed');
    const { unmount } = strip([started('w9', 'TodoWrite', done), ended('w9')]);
    expect(headline()).toHaveTextContent(t('sessions.tasks.allDone', { done: 3, total: 3 }));
    unmount();

    strip(TODO_WRITE.slice(0, 2));
    expect(headline()).toHaveTextContent(
      t('sessions.tasks.headline', { done: 0, total: 3, task: 'Write a.txt' }),
    );
  });

  it('is no longer at the top of the conversation — plan 09, B-26', () => {
    render(<Conversation conversation={fold(TODO_WRITE)} isPartial={false} />);

    expect(screen.queryByRole('region', { name: t('sessions.tasks.label') })).toBeNull();
  });

  it('says each change of the list on its row, and leaves a call it could not read a tool — S-86', () => {
    render(
      <Conversation
        conversation={fold([
          ...TASK_TOOLS.slice(0, 2),
          started('lost', 'TaskUpdate', { taskId: '42', status: 'completed' }),
          ended('lost'),
        ])}
        isPartial={false}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: new RegExp(t('sessions.tool.taskCreate', { subject: 'Write a.txt' })),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: new RegExp(`^${t('sessions.tool.other', { name: 'TaskUpdate' })}`),
      }),
    ).toBeInTheDocument();
  });

  it('draws nothing without a list, or once the list was emptied — S-86, plan 09 S-73', () => {
    const { container, unmount } = strip([]);
    expect(container).toBeEmptyDOMElement();
    unmount();

    strip([...TODO_WRITE, started('w4', 'TodoWrite', { todos: [] }), ended('w4')]);
    expect(
      screen.queryByRole('region', { name: t('sessions.tasks.label') }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ['TodoWrite', TODO_WRITE],
    ['TaskCreate and TaskUpdate', TASK_TOOLS],
  ])('draws the same list of %s from the history, after a reload — S-87', async (_, events) => {
    vi.spyOn(api, 'get').mockResolvedValue(aHistoryPage(events));
    render(<ConversationReader conversationId={OURS} onResumed={vi.fn()} onClose={vi.fn()} />);

    const region = await screen.findByRole('region', { name: t('sessions.tasks.label') });
    expect(within(region).getByRole('button')).toHaveTextContent(
      t('sessions.tasks.headline', { done: 1, total: 3, task: 'Write b.txt' }),
    );
  });

  it('has no accessibility violation, folded and unfolded', async () => {
    const user = userEvent.setup();
    const { container } = strip(TASK_TOOLS);
    expect(await axe(container)).toHaveNoViolations();

    await user.click(headline());
    expect(await axe(container)).toHaveNoViolations();
  });
});
