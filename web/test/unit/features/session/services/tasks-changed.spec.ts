import { describe, expect, it } from 'vitest';

import type { Envelope } from '@remote-claude/contracts';

import {
  conversationFrom,
  readEvent,
  SILENT,
  withHistory,
} from '@/features/session/services/conversation-reducer';
import { createLiveSessionStore } from '@/features/session/store/live-session.store';
import type { Conversation } from '@/features/session/types/live-session';

const SESSION = 'sess-1';

const A = { id: '1', title: 'Write a.txt', activeTitle: 'Writing a.txt', status: 'inProgress' };
const B = { id: '2', title: 'Write b.txt', status: 'pending' };

function changed(tasks: unknown, seq?: number): Envelope {
  return {
    v: 1,
    id: `f-${String(seq ?? 0)}`,
    kind: 'event',
    type: 'session.tasksChanged',
    ts: '2026-10-10T12:00:00.000Z',
    ...(seq === undefined ? {} : { seq, sessionId: SESSION }),
    payload: { tasks },
  } as Envelope;
}

function fold(...frames: readonly Envelope[]): Conversation {
  return frames.reduce(readEvent, SILENT);
}

/** `session.tasksChanged` in the conversation — plan 28, B-22. */
describe('the task list of the conversation', () => {
  it('has none before the first event', () => {
    expect(SILENT.taskList).toBeNull();
  });

  it('keeps the whole list the event says, in its order and its canonical states — S-66', () => {
    expect(fold(changed([A, B])).taskList).toEqual({
      tasks: [
        { id: '1', title: 'Write a.txt', activeTitle: 'Writing a.txt', status: 'inProgress' },
        { id: '2', title: 'Write b.txt', activeTitle: null, status: 'pending' },
      ],
      previous: [],
    });
  });

  it('replaces the list with the next one, keeping the one before to compare — S-66', () => {
    const state = fold(changed([A, B]), changed([{ ...A, status: 'completed' }]));

    expect(state.taskList?.tasks.map((task) => [task.id, task.status])).toEqual([
      ['1', 'completed'],
    ]);
    expect(state.taskList?.previous.map((task) => task.id)).toEqual(['1', '2']);
  });

  it('keeps an emptied list as an empty one', () => {
    expect(fold(changed([A]), changed([])).taskList?.tasks).toEqual([]);
  });

  it.each([
    ['not an object', 'Write a.txt'],
    ['with no id', { title: 'x', status: 'pending' }],
    ['with no title', { id: '9', status: 'pending' }],
    ['with a state the contract does not have', { id: '9', title: 'x', status: 'in_progress' }],
    ['with no state', { id: '9', title: 'x' }],
  ])('leaves out a task %s, and draws the rest', (_case, task) => {
    expect(fold(changed([A, task])).taskList?.tasks.map((each) => each.id)).toEqual(['1']);
  });

  it('changes nothing for an event with no list at all', () => {
    const before = fold(changed([A]));

    expect(readEvent(before, changed('many'))).toBe(before);
  });

  it('draws the last list of the history, by the same reducer — S-67', () => {
    const past = conversationFrom([
      { type: 'session.tasksChanged', payload: { tasks: [B], at: '2026-10-10T11:00:00.000Z' } },
      { type: 'session.tasksChanged', payload: { tasks: [A, B] } },
    ]);

    expect(past.taskList?.tasks.map((task) => task.id)).toEqual(['1', '2']);
  });

  it('keeps the list of the stream over the history, and the history’s when the stream said none', () => {
    const history = [{ type: 'session.tasksChanged', payload: { tasks: [B] } }];

    expect(withHistory(fold(changed([A])), history).taskList?.tasks.map((t) => t.id)).toEqual([
      '1',
    ]);
    expect(withHistory(SILENT, history).taskList?.tasks.map((t) => t.id)).toEqual(['2']);
  });

  it('repeats no task when the replay delivers the event again — S-67', () => {
    const store = createLiveSessionStore(SESSION);
    store.getState().apply(changed([B], 1));
    store.getState().apply(changed([A, B], 2));
    store.getState().apply(changed([A, B], 2));
    store.getState().apply(changed([B], 1));

    expect(store.getState().taskList).toEqual({
      tasks: [
        { id: '1', title: 'Write a.txt', activeTitle: 'Writing a.txt', status: 'inProgress' },
        { id: '2', title: 'Write b.txt', activeTitle: null, status: 'pending' },
      ],
      previous: [{ id: '2', title: 'Write b.txt', activeTitle: null, status: 'pending' }],
    });
  });

  it('forgets the list on a gap, until the history brings it back', () => {
    const store = createLiveSessionStore(SESSION);
    store.getState().apply(changed([A], 1));
    store.getState().reset({ engine: 'claude', id: 'conv-1' });

    expect(store.getState().taskList).toBeNull();

    store
      .getState()
      .hydrate({ engine: 'claude', id: 'conv-1' }, [
        { type: 'session.tasksChanged', payload: { tasks: [B] } },
      ]);
    expect(store.getState().taskList?.tasks.map((task) => task.id)).toEqual(['2']);
  });
});
