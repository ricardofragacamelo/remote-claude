/** One canned HTTP answer. */
export interface StubResponse {
  readonly status?: number;
  readonly body?: unknown;
}

/** A `fetch` that answers from a table, and remembers what it was asked. */
export class StubFetch {
  readonly calls: string[] = [];
  private readonly routes = new Map<string, StubResponse[]>();

  /** Queues an answer for a URL. Queued answers are consumed in order; the last one repeats. */
  on(url: string, response: StubResponse): this {
    this.routes.set(url, [...(this.routes.get(url) ?? []), response]);
    return this;
  }

  /** The `fetch` implementation to hand to an adapter. */
  get fetch(): typeof fetch {
    return ((input: Parameters<typeof fetch>[0]) => {
      const url = typeof input === 'string' ? input : input.toString();
      this.calls.push(url);

      const queued = this.routes.get(url);
      if (queued === undefined || queued.length === 0) {
        return Promise.resolve(new Response('not stubbed', { status: 404 }));
      }

      const next = queued.length === 1 ? queued[0] : queued.shift();
      const { status = 200, body = {} } = next ?? {};

      return Promise.resolve(
        new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }) as typeof fetch;
  }

  /** How many times a URL was requested. */
  countOf(url: string): number {
    return this.calls.filter((call) => call === url).length;
  }
}
