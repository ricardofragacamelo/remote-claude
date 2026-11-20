import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient, anonymous } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';
import { logger } from '@/shared/logging/logger';

const BASE = 'http://backend.test';

/** A response whose body streams [chunks] of raw text — never buffered whole by the fake. */
function streamed(chunks: readonly string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, { status });
}

function ndjson(lines: readonly string[]): Response {
  return streamed(lines.map((line) => `${line}\n`));
}

async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) {
    out.push(item);
  }
  return out;
}

describe('ApiClient.ndjson', () => {
  let http: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    http = vi.fn();
  });

  it('yields every line, parsed, in order', async () => {
    http.mockResolvedValue(ndjson(['{"type":"file","path":"a.ts"}', '{"type":"end"}']));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    const lines = await drain(client.ndjson('/search/text', { pattern: 'x' }));

    expect(lines).toEqual([{ type: 'file', path: 'a.ts' }, { type: 'end' }]);
  });

  it('asks for application/x-ndjson, never the default JSON accept', async () => {
    http.mockResolvedValue(ndjson(['{"type":"end"}']));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    await drain(client.ndjson('/search/text', { pattern: 'x' }));

    const init = http.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['accept']).toBe('application/x-ndjson');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"pattern":"x"}');
  });

  it('reassembles a line split across two stream chunks', async () => {
    http.mockResolvedValue(streamed(['{"type":"fi', 'le","path":"a.ts"}\n']));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    const lines = await drain(client.ndjson('/search/text', {}));

    expect(lines).toEqual([{ type: 'file', path: 'a.ts' }]);
  });

  it('yields a final line with no trailing newline at all', async () => {
    http.mockResolvedValue(streamed(['{"type":"end"}']));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    const lines = await drain(client.ndjson('/search/text', {}));

    expect(lines).toEqual([{ type: 'end' }]);
  });

  it('skips a blank line between two real ones', async () => {
    http.mockResolvedValue(streamed(['{"type":"file"}\n\n{"type":"end"}\n']));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    const lines = await drain(client.ndjson('/search/text', {}));

    expect(lines).toEqual([{ type: 'file' }, { type: 'end' }]);
  });

  it('refuses before the first line, with the backend’s own envelope, when the status is not ok', async () => {
    http.mockResolvedValue(
      Response.json(
        { error: { code: 'INVALID_INPUT', messageKey: 'search.error.queryInvalid', traceId: 't' } },
        { status: 400 },
      ),
    );
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    await expect(drain(client.ndjson('/search/text', {}))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('throws NETWORK_UNREACHABLE for a line that is not JSON, keeping what already yielded', async () => {
    http.mockResolvedValue(ndjson(['{"type":"file"}', 'not json at all']));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    const seen: unknown[] = [];
    await expect(
      (async () => {
        for await (const line of client.ndjson('/search/text', {})) {
          seen.push(line);
        }
      })(),
    ).rejects.toMatchObject({ code: 'NETWORK_UNREACHABLE' });
    expect(seen).toEqual([{ type: 'file' }]);
  });

  it('wraps a mid-stream read failure as NETWORK_UNREACHABLE, never a raw exception', async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new TextEncoder().encode('{"type":"file"}\n'));
          return;
        }
        controller.error(new Error('connection reset'));
      },
    });
    http.mockResolvedValue(new Response(body, { status: 200 }));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    const seen: unknown[] = [];
    await expect(
      (async () => {
        for await (const line of client.ndjson('/search/text', {})) {
          seen.push(line);
        }
      })(),
    ).rejects.toBeInstanceOf(AppError);
    expect(seen).toEqual([{ type: 'file' }]);
  });

  it('never logs the request body — the request line carries no pattern or other payload (S-104)', async () => {
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    http.mockResolvedValue(ndjson(['{"type":"end"}']));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    await drain(client.ndjson('/search/text', { pattern: 'a secret pattern' }));

    for (const call of debug.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('secret pattern');
    }
  });

  it('yields nothing at all for a response with no body', async () => {
    http.mockResolvedValue(new Response(null, { status: 200 }));
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    await expect(drain(client.ndjson('/search/text', {}))).resolves.toEqual([]);
  });

  it('cancels the read through the given AbortSignal', async () => {
    const controller = new AbortController();
    http.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (init.signal?.aborted === true) {
            reject(new DOMException('aborted', 'AbortError'));
            return;
          }
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const client = new ApiClient(BASE, anonymous, http as unknown as typeof fetch);

    const pending = drain(client.ndjson('/search/text', {}, { signal: controller.signal }));
    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(AppError);
  });
});
