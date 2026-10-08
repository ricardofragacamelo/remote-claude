import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPromptImage,
  fetchToolResult,
} from '@/features/session/services/transcript-content.service';
import { anonymous, api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  api.useCredentials(anonymous);
});

/** The whole output of a tool, read on demand — plan 22, B-29. */
describe('fetchToolResult', () => {
  it('asks for the result of a tool of a conversation, by ids it escapes — S-22', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ text: 'all of it', truncated: false, bytes: 9 });
    const signal = new AbortController().signal;

    await expect(fetchToolResult('conv/1', 'tool 1', signal)).resolves.toEqual({
      text: 'all of it',
      truncated: false,
      bytes: 9,
      cutAt: null,
    });
    expect(get).toHaveBeenCalledWith('/transcripts/conv%2F1/tools/tool%201/result', { signal });
  });

  it('reads a cut output, and where it was cut — S-114', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      text: 'headtail',
      truncated: true,
      bytes: 300_000,
      cutAt: 4,
    });

    await expect(fetchToolResult('c', 't')).resolves.toEqual({
      text: 'headtail',
      truncated: true,
      bytes: 300_000,
      cutAt: 4,
    });
  });

  it.each([
    ['no body', undefined, { text: '', truncated: false, bytes: 0, cutAt: null }],
    [
      'fields of other types',
      { text: 3, truncated: 'yes', bytes: '9', cutAt: '1' },
      { text: '', truncated: false, bytes: 0, cutAt: null },
    ],
    [
      'a cut beyond the text, and a negative size',
      { text: 'ab', truncated: true, bytes: -1, cutAt: 9 },
      { text: 'ab', truncated: true, bytes: 2, cutAt: null },
    ],
    [
      'a cut that is not whole',
      { text: 'ab', truncated: true, bytes: 5, cutAt: 1.5 },
      { text: 'ab', truncated: true, bytes: 5, cutAt: null },
    ],
  ])('reads %s defensively', async (_case, body, read) => {
    vi.spyOn(api, 'get').mockResolvedValue(body);

    await expect(fetchToolResult('c', 't')).resolves.toEqual(read);
  });

  it('lets the refusal of the route through — S-115', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(
      new AppError('NOT_FOUND', 'transcript.error.notFound', 'trace-1'),
    );

    await expect(fetchToolResult('c', 't')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/** The image of a prompt, opened on demand — plan 22, B-30. */
describe('fetchPromptImage', () => {
  it('reads the bytes of an image of a conversation, by ids it escapes — S-119', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const bytes = vi
      .spyOn(api, 'bytes')
      .mockResolvedValue({ status: 200, blob, header: () => null });

    await expect(fetchPromptImage('conv 1', 'u1:1')).resolves.toBe(blob);
    expect(bytes).toHaveBeenCalledWith('/transcripts/conv%201/images/u1%3A1', {});
  });

  it('sends the credential in the header, and never in the URL — S-122', async () => {
    api.useCredentials({ accessToken: () => 'secret-token', renew: () => Promise.resolve(null) });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response('png', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const blob = await fetchPromptImage('c1', 'u1:1', new AbortController().signal);

    expect(await blob.text()).toBe('png');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/transcripts\/c1\/images\/u1%3A1$/);
    expect(String(url)).not.toContain('secret-token');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-token');
  });

  it.each([
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'transcript.error.imageTypeUnsupported'],
    [413, 'PAYLOAD_TOO_LARGE', 'transcript.error.imageTooLarge'],
    [404, 'NOT_FOUND', 'transcript.error.notFound'],
  ])('turns a %i into the refusal it is — S-120', async (status, code, messageKey) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: { code, messageKey, traceId: 'tr-1' } }), {
          status,
        }),
      ),
    );

    await expect(fetchPromptImage('c1', 'u1:1')).rejects.toMatchObject({ code, messageKey });
  });
});
