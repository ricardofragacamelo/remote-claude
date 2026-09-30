import { describe, expect, it, vi } from 'vitest';

import {
  BURST_MS,
  createOutbox,
  RETRY_MS,
} from '@/features/notifications/hooks/notification-outbox';
import type { OutboxDependencies } from '@/features/notifications/hooks/notification-outbox';
import type { NotificationEntry, PendingNotification } from '@/features/notifications';
import { AppError } from '@/shared/api/errors';
import type { Notification } from '@/shared/lib/notify';

/** A clock the test moves: every wait is kept, and runs when the test says. */
function aClock() {
  let now = 0;
  const waits: { at: number; action: () => void; stopped: boolean }[] = [];

  return {
    schedule: (action: () => void, ms: number) => {
      const wait = { at: now + ms, action, stopped: false };
      waits.push(wait);
      return () => {
        wait.stopped = true;
      };
    },
    /** Moves the clock on, running what was due. */
    advance: async (ms: number) => {
      now += ms;
      for (const wait of waits.filter((each) => !each.stopped && each.at <= now)) {
        wait.stopped = true;
        wait.action();
      }
      await Promise.resolve();
      await Promise.resolve();
    },
    pending: () => waits.filter((each) => !each.stopped).map((each) => each.at - now),
  };
}

const lost: Notification = { severity: 'warning', messageKey: 'notification.connection.lost' };

function anEntry(pending: PendingNotification): NotificationEntry {
  return {
    id: `n_${pending.clientId}`,
    severity: pending.severity,
    messageKey: pending.messageKey,
    params: pending.params,
    count: pending.count,
    createdAt: pending.createdAt,
    readAt: null,
  };
}

function anOutbox(
  send: OutboxDependencies['send'] = (pending) => Promise.resolve(anEntry(pending)),
) {
  const clock = aClock();
  const changes: (readonly PendingNotification[])[] = [];
  const saved: NotificationEntry[] = [];
  let id = 0;
  const sender = vi.fn(send);
  const outbox = createOutbox({
    send: sender,
    onChange: (pending) => changes.push(pending),
    onSaved: (entry) => saved.push(entry),
    schedule: clock.schedule,
    now: () => new Date('2026-09-30T12:00:00.000Z'),
    newId: () => `c${String(++id)}`,
  });
  return { outbox, clock, sender, saved, last: () => changes.at(-1) ?? [] };
}

describe('a burst of the same notification — plan 06, S-132', () => {
  it('is one entry with a count, sent once when the burst is over', async () => {
    const { outbox, clock, sender, saved, last } = anOutbox();

    outbox.add(lost);
    outbox.add(lost);
    const third = outbox.add(lost);

    expect(third).toMatchObject({ clientId: 'c1', count: 3, state: 'grouping' });
    expect(sender).not.toHaveBeenCalled();

    await clock.advance(BURST_MS);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', count: 3 }));
    expect(saved).toEqual([expect.objectContaining({ id: 'n_c1', count: 3 })]);
    expect(last()).toEqual([]);
  });

  it('keeps notifications that differ — in severity, key or parameters — apart', () => {
    const { outbox, last } = anOutbox();

    outbox.add({
      severity: 'warning',
      messageKey: 'notification.folder.notAllowed',
      params: { folder: '/a' },
    });
    outbox.add({
      severity: 'warning',
      messageKey: 'notification.folder.notAllowed',
      params: { folder: '/b' },
    });
    outbox.add({ severity: 'info', messageKey: 'notification.connection.lost' });
    outbox.add(lost);

    expect(last()).toHaveLength(4);
  });

  it('starts a new entry for the same notification once the burst has been sent', async () => {
    const { outbox, clock } = anOutbox(() => new Promise(() => undefined));

    outbox.add(lost);
    await clock.advance(BURST_MS);

    expect(outbox.add(lost)).toMatchObject({ clientId: 'c2', count: 1 });
  });

  it('groups parameters written in another order as the same notification', () => {
    const { outbox } = anOutbox();

    outbox.add({
      severity: 'error',
      messageKey: 'notification.command.failed',
      params: { command: 'x', code: 'y' },
    });
    const again = outbox.add({
      severity: 'error',
      messageKey: 'notification.command.failed',
      params: { code: 'y', command: 'x' },
    });

    expect(again.count).toBe(2);
  });

  it('carries the actions it was raised with', () => {
    const { outbox } = anOutbox();
    const action = { labelKey: 'notifications.toast.dismiss', run: vi.fn() };

    expect(outbox.add({ ...lost, actions: [action] }).actions).toEqual([action]);
  });
});

describe('a notification the server could not be asked about — plan 06, S-182', () => {
  const offline = new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't-1');

  it('stays, marked, and is sent again later under the same client id', async () => {
    let fail = true;
    const { outbox, clock, sender, saved, last } = anOutbox((pending) =>
      fail ? Promise.reject(offline) : Promise.resolve(anEntry(pending)),
    );

    outbox.add(lost);
    await clock.advance(BURST_MS);
    expect(last()).toEqual([expect.objectContaining({ clientId: 'c1', state: 'unsaved' })]);
    expect(clock.pending()).toEqual([RETRY_MS[0]]);

    fail = false;
    await clock.advance(RETRY_MS[0]);
    expect(sender.mock.calls.map(([pending]) => pending.clientId)).toEqual(['c1', 'c1']);
    expect(saved).toHaveLength(1);
    expect(last()).toEqual([]);
  });

  it('waits longer after each failure, and no longer than the last wait', async () => {
    const { outbox, clock } = anOutbox(() => Promise.reject(offline));
    const waits: number[] = [];

    outbox.add(lost);
    await clock.advance(BURST_MS);
    for (let attempt = 0; attempt < RETRY_MS.length + 1; attempt += 1) {
      const [wait = 0] = clock.pending();
      waits.push(wait);
      await clock.advance(wait);
    }

    expect(waits).toEqual([...RETRY_MS, RETRY_MS.at(-1)]);
  });

  it('is sent at once when the connection comes back, and the wait is dropped', async () => {
    let fail = true;
    const { outbox, clock, sender } = anOutbox((pending) =>
      fail ? Promise.reject(offline) : Promise.resolve(anEntry(pending)),
    );

    outbox.add(lost);
    outbox.add({ severity: 'info', messageKey: 'notification.connection.restored' });
    await clock.advance(BURST_MS);
    fail = false;
    outbox.retryNow();
    await clock.advance(0);

    expect(sender).toHaveBeenCalledTimes(4);
    expect(clock.pending()).toEqual([]);
  });
});

describe('a notification the server refuses — plan 06, S-199', () => {
  it('stays in this window only, marked, and is never sent again', async () => {
    const { outbox, clock, sender, last } = anOutbox(() =>
      Promise.reject(new AppError('INVALID_INPUT', 'notification.error.rejected', 't-2')),
    );

    outbox.add(lost);
    await clock.advance(BURST_MS);
    outbox.retryNow();

    expect(last()).toEqual([expect.objectContaining({ state: 'refused' })]);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(clock.pending()).toEqual([]);
  });

  it('cleared by the person before it reached the server, is not sent at all', async () => {
    const { outbox, clock, sender, last } = anOutbox();

    const entry = outbox.add(lost);
    outbox.drop(entry.clientId);
    await clock.advance(BURST_MS);

    expect(sender).not.toHaveBeenCalled();
    expect(last()).toEqual([]);
  });

  it('cleared while its failed send is on its way back, stays cleared', async () => {
    let fail: (error: unknown) => void = () => undefined;
    const { outbox, clock, last } = anOutbox(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );

    const entry = outbox.add(lost);
    await clock.advance(BURST_MS);
    outbox.drop(entry.clientId);
    fail(new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't-3'));
    await clock.advance(0);

    expect(last()).toEqual([]);
    expect(clock.pending()).toEqual([]);
  });
});

describe('signing out', () => {
  it('stops every wait, forgets everything, and ignores an answer that arrives after', async () => {
    let answer: (entry: NotificationEntry) => void = () => undefined;
    const { outbox, clock, saved, last } = anOutbox(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    const first = outbox.add(lost);
    await clock.advance(BURST_MS);
    outbox.add({ severity: 'info', messageKey: 'notification.connection.restored' });
    outbox.dispose();
    answer(anEntry(first));
    await clock.advance(BURST_MS);

    expect(last()).toEqual([]);
    expect(saved).toEqual([]);
    expect(clock.pending()).toEqual([]);
  });

  it('ignores a failure that arrives after', async () => {
    let fail: (error: unknown) => void = () => undefined;
    const { outbox, clock, last } = anOutbox(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );

    outbox.add(lost);
    await clock.advance(BURST_MS);
    outbox.dispose();
    fail(new AppError('NETWORK_UNREACHABLE', 'common.error.offline', 't-4'));
    await clock.advance(0);

    expect(last()).toEqual([]);
    expect(clock.pending()).toEqual([]);
  });
});

describe('the defaults', () => {
  it('waits on the real clock and names entries with a random id', async () => {
    vi.useFakeTimers();
    const send = vi.fn((pending: PendingNotification) => Promise.resolve(anEntry(pending)));
    const outbox = createOutbox({ send, onChange: vi.fn(), onSaved: vi.fn() });

    const entry = outbox.add(lost);
    expect(entry.clientId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false);
    await vi.advanceTimersByTimeAsync(BURST_MS);

    expect(send).toHaveBeenCalledTimes(1);
    outbox.add(lost);
    outbox.dispose();
    vi.useRealTimers();
  });
});
