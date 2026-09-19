import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * The prompts of a session, as an `AsyncIterable` the SDK pulls from.
 *
 * `query()` takes a prompt as a string **or** as an async iterable, and only the second enables the
 * control requests — `interrupt`, `setModel`, `setPermissionMode`. There is no third option and no
 * way to add them later, so the iterable is not a refinement: it is the mode this product runs in.
 * See docs/architecture/backend/04-claude-integration.md#streaming-input-mode--obrigatório.
 *
 * Pushing never blocks. A prompt that arrives while a turn is running lands in the queue and the
 * SDK takes it when the turn ends — which is what the Claude Code UI does, and what makes
 * "queued, not refused" true rather than aspirational.
 */
export class SessionInputQueue implements AsyncIterable<SDKUserMessage> {
  /** Prompts pushed while nobody was waiting. */
  private readonly pending: SDKUserMessage[] = [];

  /** The consumer's `next()`, when it is waiting on an empty queue. */
  private waiting: ((message: IteratorResult<SDKUserMessage>) => void) | null = null;

  private closed = false;

  /** How many prompts are waiting to be taken. */
  get depth(): number {
    return this.pending.length;
  }

  /** Whether the queue has been closed. A closed queue accepts nothing more. */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Queues one turn.
   *
   * Pushing to a closed queue is ignored rather than thrown: closing races with a prompt that was
   * already in flight, and turning that race into an error would surface a failure for something
   * the user cannot avoid doing.
   */
  push(text: string): void {
    if (this.closed) {
      return;
    }

    const message: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
    };

    const waiting = this.waiting;

    if (waiting === null) {
      this.pending.push(message);
      return;
    }

    this.waiting = null;
    waiting({ value: message, done: false });
  }

  /**
   * Ends the stream of prompts.
   *
   * A consumer parked on `next()` is released, because an iterator that never resolves keeps the
   * `for await` — and therefore the subprocess — alive for ever.
   */
  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;

    const waiting = this.waiting;
    if (waiting !== null) {
      this.waiting = null;
      waiting({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        const queued = this.pending.shift();

        if (queued !== undefined) {
          return Promise.resolve({ value: queued, done: false });
        }

        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise((resolve) => {
          this.waiting = resolve;
        });
      },

      // Called when the `for await` is left early — which aborts the query. Closing here keeps the
      // queue from holding a resolver nobody will ever call.
      return: (): Promise<IteratorResult<SDKUserMessage>> => {
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}
