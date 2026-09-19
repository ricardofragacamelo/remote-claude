import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Envelope } from '@remote-claude/contracts';

import { ContractCommandHandler } from '@adapter/inbound/ws/contract-command.gateway-handler';
import type { CausedEvent } from '@adapter/inbound/ws/contract-command.gateway-handler';
import type { EventDraft } from '@infra/websocket/session-hub';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { aWsContext } from '../../../../support/builders/ws-context.builder';

const schema = z.object({ sessionId: z.string().min(1), text: z.string().min(1) });

function frame(payload: unknown, overrides: Partial<Envelope> = {}): Envelope {
  return {
    v: 1,
    id: 'cmd-1',
    kind: 'command',
    type: 'session.prompt',
    ts: '2026-09-18T12:00:00.000Z',
    payload: payload as Readonly<Record<string, unknown>>,
    ...overrides,
  };
}

/**
 * The four steps every command of this gateway takes.
 *
 * What each command *does* is wired in its module and proved by the integration suite, against
 * the real container and a real socket. What is proved here is the shape they all share — and in
 * particular the ordering, which is the part a hand-written handler gets wrong.
 */
describe('ContractCommandHandler', () => {
  const handler = (
    run: Parameters<typeof build>[0] = () => undefined,
  ): ContractCommandHandler<{ sessionId: string; text: string }> => build(run);

  function build(
    run: (command: { sessionId: string; text: string }, context: never) => unknown,
  ): ContractCommandHandler<{ sessionId: string; text: string }> {
    return new ContractCommandHandler(
      'session.prompt',
      schema,
      run as (command: { sessionId: string; text: string }) => CausedEvent | void,
    );
  }

  const valid = { sessionId: '01J0', text: 'hello' };

  it('validates the frame before doing anything', async () => {
    let ran = false;

    await expect(
      handler(() => {
        ran = true;
      }).handle(aWsContext({ frame: frame({ sessionId: '01J0' }) })),
    ).rejects.toThrow(InputValidationError);

    expect(ran).toBe(false);
  });

  it.each([
    ['no payload', undefined],
    ['an empty session', { sessionId: '', text: 'hello' }],
    ['an empty text', { sessionId: '01J0', text: '' }],
    ['a field of the wrong type', { sessionId: 42, text: 'hello' }],
  ])('refuses a frame with %s', async (_case, payload) => {
    await expect(handler().handle(aWsContext({ frame: frame(payload) }))).rejects.toThrow(
      InputValidationError,
    );
  });

  it('hands the parsed command to the action', async () => {
    const seen: unknown[] = [];
    await handler((command) => {
      seen.push(command);
    }).handle(aWsContext({ frame: frame(valid) }));

    expect(seen).toEqual([valid]);
  });

  it('answers the generic ack, naming the command it accepted', async () => {
    const outcome = await handler().handle(aWsContext({ frame: frame(valid) }));

    expect(outcome.ack).toEqual({
      type: 'command.accepted',
      payload: { command: 'session.prompt' },
    });
    expect(outcome.then).toEqual([]);
  });

  it('publishes nothing when the action produced nothing', async () => {
    const published: EventDraft[] = [];

    const outcome = await handler().handle(
      aWsContext({ frame: frame(valid), publish: (_id, event) => published.push(event) }),
    );
    outcome.publish();

    expect(published).toEqual([]);
  });

  it('publishes what the action produced, but only after the ack has gone out', async () => {
    // A handler that published while it was still running would put its event ahead of the ack of
    // the very command that caused it, and a client would see a result before being told the
    // command was accepted.
    const published: { sessionId: string; event: EventDraft }[] = [];
    const outcome = await handler(() => ({
      sessionId: '01J0',
      type: 'session.started',
      payload: { a: 1 },
    })).handle(
      aWsContext({
        frame: frame(valid),
        publish: (sessionId, event) => published.push({ sessionId, event }),
      }),
    );

    expect(published).toEqual([]);

    outcome.publish();

    expect(published[0]?.sessionId).toBe('01J0');
    expect(published[0]?.event).toMatchObject({ type: 'session.started', payload: { a: 1 } });
  });

  it('correlates the event with the command that caused it', async () => {
    const published: EventDraft[] = [];
    const outcome = await handler(() => ({ sessionId: '01J0', type: 'e', payload: {} })).handle(
      aWsContext({
        frame: frame(valid, { traceId: 'trace-1' }),
        publish: (_id, event) => published.push(event),
      }),
    );
    outcome.publish();

    expect(published[0]).toMatchObject({ correlationId: 'cmd-1', traceId: 'trace-1' });
  });

  it('leaves the trace out rather than sending an empty one', async () => {
    const published: EventDraft[] = [];
    const outcome = await handler(() => ({ sessionId: '01J0', type: 'e', payload: {} })).handle(
      aWsContext({ frame: frame(valid), publish: (_id, event) => published.push(event) }),
    );
    outcome.publish();

    expect(published[0] && 'traceId' in published[0]).toBe(false);
  });

  it('awaits an action that is asynchronous', async () => {
    const outcome = await handler(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ sessionId: '01J0', type: 'late', payload: {} }), 1);
        }),
    ).handle(aWsContext({ frame: frame(valid) }));

    expect(outcome.ack.payload).toEqual({ command: 'session.prompt' });
  });

  it('lets the failure of an action through, and acks nothing', async () => {
    await expect(
      handler(() => {
        throw new Error('the use case refused');
      }).handle(aWsContext({ frame: frame(valid) })),
    ).rejects.toThrow('the use case refused');
  });
});
