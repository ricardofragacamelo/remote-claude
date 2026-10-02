import { QueuedPromptNotFoundError } from '../errors/queued-prompt-not-found.error';
import { QueuedPromptStartedError } from '../errors/queued-prompt-started.error';
import type { PromptExtras } from '../services/prompt-context';

/** How much of a queued prompt its row shows — the start of what was typed, never the whole. */
export const QUEUE_PREVIEW_LENGTH = 120;

/** How many prompts that left the queue are remembered, to answer a late cancel truthfully. */
export const REMEMBERED_DEPARTURES = 200;

/** A prompt waiting for the running turn to end. */
export interface QueuedPrompt {
  readonly queueId: string;

  /** What Claude receives: the text typed, its mentions guarded, the context composed after it. */
  readonly text: string;

  /** The images and what the log may say of the context — absent for a prompt without any. */
  readonly extras?: PromptExtras;

  /** Who sent it: the kind of client — `web` or `mobile` — since the session is one person's. */
  readonly promptedBy: string;
  readonly preview: string;
}

/** What became of a prompt handed to the queue. */
export type Submission =
  { readonly kind: 'now' } | { readonly kind: 'queued'; readonly position: number };

/** What a cancel did. A second cancel of the same prompt did nothing, and says so. */
export type Cancellation = 'cancelled' | 'alreadyCancelled';

/** The start of a prompt, on one line, cut — what the row of the queue shows. */
export function previewOf(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > QUEUE_PREVIEW_LENGTH ? `${line.slice(0, QUEUE_PREVIEW_LENGTH - 1)}…` : line;
}

/**
 * The prompts of one session that wait for its turn to end — plan 08, D-14.
 *
 * The queue is **ours** and not the SDK's: a prompt handed to the SDK mid-turn is folded into the
 * turn running (measured, discovery §10.4), and cannot be taken back. Held here, it runs as a turn of
 * its own, in the order it arrived from whichever client, and any of them can take it out first.
 *
 * A turn is open from the moment a prompt goes to the SDK until its `turn.completed`; a prompt that
 * arrives while one is open waits.
 */
export class PromptQueue {
  private open = false;
  private readonly waiting: QueuedPrompt[] = [];
  private readonly departed = new Map<string, 'started' | 'cancelled'>();

  /** How many prompts wait. */
  get size(): number {
    return this.waiting.length;
  }

  /** Whether a turn the queue sent is running. */
  get turnOpen(): boolean {
    return this.open;
  }

  /** Takes a prompt: it goes now when no turn runs and nobody waits, and waits otherwise. */
  submit(prompt: QueuedPrompt): Submission {
    if (!this.open && this.waiting.length === 0) {
      this.open = true;
      return { kind: 'now' };
    }

    this.waiting.push(prompt);
    return { kind: 'queued', position: this.waiting.length };
  }

  /**
   * The turn ended: the next prompt, which goes now — or `null`, and the session is free.
   */
  turnEnded(): QueuedPrompt | null {
    const next = this.waiting.shift() ?? null;

    this.open = next !== null;
    if (next !== null) {
      this.remember(next.queueId, 'started');
    }

    return next;
  }

  /**
   * Takes a waiting prompt out, before it reaches Claude. The ones behind it move up by one.
   *
   * @throws {QueuedPromptStartedError} it already became a turn — stopping it now is interrupting
   * @throws {QueuedPromptNotFoundError} the queue never had it
   */
  cancel(queueId: string): Cancellation {
    const at = this.waiting.findIndex((prompt) => prompt.queueId === queueId);

    if (at !== -1) {
      this.waiting.splice(at, 1);
      this.remember(queueId, 'cancelled');
      return 'cancelled';
    }

    switch (this.departed.get(queueId)) {
      case 'cancelled':
        return 'alreadyCancelled';
      case 'started':
        throw new QueuedPromptStartedError(queueId);
      default:
        throw new QueuedPromptNotFoundError(queueId);
    }
  }

  /** The prompts waiting, in order — what a session that ends drops. */
  drain(): readonly QueuedPrompt[] {
    return this.waiting.splice(0, this.waiting.length);
  }

  private remember(queueId: string, how: 'started' | 'cancelled'): void {
    this.departed.set(queueId, how);

    if (this.departed.size > REMEMBERED_DEPARTURES) {
      const [oldest] = this.departed.keys();
      if (oldest !== undefined) {
        this.departed.delete(oldest);
      }
    }
  }
}
