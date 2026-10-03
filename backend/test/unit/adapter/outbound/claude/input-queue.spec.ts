import { describe, expect, it } from 'vitest';

import { SessionInputQueue } from '@adapter/outbound/claude/input-queue';

/** The text of the next message, or `null` when the stream ended. */
async function take(iterator: AsyncIterator<{ message: { content: unknown } }>): Promise<unknown> {
  const next = await iterator.next();
  return next.done === true ? null : next.value.message.content;
}

describe('SessionInputQueue', () => {
  it('hands over a prompt that was pushed before anybody asked', async () => {
    const queue = new SessionInputQueue();
    queue.push('hello');

    expect(await take(queue[Symbol.asyncIterator]())).toBe('hello');
  });

  it('hands over a prompt that arrives while the consumer is waiting', async () => {
    const queue = new SessionInputQueue();
    const pending = take(queue[Symbol.asyncIterator]());

    queue.push('hello');

    expect(await pending).toBe('hello');
  });

  it('preserves the order prompts arrived in — S-23', () => {
    const queue = new SessionInputQueue();
    queue.push('a');
    queue.push('b');

    const iterator = queue[Symbol.asyncIterator]();

    return Promise.all([take(iterator), take(iterator)]).then((taken) => {
      expect(taken).toEqual(['a', 'b']);
    });
  });

  it('never blocks the pusher — S-22', () => {
    // A prompt that arrives mid-turn lands in the queue and runs next. Nothing here waits for a
    // turn to end, which is what makes "queued, not refused" true rather than aspirational.
    const queue = new SessionInputQueue();

    for (let index = 0; index < 100; index += 1) {
      queue.push(String(index));
    }

    expect(queue.depth).toBe(100);
  });

  it('shapes a prompt the way the SDK expects a user message, under the uuid it answers — S-273', async () => {
    const queue = new SessionInputQueue();
    const uuid = queue.push('hello');

    const next = await queue[Symbol.asyncIterator]().next();

    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(next.value).toEqual({
      type: 'user',
      message: { role: 'user', content: 'hello' },
      parent_tool_use_id: null,
      uuid,
    });
  });

  it('gives every prompt a uuid of its own, the one handed to a waiting consumer too', async () => {
    const queue = new SessionInputQueue();
    const iterator = queue[Symbol.asyncIterator]();
    const waiting = iterator.next();

    const first = queue.push('one');
    const second = queue.push('two');

    expect((await waiting).value).toMatchObject({ uuid: first });
    expect((await iterator.next()).value).toMatchObject({ uuid: second });
    expect(first).not.toBe(second);
  });

  it('still answers a uuid for a prompt pushed after closing, and queues nothing', () => {
    const queue = new SessionInputQueue();
    queue.close();

    expect(typeof queue.push('late')).toBe('string');
    expect(queue.depth).toBe(0);
  });

  describe('closing', () => {
    it('ends the stream', async () => {
      const queue = new SessionInputQueue();
      queue.close();

      expect(await take(queue[Symbol.asyncIterator]())).toBeNull();
    });

    it('releases a consumer that was already waiting', async () => {
      // An iterator that never resolves keeps the `for await` alive, and with it the subprocess.
      const queue = new SessionInputQueue();
      const pending = take(queue[Symbol.asyncIterator]());

      queue.close();

      expect(await pending).toBeNull();
    });

    it('still hands over what was queued before it closed', async () => {
      const queue = new SessionInputQueue();
      queue.push('hello');
      queue.close();

      expect(await take(queue[Symbol.asyncIterator]())).toBe('hello');
    });

    it('ignores a prompt pushed afterwards rather than throwing', () => {
      // Closing races with a prompt that was already in flight, and turning that into an error
      // would surface a failure for something the user cannot avoid doing.
      const queue = new SessionInputQueue();
      queue.close();

      expect(() => queue.push('late')).not.toThrow();
      expect(queue.depth).toBe(0);
    });

    it('can be closed twice', () => {
      const queue = new SessionInputQueue();
      queue.close();

      expect(() => queue.close()).not.toThrow();
      expect(queue.isClosed).toBe(true);
    });

    it('closes itself when the consumer leaves the loop early', async () => {
      const queue = new SessionInputQueue();
      const iterator = queue[Symbol.asyncIterator]();

      await iterator.return?.();

      expect(queue.isClosed).toBe(true);
    });
  });

  describe('images beside the text — plan 08, B-45, D-02', () => {
    it('sends the text first, then each image as a block of the Messages API — S-206', async () => {
      const queue = new SessionInputQueue();
      queue.push('what is this?', [{ mediaType: 'image/png', data: 'iVBORw0K' }]);

      const next = await queue[Symbol.asyncIterator]().next();

      expect(next.value?.message.content).toEqual([
        { type: 'text', text: 'what is this?' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0K' } },
      ]);
    });

    it('keeps a text without images a plain string, as before', async () => {
      const queue = new SessionInputQueue();
      queue.push('hello', []);

      const next = await queue[Symbol.asyncIterator]().next();

      expect(next.value?.message.content).toBe('hello');
    });
  });
});
