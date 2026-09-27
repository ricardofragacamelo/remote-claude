import { beforeEach, describe, expect, it } from 'vitest';

import { PUSH_RETRY, PushDispatcher, retryDelayMs } from '@application/notification';
import type { Dispatch, PushExhaustion } from '@application/notification';
import { PushMessage } from '@domain/notification';
import { anApprovedDevice } from '../../../support/builders/device.builder';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../support/fakes/manual-scheduler';
import { RecordingPushSender } from '../../../support/fakes/recording-push';

const phone = anApprovedDevice({ pushToken: 'token-one' });
const message = PushMessage.permissionRequested(
  { deviceId: phone.id, token: 'token-one', locale: phone.locale },
  { sessionId: 'ses-1', requestId: 'req-1', expiresAt: '2026-09-18T10:02:00.000Z' },
  { toolName: 'Bash' },
);

describe('retryDelayMs — D-09', () => {
  const middle = (): number => 0.5;

  it('waits a second, then four', () => {
    expect(retryDelayMs(PUSH_RETRY, 1, null, middle)).toBe(1_000);
    expect(retryDelayMs(PUSH_RETRY, 2, null, middle)).toBe(4_000);
  });

  it('jitters by a fifth either way', () => {
    expect(retryDelayMs(PUSH_RETRY, 1, null, () => 0)).toBe(800);
    expect(retryDelayMs(PUSH_RETRY, 1, null, () => 0.999_999)).toBe(1_200);
  });

  it("lets the provider's Retry-After rule over the formula", () => {
    expect(retryDelayMs(PUSH_RETRY, 1, 7_000, middle)).toBe(7_000);
    expect(retryDelayMs(PUSH_RETRY, 2, 0, middle)).toBe(0);
  });

  it('never waits a negative time', () => {
    expect(retryDelayMs(PUSH_RETRY, 1, -5, middle)).toBe(0);
  });
});

describe('PushDispatcher', () => {
  let sender: RecordingPushSender;
  let scheduler: ManualScheduler;
  let clock: FixedClock;
  let exhausted: PushExhaustion[];
  let failures: { error: unknown; requestId: string }[];
  let dispatcher: PushDispatcher;

  beforeEach(() => {
    sender = new RecordingPushSender();
    scheduler = new ManualScheduler();
    clock = new FixedClock(new Date('2026-09-18T10:00:00.000Z'));
    exhausted = [];
    failures = [];
    dispatcher = new PushDispatcher(
      sender,
      scheduler,
      clock,
      {
        exhausted: (exhaustion) => exhausted.push(exhaustion),
        failed: (error, requestId) => failures.push({ error, requestId }),
      },
      PUSH_RETRY,
      () => 0.5,
    );
  });

  const dispatch = (overrides: Partial<Dispatch> = {}): Dispatch => ({
    key: 'req-1:announce',
    requestId: 'req-1',
    message,
    deadline: null,
    onTokenRejected: () => Promise.resolve(),
    ...overrides,
  });

  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  it('answers what the first attempt said', async () => {
    sender.answer = () => 'failed';

    expect(await dispatcher.dispatch(dispatch())).toBe('failed');
    expect(dispatcher.pending).toBe(1);
  });

  it("uses the provider's Retry-After as the wait", async () => {
    sender.answer = () => ({ delivery: 'failed', retryAfterMs: 9_000 });

    await dispatcher.dispatch(dispatch());

    expect(scheduler.delays).toEqual([9_000]);
  });

  it('keeps going until it delivers, and stops there', async () => {
    sender.answer = (_message, attempt) => (attempt < 3 ? 'failed' : 'delivered');

    await dispatcher.dispatch(dispatch());
    scheduler.fire();
    await settle();
    scheduler.fire();
    await settle();

    expect(sender.sent).toHaveLength(3);
    expect(scheduler.delays).toEqual([1_000, 4_000]);
    expect(dispatcher.pending).toBe(0);
    expect(exhausted).toEqual([]);
  });

  it('cancels what is waiting when stopped, and sends nothing after', async () => {
    sender.answer = () => 'failed';
    await dispatcher.dispatch(dispatch());

    await dispatcher.stop('req-1:announce');
    scheduler.fire();
    await settle();

    expect(sender.sent).toHaveLength(1);
    expect(dispatcher.pending).toBe(0);
    expect(exhausted).toEqual([]);
  });

  it('stops only the group it was asked to', async () => {
    sender.answer = () => 'failed';
    await dispatcher.dispatch(dispatch());
    await dispatcher.dispatch(dispatch({ key: 'req-1:withdraw' }));

    await dispatcher.stop('req-1:announce');

    expect(dispatcher.pending).toBe(1);
  });

  it('treats stopping a group with nothing in it as nothing at all', async () => {
    await expect(dispatcher.stop('nobody')).resolves.toBeUndefined();
  });

  it('reports a retry that threw, and makes no further attempt', async () => {
    sender.answer = (_message, attempt) => (attempt === 1 ? 'failed' : 'tokenRejected');
    const broken = new Error('the database is down');

    await dispatcher.dispatch(dispatch({ onTokenRejected: () => Promise.reject(broken) }));
    scheduler.fire();
    await settle();

    expect(failures).toEqual([{ error: broken, requestId: 'req-1' }]);
    expect(dispatcher.pending).toBe(0);
  });

  it('lets a first attempt that threw reach the caller', async () => {
    sender.answer = () => 'tokenRejected';

    await expect(
      dispatcher.dispatch(dispatch({ onTokenRejected: () => Promise.reject(new Error('down')) })),
    ).rejects.toThrow('down');
  });

  it('gives up before a retry that would land exactly at the deadline', async () => {
    sender.answer = () => 'failed';

    await dispatcher.dispatch(dispatch({ deadline: new Date(clock.now().getTime() + 1_000) }));

    expect(scheduler.armed).toBe(0);
    expect(exhausted).toEqual([
      expect.objectContaining({ attempts: 1, reason: 'deadline', kind: 'permissionRequested' }),
    ]);
  });
});
