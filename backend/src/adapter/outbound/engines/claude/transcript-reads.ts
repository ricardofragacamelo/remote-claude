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
   * How many conversations keep their whole tool outputs and prompt images indexed, for the two routes
   * that serve them (plan 22, D-18). Fewer than {@link cachedSessions}: it is what weighs, and it is
   * asked of the conversation somebody is reading — the one just read.
   */
  readonly cachedContents: number;

  /**
   * How many reads of the store may run at the same time. The rest wait their turn.
   *
   * Each read of a large file holds tens of megabytes while it lasts; several phones opening
   * several long conversations at once is exactly when that multiplies.
   */
  readonly concurrentReads: number;

  /** How long a read may take before the caller stops waiting for it. */
  readonly timeoutMs: number;

  /**
   * How long a listing of the **whole** store is served again before it is read anew.
   *
   * Only the "include subfolders" filter reads the whole store (plan 08, D-05), at ~281 ms for 298
   * sessions measured, and the view that asks for it polls. Short, because a conversation written in
   * between shows up that much later — and nothing about a listing gets worse with time but that.
   */
  readonly wholeStoreTtlMs: number;
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
  cachedContents: 2,
  concurrentReads: 2,
  timeoutMs: 10_000,
  wholeStoreTtlMs: 2_000,
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

/**
 * One read of a listing at a time, per key — and, for a while after it, the same answer.
 *
 * Two callers asking for the same listing together share one read of the store (plan 08, S-31): a
 * folder open in two tabs polls it twice, and the second poll would otherwise pay for the first. A
 * `ttlMs` of zero shares only what is in flight; above zero, the answer is also served again until
 * it is that old. A read that fails is never kept.
 */
export class SharedListing<T> {
  private readonly flights = new Map<string, Promise<T>>();
  private readonly answers = new Map<string, { readonly at: number; readonly value: T }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** The answer for `key`: kept, in flight, or what `read` produces. */
  async read(
    key: string,
    read: () => Promise<T>,
  ): Promise<{ readonly value: T; readonly hit: boolean }> {
    const kept = this.answers.get(key);

    if (kept !== undefined && this.now() - kept.at < this.ttlMs) {
      return { value: kept.value, hit: true };
    }

    const flying = this.flights.get(key);
    if (flying !== undefined) {
      return { value: await flying, hit: true };
    }

    const started = read();
    this.flights.set(key, started);

    try {
      const value = await started;
      if (this.ttlMs > 0) {
        this.answers.set(key, { at: this.now(), value });
      }
      return { value, hit: false };
    } finally {
      this.flights.delete(key);
    }
  }
}
