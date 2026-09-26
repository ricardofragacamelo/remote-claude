/**
 * What protects the **server** from reading history — which pagination does not.
 *
 * Measured: the SDK re-parses the whole JSONL on every `getSessionMessages`, whatever `limit` and
 * `offset` say — ~30 MB of heap and 44–66 ms for the largest file of the store, with a limit of
 * one message or with none. A page protects the phone; these three numbers protect the machine
 * ([D-02](../../../../../docs/plans/04-transcript-and-resume/decisions.md)).
 */
export interface TranscriptReadLimits {
  /**
   * How many conversations are kept parsed at once. Past it, the one read longest ago goes.
   *
   * A ceiling, because "cache what was read" without one is the leak the cache exists to avoid.
   */
  readonly cachedSessions: number;

  /**
   * How many reads of the store may run at the same time. The rest wait their turn.
   *
   * Each read of a large file holds tens of megabytes while it lasts; several phones opening
   * several long conversations at once is exactly when that multiplies.
   */
  readonly concurrentReads: number;

  /** How long a read may take before the caller stops waiting for it. */
  readonly timeoutMs: number;
}

/**
 * The limits this installation reads history under.
 *
 * Fixed numbers, stated here, rather than configuration: nothing about them depends on the
 * machine yet, and a knob nobody has a reason to turn is a knob somebody turns wrong. Sixteen
 * conversations of the size measured (~800 messages, the largest) fit comfortably in memory; two
 * concurrent reads keep the worst case near 60 MB; and ten seconds is two orders of magnitude
 * above the slowest read measured.
 */
export const TRANSCRIPT_READ_LIMITS: TranscriptReadLimits = {
  cachedSessions: 16,
  concurrentReads: 2,
  timeoutMs: 10_000,
};

export const TRANSCRIPT_LIMITS = Symbol('TranscriptReadLimits');

/**
 * At most `capacity` tasks at once; the others queue, in order.
 *
 * A slot is held until the task itself settles — not until its caller stops waiting. A read that
 * outlived its deadline is still parsing inside the SDK, and releasing its slot early would let
 * the limit be exceeded exactly when the store is slowest.
 */
export class ReadLimiter {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly capacity: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running < this.capacity) {
      this.running += 1;
    } else {
      // The slot is handed over by whoever finishes, never given back and re-taken: between the
      // two, a new caller would see room and take it, and the limit would be one over.
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    }

    try {
      return await task();
    } finally {
      const next = this.waiting.shift();

      if (next === undefined) {
        this.running -= 1;
      } else {
        next();
      }
    }
  }

  /** How many tasks are running now. */
  get active(): number {
    return this.running;
  }

  /** How many are waiting for a slot. */
  get queued(): number {
    return this.waiting.length;
  }
}

/**
 * Parsed conversations, keyed by id **and** version — the `lastModified` the SDK reports.
 *
 * The version is the invalidation, and there is no other: a conversation that was written to has
 * a new `lastModified`, its old entry is simply never asked for again, and the next read replaces
 * it (S-64). Nothing expires on a timer, because nothing could make a stale entry right.
 *
 * Two readers of the same version share **one** load (S-70): the second joins the first instead
 * of paying for a second parse. A load that fails is forgotten, so the next reader tries again
 * rather than inheriting a failure.
 */
export class TranscriptCache<T> {
  private readonly entries = new Map<string, { readonly version: number; readonly value: T }>();
  private readonly loading = new Map<string, Promise<T>>();

  constructor(private readonly capacity: number) {}

  /**
   * The cached value for `key` at `version`, or what `load` produces — once.
   *
   * @returns whether it was a hit, beside the value, so the edge can log which it was
   */
  async read(
    key: string,
    version: number,
    load: () => Promise<T>,
  ): Promise<{ readonly value: T; readonly hit: boolean }> {
    const cached = this.entries.get(key);

    if (cached?.version === version) {
      // Touched, so it is the last to be evicted: least recently **read**, not least recently loaded.
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { value: cached.value, hit: true };
    }

    const flight = `${key}@${String(version)}`;
    const pending = this.loading.get(flight);

    if (pending !== undefined) {
      return { value: await pending, hit: true };
    }

    const started = load();
    this.loading.set(flight, started);

    try {
      const value = await started;
      this.store(key, version, value);
      return { value, hit: false };
    } finally {
      this.loading.delete(flight);
    }
  }

  /** How many conversations are held now. */
  get size(): number {
    return this.entries.size;
  }

  private store(key: string, version: number, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { version, value });

    // A `Map` iterates in insertion order, and every read re-inserts: the first key is the one
    // read longest ago (S-74).
    for (const oldest of this.entries.keys()) {
      if (this.entries.size <= this.capacity) {
        break;
      }

      this.entries.delete(oldest);
    }
  }
}
