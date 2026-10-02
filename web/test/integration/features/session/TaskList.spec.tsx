import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import type { Envelope } from '@remote-claude/contracts';

import { ConversationReader } from '@/features/session';
import { Conversation } from '@/features/session/components/Conversation';
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

afterEach(() => {
  vi.restoreAllMocks();
});

/** The task list of the panel — plan 08, B-20, D-25. */
describe('the task list of a conversation', () => {
  it.each([
    ['TodoWrite', TODO_WRITE],
    ['TaskCreate and TaskUpdate', TASK_TOOLS],
  ])('draws the list of %s pinned above the conversation, the same way — S-85', (_, events) => {
    render(<Conversation conversation={fold(events)} isPartial={false} />);

    expect(
      within(list()).getByText(t('sessions.tasks.count', { done: 1, total: 3 })),
    ).toBeInTheDocument();
    const items = within(list())
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(items).toEqual([
      `${t('sessions.taskStatus.completed')}: Write a.txt${t('sessions.tasks.was', { state: t('sessions.taskStatus.inProgress') })}`,
      `${t('sessions.taskStatus.pending')}: Write b.txt`,
      `${t('sessions.taskStatus.pending')}: Write c.txt`,
    ]);
  });

  it('says what a task is doing while it is in progress', () => {
    render(<Conversation conversation={fold(TASK_TOOLS.slice(0, 8))} isPartial={false} />);

    expect(within(list()).getByText('Writing a.txt')).toBeInTheDocument();
    expect(
      within(list()).getByText(
        t('sessions.tasks.was', { state: t('sessions.taskStatus.pending') }),
      ),
    ).toBeInTheDocument();
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

  it('draws nothing once the list was emptied — S-86', () => {
    render(
      <Conversation
        conversation={fold([...TODO_WRITE, started('w4', 'TodoWrite', { todos: [] }), ended('w4')])}
        isPartial={false}
      />,
    );

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
    expect(
      within(region).getByText(t('sessions.tasks.count', { done: 1, total: 3 })),
    ).toBeInTheDocument();
  });

  it('has no accessibility violation', async () => {
    const { container } = render(
      <Conversation conversation={fold(TASK_TOOLS)} isPartial={false} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
