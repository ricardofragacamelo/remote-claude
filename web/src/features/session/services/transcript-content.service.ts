import { api } from '@/shared/api/api';
import { isRecord } from '@/shared/lib/json';

/**
 * The whole output of a tool, as the transcript keeps it (plan 22, B-11) — or, above the server's
 * ceiling, its start and its end, said to be cut.
 */
export interface ToolOutput {
  readonly text: string;

  /** The output was larger than what came: `text` is its start and its end (D-08). */
  readonly truncated: boolean;

  /** How large the whole output is, in bytes of UTF-8 — what "it had" says. */
  readonly bytes: number;

  /** Where, in `text`, the start ends and the end begins — `null` when nothing was cut. */
  readonly cutAt: number | null;
}

/** A whole, non-negative number, or `null`. */
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** The answer of the route, read defensively: a field that is not what it says is not there. */
function toToolOutput(body: unknown): ToolOutput {
  const record = isRecord(body) ? body : {};
  const text = typeof record['text'] === 'string' ? record['text'] : '';
  const cutAt = count(record['cutAt']);

  return {
    text,
    truncated: record['truncated'] === true,
    bytes: count(record['bytes']) ?? text.length,
    cutAt: cutAt !== null && cutAt <= text.length ? cutAt : null,
  };
}

/** The path of a conversation's content on the server — every id escaped. */
function transcriptPath(conversationId: string, ...rest: readonly string[]): string {
  return ['/transcripts', conversationId, ...rest]
    .map((part, index) => (index === 0 ? part : encodeURIComponent(part)))
    .join('/');
}

/**
 * The whole output of one tool of the main conversation, asked for when its row is unfolded (plan 22,
 * B-29): the timeline keeps only its end (`summary`, D-07). The content never reaches a log — the
 * client logs the request and its status, never a body.
 *
 * @throws {import('@/shared/api/errors').AppError} `NOT_FOUND` for a tool the main chain has no result
 *   of, or a conversation the caller does not read; `NETWORK_UNREACHABLE` when it did not arrive
 */
export async function fetchToolResult(
  conversationId: string,
  toolUseId: string,
  signal?: AbortSignal,
): Promise<ToolOutput> {
  const body = await api.get<unknown>(
    transcriptPath(conversationId, 'tools', toolUseId, 'result'),
    signal === undefined ? {} : { signal },
  );

  return toToolOutput(body);
}

/**
 * The bytes of an image a prompt carried, asked for when the person opens it (plan 22, B-30, D-09).
 * The credential goes in the `Authorization` header, like every request — never in the URL, which is
 * why the image is fetched here and shown by a `blob:` the page makes, not by an `<img src>` of the
 * route (D-10, S-122).
 *
 * @throws {import('@/shared/api/errors').AppError} `UNSUPPORTED_MEDIA_TYPE` (415) for a type the
 *   server never serves, `PAYLOAD_TOO_LARGE` (413) above its ceiling, `NOT_FOUND` for a block that is
 *   no image of the conversation, or of one the caller does not read
 */
export async function fetchPromptImage(
  conversationId: string,
  blockId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await api.bytes(
    transcriptPath(conversationId, 'images', blockId),
    signal === undefined ? {} : { signal },
  );

  return response.blob;
}
